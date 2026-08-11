# Engineering obligations, the second tier

The behaviour no user will ever describe, and which is therefore invisible to a process built
only on user stories.

Every gap that motivated this standard lived here. Not one of them had a user story, and not
one would ever have emerged from one.

---

## Why it is a catalogue and not diligence

A catalogue can be checked against. Diligence cannot.

At planning time the question is "which of these does this piece of work instantiate?", and
the answer is a shortlist of ids. That is a different question from "have you thought about
edge cases?", which is answered yes, in good faith, and wrongly.

Each obligation carries its own expectations, so naming one produces a concrete list of tests
rather than a feeling of having considered something.

---

## The catalogue

Numbered so a test can cite the obligation it instantiates the way a journey cites a scenario
id.

### O1. Audit before mutation

Persistent state never changes without a record of who changed it and why. Where an audit
write and a state write are both required, the audit goes first, so a failed audit means a
failed operation rather than a state change with no record.

The one exception is the creation of an immutable aggregate that is its own record. Something
written once and never mutated is its own audit trail. Every later transition on it still
writes a record.

Expectations: the audit row exists in the same transaction as the change; a forced audit
failure leaves no state change behind; the record names the actor, not just the operation.

### O2. No silent partial success

An operation either fully succeeds or fully fails with a surfaced reason. Where partial
success is genuine, it is modelled explicitly in the result type, with the skipped and failed
entries the caller can render.

The failure shape this exists to prevent: a loop that continues past a failed item, a
swallowed exception, an "already exists" treated as success, all returning 200.

Expectations: a mid-loop failure returns a result naming what did and did not happen; no code
path returns success while having skipped work.

### O3. Idempotency by deterministic key, not by flag

Retries, double submissions and message redeliveries converge to the same state regardless of
how many times they fire. Deduplication is keyed off something deterministic and persisted on
the write side, not off an end-of-operation boolean that will not have been set yet when the
retry arrives.

Expectations: run it twice, assert one row, one notification, one state transition; kill the
process between the write and the acknowledgement, then redeliver.

### O4. Concurrency and races

Two callers hitting the same record. Optimistic concurrency tokens and locks are claims until
asserted under actual contention.

Expectations: two concurrent transitions, one wins and one is refused with a specific error;
retry exhaustion has a defined outcome; the losing caller is left with a state it can act on.

### O5. Partial write and interruption

The operation fails midway: the database write lands and the queue enqueue does not, or the
message publishes and the commit fails.

Expectations: assert what persisted and what did not; the next call recovers rather than
compounding; a durable outbox row rather than a best-effort call where the promise is that
something will definitely happen.

### O6. Best-effort boundaries are actually best effort

Realtime publishing, notifications, analytics and other non transactional side effects never
fail the user's operation. They are caught, logged, and optionally counted.

Expectations: force the publish to throw and assert the operation still returns success;
assert the failure was recorded somewhere a person will see.

### O7. Validation at the boundary, defence behind it

Input is validated where it enters the system. Layers behind that boundary still refuse
contract violations rather than trusting the caller: negative quantities, empty identifiers,
missing required fields.

Expectations: each rule that can reject, asserted on the actual error shape rather than merely
that something threw.

### O8. Malformed input

Wrong type, absent field, empty string, whitespace only, oversized, wrong encoding, unexpected
nulls in a collection.

Expectations: rejection, not a crash, and not a 500 where a 400 belongs.

### O9. Boundaries

One below, exactly at, and one above every limit, quota, uniqueness constraint and rounding
threshold. Money is the usual offender: a total that rounds one way in the cart and the other
way in the ledger is a defect nobody sees until reconciliation.

### O10. Authorisation, enumerated

Every principal that can reach a surface, **including those that must be refused**. Answered
by naming them, never by assumption.

This is where assumption has cost me directly: two tests once shipped asserting a permission
boundary that did not exist in the code at all, and both passed, because they asserted the
refusal of an actor who could not have reached the surface for a different reason.

Expectations: a test per allowed principal and a test per refused principal; cross tenant and
cross owner access refused, not merely absent from the UI.

### O11. Deletion and lifecycle

Soft delete wherever anything downstream replicates or references the record. Hard deletion
breaks synchronisation and orphans references that were valid when they were written.

Expectations: a deleted record's references still resolve; a deleted record does not reappear
through a synchronisation path; reactivation, where it exists, restores a usable state rather
than a half one.

---

## The coverage categories every test surface is measured against

The catalogue above is what a feature instantiates. This list is what any single surface gets
worked through. Happy path alone is debt, not coverage.

- **Validation rejections**, each asserted on the real error shape.
- **Partial failure**, asserting what persisted and what did not.
- **Idempotency under retry or redelivery**: run it twice.
- **Races**: two callers on the same key, under actual contention.
- **Dependency down**: the external call fails or times out; assert the recovery path, not
  that an exception escaped.
- **Malformed input**.
- **Boundaries**: one below, at, and one above.

## No mocks in the path under test

An API test that mocks its database proves the mock works. Use the real database, the real
migrations, real seed data and real authorisation. Mock only what is genuinely external and
cannot be run locally, and say why in the test's own comment.

Where round trip behaviour matters, exercise the whole pipeline rather than the shape: issue
the token and use it, write the bytes and read them back, publish the event and observe it on
a real subscriber. "The shape matched" is not proof the plumbing works.

## Assert outcomes, not implementation

Assert the state a user or a caller could observe. A test coupled to internal call order
breaks on every refactor while catching nothing, which trains people to ignore failures, which
is worse than the coverage it claimed to add.

## Before writing any test, decide what would make it fail

State, in the test's own comment, the specific defect it would catch. If that cannot be
named, the test is asserting a tautology: delete it, or rewrite it against a real outcome.

Where practical, prove it. Break the behaviour, watch it go red, restore, and record the
mutation.
