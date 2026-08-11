import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDocName } from '../public/doc-name.js';

// What these guard: a regression that actually shipped. Documents are keyed
// `<group>/<file>` so the two directories cannot collide, but a link inside a document
// is written relative - `03-example.md` - the way it is on disk. Before this resolved,
// every cross-reference in the standard reported "no such document", and no test would
// have caught it because nothing rendered a link outside a browser.

const DOCS = [
  { name: 'help/01-getting-started.md', file: '01-getting-started.md', group: 'help' },
  { name: 'standard/README.md', file: 'README.md', group: 'standard' },
  { name: 'standard/02-writing-acceptance-criteria.md', file: '02-writing-acceptance-criteria.md', group: 'standard' },
  { name: 'standard/03-example-acceptance-document.md', file: '03-example-acceptance-document.md', group: 'standard' },
];

test('a relative link resolves within the document it came from', () => {
  // The regression itself.
  assert.equal(
    resolveDocName(DOCS, '03-example-acceptance-document.md', 'standard/02-writing-acceptance-criteria.md'),
    'standard/03-example-acceptance-document.md'
  );
});

test('an already-qualified key is never reinterpreted', () => {
  // Catches: a resolver that helpfully re-resolves an explicit key and lands somewhere
  // else. The qualified form is how a document says exactly what it means.
  assert.equal(
    resolveDocName(DOCS, 'standard/README.md', 'help/01-getting-started.md'),
    'standard/README.md'
  );
});

test('a link across the groups still opens rather than dead-ending', () => {
  // The walkthrough points at the standard constantly, and those references are
  // written as bare filenames too.
  assert.equal(
    resolveDocName(DOCS, '02-writing-acceptance-criteria.md', 'help/01-getting-started.md'),
    'standard/02-writing-acceptance-criteria.md'
  );
});

test('the same group wins over a match elsewhere', () => {
  const docs = [
    { name: 'help/README.md', file: 'README.md', group: 'help' },
    { name: 'standard/README.md', file: 'README.md', group: 'standard' },
  ];

  // Catches: resolution that searches everywhere first and opens the wrong group's
  // file. A relative link means "beside me", and reading the wrong document while
  // believing you followed the link is worse than a dead link.
  assert.equal(resolveDocName(docs, 'README.md', 'standard/README.md'), 'standard/README.md');
  assert.equal(resolveDocName(docs, 'README.md', 'help/README.md'), 'help/README.md');
});

test('an unknown name comes back unchanged, not silently substituted', () => {
  // Catches: a resolver that falls back to "something plausible". The caller reports
  // "no such document" on this, which is the honest answer and names the broken link.
  assert.equal(resolveDocName(DOCS, 'does-not-exist.md', 'standard/README.md'), 'does-not-exist.md');
});
