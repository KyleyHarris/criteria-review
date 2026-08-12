// Locating acceptance documents across projects.
//
// Deliberately convention-based rather than configured per repo: a project opts in
// by putting its criteria where the standard says they go (docs/standard/). Adding a
// per-repo config file would mean the tool silently covers nothing when someone
// forgets to write one, and silence is the failure mode this whole exercise exists to
// remove. Emitting is the one place a path IS declared per project, because there an
// absent declaration fails loudly at the moment it is asked for. See decisions D-001.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseDocument } from './parse.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The criteria documents this branch has touched since a base ref.
 *
 * ONE MECHANISM, TWO AUDIENCES. A developer asks "what am I working on" and passes
 * their trunk; a pipeline asks "what did this sprint add" and passes the last release
 * tag. Both are a diff against a base, so there is no second concept to learn and no
 * second thing to keep correct.
 *
 * Returns null rather than an empty set when the diff cannot be taken - not a git
 * checkout, unknown ref - so the caller can say so instead of silently reporting that
 * nothing changed, which would look exactly like a clean branch.
 */
export async function changedSince(root, base) {
  try {
    const { stdout } = await run('git', ['-C', root, 'diff', '--name-only', `${base}...HEAD`]);
    return new Set(
      stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map(toPosixPath)
        .filter(isCriteriaPath)
    );
  } catch {
    return null;
  }
}

/**
 * A repo-relative path with forward slashes, whatever platform produced it.
 *
 * `relative()` returns the host's own separator, and that string does not stay
 * inside this process: it becomes a scenario's `source`, which is written into the
 * generated artefact that consumers commit and that `generate --check` compares byte
 * for byte. Left native, a document scanned on Windows emits `documentation\ui-qa\x.md`
 * where the same repository on macOS emits `documentation/ui-qa/x.md`, so the two
 * platforms produce different artefacts from identical inputs and each fails the
 * other's gate with no defect to find.
 *
 * Splits on both separators rather than on `sep`, because Windows accepts forward
 * slashes too and a mixed path is therefore reachable on either platform.
 */
export function toPosixPath(path) {
  return path.split(/[\\/]/).join('/');
}

/**
 * Directory names that hold acceptance criteria.
 *
 * `acceptance` is the standard's directory. `ui-qa` is a recognised legacy alias: it
 * is one project's original name, adopted before the standard moved here, and dropping
 * it would make that project's entire criteria set invisible rather than surfacing a
 * migration. Retire it only by moving those documents, never by removing it here.
 */
const CRITERIA_DIRS = ['acceptance', 'ui-qa'];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'bin',
  'obj',
  'test-results',
  'playwright-report',
  '__azurite__',
  '__azurite_test__',
]);

async function* walk(dir, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory is not an error worth failing the scan over
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full, depth + 1);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      // README files in a criteria directory document the FORMAT; the example
      // scenarios they contain are not real criteria and would otherwise show up
      // in the queue forever as phantom work.
      if (e.name.toLowerCase() === 'readme.md') continue;
      yield full;
    }
  }
}

/** True when the path sits under a directory the convention recognises. */
function isCriteriaPath(path) {
  // Same splitter as toPosixPath, so a mixed-separator path cannot match here while
  // failing there, or the other way round.
  const parts = path.split(/[\\/]/);
  return parts.some((p) => CRITERIA_DIRS.includes(p));
}

/**
 * Scan one project root. Returns every scenario found, each tagged with the
 * project it came from so a cross-project queue can be ordered and filtered.
 */
export async function scanProject(root, name) {
  const scenarios = [];
  const files = [];
  for await (const file of walk(root)) {
    if (!isCriteriaPath(file)) continue;
    files.push(file);
    const text = await readFile(file, 'utf8');
    // Normalised, because this reaches the generated artefact and a committed file
    // must not differ by the platform that produced it. See toPosixPath.
    const rel = toPosixPath(relative(root, file));
    for (const s of parseDocument(text, rel)) {
      scenarios.push({ ...s, project: name, absolutePath: file });
    }
  }
  return { project: name, root, files: files.length, scenarios };
}

/** Scan several roots. Roots that do not exist are reported, not thrown. */
export async function scanAll(roots) {
  const results = [];
  const missing = [];
  for (const { path, name } of roots) {
    try {
      const s = await stat(path);
      if (!s.isDirectory()) {
        missing.push({ name, path, reason: 'not a directory' });
        continue;
      }
    } catch {
      missing.push({ name, path, reason: 'does not exist' });
      continue;
    }
    results.push(await scanProject(path, name));
  }
  return { results, missing };
}
