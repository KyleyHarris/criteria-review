import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../src/parse.js';
import { buildModel, renderTypeScript, renderJson, EmitError } from '../src/emit.js';

// What these guard. The emitted artefact is what a consumer's build depends on, so
// every failure here is silent on the consumer's side: a duplicate id makes one
// scenario's citations point at the other's clauses; an unknown status ships a typo
// into a type; a timestamp in the output makes the gate's --check always fail, which
// trains people to skip the gate. Each test names the defect it would catch.

const DOC = `
### Feature: Reopening

<!-- intent: design-notes/till-lock.md section 5 -->

\`\`\`gherkin
@LOCK-OPEN-001 @status:derived @persona:Cashier
Scenario: The cashier's own PIN resumes their session in place
  Given the register was locked during a cashier's shift
  When that cashier enters their own PIN
  Then they are returned to the till
  And the same shift is still open, not a new one
\`\`\`

\`\`\`gherkin
@LOCK-OPEN-003 @status:accepted @persona:Cashier
Scenario: A wrong PIN is refused without saying why
  Given the register is locked
  When someone enters an unknown PIN
  Then the entry is refused with the same message as any other failure
\`\`\`
`;

const parse = (text, source = 'acceptance/till-lock/till-lock-acceptance.md') =>
  parseDocument(text, source);

test('a scenario emits its clauses verbatim and in document order', () => {
  const model = buildModel(parse(DOC));
  const s = model.scenarios.find((x) => x.id === 'LOCK-OPEN-001');

  // Catches: reordering or normalising clauses. A consumer keys its step bodies on
  // these exact strings, so any transformation here breaks every citing journey.
  assert.deepEqual(s.steps, [
    "Given the register was locked during a cashier's shift",
    'When that cashier enters their own PIN',
    'Then they are returned to the till',
    'And the same shift is still open, not a new one',
  ]);
  assert.equal(s.persona, 'Cashier');
  assert.equal(s.tag, '@LOCK-OPEN-001');
  assert.equal(s.feature, 'Reopening');
  assert.equal(s.intent, 'design-notes/till-lock.md section 5');
});

test('output is ordered by id, not by document position', () => {
  assert.deepEqual(
    buildModel(parse(DOC)).scenarios.map((s) => s.id),
    ['LOCK-OPEN-001', 'LOCK-OPEN-003']
  );

  // Catches: output that churns when a document is reordered. A generated file whose
  // diff moves for reasons unrelated to its content stops being read.
  assert.deepEqual(
    buildModel(parse(DOC).reverse()).scenarios.map((s) => s.id),
    ['LOCK-OPEN-001', 'LOCK-OPEN-003']
  );
});

test('the same input renders byte-identically twice', () => {
  // Catches: a timestamp or any other non-deterministic field. The gate compares the
  // committed artefact to a fresh render, so anything that varies makes --check fail
  // on an unchanged repository.
  const a = renderTypeScript(buildModel(parse(DOC)));
  const b = renderTypeScript(buildModel(parse(DOC)));
  assert.equal(a, b);
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(a), 'rendered output must not contain a timestamp');
});

test('a duplicate id is refused, naming both sources', () => {
  const scenarios = [...parse(DOC, 'a.md'), ...parse(DOC, 'b.md')];

  // Catches: two scenarios sharing the join key. Emitting the last one silently would
  // point every citation of that id at the wrong clauses, in both directions.
  assert.throws(
    () => buildModel(scenarios),
    (err) => {
      assert.ok(err instanceof EmitError);
      assert.match(err.message, /LOCK-OPEN-001: defined twice, in a\.md and b\.md/);
      return true;
    }
  );
});

test('a proposed scenario emits, because planning-time criteria are the lifecycle', () => {
  const proposed = DOC.replace('@status:derived', '@status:proposed');
  const model = buildModel(parse(proposed));

  // Catches: dropping `proposed` from the vocabulary. It is the status of a scenario
  // written before the software exists, which is where the standard says tier 1
  // criteria are authored; refusing it would make the ladder unable to express its own
  // first stage, and force a proposal to masquerade as a description.
  assert.equal(model.scenarios.find((s) => s.id === 'LOCK-OPEN-001').status, 'proposed');
  assert.equal(model.scenarios.length, 2);
});

