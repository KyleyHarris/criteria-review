# Playwright journeys

How a tier 1 scenario becomes an automated journey. The worked result is
[`05-example-journey.spec.ts`](05-example-journey.spec.ts).

The word **journey** rather than test is deliberate. A journey walks the route a person walks,
through the affordances a person has, and its output is watchable. A test that reaches the
same state by calling an endpoint and setting local storage proves the endpoint, which is
useful and is not this.

---

## 1. The criteria are generated into the journey, never retyped into it

A journey proves a named scenario, and its steps are that scenario's own Given / When / Then
wording. The obvious way to achieve that is to type the clauses into the spec as step names,
and it is the wrong way: it makes two copies of every clause, and nothing detects an edit to
either one. Delete one step and the suite stays green while claiming to prove a four clause
scenario. The rule "if the wording diverges, the document is right and the spec is the defect"
is then held in place by care alone, on the one artefact where care is what already failed.

So the clauses are **generated** from the acceptance documents and referenced by the spec.

`criteria-review generate` parses every fenced ` ```gherkin ` block and emits one committed
module. The full contract, the gate wiring, and what generation refuses are in
[`emit-contract.md`](emit-contract.md):

```ts
// GENERATED from acceptance/**/*.md - do not edit.
export const SCENARIOS = {
  'LOCK-OPEN-001': {
    id: '@LOCK-OPEN-001',
    title: "The cashier's own PIN resumes their session in place",
    status: 'derived',
    persona: 'Cashier',
    steps: [
      "Given the register was locked during a cashier's shift",
      'When that cashier enters their own PIN',
      'Then they are returned to the till',
      'And the same shift is still open, not a new one',
      'And the cart they had open is still there',
    ],
  },
} as const;
```

The spec supplies a body per clause, keyed by the clause itself:

```ts
journey('LOCK-OPEN-001', { useCase: '...', context: '...' }, {
  "Given the register was locked during a cashier's shift": async ({ page }) => { ... },
  'When that cashier enters their own PIN':                 async ({ page }) => { ... },
  'Then they are returned to the till':                     async ({ page }) => { ... },
  'And the same shift is still open, not a new one':        async ({ page }) => { ... },
  'And the cart they had open is still there':              async ({ page }) => { ... },
});
```

The binding is a few lines of support code, and the type system does the rest:

```ts
type Key = keyof typeof SCENARIOS;
type Clause<K extends Key> = (typeof SCENARIOS)[K]['steps'][number];

