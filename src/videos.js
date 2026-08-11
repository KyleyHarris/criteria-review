// Mapping scenarios to recorded journeys.
//
// THE CONVENTION: a recording is named for the scenario it proves, in a fixed
// directory, and a new run replaces the old file.
//
//     <project>/<videoDir>/<SCENARIO-ID>.webm
//     <project>/qa/videos/LOCK-UNLOCK-001.webm
//
// The producing side owns this. Playwright's own output is date- and hash-shaped
// (`test-results/<sanitised-title>/video.webm`), which is fine for a CI artefact
// and wrong for something a person opens repeatedly: the path changes every run,
// old recordings pile up, and "the video for this scenario" stops being a single
// answerable question. A reel step should move its recording to the fixed name on
// completion, so lookup here is a direct file check rather than a search.
//
// The directory sits INSIDE the project, which is what ties a recording to its
// workspace: a worktree filming its own branch writes into its own tree, and two
// worktrees cannot overwrite each other's footage. Recordings are large binaries
// and belong in .gitignore, not in history.
//
// A normalised scan remains as a FALLBACK so the tool is useful against suites
// that have not adopted the fixed layout yet. It is second, and reported as such,
// because fuzzy matching can be wrong and a reviewer must be able to tell which
// mechanism found the file they are about to trust.

import { readdir, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute, basename } from 'node:path';
import { masterVideoDir } from './media.js';

const VIDEO_EXT = ['.webm', '.mp4', '.mov'];

/** Default fixed location, relative to the project root. */
export const DEFAULT_VIDEO_DIR = 'qa/videos';

/** Where Playwright and friends dump run output, used only by the fallback scan. */
const FALLBACK_DIRS = ['test-results', 'playwright-report', 'reel'];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'obj']);

const normalise = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const isVideo = (name) => VIDEO_EXT.some((e) => name.toLowerCase().endsWith(e));

function resolveDir(project, dir) {
  return isAbsolute(dir) ? dir : join(project.path, dir);
}

async function* walk(dir, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full, depth + 1);
    } else if (e.isFile() && isVideo(e.name)) {
      yield full;
    }
  }
}

async function findFallbackRoots(projectRoot) {
  const found = [];
  async function scan(dir, depth) {
    if (depth > 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      if (FALLBACK_DIRS.includes(e.name)) found.push(full);
      else await scan(full, depth + 1);
    }
  }
  await scan(projectRoot, 0);
  return found;
}

/**
 * Build the lookup for one project. The fixed directory is not scanned: it is
 * checked per-ID on demand, so adding a recording needs no reindex.
 */
export async function indexVideos(project, fallbackRoot) {
  const videoDir = resolveDir(project, project.videoDir ?? DEFAULT_VIDEO_DIR);
  // The shared library. A worktree's own recordings win over it, because the
  // point of filming in a worktree is to see what THIS branch does; master is the
  // accepted baseline for everything the branch did not touch.
  const masterDir = await masterVideoDir(project, fallbackRoot);

  const fallback = [];
  for (const root of await findFallbackRoots(project.path)) {
    for await (const f of walk(root)) {
      let mtime = 0;
      try {
        mtime = (await stat(f)).mtimeMs;
      } catch {
        // vanished mid-scan; not worth failing the index over
      }
      fallback.push({ file: f, key: normalise(f), mtime });
    }
  }
  fallback.sort((a, b) => b.mtime - a.mtime);

  return { videoDir, masterDir, fallback };
}

/**
 * Resolve the recording for a scenario.
 *
 * Returns `{ file, how }` where `how` is 'named' for the fixed convention or
 * 'matched' for the fallback scan, or null when there is none. The caller shows
 * that distinction: a fuzzy match is a guess, and a reviewer about to accept a
 * scenario on the strength of a video should know which they are watching.
 */
export async function videoFor(index, id) {
  if (!id) return null;

  for (const [dir, how] of [
    [index.videoDir, 'local'],
    [index.masterDir, 'master'],
  ]) {
    if (!dir) continue;
    const hit = await findInDir(dir, id);
    if (hit) return { file: hit, how };
  }

  const needle = normalise(id);
  if (needle.length < 4) return null; // too short to match without false positives
  const hit = index.fallback.find((f) => f.key.includes(needle));
  return hit ? { file: hit.file, how: 'matched' } : null;
}

/**
 * Exact `<ID>.<ext>` wins; `<ID>-<slug>.<ext>` is accepted too.
 *
 * The bare form is the canonical one because it makes replacement deterministic:
 * a re-run overwrites rather than accumulating a second file when a title is
 * reworded. The suffixed form is accepted because a shared library gets browsed
 * by people, and a folder of bare IDs is unreadable to anyone not holding the
 * acceptance document open beside it.
 */
async function findInDir(dir, id) {
  for (const ext of VIDEO_EXT) {
    const candidate = join(dir, `${id}${ext}`);
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // try the next extension
    }
  }
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const prefix = `${id.toLowerCase()}-`;
  const match = entries
    .filter((e) => e.isFile() && isVideo(e.name) && e.name.toLowerCase().startsWith(prefix))
    .map((e) => e.name)
    .sort()[0];
  return match ? join(dir, match) : null;
}

/** Where a recording for this scenario SHOULD be written. Shown when none exists. */
export function expectedPath(index, id) {
  return join(index.videoDir, `${id}${VIDEO_EXT[0]}`);
}

export { basename };
