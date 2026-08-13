---
name: criteria-plan
description: Turn a task into a working list of acceptance scenarios. Asks for the list or for how to get it (a paste, a file, a GitHub issue, an Azure DevOps work item, or the queue), presents what it resolved for verification before writing anything, prepares the plan, then asks what to do with it. Use when the architect says "plan this task", "here is the work", "make a plan", "what am I working on", "pick up issue N", or hands over a list of scenario ids.
---

# Plan a task

A task's scenarios are declared **before** the work, by whoever prepared the task. This skill
turns that declaration into a working list the other skills operate on.

Four steps, in order. **Nothing is written until step 3**, and step 2 is what makes that safe.

---

## 1. Ask for the list, or for how to get it

Do not guess the source. Ask, and offer the routes:

```
Where is the list?
1  paste it            - I will read ids out of whatever you paste
2  a file              - path to a document holding them
3  a work item         - GitHub issue, Azure DevOps, a URL: I will fetch it
4  from the queue      - pick from what needs a decision here
```

For 3, **you** fetch it - `gh issue view <n> --json title,body`, an `az boards work-item show`,
a `WebFetch` of a URL. The tool never learns what an issue tracker is; it resolves ids and
nothing more.

Note the task's name and where the list came from. Both go in the plan so a reader later can
tell what this work was and what declared it.

## 2. Present what you resolved, and wait

Show the list **before writing it**, in three groups, because they need different answers:

```
Resolves to existing criteria (4)
  LOCK-OPEN-002   derived    A different cashier unlocking is recorded
  CASH-CLOSE-003  derived    Closing while movements are still pending
  ...

Needs criteria first (2)
  "the composer should refuse a second note"   - no scenario covers this
  "operators want a shorter close"             - no scenario covers this

Not criteria-shaped (1)
  "rename the config helper"
```

The second group is the one that matters. Those are not failures of matching: they are work
the task covers and the criteria do not, which means **`criteria-backfill` runs before this
task can be planned honestly**. Say that plainly rather than quietly planning around them.

Ask for confirmation, corrections, or additions. Then, and only then, step 3.

## 3. Prepare it

```bash
npx criteria-review plan set <IDS...> --task "<name>" --source "<where it came from>"
npx criteria-review plan add <IDS...>          # scope grew: append, never re-set
```

Piped input works, so a work item body can go in whole:

```bash
gh issue view 412 --json body -q .body | npx criteria-review plan set - --task "Till hardening"
```

**The plan holds ids and nothing else.** Not titles, not statuses, not a todo list of its own.
Everything else is read live from the acceptance documents, so there is no copy here that can
go stale and no second thing claiming to know whether something is done.

That has a consequence worth saying out loud when someone asks for it: **there is no "mark it
done".** A scenario is done when its status moved and a journey cites it - a fact about the
document, not a tick entered by whoever wanted to feel finished.

## 4. Ask what to do with it

The plan is a scope. Offer what can now run against it:

```
1  create the missing tests   - journeys for scenarios that have none      (criteria-test)
2  implement the code         - for scenarios the build does not satisfy   (criteria-develop)
3  walk them                  - present each for your affirmation          (criteria-lookup)
4  record and bundle          - videos for what this plan covers           (criteria-bundle)
5  just save it               - stop here
```

Every one of those reads the plan rather than being handed a list, so none of them needs its
own idea of "the current batch":

```bash
npx criteria-review queue --plan     # the queue, narrowed to this task
npx criteria-review plan next        # the next outstanding one, in queue order
npx criteria-review plan check       # exits non-zero while anything is outstanding
```

---

## Keeping it honest

**Scope that grows goes back to the declaration.** When something is added agilely, append it
to the work item as well as the plan. A plan that quietly outgrew its work item makes the
completeness check pass against a list that stopped being the scope on day two.

**Report orphans rather than skipping them.** A plan naming a scenario that has since been
renamed or deleted is stale, and the failure is silent by nature - the item simply stops
appearing. `plan show` and `plan check` both name them; pass that on rather than presenting a
shorter list as if it were the whole one.

**`plan check` is the delivery gate**, and it answers from the documents. A task that covered
eight of its eleven declared scenarios says so and names the three. That is only possible
because the list was written before the work rather than reconstructed after it.

**Ignore `.criteria/` in the repository.** The plan is local selection; the durable record of
what a task covered is the work item plus the scenarios' own statuses.
