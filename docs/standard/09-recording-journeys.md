# Recording a journey

How a passing journey becomes a video someone who has never seen the software can follow, and how
those videos become the delivery package.

**Written to be executed.** The steps below are exact because this is a procedure an agent runs
unattended, and every failure mode listed here has actually happened and is quiet: the run stays
green and produces a file that is unreadable, blank, or unlabelled. A checklist that only describes
the happy path would pass every one of them.

Why video at all is in [`01-qa-approach.md`](01-qa-approach.md) and
[`08-definition-of-done.md`](08-definition-of-done.md); this file is the mechanism.

---

## 0. Two speeds, one suite

**Tests run at full speed. Videos published for people run at a speed a person can follow.**

The authoritative run is as fast as the machine allows. It gates the work, it runs on every change,
and nothing about demonstration may slow it, loosen its budget, or change what it asserts. A journey
that takes eight seconds there is doing its job.

The published recording is the same journeys, the same assertions, the same code path, run at
roughly an order of magnitude slower so a person who has never seen the software can watch it and
understand what happened. That is not the same artefact serving two purposes badly; it is one
artefact run twice, with the only difference being an environment seam that nobody sets by default.

Two rules follow, and they are the ones most often broken in opposite directions:

- **Never pace the gating run for watchability.** Slow motion, holds and title cards are inert unless
  asked for. The moment a demonstration affordance costs the everyday suite a second per test, it
  will be removed by whoever is waiting on the build, and the demonstration goes with it.
- **Never publish a clip at test speed.** A recording that runs as fast as the suite is footage of a
  cursor flickering around an unfamiliar interface. It is cheaper to make and worth nothing, because
  the viewer cannot tell what happened, which is the entire reason the video exists.

A useful check on both: if the everyday suite got slower this week, something demonstration-only
became unconditional. If a set of clips runs in under a minute, it was filmed at test speed.

---

## 1. What the recording has to be

| Property | Value | Why it is not negotiable |
|---|---|---|
| Resolution | 1920x1080, video size 1:1 with the viewport | The runner's default video size is *the viewport scaled to fit inside 800x800*. A 1280x720 viewport becomes an 800x450 file, too soft to read the interface. |
| Length per clip | 20 to 30 seconds | Below that the pacing is not followable by someone new to the software. |
| Length per set | Around three to four minutes | The design rule is that an artefact is checkable in less time than it took to produce. |
| Naming | `<SCENARIO-ID>[-slug].webm` | A video not tied to a named scenario is only a recording: the viewer cannot tell what it is meant to prove. |
| Gating | Every recording affordance is inert unless asked for | A demo affordance must never slow, alter, or loosen the run that gates the work. |

**The recording run is a real pass, not a filming session.** It executes the same journeys with the
same assertions. If the wider layout breaks something, the run goes red rather than quietly filming
software nobody tested.

## 2. The three affordances, and what each one fixes

Raw footage of a fast headless run teaches nobody: it is a silent flicker of screens. Three things
turn it into a tutorial, and each exists because the previous one is not enough.

**A title card**, held at the start of each journey. It names the scenario id, the persona, the goal
in a person's words, and the situation that makes the goal meaningful. Painted from the test side
rather than added as a route in the application, so a demonstration affordance never becomes part of
the product's real surface. Removed explicitly rather than left for the first navigation to discard,
or a journey that asserts without navigating runs underneath a full-screen overlay and every locator
misses.

**A caption strip** naming what is happening now. The text is the step name, which is the scenario's
own clause, generated rather than retyped
(see [`04-playwright-journeys.md`](04-playwright-journeys.md)), so the narration and the criteria
cannot drift apart. There is no second script to maintain. Setup that is not a criterion is captioned
differently, so a viewer can tell the arrangement from the requirement.

**A hold after each step.** Slow motion paces *actions*, and the screen a viewer most wants to read
is the outcome, which is an assertion. Without an explicit hold the run pauses on the click and not
on the result.

All three read one environment seam and do nothing when it is unset. Failures inside them are
swallowed by design: a caption must never be able to turn a passing journey red.

## 3. The environment seam

```bash
E2E_VIDEO=1          # record; also forces the 1080p viewport and 1:1 video size
E2E_SLOWMO=900       # milliseconds between browser actions
E2E_CARD_MS=4500     # how long the opening title card holds
E2E_STEP_PAUSE=2000  # how long each step's outcome is held after it completes
```

Two details that look like fussiness and are not:

- **Video is opt-in by exact value** (`=== '1'`), not by presence. An accidentally exported empty
  variable would otherwise start writing files into every run's output.
- **The 1080p viewport applies only while recording.** The everyday run keeps its own viewport and
  stays fast. The cost, stated rather than hidden: a recording lays out at a different width from the
  gating run, so a responsive difference could in principle appear on film that the fast suite does
  not cover. What catches it is the recording being a full pass in its own right.

## 4. Timeouts, which is where the first recording fails

Slow motion pauses before every action and every step holds its outcome, so a journey that takes
eight seconds at full speed takes well over a minute on film. Against a 30 second per-test default
that is a timeout, and the failure is thoroughly misleading: the journey is healthy, the snapshot
shows it mid-stride, and the same spec is green in the authoritative run.

