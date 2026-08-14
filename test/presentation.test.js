import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePresentation,
  auditPresentation,
  suggestPlacement,
  loadPresentations,
} from '../src/presentation.js';
import { scanProject } from '../src/scan.js';

// What these guard: a presentation is built to show somebody the whole product, so the
// failure that matters is a SILENT omission - it misleads precisely the person it was made
// for, and nothing about the walkthrough says anything is missing. The scope distinction is
// what keeps that check from crying about deliberate subsets, because an audit that cries is
// an audit that gets switched off.

const SCENARIOS = [
  { id: 'LOCK-SET-001', title: 'Locking', source: 'a.md', feature: 'Locking' },
  { id: 'LOCK-SET-002', title: 'Drawer stays', source: 'a.md', feature: 'Locking' },
  { id: 'LOCK-OPEN-001', title: 'Own PIN', source: 'a.md', feature: 'Reopening' },
  { id: 'CASH-001', title: 'Count', source: 'b.md', feature: 'Cash' },
];

const DOC = `# Total application

<!-- scope: complete -->
<!-- audience: end customer -->

Everything, in menu order.

## The register

### Locking

@LOCK-SET-001 - takes effect immediately
@LOCK-SET-002

### Reopening

@LOCK-OPEN-001

## Not shown

<!-- excluded: no user-facing surface -->
@CASH-001 - drained by a queue handler
`;

test('a presentation carries its tree, its narration and its scope', () => {
  const p = parsePresentation(DOC, 'presentations/total.md');
  assert.equal(p.title, 'Total application');
  assert.equal(p.scope, 'complete');
  assert.equal(p.audience, 'end customer');

  // The path is what makes a placement a location rather than merely a membership.
  const first = p.placements[0];
  assert.deepEqual(first.path, ['The register', 'Locking']);
  assert.equal(first.narration, 'takes effect immediately');
  assert.equal(p.placements.length, 3);
  assert.deepEqual(p.excluded.map((e) => e.id), ['CASH-001']);
});

test('a complete presentation reports what it has not placed', () => {
  const p = parsePresentation(DOC.replace('@LOCK-OPEN-001', ''), 'presentations/total.md');
  const a = auditPresentation(p, SCENARIOS);

  // The whole point: a scenario nobody placed is a gap the viewer cannot see.
  assert.deepEqual(a.missing, ['LOCK-OPEN-001']);
  assert.equal(a.ok, false);
});

test('an explicit exclusion is not a gap, but an unexplained one is a problem', () => {
  const a = auditPresentation(parsePresentation(DOC, 'p.md'), SCENARIOS);
  // CASH-001 is excluded WITH a reason, so a complete presentation is complete without it.
  assert.deepEqual(a.missing, []);
  assert.equal(a.ok, true);

  const noReason = parsePresentation(
    '# X\n<!-- scope: complete -->\n## Not shown\n<!-- excluded -->\n@CASH-001\n',
    'p.md'
  );
  // Catches: an exclusion indistinguishable from an oversight, which is why `n/a` carries a
  // reason everywhere else in this standard too.
  assert.ok(noReason.problems.some((x) => /no reason given/.test(x)));
});

test('a partial presentation owes no coverage, only that its references resolve', () => {
  const partial = parsePresentation(
    '# Demo\n<!-- scope: partial -->\n## Highlights\n@LOCK-SET-001\n',
    'p.md'
  );
  const a = auditPresentation(partial, SCENARIOS);

  // Demanding everything of a curated subset would report intent as failure.
  assert.deepEqual(a.missing, []);
  assert.equal(a.ok, true);
});

test('a reference to a scenario that no longer exists is reported', () => {
  const p = parsePresentation('# X\n<!-- scope: partial -->\n## S\n@GONE-001\n', 'p.md');
  const a = auditPresentation(p, SCENARIOS);

  // Catches: a walkthrough promising the viewer something that has been retired.
  assert.deepEqual(a.dangling, ['GONE-001']);
  assert.equal(a.ok, false);
});

test('the same scenario in two places is information, not a fault', () => {
  const p = parsePresentation(
    '# X\n<!-- scope: partial -->\n## Till\n@LOCK-SET-001\n## Reports\n@LOCK-SET-001\n',
    'p.md'
  );
  const a = auditPresentation(p, SCENARIOS);

  // A scenario reachable from two menus belongs in both, because that is where a user finds
  // it. Reported so it is deliberate rather than accidental.
  assert.deepEqual(a.duplicated, ['LOCK-SET-001']);
  assert.equal(a.ok, true);
});

test('placement is recommended from where siblings already sit', () => {
  const p = parsePresentation(DOC, 'p.md');
  const fresh = { id: 'LOCK-SET-003', title: 'New', source: 'a.md', feature: 'Locking' };
  const [s] = suggestPlacement(fresh, [p], [...SCENARIOS, fresh]);

  // The same FEATURE outweighs merely the same document, because one document can hold
  // several features and the nearer neighbour is the better evidence.
  assert.equal(s.section, 'The register > Locking');
  assert.match(s.basis, /sibling placement/);
  assert.equal(s.after, 'LOCK-SET-002');
});

test('the worked example presentations audit clean against their own project', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'glossary');
  const { scenarios } = await scanProject(root, 'example');
  const presentations = await loadPresentations(root);

  // The example ships as something to copy, so it has to survive its own rules: the complete
  // walkthrough places or explains every scenario, and nothing dangles.
  assert.ok(presentations.length >= 2);
  for (const p of presentations) {
    const a = auditPresentation(p, scenarios);
    assert.deepEqual(a.dangling, [], `${a.presentation} dangling`);
    assert.deepEqual(a.problems, [], `${a.presentation} problems`);
    if (a.scope === 'complete') assert.deepEqual(a.missing, [], `${a.presentation} missing`);
  }
});
