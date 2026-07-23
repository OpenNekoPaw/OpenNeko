import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { projectReleaseManifestVersions } from '../release-version-contract.mjs';

describe('GitHub tag release version projection', () => {
  it('projects an older source version while preserving every other manifest field', () => {
    const manifests = new Map([
      [
        'apps/neko-vscode',
        {
          name: 'neko-suite',
          version: '0.0.1',
          private: true,
          contributes: { commands: [{ command: 'neko.test' }] },
        },
      ],
      [
        'packages/neko-engine',
        {
          name: 'neko-engine',
          version: '0.0.1',
          engines: { vscode: '^1.128.0' },
        },
      ],
    ]);
    const writes = new Map();

    assert.deepEqual(
      projectReleaseManifestVersions({
        tag: 'v0.1.0',
        packagePaths: [...manifests.keys()],
        readManifest: (path) => manifests.get(path),
        writeManifest: (path, manifest) => writes.set(path, manifest),
      }),
      {
        manifestVersion: '0.1.0',
        packageCount: 2,
        prerelease: false,
        sourceVersion: '0.0.1',
      },
    );
    assert.deepEqual(writes.get('apps/neko-vscode'), {
      ...manifests.get('apps/neko-vscode'),
      version: '0.1.0',
    });
    assert.deepEqual(writes.get('packages/neko-engine'), {
      ...manifests.get('packages/neko-engine'),
      version: '0.1.0',
    });
  });

  it('uses the numeric base of a prerelease tag', () => {
    const writes = [];
    const result = projectReleaseManifestVersions({
      tag: 'v2.3.4-rc.1',
      packagePaths: ['apps/neko-vscode'],
      readManifest: () => ({ name: 'neko-suite', version: '0.0.1' }),
      writeManifest: (_path, manifest) => writes.push(manifest),
    });

    assert.equal(result.manifestVersion, '2.3.4');
    assert.equal(result.prerelease, true);
    assert.deepEqual(writes, [{ name: 'neko-suite', version: '2.3.4' }]);
  });

  it('rejects an invalid manifest before writing any projection', () => {
    const manifests = new Map([
      ['apps/neko-vscode', { name: 'neko-suite', version: '0.0.1' }],
      ['packages/neko-engine', { name: 'neko-engine' }],
    ]);
    const writes = [];

    assert.throws(
      () =>
        projectReleaseManifestVersions({
          tag: 'v0.1.0',
          packagePaths: [...manifests.keys()],
          readManifest: (path) => manifests.get(path),
          writeManifest: (path) => writes.push(path),
        }),
      /packages\/neko-engine\/package\.json declares an invalid numeric version/u,
    );
    assert.deepEqual(writes, []);
  });
});
