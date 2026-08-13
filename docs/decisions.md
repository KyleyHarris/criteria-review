# Decisions

Append-only, id-ordered. Each entry records what was decided, what was weighed against it, and
why the alternatives lost. This is the surface to check before asking "was this already
decided?", and the surface to check drift against.

---

## D-001. This tool owns the acceptance-criteria standard

**Date:** 2026-08-11
**Status:** decided

Until now the standard was owned by the first project that needed it, and this tool described
itself as "a reader over that schema, not a second authority". Two consumer projects then
existed, one of which kept a local mirror of the format documentation that described itself as
a mirror. A mirror cannot know its original changed, so it rots into a contradiction, and the
project that owned the standard had no way to tell that it had.

The standard now lives here, in `docs/standard/`. Consumer projects hold pointers and their own
instance data, never a restatement.

**What decides where a sentence lives.** Does it stay true if the product is swapped for a
different one? If yes it belongs to the standard; if no it stays in the project. By that test
the tier model, scenario ids, the status ladder, evidence rules, intent sourcing, the
verification-cost rule, the journey binding and the lifecycle gates are all the standard's. A
project's own catalogue of engineering obligations instantiated for its domain, its module
coverage map, and whatever sign-off arrangement it has with a customer stay with the project.

**Alternatives weighed.**

- *Leave ownership with the originating project.* Rejected: the second consumer had already
  written a mirror and labelled it as one, which is the failure this exists to remove. It also
  makes a project's internal reorganisation a breaking change for everyone else.
- *A separate standards repository, with the tool as one consumer.* Rejected for now: the
  parser, the review queue and the enforcement all live here, and a standard whose enforcement
  lives somewhere else is a document rather than a standard. Revisit if a second tool ever
  implements it.
- *Duplicate the standard into each project and check the copies match.* Rejected: that is a
  drift detector for a problem that does not need to exist. Generate what can be generated,
  point at the rest.

**Consequences.**

- The tool's own text stops disclaiming authority, and consumer projects stop naming each other
  as the source.
- The standard needs a version, because a change to the tag vocabulary is now a breaking change
  for every consumer. See D-002.
- Enforcement has to land with the ownership move rather than after it. Authority without
  enforcement is a source of truth nothing validates against, which is worse than the previous
  state where at least the owning project's document was the one people read.

---

## D-002. The standard is versioned, and the version is stamped into what it emits

**Date:** 2026-08-11
**Status:** decided

Once two repositories read from one source, a change to the vocabulary breaks builds the author
of the change cannot see. Consumers need to be able to say which version they last conformed
to, without inspecting the tool.

`STANDARD_VERSION` lives in one place in this repository and is stamped into every generated
artefact. Semantic: a change to the tag vocabulary, the status set, or the emitted shape is a
major bump; adding an optional field is a minor one; wording and documentation are a patch.

**Consequence.** A consumer that regenerates and sees the major digit move knows to read the
changelog before assuming the build failure is theirs.

---

## D-003. Scenario clauses reach the tests by generation, never by retyping

**Date:** 2026-08-11
**Status:** decided

The standard requires that a journey's step names be the scenario's own Given/When/Then
wording, so that what a reviewer reads and what the test proves are the same sentence. The
obvious implementation is to type those clauses into the test as step names. That was in use,
and it is wrong: it makes two copies of every clause with nothing detecting an edit to either.

Measured on the consumer project that has journeys: 18 spec files, 31 tests citing a scenario
id, 132 narrated steps. Every one of them was in exact sync with its document at the time of
the decision, which is the point - the sync was held by care alone, on the one artefact where
care is what already failed. A journey that dropped one of a scenario's five clauses would have
reported green.

Instead the clauses are parsed out of the acceptance documents and emitted as a typed module
that the journeys reference by key. The consumer supplies a body per clause; the type system
requires exactly the document's clauses, in the document's order.

**What that makes structural rather than conventional:** a reworded clause, a skipped clause, a
step the document does not contain, and a renamed or deleted scenario id all become compile
errors. The coverage map becomes the set of referenced keys. The video index stops being
retyped.

