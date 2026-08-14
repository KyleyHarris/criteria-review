# Presentations

How the product is walked through, as opposed to how its criteria are filed.

---

## Why there are two orderings

The folder structure is **authoring-shaped**. It follows how work arrived: this feature, then
that bug, then a phase of hardening. That is the right structure for maintaining criteria, and
it is the wrong one for showing somebody the product, which needs menu, page, action, in the
order a person would actually be walked through it.

The two diverge over time and **should be allowed to**. Forcing one structure to serve both
means reorganising acceptance documents whenever navigation changes, which churns the thing
that is supposed to be stable.

So a presentation is **a lens, not a re-ordering**. It holds ids and narration and no content.
Documents keep their order, the emitted artefact keeps its order, the default package keeps
its order. Adding a presentation changes no artefact and no default.

## The shape

Markdown in `presentations/`, one file per walkthrough. Headings give the structure, `@ID`
lines place scenarios, and the prose between them is what a viewer is told.

```markdown
# Total application

<!-- scope: complete -->
<!-- audience: end customer -->

Everything the product does, in the order the menus present it.

## The register

The surface a cashier is in front of all day.

### Locking it when stepping away

@LOCK-SET-001 - the lock takes effect immediately, not just visually
@LOCK-SET-002

## Not shown

<!-- excluded: no user-facing surface -->
@CASH-OUTBOX-001 - drained by a queue handler, nothing on screen
```

Markdown rather than JSON because the narration is the part that makes a walkthrough a
walkthrough rather than a list, and JSON makes prose miserable to write.

## Scope, which is what makes the audit usable

| Scope | Owes |
|---|---|
| `complete` | Every scenario placed, or explicitly excluded with a reason |
| `partial` | Only that its references resolve |

A walkthrough of the whole product owes coverage. A ten minute demo is a **deliberate subset**
and owes none. Without the distinction the audit either misses real gaps or complains about
intended ones, and an audit that complains is an audit that gets switched off.

Several presentations are normal: a total application walk, a customer demo, an onboarding
path. They are different walks through the same scenarios.

## The audit

```bash
criteria-review present check
```

Bidirectional, like every other citation check here:

- **Missing** - a scenario nobody placed. This is the one the feature exists for: a
  presentation is built to show somebody the whole product, so a silent omission misleads
  precisely the person it was made for.
- **Dangling** - a reference to a scenario that no longer exists, which promises a viewer
  something retired.
- **Duplicated** - reported, never faulted. A scenario reachable from two menus belongs in
  both places, because that is where a user finds it.
- **Excluded without a reason** - a problem, for the same purpose `n/a` carries a reason
  everywhere else: an unexplained exclusion is indistinguishable from an oversight.

**One honest limit, and what closes it.** The audit catches missing and dangling. It cannot
catch **wrong placement**: if a menu moves, the presentation is quietly out of date and nothing
mechanical notices. That is the same class of failure as a scenario describing something which
cannot occur.

What closes it is examination rather than a check. The evidence exists in the software - a
journey visits a route, and the navigation says how that route is reached - so a review pass
with the code in hand can compare where a scenario is placed against where the application
actually puts it, and report the contradictions. That is a job for the review, not for the
tool: a route says how the software is built, and a section title says how a customer thinks
about it, and those may legitimately differ. The evidence is checkable; the placement is a
judgement. See the `criteria-present` skill.

## Where a new scenario goes

```bash
criteria-review present place LOCK-FAIL-001
```

Recommends a section in each presentation, judged by where the scenario's **siblings** already
sit, weighting the same feature above merely the same document. It reports the basis rather
than only the answer - "four sibling placements in this section" is a different claim from
"nothing like it is placed yet" - because it is a recommendation and whoever wrote the
scenario decides.

This is the step that keeps presentations current as work lands. A developer finishing a
scenario knows where it belongs; the audit is what catches the times they forget.

## In the review page

A presentation is offered as a **view**, beside natural order and the tree. Selecting one
reorders the queue and groups it under the presentation's own headings, so the same keys walk
it: `j` and `k` move through in presentation order, and each scenario's recording plays where
it sits.

Anything the presentation does not place falls to the end under "Not in this presentation"
rather than disappearing. A view that silently dropped scenarios would reproduce the exact
failure the audit exists to catch, in the one surface where nobody would look for it.

## Who maintains them, and when

**Both sides, and it is part of done rather than a courtesy.** Stage 6a of the definition of
done, and item 9 of the self-review.

| Who | What they owe |
|---|---|
| Whoever wrote the scenario | Places it, as the work lands. They know where a user would find it. |
| QA | Confirms the placement reads as a walkthrough, and owns the structure as the product's navigation changes. |

Neither is sufficient alone, which is precisely why it is a gate. A developer placing scenarios
without review produces a walkthrough shaped like the code. QA maintaining it alone is
reconstructing, weeks later, a decision the author could have made in ten seconds.

**Do it as work lands, not at delivery.** A presentation assembled at handover is assembled
under time pressure by whoever is available, which is the failure this whole standard is
written against.

## What it buys

Worth stating, because the cost is visible and the benefit is not:

- **A customer sees the product, not the backlog.** Feature folders are a record of how work
  arrived. Nobody outside the team has any reason to care, and an artefact organised that way
  quietly asks them to.
- **A gap becomes findable.** Without the audit, "did we show them everything" is answered by
  somebody's memory. With it, it is a command.
- **The demo stops being rebuilt.** A curated `partial` presentation is a demo that already
  exists, already audited, already tied to real recordings - rather than a slide deck someone
  rewrites each time.
- **It costs nothing to the rest.** A presentation is a lens: no document moves, no id changes,
  no ordering anywhere else is affected.
