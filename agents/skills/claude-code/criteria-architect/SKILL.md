---
name: criteria-architect
description: Drive the forward direction: take a source of intent and design the acceptance spec and the technical brief a team can build from. Vets the request at intake, designs tier 1 scenarios and the tier 2 obligation shortlist, writes the brief, then asks where the declaration should be saved - a DevOps task, a GitHub issue, a document - so the scenario ids it names match what is committed. Use when the architect says "design this", "solution this", "new feature", "here is the intent", "prepare this task", or hands over a request that is not yet real work.
---

# Design a feature from intent

The **forward direction**: intent, then criteria, then tests, then code. (The reverse - a legacy
application with nothing written down - is `criteria-backfill`, which works from observation and
infers intent. Do not mix them: one starts from what somebody wanted, the other from what the
software does.)

This skill drives the process the standard already defines. Read
`npx criteria-review guide` and the roles document before working; what follows is how to run
it, not a restatement of it.

---

## 1. Intake: is this real work yet?

A request arriving from outside is **a want, not a specification**, and admitting it as though it
were one is how unsourced intent enters the system.

Take the source they give you - a conversation, a ticket, a document, a paragraph - and check it
carries three things:

- **A named actor and a real "so that".** Not "add a filter": who is blocked without it, and
  what can they not currently do. A circular "so that" is a heading, not a story.
- **Sourced intent, or an explicit question in its place.** Every claim about what was wanted
  cites where it came from - a dated conversation with a named owner, a ticket, a recorded
  commitment. Where nothing exists, carry **the question**, not a confident guess. Never reverse
  engineer intent from what a competitor does or from what seems reasonable.
- **The scope line.** One sentence naming what is in and, more usefully, what is deliberately
  out. Most disputes at delivery are about the out.

The output is not "approved". It is one of three, and say which:

```
ADMITTED  intent sourced, actor named, scope line written
RETURNED  to the requester - naming the specific missing piece
HELD      as a question against <who owns the answer>
```

**Do not design a returned or held request.** Designing around a missing intent is how a guess
becomes a requirement with an architect's authority on it.

## 2. Design the acceptance spec

The tier 1 document plus the tier 2 shortlist, enumerated **before** anyone has an interest in
the list being short.

**Tier 1** - what the requester would recognise, in their language, one actor per scenario. Work
outward from the happy path: the refusals, the permission boundaries, the states where the
action makes no sense, the limits. Each is an ordinary scenario with its own id, not a bullet at
the bottom.

Status is **`proposed`**: written at planning, before the software exists. That is exactly what
that status means, and it distinguishes these from anything derived off an implementation.

**Tier 2** - the obligations this feature instantiates: partial writes, idempotency under retry,
races, audit ordering, malformed input, boundaries, and authorisation enumerated including who
must be refused. Taken from the catalogue rather than from imagination, because a catalogue can
be checked against and diligence cannot.

They attach to **the unit of work, never to a scenario or a journey.** An obligation is by
definition something no user would describe, so it has no tier 1 parent and never will.

Write them to a sibling file in the area folder, `acceptance/<area>/<area>-obligations.md`, kept
separate from the acceptance document for one practical reason: tier 1 is shared with the
requester and tier 2 never is, so "send them that file" is a safer operation than "send that file
with the second half removed". Putting tier 2 in front of the requester buries the business
intent they are being asked to approve.

Present both for correction before writing anything. For tier 1, present the ids you propose and
let them be renamed - ids are stable forever and never reused, so a bad prefix is expensive
later.

## Terms: name the concept, do not spell the word

Before writing a scenario, look at the glossary:

```bash
npx criteria-review terms          # what exists, and how each one is used
```

Every domain noun you are about to write goes through it. A criterion reading "a Company must
have an owner" is correct today and silently wrong the day Company becomes something else, and
nothing can notice because the words are prose:

```gherkin
Scenario: A {loginGroup} must have at least one {operationType}
  When staff save it with no {operationType.lower} chosen
```

Variants derive - `{term.lower}`, `{term.plural}`, `{term.lowerPlural}`, `{term.possessive}`.

