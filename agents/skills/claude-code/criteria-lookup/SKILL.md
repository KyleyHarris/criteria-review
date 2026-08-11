---
name: criteria-lookup
description: Look up an acceptance scenario and answer it in conversation, without opening the review tool's page. Presents the scenario, its intent and any notes, takes your reply as the note, and offers accept / verify / send back. Also walks the whole queue one at a time, most important first, with continue or stop between each. Use when the architect says "look up <ID>", "what do the criteria say about X", "show me that scenario", "let's do a review pass", "walk the queue", "what needs my decision", or replies to a presented scenario with prose rather than a command.
---

# Look up and answer criteria in conversation

The visual tool is the right surface for a long review pass beside the recordings. This is the
other one: a single question mid-task, or a walk through the queue by voice, where opening a page
and finding the scenario costs more than the answer is worth.

**Everything here writes straight into the source document.** No browser, no running server. An
open page updates itself, because the server watches the criteria directories.

---

## Looking one thing up

```bash
criteria-review show <ID> [project]
```

Present what it prints, in full, as prose the architect can read without decoding:

- the id, title and where it lives
- the status, persona and any flags
- **the intent line, always, including when it is missing** - print "not sourced" rather than
  omitting it. An unsourced scenario is the most dangerous kind, and silence reads as fine
- the Given / When / Then clauses verbatim
- every note, with its author and date

Then ask what they want to do with it. Do not assume.

## Their reply IS the note

When the architect answers with prose rather than a command, that prose is the note. Write it:

```bash
criteria-review note <ID> [project] --message "<their words>"
```

**Use their words, not a summary.** The note is sourced intent, which is the one thing that cannot
be reconstructed from the code later. Tidy obvious dictation artefacts and nothing else; if their
meaning is unclear, ask rather than paraphrase a guess into the document.

A note written this way raises `@review`, which says an agent must act on it. That is correct even
when you are about to act immediately: the flag is what survives the session ending.

## The three status moves

Offer them by name, and never take one without being told to.

| They say | Command | What it claims |
|---|---|---|
| accept / that is right / confirmed | `criteria-review accept <ID>` | This is what the software SHOULD do |
| verify / I watched that | `criteria-review verify <ID> --commit <sha>` | A person watched the software do it |
| send it back / not right | `criteria-review reject <ID>` | Back to derived |

**Verify is the one to be careful with.** It claims a person watched the software do this, at a
named commit. Do not offer it as a default option in conversation, and never take it because the
scenario looks plausible. Offer it when they say they watched it, and get the commit - the command
refuses without one, deliberately, because a verification with nothing behind it ages into a lie.

Accepting and noting are independent: `--message` may be passed alongside a status move, and both
are recorded.

---

## Walking the queue

```bash
criteria-review queue --limit 10
```

Ordered exactly as the page orders it: flagged items first, then grouped by document with the
riskiest documents leading. Do not reorder it yourself - the architect sees the same order on
screen, and two orderings would leave them unable to tell which is right.

Then, **one at a time**:

1. Present the scenario in full, as above.
2. Take their reply. Prose becomes the note; a status word becomes the status move.
3. **Apply it immediately**, before presenting the next one.
4. Say in one line what was recorded, then present the next.

Keep going until they stop you. Between items, "next", "continue" or a bare reply means carry on;
"stop", "that's enough" or "cancel" ends the pass. Offer that explicitly at the start, not after
they have already answered six.

**Write as you go, do not batch.** A pass that collected ten answers and wrote them at the end
loses all ten if the session ends, and the whole design puts review state in the documents rather
than in a session that can evaporate. Writing each one also means an open page updates as they go.

At the end, summarise: how many were answered, what each became, and how many remain in the queue.

## While walking, do not

- **Do not accept in bulk.** Every promotion is a person deciding one scenario. "Accept the rest"
  is a request to stop and confirm what "the rest" contains, not an instruction to loop.
- **Do not skip an item silently.** If something cannot be presented, say which and why.
- **Do not summarise a scenario instead of showing it.** The wording is the requirement; a
  paraphrase is the reviewer confirming your rewrite rather than the criterion.
- **Do not fix the software mid-pass.** A note recording what is wrong is the output. Acting on it
  is separate work, after the pass, with the note in front of you.

---

## The other direction

If **you** need the architect's ruling on something and they are not in the conversation, the
question belongs beside the scenario rather than in a transcript that scrolls away:

```bash
criteria-review ask <ID> [project] --message "the question" --as <who>
```

That raises `@looknow` and puts the question in their queue. Read what came back with
`criteria-review notes`, act, then `criteria-review handled <ID>` to hand the item back for
re-review.

## Ambiguity

An id that exists in two registered projects is refused rather than guessed, naming both. Ask which
one. Writing an answer against a scenario the architect did not read is the failure that refusal
exists to prevent.

## Related

- `criteria-review guide` and the standard in `docs/standard/` for what the statuses mean and how
  criteria are written.
- The visual tool (`criteria-review here`) for a long pass beside the recordings, which is still
  the better surface when there is video to watch.
