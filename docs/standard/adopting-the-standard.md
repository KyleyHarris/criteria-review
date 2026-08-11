# Adopting the standard in a project

What a project does to conform. Written for a project that already has acceptance documents and
a Playwright suite; a greenfield project does the same steps with nothing to convert.

The order matters. Each step leaves the suite green, so adoption can stop at any point without
leaving a repository half-migrated.

---

## 1. Point the project's own documents at the standard

Any local file that restates the format, the tag vocabulary, the status ladder or the lifecycle
becomes a pointer. Keep only what is genuinely this project's own: its catalogue of engineering
obligations instantiated for its domain, its coverage map, its sign-off arrangements.

Grep for every reference to the document that used to be the authority and repoint it, in one
change. A pointer that still names the old owner is worse than none, because a reader who
follows it finds a document that no longer claims to be true.

**Do this first.** Authority without enforcement is a source of truth nothing validates against,
but enforcement pointing at a document that still disclaims ownership is incoherent to whoever
reads it next.

## 2. Wire generation

Add a script beside the project's other generators, so it is discovered the way they are:

```json
"gen:scenarios": "criteria-review generate . --out tests/e2e/support/scenarios.generated.ts",
"gen:scenarios:check": "criteria-review generate . --out tests/e2e/support/scenarios.generated.ts --check"
```

Then three call sites, each doing a different job:

- **Before the test run** - the write form, so a developer never runs a suite against stale
  clauses.
- **The verification gate** - the `--check` form, so an edited document with a stale artefact
  fails the build.
- **Continuous integration** - the `--check` form again, on a machine nobody can wave through.

Commit the generated file. A consumer must build and test without this tool installed.

Run it once and read the output. The untracked count is the project's real backlog, and it is
usually larger than expected.

## 3. Add the binding

Two functions, in the suite's own support directory:

```ts
import { test } from '@playwright/test';
import { SCENARIOS } from './scenarios.generated';

export type ScenarioKey = keyof typeof SCENARIOS;
export type Clause<K extends ScenarioKey> = (typeof SCENARIOS)[K]['steps'][number];

export function journey<K extends ScenarioKey>(
  key: K,
  brief: { useCase: string; context: string },
  steps: { [C in Clause<K>]: (ctx: Ctx) => Promise<void> }
): void {
  const s = SCENARIOS[key];
  test(`${s.id} ${s.title}`, async (ctx) => {
    await showTitleCard(ctx.page, { scenarioId: s.id, persona: s.persona, ...brief });
    // Order comes from the DOCUMENT, not from the object literal.
    for (const clause of s.steps) await narratedStep(ctx.page, clause, () => steps[clause](ctx));
  });
}

/** Setup that is not a clause. Spelled differently so it reads as non-criteria. */
export async function aside(page: Page, what: string, body: () => Promise<void>): Promise<void>;
```

**`journey()` must coexist with hand-written `test()`.** Conversion then proceeds file by file
with the suite green throughout. A binding that requires converting everything at once produces
one enormous change against a gating suite, which is the one shape to refuse.

**Prove the passthrough before converting anything.** Most suites have `test.use`, `test.skip`
and `beforeEach` in their citing files, and at least one of them is usually load-bearing. If
`journey()` cannot carry them, conversion stalls on the first file, so establish it first.

## 4. Convert one file as a pilot

Pick a file whose step names already match its document exactly, so any compile error during
conversion is the binding's fault rather than a pre-existing divergence. Get the suite green,
then convert the rest.

Mechanically, each `narratedStep(page, 'X', body)` becomes a `'X': body` entry in the object
literal. The bodies do not change.

## 5. Expect the first regeneration to find real divergence

A suite that has been maintained by hand will have some drift. Each one is a genuine finding:
the document and the test disagreed and nobody knew. Fix the **test** unless the document is
wrong, and where the document is wrong, say so in the review queue rather than quietly editing
the requirement to match the software.

## What changes about day-to-day work afterwards

Editing an acceptance document breaks the build of any journey citing it. That is the feature,
and it is worth saying out loud to whoever reviews criteria: their wording change is no longer
free. The alternative is an amended requirement and a test still proving the old one, with
nothing on screen to say so.
