// The scenarios a task covers.
//
// THE PLAN HOLDS IDS. NOTHING ELSE.
//
// Not the title, not the status, not a todo/doing/done of its own. Every one of those is
// already written in the acceptance document, and a copy here would be a second thing
// claiming to know: the two disagree within a day, and the wrong one is the one somebody
// reads. So the plan tracks the numbers and everything else is read live.
//
// The consequence is the good part. There is no "mark it done" - a scenario is done when
// its STATUS moved and a journey cites it, which is a fact about the document rather than
// a tick somebody entered. Self-reported progress is exactly the kind of evidence this
// whole system refuses everywhere else.
//
//   the work item      SCOPE     - what this task covers, declared before the work
//   the plan file      SELECTION - which ids, nothing more
//   the criteria docs  TRUTH     - status, title, intent, notes
//
// Keyed by branch, so switching branches loads the right plan and parallel work does not
// contend over one file.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { branchName } from './media.js';

const DIR = '.criteria';

function slug(branch) {
  // The same string as the branch with separators flattened, so the file and the branch can
  // be read off each other by eye.
  return (branch || 'detached').replace(/[^\w.-]+/g, '-');
}

export async function planPath(root) {
  return join(root, DIR, `plan-${slug(await branchName(root))}.json`);
}

/**
 * Several tasks at once, because that is how work actually arrives.
 *
 * A plan is a LIST of tasks, each with its own ids and its own provenance. Still only
 * numbers and where they came from - no titles, no statuses, no working state, exactly as
 * before. Grouping does not make the plan know anything; it makes it able to say WHICH task
 * an id was declared under, which is the thing a person needs when two are in flight.
 *
 * A plan written before this read as a single task. It still loads: a flat `{task, source,
 * ids}` normalises into one entry, so nothing has to be migrated and an old file cannot
 * silently lose its contents.
 */
function normalise(raw) {
  if (Array.isArray(raw?.tasks)) {
    return raw.tasks.map((t) => ({
      task: t.task ?? null,
      source: t.source ?? null,
      ids: [...new Set(t.ids ?? [])],
    }));
  }
  if (raw?.ids?.length || raw?.task) {
    return [{ task: raw.task ?? null, source: raw.source ?? null, ids: [...new Set(raw.ids ?? [])] }];
  }
  return [];
}

export async function loadPlan(root) {
  const file = await planPath(root);
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    const tasks = normalise(raw);
    return { tasks, ids: tasks.flatMap((t) => t.ids), file, found: true };
  } catch (err) {
    if (err.code === 'ENOENT') return { tasks: [], ids: [], file, found: false };
    throw new Error(`${file}: ${err.message}`);
  }
}

export async function savePlan(root, tasks) {
  const file = await planPath(root);
  await mkdir(join(root, DIR), { recursive: true });
  // Three fields per task and nothing else. A field added here is a field that can
  // contradict a document.
  const body = {
    tasks: tasks.map((t) => ({
      task: t.task ?? null,
      source: t.source ?? null,
      ids: [...new Set(t.ids)],
    })),
  };
  await writeFile(file, JSON.stringify(body, null, 2) + '\n', 'utf8');
  return file;
}

/**
 * Which tasks a name selects.
 *
 * Matches loosely on purpose - a person typing `--task till` should not have to reproduce
 * "Till hardening" exactly - but reports an ambiguous match rather than picking, because
 * working the wrong task is worse than being asked again.
 */
export function selectTasks(tasks, names = []) {
  if (!names.length) return { selected: tasks, unmatched: [], ambiguous: [] };
  const selected = [];
  const unmatched = [];
  const ambiguous = [];
  for (const name of names) {
    const needle = String(name).toLowerCase();
    const hits = tasks.filter((t) => (t.task ?? '').toLowerCase().includes(needle));
    if (!hits.length) unmatched.push(name);
    else if (hits.length > 1) ambiguous.push({ name, matched: hits.map((h) => h.task) });
    else if (!selected.includes(hits[0])) selected.push(hits[0]);
  }
  return { selected, unmatched, ambiguous };
}

export async function clearPlan(root) {
  await rm(await planPath(root), { force: true });
}

/**
 * Match what a person or a work item supplied against the scenarios that exist.
 *
 * Classifies rather than drops. An item resolving to nothing is reported, because "the plan
 * is done" and "the task is done" have to mean the same thing, and they stop meaning it the
 * moment an item disappears quietly.
 *
 * Accepts a bare id, an @-prefixed tag, or a line of prose containing one: a work item holds
 * sentences, not a tidy list.
 */
export function resolveItems(inputs, scenarios) {
  const byId = new Map(scenarios.filter((s) => s.id).map((s) => [s.id.toLowerCase(), s]));
  const idPattern = /@?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+-\d{3})/g;

  const ids = [];
  const unresolved = [];
  const seen = new Set();

  for (const raw of inputs) {
    const text = String(raw).trim();
    if (!text) continue;

    const found = [...text.matchAll(idPattern)].map((m) => m[1]);
    if (!found.length) {
      // No id at all. Not a matching failure: an item that needs criteria written before it
      // can be planned, or work that is not criteria-shaped.
      unresolved.push({ text, reason: 'no scenario id found' });
      continue;
    }

    for (const id of found) {
      const hit = byId.get(id.toLowerCase());
      if (!hit) {
        unresolved.push({ text: id, reason: 'no such scenario in the registered projects' });
        continue;
      }
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      ids.push(hit.id);
    }
  }

  return { ids, unresolved };
}

/**
 * Read the plan's ids against the documents as they are NOW.
 *
 * Everything a caller needs comes from the scan, never from the plan file: title, status,
 * flags, where it lives. The plan contributed the list and nothing more.
 *
 * Orphans are reported rather than skipped. A plan referencing a scenario since renamed or
 * deleted is stale, and that failure is silent by nature - a missing item simply does not
 * appear anywhere.
 */
export function readPlan(plan, scenarios, tasks = null) {
  const byId = new Map(scenarios.filter((s) => s.id).map((s) => [s.id, s]));
  // Tolerates the flat shape here as well as at load, so the compatibility claim holds for
  // any caller rather than only for a file read off disk.
  const groups = tasks ?? (plan.tasks ? plan.tasks : normalise(plan));
  const live = [];
  const orphaned = [];
  const seen = new Set();
  for (const group of groups) {
    for (const id of group.ids) {
      const hit = byId.get(id);
      if (!hit) {
        orphaned.push({ id, task: group.task });
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      // The task an id was declared under travels with it, because with two in flight the
      // useful question is not "is this planned" but "which of these am I looking at".
      live.push({ ...hit, planTask: group.task, planSource: group.source });
    }
  }
  return { live, orphaned };
}

/**
 * Is the task finished?
 *
 * Answered entirely from the documents. The point of the check is the gap between what was
 * declared and what actually happened, and a plan can only ever report what someone told it.
 */
export function completeness(live) {
  const settled = (s) => s.status === 'accepted' || s.status === 'verified';
  return {
    total: live.length,
    settled: live.filter(settled).length,
    outstanding: live.filter((s) => !settled(s)),
  };
}
