import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  assertAutomationRuntimeReleaseInputs,
  assertPinnedArtifactFile,
  automationRuntimeReleaseReadiness,
  loadAutomationRuntimeReleaseInputs,
} from '../automation-runtime-release-inputs.mjs';

describe('automation runtime release inputs', () => {
  it('locks reviewed Browser Use, Cua Driver and MCP SDK upstream facts', () => {
    const inputs = loadAutomationRuntimeReleaseInputs();

    assert.equal(inputs.browserUse.release, '0.13.7');
    assert.equal(inputs.browserUse.githubReleaseAssets.length, 0);
    assert.equal(inputs.cuaDriver.release, '0.19.2');
    assert.equal(inputs.cuaDriver.buildEvidence.nodeRuntime.publishedCargoLock, null);
    assert.deepEqual(inputs.cuaDriver.buildEvidence.nodeRuntime.firstPartyCargoLock, {
      path: 'scripts/release-inputs/cua-driver-node-runtime-0.19.2.Cargo.lock',
      sha256: 'sha256:31ad587c083cec15a6cc927e3e552a4833789342ef5a684b6fd1e863dd50402c',
      packages: 36,
    });
    assert.deepEqual(inputs.cuaDriver.buildEvidence.nodeRuntime.rustToolchain, {
      release: '1.97.1',
      rustcCommit: '8bab26f4f',
      releaseDate: '2026-07-14',
    });
    assert.equal(inputs.cuaDriver.buildEvidence.nodeRuntime.compiledPackages.length, 31);
    assert.deepEqual(inputs.cuaDriver.buildEvidence.licenseClosure, {
      target: 'darwin-arm64',
      packages: 367,
      sha256: 'sha256:aaaa49126e1de4500915ddccb371a7688d11d283b57ef114ddba0e4c2b9bad93',
    });
    assert.deepEqual(inputs.cuaDriver.buildEvidence.rustWorkspace.rootPackages, [
      'cua-driver',
      'cursor-theme-cli',
      'cua-driver-sdk',
    ]);
    assert.deepEqual(
      inputs.cuaDriver.platformArtifacts.map((artifact) => artifact.target),
      ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-arm64', 'win32-x64'],
    );
    assert.equal(inputs.mcpSdk.release, '1.30.0');
  });

  it('keeps both extensions unavailable until OpenNeko release evidence exists', () => {
    const readiness = automationRuntimeReleaseReadiness();

    assert.equal(readiness.browserUse.installable, false);
    assert.ok(readiness.browserUse.blockers.includes('upstream-release-has-no-binary-assets'));
    assert.equal(readiness.cuaDriver.installable, false);
    assert.ok(readiness.cuaDriver.blockers.includes('contained-candidate-not-released'));
    assert.ok(
      readiness.cuaDriver.blockers.includes('first-party-locked-node-runtime-not-released'),
    );
    assert.ok(
      !readiness.cuaDriver.blockers.includes('upstream-node-runtime-cargo-lock-not-published'),
    );
    assert.ok(readiness.cuaDriver.blockers.includes('transitive-license-inventory-not-reviewed'));
    assert.ok(readiness.cuaDriver.blockers.includes('openneko-release-signature-not-produced'));
  });

  it('verifies exact local artifact bytes and rejects poisoned input', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openneko-automation-release-input-'));
    const path = join(root, 'fixture.tar.gz');
    const contents = Buffer.from('reviewed upstream artifact');
    const artifact = {
      target: 'darwin-arm64',
      archive: 'tar.gz',
      name: 'fixture.tar.gz',
      url: 'https://github.com/trycua/cua/releases/download/fixed/fixture.tar.gz',
      bytes: contents.byteLength,
      sha256: `sha256:${createHash('sha256').update(contents).digest('hex')}`,
    };
    writeFileSync(path, contents);

    assert.equal((await assertPinnedArtifactFile(path, artifact)).bytes, contents.byteLength);
    writeFileSync(path, Buffer.from('modified upstream artifact'));
    await assert.rejects(
      () => assertPinnedArtifactFile(path, artifact),
      /size mismatch|digest mismatch/u,
    );
  });

  it('rejects moving release URLs and incomplete platform inventories', () => {
    const inputs = structuredClone(loadAutomationRuntimeReleaseInputs());
    inputs.cuaDriver.platformArtifacts[0].url =
      'https://github.com/trycua/cua/releases/latest/download/cua-driver.tar.gz';
    assert.throws(
      () => assertAutomationRuntimeReleaseInputs(inputs),
      /exact reviewed GitHub HTTPS URL/u,
    );

    const incomplete = structuredClone(loadAutomationRuntimeReleaseInputs());
    incomplete.cuaDriver.platformArtifacts.pop();
    assert.throws(
      () => assertAutomationRuntimeReleaseInputs(incomplete),
      /inventory is incomplete/u,
    );
  });

  it('rejects treating Browser Use source archives as release binaries', () => {
    const inputs = structuredClone(loadAutomationRuntimeReleaseInputs());
    inputs.browserUse.githubReleaseAssets.push({
      name: 'source.tar.gz',
      url: 'https://api.github.com/repos/browser-use/browser-use/tarball/0.13.7',
    });

    assert.throws(() => assertAutomationRuntimeReleaseInputs(inputs), /must remain source-only/u);
  });

  it('rejects invented Node runtime locks and incomplete release-log closure evidence', () => {
    const inventedLock = structuredClone(loadAutomationRuntimeReleaseInputs());
    inventedLock.cuaDriver.buildEvidence.nodeRuntime.publishedCargoLock =
      'libs/cua-driver/rust/Cargo.lock';
    assert.throws(
      () => assertAutomationRuntimeReleaseInputs(inventedLock),
      /Node runtime source evidence is not exact/u,
    );

    const incompleteClosure = structuredClone(loadAutomationRuntimeReleaseInputs());
    incompleteClosure.cuaDriver.buildEvidence.nodeRuntime.compiledPackages.pop();
    assert.throws(
      () => assertAutomationRuntimeReleaseInputs(incompleteClosure),
      /compiled package evidence is incomplete/u,
    );

    const resolverDrift = structuredClone(loadAutomationRuntimeReleaseInputs());
    resolverDrift.cuaDriver.buildEvidence.nodeRuntime.compiledPackages.find(
      (entry) => entry.name === 'cc',
    ).release = '1.4.2';
    assert.throws(
      () => assertAutomationRuntimeReleaseInputs(resolverDrift),
      /does not match the release log/u,
    );

    const toolchainDrift = structuredClone(loadAutomationRuntimeReleaseInputs());
    toolchainDrift.cuaDriver.buildEvidence.nodeRuntime.rustToolchain.release = '1.93.1';
    assert.throws(
      () => assertAutomationRuntimeReleaseInputs(toolchainDrift),
      /Rust toolchain evidence is invalid/u,
    );
  });
});
