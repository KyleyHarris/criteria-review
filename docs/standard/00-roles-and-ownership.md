# Roles and ownership

Who stands where. The rest of the pack describes the machinery; this file describes the people
the machinery is arranged around, what each of them owns, and where the boundary between
deciding and building falls.

Two roles carry the work, and this document names them as the tool does:

- **The architect** decides what the software *should* do. Organisations title this differently:
  solutions architect, technical lead, product engineer. The title is not the point; the remit
  is.
- **The implementers** decide how it is realised in code, and prove their own seams.

One person can hold both roles on a small project, and the boundary still matters, because it is
what makes the criteria worth writing rather than a formality performed after the fact.

---

## The one idea underneath the role

> Solutioning is finished when an implementer can ask *how do I build this cleanly* instead of
> *is this even the right thing*. Everything before that line is the architect's work.
> Everything after it is the team's.

The acceptance criteria are what draw that line, and this is what connects the pack to the whole
team: **a tier 1 document agreed before implementation is not a QA artefact that happens early.
It is the specification.** Written and confirmed up front, it removes the one question a skilled
implementer cannot answer for themselves, which is what the business actually wanted, and leaves
them the questions they are best placed to answer: how to build it, how to structure it, how to
make it fast and maintainable.

So the QA roadmap is not downstream of design. It is the guide to it. The obligation to
enumerate both tiers before anyone writes code ([`08-definition-of-done.md`](08-definition-of-done.md),
stage 1) is the same obligation as designing the feature. There is no separate design step that
the criteria then check. The criteria, agreed, are the design.

---

## 1. The role has two faces, and they are different jobs

Facing whoever wanted the software, which may be a customer, product, support or pre-sales, the
job is to **turn a want into an agreed intent**. This is where the "so that" is nailed down
([`02-writing-acceptance-criteria.md`](02-writing-acceptance-criteria.md)), where a request stops
being a solution somebody guessed at and becomes the outcome it was really about. The output is
a tier 1 acceptance document, in the requester's language, that they have confirmed.

Facing the implementers, the job is to **turn agreed intent into a de-risked technical brief**.
This is where tier 2 obligations are named from the catalogue
([`06-engineering-obligations.md`](06-engineering-obligations.md)), where the edge cases no user
would ever describe are worked through, and where hard unknowns are spiked before they reach a
sprint.

These are sequenced, not parallel, and the order is load bearing:

> Confirm the intent with whoever owns it **before** the technical edge-casing, not after.

The requester confirms behaviour in their own language, and the tier 2 work is invisible to them
([`01-qa-approach.md`](01-qa-approach.md), section 2). Doing the technical edge-casing first
buries the intent they are being asked to approve under machinery they cannot read, and the
confirmation stops being a confirmation. Intent first, in their words. Obligations second, in
ours.

---

## 2. What the architect owns, and what the team owns

The single decision that determines whether the model scales or collapses back onto one person.
Draw the line in the wrong place and the role becomes a bottleneck with a better title.

The test is the one the standard uses to decide where a sentence lives: **does the decision stay
the same if you swapped the implementers for a different, equally skilled team?** If yes, the
architect owns it. If no, if it depends on how *this* person writes *this* code, it belongs to
the implementer.

| The architect owns | The team owns |
|---|---|
| The intent, and its confirmation with whoever owns it | How the intent is realised in code |
| The tier 1 scenarios and their wording | The internal structure of the implementation |
| The tier 2 obligations shortlist for the feature | Which patterns, types and abstractions sit behind the contract |
| Contracts across a boundary: API shape, event and message contracts, the data model | The implementation behind the contract |
| Cross-cutting choices: identity, authorisation surface, tenancy, where state lives | Local, cheap-to-reverse decisions inside a service |
| The hard-to-reverse and the high-risk | The many cheap-to-reverse decisions |
| Acceptance of the returned work against the brief | Getting the suite green and the evidence produced |

Both failure modes are worth naming, because each is invisible from inside it.

**Drawn too low:** if vetting reaches down to variable names, method shape, or which construct
you would have used, the architect has recreated themselves as the team's editor. Vetting asks
*does this honour the intent and the contract*, never *would I have written it this way*.

