import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'criteria-review.js');

// What this guards: a regression that SHIPPED. A guard was added rejecting unrecognised
// commands, and it did not know about `serve` - the command the tool uses to spawn its own
// background server. `start`, `here` and `restart` all died in a published release, and
// every unit test stayed green because none of them ran the binary.
//
// So this test runs the real binary, in a throwaway HOME so it cannot touch the developer's
// registered projects or pidfile, on a port nothing else uses.

const PORT = 4399;

async function cli(args, home) {
  return run(process.execPath, [BIN, ...args], {
    env: { ...process.env, HOME: home },
    timeout: 30_000,
  });
}

test('the background server starts, reports itself, and stops', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'criteria-home-'));
  t.after(async () => {
    await cli(['stop', '--port', String(PORT)], home).catch(() => {});
    await rm(home, { recursive: true, force: true });
  });

  const started = await cli(['start', '--port', String(PORT), '--no-open'], home);
  // Catches the exact shipped bug: `start` spawns `serve`, and a guard that does not know
  // that command leaves this reporting "did not become ready".
  assert.match(started.stdout, /started on http:\/\/127\.0\.0\.1:4399/);

  const status = await cli(['status', '--port', String(PORT)], home);
  assert.match(status.stdout, /running on http:\/\/127\.0\.0\.1:4399/);

  const stopped = await cli(['stop', '--port', String(PORT)], home);
  assert.match(stopped.stdout, /stopped/);
});

test('an unknown command fails rather than opening the UI', async () => {
  const home = await mkdtemp(join(tmpdir(), 'criteria-home-'));

  // Catches the other half: before this guard existed, a typo started a web server, which
  // in a pipeline is a hang rather than a failure.
  await assert.rejects(
    () => cli(['definitely-not-a-command'], home),
    (err) => {
      assert.match(err.stderr, /unknown command "definitely-not-a-command"/);
      assert.equal(err.code, 1);
      return true;
    }
  );
  await rm(home, { recursive: true, force: true });
});

test('--version prints package and standard without starting anything', async () => {
  const home = await mkdtemp(join(tmpdir(), 'criteria-home-'));

  // Catches the original defect: --version fell through to starting the review server and
  // died on EADDRINUSE, leaving a pinned gate with no way to report what it ran.
  const { stdout } = await cli(['--version'], home);
  assert.match(stdout, /^criteria-review \d+\.\d+\.\d+ \(standard \d+\.\d+\.\d+\)/);
  await rm(home, { recursive: true, force: true });
});
