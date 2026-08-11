# The QA approach

The standard the rest of this pack implements. It is about connection, evidence and
enforcement rather than about adding rules, because reminders do not work: the rules that
failed me were already written down, already in front of me, and were read and then not
applied.

---

## 1. The constraint that shapes it

On a small team, and especially where one person designs and another executes, there is often
no peer who can challenge a claim. That makes **every claimed verification unfalsifiable
unless it produces an artefact somebody can inspect without redoing the work.**

That single sentence is why this standard is about evidence and traceability, and why the
cheapest artefact in the system is a two minute video rather than a paragraph asserting that
something was checked.

It has bitten me concretely. A feature branch once shipped documented, implemented, and with
every one of its nine manual test cases green, while the capability it described was
unreachable in the running product. The finding came from reading the server by hand. The QA
layer as it stood could not have produced it, because every test agreed with the software and
nothing in the process asked whether the software agreed with the intent.

---

## 2. Two tiers, split by readership

The split is by **who reads it**, and that is what keeps it honest.

**Tier 1, business acceptance.** Per actor, in the language of the person who wanted the
software. Ring up a sale, lock the till, hand over a shift, read the end of day report. No
concurrency, no retry semantics, no HTTP status codes. This is the tier a customer or product
owner reads and confirms.

**Tier 2, engineering obligations.** Partial writes, idempotency under retry and message
redelivery, optimistic concurrency races, audit ordering, malformed input, boundaries. Real,
mandatory, and invisible to the business. See [`06-engineering-obligations.md`](06-engineering-obligations.md).

The mapping between them is **asymmetric**, and this is the part that must not be softened:

```
Tier 1 scenario     ->  1..N UI journeys      (near 1:1, user visible)
                    ->  1..N API tests        (happy path / permission / invalid state)

Tier 2 obligation   ->  N API tests           (NO tier 1 parent, and never will have one)
```

> No operator will ever write "given the queue redelivers the drain message after the row was
> already written".

Deriving tier 2 from tier 1 loses it entirely. Every gap that motivated this standard was tier
2. Putting tier 2 in front of the business is the opposite error: it buries the intent they
are being asked to approve.

**Edge cases a user could describe are not tier 2.** A wrong PIN, a lockout countdown, an
empty till, a plan tier that hides a button: all of those are ordinary use cases, each gets
its own scenario id, and each gets automated. An edge case only leaves tier 1 when no user
would ever phrase it.

---

## 3. Both tiers are enumerated at planning time

Before implementation, and before anyone has an interest in the list being short.

That placement is the whole point. Enumerating obligations at test writing time means the
person listing them is the person about to declare the work done, at the moment they most want
the list to be short.

Tier 2 additionally gets a **completeness sweep at the gate**, because planning cannot
enumerate surfaces that only emerge while building. Anything the sweep finds that planning
missed is fed back into how planning is done, so the next item plans better. Neither is
sufficient alone: planning alone misses what emerged, and the sweep alone is the fox counting
the hens.

---

## 4. The shared primitive: scenario ids

One vocabulary, cited by every stream, so coverage is computable across a feature rather than
per test suite.

- Scenarios live in `acceptance/<area>/<area>-acceptance.md` and carry stable ids as Gherkin
  tags, for example `@LOCK-OPEN-001`.
- A UI journey **cites the id it proves**, and takes its step names from the scenario's own
  words.
- An API test cites the scenario id for tier 1 behaviour, or the obligation it instantiates
  for tier 2.

**Gherkin is the format** because it is the only candidate that is genuinely readable as prose
and structurally parseable at the same time: actor, precondition, action and outcome are
carried by the form itself, and a `Then` clause is an assertion in prose that maps close to
1:1 onto a test assertion.

That mapping is what makes review affordable. The reviewable artefact is a side by side of the
scenario's own words against what the test actually asserts, so a mismatch is visible in
seconds without opening the test file:

```
@TILL-PAY-004   A sale cannot be completed for less than the amount due
  Then  the sale is refused
        and the drawer does not open
        and the cart is left untouched
  ------------------------------------------------------------
  Test  rejects_short_payment_and_leaves_cart_intact
  Asserts  result.success === false
           drawerOpened === false
           cart.lines.length === 2
```

**The scenario's words reach the test by generation, never by retyping.** The clauses are
parsed out of the acceptance documents into a typed module the journeys reference, so a
scenario and the journey citing it cannot hold two different versions of the same sentence,
and a journey cannot silently prove three of five clauses. See section 1 of
[`04-playwright-journeys.md`](04-playwright-journeys.md). A convention would not survive this,
because keeping two copies of a sentence aligned by care is exactly the discipline that
already failed elsewhere.

**Known limit, and it must be stated wherever this is described.** That side by side catches
"the test does not do what it says". It does not catch "the scenario describes a situation
that cannot occur", and it does not catch a clause whose body asserts nothing. Only
demonstration against running software closes the first gap, which is why video is part of the
evidence and not decoration.

### Traceability runs both ways

Or it decays into an instruction to be thorough, and gets skipped when the change is small and
the day is short:

- change a scenario, and you get the list of journeys and API tests citing it
- change an API contract, and you get the scenarios that depend on it
- delete or rename a scenario, and you get the citations that are now orphaned

The output is a finite list to work through, not a judgement call.

---