**Drawn too high:** handing the team a one-line want and calling it delegation. Intent left to be
inferred will be inferred fluently and wrongly, which is the failure
[`01-qa-approach.md`](01-qa-approach.md) section 6 exists to prevent. The brief is what stops
that, and its whole purpose is to make the intent unnecessary to guess.

---

## 3. Intake: vetting a request before it is real work

A request arriving from outside the team is a want, not a specification, and admitting it to the
backlog as though it were one is how unsourced intent enters the system. Intake is a gate, and it
sits deliberately at the front, before anyone has an interest in the list being short
([`01-qa-approach.md`](01-qa-approach.md), section 3).

A request is not ready to be worked until it carries:

- **A named actor and a real "so that".** Not "add a filter", but who is blocked without it and
  what they cannot currently do. A request whose "so that" is circular is a heading, not a story
  ([`02-writing-acceptance-criteria.md`](02-writing-acceptance-criteria.md)).
- **Sourced intent, or an explicit question in its place.** Every claim about what was wanted
  cites where it came from: a dated conversation with a named owner, a support ticket, a
  commitment recorded somewhere. Where no source exists, the request carries the question rather
  than a confident guess. Intent is never reverse engineered from what a competitor does or from
  what seems reasonable.
- **The scope line.** One sentence naming what is in and, more usefully, what is deliberately
  out. Most disputes at delivery are about the out.

The output of intake is not "approved". It is one of three: **admitted** with its intent sourced,
**returned** to the requester with the specific missing piece named, or **held** as a question
against the person who owns the answer. The three are visible states rather than a private
judgement, for the same reason the status ladder is visible: the unsettled surface has to stay on
screen ([`01-qa-approach.md`](01-qa-approach.md), section 5).

---

## 4. The two products

Per feature, the architect produces exactly two things, and the team should be able to start from
them alone.

### 4a. The acceptance spec, which is the roadmap

The tier 1 document and the tier 2 shortlist, produced as
[`08-definition-of-done.md`](08-definition-of-done.md) stage 1 requires. What matters here is
what it *is* to the team: every tier 1 scenario is behaviour the implementer must deliver and
will be measured against, and every tier 2 obligation is an edge they are on notice to handle.
Enumerated up front, it is the map of the whole surface, drawn before the terrain tempts anyone
to shorten it.

Shared with the requester minus the tier 2 machinery, and confirmed, it becomes the thing that
carries force in a disagreement: *agreed*, not *assumed*.

### 4b. The technical brief, which is the guide

What the acceptance spec does not carry: the design decisions the architect has taken so the team
does not have to, and the risks retired so the team does not hit them mid-sprint. It is short on
purpose. If it is long, the architect is doing the team's job.

| Section | What it is |
|---|---|
| Intent, in one paragraph | The agreed "so that", so the brief reads without the acceptance document open beside it |
| The obligations shortlist | The tier 2 ids this feature instantiates, each a concrete list of tests rather than a feeling |
| Contracts | API shape, event and message contracts, and the data model, stated as the boundary the team builds behind |
| Decisions taken | Cross-cutting calls already made, each with a one-line why, so they are not silently relitigated |
| Decisions left open | The local calls the team owns, named as theirs, so delegation is explicit rather than a gap |
| Risks retired | The spikes done and what they proved; the unknowns that would otherwise surface mid-sprint |
| Out of scope | What this deliberately does not do, so a returned implementation is not marked short for not doing it |

The "decisions left open" row is where the economics live. **Specify the outcome completely,
because a gap will not be correctly filled by someone who was not in the conversation. Do not
specify the mechanism**, because the moment the brief pre-writes the code, designing costs what
building costs and the reason for separating them is gone.

The line to hold: the *what* and the *must-be-true* are pinned to the point of no ambiguity; the
*how* is left as genuine mechanism the implementers own. That division is not a courtesy. It is
what keeps designing cheaper than building, and it is the hardest judgement in the role. Specify
too little and you get wrong software; too much and you have simply built it yourself, slowly.

---

## 5. The three levels: who builds which tests

The architect's output is not tests. It is the guidance tests are built from. Below it sit two
layers of proof, and the acceptance criteria are what let all three work independently without
drifting apart.

| Level | Builds | Against |
|---|---|---|
| Architect | The QA guidance: tier 1 scenarios and the tier 2 obligations shortlist | The agreed intent |
| Developers | The code, and the tests at their level: unit and integration | The scenarios and obligations handed down |
| End-to-end authors | The journeys | The tier 1 scenarios, taken by generation, not rewritten |

