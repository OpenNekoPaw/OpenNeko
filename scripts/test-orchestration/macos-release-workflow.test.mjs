import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

describe('macOS release workflow', () => {
  it('publishes only a verified Apple Silicon DMG preview after source gates', async () => {
    const workflow = parse(await readFile('.github/workflows/release.yml', 'utf8'));
    assert.equal(workflow.name, 'Release macOS Preview');
    assert.deepEqual(workflow.on?.push?.tags, ['v*']);
    assert.equal(workflow.permissions?.contents, 'read');

    const sourceGate = workflow.jobs?.['source-gate'];
    assert.equal(sourceGate?.['runs-on'], 'ubuntu-latest');
    assert.equal(sourceGate?.steps?.[0]?.with?.['persist-credentials'], false);
    const sourceGateText = JSON.stringify(sourceGate);
    for (const required of [
      'assert-macos-release-metadata.mjs',
      'git merge-base --is-ancestor',
      'pnpm check:static-build',
      'pnpm check:test',
      'pnpm check:repository-quality',
    ]) {
      assert.match(sourceGateText, new RegExp(escapeRegExp(required), 'u'));
    }
    assert.doesNotMatch(sourceGateText, /package:desktop|make:desktop|electron-forge/u);

    const release = workflow.jobs?.['macos-release'];
    assert.equal(release?.['runs-on'], 'macos-15');
    assert.deepEqual(release?.needs, ['source-gate']);
    assert.equal(release?.permissions?.contents, 'write');
    assert.equal(release?.env?.RELEASE_TAG, '${{ github.ref_name }}');
    assert.equal(release?.env?.GH_TOKEN, undefined);
    assert.equal(release?.steps?.[0]?.with?.['persist-credentials'], false);
    const source = JSON.stringify(release);
    for (const required of [
      'pnpm --dir scripts/dsh-development-runtime fetch --frozen-lockfile',
      'assert-macos-release-metadata.mjs',
      'git merge-base --is-ancestor',
      'project-macos-release-version.mjs',
      'pnpm typecheck:desktop',
      'pnpm make:desktop',
      'codesign --verify --deep --strict',
      'Signature=adhoc',
      'hdiutil verify',
      'prepare-macos-release-artifacts.mjs',
      'gh release create',
      '--verify-tag',
      '--prerelease',
      '--latest=false',
      'not Developer ID signed or notarized',
      'Open Anyway',
    ]) {
      assert.match(source, new RegExp(escapeRegExp(required), 'u'));
    }
    assert.doesNotMatch(
      source,
      /MACOS_CERTIFICATE|MACOS_SIGNING_IDENTITY|MACOS_KEYCHAIN_PATH|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|security import|security create-keychain|stapler|spctl/u,
    );
    assert.doesNotMatch(source, /electron-forge|scripts\/dsh-q0/u);
    const createRelease = release.steps?.find(
      (candidate) => candidate.name === 'Create GitHub release',
    );
    assert.equal(createRelease?.env?.GH_TOKEN, '${{ github.token }}');
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
