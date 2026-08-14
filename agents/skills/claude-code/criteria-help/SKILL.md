---
name: criteria-help
description: Work out which criteria skill fits what you are about to do, and say why. Routes by the situation - a legacy app with nothing written down, a fresh request, a task to pick up, a scenario to judge, a test to write, evidence to produce - rather than listing everything. Use when the architect says "which skill", "what should I use", "help", "what can this do", "where do I start", or describes a job without naming a skill.
---

# Which skill do you want

A router, not a catalogue. Ask what they are trying to do, name the one skill that fits, say what
it will do first, and get out of the way.

If the situation is obvious from what they have already said, **do not ask** - name the skill and
start. The question below is for when it genuinely is not.

```
What are you doing?
1  a request came in, nothing designed yet          -> criteria-architect
2  the software exists, nothing is written down     -> criteria-backfill
3  I have a task to pick up                         -> criteria-plan
4  I need to decide something about a scenario      -> criteria-lookup
5  a criterion has no test                          -> criteria-test
6  a criterion the build does not satisfy           -> criteria-develop
7  a word changed, or criteria spell a domain noun  -> criteria-glossary
8  a task is finished and needs its evidence        -> criteria-bundle
9  I need to show someone the product               -> criteria-present
```

---

## The one distinction worth getting right

**Which direction is the work running?** Everything else follows from it, and confusing the two
produces criteria that look right and mean the opposite.

**Forward** - somebody wanted something and the software does not exist yet. Intent comes first,
criteria are written from it, tests prove them, code satisfies them. `criteria-architect` starts
it. A test here that disagrees with its criterion is **a defect in the software**.

**Reverse** - the software exists and nobody wrote down what it promises. Behaviour comes first,
criteria are derived from it, intent is inferred and unconfirmed. `criteria-backfill` does it. A
test here that disagrees with its criterion means **you observed it wrongly**.

Same artefacts, opposite meaning. If someone asks for "criteria for the payments module" and
payments already exists, they want backfill, not architect - and the difference matters, because
architect would invent intent nobody holds.

## What each one is for

| Skill | Use it when | It will not |
|---|---|---|
| `criteria-architect` | A request arrived and needs designing into a spec, a brief and a declaration | Design a request whose intent is missing - it returns or holds it instead |
| `criteria-backfill` | A legacy area has no criteria and someone needs something to verify | Claim its inferred intent is fact, or mark anything confirmed |
| `criteria-glossary` | A domain word changed, or criteria spell one | Invent the vocabulary - it finds the real source and scripts the export |
| `criteria-plan` | A task needs turning into a working list of scenarios | Write anything before you have seen and corrected the list |
| `criteria-lookup` | A scenario needs judging, or a queue needs walking | Promote a status you did not ask for |
| `criteria-test` | A criterion has no journey and the software exists to drive | Edit the criterion when the app disagrees - it raises a flag |
| `criteria-develop` | A criterion is right and the build cannot satisfy it | Change a criterion or a clause to make a test pass |
| `criteria-bundle` | A task is done and needs watchable evidence | Promote a status because a recording exists |
| `criteria-present` | Someone has to be walked through the product | Re-file criteria to match a walkthrough, or place a scenario unread to pass an audit |

The third column is the useful one. Every skill refuses something, and the refusals are why the
set is worth having rather than a pile of prompts.

## Where the rules live

The skills are how to run the process. The process itself is the standard:

```bash
npx criteria-review guide          # the protocol, in four ideas
npx criteria-review here           # open the reading tab and read the standard
```

Point people at the standard when the question is "what should a scenario look like" or "what
does verified mean". Point them at a skill when the question is "what do I do now".

## Two things people ask that are not skills

**"How do I set this up in my project?"** - that is `adopting-the-standard` in the standard, plus
`criteria-review standard eject` if the team wants to own the rules.

**"How do I know if this task is done?"** - `criteria-review plan check`, which answers from the
documents and exits non-zero while anything declared is outstanding.
