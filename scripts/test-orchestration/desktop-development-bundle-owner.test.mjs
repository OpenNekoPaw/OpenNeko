import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import {
  acquireDesktopDevelopmentBundleOwner,
  resolveDesktopDevelopmentOwnerPath,
  runDesktopDevelopment,
} from '../desktop-functional/run-development.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

describe('Desktop development bundle ownership', () => {
  it('gives separate canonical checkouts distinct owner identities', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-development-owner-identity-'));
    try {
      const checkoutA = join(fixtureRoot, 'checkout-a');
      const checkoutB = join(fixtureRoot, 'checkout-b');
      await Promise.all([mkdir(checkoutA), mkdir(checkoutB)]);

      assert.notEqual(
        resolveDesktopDevelopmentOwnerPath(checkoutA, fixtureRoot),
        resolveDesktopDevelopmentOwnerPath(checkoutB, fixtureRoot),
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects a live owner and recovers only after the recorded process is stale', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-development-owner-live-'));
    try {
      const appRoot = join(fixtureRoot, 'app');
      await mkdir(appRoot);
      const lockPath = resolveDesktopDevelopmentOwnerPath(appRoot, fixtureRoot);
      const first = acquireDesktopDevelopmentBundleOwner({
        appRoot,
        lockPath,
        pid: 101,
        token: 'owner-first',
      });

      assert.throws(
        () =>
          acquireDesktopDevelopmentBundleOwner({
            appRoot,
            lockPath,
            pid: 202,
            token: 'owner-conflict',
            isProcessAlive: (pid) => pid === 101,
          }),
        /already owns the Vite bundle/u,
      );

      const second = acquireDesktopDevelopmentBundleOwner({
        appRoot,
        lockPath,
        pid: 202,
        token: 'owner-second',
        isProcessAlive: () => false,
      });
      assert.equal(first.release(), false);
      assert.match(await readFile(lockPath, 'utf8'), /owner-second/u);
      assert.equal(second.release(), true);
      await assert.rejects(() => stat(lockPath), { code: 'ENOENT' });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('creates restrictive state and rejects malformed ownership without deleting it', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-development-owner-invalid-'));
    try {
      const appRoot = join(fixtureRoot, 'app');
      await mkdir(appRoot);
      const lockPath = resolveDesktopDevelopmentOwnerPath(appRoot, fixtureRoot);
      const owner = acquireDesktopDevelopmentBundleOwner({
        appRoot,
        lockPath,
        pid: 303,
        token: 'owner-permissions',
      });
      assert.equal((await stat(lockPath)).mode & 0o777, 0o600);
      assert.equal(owner.release(), true);

      await writeFile(lockPath, 'not-json\n', { encoding: 'utf8', mode: 0o600 });
      assert.throws(
        () =>
          acquireDesktopDevelopmentBundleOwner({
            appRoot,
            lockPath,
            pid: 404,
            token: 'owner-invalid',
          }),
        /ownership state is invalid/u,
      );
      assert.equal(await readFile(lockPath, 'utf8'), 'not-json\n');
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('forwards one canonical Forge launch and propagates its exit status', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-development-owner-launch-'));
    try {
      const appRoot = join(fixtureRoot, 'app');
      const runtimeRoot = join(fixtureRoot, 'runtime');
      await Promise.all([mkdir(appRoot), mkdir(runtimeRoot)]);
      const canonicalAppRoot = await realpath(appRoot);
      const calls = [];
      let prepareCount = 0;
      const result = runDesktopDevelopment({
        appRoot,
        temporaryDirectory: fixtureRoot,
        platform: 'darwin',
        argv: ['--openneko-functional-fixture'],
        pid: 505,
        token: 'owner-launch',
        environment: { OPENNEKO_TEST_ENV: 'preserved' },
        prepareRuntime({ appRoot: preparedAppRoot }) {
          prepareCount += 1;
          assert.equal(preparedAppRoot, canonicalAppRoot);
          return runtimeRoot;
        },
        spawnProcess(command, args, options) {
          calls.push({ command, args, options });
          const child = new EventEmitter();
          void Promise.resolve().then(() => child.emit('exit', 7, null));
          return child;
        },
      });

      assert.equal(await result, 7);
      assert.equal(prepareCount, 1);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].command, 'pnpm');
      assert.deepEqual(calls[0].args, [
        'exec',
        'electron-forge',
        'start',
        '--',
        '--openneko-functional-fixture',
      ]);
      assert.equal(calls[0].options.cwd, await realpath(resolve(appRoot)));
      assert.equal(calls[0].options.stdio, 'inherit');
      assert.equal(calls[0].options.env.OPENNEKO_TEST_ENV, 'preserved');
      assert.equal(calls[0].options.env.NEKO_DSH_RUNTIME_ROOT, await realpath(runtimeRoot));
      await assert.rejects(() => stat(resolveDesktopDevelopmentOwnerPath(appRoot, fixtureRoot)), {
        code: 'ENOENT',
      });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('qualifies an explicit runtime and never replaces invalid explicit configuration', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-development-runtime-explicit-'));
    try {
      const appRoot = join(fixtureRoot, 'app');
      const runtimeRoot = join(fixtureRoot, 'runtime');
      await Promise.all([mkdir(appRoot), mkdir(runtimeRoot)]);
      const canonicalRuntimeRoot = await realpath(runtimeRoot);
      const launches = [];
      let prepareCount = 0;
      let qualifyCount = 0;
      const spawnProcess = (_command, _args, options) => {
        launches.push(options);
        const child = new EventEmitter();
        void Promise.resolve().then(() => child.emit('exit', 0, null));
        return child;
      };

      assert.equal(
        await runDesktopDevelopment({
          appRoot,
          temporaryDirectory: fixtureRoot,
          pid: 506,
          token: 'owner-explicit-valid',
          environment: { NEKO_DSH_RUNTIME_ROOT: runtimeRoot },
          prepareRuntime() {
            prepareCount += 1;
            return runtimeRoot;
          },
          qualifyRuntime(root) {
            qualifyCount += 1;
            assert.equal(root, canonicalRuntimeRoot);
          },
          spawnProcess,
        }),
        0,
      );
      assert.equal(prepareCount, 0);
      assert.equal(qualifyCount, 1);
      assert.equal(launches[0].env.NEKO_DSH_RUNTIME_ROOT, await realpath(runtimeRoot));

      for (const [configured, qualifyRuntime, message] of [
        ['relative/runtime', () => undefined, /must be absolute/u],
        [
          runtimeRoot,
          () => {
            throw new Error('runtime closure is damaged');
          },
          /closure is damaged/u,
        ],
      ]) {
        await assert.rejects(
          () =>
            runDesktopDevelopment({
              appRoot,
              temporaryDirectory: fixtureRoot,
              pid: 507,
              token: `owner-explicit-invalid-${launches.length}`,
              environment: { NEKO_DSH_RUNTIME_ROOT: configured },
              prepareRuntime() {
                prepareCount += 1;
                return runtimeRoot;
              },
              qualifyRuntime,
              spawnProcess,
            }),
          message,
        );
      }
      assert.equal(prepareCount, 0);
      assert.equal(launches.length, 1);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('never spawns Forge when another live launcher owns the checkout', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'openneko-development-owner-conflict-'));
    try {
      const appRoot = join(fixtureRoot, 'app');
      await mkdir(appRoot);
      const lockPath = resolveDesktopDevelopmentOwnerPath(appRoot, fixtureRoot);
      const owner = acquireDesktopDevelopmentBundleOwner({
        appRoot,
        lockPath,
        pid: 606,
        token: 'owner-active',
      });
      let spawnCount = 0;

      await assert.rejects(
        () =>
          runDesktopDevelopment({
            appRoot,
            lockPath,
            platform: 'darwin',
            argv: [],
            pid: 707,
            token: 'owner-rejected',
            isProcessAlive: (pid) => pid === 606,
            spawnProcess() {
              spawnCount += 1;
              return new EventEmitter();
            },
          }),
        /already owns the Vite bundle/u,
      );
      assert.equal(spawnCount, 0);
      assert.equal(owner.release(), true);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('keeps root development and functional scenarios on the guarded package command', async () => {
    const [rootManifest, desktopManifest, runnerSource] = await Promise.all([
      readFile(join(repositoryRoot, 'package.json'), 'utf8').then(JSON.parse),
      readFile(join(repositoryRoot, 'apps/neko-desktop/package.json'), 'utf8').then(JSON.parse),
      readFile(join(repositoryRoot, 'scripts/desktop-functional/runner.mjs'), 'utf8'),
    ]);

    assert.equal(rootManifest.scripts['dev:desktop'], 'pnpm --filter @neko/app-desktop dev');
    assert.equal(
      desktopManifest.scripts.dev,
      'node ../../scripts/assert-supported-desktop-host.mjs && node ../../scripts/desktop-functional/run-development.mjs',
    );
    assert.doesNotMatch(desktopManifest.scripts.dev, /electron-forge start/u);
    assert.match(
      runnerSource,
      /Object\.freeze\(\['--filter', '@neko\/app-desktop', 'dev', '--', \.\.\.commonArgs\]\)/u,
    );
    assert.match(runnerSource, /if \(input\.target === 'packaged'\)/u);
  });
});
