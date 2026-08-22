// Writing review outcomes back into the source markdown.
//
// Review state lives in the criteria files themselves, not in a sidecar database.
// The notes an architect writes are sourced intent, which is the one thing that
// cannot be reverse-engineered later - so it belongs in git, travelling with the
// scenario it annotates and visible in review.
//
// Every write here is surgical: it touches the tag line of one scenario, or
// inserts a comment adjacent to it, and leaves every other byte alone. After
// writing, the file is re-parsed and the intended change asserted. A write that
// cannot prove it did what it claimed is reverted, because a tool that silently
// corrupts the architect's documents is worse than no tool.

import { readFile, writeFile } from 'node:fs/promises';
import { parseDocument, parseTags } from './parse.js';
import { STATUSES, FLAG_LOOKNOW, FLAG_REVIEW } from './parse.js';

function findScenario(scenarios, id) {
  return scenarios.find((s) => s.id === id) ?? null;
}

/**
 * Who a write is on behalf of.
 *
 * It has to be stated rather than inferred, because the same endpoint serves both
 * sides: `criteria-review handled` and the architect's "Mark handled" button both
 * clear notes, and they mean opposite things about whose attention is still owed.
 * The browser is always the architect; the CLI is always an agent.
 */
export const ACTOR_ARCHITECT = 'architect';

/**
 * The architect acted, so the request for their attention has been answered.
 *
 * `@looknow` means "an agent wants the architect's eyes on this". Any action they
 * take on the scenario - accepting it, marking it verified, sending it back to
 * derived, writing a note, clearing notes - IS them looking, so the flag comes off
 * with the action rather than needing a second, separate click to dismiss it. A
 * flag that survives being acted on turns the LOOK NOW badge into decoration: the
 * queue keeps presenting items already dealt with, and the reviewer learns to
 * ignore the one signal that was meant to jump the queue.
 *
 * An agent's write must never clear it - the agent is the side that raised it, and
 * `handled` deliberately raises it again to hand an item back.
 */
async function answerLookNow(file, id, actor) {
  if (actor !== ACTOR_ARCHITECT) return false;
  await setFlag(file, id, FLAG_LOOKNOW, false);
  return true;
}

/** Rebuild a tag line with `updates` applied, preserving order and unknown tags. */
export function rebuildTagLine(tagLine, id, updates) {
  const { raw } = parseTags(tagLine ?? '');
  const out = [];
  const applied = new Set();

  for (const tag of raw) {
    const body = tag.slice(1);
    const colon = body.indexOf(':');
    if (colon === -1) {
      out.push(tag); // the bare ID
      continue;
    }
    const key = body.slice(0, colon).toLowerCase();
    if (key in updates) {
      applied.add(key);
      if (updates[key] !== null) out.push(`@${key}:${updates[key]}`);
      // null means "remove this tag"
    } else {
      out.push(tag);
    }
  }

  // Anything not already present gets appended, so a derived scenario gaining
  // @verified/@commit for the first time still ends up well formed.
  for (const [key, value] of Object.entries(updates)) {
    if (applied.has(key) || value === null) continue;
    out.push(`@${key}:${value}`);
  }

  if (!out.some((t) => !t.includes(':'))) out.unshift(`@${id}`);
  return out.join(' ');
}

/**
 * Set a scenario's status, and stamp observation metadata when moving to `verified`.
 * Returns the new status on success.
 */