**When a word looks like a term and is not in the glossary, stop and ask.** Do not invent an
entry and do not quietly spell the word instead. Present it as a question with a recommendation:

```
"Operation Type" appears in 4 of these scenarios and is not in the glossary.
It looks like a domain concept the product could rename.
  key:         operationType   (names the internal domain, not the current word)
  value:       Operation Type
  plural:      Operation Types
  description: What a company does
Add it? It has to be added at the real source and re-generated - see criteria-glossary.
```

The judgement is **"who owns this word"**, not "is this string correct". A word naming a domain
concept - the organisation, the person, the operation, the report, the status - belongs to the
glossary. Text genuinely about this screen and nothing else does not, and a glossary that
swallows ordinary English makes documents unreadable and buys nothing.

Check before handing over:

```bash
npx criteria-review terms check    # unresolved markers fail; spelled terms are reported
```

A **spelled term** in that report is a sentence of yours that says the word where it should have
named the concept. Fix those before presenting the document; they are the drift this exists to
prevent, and they are cheapest to fix the minute they are written.

## 3. Write the technical brief

Short on purpose. **If it is long, the architect is doing the team's job.**

| Section | What goes in it |
|---|---|
| Intent, one paragraph | The agreed "so that", so the brief reads without the acceptance document open |
| Obligations shortlist | The tier 2 ids, each a concrete list of tests rather than a feeling |
| Contracts | API shape, events and messages, the data model - the boundary the team builds behind |
| Decisions taken | Cross-cutting calls already made, each with a one-line why, so they are not relitigated |
| Decisions left open | The local calls the team owns, named as theirs, so delegation is explicit |
| Risks retired | Spikes done and what they proved; unknowns that would otherwise surface mid-sprint |
| Out of scope | What this deliberately does not do, so a returned implementation is not marked short |

**The hardest judgement in the role, and the one to get right here: specify the outcome
completely, and do not specify the mechanism.** A gap in the outcome will not be correctly
filled by someone who was not in the conversation. But the moment the brief pre-writes the code,
designing costs what building costs and the reason for separating them is gone.

The bar for the whole handoff is blunt: **a faithful, literal reading of the spec and the brief
must produce the right software**, with no discrimination required on the far side. Anything
ambiguous may not be queried - it may simply be guessed, built, and reported done.

## 4. Ask where the declaration is saved

Two destinations, and they are different things:

- **The criteria go in the repository**, committed, where the review tool reads them:
  `acceptance/<area>/<area>-acceptance.md`.
- **The declaration goes in the work item** - the DevOps task, the GitHub issue, wherever the
  team takes work from. It names the brief and **the scenario ids**, and those ids must match
  what was committed exactly, because that is what `criteria-plan` reads back when someone picks
  the task up.

So ask:

```
Where should the task declaration go?
1  a DevOps work item   - id, or create a new one
2  a GitHub issue       - number, or create a new one
3  a document in the repo
4  print it - I will paste it myself
```

Then write it, and **verify the ids round-trip**: the ids in the work item must resolve against
the committed documents.

```bash
npx criteria-review plan set <the ids> --task "<name>" --source "<the work item>"
npx criteria-review plan            # every id resolves, nothing unresolved
```

If any id does not resolve, the declaration and the repository have already drifted, on day one.
Fix it now rather than letting a developer find it.

## 5. Hand off, and say what is owed

```
ADMITTED. 11 tier 1 scenarios (proposed), 5 tier 2 obligations.
  criteria  -> acceptance/till-lock/till-lock-acceptance.md   committed
  brief     -> issue #412
  ids verified against the committed documents
Owed before build: the requester confirms the tier 1 spec (minus tier 2).
Next: `criteria-test` for the journeys, `criteria-develop` for the code.
```

**Share tier 1 with the requester and get it confirmed** before implementation. A document
carries force in a disagreement only if it was agreed - that is what turns "what the developer
assumed" into "what we agreed". Tier 2 stays inside the team.

**Never promote a status.** These are `proposed` until a person moves them, and the person is
the one who owns the intent, not the one who wrote it down.
