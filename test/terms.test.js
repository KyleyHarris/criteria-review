import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTerms, variantOf, validateTerms, missingTerm } from '../src/terms.js';
import { buildModel, renderTypeScript } from '../src/emit.js';
import { parseDocument } from '../src/parse.js';

// What these guard: a glossary exists so a product can rename a word without every document
// and every test having to be edited. The failure that would destroy that is emitting the
// RENDERED words as the binding key - a rename would then change every clause key, break
// every citing journey, and cost exactly the mechanical sweep the glossary was built to
// prevent. The last test here is the one that matters.

const TERMS = {
  loginGroup: {
    value: 'Company',
    plural: 'Companies',
    description: 'The organisation a login belongs to',
  },
  vendor: { value: 'iMIS', plural: 'iMIS systems', description: 'The membership system', casing: 'preserve' },
  glass: { value: 'Glass', plural: 'Glasses', description: 'A pane', possessive: "Glass'" },
};

test('only value and plural are authored; the rest derive', () => {
  assert.equal(variantOf(TERMS.loginGroup, 'value'), 'Company');
  assert.equal(variantOf(TERMS.loginGroup, 'plural'), 'Companies');

  // Catches: an authored lowercase, which is where drift reappears inside a single term -
  // change value, forget the sibling, and the exercise fails at the smallest possible scale.
  assert.equal(variantOf(TERMS.loginGroup, 'lower'), 'company');
  assert.equal(variantOf(TERMS.loginGroup, 'lowerPlural'), 'companies');
  assert.equal(variantOf(TERMS.loginGroup, 'possessive'), "Company's");
});

test('casing: preserve stops a proper noun being lower-cased', () => {
  // Catches: rendering "imis". Capitalisation is part of some words' identity, and no
  // compiler catches a lower-cased proper noun.
  assert.equal(variantOf(TERMS.vendor, 'lower'), 'iMIS');
  assert.equal(variantOf(TERMS.vendor, 'lowerPlural'), 'iMIS systems');
});

test('an authored possessive overrides the derivation', () => {
  // Catches: forcing "Glass's" where the house style is "Glass'". English disagrees with
  // itself after a trailing s, so this is the one authored form that may exist.
  assert.equal(variantOf(TERMS.glass, 'possessive'), "Glass'");
});

test('markers render, including variants', () => {
  const { rendered, missing } = renderTerms(
    'A {loginGroup} owns its {loginGroup.lower} sites and {loginGroup.plural} elsewhere',
    TERMS
  );
  assert.equal(rendered, 'A Company owns its company sites and Companies elsewhere');
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
  const { rendered } = renderTerms('Given a <role> viewing a {loginGroup}', TERMS);
  assert.equal(rendered, 'Given a <role> viewing a Company');
});

test('a manifest missing plural or description is refused', () => {
  const problems = validateTerms({ thing: { value: 'Thing' } });

  // Catches: a term defined in only the form one screen happens to use. That is the next
  // hard-coded plural, and the application-side registry makes it a compile error.
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
@CO-TYPES-001 @status:derived @persona:Support staff
Scenario: A {loginGroup} must have an owner
  Given a new {loginGroup}
  Then the {loginGroup.lower} is refused without one
\`\`\`
`;

test('THE emitted binding key keeps the marker; only display renders', () => {
  const model = buildModel(parseDocument(DOC, 'a.md'), { terms: TERMS });
  const s = model.scenarios[0];

  // The test this whole feature turns on. `steps` is what a journey supplies bodies for,
  // so it must survive a rename untouched; `stepsDisplay` is what a caption and a reviewer
  // read. Emitting the rendered words as the key would make every rename a mechanical
  // sweep across every citing journey.
  assert.deepEqual(s.steps, ['Given a new {loginGroup}', 'Then the {loginGroup.lower} is refused without one']);
  assert.deepEqual(s.stepsDisplay, ['Given a new Company', 'Then the company is refused without one']);
  assert.equal(s.title, 'A {loginGroup} must have an owner');
  assert.equal(s.titleDisplay, 'A Company must have an owner');
});

test('renaming a term changes the display and not one binding key', () => {
  const before = buildModel(parseDocument(DOC, 'a.md'), { terms: TERMS });
  const after = buildModel(parseDocument(DOC, 'a.md'), {
    terms: { ...TERMS, loginGroup: { ...TERMS.loginGroup, value: 'Firm', plural: 'Firms' } },
  });

  assert.deepEqual(after.scenarios[0].steps, before.scenarios[0].steps);
  assert.notDeepEqual(after.scenarios[0].stepsDisplay, before.scenarios[0].stepsDisplay);
  assert.equal(after.scenarios[0].titleDisplay, 'A Firm must have an owner');
});

test('generation refuses a marker the glossary does not define', () => {
  const bad = DOC.replace('{loginGroup} must have an owner', '{organization} must have an owner');

  // Catches: shipping a sentinel into a consumer's typed module. Strict in the gate,
  // tolerant in the viewer - the page shows the marker so a reviewer can see it.
  assert.throws(() => buildModel(parseDocument(bad, 'a.md'), { terms: TERMS }), /unknown term\(s\) organization/);
});

test('the rendered module carries both forms', () => {
  const ts = renderTypeScript(buildModel(parseDocument(DOC, 'a.md'), { terms: TERMS }));
  assert.match(ts, /titleDisplay: 'A Company must have an owner'/);
  assert.match(ts, /stepsDisplay: \[/);
  assert.match(ts, /'Given a new \{loginGroup\}'/);
});
