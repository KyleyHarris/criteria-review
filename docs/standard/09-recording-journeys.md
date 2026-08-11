# Recording a journey

How a passing journey becomes a video someone who has never seen the software can follow, and how
those videos become the delivery package.

**Written to be executed.** The steps below are exact because this is a procedure an agent runs
unattended, and every failure mode listed here has actually happened and is quiet: the run stays
green and produces a file that is unreadable, blank, or unlabelled. A checklist that only describes
the happy path would pass every one of them.

Section 8 carries working sample plumbing. Its **contract** is normative; the code is a reference
implementation in one stack, and porting means meeting the contract rather than matching the code.

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

## 8. The plumbing

### What is normative, and what is an example

**The contract below is the standard. The code after it is one reference implementation.**

The sample is TypeScript against a browser-automation runner that exposes slow motion through launch
options, video through context options, and a `step` primitive. That is one stack, and its shape
shows in every line: the module layout, the fixture arrangement, the `evaluate`-into-the-page trick
for painting an overlay. A different runner, language, or test framework meets the same contract
differently, and a port that reproduces the code without meeting the contract has copied the
accidents rather than the design.

An implementation on any stack must:

1. **Read one seam that is unset by default**, so nothing here can affect the authoritative run.
2. **Force the recording resolution and a 1:1 capture size**, and apply that only while recording.
3. **Paint an opening card** carrying the scenario id, persona, goal and situation, from the test
   side rather than as a route in the product, and **remove it before the first assertion**.
4. **Caption each step with the scenario's own clause text**, taken from the generated module rather
   than retyped, and caption non-clause setup differently.
5. **Hold the screen after a step completes**, because the runner's pacing affects actions and the
   outcome is an assertion.
6. **Raise the per-test budget only while recording**, and keep the per-action budget below it in
   both modes.
7. **Give any separately-created browser context the recording options explicitly**, and put the
   role in the output path.
8. **Fail loudly when a journey has no persona**, rather than filming an unidentifiable clip.
9. **Take the step order from the document**, not from the order the bodies were written in.
10. **Never let a demonstration affordance fail a journey.** Swallow its errors.

Everything that is not in that list is free: colours, fonts, element ids, module names, where the
files live, and whether the pieces are four modules or one.

### The reference implementation

Four modules and one config change, in dependency order, generalised from a working suite. Copy them
if the stack matches, and keep the comments that state a constraint.

### `support/watch-mode.ts` - the seam everything else reads

```ts
/** Milliseconds paused between browser actions. 0 (the default) disables slow motion. */
const slowMo = Number(process.env.E2E_SLOWMO ?? 0);

/**
 * The size a RECORDING runs and is captured at.
 *
 * Stated explicitly because the runner's default video size is the viewport scaled to fit inside
 * 800x800, which turns a 1280x720 viewport into an 800x450 file: far too soft to read.
 */
const RECORDING_VIEWPORT = {
  width: Number(process.env.E2E_VIEWPORT_WIDTH ?? 1920),
  height: Number(process.env.E2E_VIEWPORT_HEIGHT ?? 1080),
};

/** Opt in by EXACT value, so an accidentally exported empty variable records nothing. */
const recording = process.env.E2E_VIDEO === '1';

/**
 * Spread into a config's `use`. When not recording it carries NO viewport key at all, so a
 * project's own viewport survives the spread and the everyday run is exactly as it was.
 */
export const watchModeUse = recording
  ? {
      launchOptions: { slowMo },
      viewport: RECORDING_VIEWPORT,
      video: { mode: 'on', size: RECORDING_VIEWPORT }, // 1:1, so nothing is downscaled
    }
  : { launchOptions: { slowMo }, video: 'off' };

/** Read from the environment on EVERY call, not captured at load, so a test can drive it. */
export function isWatchModeActive(): boolean {
  return Number(process.env.E2E_SLOWMO ?? 0) > 0 || process.env.E2E_VIDEO === '1';
}

// Raised only while watching or recording. The authoritative run keeps the tight budget, which is
// the point: a demo affordance must never loosen what the real run is held to.
export const watchModeTimeout = isWatchModeActive() ? 300_000 : 30_000;
export const watchModeActionTimeout = isWatchModeActive() ? 60_000 : 15_000;

/**
 * Options a journey must pass when it creates its OWN browser context, so that context is recorded
 * and sized like every other one. Without this the file exists, opens, and is blank.
 *
 * The role goes in the DIRECTORY name because the runner names video files after an internal page
 * identifier, so two contexts in one test are otherwise indistinguishable.
 *
 * @param outputPath pass `test.info().outputPath` so this module needs no dependency on the runner.
 */
export function recordingContextOptions(
  role: string,
  outputPath: (...segments: string[]) => string
): Record<string, unknown> {
  if (!recording) return {};
  return {
    viewport: RECORDING_VIEWPORT,
    recordVideo: { dir: outputPath(`video-${role}`), size: RECORDING_VIEWPORT },
  };
}

/**
 * Hold the current screen so a person can read it.
 *
 * This is the gap slow motion leaves: it pauses between ACTIONS, so a journey that clicks Save and
 * then asserts spends its pause on the click and none of it on the outcome. The screen a viewer
 * most wants to read is exactly the one nothing pauses on.
 */
export async function watchPause(
  page: { waitForTimeout(ms: number): Promise<void> },
  factor = 1
): Promise<void> {
  if (!isWatchModeActive()) return;
  const base = Number(process.env.E2E_STEP_PAUSE ?? 1800);
  if (base <= 0) return;
  await page.waitForTimeout(Math.round(base * factor));
}
```

