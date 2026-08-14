---
name: criteria-present
description: Build and maintain the product-shaped walkthroughs a customer is shown - ordering scenarios and their videos by menu, page and action rather than by the feature folders they were filed in. Proposes structure from the software's real navigation, audits every presentation for gaps, and recommends where a newly written scenario belongs. Use when the architect says "presentation", "customer walkthrough", "demo order", "show this to a client", "where does this scenario go", or a new scenario has landed and the presentations have not been updated.
---

# Build and keep a presentation

A presentation is how the **product** is walked through, as opposed to how its criteria are
filed. The rules and the format are in the standard's presentation document
(`npx criteria-review guide`, or the reading tab). This is how to run the job.

---

## What it is, and what it is not

It is a **lens**. It holds ids and narration and no content, so it can never disagree with a
document about a title or a status - those are read live. Adding one changes no artefact and
no default ordering anywhere else.

It is **not** a re-filing of the criteria. Do not move acceptance documents to match a
presentation, and do not renumber scenario ids. The folder structure follows how work arrived
and is correct as it is; the presentation is a second way to read the same set.

## 1. Ask what this walkthrough is for

Several are normal, and they are different walks through the same scenarios:

```
What is this presentation for?
1  the whole product      - everything, in menu order          (scope: complete)
2  a demo                 - a curated subset for a buyer       (scope: partial)
3  onboarding             - the path a new user is taught      (scope: partial)
4  a specific client      - the menus that client actually has (scope: partial)
```

**Scope is the decision that matters.** A `complete` presentation owes coverage of every
scenario; a `partial` one is a deliberate subset and owes none. Getting this wrong makes the
audit either miss real gaps or complain about intended ones, and an audit that complains is an
audit that gets switched off.

Also ask the audience, and write it in - a reader six months later needs to know who a
walkthrough was built for before they can judge whether it is still right.

## 2. Propose the structure from the software, not from the criteria

The structure must match **how the product presents itself now**: menu, sub-page, action.
That is observable - routes, a navigation component, a menu configuration - so read it rather
than inferring it from how the criteria happen to be grouped. Criteria grouping is
authoring-shaped, and copying it produces a presentation that is just the folder structure
with different headings.

Then place scenarios under it, and write the narration between sections: one or two sentences
saying what a viewer is about to see and why it matters to them. That prose is the difference
between a walkthrough and a list.

**Present the structure before writing it.** Show the headings, the placements, and anything
you could not place, and ask for corrections. Navigation is something the architect knows
better than any reading of the code will tell you.

## 3. Handle what has no place in a walkthrough

Some scenarios have no user-facing surface: queue handlers, background reconciliation,
API-only behaviour. They are not gaps.

Put them under an excluded section **with a reason**:

```markdown
## Not shown

<!-- excluded: no user-facing surface -->
@CASH-OUTBOX-001 - drained by a queue handler, nothing on screen
```

A reason is required. An unexplained exclusion is indistinguishable from an oversight, which
is why `n/a` carries one everywhere else in this standard.

## 4. Audit

```bash
npx criteria-review present check          # every presentation
npx criteria-review present check "Demo"   # one of them
```

Four findings, and they need different responses:

- **MISSING** - a scenario nobody placed. In a `complete` presentation this is a real gap:
  somebody will be shown the product and this part of it will be absent, with nothing saying
  so. Place it, or exclude it with a reason.
- **DANGLING** - a reference to a scenario that no longer exists. The walkthrough is promising
  something retired. Remove it, or find what replaced it.
- **(twice)** - information, not a fault. A scenario reachable from two menus belongs in both.
- **PROBLEM** - a malformed scope, or an exclusion with no reason.

**Say what the audit cannot do**, every time you report it clean: it catches missing and
dangling, never **wrong placement**. If a menu moved, the presentation is quietly out of date
and only a person watching notices.

## 4a. Check placement against the application's real flow

The audit cannot tell you a placement is in the wrong section - but **you can**, by reading the
software, and this is the part of the job a person is least likely to do by hand.

For each placement, gather where the behaviour actually lives:

1. **What route or screen does the journey visit?** A journey citing the scenario navigates
   somewhere. That route is hard evidence about where a user encounters this.
2. **How is that screen reached?** Read the navigation - the menu configuration, the router,
   the component that renders the links. That is the path a user walks, and the presentation
   should mirror it.
3. **Is the scenario reachable from more than one place?** Then it may legitimately belong in
   two sections, and the audit reporting a duplicate is confirmation rather than a fault.

Then compare, and report a placement that contradicts the flow:

```
LOCK-FAIL-001 sits under "The register > Getting back in"
  its journey visits /settings/security, reached from Settings, not from the till
  -> looks misplaced; Settings > Security matches the route it actually exercises
```

**Report it, do not move it.** A section title is a judgement about how a customer thinks
about the product, and the route is only evidence about how the software is built. Those
usually agree and sometimes should not - a thing implemented under Settings may still be
demonstrated where a cashier would meet it. Say what the code shows and let the person decide.

**Say which kind of claim you are making.** "The journey visits /settings/security" is read
from the source. "This should move" is a judgement. Keep them apart in the report, because the
first is checkable and the second is an opinion that deserves to be argued with.

This is also how a presentation is kept honest as the product changes: a menu reorganisation
makes placements quietly wrong, nothing in the audit notices, and a pass over the routes is
the only thing that will.

## 5. Placing new work, which is the part that keeps this alive

When a scenario lands, it belongs somewhere:

```bash
npx criteria-review present place LOCK-FAIL-001
```

That recommends a section in each presentation, judged by where the scenario's siblings sit,
and reports its basis rather than only its answer. Weigh it rather than taking it:

- **"4 sibling placements in this section"** is strong evidence.
- **"no siblings placed yet"** means this is new territory and needs a person's judgement
  about where a user would find it.

A `partial` presentation often should NOT gain the new scenario - a demo stays short by
choice. Ask rather than adding it everywhere the recommendation appears.

**Do this as work lands, not at delivery.** A presentation reconstructed under time pressure
at handover is the failure this whole standard is written against.

## 6. Showing it

In the review page, a presentation is a **view** beside natural order and the tree. Selecting
one reorders the queue under the presentation's own headings, and the usual keys walk it -
`j` and `k` in presentation order, each scenario's recording playing where it sits. That is
the mode to be in when walking a customer through the product.

For a package, `criteria-review manifest` records the evidence; a presentation is the order to
assemble it in when the audience is a customer rather than a reviewer.

## Report

```
Total application [complete]  17/17 placed  OK
Customer demo     [partial]    5 placed     OK
  2 scenarios excluded, both with reasons
  1 scenario appears twice - deliberate, reachable from two menus
  The audit covers missing and dangling only. It cannot tell you a menu moved.
```

Never place a scenario into a presentation to make an audit pass without reading it. A
walkthrough that mentions something in the wrong place is worse than one that admits a gap,
because the gap is visible and the wrong placement is not.
