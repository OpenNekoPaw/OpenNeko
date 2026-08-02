import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

describe('macOS release workflow', () => {
  it('publishes only a verified Apple Silicon release after source gates', async () => {
    const workflow = parse(await readFile('.github/workflows/release.yml', 'utf8'));
    assert.equal(workflow.name, 'Release macOS');
    assert.deepEqual(workflow.on?.push?.tags, ['v*']);
    assert.equal(workflow.permissions?.contents, 'read');

    const sourceGate = workflow.jobs?.['source-gate'];
    assert.equal(sourceGate?.['runs-on'], 'ubuntu-latest');
    const sourceGateText = JSON.stringify(sourceGate);
    assert.match(sourceGateText, /pnpm check:static-build/u);
    assert.match(sourceGateText, /pnpm check:test/u);
    assert.match(sourceGateText, /pnpm check:repository-quality/u);
    assert.doesNotMatch(sourceGateText, /package:desktop|make:desktop|electron-forge/u);

    const release = workflow.jobs?.['macos-release'];
    assert.equal(release?.['runs-on'], 'macos-15');
    assert.deepEqual(release?.needs, ['source-gate']);
    assert.equal(release?.permissions?.contents, 'write');
    assert.equal(release?.env?.MACOS_KEYCHAIN_PATH, undefined);
    const signingPathStep = release.steps?.find(
      (candidate) => candidate.name === 'Configure ephemeral signing paths',
    );
    assert.equal(
      signingPathStep?.run,
      'echo "MACOS_KEYCHAIN_PATH=$RUNNER_TEMP/openneko-release.keychain-db" >> "$GITHUB_ENV"',
    );
    const source = JSON.stringify(release);
    for (const required of [
      'assert-macos-release-metadata.mjs',
      'git merge-base --is-ancestor',
      'OPENNEKO_MACOS_RELEASE',
      'MACOS_CERTIFICATE_P12_BASE64',
      'pnpm make:desktop',
      'codesign --verify --deep --strict',
      'Authority=$MACOS_SIGNING_IDENTITY',
      'TeamIdentifier=$APPLE_TEAM_ID',
      'xcrun stapler validate',
      'spctl --assess',
      'prepare-macos-release-artifacts.mjs',
      'gh release create',
    ]) {
      assert.match(source, new RegExp(escapeRegExp(required), 'u'));
    }
    const trustStep = release.steps?.find(
      (candidate) => candidate.name === 'Verify macOS trust and ZIP closure',
    );
    assert.ok(trustStep?.run?.includes("grep -Eq 'flags=.*\\(runtime\\)'"));
    assert.doesNotMatch(source, /runner\.temp/u);
    assert.doesNotMatch(source, /windows|linux|win32-x64|linux-x64/u);
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
