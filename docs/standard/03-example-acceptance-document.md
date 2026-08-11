# Locking the till - acceptance criteria

A complete worked example of the format described in
[`02-writing-acceptance-criteria.md`](02-writing-acceptance-criteria.md). The domain is a
point of sale terminal on a shop counter. It is a real shape of problem rather than a toy: it
has money behind it, more than one actor, a permission boundary, a lockout, and one criterion
that deliberately disagrees with the software.

**Scope**: manually locking the till when stepping away from the counter, and reopening it
with a staff PIN. Automatic idle locking is out of scope and has its own document.

**Sourcing note**: the intent here is **stated rather than inferred**. The design was decided
in conversation and recorded in `design-notes/till-lock.md` before these criteria were
written, so these scenarios are able to disagree with the software rather than merely
describing it. Where a scenario is inferred instead, its block says so.

**Status**: `derived` until reviewed. The intent citations are real design decisions, not
readings of the implementation.

| Status | Meaning |
|---|---|
| `proposed` | Written at planning, before the software exists. A proposal, not a description. |
| `derived` | Written up from the delivered software. Describes what it appears to do. |
| `verified` | A human watched the software do it, with date and commit. |
| `accepted` | Confirmed as what the software should do. |

---

## Roles

| Role | What they do here |
|---|---|
| **Cashier** | Locks the till on stepping away, and reopens it with their own PIN |
| **Incoming cashier** | A different member of staff who unlocks a till mid shift |
| **Shop owner** | Recovers a till when a PIN is forgotten or a lockout is in force |

---

## User stories

### Story 1: Stepping away must not leave the till open

**As a** cashier taking a short break, **I want** to lock the register, **so that** nobody can
ring up a sale, open the drawer, or read the day's takings as me while I am gone.

Acceptance criteria:

- Locking de-authorises the identity immediately, rather than merely hiding the screen.
- The shift and the cash drawer stay open, because the cashier is coming back to them.
- Nothing on the terminal is reachable until a PIN is entered.

### Story 2: A locked till must never become a brick

**As a** shop owner, **I want** a way back in even when a PIN is forgotten, **so that** a
locked terminal cannot stop the shop trading.

Acceptance criteria:

- A password route back in is always offered alongside the PIN pad.
- Locking is only offered where a PIN exists that could reopen it.
- A lockout after repeated failures is recoverable by the owner without wiping the terminal.

### Story 3: The takings have to stay attributable

**As a** shop owner, **I want** each sale attributed to whoever actually rang it up, **so
that** a shift's cash can be reconciled against the people who handled it.

Acceptance criteria:

- Unlocking records who is now selling.
- Unlocking does not start a new shift or move the drawer to a new one.

---

## Gherkin scenarios

### Feature: Locking

<!-- intent: design-notes/till-lock.md section 4 - "Lock clears the stored token; it is not a UI overlay" -->

```gherkin
@LOCK-SET-001 @status:derived @persona:Cashier
Scenario: Locking de-authorises the terminal rather than covering the screen
  Given a cashier is signed in and on shift
  When they lock the register
  Then their stored session is cleared from the terminal
  And nothing can act as them until a PIN is entered
```

<!-- intent: design-notes/till-lock.md section 4 - "shift and drawer stay open on lock" -->

```gherkin
@LOCK-SET-002 @status:derived @persona:Cashier
Scenario: Locking leaves the shift and the drawer open
  Given a cashier is on shift with an open cash drawer
  When they lock the register
  Then the shift remains open
  And the drawer session remains open
  And the trading day is unaffected
```

<!-- intent: design-notes/till-lock.md section 4 - the lock screen is deliberately not a dialog,
     because a dialog can be dismissed -->

```gherkin
@LOCK-SET-003 @status:derived @persona:Cashier
Scenario: The lock screen cannot be dismissed
  Given the register is locked
  When anyone tries to navigate away, go back, or dismiss the screen
  Then the lock screen stays
  And no part of the application is reachable behind it
```

<!-- intent: design-notes/till-lock.md section 2 - staff PINs are a paid plan feature, so on a plan
     without them there is no PIN to reopen with and offering Lock would strand the operator -->

```gherkin
@LOCK-SET-004 @status:derived @persona:Cashier
Scenario: Lock is only offered where a PIN can reopen it
  Given the shop is on a plan without staff PINs
  When the cashier looks at the till toolbar
  Then no Lock button is offered
```

### Feature: Reopening

<!-- intent: design-notes/till-lock.md section 5 - "the same cashier's PIN resumes in place" -->

```gherkin
@LOCK-OPEN-001 @status:derived @persona:Cashier
Scenario: The cashier's own PIN resumes their session in place
  Given the register was locked during a cashier's shift
  When that cashier enters their own PIN
  Then they are returned to the till
  And the same shift is still open, not a new one
  And the cart they had open is still there
```

