import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { parse } from 'yaml';

const executeFile = promisify(execFile);

describe('macOS release workflow', () => {
  it('fetches standalone runtime inputs into a cold store for offline staging', async () => {
    const workflow = parse(await readFile('.github/workflows/release.yml', 'utf8'));
    const steps = workflow.jobs['macos-release'].steps;
    const fetchIndex = steps.findIndex((step) => step.name === 'Fetch locked DSH runtime inputs');
    assert.ok(fetchIndex >= 0);
    assert.ok(fetchIndex < steps.findIndex((step) => step.run === 'pnpm make:desktop'));
    const [command, ...arguments_] = steps[fetchIndex].run.trim().split(/\s+/u);
    assert.equal(command, 'pnpm');
    const { packageManager } = JSON.parse(await readFile('package.json', 'utf8'));

    const root = await mkdtemp(join(tmpdir(), 'openneko-release-fetch-'));
    const server = createServer();
    try {
      const input = join(root, 'scripts/dsh-development-runtime');
      const archiveRoot = join(root, 'archive');
      const stage = join(root, 'stage');
      const store = join(root, 'store');
      await mkdir(input, { recursive: true });
      await mkdir(join(archiveRoot, 'package'), { recursive: true });
      await mkdir(stage);
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ private: true, packageManager }),
      );
      await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
      await writeFile(
        join(root, 'pnpm-lock.yaml'),
        "lockfileVersion: '9.0'\nimporters:\n  .: {}\n",
      );
      const dependency = { name: 'runtime-input', version: '1.0.0' };
      await writeFile(join(archiveRoot, 'package/package.json'), JSON.stringify(dependency));
      const archive = join(root, 'runtime-input.tgz');
      await executeFile('tar', ['-czf', archive, '-C', archiveRoot, 'package']);
      const bytes = await readFile(archive);
      let downloads = 0;
      server.on('request', (_request, response) => {
        downloads += 1;
        response.end(bytes);
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = `http://127.0.0.1:${server.address().port}/runtime-input.tgz`;
      await writeFile(
        join(input, 'package.json'),
        JSON.stringify({ private: true, packageManager, dependencies: { 'runtime-input': url } }),
      );
      const pnpm = (args, cwd) =>
        executeFile('pnpm', [...args, '--store-dir', store], { cwd, timeout: 30_000 });
      await pnpm(['install', '--lockfile-only', '--ignore-workspace', '--ignore-scripts'], input);
      await rm(store, { recursive: true, force: true });
      downloads = 0;
      await pnpm(arguments_, root);
      assert.ok(downloads > 0, 'fetch must populate the standalone runtime dependency store');
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      for (const name of ['package.json', 'pnpm-lock.yaml']) {
        await cp(join(input, name), join(stage, name));
      }
      await pnpm(
        [
          'install',
          '--prod',
          '--offline',
          '--frozen-lockfile',
          '--ignore-workspace',
          '--node-linker=hoisted',
          '--ignore-scripts',
        ],
        stage,
      );
      assert.deepEqual(
        JSON.parse(await readFile(join(stage, 'node_modules/runtime-input/package.json'), 'utf8')),
        dependency,
      );
    } finally {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    }
  });

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