export function journey<K extends Key>(
  key: K,
  brief: { useCase: string; context: string },
  steps: { [C in Clause<K>]: (ctx: { page: Page }) => Promise<void> }
): void {
  const s = SCENARIOS[key];
  test(`${s.id} ${s.title}`, async ({ page }) => {
    await showTitleCard(page, { scenarioId: s.id, persona: s.persona, ...brief });
    // Order comes from the DOCUMENT, not from the object literal.
    for (const clause of s.steps) {
      await narratedStep(page, clause, () => steps[clause]({ page }));
    }
  });
}
```

What that makes structural rather than conventional:

- **One copy of every clause.** Reword a `Then` in the document and the spec stops compiling:
  the old key no longer exists, and the new one is missing. The document being right and the
  spec being the defect is now the compiler's opinion, not a habit.
- **A clause cannot be skipped.** A missing property is a type error. Otherwise a journey can
  quietly prove three of a scenario's five clauses and report green.
- **A step the document does not have cannot be added.** Excess property error. That closes the
  reverse drift, which a text comparison would not have caught at all.
- **Renaming or deleting a scenario id breaks the build at the citation**, rather than
  orphaning it silently.
- **The coverage map is exact and free.** Referenced keys are the covered set; every other key
  is uncovered. No hand maintained traceability table.
- **Step order comes from the document**, so a spec cannot assert `Then` before `When`.
- **The video index stops being retyped.** Id, title and persona come from the generated data.

The first four were verified against real emitted criteria with a real typecheck rather than
reasoned about: a reworded clause and an invented step are `TS2353`, a skipped clause is
`TS2345` naming the missing property, and an unknown scenario id is `TS2345` against the key
union. The correct consumer compiles clean.

Deliberately **not** the classic behaviour-driven setup: there is no shared step library and no
expression matching, so steps stay specific to one scenario and keep the near 1:1 clause to
assertion mapping. Reusable steps get written vaguely, vague steps destroy that mapping, and
that is the failure mode this design cannot reach.

Two honest costs. **Editing an acceptance document now breaks the build**, which is the feature,
but it does mean a wording change during review reds the suite until the spec catches up.
**A generated file has to stay fresh**: regenerate it in the verification gate and fail if the
output changed, the same shape as a formatting check.

**Setup that is not a clause needs an escape hatch**, spelled differently on purpose so it
reads as non-criteria in the recording and never becomes the default:

```ts
await aside(page, 'signing in as the cashier', async () => { ... });
```

A file header comment says what the journey would catch if it went red. If that sentence is
hard to write, the journey is probably asserting that the software does what the software
does.

**What this does not fix.** A required clause can still be satisfied by a body with no
assertion. That is a separate and cheaper piece of work: a lint finding on a `Then` or trailing
`And` body containing no assertion at all.

## 2. Selector precedence

Prefer the selector that survives a refactor and needs no production change. Work down this
list and stop at the first level that identifies the element.

**Level 1. Role and accessible name.** `getByRole('button', { name: 'Sign in' })`,
`getByLabel('Email')`. This is the default and covers most of an application.

A selector at this level is also an accessibility assertion. If it stops resolving, the
element has usually lost its accessible name, which is a real defect rather than a test
maintenance chore. That is a property no other selector strategy has.

Worth proving once per component library rather than assuming: with a web component library
that renders into an open shadow root, Playwright pierces the shadow boundary, so a labelled
input resolves by label and by role, fills, and reads back with no attribute plumbing added to
production code.

**Level 2. Custom element tag, existing id, or href.** `page.locator('shop-day-bar')`,
`page.locator('[href="/sales/new"]')`. Component tags are stable, already exist, and read as
documentation.

**Level 3. `data-testid`, only where 1 and 2 cannot identify the element.** In practice that
means dynamic collections and repeated controls with no distinguishing accessible name:

```
till-menu-tile-${itemId}
till-cart-line-${index}
till-qty-plus-${index}
```

Pattern: `<area>-<element>[-<key>]`.

Rules:

- **Never CSS classes in spec code.** Classes are styling, and styling churns.
- **Add a test id only when levels 1 and 2 genuinely fail**, and say why in the spec or page
  object. No speculative sprinkling.
- A test id a spec needs ships **in that spec's own change**, not behind a separate landing
  change first.

**Why a precedence and not a blanket test-id mandate.** I have shipped the mandate version and
watched it fail. A rule that every selector must be an attribute the application does not yet
have makes a production edit a precondition for writing any test at all, so three specs sat
skipped behind an attribute change that never landed, while the screens they targeted already
carried usable labels the whole time. It also inverts Playwright's own guidance, which puts
user facing attributes first and test ids last.

## 3. Getting to the starting state

Two rules, and the tension between them is real.

**Seed through the API, drive through the UI.** Setting up an account, a shop, a product
catalogue and an open shift through the interface costs a minute of wall clock per test and
makes every journey fail whenever an unrelated screen changes. The journey seeds its
preconditions with the same API a client would call, then drives the part it is actually
proving.

**Except where the setup is the thing being proved.** Sign in gets driven through the sign in
screen, in the journey about signing in, on purpose.

**And at least one chain does the whole thing from nothing.** Register, create the shop, add a
product, open a shift, ring a sale, close the shift, read the end of day report, with no saved
session anywhere. On a system built from an empty database, a saved session assumes exactly
the thing that has not been proven, and a first run onboarding defect is invisible to every
other journey in the suite.

**Fresh entities per spec, never shared fixtures.** Each spec creates its own user with a
unique email and its own shop, which makes the suite parallel safe with no cleanup step and no
ordering coupling. Shared seed data is the single most common cause of a suite that passes
alone and fails together.

## 4. Page objects hold selectors and semantic methods

```ts
export class TillPage {
  constructor(private readonly page: Page) {}

  // Level 1: the tile carries the product name as its accessible name.
  productTile(name: string) {
    return this.page.getByRole('button', { name });
  }

  // Level 3, and here is why: cart lines are a dynamic collection whose only distinguishing
  // text is the product name, which repeats when the same item is added at two prices.
  cartLine(index: number) {
    return this.page.getByTestId(`till-cart-line-${index}`);
  }

