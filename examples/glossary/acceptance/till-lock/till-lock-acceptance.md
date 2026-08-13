# Locking the register - acceptance criteria

**Scope**: locking a register when stepping away, and reopening it.

**Why this document exists**: it is the worked example for the glossary. Every domain noun
names its concept rather than spelling it, so renaming any of them is a one-line change to
`acceptance/terms.json` and nothing here is touched.

---

## Roles

| Role | What they do here |
|------|-------------------|
| **{operator}** | Locks the {till.lower} and reopens it |

---

## Gherkin scenarios

### Feature: Locking

<!-- intent: design-notes/till-lock.md section 4 -->

```gherkin
@LOCK-SET-001 @status:derived @persona:Cashier
Scenario: Locking de-authorises the {till.lower}
  Given a {operator.lower} is signed in and on {session.lower}
  When they lock the {till.lower}
  Then their stored session is cleared from the {till.lower}
  And nothing can act as them until a PIN is entered
```

<!-- intent: design-notes/till-lock.md section 4 -->

```gherkin
@LOCK-SET-002 @status:derived @persona:Cashier
Scenario: Locking leaves the {session.lower} open
  Given a {operator.lower} is on {session.lower}
  When they lock the {till.lower}
  Then the {session.lower} remains open
  And the {premises.possessive} trading day is unaffected
```

### Feature: Reopening

<!-- intent: design-notes/till-lock.md section 5 -->

```gherkin
@LOCK-OPEN-001 @status:derived @persona:Cashier
Scenario: The {operator.possessive} own PIN resumes their {session.lower}
  Given the {till.lower} was locked during a {session.lower}
  When that {operator.lower} enters their own PIN
  Then they are returned to the {till.lower}
  And the same {session.lower} is still open, not a new one
```

<!-- intent: INFERRED from the {vendor} integration - needs confirmation -->

```gherkin
@LOCK-OPEN-002 @status:derived @persona:Cashier
Scenario: A {vendor} terminal reports the unlock upstream
  Given the {till.lower} is locked
  When a {operator.lower} unlocks it
  Then {vendor} is told which {operator.lower} is now serving
```