## 5. Confirmation status: derived, verified, accepted

Every scenario carries one. `derived` is the honest default for anything written up from
software that already exists.

| Status | Meaning |
|---|---|
| `proposed` | Written at planning, before the software exists. A proposal, not a description. |
| `derived` | Written up from the delivered software. Describes what it appears to do. |
| `verified` | A human watched the software do it, recorded with date and commit. |
| `accepted` | Confirmed as what the software **should** do. |

A test citing a `derived` scenario proves the test runs, not that the requirement is right.

**The gap between `derived` and `accepted` is where defects hide, and making it visible is
most of the value.** A single number ("94% pass") flattens that distinction into nothing. The
status ladder keeps the unconfirmed surface on screen and hands the backfill a concrete
worklist.

It is also the anti flood mechanism for review: `accepted` items drop out of the review queue
entirely, so what stays visible is precisely the unsettled surface. That costs nothing extra,
because the statuses are already tracked.

---

## 6. Intent cannot be reverse engineered

The most important rule in the pack, and the one most easily skipped.

Code contains what a system **does**. It never contains why anyone wanted it. Anyone, human or
agent, asked to document intent while reading only the implementation will produce intent
fluently, plausibly, and fabricated.

So every scenario written up from existing software carries a provenance line naming where its
intent came from:

```
<!-- intent: design-notes/till-lock.md, section 4 -->
<!-- intent: stated by the product owner, 2026-03-11, recorded in decisions.md D-018 -->
<!-- intent: INFERRED from implementation - needs confirmation -->
```

That is not bookkeeping. It is what makes review affordable, because attention goes to the
`INFERRED` ones instead of spreading evenly across everything. Where no source exists, intent
is a **question**, not a statement.

This is what decides whether writing criteria against existing software is worth doing at all:

> Use cases built from observed behaviour yield tests asserting that the software does what
> the software does. They cannot fail. Use cases built from sourced intent yield tests that
> can disagree with the delivered software, and a disagreement is a defect found.

Two corollaries:

- **Demonstration is of the running software, not of the code.** Citing a file and line proves
  a line was read. Running the flow proves the system does it.
- **When comparing findings against intent, order matters.** Observed behaviour first, then
  the intent stated by whoever owns it, stated **before** they see any inferred version, then
  the written up intent. The other order confirms a guess instead of testing it.

**The highest value output of this exercise is the anomaly list, not the document.** States
nothing can write, guards no caller reaches, buttons with no behaviour behind them, comments
contradicting code. Derived blindly, a status with four guards and no writer reads as "the
system supports this". Derived carefully, it is a defect report.

---

## 7. Evidence, not ticks

**No question is answered "yes".** A checklist has already failed here: asked "did you cover
the edge cases?", I would have answered yes in good faith and been wrong.

Questions are of three kinds, and each is answered differently:

- **Enumerable** questions are answered with a **list**. "Which actors can reach this?" is
  answered by naming every one, **including those that must be refused**. Answering from
  assumption rather than enumeration is how two tests once shipped asserting a permission
  boundary that did not exist.
- **Provable** questions are answered with a **test name**, and that test must have been
  observed failing. "Is this safe under concurrency" is not a judgement call.
- **Judgement** questions are answered with a **specific sentence**. "Is this efficient" is
  settled by naming the N+1 that was checked and is not there, or the lock scope and why it is
  that wide. A bare yes launders an unexamined assumption into a recorded answer.

**Falsifiability is recorded, not implied.** A test never observed red is not evidence. Where
a test was proved able to fail, the file records the specific mutation and the result:

```ts
// Proved red by removing the same-cashier guard in the unlock handler; this test
// failed on exactly the "shift is unchanged" assertion, not on setup.
```

Inventing a plausible mutation is a much higher bar to bluff than a tick, and it is the manual
stand in for mutation testing over the changed files.

---

## 8. Design rule: optimise verification cost, not authoring cost

**Every artefact must be checkable in less time than it took to produce.**

A record needing twenty minutes of scrutiny will not be scrutinised. The reviewer becomes the
bottleneck and waves it through, which is precisely how bad work passes. A video takes two
minutes. A citation check is instant, because it is mechanical. Batches stay small and ordered
riskiest first, because forty items presented at once get rubber stamped.

This is also the argument for narrating a recorded run with the scenario's own wording: what a
viewer is told and what the journey proves are then the same sentence, and no second script
exists that could drift from the criteria.

---

## 9. What mechanical checking can and cannot do

Generating the clauses into the journeys (section 1 of
[`04-playwright-journeys.md`](04-playwright-journeys.md)) moves several of these from "a check
that has to be written and run" to "the build does not compile": a cited id that does not
exist, an orphaned citation after a rename, a missing clause, and a step the document does not
contain.

What is left for a citation check, all mechanically decidable:

1. every scenario id is cited by at least one journey, or carries a recorded reason it cannot
   be
2. every cited test exists in the sources
3. every cited test appears in the change under review, so citing pre existing unrelated tests
   does not count
4. every scenario carries a status and, where the status is `verified`, a date and commit
5. no clause body is empty of assertions

**It never verifies that the answers are true.** Green means "well formed, and the citations
resolve to real tests in this change". It never means "the coverage is adequate". That
distinction has to be printed wherever the check is documented, or the check becomes exactly
the false assurance it was built to prevent.