  async addToCart(name: string) { ... }
  async payCash(amount: number) { ... }
}
```

The methods are named for what a person does, not for what the DOM does. A journey that reads
`await till.payCash(20)` stays readable when the payment screen is redesigned; one that reads
`await page.getByTestId('pay-2').click()` does not.

## 5. Assert the outcome the criteria name, then verify the side effect

The `Then` clauses are the assertions. Where a clause names something the interface does not
show, verify it through the API in the same journey:

```ts
'And the same shift is still open, not a new one': async ({ page }) => {
  await expect(till.shiftBadge).toHaveText(/Shift open/);

  // The interface shows "open" but not WHICH shift, and the whole point of this criterion is
  // that it is the same one. The id is only observable through the API.
  const shift = await api.currentShift(shopId);
  expect(shift.id).toBe(shiftIdBeforeLock);
},
```

That is a deliberate exception to "assert what a user can observe". A criterion whose whole
content is an identity has to be checked where the identity is visible, and a comment says so.

## 6. Every journey is observed failing

A journey never seen red is not evidence. Break the behaviour it guards, watch it go red **on
the assertion it exists for** rather than in setup, restore, and record the mutation in the
file:

```ts
// Proved red by removing the same-shift guard in the unlock handler: this journey failed on
// the "same shift is still open" assertion, not on setup.
```

This is the manual stand in for mutation testing. Inventing a plausible mutation is a far
higher bar to bluff than a tick in a box.

## 7. Config choices that matter

- **No `test.only` reaching the pipeline.** `forbidOnly: !!process.env.CI`.
- **Retries in the pipeline only.** Local retries hide flake from the person who can still
  remember what they changed.
- **Trace on first retry, screenshot on failure.** The trace is the artefact that makes a
  failed run diagnosable without reproducing it.
- **Bound every action.** An `actionTimeout` makes a stuck locator fail by name instead of
  silently consuming the whole test budget and reporting a useless timeout.
- **The server lifecycle belongs to the runner.** Having Playwright start the application
  under test is what makes an unattended pipeline run viable; a suite that assumes a developer
  already has three terminals open only ever runs on that developer's machine.
- **A dedicated port per checkout.** A suite that collides with a running dev server, or with
  another checkout's run, produces failures that teach nothing.

## 8. Watch mode and video, inert in the authoritative run

The strongest evidence in the system is a video, because a test count is a claim about the
software and a video is the software. But raw footage of a fast headless run teaches nobody:
it is a silent flicker of screens.

Three things turn footage into something a person can learn from, all enabled by an
environment variable and **all inert in the authoritative run**, so the recorded artefact and
the gating artefact are the same code path:

1. **A title card before the journey**, naming the persona, the goal and the situation, in the
   words of a person rather than a test name.
2. **The step name on screen while the step runs.** The caption is the step name, which is the
   scenario's own wording, generated from the document rather than retyped, so what a viewer
   is told and what the journey proves are the same string and no second copy exists that
   could drift.
3. **A hold after each step**, long enough to read the outcome. Slow motion paces actions and
   the outcome is an assertion, so pacing alone never gives the viewer time to see the result.

The cards are painted from the test side rather than added as a route in the application, so a
demonstration affordance never becomes part of the product's real surface.

**The mapping from video to scenario id is load bearing.** A video not tied to a named
scenario is just a recording, and the reader cannot tell what it is meant to prove. The
package reads as `@LOCK-OPEN-001, the cashier's own PIN resumes their session in place, video`.

## 9. Adding a journey: the recipe

1. Pick the scenario. If there is no scenario, write one first. Automation follows the
   acceptance layer, never the other way around.
2. Walk the flow by hand and note the elements. Reach for role and accessible name first.
3. Add or extend a page object with semantic methods.
4. Regenerate the scenario module, then write the spec against `journey('<ID>', ...)` and let
   the type error list the clauses you owe a body. Seed through the API, drive the part under
   test through the interface.
5. If a control genuinely cannot be reached by role, name, tag or href, add a `data-testid` in
   the same change as the spec, and note why the earlier levels failed.
6. Break the behaviour, watch it go red on the right assertion, restore, record the mutation.
7. Nothing to update by hand: the coverage map is the set of referenced keys.

## 10. What I do not do

- **No CSS class selectors, and no XPath.** Both encode structure that is free to change.
- **No fixed sleeps.** Wait on the condition. A sleep is a guess that becomes flake on a
  slower machine and dead time on every run.
- **No conditional assertions.** `if (await x.isVisible()) expect(...)` is a test that passes
  when the thing it checks is absent. If the state is genuinely optional, that is two
  scenarios.
- **No journey that depends on another journey's leftovers**, except in a chain that is
  declared as a chain and named in order.
- **No `expect(true)`, and no assertion on something the journey itself just set.** If a
  journey cannot go red, it is worse than no journey, because it reports safety that does not
  exist.