**Alternatives weighed.**

- *A text checker comparing the document to the spec source.* Rejected: it has to understand
  the consumer's language and formatting. The first such check written by hand during this
  investigation reported a false divergence, because one call was formatted on one line rather
  than three. A checker that is wrong about formatting is worse than no checker.
- *Adopt a behaviour-driven runner with step definitions bound by expression matching.*
  Rejected: shared reusable steps get written vaguely, and vague steps destroy the near 1:1
  clause-to-assertion mapping that makes review affordable. This design keeps steps specific to
  one scenario and cannot reach that failure mode.
- *Generate the whole test file.* Rejected: the bodies are the engineering, and generating them
  would mean either a template language or a stub nobody fills in.

**Known limit, stated rather than glossed.** A required clause can still be satisfied by a body
that asserts nothing. That is a separate and cheaper check: a finding on a `Then` or trailing
`And` body containing no assertion.

**Cost accepted.** Editing an acceptance document now breaks the build of any journey citing it.
That is the feature - the alternative is an amended requirement and a test still proving the old
one, with nothing on screen to say so - but it does mean a reviewer's wording change is no
longer free.

---

## D-004. The emitted artefact is language-neutral, with renderers over it

**Date:** 2026-08-11
**Status:** decided

The first consumer is TypeScript, so the obvious move is to emit a TypeScript module. A
standard whose only output binds to one language is not a standard.

The core emit is JSON: the parsed model, filtered and ordered. A typed TypeScript module is one
renderer over that JSON. Other renderers can follow without touching the core.

**Consequence.** Adding the JSON layer now costs almost nothing. Retrofitting it later would
mean changing every consumer, which is the situation this whole entry exists to avoid.

---

## D-005. Generation is strict where the viewer is tolerant

**Date:** 2026-08-11
**Status:** decided

The parser is deliberately permissive: it accepts unfamiliar statuses, and it reports scenarios
with no id and no status as `untracked` rather than rejecting them. That is correct for a review
queue, because those scenarios are exactly the backlog worth surfacing.

It is wrong for generation. A consumer's build depends on the emitted artefact, so an unknown
status or a duplicate id is a defect in the consumer's documents, not a curiosity to render.

`generate` therefore refuses to emit on: an unrecognised status value, a duplicate scenario id
across the documents it was given, or a scenario carrying `@status:verified` without both
`@verified:` and `@commit:`. Untracked scenarios are excluded from the emitted set, because they
have no id to key on, but their count is reported so the exclusion is never silent.

**Alternative weighed.** *Emit what parses and warn about the rest.* Rejected: a warning in a
build log is not read. The failure this standard exists to prevent is silence, and a tool that
degrades quietly reintroduces it at the one point where a machine could have been definite.

---

## D-006. `proposed` joins the status ladder, and versioning splits additive from breaking

**Date:** 2026-08-11
**Status:** decided
**Standard version:** 1.1.0

Found by running the new generator against a real consumer branch rather than by reading: 22
scenarios there carry `@status:proposed`, and generation refused all of them. The status was
introduced by that project before the standard moved here, and this tool's own review UI already
ranks it, between untracked and `derived`.

It is adopted rather than migrated away, for a reason stronger than "it is already in use": the
standard's own lifecycle says tier 1 scenarios are authored at planning, before implementation,
**as proposals**. Without a status for that state the ladder cannot express its own stage 1, and
a scenario written before any code exists has to masquerade as `derived`, which claims it
describes delivered software.

| Status | Meaning |
|---|---|
| `proposed` | Written at planning, before the software exists. A proposal, not a description. |
| `derived` | Written up from the delivered software. Describes what it appears to do. |
| `verified` | A human watched the software do it, with date and commit. |
| `accepted` | Confirmed as what the software should do. |

`proposed` ranks below `derived` because a description of delivered software at least matches
something, while a proposal has not met reality yet.

**The versioning rule is refined at the same time**, because D-002 as written made this a major
bump. That was wrong, and worth fixing rather than working around: what breaks a consumer is
something being **removed, renamed or narrowed**, not something being added. A status nobody
uses cannot break them. So major covers removal, rename and narrowing; minor covers additions.
This change is 1.1.0.

