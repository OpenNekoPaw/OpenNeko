import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

const EXPECTED_TARGETS = ['darwin-arm64', 'linux-x64'];
const EXPECTED_MATRIX = [
  {
    target: 'darwin-arm64',
    os: 'macos-15',
  },
  {
    target: 'linux-x64',
    os: 'ubuntu-latest',
  },
];

describe('supported release platform orchestration', () => {
  it('keeps CI and Release packaging matrices identical and architecture-specific', async () => {
    const [ciWorkflow, releaseWorkflow] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8').then(parse),
      readFile('.github/workflows/release.yml', 'utf8').then(parse),
    ]);

    const ciPackageJob = ciWorkflow.jobs['package-openneko-vsix'];
    const releasePackageJob = releaseWorkflow.jobs['release-openneko'];

    assert.deepEqual(projectMatrix(ciPackageJob), EXPECTED_MATRIX);
    assert.deepEqual(projectMatrix(releasePackageJob), EXPECTED_MATRIX);
    assert.equal(ciWorkflow.jobs['test-rust'], undefined);
    assert.equal(ciWorkflow.jobs['cargo-deny'], undefined);
    assert.deepEqual(ciPackageJob.needs, ['build', 'test-ts']);
    assert.deepEqual(ciWorkflow.jobs['local-metadata-runtime'].strategy.matrix.os, [
      'ubuntu-latest',
      'macos-15',
    ]);
    assert.doesNotMatch(JSON.stringify(ciWorkflow), /windows-latest|win32-x64/u);
    assert.doesNotMatch(JSON.stringify(releaseWorkflow), /windows-latest|win32-x64/u);
    assert.equal(ciWorkflow.jobs['package-engine-vsix'], undefined);
    assert.equal(releaseWorkflow.jobs['release-engine'], undefined);
  });

  it('keeps the retired Engine outside product packaging jobs', async () => {
    const [ciWorkflow, releaseWorkflow] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8').then(parse),
      readFile('.github/workflows/release.yml', 'utf8').then(parse),
    ]);

    for (const job of [
      ciWorkflow.jobs['package-openneko-vsix'],
      releaseWorkflow.jobs['release-openneko'],
    ]) {
      const source = JSON.stringify(job);
      assert.doesNotMatch(source, /neko-engine|host-napi|engine-vsix/u);
      assert.match(source, /check:engine-retirement-boundary/u);
    }
  });

  it('keeps the retired Engine out of every product package group', async () => {
    const packageGroups = JSON.parse(await readFile('scripts/package-groups.json', 'utf8'));

    assert.ok(!packageGroups.packages.buildRelease.includes('neko-engine'));
    assert.ok(!packageGroups.packages.tsExtensions.includes('neko-engine'));
  });

  it('does not expose discontinued platform targets through local release entry points', async () => {
    const surfaces = await Promise.all(
      ['build.sh', 'ci.sh', 'scripts/act-ci.sh'].map((file) => readFile(file, 'utf8')),
    );
    const source = surfaces.join('\n');

    assert.doesNotMatch(
      source,
      /darwin-x64|x86_64-apple-darwin|win32-x64|x86_64-pc-windows-msvc|macos-13|macos-14/u,
    );
    for (const target of EXPECTED_TARGETS) {
      assert.match(source, new RegExp(target, 'u'));
    }
  });
});

function projectMatrix(job) {
  return job.strategy.matrix.include.map((entry) => ({
    target: entry.target,
    os: entry.os,
  }));
}
