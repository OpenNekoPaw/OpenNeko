import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const require = createRequire(import.meta.url);
const {
  SUPPORTED_TARGET_NAMES,
} = require('../../packages/neko-engine/packages/host-napi/native-binding-loader');

const EXPECTED_TARGETS = ['darwin-arm64', 'linux-x64', 'win32-x64'];
const EXPECTED_MATRIX = [
  {
    target: 'darwin-arm64',
    os: 'macos-15',
    rustTarget: 'aarch64-apple-darwin',
  },
  {
    target: 'linux-x64',
    os: 'ubuntu-latest',
    rustTarget: 'x86_64-unknown-linux-gnu',
  },
  {
    target: 'win32-x64',
    os: 'windows-latest',
    rustTarget: 'x86_64-pc-windows-msvc',
  },
];

describe('supported release platform orchestration', () => {
  it('keeps Engine packaging and N-API metadata on the exact canonical target set', async () => {
    const [packageConfig, hostManifest, runtimeMatrix] = await Promise.all([
      readFile('packages/neko-engine/scripts/package-config.json', 'utf8').then(JSON.parse),
      readFile('packages/neko-engine/packages/host-napi/package.json', 'utf8').then(JSON.parse),
      readFile('quality/local-metadata-runtime-matrix.json', 'utf8').then(JSON.parse),
    ]);

    assert.deepEqual(Object.keys(packageConfig.targets), EXPECTED_TARGETS);
    assert.deepEqual(SUPPORTED_TARGET_NAMES, EXPECTED_TARGETS);
    assert.equal(hostManifest.main, 'loader.js');
    assert.doesNotMatch(hostManifest.files.join('\n'), /^index\.js$/mu);
    assert.deepEqual(
      hostManifest.napi.triples.additional,
      EXPECTED_MATRIX.map((entry) => entry.rustTarget),
    );
    assert.equal(hostManifest.scripts.universal, undefined);
    assert.deepEqual(
      runtimeMatrix.targets.map(({ host, os, arch }) => `${host}:${os}-${arch}`),
      ['vscode-extension', 'node-cli', 'bun-tui'].flatMap((host) =>
        EXPECTED_TARGETS.map((target) => `${host}:${target}`),
      ),
    );
  });

  it('keeps CI and Release packaging matrices identical and architecture-specific', async () => {
    const [ciWorkflow, releaseWorkflow] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8').then(parse),
      readFile('.github/workflows/release.yml', 'utf8').then(parse),
    ]);

    const ciEngineJob = ciWorkflow.jobs['package-engine-vsix'];
    const releaseEngineJob = releaseWorkflow.jobs['release-engine'];

    assert.deepEqual(projectMatrix(ciEngineJob), EXPECTED_MATRIX);
    assert.deepEqual(projectMatrix(releaseEngineJob), EXPECTED_MATRIX);
    assertWindowsFfmpegSetup(ciEngineJob);
    assertWindowsFfmpegSetup(releaseEngineJob);
    assert.equal(ciWorkflow.jobs['test-rust']['runs-on'], 'macos-15');
    assert.deepEqual(ciWorkflow.jobs['local-metadata-runtime'].strategy.matrix.os, [
      'ubuntu-latest',
      'windows-latest',
      'macos-15',
    ]);
  });

  it('keeps the native Engine out of TypeScript-only VSIX packaging', async () => {
    const packageGroups = JSON.parse(await readFile('scripts/package-groups.json', 'utf8'));

    assert.ok(packageGroups.packages.buildRelease.includes('neko-engine'));
    assert.ok(!packageGroups.packages.tsExtensions.includes('neko-engine'));
  });

  it('does not expose discontinued platform targets through local release entry points', async () => {
    const surfaces = await Promise.all(
      ['build.sh', 'ci.sh', 'scripts/act-ci.sh'].map((file) => readFile(file, 'utf8')),
    );
    const source = surfaces.join('\n');

    assert.doesNotMatch(source, /darwin-x64|x86_64-apple-darwin|macos-13|macos-14/u);
    for (const target of EXPECTED_TARGETS) {
      assert.match(source, new RegExp(target, 'u'));
    }
  });
});

function projectMatrix(job) {
  return job.strategy.matrix.include.map((entry) => ({
    target: entry.target,
    os: entry.os,
    rustTarget: entry['rust-target'],
  }));
}

function assertWindowsFfmpegSetup(job) {
  const windowsTarget = job.strategy.matrix.include.find((entry) => entry.target === 'win32-x64');
  assert.ok(windowsTarget);
  assert.equal(
    windowsTarget['ffmpeg-install'],
    'node packages/neko-engine/scripts/download-ffmpeg.js --platform win32-x64',
  );
  assert.doesNotMatch(windowsTarget['ffmpeg-install'], /choco|chocolatey/iu);

  const installStep = job.steps.find((step) => step.name === 'Install FFmpeg');
  assert.ok(installStep);
  assert.equal(installStep.shell, 'bash');
}
