# The product owner: describing the need

Before the architect designs anything, someone has to say what the business does and what it
needs. That person is the product owner: the customer, or whoever speaks for the work the software
will serve. This file describes what the product owner provides, in what shape, and why, so that
the architect's intake ([`00-roles-and-ownership.md`](00-roles-and-ownership.md), section 3) starts
from a described need rather than from a guess.

The product owner describes the **business and the need**, never the software. The architect
decides how the need is met. Where the product owner knows the domain and the developer does not,
the product owner's documents are the only place that knowledge reaches the build, so they must
carry all of it.

---

## Why this role exists

Every request that reaches the architect as a one-line want has to be turned into intent by
someone. Without a product owner's documents, the architect does that alone, from conversation,
and the intent that results is the architect's reading of the customer, not the customer's own
statement. Intake can then only judge what the architect wrote down.

Two failures follow, and both were observed:

- **The architect cannot design without the business.** How the work is done today, without
  software, decides what software should do. A request to "calculate X" says nothing about who
  needs X, what they do with it, or what goes wrong without it.
- **The developer cannot fill an engineering gap.** In a specialist domain the developer knows
  software and nothing of the field. A value described by name only ("the edge count") is built
  by guessing, and the guess is fluent and wrong. The domain detail has to be written down by the
  one person who has it.

---

## What the product owner provides

Three kinds of document, in this order. The first is always written; the other two are written
when the need is a set of values to work out or a set of checks to apply.

### 1. The business and its needs

The questions a business analyst asks before any software is designed, as sections:

1. **What you do, and why.** The work, why it matters, and what goes wrong if it is done badly.
2. **How you do it now, without software.** Who is involved, what arrives, each step in order
   (who does it, what they look at, what they check, what they decide, where they record it, how
   long it takes), and the possible outcomes.
3. **What is hard about it.** For each difficulty: how often it happens, and what it costs in
   time, errors, rework or disputes.
4. **What you want software to solve.** The goals ranked: accuracy, speed, data entry,
   digitisation, consistency, traceability, others. For each, what "better" means, in a number
   where possible.
5. **The needs, as user stories.** One per need: "As a *who*, I want *what*, so that *why*."

The user stories are the needs. The value and check documents below give each story's detail.

### 2. The values the software must work out

One document for the whole group, opening with the group's "so that". One entry per value:

| Part | What it holds |
|---|---|
| **Use case** | Who needs it, and what for. |
| **Today** | Where in today's process it is worked out or looked at, by whom, and how. |
| **Terms** | Each term from the field the value uses, explained for someone outside the field. |
| **Starts from** | The facts it is worked out from, named exactly as their source shows them. |
| **Steps** | Numbered, in plain words, from those facts to the value, including what happens when a fact is missing or the steps give no clear answer. |
| **Result** | What the value is, its unit and its precision. |
| **Why it works this way** | The reason, and the standard or document behind it. |
| **Assumptions, and when they break** | What must be true of a case for the steps to be right, and what to do with one where it is not. |
| **Worked example** | A real case: the actual starting values, each step's result, and the answer. |

### 3. The checks the software must apply

One document for the whole group, opening with its "so that". One entry per check:

| Part | What it holds |
|---|---|
| **Use case** | What goes wrong if the check is missing. |
| **Today** | Where in today's process it is checked, by whom, and how: by eye, or from a number. |
| **Terms** | As above. |
| **Starts from** | The facts it reads, named as their source shows them. |
| **The check** | Exactly what must be true, with its limit and the reason for that limit. |
| **If it fails** | Rejected; warning, meaning accepted but flagged; or review, meaning a person decides. |
| **Source** | Where the check comes from. |
| **Why it works this way** | As above. |
| **Assumptions, and when they break** | As above. |
| **Worked examples** | A real case that passes and one that fails, with the actual values and the outcome. |

Every document ends with its **Open questions** (everything uncertain, and every assumption) and
its **Ideas, not requirements** (any solution the product owner suggested, kept for the architect
to consider and marked as an idea only).

---

## The rules that make the documents usable

- **Needs, never solutions.** No screens, buttons, databases, tables, fields, file formats or
  code. When the product owner describes a solution ("add a column for..."), the need behind it is
  recorded ("I need to find every case where..."), and the solution is kept under Ideas.
- **The reader knows nothing of the field.** Every term is explained the first time it appears,
  with what it means physically, not only its name.
- **Real examples, real numbers.** A worked example with actual values is what lets a developer
  check their build against the product owner's own arithmetic.
- **Never invented.** What the product owner cannot answer is recorded as an open question.
  Whoever helps write the document, a person or an assistant, does not fill the gap.
- **Sources named.** Every rule and limit says where it comes from, or appears in Open questions.

---

## Writing them with an assistant

[`12-product-owner-prompt.txt`](12-product-owner-prompt.txt) is a block of text a product owner
pastes into any AI assistant (ChatGPT, Copilot, Claude). It interviews them in this order, holds
them to needs rather than solutions, and writes the documents in these shapes. For Claude Code,
the `criteria-product-owner` skill runs the same interview.

The prompt is the product owner's tool, not the architect's. It is deliberately usable with no
knowledge of this standard, the tool, or software.

---

## How the architect uses them

The documents are intake's input, and they map onto intake's three outcomes
([`00-roles-and-ownership.md`](00-roles-and-ownership.md), section 3):

- **Admitted** when each need has a named actor, a real "so that", and sourced detail.
- **Returned** to the product owner, naming the missing part, when a story has no "so that" or a
  value has no steps.
- **Held** as a question when an open question blocks the design.

From an admitted need, the architect writes the tier 1 scenarios in the product owner's language
and the tier 2 obligations in the team's, and designs how it is met. The product owner's
documents are never edited into a design: they stay the record of what was asked, which is what
the tier 1 confirmation is later read against.

---

## What this file does not do

It does not define the acceptance document, the scenario format or the brief, which live in
[`02-writing-acceptance-criteria.md`](02-writing-acceptance-criteria.md) and
[`00-roles-and-ownership.md`](00-roles-and-ownership.md). The product owner's documents come
before those and feed them; they are not a second format for the same thing.