Read top to bottom, that is the flow of a feature. Developers prove their own seams close to the
code, and the tier 2 obligations are largely theirs, because partial writes, idempotency,
concurrency and boundaries live at the seams they build. The end-to-end layer proves the tier 1
scenarios through the interface a user actually walks.

The three levels are joined by one thing, the pack's shared primitive: **scenario ids**
([`01-qa-approach.md`](01-qa-approach.md), section 4). They are written once. An integration test
cites the obligation id it instantiates; a journey cites the scenario id it proves. Nobody
restates the criteria, so coverage is computable across all three rather than counted separately
per team.

Two properties make this safe rather than merely tidy:

- **The end-to-end layer cannot drift from the guidance.** Journeys take their step text from the
  acceptance documents by generation, not by copy
  ([`04-playwright-journeys.md`](04-playwright-journeys.md), section 1), so rewording a scenario
  breaks the citing journey until someone catches it up. Intent changes in one place and the
  machinery forces the rest to follow, rather than the architect policing it by hand.
- **Automation follows the acceptance layer, never the reverse.** A journey with no scenario
  behind it is a recording, not a proof. Neither the end-to-end authors nor the developers invent
  criteria; both build against what was authored first.

What this means for the architect's own hands: they write criteria, not journeys, and not the
code. Authoring a scenario and automating it are different jobs, and conflating them pulls the
role back into building. The proof that the lower levels did their jobs is not that the architect
watched them work; it is the evidence bundle the journeys produce and the obligation citations
the integration tests carry, both read against the guidance.

---

## 6. The handoff

What the implementer receives is the acceptance spec (their roadmap), the technical brief (their
guide), and the decisions that are theirs to make (their room). What they should never receive is
the intent as a guess, an obligation list left to their diligence, or a contract they have to
invent by reading a mock-up.

**The handoff succeeds on the completeness of the brief, not on the implementer catching what it
missed.** Anything the brief leaves ambiguous may not be queried; it may simply be guessed, built
and reported done, and this becomes more likely the further the implementer sits from the
original conversation. So the bar is blunt: a faithful, literal reading of the acceptance spec
and the brief must produce the right software, with no discrimination required on the far side.

Pushback is welcome when it comes and occasionally catches something real, but it is not the
safety net. The safety net is the acceptance harness: generated journeys that cannot silently
skip a clause, and an evidence bundle that shows what was actually delivered rather than what was
claimed. That harness is what makes it safe to hand work to people who will build exactly what
was written, including its mistakes.

---

## 7. Vetting the returned work

The architect is the technical gate for work they did not write, and that gate has to be
affordable or it becomes a rubber stamp ([`01-qa-approach.md`](01-qa-approach.md), section 8). It
borrows the same principle as the rest of the pack: **check output, not input, and ask a specific
question derived from the change, never a general one.**

Vetting is not a line-by-line re-read. It is three questions, each answerable from an artefact
rather than from trust:

1. **Does it honour the intent?** The tier 1 scenario's own words against what the journey
   asserts ([`01-qa-approach.md`](01-qa-approach.md), section 4), watchable as a recording.
   Seconds, not an afternoon.
2. **Does it hold the contract?** The API shape, the event contract and the data model as handed
   over, or with the divergence surfaced and agreed rather than quietly shipped.
3. **Are the obligations discharged?** Each tier 2 id in the brief cited by a test that was
   observed failing ([`06-engineering-obligations.md`](06-engineering-obligations.md)). A named id
   with no citation is a gap, and it is a finite, checkable gap rather than a judgement call.

What is explicitly **not** the architect's to reject: how the implementer structured, named or
factored it, where the intent is honoured and the contract held. That is the line from section 2,
enforced at the moment it is most tempting to cross.

---

## 8. When the design is wrong: re-solutioning

A brief is a hypothesis, not a decree. It is the best available reading before the work exists,
and the work will teach things the reading could not. The pack already concedes this in the
status ladder: a scenario written at planning is `@status:proposed`, a proposal and not a
description ([`01-qa-approach.md`](01-qa-approach.md), section 5). Treating the first brief as
final is the waterfall error wearing a sprint's clothes.

