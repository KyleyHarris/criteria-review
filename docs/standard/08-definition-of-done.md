# Definition of done

The other files describe the artefacts. This one sequences them: the order a piece of work
walks, what each stage produces, and what blocks passage.

Every stage has an **artefact** and a **gate that cannot be satisfied by assertion**.

---

## The stages

| # | Stage | Artefact | Gate on leaving |
|---|---|---|---|
| 0 | Pickup | Scope read; the shortlist of engineering obligations named | The shortlist is named, not "considered" |
| 1 | Plan | Tier 1 scenarios, tagged `derived`, and the tier 2 obligations from the shortlist | **Both tiers exist before implementation**, and have been shown to whoever owns the intent |
| 2 | Build | The implementation | Contracts and callers updated together, no compatibility shims left behind |
| 3 | Service tests | Tests citing scenario ids for tier 1 and obligation ids for tier 2 | Every test names one or the other |
| 4 | Gate | Completeness sweep over the surfaces that emerged while building | Answers are lists, test names, or specific sentences. Never "yes" |
| 5 | Journeys | One journey per tier 1 scenario, its clauses generated from the criteria rather than retyped | Every scenario is cited by a journey, or carries a recorded reason it cannot be |
| 6 | Evidence | Citations resolve; the videos are indexed by scenario id | The bundle exists and was produced by a command, not assembled by hand |
| 7 | Sign off | Status promotions, with date and commit | Watching promotes to `verified`. Confirmation of intent promotes to `accepted` |

**Stage 1 is the load bearing one.** Both tiers get enumerated before anyone has an interest
in the list being short, and tier 2 comes from a catalogue rather than from imagination.

**Stage 4 exists because planning cannot enumerate what only emerges while building.**
Anything the sweep finds that planning missed is fed back into how stage 1 is done, so the
next item plans better. Without that loop the sweep is a patch rather than a correction.

**Nothing here proves adequacy.** A clean walk means well formed, and the citations resolve.
It never means the coverage is sufficient. Say so wherever a stage is reported as passed, or
the report becomes exactly the false assurance it was built to prevent.

---

## The one command test

The acceptance test for this whole system:

> **Can one command, at the end of a piece of work, produce the evidence bundle?**

If assembling it is manual work at delivery time, it gets skipped exactly when the delivery is
most under pressure, which is when it matters most. It has to be **generated** from artefacts
that were structured for it from the start, which is what actually justifies every constraint
in the other files: the stable ids, the citations, the status tags, the video naming.

The bundle is: the user stories, the acceptance criteria, and a video per scenario id. It has
to be readable by someone who will never clone the repository.

---

## Confirming before building, not only after

The same export, minus the videos, is what gets shared **before** implementation.

A document carries force in a disagreement only if it was **agreed**. Sharing it beforehand is
what converts it from "what the developer assumed" into "what we agreed", and I have had that
distinction settle a dispute that would otherwise have been engineering opinion against a
customer's recollection.

It is also where intent is corrected most cheaply, because no code exists yet.

---

## Enforcement checks output, not input

Reminders have failed me repeatedly, and the failures were not ignorance. The rules were
written down, in front of me, and read. They were then not applied, because a general reminder
is agreed with and moved past.

So enforcement fires at the moment work is declared done, not at the moment it begins, and it
asks a **specific question derived from the change**, never a general one:

> "Remember: do not ship an interface that outruns the behaviour behind it."
>
> Agreed with, and moved past.

> "This change added a guard refusing the operation when the record is retired, and touched no
> client file. Name the interface gate, or state why none is needed."
>
> Cannot be waved away.

That class generalises to any rule enforced on one side of a boundary while the other side is
untouched: a new endpoint no test names, a new enum value nothing renders, a changed contract
without regenerated models, a new background job nothing exercises. **Five questions derived
from the diff beat fifty rules**, because each one is answerable and none can be satisfied by
nodding along.

---

## The self review, run as if someone else wrote it

Before anything is called done, the change is read back against these. The bar is "would an
unbiased reviewer call this out?", and grading your own work more gently because you wrote it
is the whole failure mode this is written to defeat.

1. **Order of operations under partial failure.** If the persistent write succeeds and the
   audit, queue enqueue or publish fails after it, what state is left, and can the caller
   retry safely?
2. **Idempotency under retry.** Redelivery, a client retry, a double tap. Is the deduplication
   keyed off something deterministic and persisted, or off a flag that will not be set yet?
3. **Silent partial success.** Is there any path returning success while having skipped work?
4. **Error shape.** Does a structured server error round trip to the user with its intent
   intact, or arrive as an unreadable object?
5. **Drift between the tests and the code.** If a test asserts behaviour the code does not
   deliver, or the reverse, one of them is wrong. Do not ship until they agree.
6. **Audit trail intact.** Every state change is recorded, or is itself an immutable creation
   that serves as its own record.
7. **Best effort boundaries are best effort.** Messaging and realtime failures do not surface
   as server errors on the user's operation.
8. **Everything green.** Build, type check, unit and integration suites. State the counts. If
   a suite was skipped, say which and why.
9. **The reproduction is followable.** Someone who has never seen the change can reproduce it
   end to end from the write up: routes, inputs, expected outcomes, edge cases.

Answering "not applicable" is fine when it is honestly not applicable. The point of writing
the answers down is to force the question to be asked at all.

---

## What "done" is not

- Not "the build is green". Green is the floor, not the ceiling.
- Not "the tests pass". A test never observed failing is not evidence.
- Not "it is behind a flag". A half feature behind a flag is a half feature, and it looks
  identical to a defect to whoever finds it.
- Not "I will finish it next time". If it cannot ship whole, the scope gets expanded or the
  feature gets dropped, and that is a decision to raise rather than absorb.