### `support/title-card.ts` - the card and the caption

The painters run INSIDE the browser, so they are serialised and may not reference anything from
module scope. That is why the element id is written out literally in each one and the styles are
inline: the card frequently renders on a blank page where the application's stylesheet does not
exist.

```ts
import type { Page } from '@playwright/test';
import { isWatchModeActive } from './watch-mode';

export type JourneyBrief = {
  persona: string;   // who is at the keyboard, in words a viewer would recognise
  useCase: string;   // what they are trying to get done, as a goal not a test action
  context: string;   // the situation that makes the goal meaningful
  scenarioId?: string;
};

const HOLD_MS = Number(process.env.E2E_CARD_MS ?? 2600);

/** Paint, hold, remove. A no-op unless watch mode is on, so every spec can call it safely. */
export async function showTitleCard(page: Page, brief: JourneyBrief): Promise<void> {
  if (!isWatchModeActive()) return;
  try {
    await page.evaluate(paintCard, brief);
    await page.waitForTimeout(HOLD_MS);
    // Removed explicitly rather than left for the first navigation to discard: a journey that
    // asserts WITHOUT navigating would otherwise run under a full-screen overlay and miss.
    await page.evaluate(removeCard);
  } catch {
    // Page closed or navigated mid-paint. Decoration must never fail a journey.
  }
}

export async function showStepCaption(
  page: Page,
  text: string,
  options: { muted?: boolean } = {}
): Promise<void> {
  if (!isWatchModeActive()) return;
  try {
    await page.evaluate(paintCaption, { text, muted: options.muted ?? false });
  } catch {
    /* never fail a journey */
  }
}

export async function clearStepCaption(page: Page): Promise<void> {
  if (!isWatchModeActive()) return;
  try {
    await page.evaluate(removeCaption);
  } catch {
    /* as above */
  }
}

/** Runs INSIDE the browser. Self-contained by necessity. */
function paintCard(brief: JourneyBrief): void {
  document.getElementById('qa-title-card')?.remove();

  const card = document.createElement('div');
  card.id = 'qa-title-card';
  card.setAttribute('role', 'presentation');
  card.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'display:flex', 'flex-direction:column',
    'align-items:flex-start', 'justify-content:center',
    'gap:1.25rem', 'padding:clamp(2rem,7vw,6rem)',
    'background:linear-gradient(135deg,#0b1220 0%,#152238 55%,#1d2f4d 100%)',
    'font-family:system-ui,-apple-system,sans-serif', 'color:#f4f7fb',
    'opacity:0', 'transition:opacity 320ms ease', 'pointer-events:none',
  ].join(';');

  // The scenario id leads: it is what makes the recording identifiable afterwards.
  if (brief.scenarioId) {
    const id = document.createElement('div');
    id.textContent = brief.scenarioId;
    id.style.cssText =
      'font-family:ui-monospace,Menlo,monospace;font-size:clamp(0.8rem,1.4vw,1rem);' +
      'letter-spacing:0.08em;color:#7dd3fc';
    card.appendChild(id);
  }

  const persona = document.createElement('div');
  persona.textContent = brief.persona;
  persona.style.cssText =
    'display:inline-block;padding:0.4rem 0.9rem;border-radius:999px;' +
    'background:rgba(96,165,250,0.18);border:1px solid rgba(96,165,250,0.45);' +
    'color:#bfdbfe;font-size:clamp(0.85rem,1.5vw,1.05rem);font-weight:600;' +
    'letter-spacing:0.04em;text-transform:uppercase';

  const useCase = document.createElement('div');
  useCase.textContent = brief.useCase;
  useCase.style.cssText =
    'font-size:clamp(1.9rem,4.6vw,3.4rem);font-weight:700;line-height:1.15;max-width:20ch';

  const rule = document.createElement('div');
  rule.style.cssText =
    'width:5rem;height:4px;border-radius:2px;background:linear-gradient(90deg,#60a5fa,#a78bfa)';

  const context = document.createElement('div');
  context.textContent = brief.context;
  context.style.cssText =
    'font-size:clamp(1rem,1.9vw,1.35rem);line-height:1.55;color:#aebed4;max-width:52ch';

  card.append(persona, useCase, rule, context);
  document.body.appendChild(card);
  // Next frame, so the transition has a start value to animate from rather than snapping in.
  requestAnimationFrame(() => { card.style.opacity = '1'; });
}

function removeCard(): void {
  document.getElementById('qa-title-card')?.remove();
}

/** Runs INSIDE the browser. Same serialisation constraint. */
function paintCaption(caption: { text: string; muted: boolean }): void {
  const id = 'qa-step-caption';
  let strip = document.getElementById(id);
  if (!strip) {
    strip = document.createElement('div');
    strip.id = id;
    strip.setAttribute('role', 'presentation');
    document.body.appendChild(strip);
  }
  // Restyled on EVERY paint, not only on creation: one strip is reused and a journey alternates
  // between clauses and asides.
  strip.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483646',
    'padding:0.85rem clamp(1rem,4vw,3rem)',
    'background:linear-gradient(0deg,rgba(8,14,24,0.94),rgba(8,14,24,0.82))',
    // The accent bar and full-strength text mark a sentence as the criterion being proved; setup
    // gets neither, so the two are distinguishable in a still frame.
    caption.muted ? 'border-top:1px solid rgba(148,163,184,0.35)' : 'border-top:2px solid #60a5fa',
    'font-family:system-ui,-apple-system,sans-serif',
    'font-size:clamp(0.95rem,1.7vw,1.25rem)', 'line-height:1.4',
    caption.muted ? 'color:#94a3b8' : 'color:#f4f7fb',
    caption.muted ? 'font-style:italic' : 'font-style:normal',
    'pointer-events:none',
  ].join(';');
  strip.textContent = caption.text;
}

function removeCaption(): void {
  document.getElementById('qa-step-caption')?.remove();
}
```

