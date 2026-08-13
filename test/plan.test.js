import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItems, readPlan, completeness } from '../src/plan.js';

// What these guard: the plan is a list of ids and nothing else, and every other fact about
// a scenario is read from the document. The failures worth catching are the silent ones -
// an item that quietly did not make it into the plan, and an id that quietly left the
// documents. Both make "the plan is done" and "the task is done" stop meaning the same
// thing, which is the only reason to have a plan at all.

const SCENARIOS = [
  { id: 'LOCK-OPEN-001', title: 'Own PIN resumes', status: 'derived', project: 'p', source: 'a.md' },
  { id: 'LOCK-OPEN-002', title: 'Other cashier recorded', status: 'accepted', project: 'p', source: 'a.md' },
  { id: 'CASH-CLOSE-003', title: 'Pending movements', status: 'verified', project: 'p', source: 'b.md' },
];

test('an id is found whether bare, tagged, or buried in prose', () => {
  const { ids } = resolveItems(
    ['LOCK-OPEN-001', '@LOCK-OPEN-002', 'the composer gets CASH-CLOSE-003 wrong on close'],
    SCENARIOS
  );

  // Catches: a parser that needs a tidy list. A work item holds sentences, and an architect
  // pasting the body should not have to reduce it by hand first.
  assert.deepEqual(ids, ['LOCK-OPEN-001', 'LOCK-OPEN-002', 'CASH-CLOSE-003']);
});

test('an item with no id is reported, not dropped', () => {
  const { ids, unresolved } = resolveItems(['LOCK-OPEN-001', 'rename the config helper'], SCENARIOS);

  // Catches the silent failure this whole module exists to prevent: scope leaving the task
  // without anyone seeing it go. An item that needs criteria written, or is not
  // criteria-shaped, has to be named.
  assert.deepEqual(ids, ['LOCK-OPEN-001']);
  assert.equal(unresolved.length, 1);
  assert.match(unresolved[0].reason, /no scenario id found/);
});

test('an id that does not exist is reported against its own text', () => {
  const { ids, unresolved } = resolveItems(['LOCK-OPEN-999'], SCENARIOS);

  // Catches: accepting an id because it is well-formed. A typo in a work item would
  // otherwise sit in the plan forever, permanently outstanding and never explicable.
  assert.deepEqual(ids, []);
  assert.equal(unresolved[0].text, 'LOCK-OPEN-999');
  assert.match(unresolved[0].reason, /no such scenario/);
});

test('the same scenario named twice lands once', () => {
  const { ids } = resolveItems(['LOCK-OPEN-001', 'again: LOCK-OPEN-001'], SCENARIOS);
  assert.deepEqual(ids, ['LOCK-OPEN-001']);
});

test('reading a plan takes every fact from the documents', () => {
  const { live } = readPlan({ ids: ['LOCK-OPEN-002'] }, SCENARIOS);

  // Catches: caching a title or a status in the plan file. A copy here would be a second
  // thing claiming to know, and the stale one is the one somebody reads.
  assert.equal(live[0].title, 'Other cashier recorded');
  assert.equal(live[0].status, 'accepted');
});

test('an id that has left the documents is reported as orphaned', () => {
  const { live, orphaned } = readPlan({ ids: ['LOCK-OPEN-001', 'GONE-AWAY-001'] }, SCENARIOS);

  // Catches: a renamed or deleted scenario disappearing from the plan silently, which makes
  // a task look smaller than it was declared to be.
  assert.equal(live.length, 1);
  assert.deepEqual(orphaned.map((o) => o.id), ['GONE-AWAY-001']);
});

test('several tasks live in one plan, and each id knows which it came from', () => {
  const plan = {
    tasks: [
      { task: 'Till hardening', source: 'issue #412', ids: ['LOCK-OPEN-001'] },
      { task: 'Refunds', source: 'AB#8891', ids: ['CASH-CLOSE-003'] },
    ],
  };
  const { live } = readPlan(plan, SCENARIOS);

  // Catches: flattening a set of tasks into one list. With two in flight the useful question
  // is not "is this planned" but "which of these am I looking at".
  assert.deepEqual(live.map((s) => [s.id, s.planTask]), [
    ['LOCK-OPEN-001', 'Till hardening'],
    ['CASH-CLOSE-003', 'Refunds'],
  ]);
});

test('selecting a task narrows the read, and an ambiguous name is refused', async () => {
  const { selectTasks } = await import('../src/plan.js');
  const tasks = [
    { task: 'Till hardening', ids: [] },
    { task: 'Till reporting', ids: [] },
    { task: 'Refunds', ids: [] },
  ];

  assert.deepEqual(selectTasks(tasks, ['refund']).selected.map((t) => t.task), ['Refunds']);
  // Catches: picking one of two matches. Working the wrong task is worse than being asked.
  assert.equal(selectTasks(tasks, ['till']).ambiguous.length, 1);
  assert.deepEqual(selectTasks(tasks, ['nope']).unmatched, ['nope']);
  // No names means everything, so the default stays "the whole plan".
  assert.equal(selectTasks(tasks, []).selected.length, 3);
});

test('completeness is computed from status, never from the plan', () => {
  const { live } = readPlan({ ids: ['LOCK-OPEN-001', 'LOCK-OPEN-002', 'CASH-CLOSE-003'] }, SCENARIOS);
  const state = completeness(live);

  // Catches: self-reported progress. Settled means a human moved the status; accepted and
  // verified both count, derived does not, and no tick in a file can substitute.
  assert.equal(state.total, 3);
  assert.equal(state.settled, 2);
  assert.deepEqual(state.outstanding.map((s) => s.id), ['LOCK-OPEN-001']);
});
