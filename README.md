# criteria-review

Review acceptance criteria across projects. Surfaces the scenarios that still need a human
decision, lets you annotate them, and writes the outcome back into the source documents.

## Why

Acceptance criteria written up from delivered software describe what the software *appears* to
do. Until someone confirms that is what it *should* do, a test citing them proves the test
runs, not that the requirement is right. The gap between those two states is where defects
hide, and making it visible is most of the value.

That only pays off if reviewing is cheap. This tool exists so the review is a queue you can
work through rather than a repo you have to go reading.

## Two roles

The tool assumes two participants and names them throughout:

- **The architect** is the person who decides what the software *should* do. Only they can
  accept a scenario, and only their own actions clear a request for their attention.
- **An agent** is a working session, human or AI, that writes criteria up from the software,
  runs the journeys, and acts on what the architect decides.

The distinction is load-bearing rather than decorative. The two attention flags route an item
by which side raised it, so it always sits with exactly one of them and neither keeps picking
up the other's work.

## The standard

**This repository owns the acceptance-criteria standard.** It lives in
[`docs/standard/`](docs/standard/) and defines how criteria are written, confirmed, cited by
tests and gated. Consumer projects conform to it and hold pointers rather than restatements; a
mirror cannot know its original changed, so it rots into a contradiction. See
[`docs/decisions.md`](docs/decisions.md) D-001.

The test for where a sentence lives: **does it stay true if the product is swapped for a
different one?** If yes it belongs to the standard; if no it stays with the project.

## The format

````markdown
```gherkin
@ONB-ADMIN-001 @status:verified @verified:2026-08-01 @commit:a1b2c3d4 @persona:Administrator
Scenario: The first administrator must set their own password before using the system
  Given a freshly installed system with no data beyond the bootstrap administrator
  When the administrator signs in with the password the system shipped with
  Then they are required to set a new password before reaching the application
```
````

| Tag | Meaning |
| --- | --- |
| `@<AREA>-<THING>-<NNN>` | Stable ID. The join between the document, the journey that proves it, and the API tests that cover it. |
| `@status:proposed` | Written at planning, before the software exists. A proposal, not a description. |
| `@status:derived` | Written up from delivered software. Describes what it appears to do. |
| `@status:verified` | A human watched the software do it. Carries `@verified:` and `@commit:`. |
| `@status:accepted` | Confirmed as what the software *should* do. |
| `@persona:<actor>` | Whose point of view the scenario is written from. |

An optional provenance comment records where the intent came from, which is what makes a review
pass affordable - attention goes to the inferred ones instead of spreading evenly:

```markdown
<!-- intent: docs/pos-architecture.md:214 -->
<!-- intent: INFERRED from implementation - needs confirmation -->
```

Scenarios with **no ID or no status still parse** and are reported as `untracked`. They are the
backlog, and dropping them would hide it.

## Recordings

Reading the criteria tells you the test says what the scenario says. Only watching the software
tells you the scenario describes something that can actually happen - and that is the failure a
side-by-side comparison cannot catch, because a scenario and its test can agree perfectly and
both be wrong.

**The convention: one file per scenario, named for it, in a fixed directory. A new run replaces
the old file.**

```
<project>/qa/videos/<SCENARIO-ID>.webm
<project>/qa/videos/LOCK-UNLOCK-001.webm
```

The producing side owns this. Playwright's own output is date- and hash-shaped
(`test-results/<sanitised-title>/video.webm`), which is fine for a CI artefact and wrong for
something a person opens repeatedly: the path changes every run, old recordings pile up, and
"the video for this scenario" stops being a question with one answer. A reel step should move
its recording to the fixed name when it finishes.

The directory sits **inside the project**, which is what ties a recording to its workspace: a
worktree filming its own branch writes into its own tree, and two worktrees cannot overwrite
each other's footage. Recordings are large binaries and belong in `.gitignore`.

Override the location per project in the config:

```json
{ "projects": [{ "name": "storefront", "path": "...", "videoDir": "ui/qa-videos" }] }
```

If no named file exists, the tool falls back to scanning `test-results/` and friends for a path
containing the scenario ID, and labels the result **matched, not named**. That keeps it useful
against suites that have not adopted the convention, while making clear that a fuzzy match is a
guess rather than evidence.

Filter the queue by `has recording`, `recording (named)`, or `no recording`. The player supports
seeking and fullscreen (`f`).

## Install

No dependencies and no build step. Node 20+.

```bash
git clone https://github.com/KyleyHarris/criteria-review.git
cd criteria-review
npm link          # puts `criteria-review` on your PATH
```

## Use

From whatever tree you are working in:

```bash
criteria-review here
```

Registers this tree, starts the server if it is down, and shows this project. One
verb rather than three, and idempotent, so it is safe to run on entering a repo.

```bash
criteria-review here . playwright-worktree   # name it when the directory is not distinctive
criteria-review status                        # exits 1 when down
criteria-review stop | restart
criteria-review list                          # terminal summary, touches nothing
criteria-review projects | add | remove
```

Several trees can be registered at once, **including two checkouts of the same
repo**. A worktree and its main clone are separate entries with separate counts,
which is how you see what a branch adds. They share one master video library,
correctly, because the recordings are of the same product.

### Lifetime

The server exits on its own after `--idle` minutes with no page open (default 120,
`0` disables). Tying it to an editor or agent session would be worse: several
sessions and tabs can be open at once, so the first to end would kill a server
another is using, and reference-counting sessions leaks a count on every abnormal
exit. Use is the honest signal, and restarting is cheap.

### Driving it from a session

```bash
criteria-review push --message "..." --filter status=proposed \
                     --highlight A,B --focus A --in <project>
criteria-review focus <ID> [project]
criteria-review refresh
criteria-review flag <ID> [project] | unflag <ID> [project]
criteria-review ask <ID> [project] --message "..." [--as name]
criteria-review notes                         # what the architect has written back
criteria-review handled <ID> [project]        # acted on it; hand the item back
```

`ask` writes the question as a note beside the scenario and raises `@looknow`, so the
architect answers where the thing being asked about is, rather than in a chat window
somewhere else. `flag` says "look at this" and carries no words; `push` carries words
and evaporates on reload. Neither can ask a question that is still there an hour later.

Push is transient - it changes what a page shows, never disk. `@looknow` is the
durable channel, because it lives in the document and survives a reload.

`notes` is the only channel that runs server to session, and it is a pull: push
reaches a browser, not an agent, so without it a session could discover the
architect's feedback only by accident. Run it when you enter a repo. It prints every
outstanding note and every scenario tagged `@review`.

Projects are registered once in `~/.config/criteria-review/config.json`, so the command works
from any directory. With nothing registered it falls back to the current directory.

Criteria are found by convention: any `.md` file under an `acceptance/` directory (or `ui-qa/`,
a recognised legacy alias). `README.md` files in those directories are skipped, because they
document the format and their examples are not real criteria.

### Generating scenarios for a test suite to cite

```bash
criteria-review generate . --out tests/e2e/support/scenarios.generated.ts
criteria-review generate . --out tests/e2e/support/scenarios.generated.ts --check
criteria-review generate . --out build/scenarios.json --format json
```

A journey's step names must be the scenario's own Given/When/Then wording. Typing those clauses
into the test achieves that on the day it is written and makes two copies with nothing detecting
an edit to either. Generating them instead means a reworded clause, a skipped clause, an invented
step and a renamed id are all **compile errors** on the consumer's side rather than silent
divergence.

Write and `--check` are separate on purpose: a gate that silently regenerated would hide exactly
the drift it exists to catch. The generated file is committed, so a consumer builds and tests
without this tool present.

Full contract: [`docs/standard/emit-contract.md`](docs/standard/emit-contract.md).

### In the UI