### `support/narrated-step.ts` - a step that narrates itself

```ts
import { test } from '@playwright/test';
import { showStepCaption } from './title-card';
import { watchPause } from './watch-mode';

/**
 * Outside watch mode this is exactly `test.step`: same name, same reporting, no extra time.
 *
 * The narration IS the step name, which is the scenario's own clause, so what a viewer is told and
 * what the journey proves are the same string and no second script exists that could drift.
 */
export async function narratedStep(
  page: Page,
  name: string,
  body: () => Promise<void>,
  options: { hold?: number } = {}
): Promise<void> {
  await test.step(name, async () => {
    await showStepCaption(page, name);
    await body();
    // Painted again before the hold, because a step that navigates destroys the first one along
    // with the rest of the document, and the hold is exactly when the caption is being read.
    await showStepCaption(page, name);
    await watchPause(page, options.hold ?? 1);
  });
}
```

### `support/journey.ts` - binding a test to the scenario it proves

The one non-obvious constraint, and it will bite an implementer immediately: **the runner reads a
test's fixture list out of the source text of its callback's destructuring pattern.** It insists on a
literal pattern and rejects `async (args) => ...`. A generic factory cannot write that pattern
because it cannot know which fixtures a suite wants, so registration is pushed out to the suite,
where the destructuring can be literal.

