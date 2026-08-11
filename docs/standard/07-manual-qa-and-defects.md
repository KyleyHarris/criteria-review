# Manual QA and defect reporting

The target is that automation covers the tier 1 scenarios and manual execution shrinks to the
residue automation genuinely cannot reach. Until then, and permanently for that residue,
manual QA is a written artefact rather than a session of clicking around.

---

## What stays manual, permanently

Naming these is what stops the manual checklist quietly re-growing to cover everything.

- **Physical devices and their quirks.** A real phone in a real hand: on-screen keyboards
  covering the action button, safe area insets, an installed web app versus the same page in a
  browser tab.
- **Peripherals.** Card terminals, receipt printers, cash drawer kick-outs, scanners.
- **Anything requiring a real external account.** A live payment gateway, an app store
  install, a real identity provider consent screen.
- **Look and feel judgement.** Whether a screen is usable at arm's length on a counter, under
  a shop's lighting, by someone in a hurry.
- **Genuinely destructive or one-way operations** in a shared environment.

Everything else that is still manual is a backlog item, not a category.

## The manual scenario format

One file per area, mirroring the acceptance areas where they overlap.

```markdown
# Scenario: <name>
Owner: <who maintains this>
Last updated: YYYY-MM-DD
Routes: /a, /b
Prereqs: <seeded data, role required, environment notes>

## TC-<AREA>-NN: <case name>
| Step | Action | Expected |
|---|---|---|
| 1 | ... | ... |
| 2 | ... | ... |

## Edge cases
- ...

## Known limitations
- ...
```

Rules:

- **`Expected` is a specific observable outcome**, not "works correctly". A tester who has
  never seen the feature has to be able to tell pass from fail without asking anyone.
- **Prereqs are complete.** The commonest reason a manual case gets skipped is that nobody can
  work out how to get into the starting state.
- **Known limitations are stated, including where a case cannot currently be run at all.** A
  case that cannot be exercised because the product does not yet support the situation is
  recorded as exactly that, with a pointer to what would unblock it. Silently dropping it is
  how a coverage gap becomes invisible.

## The regression checklist

One page, ticked as you go, in two parts.

**Part 1: smoke, five minutes, all must pass.** Reach the application, sign in, land on the
home screen, walk the two or three navigation paths that prove the shell works, sign out. **On
the first failure here, stop and raise a blocker.** The rest of the checklist is not worth a
tester's afternoon if the shell is broken.

**Part 2: the scenario walk.** One line per scenario file, ticked when every case inside it
passes. Each line names the cases in a phrase, so a tester reading the checklist knows what
they are about to cover without opening the file.

Then a short cross-cutting section, the things no single scenario owns: keyboard navigation
and focus order, the mobile viewport, offline and reconnect behaviour, and installability
where it applies.

Then sign off: every scenario green or a defect filed, and the release notes drafted.

**A new scenario file is not finished until it has a line in the checklist.** A scenario nobody
walks is documentation, not QA.

## The defect report bar

Replacing every placeholder is the bar. Partial reports get handed back, because a defect
report that cannot be reproduced costs more than it saves.

```markdown
**Title:** [area] short summary in active voice
          e.g. "[till] cart total ignores modifier price"

**Severity:** P0 / P1 / P2 / P3
- P0 = release blocker; data loss or full feature break
- P1 = major flow broken with no workaround
- P2 = noticeable issue with a workaround
- P3 = polish, copy, minor usability

**Affects build:** commit hash, change number, or environment URL
**Browser / device:** e.g. Chrome 122 on macOS 14.4, or "iPhone 13, Safari, iOS 17"
**Tester:** name

## Repro steps
1. Sign in as ___ to ___
2. Navigate to ___
3. ___

## Expected
What should happen, AND where that expectation comes from: a scenario id, a criteria
document, prior behaviour, or a specification.

## Actual
What happened. Error text verbatim.

## Evidence
- Screenshots or video
- Console log excerpt
- Network log excerpt if it looks server shaped
- Automation trace if it reproduces from a journey

## Reproducibility
- [ ] Always
- [ ] Sometimes (estimate %): ___
- [ ] Once, could not reproduce after

## Notes
Recent related changes, account state, network conditions.
```

The field that does the real work is **"where that expectation comes from"**. A report whose
expected behaviour cites a scenario id is a disagreement between the software and an agreed
requirement, and it is not arguable. A report whose expected behaviour is the reporter's
opinion is a conversation, and it is worth knowing which one you have before the triage
meeting starts.

## Turning a manual case into a journey

When a manual case is automated, the manual case does not get deleted quietly. It is replaced
by a line naming the scenario id that now covers it, so the checklist keeps showing the full
surface and shrinking coverage is visible as a change rather than as an omission.
