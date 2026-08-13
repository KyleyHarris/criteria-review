# Agent instructions

Instruction sets for an AI assistant working with this tool, and ready-made packaging for the
harnesses that can load them directly.

**Take these into your own system.** They are written to be copied, not depended on: nothing here
imports anything, and an assistant that has read the protocol below can drive the tool from any
harness that can run a command.

---

## What an assistant needs to know

The whole protocol is four ideas. Everything in `skills/` is these, spelled out for one harness.

### 1. The queue is ordered, and the order is not yours to change

`npx criteria-review queue` returns what still needs a human decision, most important first: flagged
items, then grouped by document with the riskiest documents leading. The page uses the same
ordering from the same module. Reordering it in conversation leaves the architect looking at two
different "most important" and unable to tell which is right.

### 2. Show the scenario, do not summarise it

`npx criteria-review show <ID>` prints the title, status, persona, flags, intent, the Given/When/Then
clauses, and every note. Present all of it, including **an intent line that says it is missing**.
A scenario whose intent was never sourced is the most dangerous kind, because a test citing it can
never disagree with the software, and omitting the line makes it look fine.

A paraphrase is the reviewer confirming your rewrite rather than the criterion. The wording is the
requirement.

### 3. Their words are the note; their decision is the status

Prose in reply to a presented scenario is a note, written verbatim:

```bash
npx criteria-review note <ID> --message "<their words>"
```

Status moves are separate, named, and never taken unasked:

```bash
npx criteria-review accept <ID>                    # what the software SHOULD do
npx criteria-review verify <ID> --commit <sha>     # a person watched it happen
npx criteria-review reject <ID>                    # back to derived
```

`verify` resolves the commit from the project under review and reports which one it recorded, so a
verification is a word rather than a hash hunt. Never take it because a scenario looks plausible:
it asserts something about a person's own actions.

**When a scenario and the software disagree, the reviewer says which side is wrong.** That is the
case the standard exists to surface, and neither answer is a rejection. Put it to them as the WORK rather than as a verdict: **write the code to match this criterion**, or
**write the test to match the existing code**. The first keeps the criterion and `accept`s it -
`accepted` is a claim about intent, not implementation, so a journey citing it then goes red and
the defect surfaces in CI rather than in a list somebody has to remember. The second `reject`s it
back to `derived`, which is precisely what that status means: written up from the delivered
software. Both carry a note naming the work. Never pick between those two on their behalf; both artefacts are
self-consistent, so nothing you can read settles it.

**Checking a scenario against the source is evidence, not a verdict.** Report each `Then` clause as
supported, contradicted, or untraceable, with `file:line`, and say "read, not run" in those words -
citing a line proves a line was read, and only running the software proves the system does it.
Never promote a status off a code read: not `verified`, which claims a person watched it, and not
`accepted`, which is a claim about intent that the implementation has no standing to settle. A
finding worth keeping goes in as the agent's, via `ask`, which raises `@looknow` - it is a question
for the architect, not an instruction for an agent.

Write each answer **immediately**, not in a batch at the end. Review state lives in the documents,
not in a session that can end.

### 4. Two flags, and each hands the item to exactly one side

| Flag | Raised by | Means |
|---|---|---|
| `@looknow` | an agent, via `ask` or `flag` | the architect must look at this |
| `@review` | the architect writing a note | an agent must act on what they wrote |

An agent asks with `npx criteria-review ask <ID> --message "..."`, which puts the question beside the
scenario rather than in a transcript that scrolls away. It reads replies with
`npx criteria-review notes`, acts, then runs `npx criteria-review handled <ID>`, which clears the
discussion and hands the item back for re-review.

**Never clear `@review` by hand.** It is the architect's request, and `handled` is the only thing
entitled to retire it.

### A note on invoking it

Commands here use `npx criteria-review`, which resolves a project's pinned copy first and works
when there is no package context at all - the situation an agent is usually in.

**A GATE must not use `npx`.** It fetches from the registry when the package is absent, which puts
a network download inside the check and lets a missing dependency read as a pass. A gate resolves
`node_modules/.bin/criteria-review`, falls back to `PATH`, and fails when neither exists. See
`docs/standard/emit-contract.md`.

### 5. A plan holds ids; the documents hold everything else

`criteria-review plan` records which scenarios a task covers and nothing more - no titles, no
statuses, no todo list of its own. Every other fact is read live, so nothing here can go stale
and disagree with a document.

There is therefore **no "mark it done"**. A scenario is done when its status moved and a
journey cites it, which is a fact rather than a tick. `plan check` answers from the documents
and exits non-zero while anything declared is still outstanding, which makes it usable as a
delivery gate.

`--plan` is a scope beside `--since`: what I chose, versus what the branch touched.

### And one standing rule

**A session that edits an acceptance document regenerates before running tests.** Otherwise the
suite is proving the previous requirement. See `docs/standard/emit-contract.md`.

---

## Absorbing the packaged skills

`skills/claude-code/` holds ready-made skills. Two ways in, and the difference matters:

```bash
# Copy: portable, and yours to edit. Updates to this repo do not reach it.
cp -R agents/skills/claude-code/criteria-lookup ~/.claude/skills/

# Link: stays current with the tool. Machine-specific, so it is not something to commit
# into a config repo that has to work on another machine.
ln -s "$PWD/agents/skills/claude-code/criteria-lookup" ~/.claude/skills/criteria-lookup
```

On a different harness, read the skill as prose and express it in whatever form that harness takes
- a system prompt, a tool description, a rule file. The commands are the contract; the packaging is
not.

## What is here

| Skill | For |
|---|---|
| [`skills/claude-code/criteria-plan`](skills/claude-code/criteria-plan/SKILL.md) | Turning a task into a working list of scenarios: ask for the list, verify it, prepare it, then act on it |
| [`skills/claude-code/criteria-lookup`](skills/claude-code/criteria-lookup/SKILL.md) | Looking a scenario up and answering it in conversation, and walking the queue one at a time |

## What deliberately is not here

**Anything about how a particular person likes to work.** When to interrupt them, how large a
review batch they want, which projects they have registered, where their repositories live. That
belongs in their own configuration, not in a tool other people use, or it reads as normative for
everyone who adopts this.