**Not weakened to avoid a bump.** The distinction is what semantic versioning actually means,
and the previous wording conflated "the vocabulary changed" with "consumers must act".

---

## D-007. Paths in the emitted artefact are POSIX, whatever platform produced them

**Date:** 2026-08-11
**Status:** decided
**Standard version:** 1.1.2

`scanProject` recorded each scenario's `source` as `relative(root, file)`, which returns the
host's own separator. That string does not stay inside the process: it is written into the
generated artefact that consumers commit, and `generate --check` compares that artefact byte for
byte.

Left native, the same repository with the same documents emits `documentation\ui-qa\x.md` on
Windows and `documentation/ui-qa/x.md` on macOS. Each platform then fails the other's gate, and
the failure reports drift that does not exist. That is worse than a missed defect: a gate which
cries wolf is a gate people learn to skip, and this one is the mechanism holding the criteria and
the tests together.

Normalised at the single point where a path stops being a filesystem handle and becomes recorded
data. `isCriteriaPath` uses the same splitter, so a mixed-separator path cannot match in one
place and fail in the other. The video path shown in the review page is normalised too, for
consistency rather than correctness - it is display only.

**Splits on both separators rather than on the platform's `sep`.** Windows accepts forward
slashes as well, so a mixed path is reachable there, and a `sep`-only fix would also be untestable
on a POSIX machine: the test would pass whether or not the normalisation existed. The three tests
guarding this assert against a literal backslash and were proved red by making `toPosixPath` the
identity function.

**Versioning.** The rule had no category for a defect fix that changes emitted content without
changing its shape, so patch now says so explicitly rather than leaving it to be inferred.
Consumers regenerate and commit; nothing else changes. On a POSIX machine the emitted bytes are
identical, confirmed against both consumers.

---

## D-008. Releases are tagged, so a consumer can pin one

**Date:** 2026-08-11
**Status:** decided

Two repositories now depend on this tool, and one of them wires it into a verification gate. A
consumer that tracks whatever is on the default branch inherits every change the moment it lands,
including a change to the emitted shape, and discovers it as a broken build with no version to name
in the report.

Every release is therefore an annotated tag, `v<package version>`, pushed with the commit. The tag
message records the **standard version** that release ships, because those are two different numbers
answering two different questions: the package version is what you pin and download, and the
standard version is what your criteria conform to.

```
git tag -a v0.2.0 -m "criteria-review 0.2.0 - standard 1.1.2 ..."
git push origin main --tags
```

**Alternative weighed.** *Tag only the standard version.* Rejected: a consumer pins an artefact, not
a specification, and two releases can ship the same standard. The tag has to name the thing being
downloaded.

**Consequence.** Bumping the package version is part of cutting a release rather than an
afterthought, and a release note that does not name its standard version is incomplete.

---

## D-009. Project settings and developer settings are different files

**Date:** 2026-08-12
**Status:** decided

`criteria.json` is committed and describes the project. `criteria.local.json` is gitignored and
describes one machine. Precedence is flags, local, project.

The property that matters: **a pipeline sets nothing**, so its behaviour is whatever is committed
and is therefore reviewable in a pull request rather than configured somewhere nobody reads.

**A local file may not weaken a gate.** It may change where a developer's own output lands
(`videoDir`, `publish.target`) and what subset they walk (`since`, `limit`). It may not redirect
`emit.out`, because the artefact is committed and `--check` compares that exact path, so an
override would have one machine checking a file nobody else has - passing locally while the build
fails. It may not set `standard`, because two people on one project reading different rules is a
fork rather than a preference.

Keys outside the allowlist are **refused by name**, not ignored. A setting that silently does
nothing leaves its author believing it took effect, which is the worse of the two failures.

**Discovery stays out of configuration.** Criteria are still found by convention, because a
missing config file would mean silent zero coverage. Everything settable here fails loudly at the
moment it is asked for, which is what makes it safe to declare.

---

## D-010. A team can own the standard; they cannot own the contract

