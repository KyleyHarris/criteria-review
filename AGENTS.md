# For an AI assistant working with criteria-review

**Point any assistant at this file.** It is the entry point: enough to work correctly from
immediately, and instructions for loading the rest on demand.

It deliberately **routes rather than restates**. Everything here is either a command or a rule
that cannot be discovered by running one. The standard itself is long, versioned and lives in
the package - copying it into this file would create a second copy that goes stale, which is the
exact failure the whole tool exists to prevent.

```bash
npx criteria-review guide     # the agent protocol, in four ideas
npx criteria-review here      # register this tree, start the review page
npx criteria-review --version # what is installed, and which standard it implements
```

---

## What this is for

Acceptance criteria written up from delivered software describe what the software **appears** to
do. Until a person confirms that is what it **should** do, a test citing them proves the test
runs, not that the requirement is right.

That gap is where defects hide. This tool makes it visible and cheap to close, and everything
below follows from it.

## The six things to get right

**1. Never invent intent.** Code contains what a system does, never why anyone wanted it. Cite a
source or write `INFERRED`. An assistant asked to document intent while reading only the
implementation will produce it fluently, plausibly and fabricated - that is the default
behaviour, not a risk to be careful about.

**2. Never promote a status.** `verified` claims a person watched the software do it. `accepted`
is a claim about intent. Neither belongs to an assistant, least of all about its own work.

**3. Never edit a criterion to make a test pass.** It is the one failure that is both easy and
invisible: the suite goes green, the requirement quietly became whatever the code already did,
and nobody can see it happened. When a criterion is wrong, raise it and stop:

```bash
npx criteria-review ask <ID> --message "..." --as <who>
```

**4. Regenerate after editing an acceptance document**, before running any test. Otherwise the
suite is proving the previous requirement.

**5. Show the scenario, do not summarise it.** The wording is the requirement. A paraphrase is
the reviewer confirming your rewrite rather than the criterion.

**6. Place a new scenario in the walkthroughs.** Criteria are filed by feature, which is how
work arrived; a customer is shown the product by menu and page, which is not the same shape.
`criteria-review present place <ID>` recommends where a new scenario belongs, and
`present check` reports what nobody placed. This is part of done - stage 6a - and shared
between whoever wrote the scenario and QA, because a presentation assembled at delivery is
assembled under time pressure.

## The commands worth knowing

```bash
criteria-review queue [--plan] [--task X] [--since main]   what needs a decision
criteria-review show <ID>                                  one scenario, in full
criteria-review note <ID> --message "..."                  record a decision
criteria-review accept|verify|reject <ID>                  a person's judgement only
criteria-review generate . --out <path>                    emit clauses for tests to cite
criteria-review terms [check]                              the glossary
criteria-review present [list|show|check|place <ID>]       product-shaped walkthroughs
criteria-review plan set|add|show|check                    what a task covers
criteria-review manifest --out <file>                      evidence index
criteria-review status                                     0 current · 1 down · 2 stale
```

**`status` exits 2 when the running server is older than what is installed**, so
`criteria-review status || criteria-review restart` is the check to run before trusting a page.

## Two directions of work, and they are opposites

Confusing them produces criteria that look right and mean the reverse.

**Forward** - somebody wanted something, the software does not exist yet. Intent first, criteria
from it, tests prove them, code satisfies them. A test disagreeing with its criterion is **a
defect in the software**.

**Reverse** - the software exists, nobody wrote down what it promises. Behaviour first, criteria
derived from it, intent inferred and unconfirmed. A test disagreeing with its criterion means
**you observed it wrongly**.

Ask for "criteria for the payments module" when payments already exists and the right answer is
the reverse direction, not the forward one.

## The skills

Nine, shipped in the package at `agents/skills/claude-code/`, and written to be copied into any
assistant that can run a command. `criteria-help` routes between them by situation.

```bash
cp -R node_modules/criteria-review/agents/skills/claude-code/* ~/.claude/skills/
```

On another harness, read them as prose and express them in whatever form it takes - a system
prompt, a rule file, a tool description. **The commands are the contract; the packaging is not.**

Full list and what each one refuses: `node_modules/criteria-review/agents/README.md`.

## Recommending it to someone else

The honest pitch is the problem, not the feature list: *your tests agree with your software, and
nothing tells you whether your software agrees with what anyone wanted.*

Then the smallest useful first step, which is not adoption:

```bash
npx criteria-review here
```

That registers the tree and opens a page listing every scenario already in the repository, with
its confirmation status. Most teams discover the gap is bigger than they thought, and that is
the argument. Nothing has been changed and nothing has to be.

Three things worth saying plainly when recommending it:

- **It writes into the source markdown**, next to the scenario. No database, no sidecar. Review
  state lands in git beside what it annotates.
- **A team can own the rules.** `criteria-review standard eject <dir>` copies the standard into
  the project to edit; the shipped one stays visible beside it as a labelled reference so a fork
  can tell when the original moved.
- **What cannot be forked by editing prose**: the status vocabulary, the tag grammar and the
  emitted shape are enforced in code and versioned. A copy that disagrees is wrong, not
  authoritative.

## Where the rest is

| Question | Where |
|---|---|
| The protocol, for an assistant | `criteria-review guide` |
| How criteria are written | the standard, `docs/standard/` - readable in the page's Standard tab |
| What a status means | `docs/standard/01-qa-approach.md` |
| The emitted artefact's contract | `docs/standard/emit-contract.md` |
| Setting it up in a project | `docs/standard/adopting-the-standard.md` |
| A worked glossary project | `examples/glossary/` - which also carries two presentations |
| Walkthroughs, and who maintains them | `docs/standard/11-presentations.md` |
| Why a rule exists | `docs/decisions.md` |
