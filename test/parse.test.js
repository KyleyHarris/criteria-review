import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, parseTags, isUntracked, needsReview } from '../src/parse.js';

// What these guard: the tag line is the machine-readable half of the format, and
// every one of these cases is a shape real documents take. A parser that quietly
// mis-reads a tag produces a review queue that is wrong rather than empty, which
// is the worse failure - an empty queue is noticed, a wrong one is trusted.

test('parseTags keeps values that contain spaces', () => {
  const { tags, ids } = parseTags('@ONB-ADMIN-001 @status:verified @persona:Support staff');
  assert.equal(ids[0], 'ONB-ADMIN-001');
  assert.equal(tags.status, 'verified');
  // Splitting naively on whitespace would truncate this to "Support".
  assert.equal(tags.persona, 'Support staff');
});

test('parseTags treats the bare tag as the ID', () => {
  const { ids, tags } = parseTags('@LOCK-UNLOCK-001 @status:derived');
  assert.deepEqual(ids, ['LOCK-UNLOCK-001']);
  assert.equal(tags.status, 'derived');
});

const DOC = `
# Some acceptance doc

### Feature: Locking

<!-- intent: docs/phase-n7.md:120 -->

\`\`\`gherkin
@LOCK-UNLOCK-001 @status:derived @persona:Cashier
Scenario: The cashier reopens their own locked register
  Given a cashier has locked the register
  When they enter their own staff PIN
  Then they are returned to the till
\`\`\`

### Feature: Handover

\`\`\`gherkin
@LOCK-TAKEOVER-001 @status:accepted @verified:2026-08-01 @commit:abc1234
Scenario: A different cashier takes the till over
  Given a shift is open for another cashier
  Then the shift is handed over
\`\`\`

\`\`\`gherkin
Scenario: An old scenario with no tags at all
  Given something
  Then something else
\`\`\`
`;

test('parseDocument reads ids, statuses, steps and feature grouping', () => {
  const s = parseDocument(DOC, 'doc.md');
  assert.equal(s.length, 3);

  assert.equal(s[0].id, 'LOCK-UNLOCK-001');
  assert.equal(s[0].status, 'derived');
  assert.equal(s[0].persona, 'Cashier');
  assert.equal(s[0].feature, 'Locking');
  assert.equal(s[0].steps.length, 3);
  assert.equal(s[0].intent, 'docs/phase-n7.md:120');

  assert.equal(s[1].id, 'LOCK-TAKEOVER-001');
  assert.equal(s[1].status, 'accepted');
  assert.equal(s[1].verifiedOn, '2026-08-01');
  assert.equal(s[1].commit, 'abc1234');
  assert.equal(s[1].feature, 'Handover');
  // The intent comment belongs to the FIRST scenario only; it must not leak down.
  assert.equal(s[1].intent, null);
});

test('untagged scenarios still parse, and are reported as untracked', () => {
  const s = parseDocument(DOC, 'doc.md');
  const old = s[2];
  assert.equal(old.id, null);
  assert.equal(old.status, null);
  assert.equal(old.title, 'An old scenario with no tags at all');
  // Older documents often hold many of these. Dropping them would hide the backlog.
  assert.equal(isUntracked(old), true);
  assert.equal(needsReview(old), true);
});

test('accepted scenarios drop out of the review queue, others do not', () => {
  const s = parseDocument(DOC, 'doc.md');
  assert.equal(needsReview(s[0]), true); // derived
  assert.equal(needsReview(s[1]), false); // accepted
});

test('a block with no Scenario line is ignored rather than crashing', () => {
  const s = parseDocument('```gherkin\nFeature: just a feature\n```', 'doc.md');
  assert.deepEqual(s, []);
});

// Regression: the first parser treated a ```gherkin fence as ONE scenario and
// ignored scenarios that were not fenced at all, so it could return well under half of
// a project's scenarios - it reported a small tidy queue and hid the real one,
// which is the worst failure available to a tool whose whole job is surfacing a
// backlog.

test('a single fence holding several scenarios yields all of them', () => {
  const doc = [
    '### Feature: Many',
    '',
    '```gherkin',
    '@A-001 @status:derived',
    'Scenario: First',
    '  Given a',
    '  Then b',
    '',
    '@A-002 @status:proposed',
    'Scenario: Second',
    '  Given c',
    '  Then d',
    '',
    '@A-003 @status:accepted',
    'Scenario: Third',
    '  Given e',
    '  Then f',
    '```',
  ].join('\n');

  const s = parseDocument(doc, 'doc.md');
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.id), ['A-001', 'A-002', 'A-003']);
  assert.deepEqual(s.map((x) => x.status), ['derived', 'proposed', 'accepted']);
  assert.equal(s[1].feature, 'Many');
  assert.deepEqual(s[2].steps, ['Given e', 'Then f']);
});

test('scenarios with no fence at all are parsed', () => {
  // A document written before fences were the rule is exactly this shape: no fences at all.
  const doc = [
    '## Feature: Unfenced',
    '',
    'Scenario: A new order is pinned to one till',
    '  Given a signed-in cashier opens a new order',
    '  Then the till field is fixed',
    '',
    'Scenario: Cashier rings up an item',
    '  Given a cashier scans a barcode',
    '  Then the item is added to the order',
  ].join('\n');

  const s = parseDocument(doc, 'doc.md');
  assert.equal(s.length, 2);
  assert.equal(s[0].feature, 'Unfenced');
  assert.equal(s[0].id, null); // untracked, and that is the point
  assert.equal(s[1].title, 'Cashier rings up an item');
  assert.equal(s[1].steps.length, 2);
});

test('prose between scenarios does not become steps', () => {
  const doc = [
    '```gherkin',
    '@B-001 @status:derived',
    'Scenario: One',
    '  Given a',
    '  Then b',
    '```',
    '',
    'Some explanatory prose that mentions Given and Then in passing.',
    '',
    '```gherkin',
    '@B-002 @status:derived',
    'Scenario: Two',
    '  Given c',
    '```',
  ].join('\n');

  const s = parseDocument(doc, 'doc.md');
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].steps, ['Given a', 'Then b']);
  assert.deepEqual(s[1].steps, ['Given c']);
});

test('a note records the byte span of its own comment', () => {
  // The span is what lets a note be deleted exactly. The defect it guards is an
  // off-by-one: a span that starts or ends one byte out takes a neighbouring
  // character with it, or leaves a stray `-->` behind that swallows the scenario
  // into a comment. Asserting the slice equals the comment proves the arithmetic
  // rather than assuming it.
  const doc = [
    '# Doc',
    '',
    '<!-- review sam 2026-08-09: needs a second look -->',
    '```gherkin',
    '@N-001 @status:derived',
    'Scenario: One',
    '  Given a',
    '```',
  ].join('\n');

  const [s] = parseDocument(doc, 'doc.md');
  const note = s.notes[0];
  // `who` is everything before the colon, so it carries the date as well as the
  // author. That is what the detail pane and `criteria-review notes` both render.
  assert.equal(note.who, 'sam 2026-08-09');
  assert.equal(note.text, 'needs a second look');
  assert.equal(
    doc.slice(note.at, note.end),
    '<!-- review sam 2026-08-09: needs a second look -->\n'
  );
  // Removing the span leaves a document that still parses and has lost nothing else.
  const without = doc.slice(0, note.at) + doc.slice(note.end);
  const [after] = parseDocument(without, 'doc.md');
  assert.equal(after.id, 'N-001');
  assert.equal(after.notes.length, 0);
  assert.deepEqual(after.steps, ['Given a']);
});
