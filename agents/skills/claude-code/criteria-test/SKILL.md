---
name: criteria-test
description: Build the automated journey for a scenario that has none, learning the real behaviour by driving the running application in the browser rather than by reading the code. Generates the scenario module, binds the journey to the criterion's own clauses, proves the test can fail, and raises a flag rather than editing the criterion when the software disagrees with it. Use when the architect says "write the test", "build the journey", "cover these scenarios", or a plan item is a criterion with no journey.
---

# Build the journey for a criterion

Turning a scenario into a journey that proves it. **The criterion is the requirement; the
journey is an attempt to prove it.** Nothing here may change the first to satisfy the second.

---

## Why this drives the app rather than reading the code

`criteria-backfill` learns by reading. If the journey learned the same way, it would agree with
the criterion by construction and could never disagree with the software - which is the entire
point of having it.

So this skill **runs the thing.** Open the application in the browser, perform the journey by
hand first, and learn the real behaviour: what the screen actually says, which control is
actually reachable, what happens on the refusal path. Reading the source is for finding the
seam when the interface is ambiguous, not for deciding what the software does.

Load the browser skill and drive the real application. Two rules while you do:

- **Never enter real credentials.** Seed a user through the API and use that.
- **Never trigger a native dialog** (`alert`, `confirm`). They block automation and the session
  stops responding.

## 1. Know which scenario, and read it whole

```bash
npx criteria-review plan next          # the next outstanding one in the plan
npx criteria-review show <ID>          # or a named one, in full
```

Read every clause. The `Then` clauses are the assertions you owe; the count is not negotiable.
Note the intent line: **a criterion marked `INFERRED` has not been confirmed by anyone**, and
building a test for it hardens a guess. Say so and offer to run `criteria-lookup` on it first.

## 2. Generate before you bind

```bash
npx criteria-review generate . --out <the project's emit path>
```

The journey does not retype the clauses - it references them, so the document and the test
cannot hold two versions of the same sentence. If the document changed and this was skipped,
you are about to write a test against the previous requirement.

## 3. Walk it by hand in the browser

Before writing a line: perform the scenario as the persona would, and record what you learn.

- **What the affordance actually is.** Not what the code suggests: what a person clicks.
- **The accessible name of each control**, because that is the selector you want.
- **What the software really does on each `Then`.** Especially refusals - the message wording,
  whether the control is disabled or absent, whether state changed underneath.
- **Where it disagrees with the criterion.** Do not correct anything yet. Write it down.

## 4. Write the journey

Follow the standard's journey rules (`criteria-review guide`, and section 4 of the standard).
The ones that matter most here:

- **Bind, do not retype.** `journey('<ID>', intro, { '<clause>': async ... })`, one body per
  clause, order coming from the document.
- **Selector precedence**: role and accessible name first, then element tag or href, and
  `data-testid` only where those genuinely cannot identify the element - with a note saying why.
- **Seed through the API, drive through the interface.** Preconditions that are not what the
  scenario is about should not be clicked through; setup that is not a clause goes in `aside()`
  so a viewer can tell arrangement from requirement.
- **Assert what the criterion says**, including the negative clauses. Where a clause names
  something the interface does not show, verify it through the API and say in a comment why.
- **A file header naming what the journey would catch** if it went red. If that sentence is hard
  to write, the journey is probably asserting that the software does what the software does.

## 5. Prove it can fail

A journey never seen red is not evidence.

Break the behaviour it guards - in the **product**, not in the test - watch it fail **on the
assertion it exists for** rather than in setup, restore, and record the mutation in the file:

```ts
// Proved red by removing the same-shift guard in the unlock handler: this journey failed on
// the "same shift is still open" assertion, not on setup. Observed 2026-08-13 at <sha>.
```

Mutating the test instead proves nothing about the software. If a mutation cannot be found that
turns it red, the journey is asserting a tautology and should be rewritten.

## 6. When the software disagrees with the criterion

This is the valuable outcome, and the one to handle carefully.

**Do not edit the criterion.** Not the wording, not a clause, not "just to make it match what
it does". A criterion quietly rewritten to agree with the code is the exact failure this whole
system exists to prevent, and it is invisible afterwards.

Raise it where the architect will see it, as a question:

```bash
npx criteria-review ask <ID> --message "DRIFT: the criterion says <clause>; running it, the app <what it does>. Which way should this resolve?" --as claude
```

That raises `@looknow`. Then move to the next scenario. The two resolutions - write the code to
match, or write the test to match the code - are the architect's call, and `criteria-lookup`
is where they make it.

**Never promote a status.** Not `verified` - that claims a person watched it happen, and you are
not a person. A green journey is evidence for the architect, not a decision.

## 7. Report

```
LOCK-OPEN-001  journey written, green, proved red by <mutation>
CASH-CLOSE-003 journey written, RED - the app does not do this; raised @looknow
SHIFT-HAND-004 not attempted - the criterion is INFERRED and unconfirmed
```

**Place it in the walkthroughs before reporting done.** A scenario nobody placed is absent
from what a customer is shown, and nothing announces it. `criteria-review present place <ID>`
recommends where; the person who wrote it decides, and QA confirms. This is stage 6a of the
definition of done, not a courtesy.

Say which are green, which are red and why, and which you did not attempt. A skill that reports
only its successes is worth less than one that reports nothing, because it teaches the reader
the list is complete.
