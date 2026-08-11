# Getting started

A walkthrough of what this tool is for and how to work it. Ten minutes end to end. The rules it
enforces are in **The standard**, in the list beside this; this page is how the machinery works.

---

## What problem it solves

Acceptance criteria written up from software that already exists describe what the software
**appears** to do. Until a person confirms that is what it **should** do, a test citing them
proves the test runs, not that the requirement is right.

That gap is where defects hide. This tool makes it visible and cheap to close: every scenario
carries a status, the queue shows you only the unsettled ones, and moving one along is a
keystroke.

## The loop, in one picture

```
someone writes criteria      ->  @status:derived
you read one here            ->  press v when you have watched it happen
you confirm the intent       ->  press a
                                 it drops out of the queue for good
```

Everything else in the tool exists to make one of those three steps cheaper.

---

## 1. Point it at a project

From inside any working tree:

```bash
criteria-review here
```

That registers the tree, starts the server if it is down, and opens the page on this project.
One verb rather than three, and safe to run again, so it is the command to type on entering a
repository without checking anything first.

Give it a name when the directory name is not distinctive:

```bash
criteria-review here . playwright-worktree
```

Several trees can be registered at once, **including two checkouts of the same repository**. A
worktree and its main clone appear separately with separate counts, which is how you see what a
branch adds.

Nothing found? Criteria live in fenced ` ```gherkin ` blocks in any `.md` under an
`acceptance/` directory (`ui-qa/` also works, as a legacy alias).

## 2. Work the queue

The keyboard drives it. The bar along the bottom of the page is the whole cheat sheet:

| Key | Does |
|---|---|
| `j` / `k` | next / previous scenario |
| `a` | accept: this is what the software should do |
| `v` | verified: you watched it happen |
| `n` | write a note on it |
| `f` | fullscreen the recording |
| `r` | reload from disk |
| `/` | jump to the filter box |
| `s` | switch between the queue and this reading tab |

**Every action writes straight into the source markdown**, next to the scenario it is about.
There is no database. Your notes are sourced intent, which is the one thing that cannot be
reconstructed from the code later, so they belong in git beside what they annotate.

Statuses go up the ladder as you confirm more: `proposed` (written before the software existed),
`derived` (written up from what was built), `verified` (you watched it), `accepted` (confirmed as
what it should do). Accepted items leave the queue, so what stays on screen is exactly the
unsettled surface.

## 3. Watch, do not just read

Reading a scenario tells you the test says what the scenario says. Only watching the software
tells you the scenario describes something that can actually happen - and that is the failure a
side-by-side comparison cannot catch, because a scenario and its test can agree perfectly and
both be wrong.

Recordings are found by name:

```
<project>/qa/videos/<SCENARIO-ID>.webm
```

If no file is named for the scenario, the tool falls back to searching test output for a path
containing the id, and labels the result **matched, not named**. Treat that as a guess: accepting
a scenario on the strength of a video means trusting the video shows *that* scenario.

Filter by `has recording` / `no recording` to find what is unevidenced.

---

## 4. Talking to whoever owns the intent

Two flags, and they are not interchangeable. One flag could not say **whose** attention is owed,
and both sides would keep picking up the other's items.

| Flag | Raised by | Means |
|---|---|---|
| `@looknow` | an agent or a working session | the architect must look at this |
| `@review` | the architect saving a note | an agent must act on what they wrote |

The loop closes like this, and each step hands the item to exactly one side:

1. A session asks a question beside the scenario it is about:
   ```bash
   criteria-review ask CO-TYPES-006 myproject --message "Blank cell, or the word none?" --as claude
   ```
   That writes the question as a note and raises `@looknow`.
2. You answer in the same pane by writing a note. That raises `@review` and clears `@looknow`.
3. The session reads it with `criteria-review notes`, acts, and runs
   `criteria-review handled CO-TYPES-006`, which removes the discussion and raises `@looknow` so
   the item comes back to you for re-review.

**Acting on a flagged scenario clears the flag.** Accepting it, marking it verified, sending it
back, writing a note - each one is you looking, so none of them leaves a badge behind demanding
attention you have already given.

There is also `criteria-review push`, which changes what an open page is showing and never
touches disk. Use it when someone is at the screen; use a flag when the finding should wait for
the next review pass.

## 5. Generating the scenarios your tests cite

The last step, and the one that stops the criteria and the tests drifting apart:

```bash
criteria-review generate . --out tests/e2e/support/scenarios.generated.ts
criteria-review generate . --out tests/e2e/support/scenarios.generated.ts --check
```

A journey's step names are supposed to be the scenario's own Given/When/Then wording. Typing
those clauses into the test achieves that on the day it is written and leaves two copies with
nothing detecting an edit to either. Generating them instead means a reworded clause, a skipped
clause, an invented step and a renamed id are all **compile errors**.

Write and `--check` are separate commands on purpose: a gate that silently regenerated would hide
exactly the drift it exists to catch.

Full detail in **The emit contract**, and the step-by-step in **Adopting the standard**.

---

## Housekeeping

```bash
criteria-review status      # exits 1 when down, 0 when up
criteria-review list        # a summary in the terminal, touches nothing
criteria-review projects    # what is registered, and where
criteria-review stop | restart
```

The server exits on its own after two hours with no page open, so there is nothing to remember to
shut down. Starting it again is one command and costs nothing.

## Where to go next

- **The standard**, in the list beside this, if you are writing criteria rather than reviewing
  them. Start with its README.
- **Writing acceptance criteria** for the format itself: ids, tags, provenance, and what does not
  belong in the business tier.
- **Playwright journeys** for how a scenario becomes an automated journey that cites it.
