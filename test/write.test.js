import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setStatus, addNote, clearNotes, rebuildTagLine, ACTOR_ARCHITECT } from '../src/write.js';
import { parseDocument } from '../src/parse.js';

// What these guard: this module edits documents the architect wrote by hand. The
// specific defect being defended against is a write that changes something other
// than the one tag it claimed to, or that silently succeeds while corrupting the
// file. Every test below asserts the surrounding content is byte-identical.

const DOC = `# Doc

### Feature: Locking

\`\`\`gherkin
@LOCK-001 @status:derived @persona:Cashier
Scenario: First
  Given a
  Then b
\`\`\`

Prose between the blocks that must survive untouched.

\`\`\`gherkin
@LOCK-002 @status:derived @persona:Cashier
Scenario: Second
  Given c
  Then d
\`\`\`
`;

// A scenario an agent has flagged, carrying a note, so the two directions of the
// attention protocol can be asserted against each other.
const FLAGGED_DOC = `# Doc

<!-- review sam 2026-08-09: is this even reachable? -->
\`\`\`gherkin
@LOCK-001 @status:derived @persona:Cashier @looknow
Scenario: First
  Given a
  Then b
\`\`\`

\`\`\`gherkin
@LOCK-002 @status:derived @looknow
Scenario: Second
  Given c
  Then d
\`\`\`
`;

// Four scenarios carrying notes in the two places notes actually appear: above the
// fence, where addNote writes them, and inside it above the tag line, where a hand
// written one ends up. LOCK-004 has none, and an intent comment sits alongside so a
// note clear can be shown not to eat it.
const NOTES_DOC = `# Doc

<!-- review sam 2026-08-09: first note, must survive -->
\`\`\`gherkin
@LOCK-001 @status:derived
Scenario: First
  Given a
  Then b
\`\`\`

\`\`\`gherkin
<!-- review sam 2026-08-09: second note, must survive -->
@LOCK-002 @status:derived
Scenario: Second
  Given c
  Then d
\`\`\`

<!-- intent: docs/spec.md:12 -->
<!-- review sam 2026-08-10: the one being cleared -->
\`\`\`gherkin
@LOCK-003 @status:derived @looknow
Scenario: Third
  Given e
  Then f
\`\`\`

\`\`\`gherkin
@LOCK-004 @status:derived
Scenario: Fourth
  Given g
  Then h
\`\`\`
`;

async function fixture(doc = DOC) {
  const dir = await mkdtemp(join(tmpdir(), 'criteria-'));
  const file = join(dir, 'acceptance.md');
  await writeFile(file, doc, 'utf8');
  return file;
}

const flagsOf = (scenarios, id) => scenarios.find((s) => s.id === id)?.flags ?? [];
const notesOf = (scenarios, id) => scenarios.find((s) => s.id === id)?.notes ?? [];

async function reread(file) {
  return parseDocument(await readFile(file, 'utf8'), file);
}

test('rebuildTagLine replaces a tag in place and preserves the rest', () => {
  const out = rebuildTagLine(
    '@LOCK-001 @status:derived @persona:Cashier',
    'LOCK-001',
    { status: 'accepted' }
  );
  assert.equal(out, '@LOCK-001 @status:accepted @persona:Cashier');
});

test('rebuildTagLine appends tags that were not present', () => {
  const out = rebuildTagLine('@LOCK-001 @status:derived', 'LOCK-001', {
    status: 'verified',
    verified: '2026-08-09',
    commit: 'deadbee',
  });
  assert.equal(out, '@LOCK-001 @status:verified @verified:2026-08-09 @commit:deadbee');
});

test('setStatus changes only the targeted scenario', async () => {
  const file = await fixture();
  await setStatus(file, 'LOCK-001', 'accepted', { date: '2026-08-09' });
  const after = await readFile(file, 'utf8');
  const s = parseDocument(after, file);

  assert.equal(s[0].status, 'accepted');
  assert.equal(s[0].verifiedOn, '2026-08-09');
  // The sibling scenario must be untouched: an edit that widened to both would
  // silently mark unreviewed work as approved.
  assert.equal(s[1].status, 'derived');
  assert.equal(s[1].verifiedOn, null);
  assert.match(after, /Prose between the blocks that must survive untouched\./);
  assert.equal(s[0].persona, 'Cashier');
});

