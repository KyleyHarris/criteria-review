# CLAUDE.md

Guidance for an AI assistant working **on this repository's own code**. An assistant using the
tool in another project reads `AGENTS.md` instead; that file routes to the standard and the
commands and does not restate them. This one is about how changes to criteria-review itself are
made.

## Where things live

- `docs/standard/` is the acceptance-criteria standard the tool implements, versioned with it.
  A change to what the tool checks is a change to the standard first.
- `docs/decisions.md` is the append-only, id-ordered decision map. Every decision made, argued or
  agreed goes there with the options weighed and why the losers lost; it is the surface to check
  before asking "was this already decided?", and the surface to check drift against.
- `test/*.test.js` runs with `npm test`. A change ships with the test that would have caught its
  absence.
- `.claude/local/` is gitignored per-machine scratch (plans, personal notes). Nothing durable
  lives there.

## Working rhythm: units, context hygiene, resumption

<!-- rhythm: propagated from global CLAUDE.md -->

This section is the one place this file deliberately restates rules that also live in the
maintainer's global CLAUDE.md. It is duplicated on purpose: the global file is per-machine and
does not travel, and the working rhythm is the one body of rules a reader must be able to find in
the repo itself. The marker line above exists so drift checks can locate every copy. Everything
else here either inherits from global silently or registers an explicit override.

Optimise for **lean context per unit of work**. A long-running context degrades quality, so keep
the window holding only what the *next* step needs and move state that must survive a reset into
a file, not the conversation.

### The plan file (per-branch, gitignored)

The durable handoff between sessions is a **per-branch** plan file at
`.claude/local/plans/<branch-slug>.md` (slugify slashes: `fix/queue-order` becomes
`fix-queue-order.md`). Switch branches and the right plan loads itself.

- **Holds (live state):** what is DONE, the exact NEXT concrete steps (file-level where it
  matters), the resume pointer, and any constraint already hit. It is a log, updated as work
  progresses, not a one-shot.
- **Does NOT hold (durable design):** decisions and contracts the next unit must honour are
  promoted into committed `docs/` and the decision map (the source of truth: it travels, shows up
  in review, and survives a `/compact` that discards the plan). Never let a design decision live
  only in gitignored scratch.
- Before starting work, read the current branch's plan. If absent, scaffold one and confirm the
  unit breakdown with the maintainer.

### Units of work, not atoms

A **unit** is a coherent change sharing one mental model: same subsystem, shared types or
contract, or a single reviewable outcome. It is **not** the smallest possible edit.

- Run a unit to **completion in one context, including verification** (`npm test` passes, the
  change actually works). An unverified unit is not done and is not a clear boundary.
- Do **not** reset context between two changes that share state, types, or a contract; that
  forces a costly re-derivation.

### Handback: leave it uncommitted, present the commit note as the brief

**Do not create git commits at the end of a unit.** Leave the change in the working tree and hand
back for review. An uncommitted diff is materially easier to review than commit history: the
maintainer can read it whole, adjust or discard individual hunks, and author the commit.

Commits happen only when the maintainer explicitly asks ("commit this", "go commit", "ship it").
Never pre-stage or auto-commit on unit completion, a green build, or tests passing. "Just do it" /
"full send" waives the planning gate only, never this one.

At handback, present the **draft commit message** as the brief to be read, not a chat summary of
what was done. Cover: subject line; what changed and why; anything deliberately deferred; what
proved it (tests, run); and any intent comments added to pre-existing code, called out separately
because those are unverified claims about code neither party wrote today.

### Context-hygiene signals (emit these verbatim)

**At the end of a verified unit**, update the plan, then emit exactly:

```
─── UNIT COMPLETE ───
✅ <unit name> - verified (<what proved it: tests/build/run>)
📝 plan updated · next: <next unit name>
🧹 Recommend /clear now, then resume with:
   "Read the plan for this branch and start <next unit name>."
```

**Mid-unit, when context is heavy** with stale exploration or large tool output the next step
does not need, do **not** clear; emit:

```
─── CONTEXT HEAVY ───
♻️ Suggest /compact - stale exploration is diluting the working set.
   We're mid-unit (<unit name>), so keep the thread; just trim it.
```

`/compact` = same job, trim noise. `/clear` = new job, fresh window. **Never recommend `/clear`
mid-unit.** The agent signals; the maintainer runs the command.

### Resumption protocol

On any new session, the **first** action is to read the current branch's plan, restate the current
unit and the relevant decisions and constraints in a line or two, then proceed, without
re-exploring what the plan already records.
