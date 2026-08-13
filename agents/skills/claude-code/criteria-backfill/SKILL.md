---
name: criteria-backfill
description: Write acceptance criteria for software that already exists. Asks which area or topic to investigate, reads the documentation and the code to learn how it behaves, then recommends a filename, a location, roles, user stories and a numbered scenario list for correction before anything is written. Every intent it cannot source is marked INFERRED and needs confirming. Use when the architect says "backfill", "write criteria for X", "we have no scenarios for this area", "document what this does", or a plan turns up work with no criteria behind it.
---

# Backfill criteria from existing software

Producing the tier 1 layer for something already built. The output is a document of scenarios
that a person can confirm, correct or reject - **not** a description that agrees with the code
by construction.

Four steps. **Nothing is written until step 3 has been corrected.**

---

## 0. The rule this skill exists to obey

> Code contains what a system **does**. It never contains why anyone wanted it.

An agent asked to document intent while reading only the implementation will produce intent
fluently, plausibly, and **fabricated**. That is not a risk to be careful about; it is the
default behaviour, and it is why every intent line here is either a citation or the word
`INFERRED`.

The reason it matters is worth carrying while you work: criteria built from observed behaviour
yield tests that assert the software does what the software does. They cannot fail. Criteria
built from sourced intent yield tests that can **disagree** with the delivered software, and a
disagreement is a defect found. A backfill that produces only the first kind has cost time and
bought nothing.

**Do not write journeys here.** A journey written from the same reading as the criterion agrees
with it by construction. Tests come from `criteria-test`, which learns by running the software -
a different evidence source, which is what lets a test dissent.

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

## 4. Write it

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
so in the comment.** A document that agrees with the software everywhere was derived, not
sourced.

## 5. Hand it on

Say what was produced and what is owed:

```
14 scenarios written to acceptance/till-lock/till-lock-acceptance.md
  9 sourced, 5 INFERRED - the 5 need your intent before they mean anything
3 anomalies found (listed above), none of them scenarios
Next: `criteria-lookup` to walk the 5, or `criteria-test` once they are confirmed
```

Never promote a status, never mark anything accepted, and do not fix the anomalies here. This
skill produces a document and a list of questions. Answering them is the architect's, and acting
on them is another skill's.