export async function setStatus(file, id, status, { commit, date, actor } = {}) {
  // Deliberately permissive on the VALUE, strict on the SHAPE. Consumer documents
  // predate this tool owning the vocabulary and carry statuses the standard has not
  // adopted; refusing to write one the documents already use would strand a reviewer
  // mid-pass over a disagreement they cannot resolve from here. A malformed tag is
  // still refused, and `generate` rejects an unrecognised status outright, which is
  // where the vocabulary is actually enforced. See docs/decisions.md D-005.
  if (!/^[a-z][a-z0-9-]*$/.test(String(status))) {
    throw new Error(
      `Malformed status "${status}". Expected a lowercase word such as ${STATUSES.join(', ')}.`
    );
  }

  const original = await readFile(file, 'utf8');
  const before = parseDocument(original, file);
  const target = findScenario(before, id);
  if (!target) throw new Error(`Scenario ${id} not found in ${file}`);
  if (!target.tagLine) {
    throw new Error(
      `Scenario ${id} has no tag line, so it has no ID to anchor a status to. ` +
        `Add "@${id} @status:derived" above the Scenario line first.`
    );
  }

  const updates = { status };
  // Only `verified` carries @verified/@commit, because only `verified` makes the claim
  // they record: a person watched THIS build do it on THAT day. `accepted` is a judgement
  // about what the software SHOULD do and requires watching nothing, so stamping it wrote
  // a sighting nobody made - dated today, with no commit from the review page, which is
  // exactly the uncheckable shape `emit` refuses for a verified scenario. An earlier and
  // real verification survives an acceptance untouched, because rebuildTagLine preserves
  // every tag it is not asked to change. When the acceptance itself happened is not stored
  // at all: it is the commit that wrote @status:accepted, which is useful rather than
  // load bearing and is already stamped in git.
  if (status === 'verified') {
    updates.verified = date ?? new Date().toISOString().slice(0, 10);
    if (commit) updates.commit = commit;
  }

  const newTagLine = rebuildTagLine(target.tagLine, id, updates);
  if (newTagLine === target.tagLine) {
    // The status is already what was asked for, so there is nothing to write - but
    // the architect still acted, and re-affirming a status is as much an answer to
    // a raised flag as changing one.
    await answerLookNow(file, id, actor);
    return status;
  }

  // Replace only the first occurrence of that exact tag line, to avoid touching a
  // second scenario that happens to share tag text.
  const idx = original.indexOf(target.tagLine);
  if (idx === -1) throw new Error(`Could not locate the tag line for ${id} in ${file}`);
  const updated =
    original.slice(0, idx) + newTagLine + original.slice(idx + target.tagLine.length);

  await writeFile(file, updated, 'utf8');

  // Prove the write did what it claimed.
  const after = findScenario(parseDocument(await readFile(file, 'utf8'), file), id);
  if (!after || after.status !== status) {
    await writeFile(file, original, 'utf8');
    throw new Error(
      `Write-back verification failed for ${id}: expected status "${status}", ` +
        `re-read gave "${after ? after.status : 'scenario missing'}". File restored unchanged.`
    );
  }

  // Only once the status write is proven. Clearing first would drop the flag for
  // an action that then failed, losing the request for attention with nothing to
  // show for it.
  await answerLookNow(file, id, actor);
  return status;
}

/**
 * Remove review notes from a scenario.
 *
 * The agent's half of the protocol: read the note, act on it, remove it, and
 * raise @looknow so the architect re-reviews. Leaving acted-on notes in place
 * would make the document accumulate a discussion nobody can tell is finished.
 *
 * The architect uses the same call from the review page to retire a discussion
 * they consider closed, which is why the actor decides what happens to @looknow:
 * their clear answers the flag, an agent's clear is followed by raising it.
 */
export async function clearNotes(file, id, { actor } = {}) {
  const original = await readFile(file, 'utf8');
  const target = findScenario(parseDocument(original, file), id);
  if (!target) throw new Error(`Scenario ${id} not found in ${file}`);
  if (!(target.notes ?? []).length) {
    await answerLookNow(file, id, actor);
    return 0;
  }

  // Delete exactly the byte spans the parser attributed to THIS scenario, back to
  // front so the earlier offsets stay valid. A pattern-based sweep of everything
  // above the scenario cannot tell one scenario's notes from another's: it removed
  // every note earlier in the document too, and reported that as success. Notes are
  // sourced intent, so losing one is the most expensive thing this module can do.
  const spans = (target.notes ?? [])
    .filter((n) => Number.isInteger(n.at) && Number.isInteger(n.end))
    .sort((a, b) => b.at - a.at);
  const removed = spans.length;
  let updated = original;
  for (const n of spans) updated = updated.slice(0, n.at) + updated.slice(n.end);
  await writeFile(file, updated, 'utf8');

  const reparsed = parseDocument(await readFile(file, 'utf8'), file);
  const after = findScenario(reparsed, id);
  const notesLeftInFile = reparsed.reduce((n, s) => n + (s.notes ?? []).length, 0);
  const notesBefore = parseDocument(original, file).reduce((n, s) => n + (s.notes ?? []).length, 0);
  // Assert the removal rather than assume it. The count is checked across the WHOLE
  // file, not just this scenario, because the failure worth catching is collateral:
  // a write that clears the right note and takes someone else's with it.
  if (!after || (after.notes ?? []).length || notesLeftInFile !== notesBefore - removed) {
    await writeFile(file, original, 'utf8');
    throw new Error(
      `Write-back verification failed clearing notes on ${id}: expected ${
        notesBefore - removed
      } note(s) left in the file, found ${notesLeftInFile}${
        after ? '' : ' and the scenario was lost'
      }. File restored unchanged.`
    );
  }
  await setFlag(file, id, FLAG_REVIEW, false);
  await answerLookNow(file, id, actor);
  return removed;
}

