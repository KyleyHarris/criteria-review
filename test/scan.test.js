import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPosixPath } from '../src/scan.js';
import { buildModel, renderTypeScript } from '../src/emit.js';

// What these guard: a scenario's `source` is not an internal detail. It is written
// into the generated artefact that consumers commit, and `generate --check` compares
// that artefact byte for byte. A path carrying the host's own separator therefore
// makes two platforms emit different files from identical inputs, and each fails the
// other's gate with no defect to find - the worst shape of failure, because the gate
// is reporting drift that does not exist and the honest response is to stop trusting it.
//
// These assert on a literal backslash rather than on the local separator, deliberately.
// A test written against `sep` would pass on a POSIX machine whether or not the
// normalisation exists, which is precisely a test that cannot fail.

test('a Windows-shaped path is normalised to forward slashes', () => {
  assert.equal(
    toPosixPath('documentation\\ui-qa\\onboarding\\onboarding-acceptance.md'),
    'documentation/ui-qa/onboarding/onboarding-acceptance.md'
  );
});

test('a POSIX path is returned unchanged', () => {
  assert.equal(
    toPosixPath('qa/acceptance/till-lock/till-lock-acceptance.md'),
    'qa/acceptance/till-lock/till-lock-acceptance.md'
  );
});

test('a mixed-separator path is normalised, not half-normalised', () => {
  // Reachable on Windows, which accepts both, so a path can arrive already mixed.
  assert.equal(toPosixPath('documentation\\ui-qa/onboarding\\x.md'), 'documentation/ui-qa/onboarding/x.md');
});

test('the emitted artefact is identical whichever platform produced the paths', () => {
  const scenario = (source) => ({
    id: 'ONB-ADMIN-001',
    title: 'The first administrator must set their own password',
    steps: ['Given a freshly installed system', 'Then they must set a new password'],
    status: 'derived',
    persona: null,
    verifiedOn: null,
    commit: null,
    intent: null,
    feature: 'Onboarding',
    source,
  });

  const fromWindows = renderTypeScript(
    buildModel([scenario(toPosixPath('documentation\\ui-qa\\onboarding\\x.md'))])
  );
  const fromPosix = renderTypeScript(
    buildModel([scenario(toPosixPath('documentation/ui-qa/onboarding/x.md'))])
  );

  // The whole point: same repository, same documents, same bytes. Without the
  // normalisation these differ and `--check` fails for whoever did not generate it.
  assert.equal(fromWindows, fromPosix);
  assert.match(fromWindows, /source: 'documentation\/ui-qa\/onboarding\/x\.md'/);
  assert.ok(!fromWindows.includes('\\\\'), 'no escaped backslash should survive into the artefact');
});