Discovery mid-build is expected, and the response is **re-solutioning**, not silent absorption:

- **The loop runs through the architect, not around it.** When the build reveals the brief got
  something wrong, or hit an edge nobody foresaw, the implementer surfaces it rather than
  resolving it at the desk. The anomaly comes back up, it is re-solutioned, and an amended
  criterion or brief flows back down.
- **The change is made visible by the machinery, not by memory.** Re-solutioning rewords a
  clause, and rewording a clause breaks the journey that cited the old one
  ([`04-playwright-journeys.md`](04-playwright-journeys.md), section 1). That is the feature, not
  a nuisance: an amended requirement cannot quietly leave a test still proving the version it
  replaced.
- **The loop is budgeted, not blamed.** A re-solutioned scenario is the model working. The real
  failure is the same discovery being made three times by three implementers in parallel and
  resolved three different ways, because it never came back up. Parallelism is what makes an
  unsurfaced surprise expensive, which is why surfacing is the one obligation a team cannot
  execute literally past.

And the point underneath it:

> Focus is the deliverable. A person carrying the cognitive load of building cannot also hold the
> whole edge-case and risk surface in view. A person whose only job is to design can.

Freed from implementing, attention goes where it is worth most: the edges, the failure modes, the
obligations, the risks. That is not a happy accident of the division of labour, it is a reason
for it. The model does not only change what delivery costs, it makes the design better, because
the designer is not also the builder.

---

## 9. Three horizons at once

The role does not run one sprint at a time. At any moment its work is spread across three
horizons, and holding all three is the shape of the job:

- **Ahead.** Designing the features of future cycles, so a de-risked brief is ready to pull
  before the developers need it. This has to stay in front of delivery or the team runs dry.
- **Now.** Cycling with the developers on the work in flight: answering the open questions the
  brief deliberately left them, and re-solutioning what the build turns up (section 8). Servicing
  delivery without reaching into the how.
- **Behind.** Vetting and accepting the work completing from the last cycle, reading the evidence
  against the guidance that was written for it (section 7).

That stagger is what makes the model work: the brief the developers pull today was designed while
they were building the last one. A role that only designed the current cycle would be a
bottleneck the team waited on. A role that designs ahead is a buffer the team draws from.

The honest hazard, worth managing deliberately: **reactive work crowds out proactive work.**
Servicing the current cycle is loud and immediate; designing ahead is quiet and can always be
done tomorrow. Left unmanaged, the current cycle consumes the day, forward design slips, and a
few cycles later the team pulls from an empty backlog and stalls. Design-ahead time is not the
slack in the role, it is the load-bearing part.

---

## 10. Where the roles stand in the lifecycle

The stages in [`08-definition-of-done.md`](08-definition-of-done.md) sequence the work. This
table names who stands at each gate, so the lifecycle and the roles are one description rather
than two.

| Stage | The architect | The team |
|---|---|---|
| Intake | Sources the intent; admits, returns or holds the request | |
| Plan | Writes tier 1, names the tier 2 shortlist, produces the brief | Challenges the brief and the contract |
| Confirm | Shares tier 1 with the intent owner, promotes off `derived` | |
| Build | Available for the open questions; does not reach into the how | Builds behind the contract, owns the local decisions |
| Gate | Runs the completeness sweep with the team; feeds gaps back into planning | Produces tests and evidence |
| Sign-off | Accepts against intent and contract; promotes status | Delivers the evidence bundle by one command |

The completeness sweep is worth calling out as a shared act rather than a checkpoint the
architect owns alone. Planning cannot enumerate what only emerges while building, and the person
who built it knows where the surfaces are. The sweep is where that knowledge feeds back into how
the next feature is planned, which is what turns the role from a bottleneck into a multiplier.

---

## What this file does not do

It does not restate the standard. The format, the tag vocabulary, the status ladder, the
lifecycle and the emit contract live where they live, and this file points at them rather than
copying them, for the same reason a consumer project holds pointers rather than restating the
pack ([`README.md`](README.md)). If a rule here appears to contradict one of those files, those
files are the authority and this one is the defect.

It also carries no organisation's instance data: no team's staffing, no business case for
resourcing the role, and no characterisation of a particular set of implementers. Those fail the
swap test in section 2 and belong with the project that has them, not here.
