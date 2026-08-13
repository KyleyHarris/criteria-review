// Emitting parsed criteria as an artefact a test suite can reference.
//
// WHY THIS EXISTS. The standard requires a journey's step names to be the scenario's
// own Given/When/Then wording, so a reviewer reads the same sentence the test proves.
// Typing those clauses into the test achieves that on the day it is written and makes
// two copies with nothing detecting an edit to either. Emitting them instead means the
// consumer references clauses rather than restating them: a reworded clause, a skipped
// clause, an invented step and a renamed id all become compile errors on the consumer's
// side. See docs/decisions.md D-003.
//
// TWO LAYERS, DELIBERATELY. `buildModel` produces language-neutral JSON; the renderers
// sit over it. The first consumer is TypeScript, but a standard whose only output binds
// to one language is not a standard, and retrofitting the neutral layer later would mean
// changing every consumer. See D-004.
//
// STRICT HERE, TOLERANT IN THE VIEWER. The parser accepts unfamiliar statuses and
// surfaces untagged scenarios as backlog, which is right for a review queue and wrong
// for something a build depends on. See D-005.

import { STATUSES, isUntracked } from './parse.js';
import { STANDARD_VERSION } from './version.js';
import { renderTerms } from './terms.js';

/** Raised with every problem found, rather than the first, so one run fixes them all. */
export class EmitError extends Error {
  constructor(problems) {
    super(
      `criteria cannot be emitted:\n` + problems.map((p) => `  - ${p}`).join('\n')
    );
    this.name = 'EmitError';
    this.problems = problems;
  }
}

/**
 * Build the neutral model from parsed scenarios.
 *
 * Refuses rather than degrades. A warning in a build log is not read, and silence is
 * the failure this standard exists to remove, so anything a machine can be definite
 * about is fatal here.
 *
 * NO TIMESTAMP IN THE OUTPUT, on purpose: a generated file that changes on every run
 * cannot be checked against the committed copy, which is how the gate detects that
 * someone edited a document and did not regenerate.
 */
export function buildModel(scenarios, options = {}) {
  const terms = options.terms ?? {};
  const problems = [];
  const untracked = [];
  const byId = new Map();

  for (const s of scenarios) {
    if (isUntracked(s)) {
      // No id means nothing can key on it and no test could cite it. Excluded rather
      // than rejected - these are the backlog the review queue exists to surface - but
      // counted, so the exclusion is never silent.
      untracked.push({ title: s.title, source: s.source, reason: !s.id ? 'no id' : 'no status' });
      continue;
    }

    if (!STATUSES.includes(s.status)) {
      problems.push(
        `${s.id} (${s.source}): unknown status "${s.status}". Expected one of ${STATUSES.join(', ')}`
      );
      continue;
    }

    // `verified` is a claim that a person watched this happen. Without the date and the
    // commit it was watched at, the claim cannot be checked or aged, so it is not one.
    if (s.status === 'verified' && (!s.verifiedOn || !s.commit)) {
      const missing = [!s.verifiedOn && '@verified:', !s.commit && '@commit:'].filter(Boolean);
      problems.push(`${s.id} (${s.source}): status verified requires ${missing.join(' and ')}`);
      continue;
    }

    if (!s.steps.length) {
      problems.push(`${s.id} (${s.source}): no Given/When/Then clauses`);
      continue;
    }

    const seen = byId.get(s.id);
    if (seen) {
      // The id is the join between the document, the journey and the API tests. Two
      // scenarios sharing one breaks every citation of it in both directions.
      problems.push(`${s.id}: defined twice, in ${seen.source} and ${s.source}`);
      continue;
    }

    // Rendered ALONGSIDE the raw clause, never instead of it. The raw text is the binding
    // key a journey supplies a body for, so it must survive a term rename untouched -
    // emitting the rendered words would turn every rename into a mechanical edit across
    // every citing journey, which is the churn a glossary exists to prevent. Display is
    // resolved here so captions, reports and videos read as the product does.
    const rendered = [s.title, ...s.steps].map((t) => renderTerms(t, terms));
    const unresolved = rendered.flatMap((r) => r.missing);
    if (unresolved.length) {
      problems.push(
        `${s.id} (${s.source}): unknown term(s) ${[...new Set(unresolved)].join(', ')}. ` +
          `Add them to the glossary, or fix the marker.`
      );
      continue;
    }

    const entry = {
      id: s.id,
      tag: `@${s.id}`,
      title: s.title,
      titleDisplay: rendered[0].rendered,
      feature: s.feature ?? null,
      status: s.status,
      persona: s.persona ?? null,
      verifiedOn: s.verifiedOn ?? null,
      commit: s.commit ?? null,
      intent: s.intent ?? null,
      steps: s.steps.slice(),
      stepsDisplay: rendered.slice(1).map((r) => r.rendered),
      source: s.source,
    };
    byId.set(s.id, entry);
  }

  if (problems.length) throw new EmitError(problems);

  // Sorted by id so the output does not churn when a document is reordered or a file
  // is renamed. A generated file that moves for reasons unrelated to its content makes
  // every diff unreadable and trains people to skip it.
  const emitted = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

  return {
    standardVersion: options.standardVersion ?? STANDARD_VERSION,
    scenarios: emitted,
    untracked,
  };
}