```
per-test timeout    30s normally, 300s while recording
per-action timeout  15s normally,  60s while recording
```

**The action timeout must stay comfortably below the per-test budget in both modes.** An action
timeout above the test timeout can never fire, and an unbounded one turns a stuck locator into
"test timeout exceeded" naming nothing at all, which costs a re-run under a trace to learn which
call was stuck.

## 5. Journeys that open their own browser context

A journey needing two sessions at once - showing one person refused while another is signed in -
creates its own context, and that context inherits **none** of the recording configuration.

The symptom is quiet and convincing: a video file is produced for every such test, of the unused
fixture page, so the recording exists, opens, and shows a blank screen. A thirty-second journey
produces a file of about 55KB.

So a journey creating its own context passes the recording options explicitly, and **puts the role in
the directory name**. The runner names video files after an internal page identifier, so two contexts
in one test produce two indistinguishable files and the only way to tell whose screen is whose is to
watch both. A handoff video nobody can label is not evidence.

## 6. The procedure

1. **Start from a clean database.** The chain journeys create the data they demonstrate; against a
   seeded or half-used database they either skip or film the wrong state.
2. **Run only the journeys being recorded, single worker.** Parallel workers interleave, and the
   videos come out of a shared output directory.
3. **Copy the files out of the runner's output directory immediately.** It is wiped at the start of
   every run, so the next headless run destroys them. This is the single most common way a recording
   session is lost.
4. **Rename each file to start with its scenario id.** That prefix is what maps a clip to a scenario.
5. **Keep a working index** of clip to scenario while the files are still fresh.
6. **Publish** (next section).

Do not re-record a whole set to replace one clip. One file per scenario, and a new run of that
journey replaces that file.

## 7. The package

The acceptance documents and the clips together, in one folder, assembled by **one command**.

```
<target>/<module>-<recording-date>/
  00-<Module>-Acceptance.pdf
  01-<SCENARIO-ID>-<slug>.webm
  02-<SCENARIO-ID>-<slug>.webm
  ...
  README.md
```

- Documents sort to the top; clips follow **in the order the acceptance document introduces their
  scenarios**. The numbering comes from the document, not from a list in the script, so adding a
  scenario and re-running is enough and there is no second ordering to keep in step.
- **A gap in the numbers is meaningful**: a scenario that is written down and has no recording. The
  README names those explicitly, and names any video that matched no scenario rather than dropping it
  silently.
- **The target folder is replaced, not merged.** A stale clip from a retired scenario sitting in a
  delivery folder is worse than no folder, because nothing about it says it is out of date.
- **Label the folder with the date of the recording, not today's date.** The package is evidence from
  a moment.

**If any part of the package needs doing by hand, fix the script rather than doing it by hand.** A
package assembled manually gets skipped exactly when the delivery is under pressure, which is the
failure the one-command rule is written against.

---

## 8. How to tell it went wrong

Each of these has happened. All of them leave the run green.

| Symptom | Cause | Fix |
|---|---|---|
| Video is soft, roughly 800x450 | The runner scaled the viewport to fit 800x800 | Force the recording viewport and a 1:1 video size |
| Video is blank, unusually small (tens of KB) | The journey opened its own context, which inherited no recording options | Pass recording options to that context explicitly |
| Two indistinguishable video files in one test | Both contexts named by internal identifier | Put the role in the output directory name |
| Journeys time out only while recording | Pacing exceeds the per-test budget | Raise the per-test timeout in watch mode only |
| Failure says "test timeout exceeded" and names no locator | Action timeout unbounded or above the test budget | Bound it, below the test budget, in both modes |
| Videos vanished before they were copied | The output directory is wiped at the start of every run | Copy immediately after the run, before anything else |
| A clip nobody can place | Filename carries no scenario id | Rename to lead with the id; never publish an unlabelled clip |
| The first assertion of a journey fails only on film | The title card was still overlaying the page | Remove the card explicitly rather than relying on navigation |
| Captions disagree with the acceptance document | Step names were retyped rather than generated | See [`04-playwright-journeys.md`](04-playwright-journeys.md) |
| The set runs under a minute | Filmed at test speed | Restore the pacing; a fast recording is not a cheap one, it is an unusable one |
| The everyday suite got slower | A demonstration affordance became unconditional | Put it back behind the seam; the gating run pays nothing for demonstration |

## 9. Before calling a recording session done

- [ ] Every clip opens, is 1080p, and is legible at full screen.
- [ ] Every clip starts with a title card naming its scenario id.
- [ ] Every caption matches the acceptance document's own wording.
- [ ] Every filename leads with a scenario id that exists.
- [ ] Every scenario in the document either has a clip or is named in the README as having none.
- [ ] No file in the package matched nothing.
- [ ] The clips run at human pace, and the authoritative suite is no slower than it was.
- [ ] The recording run itself was green, and the run was a full pass rather than a filming session.
- [ ] The package was produced by the command, not assembled.

A recording session that cannot tick the last two has produced footage, not evidence.
