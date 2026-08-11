import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderQueue, scenarioRisk, intentClass } from '../public/queue-order.js';

// What these guard: this module is imported by BOTH the page and the command line, so a
// change here moves the order in two surfaces at once. The architect sees one order on
// screen and is walked through another in conversation only if these disagree, and they
// would have no way to tell which was right.

const s = (over) => ({
  id: 'X-1',
  project: 'p',
  source: 'acceptance/a.md',
  status: 'derived',
  intent: 'design-notes/x.md section 2',
  flags: [],
  index: 0,
  ...over,
});

test('an unknown status sorts as most urgent, not as safe', () => {
  // Catches: a status the tool cannot rank being treated as fine. Ranking it safe hides
  // exactly the scenarios nobody has classified.
  assert.ok(scenarioRisk(s({ status: 'wat' })) < scenarioRisk(s({ status: 'derived' })));
  assert.ok(scenarioRisk(s({ status: 'derived' })) < scenarioRisk(s({ status: 'accepted' })));
});

test('an unsourced intent outranks a sourced one at the same status', () => {
  // Catches: losing the second signal. A derived scenario whose intent was inferred from
  // the implementation is the most dangerous thing in the queue: it reads as a
  // requirement, and a test citing it can never disagree with the software.
  assert.ok(scenarioRisk(s({ intent: null })) < scenarioRisk(s({ intent: 'some prose' })));
  assert.ok(scenarioRisk(s({ intent: 'some prose' })) < scenarioRisk(s()));
});

test('intent counts as sourced only when it cites something', () => {
  assert.equal(intentClass(null), 'missing');
  assert.equal(intentClass('the product owner wanted it'), 'unsourced');
  assert.equal(intentClass('docs/design.md:14'), 'sourced');
  assert.equal(intentClass('https://example.test/issue'), 'sourced');
  assert.equal(intentClass('issue #412'), 'sourced');
});

test('a flagged scenario jumps the document grouping', () => {
  const items = [
    s({ id: 'A-1', source: 'acceptance/a.md', status: 'derived' }),
    s({ id: 'B-1', source: 'acceptance/b.md', status: 'accepted', flags: ['looknow'] }),
  ];

  // Catches: grouping winning over an interrupt. Grouping optimises a steady pass; a flag
  // means a session found something and wants eyes on it before the pass gets there.
  assert.deepEqual(orderQueue(items).map((x) => x.id), ['B-1', 'A-1']);
});

test('documents stay together, riskiest document first, in their own sequence', () => {
  const items = [
    s({ id: 'A-2', source: 'acceptance/a.md', status: 'accepted', index: 1 }),
    s({ id: 'A-1', source: 'acceptance/a.md', status: 'accepted', index: 0 }),
    s({ id: 'B-1', source: 'acceptance/b.md', status: 'derived', index: 0 }),
  ];

  // Catches: a flat risk sort. Reviewing is dominated by the cost of loading a feature's
  // context, so interleaving two documents pays it on every row - and a document's own
  // order is part of how it reads.
  assert.deepEqual(orderQueue(items).map((x) => x.id), ['B-1', 'A-1', 'A-2']);
});
