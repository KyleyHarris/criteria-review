import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTerms, variantOf, validateTerms, missingTerm, findSpelledTerms } from '../src/terms.js';
import { buildModel, renderTypeScript } from '../src/emit.js';
import { parseDocument } from '../src/parse.js';

// What these guard: a glossary exists so a product can rename a word without every document
// and every test having to be edited. The failure that would destroy that is emitting the
// RENDERED words as the binding key - a rename would then change every clause key, break
// every citing journey, and cost exactly the mechanical sweep the glossary was built to
// prevent. The last test here is the one that matters.

const TERMS = {
  outlet: {
    value: 'Store',
    plural: 'Stores',
    description: 'The shop a till belongs to',
  },
  vendor: { value: 'iPOS', plural: 'iPOS terminals', description: 'The terminal software supplier', casing: 'preserve' },
  business: { value: 'Business', plural: 'Businesses', description: 'The legal entity that trades', possessive: "Business'" },
};

test('only value and plural are authored; the rest derive', () => {
  assert.equal(variantOf(TERMS.outlet, 'value'), 'Store');
  assert.equal(variantOf(TERMS.outlet, 'plural'), 'Stores');

  // Catches: an authored lowercase, which is where drift reappears inside a single term -
  // change value, forget the sibling, and the exercise fails at the smallest possible scale.
  assert.equal(variantOf(TERMS.outlet, 'lower'), 'store');
  assert.equal(variantOf(TERMS.outlet, 'lowerPlural'), 'stores');
  assert.equal(variantOf(TERMS.outlet, 'possessive'), "Store's");
});

test('casing: preserve stops a proper noun being lower-cased', () => {
  // Catches: rendering "ipos". Capitalisation is part of some words' identity, and no
  // compiler catches a lower-cased proper noun.
  assert.equal(variantOf(TERMS.vendor, 'lower'), 'iPOS');
  assert.equal(variantOf(TERMS.vendor, 'lowerPlural'), 'iPOS terminals');
});

test('an authored possessive overrides the derivation', () => {
  // Catches: forcing "Business's" where the house style is "Business'". English disagrees with
  // itself after a trailing s, so this is the one authored form that may exist.
  assert.equal(variantOf(TERMS.business, 'possessive'), "Business'");
});

test('markers render, including variants', () => {
  const { rendered, missing } = renderTerms(
    'A {outlet} owns its {outlet.lower} tills and {outlet.plural} share stock',
    TERMS
  );
  assert.equal(rendered, 'A Store owns its store tills and Stores share stock');
  assert.deepEqual(missing, []);
});

test('an unknown term renders loudly and is reported', () => {
  const { rendered, missing } = renderTerms('A {organization} is renamed', TERMS);

  // Catches: rendering nothing. A missing term that vanished would delete a noun from a
  // requirement and leave a sentence that still reads.
  assert.equal(rendered, `A ${missingTerm('organization')} is renamed`);
  assert.deepEqual(missing, ['organization']);
});

test('a Scenario Outline placeholder is left alone', () => {
  // Catches: choosing a marker syntax that collides with Gherkin's own. Outlines use <>,
  // which is why terms use braces.
  const { rendered } = renderTerms('Given a <role> viewing a {outlet}', TERMS);
  assert.equal(rendered, 'Given a <role> viewing a Store');
});

test('a manifest missing plural or description is refused', () => {
  const problems = validateTerms({ thing: { value: 'Thing' } });

  // Catches: a term defined in only the form one screen happens to use. That is the next
  // hard-coded plural, and a typed term registry would make it a compile error.
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => /missing "plural"/.test(p)));
  assert.ok(problems.some((p) => /missing "description"/.test(p)));
});

test('an authored derived form is refused by name', () => {
  const problems = validateTerms({
    thing: { value: 'Thing', plural: 'Things', description: 'x', lower: 'thing' },
  });
  assert.ok(problems.some((p) => /"lower" is derived and must not be authored/.test(p)));
});

const DOC = `
\`\`\`gherkin
@SHOP-OWNER-001 @status:derived @persona:Support staff
Scenario: A {outlet} must have an owner
  Given a new {outlet}
  Then the {outlet.lower} is refused without one
\`\`\`
`;

test('THE emitted binding key keeps the marker; only display renders', () => {
  const model = buildModel(parseDocument(DOC, 'a.md'), { terms: TERMS });
  const s = model.scenarios[0];

  // The test this whole feature turns on. `steps` is what a journey supplies bodies for,
  // so it must survive a rename untouched; `stepsDisplay` is what a caption and a reviewer
  // read. Emitting the rendered words as the key would make every rename a mechanical
  // sweep across every citing journey.
  assert.deepEqual(s.steps, ['Given a new {outlet}', 'Then the {outlet.lower} is refused without one']);
  assert.deepEqual(s.stepsDisplay, ['Given a new Store', 'Then the store is refused without one']);
  assert.equal(s.title, 'A {outlet} must have an owner');
  assert.equal(s.titleDisplay, 'A Store must have an owner');
});

