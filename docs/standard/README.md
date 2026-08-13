# The acceptance-criteria standard

**Standard version 1.1.2.** This directory is the source of truth for how acceptance criteria
are written, confirmed, cited by tests, and gated. Consumer projects hold pointers and their own
instance data. They do not restate it. See `../decisions.md` D-001.

## The one idea underneath all of it

> A test citing a requirement nobody confirmed proves the test runs. It does not prove the
> requirement is right.

Almost every rule here follows from that sentence. Criteria are written in the language of the
person who wanted the software, they carry a visible confirmation status, and the automated
journey that proves each one cites it by a stable id and takes its step names from the
document by generation rather than by copy.

## Reading order

| File | What it is |
|---|---|
| [`00-roles-and-ownership.md`](00-roles-and-ownership.md) | Who decides and who builds: the ownership boundary, intake, the brief, the three levels of test, vetting, re-solutioning. |
| [`01-qa-approach.md`](01-qa-approach.md) | Two tiers by readership, scenario ids, the status ladder, evidence rules, intent sourcing, limits of mechanical checking. |
| [`02-writing-acceptance-criteria.md`](02-writing-acceptance-criteria.md) | Authoring: document anatomy, story rules, scenario format, tags, provenance, the review loop. |
| [`03-example-acceptance-document.md`](03-example-acceptance-document.md) | A complete worked document. |
| [`04-playwright-journeys.md`](04-playwright-journeys.md) | The binding to automated journeys: generated clauses, selectors, seeding, red-proofing, video. |
| [`05-example-journey.spec.ts`](05-example-journey.spec.ts) | The worked journey against the worked document. |
| [`06-engineering-obligations.md`](06-engineering-obligations.md) | The second tier, and the coverage categories every surface is worked through. |
| [`07-manual-qa-and-defects.md`](07-manual-qa-and-defects.md) | What stays manual, and the defect report bar. |
| [`08-definition-of-done.md`](08-definition-of-done.md) | The lifecycle, its gates, and what "done" is not. |
| [`10-glossary.md`](10-glossary.md) | Naming domain concepts instead of spelling them, so a rename does not stale every document. |
| [`09-recording-journeys.md`](09-recording-journeys.md) | Turning a passing journey into a video a newcomer can follow, and the delivery package. Written to be executed. |
| [`emit-contract.md`](emit-contract.md) | The generated artefact: shape, guarantees, gate wiring. |
| [`adopting-the-standard.md`](adopting-the-standard.md) | What a project does to conform, in an order that leaves the suite green at every step. |

## What a consumer project owns

The test that decides where a sentence lives: **does it stay true if the product is swapped for
a different one?**

If yes, it belongs here. If no, it stays in the project. By that test a project owns its own
catalogue of engineering obligations instantiated for its domain, its module coverage map, its
sign-off arrangements, and its acceptance documents themselves. It does not own the format, the
tag vocabulary, the status ladder, or the binding.

Where a project must differ from the standard, it registers an explicit override naming the
section and quoting a verbatim anchor phrase from it, so that editing the standard surfaces
every dependent override instead of leaving silent contradictions.

## Versioning

The version is stamped into every generated artefact, so a consumer can say which version it
last conformed to without reading this directory.

- **Major** - something a conforming consumer relied on was removed, renamed or narrowed: a
  status retired, a tag renamed, a field dropped from the emitted shape.
- **Minor** - something was added that no existing consumer can be broken by: a new status, a
  new optional field.
- **Patch** - wording, documentation, and a defect fix that changes emitted content without
  changing its shape: a consumer regenerates and commits, nothing else.

The additive-versus-breaking split matters more than the surface changing. Adding a status
cannot break a consumer that does not use it, and treating that as a major bump would make every
vocabulary addition look like a migration.

## What is deferred, and recorded so it is not forgotten

This text is written in the author's own voice and carries its rationale inline, including the
specific failures that motivated each rule. If this tool is ever published for others to adopt,
the normative rules and the rationale should split into separate files, because a reader
adopting a standard needs the rule and a reader arguing with it needs the failure. That split is
deliberately not done yet: it is presentation, and the single-source property matters more.
