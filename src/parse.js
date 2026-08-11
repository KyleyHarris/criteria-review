// Parser for the acceptance-criteria format. The format is defined by this repository's
// standard, in docs/standard/. Consumer projects conform to it; see docs/decisions.md D-001.
//
// The format is deliberately dual-audience: Gherkin prose a person reads, with a
// leading tag line a machine reads. This file is the machine half. It must stay
// tolerant, because a real consumer has two generations of documents in its tree -
// older ones carry bare `Scenario:` with no tags at all, and those are precisely the
// backlog worth surfacing rather than an error to reject. Generation is where the
// vocabulary is enforced strictly; see src/emit.js and D-005.
//
// Contract, from docs/standard/02-writing-acceptance-criteria.md:
//
//   ```gherkin
//   @ONB-ADMIN-001 @status:verified @verified:2026-08-01 @commit:a1b2c3d4 @persona:Administrator
//   Scenario: The first administrator must set their own password
//     Given ...
//     When ...
//     Then ...
//   ```
//
// An optional provenance comment may precede or follow the block:
//   <!-- intent: docs/pos-architecture.md:214 -->
//   <!-- intent: INFERRED from implementation - needs confirmation -->

/**
 * Statuses in lifecycle order. Anything else is treated as unknown.
 *
 * `proposed` is a scenario written at planning, before the software exists: a
 * proposal, not a description. It sits below `derived` because a description of
 * delivered software is at least known to match something, while a proposal has not
 * met reality yet. See docs/decisions.md D-006.
 */
export const STATUSES = ['proposed', 'derived', 'verified', 'accepted'];

/**
 * Bare tags that are FLAGS rather than the scenario ID.
 *
 * `@looknow` is how a working session marks something for the architect's
 * attention without interrupting them: an agent that notices a scenario is wrong,
 * unreachable, or contradicted by the code writes the tag as it goes, and the
 * review queue surfaces it. The alternative is a message in a transcript that
 * scrolls away, which is precisely how findings get lost.
 *
 * They must be recognised here, or the ID parser would take the first bare tag it
 * saw and a flagged scenario would appear to be called "looknow".
 */
export const FLAGS = new Set(['looknow', 'review']);

/**
 * The two directions of attention, deliberately distinct.
 *
 *   @review  - the architect has written a note that an agent must act on.
 *              Set automatically when a note is added.
 *   @looknow - an agent wants the architect's eyes on this.
 *
 * One flag would collapse the loop: "someone should look" cannot tell you WHO,
 * so each side would keep picking up the other's items. The protocol is
 * architect notes -> agent acts, removes the note, raises @looknow -> architect
 * re-reviews and clears it.
 */
export const FLAG_REVIEW = 'review';
export const FLAG_LOOKNOW = 'looknow';

const INTENT_COMMENT = /<!--\s*intent:\s*([\s\S]*?)-->/i;
// A note may run to several lines; the architect is discussing an item, not
// labelling it, and a one-line box was the reason notes went unwritten.
const REVIEW_COMMENT = /<!--\s*review(?:\s+([^:\n]*?))?:\s*([\s\S]*?)-->/i;
const FEATURE_HEADING = /^#{1,6}\s*Feature:\s*(.+?)\s*$/;
const SCENARIO_LINE = /^Scenario(?: Outline)?:\s*(.+)$/;
const STEP_LINE = /^(Given|When|Then|And|But|\*)\b/i;

/**
 * Split a tag line into individual tags. Tags are whitespace separated and start
 * with `@`, but a value may itself contain spaces (`@persona:Administrator`), so we
 * cannot simply split on whitespace: we split on the `@` boundaries instead.
 */
export function parseTags(line) {
  const tags = {};
  const ids = [];
  const raw = [];
  const parts = line.split(/\s+(?=@)/).filter(Boolean);
  for (const part of parts) {
    if (!part.startsWith('@')) continue;
    raw.push(part);
    const body = part.slice(1);
    const colon = body.indexOf(':');
    if (colon === -1) {
      // A bare tag with no value is the scenario ID by convention (@ONB-ADMIN-001),
      // unless it is a known flag such as @looknow.
      ids.push(body);
    } else {
      tags[body.slice(0, colon).toLowerCase()] = body.slice(colon + 1).trim();
    }
  }
  return { tags, ids, raw };
}

/**
 * Parse a whole acceptance document.
 *
 * Scans LINES, not fenced blocks. Two things forced that, both found by counting
 * what was on disk against what this returned:
 *
 *   - A single ```gherkin fence commonly holds many scenarios. Treating a fence as
 *     one scenario returned the first and silently dropped the rest - in one real
 *     document 9 fences held 27 scenarios, so 18 were invisible.
 *   - Older documents carry bare `Scenario:` with no fence at all. One such document
 *     held 19 of them and was being read as empty.
 *
 * Both classes are exactly the backlog this tool exists to surface, so a parser
 * that quietly skips them is worse than no parser: it reports a small, tidy queue
 * and hides the real one.
 *
 * Feature headings, tag lines and intent comments are positional: a scenario takes
 * the nearest preceding feature heading, the tag lines immediately above it, and
 * an intent comment since the previous scenario.
 */
