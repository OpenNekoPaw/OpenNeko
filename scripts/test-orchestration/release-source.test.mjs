import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { assertReleaseCommitOnMain, resolveReleaseCommit } from '../validate-release-source.mjs';
import {
  inspectPublishableManifests,
  parseReleaseTag,
  resolvePublishablePackagePaths,
} from '../release-version-contract.mjs';

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

  it('resolves the product application and every embedded release package exactly once', () => {
    assert.deepEqual(
      resolvePublishablePackagePaths({
        productApplication: 'apps/neko-vscode',
        packages: { buildRelease: ['neko-engine', 'neko-tools', 'neko-engine'] },
      }),
      ['apps/neko-vscode', 'packages/neko-engine', 'packages/neko-tools'],
    );
  });

  it('validates internally consistent source manifests without comparing them to the tag', () => {
    const packagePaths = ['apps/neko-vscode', 'packages/neko-engine'];
    const matching = new Map(packagePaths.map((path) => [path, { version: '0.0.1' }]));
    assert.deepEqual(
      inspectPublishableManifests({
        packagePaths,
        readManifest: (path) => matching.get(path),
      }),
      {
        entries: [
          { packagePath: 'apps/neko-vscode', manifest: { version: '0.0.1' } },
          { packagePath: 'packages/neko-engine', manifest: { version: '0.0.1' } },
        ],
        packageCount: 2,
        sourceVersion: '0.0.1',
      },
    );

    const mismatched = new Map(matching);
    mismatched.set('packages/neko-engine', { version: '0.0.2' });
    assert.throws(
      () =>
        inspectPublishableManifests({
          packagePaths,
          readManifest: (path) => mismatched.get(path),
        }),
      /Publishable source manifest versions are inconsistent/u,
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
    const releaseTests = workflow.jobs?.['release-tests'];
    const releaseOpenNeko = workflow.jobs?.['release-openneko'];
    const createRelease = workflow.jobs?.['create-release'];

    assert.deepEqual(workflow.permissions, { contents: 'read' });
    assert.ok(validateRelease, 'missing validate-release job');
    assert.match(
      validateRelease.steps.find((step) => step.name === 'Validate release source')?.run ?? '',
      /validate-release-source\.mjs/u,
    );
    assert.match(validateRelease.steps.map((step) => step.run ?? '').join('\n'), /origin\/main/u);
    assert.deepEqual(releaseTests?.needs, ['validate-release']);
    assert.deepEqual(releaseOpenNeko?.needs, ['validate-release', 'release-tests']);
    assertStepPrecedes(releaseTests, 'Project release manifest versions', 'pnpm install');
    assertStepPrecedes(releaseTests, 'Project release manifest versions', 'pnpm test');
    assertStepPrecedes(releaseOpenNeko, 'Project release manifest versions', 'Build host-napi');
    assertStepPrecedes(
      releaseOpenNeko,
      'Project release manifest versions',
      'Package Engine payload',
    );
    assertStepPrecedes(
      releaseOpenNeko,
      'Project release manifest versions',
      'Assemble OpenNeko platform VSIX',
    );
    assert.deepEqual(createRelease?.needs, ['release-openneko']);
    assert.equal(workflow.jobs?.['release-ts'], undefined);
    assert.equal(workflow.jobs?.['release-engine'], undefined);
    assert.equal(createRelease?.environment, 'release');
    assert.deepEqual(createRelease?.permissions, { contents: 'write' });

    const releaseSource = JSON.stringify(createRelease);
    assert.match(releaseSource, /SHA256SUMS/u);
    assert.match(releaseSource, /assert-openneko-release-artifacts\.mjs/u);
    const publicationFiles =
      createRelease.steps.find((step) => step.name === 'Create GitHub Release')?.with?.files ?? '';
    assert.match(publicationFiles, /OpenNeko-darwin-arm64-\*\.vsix/u);
    assert.match(publicationFiles, /OpenNeko-linux-x64-\*\.vsix/u);
    assert.doesNotMatch(publicationFiles, /release-artifacts\/\*\.vsix/u);
  });
});

function assertStepPrecedes(job, earlierName, laterNeedle) {
  const steps = job?.steps ?? [];
  const earlierIndex = steps.findIndex((step) => step.name === earlierName);
  const laterIndex = steps.findIndex(
    (step) => step.name === laterNeedle || step.run?.includes(laterNeedle),
  );
  assert.notEqual(earlierIndex, -1, `missing workflow step: ${earlierName}`);
  assert.notEqual(laterIndex, -1, `missing workflow step: ${laterNeedle}`);
  assert.ok(earlierIndex < laterIndex, `${earlierName} must precede ${laterNeedle}`);
}
