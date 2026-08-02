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
    const sourceGateText = JSON.stringify(sourceGate);
    assert.match(sourceGateText, /pnpm check:static-build/u);
    assert.match(sourceGateText, /pnpm check:test/u);
    assert.match(sourceGateText, /pnpm check:repository-quality/u);
    assert.doesNotMatch(sourceGateText, /package:desktop|make:desktop|electron-forge/u);

    const release = workflow.jobs?.['macos-release'];
    assert.equal(release?.['runs-on'], 'macos-15');
    assert.deepEqual(release?.needs, ['source-gate']);
    assert.equal(release?.permissions?.contents, 'write');
    assert.equal(release?.env?.RELEASE_TAG, '${{ github.ref_name }}');
    assert.equal(release?.env?.MACOS_KEYCHAIN_PATH, undefined);
    const projectionIndex = release.steps?.findIndex(
      (candidate) => candidate.name === 'Project tag version into release checkout',
    );
    const makeIndex = release.steps?.findIndex(
      (candidate) => candidate.name === 'Make ad-hoc macOS preview DMG',
    );
    assert.ok(projectionIndex >= 0 && makeIndex >= 0 && projectionIndex < makeIndex);
    const source = JSON.stringify(release);
    for (const required of [
      'assert-macos-release-metadata.mjs',
      'git merge-base --is-ancestor',
      'project-macos-release-version.mjs',
      'pnpm make:desktop',
      'codesign --verify --deep --strict',
      'Signature=adhoc',
      'hdiutil verify',
      'prepare-macos-release-artifacts.mjs',
      'gh release create',
      '--prerelease',
      'not Developer ID signed or notarized',
      'Open Anyway',
    ]) {
      assert.match(source, new RegExp(escapeRegExp(required), 'u'));
    }
    const trustStep = release.steps?.find(
      (candidate) => candidate.name === 'Verify ad-hoc app and DMG closure',
    );
    assert.match(trustStep?.run ?? '', /VERSION="\$\{RELEASE_TAG#v\}"/u);
    assert.match(
      trustStep?.run ?? '',
      /OpenNeko-\$\{VERSION\}-arm64\.dmg/u,
    );
    assert.match(trustStep?.run ?? '', /prepare-macos-release-artifacts\.mjs --tag/u);
    assert.doesNotMatch(
      source,
      /OPENNEKO_MACOS_RELEASE|MACOS_CERTIFICATE|MACOS_SIGNING_IDENTITY|MACOS_KEYCHAIN_PATH|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|security import|security create-keychain|stapler|spctl|unzip|ZIP_PATH|maker-zip/u,
    );
    assert.doesNotMatch(source, /package\.json['"]\)\.version/u);
    assert.doesNotMatch(source, /runner\.temp/u);
    assert.doesNotMatch(source, /windows|linux|win32-x64|linux-x64/u);
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
