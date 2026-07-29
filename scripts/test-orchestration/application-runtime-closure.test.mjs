import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { assertApplicationRuntimeClosure } from '../application-runtime-closure.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('application runtime closure validator', () => {
  it('accepts and reports the single application runtime closure', async () => {
    const stageRoot = await createStage();
    await writeRuntimeModule(stageRoot, 'fixture-runtime');
    await writeManifest(stageRoot, 'darwin-arm64', [
      { packageName: 'fixture-runtime', specifier: 'fixture-runtime/module.js' },
    ]);

    assert.deepEqual(assertApplicationRuntimeClosure(stageRoot, 'darwin-arm64'), {
      packageName: 'neko-suite',
      runtimeModuleCount: 1,
    });
  });

  it('rejects target mismatch, missing modules, and cross-target modules', async () => {
    const mismatch = await createStage();
    await writeManifest(mismatch, 'linux-x64', [
      { packageName: 'fixture-runtime', specifier: 'fixture-runtime/module.js' },
    ]);
    assert.throws(
      () => assertApplicationRuntimeClosure(mismatch, 'darwin-arm64'),
      /target mismatch/u,
    );

    const missing = await createStage();
    await writeManifest(missing, 'darwin-arm64', [
      { packageName: 'missing-runtime', specifier: 'missing-runtime/module.js' },
    ]);
    assert.throws(
      () => assertApplicationRuntimeClosure(missing, 'darwin-arm64'),
      /cannot be resolved/u,
    );

    const crossTarget = await createStage();
    await writeManifest(crossTarget, 'darwin-arm64', [
      {
        packageName: '@img/sharp-linux-x64',
        specifier: '@img/sharp-linux-x64/sharp.node',
      },
    ]);
    assert.throws(
      () => assertApplicationRuntimeClosure(crossTarget, 'darwin-arm64'),
      /contains linux-x64 module for darwin-arm64/u,
    );
  });

  it('rejects internal bare imports and variable package imports', async () => {
    const internal = await createStage('require("@neko/media/private-runtime");');
    assert.throws(
      () => assertApplicationRuntimeClosure(internal, 'darwin-arm64'),
      /internal bare runtime imports/u,
    );

    const variable = await createStage('import(packageName);');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.throws(
        () => assertApplicationRuntimeClosure(variable, 'darwin-arm64'),
        /retains import\(packageName\)/u,
      );
    }
  });
});

async function createStage(bundle = 'module.exports = {};') {
  const root = await mkdtemp(join(tmpdir(), 'openneko-runtime-closure-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'dist', 'extension.js'), bundle);
  return root;
}

async function writeManifest(stageRoot, target, modules) {
  await writeFile(
    join(stageRoot, 'dist', 'runtime-closure.json'),
    JSON.stringify({
      schemaVersion: 'openneko.application-runtime-closure.v1',
      target,
      modules,
    }),
  );
}

async function writeRuntimeModule(ownerRoot, packageName) {
  const packageRoot = join(ownerRoot, 'node_modules', packageName);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: packageName, exports: { './module.js': './module.js' } }),
  );
  await writeFile(join(packageRoot, 'module.js'), 'module.exports = {};');
}