`j`/`k` move through the queue, `a` accepts, `v` marks verified, `n` adds a note, `f` fullscreens
the recording, `r` reloads, `/` filters. Every action writes straight to the source markdown.

Notes open a multi-line editor rather than a one-line box, because the architect is discussing an
item, not labelling it. They are rendered back in the detail pane with their author and date, and
"Mark handled" retires them once the discussion is closed. A note that is written and never shown
again is indistinguishable from no note.

The page updates itself when the documents change on disk. That is not for its own writes, which
already refresh the page that made them: it is for a DIFFERENT session editing the same files. An
agent working in a repo can write `@looknow` on a scenario and it appears in the open queue,
without the reviewer knowing to press reload. A flag nobody sees is the same as no flag.

Server-sent events, watching only the directories that hold criteria. The selection is preserved
by scenario identity rather than position, because an external edit can reorder the queue and
restoring by position would move the reviewer onto a different scenario than the one they were
reading.

### Attention, in both directions

Two flags, because one cannot say *whose* attention is owed and each side would keep picking up
the other's items:

| Flag | Raised by | Means |
| --- | --- | --- |
| `@looknow` | an agent: the tag by hand, `criteria-review flag`, or asking a question | the architect must look at this |
| `@review` | the architect saving a note | an agent must act on what they wrote |

**A note is a message, and the author decides which way it travels.** The architect's note raises
`@review` and hands the item to an agent; an agent's note is a question and raises `@looknow`,
handing it back. Routing on the author rather than on the act of writing is what stops the loop
stalling: a flag that pointed at the side that wrote it would leave both believing the item was
with the other.

So the loop closes: an agent asks with `criteria-review ask`, which writes the question and raises
`@looknow`; the architect answers in the same pane, which raises `@review` and clears `@looknow`;
the agent reads it with `criteria-review notes`, acts, and runs `criteria-review handled <ID>`,
which removes the discussion and raises `@looknow` so the item returns for re-review. Each step
hands the item to exactly one side, and the tag line always says which.

Add a bare `@looknow` to a scenario's tag line:

```gherkin
@ONB-MEMBER-001 @status:derived @persona:Administrator @looknow
```

That is the whole mechanism. An agent already editing these documents needs no API. Flagged
scenarios jump the document grouping and show a LOOK NOW badge, because grouping optimises a
steady review pass and a flag means someone wants eyes on it before that pass arrives. Filter to
them with the status dropdown.

**Acting on a flagged scenario clears the flag.** Accepting it, marking it verified, sending it
back to derived, writing a note or clearing notes all answer the request, because each one is the
architect looking. A flag that had to be dismissed separately would survive the action that
answered it, and a queue that keeps presenting items already dealt with teaches you to ignore the
one badge meant to jump it. The button is still there for a scenario you want to clear without
otherwise touching. Only the architect's own actions clear it: an agent writing to the same
scenario cannot retire a flag it raised, which is what lets `handled` hand an item back.

## Writes

Review state lives in the criteria files, not in a sidecar database. Your notes are sourced
intent, which is the one thing that cannot be reverse-engineered later, so it belongs in git
next to the scenario it annotates.

Writes are surgical: one tag line, or one inserted comment, and every other byte left alone.
After writing, the file is re-parsed and the intended change asserted; a write that cannot
prove it did what it claimed restores the file and reports an error.

The server binds to loopback only. It reads and writes your documents and is not something to
expose on a network interface.

## Tests

```bash
npm test
```

45 tests over the parser, the write path and the clause generator, with no test dependencies
beyond Node's own runner.

The write path is the risky part, so its tests were proved able to fail rather than merely
written: mutating the scenario resolver to return the wrong scenario turns two of them red, and
restoring it returns the suite to green. A test never observed failing is an untested test.

## Licence

MIT. See [`LICENSE`](LICENSE).

The standard in [`docs/standard/`](docs/standard/) is covered by the same licence: use it,
adapt it, instantiate it for your own domain. What it deliberately does not carry is any
project's own instance data, which stays with that project.
