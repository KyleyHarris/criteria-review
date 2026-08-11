# The emit contract

What `criteria-review generate` produces, what a consumer may rely on, and how the gate is
wired. This is the interface between the standard and a test suite, so it changes by version
bump rather than quietly. See `../decisions.md` D-003, D-004, D-005.

---

## The commands

```bash
# Write the artefact. The consumer's package script is where this lives, so it travels
# with the repository and works on a machine that has never registered anything.
criteria-review generate . --out tests/e2e/support/scenarios.generated.ts

# Verify it matches the documents, change nothing, exit non-zero if it does not.
criteria-review generate . --out tests/e2e/support/scenarios.generated.ts --check

# The neutral artefact, for a consumer that is not TypeScript.
criteria-review generate . --out build/scenarios.json --format json
```

`--format` defaults from the output extension.

**`--out` resolves against the project root being scanned, not against the working directory.**
A project whose criteria sit at the repository root and whose suite sits in a subdirectory
therefore passes the subdirectory in the path: `--out ui/tests/e2e/support/scenarios.generated.ts`,
even when the script itself runs from `ui/`. Anchoring on the scanned root is what keeps the same
command working from a package script, a gate and a CI job without three different relative paths.

**Write and check are two commands on purpose.** A gate that silently regenerated would hide
exactly the drift it exists to catch: someone edits a document, the gate quietly rewrites the
artefact, and the test that no longer matches its criteria is never corrected.

## Gate wiring

Three places, each doing a different job:

| Where | Command | Why |
|---|---|---|
| Before the test run | `generate` (write) | The developer never runs a suite against stale clauses. |
| The verification gate | `generate --check` | Fails the build if the committed artefact and the documents disagree. |
| Continuous integration | `generate --check` | The same, on a machine nobody can wave through. |

**The generated file is committed.** A consumer builds and tests without this tool present; the
tool is needed to regenerate and to verify, never to compile. A build that could not run without
a locally-installed personal tool would be an unacceptable dependency for a project.

## What is emitted

Only scenarios that can be cited. A scenario with no id or no status is excluded, because
nothing can key on it, and its count is reported per document so the exclusion is never silent.

Ordering is by id, not by document position, so the artefact does not churn when a document is
reordered or a file renamed.

**There is no timestamp in the output.** A generated file that changes on every run cannot be
compared against the committed copy, which is the whole mechanism of `--check`.

### The neutral model

The version shown in these two samples is **illustrative**. The authoritative number is in
`src/version.js` and on the standard's README; it had already gone stale here once, which is why
this sentence exists rather than a promise to keep them in step.

```json
{
  "standardVersion": "<current>",
  "scenarios": [
    {
      "id": "LOCK-OPEN-001",
      "tag": "@LOCK-OPEN-001",
      "title": "The cashier's own PIN resumes their session in place",
      "feature": "Reopening",
      "status": "derived",
      "persona": "Cashier",
      "verifiedOn": null,
      "commit": null,
      "intent": "design-notes/till-lock.md section 5",
      "steps": [
        "Given the register was locked during a cashier's shift",
        "When that cashier enters their own PIN",
        "Then they are returned to the till",
        "And the same shift is still open, not a new one"
      ],
      "source": "acceptance/till-lock/till-lock-acceptance.md"
    }
  ],
  "untracked": [{ "title": "...", "source": "...", "reason": "no id" }]
}
```

Clauses are emitted **verbatim**, including their `Given` / `When` / `Then` / `And` keyword and
their original order. A consumer keys its step bodies on these exact strings, so any
normalisation here would break every citing journey.

### The TypeScript renderer

```ts
export const STANDARD_VERSION = '<current>';

export const SCENARIOS = {
  'LOCK-OPEN-001': {
    id: 'LOCK-OPEN-001',
    tag: '@LOCK-OPEN-001',
    title: "The cashier's own PIN resumes their session in place",
    feature: 'Reopening',
    status: 'derived',
    persona: 'Cashier',
    source: 'acceptance/till-lock/till-lock-acceptance.md',
    steps: [
      "Given the register was locked during a cashier's shift",
      'When that cashier enters their own PIN',
      'Then they are returned to the till',
      'And the same shift is still open, not a new one',
    ],
  },
} as const;

export type ScenarioKey = keyof typeof SCENARIOS;
export type Clause<K extends ScenarioKey> = (typeof SCENARIOS)[K]['steps'][number];
```

**`as const` is load bearing.** It narrows `steps` to a tuple of string literal types, which is
what lets a consumer require exactly those keys. Without it the type widens to `string[]`, every
guarantee below becomes vacuous, and nothing visible changes: the module still compiles on both
sides. A test guards its presence for exactly that reason.

## What the consumer gets

The binding is a few lines on the consumer's side:

```ts
export function journey<K extends ScenarioKey>(
  key: K,
  brief: { useCase: string; context: string },
  steps: { [C in Clause<K>]: (ctx: Ctx) => Promise<void> }
): void
```

Four classes of drift then become compile errors. Verified against real emitted criteria with a
real typecheck, not reasoned about:

| Drift | Result |
|---|---|
| A clause is reworded in the document | `TS2353`: the key does not exist in the expected type |
| A clause is skipped in the journey | `TS2345`: property missing in the supplied type |
| A step is invented that the document does not contain | `TS2353`: unknown property |
| A scenario id is renamed or deleted | `TS2345`: not assignable to `ScenarioKey` |

Two more properties come free: the coverage map is the set of referenced keys, so no
traceability table is maintained by hand; and the video index takes its id, title and persona
from the artefact rather than being retyped into each journey.

## What generation refuses

Strict here, tolerant in the review queue. The parser deliberately accepts unfamiliar statuses
and surfaces untagged scenarios as backlog, which is right for a queue and wrong for something a
build depends on.

| Refused | Why |
|---|---|
| An unrecognised status value | A mistyped status renders happily and ships a typo into a consumer's type. |
| A duplicate scenario id | The id is the join. Two scenarios sharing one point every citation at the wrong clauses, in both directions. |
| `@status:verified` without `@verified:` and `@commit:` | A claim that someone watched it happen with nothing recording when or at which commit is not a claim that can be checked. |
| A scenario with no clauses | An id a journey could cite while having nothing to prove. |

Every problem is reported at once rather than the first, so one run fixes them all.

## What this does not catch

A required clause can still be satisfied by a body that asserts nothing. That is a separate and
cheaper check: a finding on a `Then` or trailing `And` body containing no assertion. Stated here
rather than left implicit, because a guarantee list that overstates itself is how false assurance
gets built.
