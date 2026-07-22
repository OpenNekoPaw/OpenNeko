import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { assertEmbeddedRuntimeClosure } from '../embedded-runtime-closure.mjs';
import { OPENNEKO_FEATURE_PACKAGES } from '../openneko-vsix-contract.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('embedded runtime closure validator', () => {
  it('accepts a feature-owned module closure', async () => {
    const { stageRoot, agentRoot } = await createStage();
    await writeRuntimeModule(agentRoot, 'fixture-runtime');
    await writeManifest(agentRoot, 'darwin-arm64', [
      { packageName: 'fixture-runtime', specifier: 'fixture-runtime/module.js' },
    ]);

    const summaries = assertEmbeddedRuntimeClosure(stageRoot, 'darwin-arm64');
    assert.equal(
      summaries.find(({ packageName }) => packageName === 'neko-agent')?.runtimeModuleCount,
      1,
    );
  });

  it('rejects target mismatch and cross-target modules', async () => {
    const mismatch = await createStage();
    await writeManifest(mismatch.agentRoot, 'linux-x64', [
      { packageName: 'fixture-runtime', specifier: 'fixture-runtime/module.js' },
    ]);
    assert.throws(
      () => assertEmbeddedRuntimeClosure(mismatch.stageRoot, 'darwin-arm64'),
      /target mismatch/u,
    );

    const crossTarget = await createStage();
    await writeManifest(crossTarget.agentRoot, 'darwin-arm64', [
      {
        packageName: '@img/sharp-linux-x64',
        specifier: '@img/sharp-linux-x64/sharp.node',
      },
    ]);
    assert.throws(
      () => assertEmbeddedRuntimeClosure(crossTarget.stageRoot, 'darwin-arm64'),
      /contains linux-x64 module for darwin-arm64/u,
    );
  });

  it('rejects missing modules and modules resolved outside the feature root', async () => {
    const missing = await createStage();
    await writeManifest(missing.agentRoot, 'darwin-arm64', [
      { packageName: 'missing-runtime', specifier: 'missing-runtime/module.js' },
    ]);
    assert.throws(
      () => assertEmbeddedRuntimeClosure(missing.stageRoot, 'darwin-arm64'),
      /cannot be resolved/u,
    );

    const escaped = await createStage();
    await writeRuntimeModule(escaped.root, 'outer-runtime');
    await writeManifest(escaped.agentRoot, 'darwin-arm64', [
      { packageName: 'outer-runtime', specifier: 'outer-runtime/module.js' },
    ]);
    assert.throws(
      () => assertEmbeddedRuntimeClosure(escaped.stageRoot, 'darwin-arm64'),
      /resolved outside feature/u,
    );
  });

  it('rejects internal bare imports and variable package imports on every call', async () => {
    const internal = await createStage();
    await writeFile(
      join(internal.agentRoot, 'dist', 'extension.js'),
      'require("@neko-engine/host-napi");',
    );
    assert.throws(
      () => assertEmbeddedRuntimeClosure(internal.stageRoot, 'darwin-arm64'),
      /internal bare runtime imports/u,
    );

    const variable = await createStage();
    await writeFile(join(variable.agentRoot, 'dist', 'extension.js'), 'import(packageName);');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.throws(
        () => assertEmbeddedRuntimeClosure(variable.stageRoot, 'darwin-arm64'),
        /retains import\(packageName\)/u,
      );
    }
  });
});

async function createStage() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-runtime-closure-'));
  temporaryRoots.push(root);
  const stageRoot = join(root, 'stage');
  for (const packageName of OPENNEKO_FEATURE_PACKAGES) {
    const bundleRoot = join(stageRoot, 'dist', 'features', packageName, 'dist');
    await mkdir(bundleRoot, { recursive: true });
    await writeFile(join(bundleRoot, 'extension.js'), 'module.exports = {};');
  }
  return {
    root,
    stageRoot,
    agentRoot: join(stageRoot, 'dist', 'features', 'neko-agent'),
  };
}

async function writeManifest(packageRoot, target, modules) {
  await writeFile(
    join(packageRoot, 'dist', 'runtime-closure.json'),
    JSON.stringify({
      schemaVersion: 'openneko.embedded-runtime-closure.v1',
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
