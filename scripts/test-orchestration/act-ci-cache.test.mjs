import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ACT_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts/act-ci.sh');

async function createHarness(testContext, options = {}) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'openneko-act-ci-'));
  const binaryDirectory = path.join(temporaryDirectory, 'bin');
  const homeDirectory = path.join(temporaryDirectory, 'home');
  const cacheRoot = path.join(temporaryDirectory, options.cacheDirectoryName ?? 'cache');
  const actLog = path.join(temporaryDirectory, 'act.log');
  const dockerLog = path.join(temporaryDirectory, 'docker.log');

  await Promise.all([mkdir(binaryDirectory), mkdir(homeDirectory)]);
  await Promise.all([
    writeFile(
      path.join(binaryDirectory, 'act'),
      `#!/usr/bin/env bash
{
  printf 'CALL\\n'
  for argument in "$@"; do
    printf 'ARG:%s\\n' "$argument"
  done
} >> "$ACT_TEST_LOG"
`,
    ),
    writeFile(
      path.join(binaryDirectory, 'docker'),
      `#!/usr/bin/env bash
{
  printf 'CALL\\n'
  for argument in "$@"; do
    printf 'ARG:%s\\n' "$argument"
  done
} >> "$DOCKER_TEST_LOG"

if [[ "\${1:-}" == "image" && "\${2:-}" == "inspect" ]]; then
  exit "\${DOCKER_TEST_IMAGE_EXISTS:-1}"
fi
`,
    ),
  ]);
  await Promise.all([
    chmod(path.join(binaryDirectory, 'act'), 0o755),
    chmod(path.join(binaryDirectory, 'docker'), 0o755),
  ]);

  testContext.after(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const environment = {
    ...process.env,
    PATH: `${binaryDirectory}:${process.env.PATH ?? ''}`,
    HOME: homeDirectory,
    ACT_CACHE_ROOT: cacheRoot,
    ACT_TEST_LOG: actLog,
    DOCKER_TEST_LOG: dockerLog,
    DOCKER_TEST_IMAGE_EXISTS: options.imageExists ? '0' : '1',
  };
  delete environment.ACT_PLATFORM;
  delete environment.ACT_BASE_IMAGE;
  delete environment.ACT_RUNNER_IMAGE;
  delete environment.ACT_CONTAINER_ARCHITECTURE;

  return {
    actLog,
    cacheRoot,
    dockerLog,
    environment,
    run(argumentsToPass = []) {
      return execFileSync(ACT_SCRIPT, ['--job', 'build', ...argumentsToPass], {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
        env: environment,
      });
    },
  };
}

test('act CI defaults to a prepared ARM64 runner with architecture-isolated mounts', async (testContext) => {
  const harness = await createHarness(testContext);
  const output = harness.run();
  const [actLog, dockerLog] = await Promise.all([
    readFile(harness.actLog, 'utf8'),
    readFile(harness.dockerLog, 'utf8'),
  ]);
  const architectureCache = path.join(harness.cacheRoot, 'linux-arm64-v8');

  assert.match(output, /Arch:\s+linux\/arm64\/v8 \(act: linux\/arm64\)/u);
  assert.match(output, new RegExp(`Cache:\\s+${escapeRegularExpression(architectureCache)}`, 'u'));
  assert.match(actLog, /ARG:--container-architecture\nARG:linux\/arm64/u);
  assert.match(actLog, /ARG:--platform\nARG:ubuntu-latest=openneko-act:linux-arm64-v8-[0-9]+/u);
  assert.match(actLog, /ARG:--pull=false/u);
  assert.match(actLog, /ARG:--env\nARG:ACT_NATIVE_DEPS_READY=true/u);
  assert.match(
    actLog,
    /ARG:--env\nARG:npm_config_store_dir=\/root\/\.local\/share\/pnpm\/store/u,
  );

  for (const cacheName of [
    'pnpm-store',
    'corepack',
    'cargo-home',
    'rustup',
    'turbo',
    'cargo-target',
  ]) {
    assert.match(actLog, new RegExp(`${escapeRegularExpression(path.join(architectureCache, cacheName))}:`, 'u'));
  }
  assert.match(actLog, /pnpm-store:\/root\/\.local\/share\/pnpm\/store/u);
  assert.match(actLog, /corepack:\/root\/\.cache\/node\/corepack/u);
  assert.match(actLog, /cargo-home:\/root\/\.cargo/u);
  assert.match(actLog, /rustup:\/root\/\.rustup/u);
  assert.match(dockerLog, /ARG:image\nARG:inspect/u);
  assert.match(dockerLog, /ARG:build/u);
  assert.match(dockerLog, /ARG:--platform\nARG:linux\/arm64/u);
  assert.match(dockerLog, /ARG:--build-arg\nARG:ACT_BASE_IMAGE=catthehacker\/ubuntu:act-latest/u);
  assert.match(dockerLog, /ARG:.*\/scripts\/act$/mu);
});

