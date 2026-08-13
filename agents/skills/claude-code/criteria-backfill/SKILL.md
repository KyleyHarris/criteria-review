---
name: criteria-backfill
description: Reverse engineer a legacy application into specs and tests that QA and the solution architect can verify. Asks which area to investigate, learns the behaviour by reading and running it, then recommends a filename, ids, roles, user stories and a numbered scenario list for correction before anything is written. Builds criteria and characterisation journeys from OBSERVATION; intent is inferred and marked as such until a human confirms it. Use when the architect says "backfill", "reverse engineer X", "we have no scenarios for this area", "document what this does", or a plan turns up work with no criteria behind it.
---

# Reverse engineer an existing application

This is the **reverse direction** of the two the process has. Forward is intent to criteria to
tests to code, and the solution architect drives it. Reverse is this: a legacy application
exists, nobody wrote down what it promises, and the job is to produce specs and tests from
**observation** to the point where QA and the architect can verify them.

The output is a document of scenarios, and journeys that pin the behaviour, which a person can
confirm, correct or reject.

Four steps. **Nothing is written until step 3 has been corrected.**

---

## 0. What is being produced, and what it is worth

> Code contains what a system **does**. It never contains why anyone wanted it.

So the behaviour here is observed and the **intent is inferred**, every time, and it is marked
`INFERRED` rather than asserted. An agent asked to document intent while reading only the
implementation will produce it fluently, plausibly and fabricated; the marking is what stops
that from becoming a requirement nobody chose.

**Yes, this produces tests as well as criteria** - characterisation journeys that pin what the
software does today. Be clear about what they are worth, because it is not the same as a forward
test:

- They **cannot disagree with the software.** They were written from it. A green one proves
  nothing about whether the behaviour is right.
- What they buy is that the behaviour is now **pinned**: a change to it becomes visible instead
  of silent, on a codebase where nothing was watching.
- And they make the criteria **verifiable**: QA and the architect get something concrete to
  watch running, rather than a paragraph to agree with in the abstract.

The disagreement comes later, and from a person - reading a derived criterion and saying *that is
not what it should do*. That is the whole point of the reverse direction, and it is why the one
rule that must not bend is the next one.

**Nothing produced here is confirmed.** Every scenario is `derived`, every intent is `INFERRED`
unless genuinely cited, and nothing is ever `accepted` or `verified`. A characterisation test
whose criterion has been mistaken for a requirement is worse than no test, because it now defends
the current behaviour against anyone trying to change it.

## 1. Ask what to investigate

Never pick the area yourself. Ask, and offer help choosing:

```
Which area should I work through?
1  name it              - "the till", "shift hand-over", "refunds"
2  show me candidates   - I will list areas with code and no criteria
3  from a plan          - items that resolved to nothing when the task was planned
```

An **area is a thing a user would name.** "Locking the till" is an area. "SessionController" is
not. If the answer is a module rather than a behaviour, say so and ask again.

Then ask what may be read as intent: a design note, a decision log, an issue, a specification,
a conversation they remember. **Ask explicitly, because this is the only chance to get real
intent**, and once the document is written the inferred version starts looking like a fact.

## 2. Investigate, in this order

**Documentation first, code second.** Reversing it means the code frames what you then go
looking for, and every document you read afterwards is read as confirmation.

1. **Read the sources they named**, and any decision record or phase document covering the
   area. Note exact citations - `file.md:214`, an issue number, a dated decision. A citation is
   a path, a line, an id or a URL. Prose that merely discusses intent is **not** a citation.
2. **Read the implementation** to learn what the software does: the actor's entry point, the
   guards, the states, what is refused and what is silently allowed.
3. **Run it if you can.** Citing `file:line` proves a line was read; running the flow proves the
   system does it. Anything you only read is a weaker claim, and the difference belongs in the
   provenance line.
4. **Collect the anomalies as you go.** States nothing can write, guards no caller reaches,
   buttons with no behaviour behind them, comments contradicting the code. **This is the highest
   value output of the whole exercise**, higher than the document - derived blindly, a status
   with four guards and no writer reads as "the system supports this"; derived carefully it is
   a defect report.

## 3. Recommend, and wait for corrections

Present all of it before writing anything:

**Where it goes**

```
acceptance/till-lock/till-lock-acceptance.md          new
acceptance/shift-lifecycle/shift-lifecycle-acceptance.md   exists - 6 scenarios would be added
```

One folder per area, named for the area rather than the module. Say plainly when an area
already has a document, because adding to one is different from starting one.

**The id scheme**, checked against every registered project for collisions:

```
LOCK-SET-001..004   locking
LOCK-OPEN-001..004  reopening
LOCK-FAIL-001..003  lockout
```

Ids are stable forever and never reused, so a bad prefix is expensive later. Offer the grouping
and let them rename it.

**The roles**, including any that must be refused.

**The user stories**, in prose, with the "so that" doing real work - "as a user I want a lock
button so that I can lock the screen" is circular and says nothing a test could disagree with.

**The scenarios**, numbered, each one line, each marked with where its intent came from:

```
  1  LOCK-SET-001  sourced   design-notes/till-lock.md:44   Locking de-authorises the terminal
  2  LOCK-SET-002  sourced   design-notes/till-lock.md:51   The shift and drawer stay open
  3  LOCK-OPEN-002 INFERRED  -                              A different cashier is recorded
  ...
```

Then ask for corrections, and ask specifically about the `INFERRED` ones: **each is a question,
not a statement.** "I could not find why this behaves this way - is it deliberate, and is this
what it should do?" One sentence from them turns an unfalsifiable criterion into one that can
catch a defect.

Also present the anomalies, separately and plainly. They are not scenarios and should not be
smuggled in as if they were.

## 4. Write the criteria, then the journeys that pin them

Only after correction. Follow `criteria-review guide` and the standard's authoring rules; the
ones most often broken here:

- **One actor, in their language.** No route paths, no component names, no HTTP status codes.
- **`Then` clauses are assertions**, close to 1:1 with what a test would assert.
- **Negative outcomes are stated**, not implied. "And the drawer does not open" is a clause.
- **Edge cases get their own scenario and their own id.** A wrong PIN, a lockout countdown, an
  expired voucher - each is an ordinary use case. A bullet list at the bottom headed "edge
  cases" is a list of things nobody automated.
- **Tier 1 only.** Partial writes, retries, races, malformed input and boundaries are real and
  belong to the engineering obligations, not here. No operator will ever describe them, and
  putting them here buries the business intent this layer exists to make reviewable.
- **Every scenario is `derived`**, or `proposed` if the software does not exist yet. Never
  `verified`, never `accepted` - those are claims only a person can make.
- **Every block carries a provenance comment**, a citation or `INFERRED`.

Where you believe the behaviour is wrong, **write the scenario as the wanted behaviour and say
so in the comment**, and do not write a journey pinning the behaviour you think is a defect.

Then the journeys, following `criteria-test`'s rules for binding, selectors and seeding - with
one difference that matters. There, a journey that disagrees with its criterion is a finding to
raise. Here the criterion came from the behaviour, so a disagreement means you observed it
wrongly: go back and look again rather than adjusting either artefact to match the other.

**A scenario you cannot exercise is a finding, not a gap.** A path no caller can reach, a state
nothing writes, an affordance with nothing behind it - record it in the anomaly list and leave
the scenario without a journey. Writing a journey that fakes its way into an unreachable state
would produce a green test for something that cannot happen.

## 5. Hand it on

Say what was produced and what is owed:

```
14 scenarios written to acceptance/till-lock/till-lock-acceptance.md
  2 sourced, 12 INFERRED - the 12 are questions, not statements
11 characterisation journeys written and green - they PIN today's behaviour and
   prove nothing about whether it is right
3 scenarios could not be exercised (listed) - and that is a finding, not a gap
4 anomalies found (listed above), none of them scenarios
Next: `criteria-lookup` to walk the inferred ones with the recordings beside them
```

Say plainly that the green journeys are not evidence of correctness. A reader who takes "11
green" as reassurance has drawn the opposite conclusion from the truth: they show the software
does what it does, on a codebase where nobody had written down what it should do.

Never promote a status, never mark anything accepted, and do not fix the anomalies here. This
skill produces a document, a set of pinning tests and a list of questions. Answering them is the
architect's, and acting on them is another skill's.