<!-- intent: stated by the shop owner on 2026-08-09, recorded in decisions.md D-041. A shift is a
     till session that several people work; unlocking records who is selling and does not move the
     shift. This scenario states the WANTED behaviour, which the implementation does not currently
     do - today a different PIN ends the shift and opens a new one. -->

```gherkin
@LOCK-OPEN-002 @status:derived @persona:Incoming cashier
Scenario: A different cashier unlocking is recorded, not handed the shift
  Given the register was locked during a shift
  When a different member of staff enters their own PIN
  Then they are returned to the till
  And the shift continues unchanged, with the same opening float and the same drawer
  And sales taken from now on are attributed to them
```

<!-- intent: design-notes/till-lock.md section 5 - a wrong PIN must not reveal whether the PIN or
     the person was wrong, and must never touch the shift -->

```gherkin
@LOCK-OPEN-003 @status:derived @persona:Cashier
Scenario: A wrong PIN is refused without saying why
  Given the register is locked
  When someone enters a PIN that does not belong to any member of staff
  Then the entry is refused with the same message as any other failure
  And the shift is untouched
  And the terminal stays locked
```

<!-- intent: design-notes/till-lock.md section 6 - "always a password route out" -->

```gherkin
@LOCK-OPEN-004 @status:derived @persona:Cashier
Scenario: A forgotten PIN can be recovered with a password
  Given the register is locked and the cashier has forgotten their PIN
  When they sign in with their account password instead
  Then they are returned to the till
  And the shift they were on is still open
```

### Feature: Lockout after repeated failures

<!-- intent: design-notes/till-lock.md section 6 - five failures then fifteen minutes; the count is
     per terminal, not per member of staff, because the attacker is the person holding the terminal -->

```gherkin
@LOCK-FAIL-001 @status:derived @persona:Cashier
Scenario: Repeated wrong PINs lock the terminal out for a period
  Given four wrong PINs have already been entered on this terminal
  When a fifth wrong PIN is entered
  Then the terminal refuses further attempts for fifteen minutes
  And the remaining time is shown and counts down
```

<!-- intent: design-notes/till-lock.md section 6 - the lockout must not be bypassable by getting the
     PIN right, or it is not a lockout -->

```gherkin
@LOCK-FAIL-002 @status:derived @persona:Cashier
Scenario: A correct PIN does not bypass a lockout in force
  Given the terminal is locked out with time remaining
  When a cashier enters their correct PIN
  Then the entry is refused
  And the countdown continues unchanged
```

<!-- intent: design-notes/till-lock.md section 6 - the owner must be able to recover a shop floor
     terminal without a support call -->

```gherkin
@LOCK-FAIL-003 @status:derived @persona:Shop owner
Scenario: The owner can clear a lockout from another device
  Given a terminal is locked out with time remaining
  When the owner clears the lockout from their own device
  Then the terminal accepts a correct PIN immediately
  And the shift is still open
```

---

## Traceability

Generated from the citations rather than maintained by hand. Because a journey references its
scenario by key and takes its clauses from this document, the covered set is simply the set of
referenced keys, and an orphaned row cannot survive a compile.

| Scenario | UI journey | API tests |
|---|---|---|
| `@LOCK-SET-001` | `till-lock.spec.ts` | `lock_clears_stored_token` |
| `@LOCK-SET-002` | `till-lock.spec.ts` | `lock_leaves_shift_and_drawer_open` |
| `@LOCK-SET-003` | `till-lock.spec.ts` | n/a, client behaviour only |
| `@LOCK-SET-004` | `till-lock-plan-gate.spec.ts` | `lock_not_offered_without_pin_feature` |
| `@LOCK-OPEN-001` | `till-lock.spec.ts` | `unlock_same_cashier_resumes_shift` |
| `@LOCK-OPEN-002` | not covered, states wanted behaviour the software does not have | `unlock_other_cashier_keeps_shift` (expected red) |
| `@LOCK-OPEN-003` | `till-lock-failures.spec.ts` | `unlock_unknown_pin_is_generic_failure` |
| `@LOCK-OPEN-004` | `till-lock-failures.spec.ts` | `password_fallback_keeps_shift` |
| `@LOCK-FAIL-001` | `till-lock-failures.spec.ts` | `fifth_failure_starts_lockout` |
| `@LOCK-FAIL-002` | `till-lock-failures.spec.ts` | `correct_pin_refused_during_lockout` |
| `@LOCK-FAIL-003` | not covered, needs a second device in the harness | `owner_clear_lockout_allows_pin` |

## Sign off

One signature line, not two, until there is a real second party to sign the other.

| Role | Name | Date | Statuses promoted |
|---|---|---|---|
| Architect / owner | | | |