test('renaming a term changes the display and not one binding key', () => {
  const before = buildModel(parseDocument(DOC, 'a.md'), { terms: TERMS });
  const after = buildModel(parseDocument(DOC, 'a.md'), {
    terms: { ...TERMS, outlet: { ...TERMS.outlet, value: 'Branch', plural: 'Branches' } },
  });

  assert.deepEqual(after.scenarios[0].steps, before.scenarios[0].steps);
  assert.notDeepEqual(after.scenarios[0].stepsDisplay, before.scenarios[0].stepsDisplay);
  assert.equal(after.scenarios[0].titleDisplay, 'A Branch must have an owner');
});

test('generation refuses a marker the glossary does not define', () => {
  const bad = DOC.replace('{outlet} must have an owner', '{organization} must have an owner');

  // Catches: shipping a sentinel into a consumer's typed module. Strict in the gate,
  // tolerant in the viewer - the page shows the marker so a reviewer can see it.
  assert.throws(() => buildModel(parseDocument(bad, 'a.md'), { terms: TERMS }), /unknown term\(s\) organization/);
});

test('the rendered module carries both forms', () => {
  const ts = renderTypeScript(buildModel(parseDocument(DOC, 'a.md'), { terms: TERMS }));
  assert.match(ts, /titleDisplay: 'A Store must have an owner'/);
  assert.match(ts, /stepsDisplay: \[/);
  assert.match(ts, /'Given a new \{outlet\}'/);
});

// The worked example in examples/glossary is a complete project the tool reads, so these run the
// actual pipeline over it rather than over a fixture invented for the test. If the example
// stops being a valid project, or the rules change under it, these go red - which is what
// stops a documented example rotting into something that no longer works.

test('the worked example is a valid glossary project', async () => {
  const { loadTerms } = await import('../src/terms.js');
  const { loadSettings } = await import('../src/config.js');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'glossary');
  const settings = await loadSettings(root);
  assert.equal(settings.terms, 'acceptance/terms.json');

  const { terms, found } = await loadTerms(join(root, settings.terms));
  assert.ok(found);
  // Every term carries what the format requires; loadTerms throws otherwise.
  assert.ok(Object.keys(terms).length >= 5);
  assert.equal(terms.vendor.casing, 'preserve');
  assert.equal(terms.premises.possessive, "Business'");
});

test('every marker in the worked example resolves', async () => {
  const { scanProject } = await import('../src/scan.js');
  const { loadTerms } = await import('../src/terms.js');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'glossary');
  const { scenarios } = await scanProject(root, 'example');
  const { terms } = await loadTerms(join(root, 'acceptance/terms.json'));

  assert.ok(scenarios.length >= 4, 'the example should hold several scenarios');
  for (const s of scenarios) {
    for (const text of [s.title, ...s.steps]) {
      const { missing } = renderTerms(text, terms);
      assert.deepEqual(missing, [], `${s.id}: ${text}`);
    }
  }
});

test('the worked example names its concepts rather than spelling them', async () => {
  const { scanProject } = await import('../src/scan.js');
  const { loadTerms, findSpelledTerms } = await import('../src/terms.js');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'glossary');
  const { scenarios } = await scanProject(root, 'example');
  const { terms } = await loadTerms(join(root, 'acceptance/terms.json'));

  // The example is what a correct document looks like, so it must survive its own rule: not
  // one sentence spells a word the glossary owns.
  const spelled = scenarios.flatMap((s) =>
    [s.title, ...s.steps].flatMap((t) => findSpelledTerms(t, terms).map((h) => `${s.id}: ${h.spelled}`))
  );
  assert.deepEqual(spelled, []);
});

test('a spelled term is found however it is cased, and never inside a marker', () => {
  const terms = { outlet: { value: 'Store', plural: 'Stores', description: 'x' } };

  // Catches the drift the glossary exists to prevent, on the day it is written.
  assert.deepEqual(findSpelledTerms('A Store must have an owner', terms), [
    { key: 'outlet', spelled: 'Store' },
  ]);
  assert.equal(findSpelledTerms('the store is refused', terms).length, 1);
  assert.deepEqual(findSpelledTerms('A {outlet} must have an owner', terms), []);
  // Whole words only: a term must not match inside a longer word.
  assert.deepEqual(findSpelledTerms('Restore the request', terms), []);
});
