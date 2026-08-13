import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSettings } from '../src/config.js';

// What these guard: the layering is what keeps a pipeline's behaviour reviewable. CI sets
// nothing and runs on what is committed, so anything a developer's own file can change is
// a way for one machine to behave differently from the build - and the dangerous version
// of that is a machine that passes while CI fails.

async function project(files) {
  const dir = await mkdtemp(join(tmpdir(), 'criteria-config-'));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), JSON.stringify(body), 'utf8');
  }
  return dir;
}

test('a project with no settings still resolves, with everything absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criteria-config-'));
  const s = await loadSettings(dir);

  // Catches: callers having to ask whether a project was configured at all before they
  // can read a value.
  assert.equal(s.emit.out, null);
  assert.equal(s.standard.path, null);
  assert.equal(s.standard.showReference, true);
  assert.equal(s.sources.project, false);
  await rm(dir, { recursive: true, force: true });
});

test('the developer file layers over the project file', async () => {
  const dir = await project({
    'criteria.json': { videoDir: 'qa/videos', emit: { out: 'tests/scenarios.ts' } },
    'criteria.local.json': { videoDir: '/tmp/my-videos', since: 'main', limit: 5 },
  });
  const s = await loadSettings(dir);

  assert.equal(s.videoDir, '/tmp/my-videos');
  assert.equal(s.since, 'main');
  assert.equal(s.limit, 5);
  // The committed value still governs what everyone shares.
  assert.equal(s.emit.out, 'tests/scenarios.ts');
  await rm(dir, { recursive: true, force: true });
});

test('a developer cannot redirect the emitted artefact', async () => {
  const dir = await project({ 'criteria.local.json': { emit: { out: 'somewhere/else.ts' } } });

  // Catches: the failure this layering exists to prevent. The artefact is committed and
  // `--check` compares that exact path, so a local override means one machine checks a
  // file nobody else has - and passes while the build fails.
  await assert.rejects(
    () => loadSettings(dir),
    (err) => {
      assert.match(err.message, /criteria\.local\.json: "emit" is not settable here/);
      assert.match(err.message, /--check compares that path/);
      return true;
    }
  );
  await rm(dir, { recursive: true, force: true });
});

test('a developer cannot point at a different standard', async () => {
  const dir = await project({ 'criteria.local.json': { standard: { path: 'my-rules' } } });

  // Catches: two people on one project reading different rules, which is a fork rather
  // than a preference and would make a review argument unresolvable.
  await assert.rejects(() => loadSettings(dir), /is a fork, not a preference/);
  await rm(dir, { recursive: true, force: true });
});

test('an unknown key is refused by name rather than ignored', async () => {
  const dir = await project({ 'criteria.json': { videoDirectory: 'qa/videos' } });

  // Catches: a silent no-op. A misspelled setting that is ignored leaves the author
  // believing it took effect, which is worse than being told it is wrong.
  await assert.rejects(
    () => loadSettings(dir),
    (err) => {
      assert.match(err.message, /"videoDirectory" is not settable here/);
      assert.match(err.message, /Allowed: emit, extraDocs, publish, standard, terms, videoDir/);
      return true;
    }
  );
  await rm(dir, { recursive: true, force: true });
});

test('malformed JSON names the file it is in', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criteria-config-'));
  await writeFile(join(dir, 'criteria.json'), '{ not json', 'utf8');

  // Catches: a parse error with no filename, which on a repo with two config files is
  // half a diagnosis.
  await assert.rejects(() => loadSettings(dir), /criteria\.json:/);
  await rm(dir, { recursive: true, force: true });
});

test('showReference is only false when it is set false', async () => {
  const shown = await project({ 'criteria.json': { standard: { path: 'docs/qa' } } });
  const hidden = await project({
    'criteria.json': { standard: { path: 'docs/qa', showReference: false } },
  });

  // Catches: a fork that hides its original by default. Keeping the shipped standard
  // visible is what lets a team notice divergence when the package is upgraded.
  assert.equal((await loadSettings(shown)).standard.showReference, true);
  assert.equal((await loadSettings(hidden)).standard.showReference, false);
  await rm(shown, { recursive: true, force: true });
  await rm(hidden, { recursive: true, force: true });
});
