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

`criteria-review queue` returns what still needs a human decision, most important first: flagged
items, then grouped by document with the riskiest documents leading. The page uses the same
ordering from the same module. Reordering it in conversation leaves the architect looking at two
different "most important" and unable to tell which is right.

### 2. Show the scenario, do not summarise it

`criteria-review show <ID>` prints the title, status, persona, flags, intent, the Given/When/Then
clauses, and every note. Present all of it, including **an intent line that says it is missing**.
A scenario whose intent was never sourced is the most dangerous kind, because a test citing it can
never disagree with the software, and omitting the line makes it look fine.

A paraphrase is the reviewer confirming your rewrite rather than the criterion. The wording is the
requirement.

### 3. Their words are the note; their decision is the status

Prose in reply to a presented scenario is a note, written verbatim:

```bash
criteria-review note <ID> --message "<their words>"
```

Status moves are separate, named, and never taken unasked:

```bash
criteria-review accept <ID>                    # what the software SHOULD do
criteria-review verify <ID> --commit <sha>     # a person watched it happen
criteria-review reject <ID>                    # back to derived
```

`verify` refuses without a commit, deliberately: a verification with nothing behind it cannot be
checked and ages into a lie. Never offer it because a scenario looks plausible.

Write each answer **immediately**, not in a batch at the end. Review state lives in the documents,
not in a session that can end.

### 4. Two flags, and each hands the item to exactly one side

| Flag | Raised by | Means |
|---|---|---|
| `@looknow` | an agent, via `ask` or `flag` | the architect must look at this |
| `@review` | the architect writing a note | an agent must act on what they wrote |

An agent asks with `criteria-review ask <ID> --message "..."`, which puts the question beside the
scenario rather than in a transcript that scrolls away. It reads replies with
`criteria-review notes`, acts, then runs `criteria-review handled <ID>`, which clears the
discussion and hands the item back for re-review.

**Never clear `@review` by hand.** It is the architect's request, and `handled` is the only thing
entitled to retire it.

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
| [`skills/claude-code/criteria-lookup`](skills/claude-code/criteria-lookup/SKILL.md) | Looking a scenario up and answering it in conversation, and walking the queue one at a time |

## What deliberately is not here

**Anything about how a particular person likes to work.** When to interrupt them, how large a
review batch they want, which projects they have registered, where their repositories live. That
belongs in their own configuration, not in a tool other people use, or it reads as normative for
everyone who adopts this.