That also matters for correctness, not just types: the suite's own `test` object carries its auto
fixtures, and `test.use` / `test.skip` / `beforeEach` are declared on it at describe scope. A journey
registered against the base object silently sits outside all of it.

```ts
import { test as base, type Page } from '@playwright/test';
import { SCENARIOS, type Clause, type ScenarioKey } from './scenarios.generated';
import { narratedStep } from './narrated-step';
import { showStepCaption, showTitleCard, clearStepCaption } from './title-card';

export type JourneyIntro = {
  useCase: string;
  context: string;
  /** Optional: the scenario's own `@persona:` is used when it has one, and this overrides it. */
  persona?: string;
};

export type JourneyRegistrar<Args> = (
  title: string,
  run: (args: Args) => Promise<void>
) => void;

export function createJourney<Args extends { page: Page }>(register: JourneyRegistrar<Args>) {
  function journey<K extends ScenarioKey>(
    key: K,
    intro: JourneyIntro,
    steps: { [C in Clause<K>]: (args: Args) => Promise<void> }
  ): void {
    const scenario = SCENARIOS[key];
    const persona = intro.persona ?? scenario.persona;
    if (!persona) {
      // Thrown at registration rather than defaulted, because a blank persona is invisible in the
      // one place it matters: a recording handed to someone who was not in the room.
      throw new Error(
        `Journey ${scenario.tag} has no persona. Give one in the intro, or add @persona: to the ` +
          `scenario in ${scenario.source}.`
      );
    }

    register(`${scenario.tag} ${scenario.title}`, async (args) => {
      await showTitleCard(args.page, {
        scenarioId: scenario.tag,
        persona,
        useCase: intro.useCase,
        context: intro.context,
      });

      // The DOCUMENT decides the order, not the object literal: "Then" after "When" is a claim
      // about sequence and part of the criterion.
      for (const clause of scenario.steps) {
        await narratedStep(args.page, clause, () => steps[clause](args));
      }

      // Leaving the caption up past the last clause would caption teardown with the final
      // assertion's sentence.
      await clearStepCaption(args.page);
    });
  }

  return { journey };
}

/**
 * A narrated step that is NOT one of the scenario's clauses: setup a journey performs but is not
 * proving. Captioned in the muted style and named `aside:` in the report, so neither a viewer nor a
 * reader comparing steps against criteria is misled about which is which.
 */
export async function aside(page: Page, name: string, body: () => Promise<void>): Promise<void> {
  await base.step(`aside: ${name}`, async () => {
    await showStepCaption(page, name, { muted: true });
    await body();
  });
}
```

### Wiring it in the suite and the config

One line per spec file, which is also where the fixture set a journey receives becomes visible:

```ts
// in a spec, or in a shared fixtures module for the suite
import { test } from './fixtures';           // the suite's OWN test object
import { createJourney } from './support/journey';

const { journey } = createJourney<{ page: Page; api: ApiClient }>((title, run) =>
  test(title, async ({ page, api }) => run({ page, api }))   // literal pattern, deliberately
);
```

```ts
// playwright.config.ts
import { watchModeUse, watchModeTimeout, watchModeActionTimeout } from './support/watch-mode';

export default defineConfig({
  timeout: watchModeTimeout,
  use: {
    actionTimeout: watchModeActionTimeout,
    ...watchModeUse,
  },
  projects: [
    {
      name: 'chromium',
      // watchModeUse LAST: a device preset carries its own viewport, and a project's `use` wins
      // over the config's, so spreading it here is what makes the recording viewport take effect.
      use: { ...devices['Desktop Chrome'], ...watchModeUse },
    },
  ],
});
```

### Recording, then publishing

```bash
# 1. Clean state. The journeys create the data they demonstrate.
#    2. Single worker: parallel workers interleave into one output directory.
E2E_VIDEO=1 E2E_SLOWMO=900 E2E_CARD_MS=4500 E2E_STEP_PAUSE=2000 \
  npx playwright test --workers=1 <the journeys being recorded>

# 3. Copy the .webm files OUT of the runner's output directory before anything else runs.
#    4. Rename each to lead with its scenario id.
# 5. Publish.
```

The publish step is a script, not a manual assembly, and its contract is section 7. Everything it
needs is already in the emitted scenario module: the ids, the titles, and the order the acceptance
document introduces them.

---

## 9. How to tell it went wrong

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

## 10. Before calling a recording session done

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