test('setStatus accepts a status this tool does not know about', async () => {
  // A consumer document carried `proposed` before the standard moved here; generation is where the vocabulary is enforced.
  // Rejecting a status the documents already use would make the tool wrong about
  // its own source of truth, so the value is permissive.
  const file = await fixture();
  await setStatus(file, 'LOCK-001', 'proposed');
  const s = parseDocument(await readFile(file, 'utf8'), file);
  assert.equal(s[0].status, 'proposed');
  assert.equal(s[1].status, 'derived');
});

test('setStatus refuses a malformed status', async () => {
  // Permissive on vocabulary, strict on shape: a value with spaces or an @ would
  // corrupt the tag line and silently break every scenario in the file.
  const file = await fixture();
  await assert.rejects(() => setStatus(file, 'LOCK-001', 'not a status'), /Malformed status/);
  await assert.rejects(() => setStatus(file, 'LOCK-001', '@accepted'), /Malformed status/);
  assert.equal(await readFile(file, 'utf8'), DOC);
});

test('setStatus refuses a scenario that does not exist', async () => {
  const file = await fixture();
  await assert.rejects(() => setStatus(file, 'NOPE-001', 'accepted'), /not found/);
  assert.equal(await readFile(file, 'utf8'), DOC);
});

test('addNote writes an inert comment above the right block', async () => {
  const file = await fixture();
  await addNote(file, 'LOCK-002', 'The Then clause does not match the app.', {
    author: 'sam',
    date: '2026-08-09',
  });
  const after = await readFile(file, 'utf8');

  assert.match(after, /<!-- review sam 2026-08-09: The Then clause does not match the app\. -->/);
  // It must land above LOCK-002, not LOCK-001.
  assert.ok(after.indexOf('review sam') > after.indexOf('@LOCK-001'));
  assert.ok(after.indexOf('review sam') < after.indexOf('@LOCK-002'));

  // Still parses, and no scenario was lost or altered.
  const s = parseDocument(after, file);
  assert.equal(s.length, 2);
  assert.equal(s[0].status, 'derived');
  assert.equal(s[1].status, 'derived');
});

test('addNote refuses an empty note', async () => {
  const file = await fixture();
  await assert.rejects(() => addNote(file, 'LOCK-001', '   '), /empty review note/);
  assert.equal(await readFile(file, 'utf8'), DOC);
});

// @looknow is answered by the architect acting, and only by the architect.
//
// The defect these guard is the flag outliving the action that answered it: the
// queue keeps presenting scenarios already dealt with, the LOOK NOW badge stops
// meaning anything, and the reviewer learns to ignore it. The mirror defect is
// just as real - an AGENT's write clearing the flag would silently discard a
// request for attention that nobody has answered yet, and `handled` exists
// precisely to raise it.

test('accepting a scenario answers its @looknow', async () => {
  const file = await fixture(FLAGGED_DOC);
  await setStatus(file, 'LOCK-001', 'accepted', { date: '2026-08-09', actor: ACTOR_ARCHITECT });
  const s = await reread(file);

  assert.equal(s.find((x) => x.id === 'LOCK-001').status, 'accepted');
  assert.deepEqual(flagsOf(s, 'LOCK-001'), []);
  // The clear must not widen to the rest of the document, for the same reason a
  // status write must not: it would retire flags nobody has looked at.
  assert.deepEqual(flagsOf(s, 'LOCK-002'), ['looknow']);
  assert.equal(s.find((x) => x.id === 'LOCK-001').persona, 'Cashier');
});

test('re-affirming the status a scenario already has still answers @looknow', async () => {
  // The status write is a no-op and returns early. The architect still acted, and
  // an early return that skipped the flag would leave pressing the button looking
  // like it did nothing at all.
  const file = await fixture(FLAGGED_DOC);
  await setStatus(file, 'LOCK-001', 'derived', { actor: ACTOR_ARCHITECT });
  const s = await reread(file);

  assert.equal(s.find((x) => x.id === 'LOCK-001').status, 'derived');
  assert.deepEqual(flagsOf(s, 'LOCK-001'), []);
});