/**
 * Add or clear a bare flag tag such as `@looknow`.
 *
 * Separate from setStatus because a flag is not part of the lifecycle: it says
 * "someone wants eyes on this", which is orthogonal to whether the requirement has
 * been confirmed. Collapsing them would mean clearing a flag silently changed a
 * status, or vice versa.
 */
export async function setFlag(file, id, flag, on) {
  const original = await readFile(file, 'utf8');
  const target = findScenario(parseDocument(original, file), id);
  if (!target) throw new Error(`Scenario ${id} not found in ${file}`);
  if (!target.tagLine) throw new Error(`Scenario ${id} has no tag line to flag.`);

  const has = (target.flags ?? []).includes(flag);
  if (has === !!on) return !!on; // already in the requested state

  const newTagLine = on
    ? `${target.tagLine} @${flag}`
    : target.tagLine
        .split(/\s+/)
        .filter((t) => t.toLowerCase() !== `@${flag}`)
        .join(' ');

  const idx = original.indexOf(target.tagLine);
  if (idx === -1) throw new Error(`Could not locate the tag line for ${id} in ${file}`);
  const updated =
    original.slice(0, idx) + newTagLine + original.slice(idx + target.tagLine.length);
  await writeFile(file, updated, 'utf8');

  const after = findScenario(parseDocument(await readFile(file, 'utf8'), file), id);
  if (!after || (after.flags ?? []).includes(flag) !== !!on) {
    await writeFile(file, original, 'utf8');
    throw new Error(`Write-back verification failed setting @${flag} on ${id}. File restored.`);
  }
  return !!on;
}

/**
 * Append a review note immediately above a scenario's gherkin block, as an HTML
 * comment so it is inert to any Gherkin parser and invisible in rendered markdown
 * previews while still living in the file.
 */
export async function addNote(file, id, note, { author, date, actor } = {}) {
  const trimmed = String(note ?? '').trim();
  if (!trimmed) throw new Error('Refusing to write an empty review note.');

  const original = await readFile(file, 'utf8');
  const target = findScenario(parseDocument(original, file), id);
  if (!target) throw new Error(`Scenario ${id} not found in ${file}`);

  const stamp = date ?? new Date().toISOString().slice(0, 10);
  const who = author ? ` ${author}` : '';
  // Newlines are PRESERVED. A one-line box was why notes stayed unwritten: the
  // architect is discussing an item, not labelling it. Only the comment
  // terminator is neutralised, since that would break the document.
  const body = trimmed.replace(/--+>/g, '->');
  const comment = `<!-- review${who} ${stamp}: ${body} -->\n`;

  // The parser records where a note belongs: above the enclosing fence when there
  // is one, else above the tag line. Searching backwards for a fence here was
  // wrong once a single fence could hold many scenarios - it put every note above
  // the FIRST scenario in the block regardless of which one was annotated.
  const insertAt = target.anchor ?? target.blockStart;
  const updated = original.slice(0, insertAt) + comment + original.slice(insertAt);

  await writeFile(file, updated, 'utf8');

  const after = await readFile(file, 'utf8');
  const reparsed = findScenario(parseDocument(after, file), id);
  if (!reparsed || !(reparsed.notes ?? []).some((n) => n.text.includes(body.split('\n')[0]))) {
    await writeFile(file, original, 'utf8');
    throw new Error(
      `Write-back verification failed adding a note to ${id}. File restored unchanged.`
    );
  }

  // A note is a message, and the AUTHOR decides which way it travels. Without this
  // an agent could flag a scenario but never state the question, so the architect
  // arrived at a LOOK NOW badge with nothing to answer and the question survived
  // only in a chat transcript that scrolls away.
  //
  //   architect writes  -> @review,  an agent must act on it
  //   an agent writes   -> @looknow, the architect must answer it
  //
  // Raising @review for an agent's own note would point the item back at the side
  // that wrote it, and the loop would never hand over.
  if (actor === ACTOR_ARCHITECT) {
    await setFlag(file, id, FLAG_REVIEW, true);
    // ...and answer @looknow, which is the same exchange in the other direction: an
    // agent asked to be looked at, the architect looked and wrote back. Leaving both
    // flags up would show the item as owed by each side at once.
    await answerLookNow(file, id, actor);
  } else {
    await setFlag(file, id, FLAG_LOOKNOW, true);
  }
  return comment.trim();
}