export function parseDocument(text, source) {
  const lines = text.split('\n');

  // Byte offset of the start of each line, so anchors can be recorded for writing.
  const offsets = [];
  let acc = 0;
  for (const line of lines) {
    offsets.push(acc);
    acc += line.length + 1;
  }

  const scenarios = [];
  let feature = null;
  let pendingTags = [];
  let pendingTagStart = null;
  let pendingIntent = null;
  let pendingNotes = [];
  let fenceStart = null;
  let inFence = false;
  let current = null;

  const finish = () => {
    if (current) scenarios.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    // Fence tracking. The fence is not what defines a scenario, but knowing where
    // one starts lets a note be inserted above it rather than inside it, where it
    // would sit in the middle of the gherkin.
    if (t.startsWith('```')) {
      if (!inFence) {
        inFence = true;
        fenceStart = offsets[i];
      } else {
        inFence = false;
        fenceStart = null;
        finish();
      }
      continue;
    }

    const fm = FEATURE_HEADING.exec(t);
    if (fm) {
      finish();
      feature = fm[1];
      pendingTags = [];
      pendingTagStart = null;
      continue;
    }

    if (!inFence && /^#{1,6}\s/.test(t)) {
      // Any other heading ends the current scenario but leaves the feature alone.
      finish();
      continue;
    }

    // Comments can span lines, so gather from the raw text at this offset rather
    // than from the single trimmed line.
    if (t.startsWith('<!--')) {
      const rest = text.slice(offsets[i]);
      const end = rest.indexOf('-->');
      const blockText = end === -1 ? rest : rest.slice(0, end + 3);

      const im = INTENT_COMMENT.exec(blockText);
      if (im) {
        pendingIntent = im[1].trim().replace(/\s+/g, ' ');
      } else {
        const rm = REVIEW_COMMENT.exec(blockText);
        if (rm) {
          // The byte span is recorded because clearing a note has to delete THIS
          // comment and no other. Locating it again by pattern at write time
          // cannot tell two notes apart, and the first version that tried it
          // deleted every note above the scenario as well as its own.
          const at = offsets[i];
          const end = at + blockText.length;
          pendingNotes.push({
            who: (rm[1] || '').trim() || null,
            text: rm[2].trim(),
            at,
            // Swallow the line's own newline, so removing a note does not leave a
            // blank line behind that would accumulate on every clear.
            end: text[end] === '\n' ? end + 1 : end,
          });
        }
      }
      // Skip the lines this comment consumed.
      i += blockText.split('\n').length - 1;
      continue;
    }

    if (t.startsWith('@')) {
      finish();
      if (pendingTagStart === null) pendingTagStart = offsets[i];
      pendingTags.push(t);
      continue;
    }

    const sm = SCENARIO_LINE.exec(t);
    if (sm) {
      finish();
      const tagLine = pendingTags.length ? pendingTags.join(' ') : null;
      const { tags, ids, raw: rawTags } = tagLine
        ? parseTags(tagLine)
        : { tags: {}, ids: [], raw: [] };
      const flags = ids.filter((x) => FLAGS.has(x.toLowerCase())).map((x) => x.toLowerCase());
      const realIds = ids.filter((x) => !FLAGS.has(x.toLowerCase()));

      current = {
        id: realIds[0] ?? null,
        flags,
        title: sm[1].trim(),
        steps: [],
        status: tags.status ?? null,
        persona: tags.persona ?? null,
        verifiedOn: tags.verified ?? null,
        commit: tags.commit ?? null,
        tags,
        rawTags,
        tagLine,
        feature,
        intent: pendingIntent,
        notes: pendingNotes,
        source,
        // Where a note should be inserted: above the fence when there is one, else
        // above the tag line, else above the Scenario line itself.
        anchor: fenceStart ?? pendingTagStart ?? offsets[i],
        blockStart: pendingTagStart ?? offsets[i],
        index: scenarios.length,
      };
      pendingTags = [];
      pendingTagStart = null;
      pendingIntent = null;
      pendingNotes = [];
      continue;
    }

    if (current && STEP_LINE.test(t)) {
      current.steps.push(t);
      continue;
    }

    // A blank line inside a scenario is tolerated; anything else ends it.
    if (current && t !== '') finish();
  }
  finish();

  return scenarios;
}

/** Scenarios with no ID or no status are the backlog: they cannot be cited or tracked. */
export function isUntracked(scenario) {
  return !scenario.id || !scenario.status;
}

/** Everything a human still has to look at. */
export function needsReview(scenario) {
  return isUntracked(scenario) || scenario.status !== 'accepted';
}
