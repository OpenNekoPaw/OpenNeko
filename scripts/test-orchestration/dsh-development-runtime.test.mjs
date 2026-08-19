import assert from 'node:assert/strict';
import { statSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  prepareDshDevelopmentRuntime,
  resolveDshDevelopmentRuntimeRoot,
} from '../prepare-dsh-development-runtime.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const inputRoot = join(repositoryRoot, 'scripts', 'dsh-development-runtime');

describe('Desktop development DSH runtime builder', () => {
  it('atomically builds, verifies, and reuses a content-fresh generated runtime', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-dsh-development-runtime-'));
    try {
      const appRoot = join(fixtureRoot, 'app');
      await mkdir(appRoot);
      let buildCount = 0;
      let verifyCount = 0;
      const buildClosure = ({ runtimeRoot }) => {
        buildCount += 1;
        writeFileSync(join(runtimeRoot, 'runtime-marker'), `build-${buildCount}\n`);
      };
      const verifyRuntime = (runtimeRoot) => {
        verifyCount += 1;
        return statSync(join(runtimeRoot, 'runtime-marker'));
      };
      const options = {
        repositoryRoot,
        inputRoot,
        appRoot,
        buildClosure,
        verifyRuntime,
      };

      const first = prepareDshDevelopmentRuntime(options);
      assert.equal(first, resolveDshDevelopmentRuntimeRoot(appRoot));
      assert.equal(buildCount, 1);
      assert.equal(await readFile(join(first, 'runtime-marker'), 'utf8'), 'build-1\n');

      assert.equal(prepareDshDevelopmentRuntime(options), first);
      assert.equal(buildCount, 1);
      assert.equal(verifyCount, 2);

      await unlink(join(first, 'runtime-marker'));
      assert.equal(prepareDshDevelopmentRuntime(options), first);
      assert.equal(buildCount, 2);
      assert.equal(await readFile(join(first, 'runtime-marker'), 'utf8'), 'build-2\n');
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('preserves the last verified runtime when replacement construction fails', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-dsh-development-rollback-'));
    try {
      const appRoot = join(fixtureRoot, 'app');
      await mkdir(appRoot);
      const runtimeRoot = prepareDshDevelopmentRuntime({
        repositoryRoot,
        inputRoot,
        appRoot,
        buildClosure({ runtimeRoot: stagingRoot }) {
          writeFileSync(join(stagingRoot, 'runtime-marker'), 'verified\n');
        },
        verifyRuntime() {},
      });
      await unlink(join(runtimeRoot, '.development-input.sha256'));

      assert.throws(
        () =>
          prepareDshDevelopmentRuntime({
            repositoryRoot,
            inputRoot,
            appRoot,
            buildClosure() {
              throw new Error('construction failed');
            },
            verifyRuntime() {},
          }),
        /construction failed/u,
      );
      assert.equal(await readFile(join(runtimeRoot, 'runtime-marker'), 'utf8'), 'verified\n');
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('pins the relocatable Node and DSH inputs without workspace or range dependencies', async () => {
    const manifest = JSON.parse(await readFile(join(inputRoot, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies['node-bin-darwin-arm64'], '24.18.0');
    assert.equal(manifest.dependencies['@deepseek-ai/dsh'], '0.1.0-rc.7');
    assert.equal(manifest.dependencies['@deepseek-ai/dsh-base'], '0.1.0-rc.7');
    for (const dependency of Object.values(manifest.dependencies)) {
      assert.doesNotMatch(dependency, /^(?:workspace:|[~^])/u);
    }
    await stat(join(inputRoot, 'pnpm-lock.yaml'));
  });
});