test('an agent writing a status leaves @looknow standing', async () => {
  const file = await fixture(FLAGGED_DOC);
  await setStatus(file, 'LOCK-001', 'verified', { date: '2026-08-09' });
  const s = await reread(file);

  assert.equal(s.find((x) => x.id === 'LOCK-001').status, 'verified');
  assert.deepEqual(flagsOf(s, 'LOCK-001'), ['looknow']);
});

test('a status write that fails leaves @looknow standing', async () => {
  // Partial failure: the flag is answered only once the write it accompanies is
  // proven. Clearing first would lose the request for attention with nothing on
  // disk to show for it.
  const file = await fixture(FLAGGED_DOC);
  await assert.rejects(
    () => setStatus(file, 'LOCK-001', 'not a status', { actor: ACTOR_ARCHITECT }),
    /Malformed status/
  );
  assert.equal(await readFile(file, 'utf8'), FLAGGED_DOC);
});

test('a note answers @looknow and raises @review', async () => {
  // The exchange completed: an agent asked to be looked at, the architect looked
  // and wrote back. Both flags standing would show the item as owed by each side
  // at once, and each would keep picking up the other's work.
  const file = await fixture(FLAGGED_DOC);
  await addNote(file, 'LOCK-002', 'The Then clause does not match the app.', {
    author: 'sam',
    date: '2026-08-09',
    actor: ACTOR_ARCHITECT,
  });
  const s = await reread(file);

  assert.deepEqual(flagsOf(s, 'LOCK-002'), ['review']);
  assert.equal(s.find((x) => x.id === 'LOCK-002').notes.length, 1);
  assert.deepEqual(flagsOf(s, 'LOCK-001'), ['looknow']);
});

// A note is a message; the author decides which way it travels.
//
// The defect these guard is a note that flags the side that wrote it. An agent's
// question raising @review would put the item back in the agent's own queue and the
// architect would never be asked; the architect's answer raising @looknow would ask
// them again instead of handing the work over. Either way the loop stalls with both
// sides believing it is with the other.

test('an agent asking a question raises @looknow, not @review', async () => {
  const file = await fixture(NOTES_DOC);
  await addNote(file, 'LOCK-004', 'Should this show blank, or the word none?', {
    author: 'agent',
    date: '2026-08-10',
  });
  const s = await reread(file);

  assert.deepEqual(flagsOf(s, 'LOCK-004'), ['looknow']);
  assert.equal(notesOf(s, 'LOCK-004').length, 1);
  assert.match(await readFile(file, 'utf8'), /<!-- review agent 2026-08-10: Should this show/);
});

test("an agent's question does not clear a @looknow already raised", async () => {
  // Asking twice, or asking about something already flagged, must not retire the
  // flag: the question is still unanswered and the item is still the architect's.
  const file = await fixture(NOTES_DOC);
  await addNote(file, 'LOCK-003', 'A second question on the same scenario.', {
    author: 'agent',
    date: '2026-08-10',
  });
  const s = await reread(file);

  assert.deepEqual(flagsOf(s, 'LOCK-003'), ['looknow']);
  assert.equal(notesOf(s, 'LOCK-003').length, 2);
});

test('the architect answering an agent question hands the item back', async () => {
  // The whole round trip, which is the thing that actually has to work: ask, answer,
  // and the flags swap over so each side is told exactly once.
  const file = await fixture(NOTES_DOC);
  await addNote(file, 'LOCK-004', 'Blank or the word none?', { author: 'agent', date: '2026-08-10' });
  assert.deepEqual(flagsOf(await reread(file), 'LOCK-004'), ['looknow']);

  await addNote(file, 'LOCK-004', 'Blank. "none" reads like a value.', {
    author: 'architect',
    date: '2026-08-10',
    actor: ACTOR_ARCHITECT,
  });
  const s = await reread(file);

  assert.deepEqual(flagsOf(s, 'LOCK-004'), ['review']);
  assert.deepEqual(
    notesOf(s, 'LOCK-004').map((n) => n.text),
    ['Blank or the word none?', 'Blank. "none" reads like a value.']
  );
});

