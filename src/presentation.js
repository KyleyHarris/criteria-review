// Presentations: how the product is walked through, as opposed to how its criteria are filed.
//
// TWO ORDERINGS, TWO READERS, AND THEY SHOULD DIVERGE. The folder structure is
// authoring-shaped - it follows how work arrived, feature by feature, bug by bug. That is
// right for maintaining criteria and wrong for showing somebody the product, which needs
// menu, page, action, in the order a person would actually be walked through it.
//
// A presentation is a LENS, not a re-ordering. It holds ids and narration and no content, so
// nothing here can disagree with a document about a title or a status - those are read live,
// exactly as the plan does it. Adding one changes no artefact and no default.
//
// SCOPE IS DECLARED, because "every scenario must appear" is right for a walkthrough of the
// whole product and wrong for a curated one. A `complete` presentation owes coverage; a
// `partial` one is a deliberate subset and owes only that its references resolve. Without the
// distinction the audit would either miss real gaps or complain about intended ones, and an
// audit that complains is an audit that gets ignored.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Where presentations live, by convention rather than configuration. */
export const PRESENTATION_DIRS = ['presentations'];

export const SCOPES = ['complete', 'partial'];

const H = /^(#{1,6})\s+(.*)$/;
/** `@ID`, optionally followed by ` - narration or reason`. Hyphen only, per the house rule. */
const PLACEMENT = /^@([A-Za-z][\w-]*)\s*(?:-\s*(.*))?$/;
const DIRECTIVE = /<!--\s*(scope|excluded|audience)\s*:?\s*([^>]*?)\s*-->/i;

/**
 * Parse one presentation.
 *
 * Headings give the tree and prose gives the narration, because a presentation is read by a
 * person and JSON would make the narration miserable to write - which is the part that makes
 * a walkthrough a walkthrough rather than a list.
 */
export function parsePresentation(text, source) {
  const lines = String(text ?? '').split('\n');
  const pres = {
    source,
    title: source,
    scope: 'partial',
    audience: null,
    sections: [],
    placements: [],
    excluded: [],
    problems: [],
  };

  // The path from the current heading back to the root, so a placement records where in the
  // walkthrough it sits rather than merely that it is somewhere.
  let path = [];
  let excludedHere = false;
  let excludedReason = null;
  let seenTitle = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const directive = DIRECTIVE.exec(line);
    if (directive) {
      const kind = directive[1].toLowerCase();
      const value = directive[2].trim();
      if (kind === 'scope') pres.scope = value.toLowerCase();
      else if (kind === 'audience') pres.audience = value;
      else {
        // Everything under this heading is deliberately not shown, and says why.
        excludedHere = true;
        excludedReason = value || null;
      }
      continue;
    }

    const heading = H.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const label = heading[2].trim();
      if (!seenTitle && depth === 1) {
        pres.title = label;
        seenTitle = true;
        path = [];
      } else {
        path = path.slice(0, Math.max(0, depth - 2));
        path.push(label);
        pres.sections.push({ depth, label, path: [...path] });
      }
      // A directive belongs to the heading it follows, so leaving the section clears it.
      excludedHere = false;
      excludedReason = null;
      continue;
    }

    const placed = PLACEMENT.exec(line.replace(/^[-*]\s*/, ''));
    if (placed) {
      const id = placed[1];
      const reason = placed[2];
      if (excludedHere) {
        // A reason is required, for the same purpose `n/a` carries one in the definition of
        // done: an unexplained exclusion is indistinguishable from an oversight.
        if (!reason && !excludedReason) {
          pres.problems.push(`${id}: excluded with no reason given`);
        }
        pres.excluded.push({ id, reason: reason ?? excludedReason });
      } else {
        pres.placements.push({ id, path: [...path], narration: reason ?? null });
      }
    }
  }

  if (!SCOPES.includes(pres.scope)) {
    pres.problems.push(`scope "${pres.scope}" is not one of ${SCOPES.join(', ')}`);
  }
  return pres;
}

