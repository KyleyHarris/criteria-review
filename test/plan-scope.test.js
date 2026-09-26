import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'criteria-review.js');

// What this guards: a plan command run from a directory that is not a registered project
// used to fall back to the registered projects and write into the FIRST of them. The plan
// belongs to one repository, so a command that cannot say which one must refuse rather than
// guess, and above all must not change somebody else's files. Found 2026-09-26 when a
// scratch-directory test wrote to and then cleared a plan in an unrelated registered project.
//
// Runs the real binary in a throwaway HOME, so it cannot touch the developer's registered
// projects.

async function setup(t) {
  const base = await mkdtemp(join(tmpdir(), 'criteria-scope-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const home = join(base, 'home');
  const registered = join(base, 'registered');
  const elsewhere = join(base, 'elsewhere');
  await mkdir(join(home, '.config', 'criteria-review'), { recursive: true });
  await mkdir(join(registered, 'acceptance'), { recursive: true });
  await mkdir(elsewhere, { recursive: true });
  await writeFile(
    join(registered, 'acceptance', 'a-acceptance.md'),
    '# A\n\n## Feature: x\n\n```gherkin\n@LOCK-021 @status:proposed\nScenario: one\n  Given a\n```\n'
  );
  await writeFile(
    join(home, '.config', 'criteria-review', 'config.json'),
    JSON.stringify({ projects: [{ name: 'registered', path: registered }] })
  );
  const cli = (args, cwd) =>
    run(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, HOME: home }, timeout: 30_000 });
  return { registered, elsewhere, cli };
}

const planFiles = async (root) => readdir(join(root, '.criteria')).catch(() => []);

test('a plan write from an unregistered directory is refused and touches no project', async (t) => {
  const { registered, elsewhere, cli } = await setup(t);

  await assert.rejects(cli(['plan', 'add', 'LOCK-021', '--task', 't'], elsewhere), (err) => {
    // Catches: the silent fallback. The refusal must name why, so the fix is obvious.
    assert.match(err.stderr, /not inside a registered project/);
    return true;
  });
  // Catches the damage itself: a plan file appearing in a project nobody named.
  assert.deepEqual(await planFiles(registered), []);

  await assert.rejects(cli(['plan', 'clear'], elsewhere));
  assert.deepEqual(await planFiles(elsewhere), []);
});

test('the same plan write inside the registered project works', async (t) => {
  const { registered, cli } = await setup(t);

  // Catches: a refusal so broad it breaks the normal case.
  const { stdout } = await cli(['plan', 'add', 'LOCK-021', '--task', 't'], registered);
  assert.match(stdout, /added 1 scenario/);
  assert.equal((await planFiles(registered)).length, 1);
});

test('naming the project explicitly works from anywhere', async (t) => {
  const { registered, elsewhere, cli } = await setup(t);

  // Catches: removing the escape hatch. --project says which repository, so no guess is made.
  const { stdout } = await cli(['plan', 'add', 'LOCK-021', '--task', 't', '--project', `r=${registered}`], elsewhere);
  assert.match(stdout, /added 1 scenario/);
  assert.equal((await planFiles(registered)).length, 1);
});
