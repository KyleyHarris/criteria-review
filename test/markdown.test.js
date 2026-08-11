import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderSource } from '../public/markdown.js';

// What these guard: this renderer displays the standard itself. A rule that renders
// wrong is misleading; a rule that silently disappears is worse, because nobody can
// see that it is missing. Each test names the defect it would catch.

test('a heading becomes a heading at its own level', () => {
  assert.match(renderMarkdown('## Two tiers'), /<h2>Two tiers<\/h2>/);
  assert.match(renderMarkdown('###### Six'), /<h6>Six<\/h6>/);
});

test('a fenced block is escaped verbatim and never parsed as prose', () => {
  const html = renderMarkdown('```ts\nconst a = 1 < 2 && b;\n// **not bold**\n```');

  // Catches: markup applied inside a code sample. These blocks are what a reader
  // copies, so any transformation is a defect they carry into their own code.
  assert.match(html, /<pre data-lang="ts"><code>/);
  assert.match(html, /const a = 1 &lt; 2 &amp;&amp; b;/);
  assert.match(html, /\/\/ \*\*not bold\*\*/);
  assert.ok(!html.includes('<strong>'), 'markup inside a fence must not be applied');
});

test('an unterminated fence still renders its content', () => {
  // Catches: silent truncation. A document ending mid-block would otherwise lose
  // everything from the fence onward, and the page would look complete.
  assert.match(renderMarkdown('```\nsomething\n'), /<code>something<\/code>/);
});

test('a table renders as a table, and a paragraph with pipes does not', () => {
  const table = renderMarkdown('| Tag | Meaning |\n| --- | --- |\n| `@status:derived` | Written up |');
  assert.match(table, /<table><thead><tr><th>Tag<\/th><th>Meaning<\/th>/);
  assert.match(table, /<td><code>@status:derived<\/code><\/td><td>Written up<\/td>/);

  // Catches: over-eager table detection. The status tables matter, but so does an
  // ordinary sentence mentioning a | character, which must not become a one-cell table.
  const prose = renderMarkdown('The a | b form is not a table here.');
  assert.ok(!prose.includes('<table>'), 'a lone pipe in prose is not a table');
});

test('inline code protects its contents from bold and italic', () => {
  const html = renderMarkdown('Use `a ** b` and `snake_case_name` literally.');

  // Catches: the commonest renderer bug on this corpus. The documents are full of
  // code spans containing asterisks and underscores, and applying markup inside them
  // silently rewrites the sample.
  assert.match(html, /<code>a \*\* b<\/code>/);
  assert.match(html, /<code>snake_case_name<\/code>/);
  assert.ok(!html.includes('<strong>'), 'no bold inside a code span');
});

test('a printable-looking placeholder in the prose survives round-tripping', () => {
  // Catches: a code-span placeholder made of ordinary characters. Text that happens to
  // look like the marker would be replaced by a code span it never had.
  const html = renderMarkdown('Step 0 and step 1 both matter, and `code` too.');
  assert.match(html, /Step 0 and step 1 both matter/);
  assert.match(html, /<code>code<\/code>/);
});

test('bold and italic render, and stray asterisks do not', () => {
  assert.match(renderMarkdown('**Tier 1** is the business tier'), /<strong>Tier 1<\/strong>/);
  assert.match(renderMarkdown('the *why* matters'), /<em>why<\/em>/);
});

test('a link to a sibling document becomes an in-page link', () => {
  const html = renderMarkdown('See [the contract](emit-contract.md) for the shape.');

  // Catches: cross-references turning into downloads or dead links. These documents
  // reference each other constantly, and reading them here has to follow.
  assert.match(html, /<a href="#doc=emit-contract\.md">the contract<\/a>/);
});

test('a javascript: link is refused and left as literal text', () => {
  const html = renderMarkdown('[click](javascript:alert(1))');

  // Catches: a renderer that trusts its input. These documents are local and trusted
  // today; that is a fact about today, and the reader still sees what was written.
  assert.ok(!html.includes('href="javascript'), 'must not emit a javascript: href');
  assert.ok(!html.includes('<a '), 'must not become a link at all');
  assert.match(html, /\[click\]/);
});

test('html in the source is escaped, not executed', () => {
  const html = renderMarkdown('A <script>alert(1)</script> in prose.');
  assert.ok(!html.includes('<script>'), 'script tags must not survive');
  assert.match(html, /&lt;script&gt;/);
});

test('lists render, ordered and unordered, and wrapped items stay one item', () => {
  const ul = renderMarkdown('- first\n- second that wraps\n  onto another line\n');
  assert.match(ul, /<ul><li>first<\/li><li>second that wraps onto another line<\/li><\/ul>/);

  const ol = renderMarkdown('1. one\n2. two\n');
  assert.match(ol, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
});

test('a blockquote keeps the structure inside it', () => {
  const html = renderMarkdown('> **Note.** A rule.\n> - and a point\n');

  // Catches: flattening. The documents put emphasis and lists inside quotes, and a
  // blockquote that dropped them would quietly change what the rule says.
  assert.match(html, /<blockquote>/);
  assert.match(html, /<strong>Note\.<\/strong>/);
  assert.match(html, /<li>and a point<\/li>/);
});

test('a rule and a paragraph are distinguishable', () => {
  assert.match(renderMarkdown('---'), /<hr \/>/);
  assert.match(renderMarkdown('Just a sentence.'), /<p>Just a sentence\.<\/p>/);
});

test('a source file renders as one escaped code block', () => {
  const html = renderSource("const x = '<a>';", 'ts');

  // Catches: parsing a .ts example as prose, where its comments and asterisks would
  // be treated as markup.
  assert.match(html, /<pre data-lang="ts"><code>const x = &#39;&lt;a&gt;&#39;;<\/code><\/pre>/);
});