test('an unknown status is refused rather than rendered', () => {
  const bad = DOC.replace('@status:derived', '@status:dervied');

  // Catches: the viewer's deliberate tolerance leaking into the build. A mistyped
  // status renders happily and puts a typo in a consumer's type.
  assert.throws(() => buildModel(parse(bad)), /unknown status "dervied"/);
});

test('verified without a date and a commit is refused', () => {
  const bad = DOC.replace('@status:derived', '@status:verified');

  // Catches: a claim that someone watched this happen, with nothing recording when or
  // at which commit. Unfalsifiable, and it ages into a lie without either.
  assert.throws(() => buildModel(parse(bad)), /status verified requires @verified: and @commit:/);
});

test('every problem is reported at once, not just the first', () => {
  const bad = DOC.replace('@status:derived', '@status:dervied').replace(
    '@status:accepted',
    '@status:verified'
  );

  // Catches: fix-one-run-again. Two problems reported one at a time is two builds.
  let caught = null;
  try {
    buildModel(parse(bad));
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof EmitError, 'expected an EmitError');
  assert.equal(caught.problems.length, 2);
});

test('an untracked scenario is excluded but counted, never silently dropped', () => {
  const withUntracked =
    DOC +
    `
\`\`\`gherkin
Scenario: Something nobody has tagged yet
  Given a thing
  Then another thing
\`\`\`
`;
  const model = buildModel(parse(withUntracked));

  // Catches: silence. An excluded scenario is indistinguishable from one that was
  // never written, and the backlog is exactly what this standard exists to surface.
  assert.equal(model.scenarios.length, 2);
  assert.equal(model.untracked.length, 1);
  assert.equal(model.untracked[0].reason, 'no id');
});

test('a scenario with no clauses is refused', () => {
  const bad = `
\`\`\`gherkin
@LOCK-OPEN-009 @status:derived
Scenario: A heading pretending to be a scenario
\`\`\`
`;
  // Catches: an id a journey could cite while having nothing to prove. The consumer
  // would get an empty step tuple and a journey that passes by asserting nothing.
  assert.throws(() => buildModel(parse(bad)), /no Given\/When\/Then clauses/);
});

test('the TypeScript render is const-narrowed so clauses become literal types', () => {
  const ts = renderTypeScript(buildModel(parse(DOC)));

  // Catches: dropping `as const`. Without it `steps` widens to string[], every key
  // check the consumer relies on becomes vacuous, and the guarantee is gone with no
  // visible symptom - the module still compiles on both sides.
  assert.match(ts, /\} as const;/);
  assert.match(ts, /export type ScenarioKey = keyof typeof SCENARIOS;/);
  assert.match(ts, /export type Clause<K extends ScenarioKey>/);
  assert.match(ts, /DO NOT EDIT/);
  assert.match(ts, /export const STANDARD_VERSION = '\d+\.\d+\.\d+';/);
});

test('a clause containing an apostrophe survives the render', () => {
  const ts = renderTypeScript(buildModel(parse(DOC)));

  // Catches: an unescaped quote. Real criteria are prose and apostrophes are
  // everywhere; a naive render produces a file that does not parse, which at least
  // fails loudly - but a half-escaped one produces a truncated clause, which does not.
  assert.match(ts, /'Given the register was locked during a cashier\\'s shift',/);
});

test('the neutral JSON carries the same model the renderers see', () => {
  const model = buildModel(parse(DOC));
  const round = JSON.parse(renderJson(model));

  // Catches: a renderer that adds meaning of its own. The JSON is the contract other
  // languages will implement against, so it has to be the whole model.
  assert.deepEqual(round.scenarios, model.scenarios);
  assert.equal(round.standardVersion, model.standardVersion);
});