**Date:** 2026-08-12
**Status:** decided

The shipped standard is one opinion, and this tool is now public. A team adopting it must be able
to make the rules theirs: `criteria-review standard eject <dir>` copies the documents into the
project, and `criteria.json` points at them. Their copy is what the reading tab shows.

The shipped standard stays visible beside it as a labelled reference unless they turn it off.
That is the answer to the mirror problem D-001 exists to prevent: a fork that hides its original
cannot tell when the original moved, and keeping it on screen makes divergence an observation
rather than a discovery on some later upgrade.

**What cannot be forked by editing prose:** the status vocabulary, the tag grammar, and the
emitted shape. Those are enforced in code and versioned. A copy that disagrees with them is wrong
rather than authoritative, and the eject says so, because otherwise the first thing a new adopter
does is edit the status list and then file a bug when nothing changes.

A team that genuinely needs different statuses needs a change to the tool, which should come back
as a pull request rather than diverge silently in a copy.

---

## D-011. Video asset promotion through the pipeline: deferred, with the shape recorded

**Date:** 2026-08-13
**Status:** deferred, not built

Raised and explicitly not taken today. Recorded so it is not re-derived from scratch, and so
nothing is built that would make it harder later.

The shape as discussed: a build gateway identifies which scenarios are **new in this build and
have no recording**, so video production becomes a piece of visible work rather than something
noticed at delivery. Development builds would write to a development asset folder, releases to a
release folder, and each release would publish its new videos to a central location - so the
master library grows by promotion rather than by someone remembering to copy files.

**Why it is not a skill.** It is pipeline plumbing, not a judgement an agent makes. The judgement
it would depend on already exists: a scenario with no journey is a coverage gap, and a scenario
with a journey and no recording is unproduced evidence. Both are computable.

**What already exists that it would build on**, none of which was designed for it and all of which
happens to fit: `--since <ref>` names what a branch or release added; `manifest` already reports
every scenario in scope with its clip or the absence of one; and the video convention is one file
per scenario in a fixed directory, which is what makes promotion between folders a copy rather
than a rename.

**What would need deciding when it is built:** whether the central library is addressed by release
or stays flat with one file per scenario - the current convention says one file per scenario and a
new run replaces the old, which is deliberately incompatible with keeping a clip per release.
That is the real design question, and it is not urgent while there is one library.

---

## D-012. The glossary, and why the binding key keeps the marker

**Date:** 2026-08-13
**Status:** decided
**Standard version:** 1.2.0

A criterion found in a real document described "organization types" after the product had renamed
them operation types, and another spelled "Member" after that concept became "Company". Nothing
caught either, because the words are prose and prose always parses.

The rule already existed one layer down: a string containing a domain noun is a finding, and
carries a term resolved at render time. Criteria are exactly that class of text and were the
surface it had never been applied to. So criteria name concepts - `{loginGroup}` - and the words
resolve when the criterion is read.

The manifest mirrors the application-side registry field for field, because two dialects of
"term" inside one organisation would be drift on a new axis rather than a fix for it.

**The decision the feature turns on: the emitted artefact carries the RAW clause as the binding
key and a rendered string beside it.** A journey supplies one body per clause keyed on the raw
text, so renaming a term changes only the display fields - no clause key moves and no journey
breaks. Emitting the rendered words as the key would make every rename a mechanical edit across
every citing journey, which is the exact cost a glossary exists to remove. Verified by renaming a
term and diffing the regenerated artefact: `titleDisplay` and `stepsDisplay` only.

**The tool owns the format, never the content.** A project's vocabulary already lives in a typed
registry, a database or a specification; a hand-kept copy here would reintroduce the drift one
layer over. The project writes a generator, the tool validates and refuses.

**Alternative weighed.** *Render at parse time and store only the resolved text.* Rejected: it
loses the key, so the next rename is a document sweep - the thing being fixed.

**Note on this entry's own release.** `v0.7.0` shipped the feature but its tag message claimed
standard 1.2.0 while `STANDARD_VERSION` still read 1.1.2. Corrected in `v0.7.1` rather than by
moving a published tag.
