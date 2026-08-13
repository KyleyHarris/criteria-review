---
name: criteria-bundle
description: Record narrated videos for the scenarios in the current plan or added on this branch, and assemble them with their acceptance documents into a delivery package. Runs the journeys at human-viewable pacing at 1080p, names each clip for the scenario it proves, and reports every scenario that has no recording rather than shipping a package that looks complete. Use when the architect says "record these", "bundle the videos", "make the handoff package", or a task is finished and needs its evidence.
---

# Record and bundle the evidence

A test count is a claim about the software. A video is the software. This produces the second
kind, for the scenarios a task actually covered.

The full procedure, its failure modes and the reference plumbing are in the standard's
**Recording a journey** (`npx criteria-review guide` lists it, and the reading tab renders it).
This skill is how to run it and what to refuse.

---

## The rule that governs the whole thing

**Tests run at full speed. Videos published for people run at a speed a person can follow.**

Same journeys, same assertions, same code path, run twice, with an environment seam nobody sets
by default as the only difference. Two ways to get it wrong, and they are opposite:

- Pacing the gating suite for watchability gets the affordance deleted by whoever is waiting on
  the build, and the demonstration goes with it.
- Publishing a clip at test speed produces footage of a cursor flickering around an unfamiliar
  interface: cheaper to make and worth nothing, because the viewer cannot tell what happened.

If a set of clips runs in under a minute, it was filmed at test speed. If the everyday suite got
slower this week, something demonstration-only became unconditional.

## 1. Decide the scope, and say what it is

```bash
npx criteria-review queue --plan      # what this task covers
npx criteria-review queue --since main   # what this branch added
```

Ask which, rather than assuming. A package labelled as a task's evidence that quietly contains
the whole suite is misleading in the direction that matters.

Then name the ones with no journey. **They cannot be recorded, and that is the finding** - a
scenario with no journey is not evidence missing from the package, it is coverage missing from
the work. Report it before recording rather than after.

## 2. Record

From a clean database, single worker, only the journeys in scope:

```bash
E2E_VIDEO=1 E2E_SLOWMO=900 E2E_CARD_MS=4500 E2E_STEP_PAUSE=2000 \
  npx playwright test --workers=1 <the journeys in scope>
```

Environment variable names are the project's own - read its watch-mode module rather than
assuming these. What must be true, whatever they are called: **1080p at a 1:1 capture size**,
per-test timeout raised for the recording run only, and every demonstration affordance inert
when the seam is unset.

**The recording run is a real pass, not a filming session.** Same assertions. If it goes red,
you have found something, and filming stops until it is understood - a green suite and a red
recording of the same journeys means the wider viewport broke something.

## 3. Copy the files out immediately

The runner wipes its output directory at the start of every run, so the next headless run
destroys them. This is the single most common way a recording session is lost, and it is
unrecoverable except by recording again.

Then rename each to lead with its scenario id, which is what maps a clip to a criterion.

## 4. Check each clip before it goes anywhere

Open them. A recording session that produced files is not a recording session that produced
evidence, and every one of these failures leaves the run green:

- **Blank, and unusually small** - the journey opened its own browser context, which inherited
  no recording options. A thirty-second clip of about 55KB is this.
- **Soft, roughly 800x450** - the runner scaled the viewport into its default 800x800 box.
- **Two indistinguishable files from one test** - two contexts, both named by internal id.
- **No title card**, or captions that do not match the document's wording.

## 5. Assemble

Documents first, clips in the order the acceptance document introduces their scenarios:

```
<target>/<area>-<recording date>/
  00-<Area>-Acceptance.pdf
  01-<SCENARIO-ID>-<slug>.webm
  ...
  README.md
```

- **The numbering comes from the document**, not from a list you keep, so adding a scenario and
  re-running is enough.
- **A gap in the numbers is meaningful** - a scenario written down with no recording. The README
  names those, and names any clip that matched no scenario rather than dropping it.
- **Replace the target folder, do not merge.** A stale clip from a retired scenario is worse
  than no folder, because nothing about it says it is out of date.
- **Label it with the date of the recording, not today's.** The package is evidence from a
  moment.

**Known gap, and say it rather than hiding it:** the tool has no `package` command yet, so this
step is assembled by a project script or by hand. The standard's own rule is that a package
assembled by hand gets skipped exactly when the delivery is under pressure. If you are doing it
by hand, say so in the report and recommend the script.

## 6. Report

```
6 scenarios in scope
  5 recorded, checked, packaged to <path>
  1 has no journey - LOCK-OPEN-002 - not recorded, and not covered
  package assembled by hand (no package command); recommend scripting it
```

Never promote a status because a recording exists. A video is what lets a person promote one
themselves in `criteria-lookup`, watching it - which is what `verified` has always meant.
