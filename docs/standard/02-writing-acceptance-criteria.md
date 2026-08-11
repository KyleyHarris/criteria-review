# Writing user stories and acceptance criteria

How a tier 1 document is authored. The worked result is
[`03-example-acceptance-document.md`](03-example-acceptance-document.md); this file is the
rules behind it.

---

## File layout

One folder per area, one document per area:

```
acceptance/
  till-lock/
    till-lock-acceptance.md
  shift-lifecycle/
    shift-lifecycle-acceptance.md
```

An area is a thing a user would name, not a code module. "Locking the till" is an area.
"SessionController" is not.

## Document anatomy

Each document carries these, in this order. The order is deliberate: a reader who stops after
two minutes should have the scope, the confidence level, and who it concerns.

1. **Title and scope.** One sentence naming what is in and what is deliberately out.
2. **Sourcing note.** Whether the intent behind this document was stated by someone who owns
   it, or inferred from the software. This is the first thing a reviewer needs, because it
   sets how hard they have to look.
3. **Status summary.** The overall confidence of the document, and the key to what the
   statuses mean.
4. **Roles table.** Every actor who appears, and what they do in this area. Actors who must be
   refused belong here too.
5. **User stories with acceptance criteria.** Prose. The why.
6. **Gherkin scenarios.** The individually citable, individually testable units.

## User stories

Standard form, and the third clause is the one that carries the weight:

> **As a** cashier taking a short break, **I want** to lock the register, **so that** nobody
> can ring up a sale, open the drawer, or read reports as me while I am gone.

Rules I hold myself to:

- **The "so that" is the requirement.** "As a user I want a lock button so that I can lock the
  screen" is circular and says nothing a test could disagree with. The example above names a
  threat, and that is what the criteria have to meet.
- **Acceptance criteria under a story are prose, not steps.** They state a property that must
  hold, at a level that survives a redesign of the screen. "Locking de-authorises the identity
  immediately, rather than merely hiding the screen" is a property. "Clicking Lock shows the
  PIN pad" is a step, and belongs in a scenario.
- **A story that generates no scenario is not a story.** It is a heading. Delete it or find
  the behaviour it implies.

## Scenario format

Scenarios live in fenced ` ```gherkin ` blocks, grouped under a `### Feature:` heading, and
each carries a tag line:

```gherkin
@LOCK-OPEN-001 @status:derived @persona:Cashier
Scenario: The cashier's own PIN resumes their session in place
  Given the register was locked during a cashier's shift
  When that cashier enters their own PIN
  Then they are returned to the till
  And the same shift is still open, not a new one
```

### The id

`@<AREA>-<THING>-<NNN>`, and **stable forever**. It is the join between this document, the UI
journey that proves it, and the API tests that cover it. Renaming one orphans its citations,
which the citation check reports as a finding rather than letting it pass silently.

Ids are never reused after a scenario is deleted. A deleted id stays dead, so an old video or
an old report can never quietly point at a different requirement than the one it was recorded
against.

### The tags

| Tag | Meaning |
|---|---|
| `@status:proposed` | Written at planning, before the software exists. A proposal, not a description. |
| `@status:derived` | Written up from the delivered software. Describes what it appears to do. |
| `@status:verified` | A human watched the software do it. Requires `@verified:` and `@commit:`. |
| `@status:accepted` | Confirmed as what the software should do. |
| `@verified:YYYY-MM-DD` | Date of the observation. |
| `@commit:<sha>` | The commit it was observed at. |
| `@persona:<actor>` | Whose point of view the scenario is written from. |

`@persona:` is not decoration. A scenario with two personas in it is two scenarios, and
splitting them is usually where a missing permission case turns up.

### Intent provenance

A comment above the block, naming where the intent came from:

```markdown
<!-- intent: design-notes/till-lock.md, section 4 - "lock clears the stored token, it is not a UI overlay" -->
```

```markdown
<!-- intent: INFERRED from implementation - needs confirmation -->
```

An intent counts as sourced only if it **cites** something: a document, a decision record, an
issue, a dated conversation with the person who owns the decision. Prose that merely discusses
intent is unsourced, deliberately. The implementation is never a source of intent.

## Writing the clauses

- **One actor, in their language.** No route paths, no component names, no HTTP status codes,
  no table names. If the sentence cannot be read aloud to the person who asked for the
  feature, it is in the wrong tier.
- **`Then` clauses are assertions in prose**, and should map close to 1:1 onto test
  assertions. That mapping is the whole reason a side by side review takes seconds.
- **Assert the observable outcome, not the mechanism.** "The shift is still open" is
  observable. "The shift record's `EndedUtc` is null" is a mechanism, and it couples the
  document to a schema that will change.
- **Negative outcomes are stated, not implied.** "And the drawer does not open" is a clause. A
  scenario that only lists what happens leaves the reviewer unable to tell whether the
  absence was designed or forgotten.
- **Edge cases get their own scenario and their own id.** A bullet list at the bottom of a
  file headed "edge cases" is a list of things nobody automated. A wrong PIN, a lockout
  countdown, an expired voucher, a plan tier that hides a button: each one is an ordinary
  scenario.
- **One scenario, one reason to fail.** If a scenario would go red for three unrelated
  reasons, the report will not tell you which, and it will get muted rather than fixed.

## What does not belong in this layer

Engineering obligations. Partial writes, idempotency under retry or message redelivery,
optimistic concurrency races, audit ordering, malformed input, boundary values. Those are real
and must be tested, but no operator will ever describe them, and putting them here buries the
business intent that this layer exists to make reviewable.

They live in the tier 2 catalogue and are cited by API tests directly. See
[`06-engineering-obligations.md`](06-engineering-obligations.md).

## The review loop

The document is not finished when it is written. It is finished when someone who owns the
intent has moved each scenario off `derived`.

That review has to be cheap or it will not happen, so:

- **Scoped.** Only the scenarios this piece of work touches, never the whole document.
- **Diff shaped.** What changed since the reviewer last looked, not the current state. An
  unchanged scenario is not shown again.
- **The status ladder is the queue.** `accepted` drops out of view. What remains is the
  unsettled surface.
- **Every item carries one specific ask**, confirm, adjust, or defer. An item with no ask is
  not shown.
- **Small batches, riskiest first.** A review point with more than a handful of items splits
  rather than truncates, and what was deferred is named rather than dropped.
- **The presentation is the edit surface.** A review that can only be accepted or rejected
  wastes the reviewer's attention. They must be able to amend the wording, split a scenario,
  retire it, or change its status in place, and the amendment has to flow back into the
  document rather than into a chat log.

**Rewording a clause breaks the journey that proves it, on purpose.** The journeys take their
step text from this document by generation rather than by copy, so an amendment here produces
a compile error there rather than a silent divergence. That makes the reviewer's edit cost
something, which is the correct price: the alternative is an amended requirement and a test
still proving the old one, with nothing on screen to say so.

I run that loop through a small local tool that reads every acceptance document, shows the
ones still needing a decision, plays the recorded journey beside each, and writes the outcome
back into the markdown. The mechanism matters less than the property it enforces: the review
happens against the artefact, and the artefact is what gets updated.

## Where a scenario states wanted behaviour the software does not have

Write it anyway, mark it, and say so in the block comment:

```markdown
<!-- intent: stated by the product owner 2026-08-09. This scenario states the WANTED
     behaviour, which the implementation does not currently do. -->
```

This is the single most valuable thing the layer produces, and it only happens if writing a
criterion that disagrees with the software is normal rather than awkward. A document that
agrees with the software everywhere was derived, not sourced.
