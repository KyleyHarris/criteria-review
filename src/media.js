// Where the master video library lives.
//
// Recordings are expensive to produce and stable once known-good, so they do not
// belong inside a worktree. A worktree films what its branch changed; the master
// library holds the accepted baseline, and the two are merged when work lands.
// Keeping the library outside every clone is also what lets it be synced and
// shared, which a .gitignored directory inside a repo can never be.
//
// The path must be derivable from the repository NAME, not from where the repo
// happens to sit, or a worktree in a different directory finds nothing:
//
//     <mediaRoot>/<repo>/videos/<SCENARIO-ID>.webm
//
// The root is configured once per machine rather than per project, because it is a
// property of the machine (which sync service, which mount) and not of any repo.
// It is read from a shared file so other tooling can honour the same setting
// without each one inventing its own key.

import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const run = promisify(execFile);

/** Shared across tools, deliberately: one machine-level answer to "where does media go". */
export const MEDIA_CONFIG = join(homedir(), '.config', 'dev-media.json');

/**
 * Resolution order, most specific first:
 *   1. DEV_MEDIA_ROOT      - override for a one-off run
 *   2. ~/.config/dev-media.json  - the shared machine setting
 *   3. mediaRoot in the criteria-review config - fallback if the shared file is absent
 */
export async function resolveMediaRoot(fallback) {
  if (process.env.DEV_MEDIA_ROOT) return process.env.DEV_MEDIA_ROOT;
  try {
    const cfg = JSON.parse(await readFile(MEDIA_CONFIG, 'utf8'));
    if (cfg.root) return cfg.root;
  } catch {
    // absent or unreadable is normal; fall through
  }
  return fallback ?? null;
}

/**
 * The repository name, which is the key into the master library.
 *
 * Taken from the origin remote rather than the directory name, because a worktree
 * is named for its branch and a clone can be renamed. The remote is the one thing
 * that stays the same across every checkout of the same repository, which is
 * exactly the property needed here.
 */
export async function repoName(projectPath, override) {
  if (override) return override;
  try {
    const { stdout } = await run('git', ['-C', projectPath, 'remote', 'get-url', 'origin']);
    const url = stdout.trim();
    if (url) return basename(url.replace(/\.git$/, ''));
  } catch {
    // not a repo, or no origin
  }
  try {
    // A worktree's common dir points at the main clone, whose parent is the repo.
    const { stdout } = await run('git', ['-C', projectPath, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
    const common = stdout.trim();
    if (common) return basename(join(common, '..'));
  } catch {
    // fall through
  }
  return basename(projectPath);
}

/**
 * The branch a tree is on.
 *
 * Shown beside every project because a directory name does not say what you are
 * looking at. A worktree and its main clone are two checkouts of one repository and
 * their directory names carry no information; the branch names say immediately which
 * is the work in progress and which is the baseline.
 */
export async function branchName(projectPath) {
  try {
    const { stdout } = await run('git', ['-C', projectPath, 'rev-parse', '--abbrev-ref', 'HEAD']);
    const b = stdout.trim();
    return b && b !== 'HEAD' ? b : null;
  } catch {
    return null;
  }
}

/** Master video directory for a project, or null when no root is configured. */
export async function masterVideoDir(project, fallbackRoot) {
  const root = await resolveMediaRoot(fallbackRoot);
  if (!root) return null;
  return join(root, await repoName(project.path, project.repo), 'videos');
}