test('the architect clearing notes answers @looknow', async () => {
  const file = await fixture(FLAGGED_DOC);
  const removed = await clearNotes(file, 'LOCK-001', { actor: ACTOR_ARCHITECT });
  const s = await reread(file);

  assert.equal(removed, 1);
  assert.equal(s.find((x) => x.id === 'LOCK-001').notes.length, 0);
  assert.deepEqual(flagsOf(s, 'LOCK-001'), []);
});

test('an agent clearing notes leaves @looknow for the architect', async () => {
  // `criteria-review handled` clears the note and hands the item BACK. If this
  // call cleared the flag, the hand-back would depend on the raise that follows
  // it succeeding, and a failure there would drop the item out of the queue
  // silently.
  const file = await fixture(FLAGGED_DOC);
  await clearNotes(file, 'LOCK-001');
  const s = await reread(file);

  assert.equal(s.find((x) => x.id === 'LOCK-001').notes.length, 0);
  assert.deepEqual(flagsOf(s, 'LOCK-001'), ['looknow']);
});

// Clearing notes must remove the target's notes and nothing else.
//
// The defect: the first implementation rewrote the whole region from the start of
// the file to the scenario's anchor with a global regex, so clearing one item
// silently deleted every note above it in the document. Notes are sourced intent -
// the one thing that cannot be reconstructed later - and losing them looks exactly
// like a successful write.

test('clearing one scenario notes leaves the notes on every other scenario', async () => {
  const file = await fixture(NOTES_DOC);
  const removed = await clearNotes(file, 'LOCK-003', { actor: ACTOR_ARCHITECT });
  const s = await reread(file);

  assert.equal(removed, 1);
  assert.equal(notesOf(s, 'LOCK-003').length, 0);
  assert.deepEqual(
    notesOf(s, 'LOCK-001').map((n) => n.text),
    ['first note, must survive']
  );
  assert.deepEqual(
    notesOf(s, 'LOCK-002').map((n) => n.text),
    ['second note, must survive']
  );
  // The intent comment is not a note and must be left alone by a note clear.
  assert.match(await readFile(file, 'utf8'), /<!-- intent: docs\/spec\.md:12 -->/);
});

test('a note written inside the fence is removed rather than silently kept', async () => {
  // Hand-written notes do not always sit where addNote puts them. Reporting
  // removal while leaving the note on disk is a silent partial success: the
  // architect sees the discussion closed and the document still carries it.
  const file = await fixture(NOTES_DOC);
  const removed = await clearNotes(file, 'LOCK-002', { actor: ACTOR_ARCHITECT });
  const after = await readFile(file, 'utf8');

  assert.equal(removed, 1);
  assert.equal(notesOf(parseDocument(after, file), 'LOCK-002').length, 0);
  assert.doesNotMatch(after, /second note, must survive/);
  assert.equal(notesOf(parseDocument(after, file), 'LOCK-001').length, 1);
});

test('clearing notes on a scenario that has none is a no-op, not a wipe', async () => {
  const file = await fixture(NOTES_DOC);
  const removed = await clearNotes(file, 'LOCK-004', { actor: ACTOR_ARCHITECT });
  const s = await reread(file);

  assert.equal(removed, 0);
  assert.equal(notesOf(s, 'LOCK-001').length, 1);
  assert.equal(notesOf(s, 'LOCK-002').length, 1);
  assert.equal(notesOf(s, 'LOCK-003').length, 1);
});

test('a note containing a comment terminator cannot break the document', async () => {
  const file = await fixture();
  await addNote(file, 'LOCK-001', 'this --> should not terminate the comment', {
    date: '2026-08-09',
  });
  const after = await readFile(file, 'utf8');
  // The sequence is neutralised, so the markdown comment stays well formed and
  // both scenarios still parse.
  assert.equal(parseDocument(after, file).length, 2);
  assert.doesNotMatch(after, /<!-- review 2026-08-09: this --> should/);
});
