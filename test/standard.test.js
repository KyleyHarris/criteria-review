import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listStandardDocs, readStandardDoc } from '../src/standard.js';

// What these guard: this is the only route that takes a caller-supplied filename, in a
// server that reads and writes the architect's documents. The listing is also what the
// reading tab shows, so a document missing from it is a rule nobody can find.

test('the walkthrough comes before the rules, and the index leads its group', async () => {
  const docs = await listStandardDocs();
  assert.ok(docs.length >= 9, `expected help plus the standard, got ${docs.length}`);

  // Catches: an ordering that opens on a rule. Someone who has never seen this needs
  // the walkthrough; a single alphabetical list would put a mid-process rule first.
  assert.equal(docs[0].group, 'help');

  // Catches: a sort that buries the index inside its own group. Lexicographic order
  // puts README after the numbered files, and a first-time reader looks at the top.
  const standard = docs.filter((d) => d.group === 'standard');
  assert.match(standard[0].file, /^README/i);
});

test('a document is titled by its own heading, not its filename', async () => {
  const docs = await listStandardDocs();
  const contract = docs.find((d) => d.name === 'standard/emit-contract.md');

  // Catches: a list of filenames. The point of the tab is reading, and "emit-contract.md"
  // tells a reader less than the sentence the author put at the top of it.
  assert.equal(contract.title, 'The emit contract');
});

test('a source example is marked as source, not markdown', async () => {
  const docs = await listStandardDocs();
  const spec = docs.find((d) => d.name.endsWith('.ts'));

  // Catches: parsing a TypeScript example as prose, where its comments and asterisks
  // would be treated as markup and the sample would render wrong.
  assert.ok(spec, 'the worked journey should be listed');
  assert.equal(spec.kind, 'source');
});

test('a named document is returned with its text', async () => {
  const doc = await readStandardDoc('standard/emit-contract.md');
  assert.equal(doc.name, 'standard/emit-contract.md');
  assert.match(doc.text, /## The commands/);
});

test('a traversal attempt is refused, not sanitised', async () => {
  // Catches: the classic. Refused because it is not in the listing rather than because
  // it looks dangerous - a sanitiser is a claim that every escape was thought of, and
  // the listing is a fact about what exists.
  for (const attempt of [
    '../../package.json',
    '../decisions.md',
    '/etc/passwd',
    'docs/standard/README.md',
    '..%2Fpackage.json',
    '',
    // The grouped name is `<group>/<file>`, so these are the shapes that look most
    // like a legitimate key and are the ones a sanitiser would be likeliest to pass.
    'standard/../decisions.md',
    'standard/../../package.json',
    'help/../standard/README.md',
  ]) {
    assert.equal(await readStandardDoc(attempt), null, `${attempt} must not resolve`);
  }
});

test('a file outside the readable extensions is not reachable', async () => {
  // Catches: the allowlist widening by accident. Only prose and the worked example are
  // meant to be readable here.
  assert.equal(await readStandardDoc('.DS_Store'), null);
  assert.equal(await readStandardDoc('README'), null);
});