const HEADER = (model, sources) =>
  `// GENERATED by criteria-review from ${sources} acceptance document${sources === 1 ? '' : 's'}.\n` +
  `// DO NOT EDIT. Change the acceptance document and regenerate.\n` +
  `//\n` +
  `// Standard version ${model.standardVersion}.\n` +
  `//\n` +
  `// The keys below are the scenarios' own Given/When/Then clauses. A journey supplies a\n` +
  `// body per clause, so rewording one here breaks the journey that proves it rather than\n` +
  `// letting a test go on proving the previous requirement.\n`;

/** Escape a clause for a single-quoted TypeScript string literal. */
function lit(text) {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Render the model as a typed TypeScript module.
 *
 * `as const` is what makes this work: it narrows `steps` to a tuple of string literal
 * types, so a consumer can require exactly those keys and no others. Without it the
 * type is `string[]` and every guarantee here collapses to a runtime check nobody runs.
 */
export function renderTypeScript(model) {
  const sources = new Set(model.scenarios.map((s) => s.source)).size;
  const out = [HEADER(model, sources)];

  out.push(`export const STANDARD_VERSION = ${lit(model.standardVersion)};\n`);

  if (model.untracked.length) {
    // Present in the artefact rather than only on the console, so a consumer reading the
    // generated file sees the backlog it was not given.
    out.push(
      `// ${model.untracked.length} scenario(s) in the source documents carry no id or no status\n` +
        `// and are therefore not citable. They are the backlog, not an error.\n`
    );
  }

  out.push('export const SCENARIOS = {');
  for (const s of model.scenarios) {
    out.push(`  ${lit(s.id)}: {`);
    out.push(`    id: ${lit(s.id)},`);
    out.push(`    tag: ${lit(s.tag)},`);
    out.push(`    title: ${lit(s.title)},`);
    out.push(`    titleDisplay: ${lit(s.titleDisplay)},`);
    out.push(`    feature: ${s.feature === null ? 'null' : lit(s.feature)},`);
    out.push(`    status: ${lit(s.status)},`);
    out.push(`    persona: ${s.persona === null ? 'null' : lit(s.persona)},`);
    out.push(`    source: ${lit(s.source)},`);
    out.push(`    steps: [`);
    for (const step of s.steps) out.push(`      ${lit(step)},`);
    out.push(`    ],`);
    // Display strings for captions and reports. The KEYS above are what a journey binds to.
    out.push(`    stepsDisplay: [`);
    for (const step of s.stepsDisplay) out.push(`      ${lit(step)},`);
    out.push(`    ],`);
    out.push(`  },`);
  }
  out.push('} as const;\n');

  out.push(`export type ScenarioKey = keyof typeof SCENARIOS;`);
  out.push(`export type Clause<K extends ScenarioKey> = (typeof SCENARIOS)[K]['steps'][number];`);
  out.push('');

  return out.join('\n');
}

/** Render the model as the neutral artefact. Two-space JSON so a diff is readable. */
export function renderJson(model) {
  return JSON.stringify(model, null, 2) + '\n';
}

export const RENDERERS = { ts: renderTypeScript, json: renderJson };
