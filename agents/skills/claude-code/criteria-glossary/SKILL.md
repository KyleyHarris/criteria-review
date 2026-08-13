---
name: criteria-glossary
description: Build or update the glossary manifest that lets acceptance criteria name domain concepts instead of spelling them. Finds where the project's vocabulary really lives, writes a script that emits the manifest from that source, records how to re-run it, and validates the result. Use when the architect says "build glossary", "update glossary", "the terms changed", "we renamed X to Y", or criteria are found spelling a word the product has since changed.
---

# Build or update the glossary

Criteria that spell a domain noun go stale the moment the product renames it, and nothing can
notice, because the words are prose. This skill sets up the manifest that fixes that, and the
script that keeps it current.

The format and the rules are in the standard's **glossary** document
(`npx criteria-review guide`, or the reading tab). Read it before authoring anything. This is
how to run the job.

---

## The split that decides everything here

**The tool owns the format. The project owns the content, and generates it.**

A project's vocabulary already lives somewhere: a typed registry in the application, a database
table, a specification, a decision log. Hand-copying it into a manifest creates a second source
of truth that drifts from the first - which is the exact problem the glossary was built to
remove, reintroduced one layer over.

So the job is not "write a terms file". It is **"find the source and write the script that emits
the file"**, once, so that afterwards "update glossary" is one command.

## 1. Find where the vocabulary really lives

Ask, and offer the shapes it usually takes:

```
Where do these words really live?
1  a typed registry in the code   - a terms module, an enum, a resource file
2  a database or an API           - lookup tables the product renames through
3  a document                     - a specification, a decision log, a glossary page
4  nowhere yet                    - we will author it, and it becomes the source
```

**Option 4 is a real answer, not a failure**, but say what it costs: the manifest becomes the
source of truth, so a rename made anywhere else will not reach it, and the next drift will be
between the product and this file. Where a registry exists, prefer it every time.

## 2. Write the generator, in the project

A script in the consuming project - its language, its conventions, beside its other generators.
Its whole job is to read the real source and emit the manifest:

```json
{
  "loginGroup": {
    "value": "Company",
    "plural": "Companies",
    "description": "The organisation a login belongs to"
  }
}
```

Then wire it where the project's other generators live, so it is discovered the way they are:

```json
"gen:glossary": "node scripts/gen-glossary.mjs > acceptance/terms.json"
```

And declare it once:

```json
// criteria.json
{ "terms": "acceptance/terms.json" }
```

**Three things to get right in the generator**, each of which the standard requires and the
tool refuses without:

- **Key on the internal domain, not the current word.** `loginGroup`, never `member`. If the
  source is keyed on the display word, map it - otherwise the next rename becomes a key rename
  and the whole exercise fails on its first real test.
- **Emit `plural` and `description`.** A term defined only in the form one screen uses is the
  next hard-coded plural. `description` is what stops the next author picking the wrong term.
- **Do not emit derived forms.** No `lower`, no `lowerPlural`. They derive, and an authored one
  is where drift reappears inside a single term.

## 3. Validate, and see what the documents actually use

```bash
npx criteria-review terms          # the glossary, its derived forms, and usage counts
npx criteria-review terms check    # every marker in every document resolves; non-zero if not
```

Read the usage report for two findings it surfaces without being asked:

- **A term marked UNUSED** is usually a rename that only half happened, or a word the criteria
  still spell rather than name.
- **A key used in documents but not defined** is a broken criterion. `terms check` names which
  scenario and which document.

## 4. Migrate the criteria that spell words

This is the part that needs judgement, so do not sweep it.

Search the acceptance documents for the term's current and previous values. For each hit, decide
whether it names the domain concept or is ordinary prose - **"who owns this word"**, not "is this
string correct". A glossary that swallows ordinary English makes documents unreadable.

Then present the proposed edits **before making them**, grouped by document, showing the sentence
before and after. A criterion is a requirement someone agreed to; rewording it silently is the
one thing this system exists to prevent, even when the reword is only a marker.

After the edits:

```bash
npx criteria-review generate . --out <the project's emit path>
```

**The diff should touch `stepsDisplay` and `titleDisplay` only.** If a binding key moved, that
criterion spelled the word instead of naming the concept, and it is the one to look at.

## 5. Updating, once it exists

When a word changes, the whole job is:

```bash
npm run gen:glossary          # re-emit from the real source
npx criteria-review terms check
npx criteria-review generate . --out <path>    # diff touches display fields only
```

No document edits. No journey edits. No sweep. If that is not what happens, say so - it means
something is still spelling a word somewhere, and finding it now is cheaper than finding it at
the next rename.

## Report

```
Glossary: 14 terms, generated from ui/src/language/terms.ts
  gen:glossary wired in ui/package.json
  terms check: every marker resolves
  3 documents migrated: 11 sentences now name concepts (shown above, approved)
  regenerated: diff touched display fields only - no binding key moved
  2 terms UNUSED - loginGroup was renamed and 4 criteria still spell "Member"
```

Never edit a criterion's meaning while doing this. Replacing a spelled word with the term that
names it is a faithful edit; anything else is a change to a requirement and belongs to
`criteria-lookup` and the person who owns the intent.
