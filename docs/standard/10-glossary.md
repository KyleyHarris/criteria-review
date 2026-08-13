# The glossary

Criteria are user-facing prose naming domain concepts, so they are exactly the class of text a
glossary exists for - and they are usually the last surface anyone applies it to.

The failure is quiet. A product renames the thing a login belongs to from "Member" to "Company",
or an "Organization Type" to an "Operation Type", and every criterion that spelled the old word
is now describing something that does not exist. Nothing catches it, because the words are prose
and prose always parses.

---

## The rule

**A criterion never spells a domain noun. It names the concept, and the word is resolved when
the criterion is read.**

```gherkin
@CO-TYPES-001 @status:derived @persona:Support staff
Scenario: A {loginGroup} must have at least one {operationType}
  Given a new {loginGroup}
  When staff save it with no {operationType.lower} chosen
  Then the save is refused
  And the {loginGroup.lower} is not created
```

Braces, not `<>`, because Scenario Outline owns that syntax.

Text that is genuinely about this screen and nothing else does not need a term. The question is
not "is this string correct" but **"who owns this word"**.

## The manifest

One file per project, declared in `criteria.json`:

```json
{ "terms": "acceptance/terms.json" }
```

```json
{
  "loginGroup": {
    "value": "Company",
    "plural": "Companies",
    "description": "The organisation a login belongs to. Was 'Member' until 2026-08.",
    "casing": "title",
    "possessive": "Company's"
  }
}
```

| Field | Required | What it is |
|---|---|---|
| `value` | yes | The singular, exactly as a user sees it |
| `plural` | yes | Authored, because English pluralisation is not reliably mechanical |
| `description` | yes | What the concept **is**, for the next author deciding whether this is the term they want |
| `casing` | no | `title` (default) or `preserve`, for words like `iMIS` whose capitalisation is part of their identity |
| `possessive` | no | Overrides the derivation where English disagrees with itself after a trailing s |

**Two rules the format enforces, and they are the whole point:**

**Keys name the internal domain; values name what the user sees.** The key is `loginGroup`
because the entity is a login group. The value was "Member" and is now "Company". Keys and values
have different lifetimes, so keying on the current word would make the next rename a *key*
rename, and would leave `member` resolving to "Company".

**Only `value` and `plural` are authored.** `{term.lower}`, `{term.lowerPlural}` and
`{term.possessive}` derive. An authored lowercase is where drift reappears inside a single term:
change `value`, forget the sibling, and the exercise has failed at the smallest possible scale.
`possessive` is the one exception, and therefore the one authored form that can silently
disagree with `value` - re-check it whenever `value` changes.

## What the tool does, and what it deliberately does not

**It owns the format and the requirement.** `criteria-review terms` shows the glossary with its
derived forms and how often each term is used; `terms check` exits non-zero on any marker the
glossary does not define. `generate` refuses outright rather than emitting a sentinel into a
consumer's typed module - strict in the gate, tolerant in the viewer, which shows the marker so a
reviewer can see what is missing.

**It never generates the content.** A project's vocabulary really lives somewhere already: a
typed registry in the application, a database, a specification. A second hand-kept copy here
would be drift on a new axis, which is the problem this was built to remove. The project writes a
script that emits the manifest from its own source of truth, and re-runs it on demand. See the
`criteria-glossary` skill, which exists to define that script once.

## The emitted artefact carries both forms

This is the decision the whole feature turns on.

```ts
steps: [
  'Given a new {loginGroup}',                      // the BINDING key
],
stepsDisplay: [
  'Given a new Company',                           // what a person reads
],
```

A journey supplies one body per clause, keyed on the **raw** text. So a term rename changes
`stepsDisplay` and nothing else: no clause key moves, no journey breaks, no mechanical sweep.

Emitting the rendered words as the key would do the opposite - every rename would change every
clause key and break every citing journey, which is precisely the cost a glossary exists to
avoid. Verified rather than assumed: renaming a term and regenerating produces a diff touching
only the display fields.

Captions, reports, videos and the review page all use the display form, so what a viewer is told
still reads as the product reads.

**A journey asserting on-screen text should assert the glossary's term** rather than a
hard-coded word, taking it from the emitted module. A screen that stops honouring the glossary is
then caught rather than discovered.

## What counts as a term

A word naming a **domain concept**: the organisation, the person, the operation, the report, the
status. If the product could plausibly rename it and the rename would need finding in a hundred
places, it is a term.

Not everything is. Screen-local copy, verbs, and words with no domain meaning stay as prose. A
glossary that swallows ordinary English makes documents unreadable and buys nothing, because
nobody renames "the".

## When a term changes

1. Change it at its real source, and regenerate the manifest.
2. `criteria-review terms check` - every marker still resolves.
3. Regenerate the scenario module. **The diff should touch display fields only.** If a binding
   key moved, something spelled the word instead of naming the concept, and that criterion is
   the one to fix.
4. Nothing else. No sweep, no document edits, no journey edits.

That last line is the entire return on the exercise.