test('act CI isolates AMD64 caches and reuses an existing prepared image', async (testContext) => {
  const harness = await createHarness(testContext, { imageExists: true });
  harness.environment.ACT_CONTAINER_ARCHITECTURE = 'linux/amd64';

  harness.run();
  const [actLog, dockerLog] = await Promise.all([
    readFile(harness.actLog, 'utf8'),
    readFile(harness.dockerLog, 'utf8'),
  ]);

  assert.match(actLog, /ARG:--container-architecture\nARG:linux\/amd64/u);
  assert.match(actLog, new RegExp(`${escapeRegularExpression(path.join(harness.cacheRoot, 'linux-amd64'))}/`, 'u'));
  assert.doesNotMatch(actLog, /linux-arm64-v8/u);
  assert.match(dockerLog, /ARG:image\nARG:inspect/u);
  assert.doesNotMatch(dockerLog, /ARG:build/u);
});

test('act CI pull refreshes the prepared image but keeps the local tag offline', async (testContext) => {
  const harness = await createHarness(testContext, { imageExists: true });

  harness.run(['--pull']);
  const [actLog, dockerLog] = await Promise.all([
    readFile(harness.actLog, 'utf8'),
    readFile(harness.dockerLog, 'utf8'),
  ]);

  assert.doesNotMatch(dockerLog, /ARG:image\nARG:inspect/u);
  assert.match(dockerLog, /ARG:build/u);
  assert.match(dockerLog, /ARG:--pull/u);
  assert.match(actLog, /ARG:--pull=false/u);
});

test('custom act platforms retain workflow dependency setup and explicit pull behavior', async (testContext) => {
  const harness = await createHarness(testContext);
  harness.environment.ACT_PLATFORM = 'ubuntu-latest=example.test/custom-act:latest';

  harness.run(['--pull']);
  const [actLog, dockerLog] = await Promise.all([
    readFile(harness.actLog, 'utf8'),
    readFile(harness.dockerLog, 'utf8'),
  ]);

  assert.match(actLog, /ARG:--platform\nARG:ubuntu-latest=example\.test\/custom-act:latest/u);
  assert.match(actLog, /ARG:--pull=true/u);
  assert.doesNotMatch(actLog, /ACT_NATIVE_DEPS_READY/u);
  assert.doesNotMatch(dockerLog, /ARG:image\nARG:inspect/u);
  assert.doesNotMatch(dockerLog, /ARG:build/u);
});

test('act CI quotes cache mounts whose host path contains spaces', async (testContext) => {
  const harness = await createHarness(testContext, {
    cacheDirectoryName: 'cache root',
    imageExists: true,
  });

  harness.run();
  const actLog = await readFile(harness.actLog, 'utf8');

  assert.match(actLog, /cache\\ root\/linux-arm64-v8\/pnpm-store/u);
});

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
