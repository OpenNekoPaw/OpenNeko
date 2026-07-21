import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import {
  assertReleaseCommitOnMain,
  parseReleaseTag,
  resolveReleaseCommit,
  resolvePublishablePackagePaths,
  validateManifestVersions,
} from '../validate-release-source.mjs';

describe('release source validation', () => {
  it('projects stable and prerelease tags to the numeric VSIX manifest version', () => {
    assert.deepEqual(parseReleaseTag('v0.1.0'), {
      tag: 'v0.1.0',
      version: '0.1.0',
      manifestVersion: '0.1.0',
      prerelease: false,
    });
    assert.deepEqual(parseReleaseTag('v0.1.0-alpha.1'), {
      tag: 'v0.1.0-alpha.1',
      version: '0.1.0-alpha.1',
      manifestVersion: '0.1.0',
      prerelease: true,
    });
  });

  it('rejects malformed version tags', () => {
    for (const tag of ['0.1.0', 'v01.1.0', 'v0.1', 'v0.1.0-', 'v0.1.0-01', 'v0.1.0-alpha.01']) {
      assert.throws(() => parseReleaseTag(tag), new RegExp(`Invalid release tag: ${tag}`, 'u'));
    }
  });

  it('resolves the tag ref to its commit instead of trusting a tag object SHA', () => {
    assert.equal(
      resolveReleaseCommit({
        tag: 'v0.1.0',
        resolveRef: (tag) => (tag === 'v0.1.0' ? 'commit-sha\n' : ''),
      }),
      'commit-sha',
    );
    assert.throws(
      () => resolveReleaseCommit({ tag: 'v0.1.0', resolveRef: () => '' }),
      /Unable to resolve release tag v0\.1\.0 to a commit/u,
    );
  });

  it('resolves the extension pack and every canonical release package exactly once', () => {
    assert.deepEqual(
      resolvePublishablePackagePaths({
        extensionPack: 'apps/neko-vscode',
        packages: { buildRelease: ['neko-engine', 'neko-tools', 'neko-engine'] },
      }),
      ['apps/neko-vscode', 'packages/neko-engine', 'packages/neko-tools'],
    );
  });

  it('accepts matching manifest versions and identifies mismatches by path', () => {
    const packagePaths = ['apps/neko-vscode', 'packages/neko-engine'];
    const matching = new Map(packagePaths.map((path) => [path, { version: '0.1.0' }]));
    assert.deepEqual(
      validateManifestVersions({
        tag: 'v0.1.0-alpha.1',
        packagePaths,
        readManifest: (path) => matching.get(path),
      }),
      { manifestVersion: '0.1.0', packageCount: 2, prerelease: true },
    );

    const mismatched = new Map(matching);
    mismatched.set('packages/neko-engine', { version: '0.0.1' });
    assert.throws(
      () =>
        validateManifestVersions({
          tag: 'v0.1.0',
          packagePaths,
          readManifest: (path) => mismatched.get(path),
        }),
      /packages\/neko-engine\/package\.json declares 0\.0\.1; expected 0\.1\.0/u,
    );
  });

  it('rejects a release commit outside main history', () => {
    assert.deepEqual(assertReleaseCommitOnMain({ releaseSha: 'abc123', isAncestor: () => true }), {
      releaseSha: 'abc123',
      mainRef: 'origin/main',
    });
    assert.throws(
      () => assertReleaseCommitOnMain({ releaseSha: 'abc123', isAncestor: () => false }),
      /Release commit abc123 is not reachable from origin\/main/u,
    );
  });

  it('validates source before packaging and isolates publication permission', async () => {
    const workflow = parse(await readFile('.github/workflows/release.yml', 'utf8'));
    const validateRelease = workflow.jobs?.['validate-release'];
    const createRelease = workflow.jobs?.['create-release'];

    assert.deepEqual(workflow.permissions, { contents: 'read' });
    assert.ok(validateRelease, 'missing validate-release job');
    assert.match(
      validateRelease.steps.find((step) => step.name === 'Validate release source')?.run ?? '',
      /validate-release-source\.mjs/u,
    );
    assert.match(validateRelease.steps.map((step) => step.run ?? '').join('\n'), /origin\/main/u);
    assert.deepEqual(workflow.jobs?.['release-ts']?.needs, ['validate-release']);
    assert.deepEqual(workflow.jobs?.['release-engine']?.needs, ['validate-release']);
    assert.equal(createRelease?.environment, 'release');
    assert.deepEqual(createRelease?.permissions, { contents: 'write' });

    const releaseSource = JSON.stringify(createRelease);
    assert.match(releaseSource, /SHA256SUMS/u);
    assert.match(releaseSource, /release-artifacts\/\*\.vsix/u);
  });
});
