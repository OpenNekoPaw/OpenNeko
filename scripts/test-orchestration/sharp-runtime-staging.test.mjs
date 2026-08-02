import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { getSharpRuntimePackages, stageSharpRuntime } from '../stage-sharp-runtime.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Sharp runtime staging', () => {
  it('stages only the exact target packages, cleans stale output, and writes the manifest', async () => {
    const root = await createTemporaryRoot();
    const outputRoot = join(root, 'dist');
    const sourceRoot = join(root, 'sources');
    await mkdir(join(outputRoot, 'node_modules', '@img', 'sharp-win32-x64'), {
      recursive: true,
    });
    await writeFile(join(outputRoot, 'node_modules', '@img', 'sharp-win32-x64', 'stale.node'), '');

    for (const { packageName } of getSharpRuntimePackages('darwin-arm64')) {
      const packageRoot = join(sourceRoot, packageName.replaceAll('/', '__'));
      await mkdir(packageRoot, { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: packageName }));
    }

    const manifest = stageSharpRuntime({
      target: 'darwin-arm64',
      outputRoot,
      resolvePackageRoot: (packageName) => join(sourceRoot, packageName.replaceAll('/', '__')),
    });

    assert.deepEqual(manifest, {
      schemaVersion: 'openneko.embedded-runtime-closure.v1',
      target: 'darwin-arm64',
      modules: [
        {
          packageName: 'sharp',
          specifier: 'sharp',
        },
        {
          packageName: '@img/colour',
          specifier: '@img/colour',
        },
        {
          packageName: 'detect-libc',
          specifier: 'detect-libc',
        },
        {
          packageName: 'semver',
          specifier: 'semver',
        },
        {
          packageName: '@img/sharp-darwin-arm64',
          specifier: '@img/sharp-darwin-arm64/sharp.node',
        },
        {
          packageName: '@img/sharp-libvips-darwin-arm64',
          specifier: '@img/sharp-libvips-darwin-arm64/lib',
        },
      ],
    });
    await assert.rejects(
      readFile(join(outputRoot, 'node_modules', '@img', 'sharp-win32-x64', 'stale.node')),
      { code: 'ENOENT' },
    );
    for (const { packageName } of manifest.modules) {
      const stagedManifest = JSON.parse(
        await readFile(join(outputRoot, 'node_modules', packageName, 'package.json'), 'utf8'),
      );
      assert.equal(stagedManifest.name, packageName);
    }
    assert.deepEqual(
      JSON.parse(await readFile(join(outputRoot, 'runtime-closure.json'), 'utf8')),
      manifest,
    );
  });

  it('rejects Windows and Linux native targets', () => {
    for (const target of ['win32-x64', 'linux-x64']) {
      assert.throws(
        () => getSharpRuntimePackages(target),
        new RegExp(`Unsupported Sharp runtime target: ${target}`, 'u'),
      );
    }
  });
});

async function createTemporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-sharp-runtime-'));
  temporaryRoots.push(root);
  return root;
}