/** Every presentation a project holds. Absent is not an error; a project may have none. */
export async function loadPresentations(root) {
  for (const dir of PRESENTATION_DIRS) {
    let entries;
    try {
      entries = await readdir(join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    const found = [];
    for (const e of entries.filter((x) => x.isFile() && x.name.endsWith('.md')).sort()) {
      const text = await readFile(join(root, dir, e.name), 'utf8');
      found.push(parsePresentation(text, `${dir}/${e.name}`));
    }
    return found;
  }
  return [];
}

/**
 * Audit a presentation against the scenarios that exist.
 *
 * Bidirectional, like every other citation check here: a reference that resolves to nothing
 * promises the viewer something retired, and a scenario nobody placed is a gap the viewer
 * cannot see. The second is the one this exists for - a presentation is built to show somebody
 * the whole product, so a silent omission misleads precisely the person it was built for.
 *
 * Duplicates are REPORTED, not faulted. A scenario reachable from two menus legitimately
 * appears twice, because that is where a user finds it.
 */
export function auditPresentation(pres, scenarios) {
  const byId = new Map(scenarios.filter((s) => s.id).map((s) => [s.id, s]));
  const placedIds = pres.placements.map((p) => p.id);
  const excludedIds = new Set(pres.excluded.map((e) => e.id));

  const dangling = placedIds.filter((id) => !byId.has(id));
  const seen = new Set();
  const duplicated = placedIds.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));

  // Only a complete presentation owes coverage. A partial one is a deliberate subset, and
  // demanding everything of it would report intent as failure.
  const missing =
    pres.scope === 'complete'
      ? [...byId.keys()].filter((id) => !seen.has(id) && !excludedIds.has(id))
      : [];

  return {
    presentation: pres.title,
    source: pres.source,
    scope: pres.scope,
    placed: seen.size,
    total: byId.size,
    missing,
    dangling: [...new Set(dangling)],
    duplicated: [...new Set(duplicated)],
    problems: pres.problems,
    ok: !missing.length && !dangling.length && !pres.problems.length,
  };
}

/**
 * Where a new scenario most likely belongs, judged by where its siblings already sit.
 *
 * A recommendation rather than a placement: the tool can see that four scenarios from this
 * document all live under one section, which is strong evidence and not a decision. Whoever
 * wrote the scenario knows whether it belongs beside them or somewhere new.
 */
export function suggestPlacement(scenario, presentations, scenarios) {
  const byId = new Map(scenarios.filter((s) => s.id).map((s) => [s.id, s]));
  const siblings = scenarios.filter(
    (s) => s.id && s.id !== scenario.id && s.source === scenario.source
  );
  const suggestions = [];

  for (const pres of presentations) {
    if (pres.placements.some((p) => p.id === scenario.id)) continue;

    // Weight a section by how many of this scenario's siblings already sit in it, and prefer
    // the same feature over merely the same document - a document can hold several features.
    const score = new Map();
    for (const p of pres.placements) {
      const sib = siblings.find((s) => s.id === p.id);
      if (!sib) continue;
      const key = p.path.join(' > ');
      const weight = sib.feature && sib.feature === scenario.feature ? 2 : 1;
      score.set(key, (score.get(key) ?? 0) + weight);
    }

    const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
    suggestions.push({
      presentation: pres.title,
      source: pres.source,
      scope: pres.scope,
      section: best ? best[0] : null,
      // Named so a reader can weigh the recommendation rather than take it: "four of its
      // siblings are here" is a different claim from "nothing like it is here yet".
      basis: best ? `${best[1]} sibling placement(s) in this section` : 'no siblings placed yet',
      after: best
        ? [...pres.placements]
            .reverse()
            .find((p) => p.path.join(' > ') === best[0] && byId.has(p.id))?.id ?? null
        : null,
    });
  }
  return suggestions;
}
