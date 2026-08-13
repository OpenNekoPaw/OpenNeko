import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { buildCuaDriverArtifactCandidate } from '../automation-runtime-artifact-builder.mjs';

const CUA_NODE_REBUILDER_PATH = fileURLToPath(
  new URL('../automation-runtime-cua-node-rebuilder.mjs', import.meta.url),
);

describe('OpenNeko automation runtime artifact builder', () => {
  it('builds deterministic contained Cua Driver candidates with provenance', async () => {
    const fixture = createFixture();
    const firstOutput = join(
      fixture.root,
      'first',
      'openneko-computer-use-0.19.2-darwin-arm64.tar.gz',
    );
    const secondOutput = join(
      fixture.root,
      'second',
      'openneko-computer-use-0.19.2-darwin-arm64.tar.gz',
    );
    mkdirSync(join(fixture.root, 'first'));
    mkdirSync(join(fixture.root, 'second'));

    const first = await buildCuaDriverArtifactCandidate({
      ...fixture.options,
      outputPath: firstOutput,
    });
    const second = await buildCuaDriverArtifactCandidate({
      ...fixture.options,
      outputPath: secondOutput,
    });

    assert.deepEqual(readFileSync(firstOutput), readFileSync(secondOutput));
    assert.equal(first.artifact.sha256, second.artifact.sha256);
    assert.equal(first.catalogReady, false);
    assert.deepEqual(first.blockers, [
      'transitive-license-inventory-review-required',
      'openneko-release-signature-not-produced',
      'packaged-darwin-arm64-qualification-not-run',
    ]);

    const entries = readTarGzip(firstOutput);
    assert.deepEqual([...entries.keys()], [...entries.keys()].sort());
    assert.equal(entries.get('runtime/bin/cua-driver')?.mode, 0o755);
    assert.equal(entries.get('runtime/bin/cua-driver')?.content.toString(), 'driver');
    assert.equal(
      entries.get('runtime/bin/cua_driver_node_runtime.node')?.content.toString(),
      'first-party-node-runtime',
    );
    assert.equal(
      entries.get('runtime/bin/CuaDriver.app/Contents/MacOS/cua-driver')?.content.toString(),
      'app-driver',
    );
    assert.equal(
      JSON.parse(entries.get('plugin.json').content).extensions['io.openneko'].mcpToolExposure,
      'adapter-only',
    );
    assert.deepEqual(JSON.parse(entries.get('mcp.json').content).mcpServers['cua-driver'].args, [
      'mcp',
      '--direct',
    ]);
    const provenance = JSON.parse(
      entries.get('metadata/io.openneko/artifact-provenance.json').content,
    );
    assert.equal(provenance.sourceCommit, fixture.inputs.cuaDriver.sourceCommit);
    assert.equal(
      provenance.upstreamBuild.rustWorkspace.lockSha256,
      fixture.inputs.cuaDriver.buildEvidence.rustWorkspace.lockSha256,
    );
    assert.deepEqual(
      provenance.upstreamBuild.licenseClosure,
      fixture.inputs.cuaDriver.buildEvidence.licenseClosure,
    );
    assert.equal(provenance.licenseInventory.path, 'THIRD_PARTY_LICENSES.spdx.json');
    assert.equal(
      provenance.licenseInventory.sha256,
      digest(entries.get('THIRD_PARTY_LICENSES.spdx.json').content),
    );
    const buildInputs = JSON.parse(
      entries.get('metadata/io.openneko/build-inputs.json').content,
    );
    assert.equal(buildInputs.upstream.artifact.sha256, fixture.artifact.sha256);
    assert.equal(buildInputs.upstream.artifact.url, fixture.artifact.url);
    assert.equal(
      buildInputs.firstPartyNodeRuntime.artifact.sha256,
      digest(Buffer.from('first-party-node-runtime')),
    );
    assert.equal(
      provenance.firstPartyNodeRuntime.cargo.lockSha256,
      fixture.inputs.cuaDriver.buildEvidence.nodeRuntime.firstPartyCargoLock.sha256,
    );
  });

  it('rejects poisoned first-party Node runtime bytes and receipts', async () => {
    const fixture = createFixture();
    const outputPath = join(fixture.root, 'openneko-computer-use-0.19.2-darwin-arm64.tar.gz');
    writeFileSync(fixture.nodeRuntimePath, 'poisoned-node-runtime');
    await assert.rejects(
      () => buildCuaDriverArtifactCandidate({ ...fixture.options, outputPath }),
      /receipt does not match/u,
    );

    writeFileSync(fixture.nodeRuntimePath, 'first-party-node-runtime');
    const receipt = JSON.parse(readFileSync(fixture.nodeRuntimeReceiptPath, 'utf8'));
    receipt.recipeSha256 = digest(Buffer.from('different-recipe'));
    writeFileSync(fixture.nodeRuntimeReceiptPath, JSON.stringify(receipt));
    await assert.rejects(
      () => buildCuaDriverArtifactCandidate({ ...fixture.options, outputPath }),
      /receipt does not match/u,
    );
    assert.throws(() => readFileSync(outputPath), /ENOENT/u);

    const unknownField = createFixture();
    const unknownReceipt = JSON.parse(readFileSync(unknownField.nodeRuntimeReceiptPath, 'utf8'));
    unknownReceipt.unreviewed = true;
    writeFileSync(unknownField.nodeRuntimeReceiptPath, JSON.stringify(unknownReceipt));
    await assert.rejects(
      () =>
        buildCuaDriverArtifactCandidate({
          ...unknownField.options,
          outputPath: join(unknownField.root, 'openneko-computer-use-0.19.2-darwin-arm64.tar.gz'),
        }),
      /does not contain the exact reviewed fields/u,
    );
  });

  it('rejects modified upstream bytes before producing an output', async () => {
    const fixture = createFixture();
    writeFileSync(fixture.upstreamArchivePath, Buffer.from('poisoned archive'));
    const outputPath = join(fixture.root, 'openneko-computer-use-0.19.2-darwin-arm64.tar.gz');

    await assert.rejects(
      () => buildCuaDriverArtifactCandidate({ ...fixture.options, outputPath }),
      /size mismatch|digest mismatch/u,
    );
    assert.throws(() => readFileSync(outputPath), /ENOENT/u);
  });

  it('rejects linked upstream entries even when the input digest matches', async () => {
    const fixture = createFixture({ linkedEntry: true });
    const outputPath = join(fixture.root, 'openneko-computer-use-0.19.2-darwin-arm64.tar.gz');

    await assert.rejects(
      () => buildCuaDriverArtifactCandidate({ ...fixture.options, outputPath }),
      /linked or unsupported entry/u,
    );
    assert.throws(() => readFileSync(outputPath), /ENOENT/u);
  });

  it('rejects incomplete or duplicate SPDX inventory', async () => {
    const fixture = createFixture();
    const outputPath = join(fixture.root, 'openneko-computer-use-0.19.2-darwin-arm64.tar.gz');
    writeFileSync(
      fixture.licenseInventoryPath,
      JSON.stringify({ spdxVersion: 'SPDX-2.3', SPDXID: 'SPDXRef-DOCUMENT', packages: [] }),
    );
    await assert.rejects(
      () => buildCuaDriverArtifactCandidate({ ...fixture.options, outputPath }),
      /SPDX license inventory is incomplete/u,
    );

    writeFileSync(
      fixture.licenseInventoryPath,
      JSON.stringify(
        createLicenseInventory([
          packageEntry('SPDXRef-Package-cua'),
          packageEntry('SPDXRef-Package-cua'),
        ]),
      ),
    );
    await assert.rejects(
      () => buildCuaDriverArtifactCandidate({ ...fixture.options, outputPath }),
      /is duplicated/u,
    );

    const wrongClosure = createFixture();
    writeFileSync(
      wrongClosure.licenseInventoryPath,
      JSON.stringify({
        ...createLicenseInventory([
          {
            ...packageEntry('SPDXRef-Package-other'),
            name: 'other-package',
          },
        ]),
        documentDescribes: ['SPDXRef-Package-other'],
      }),
    );
    await assert.rejects(
      () =>
        buildCuaDriverArtifactCandidate({
          ...wrongClosure.options,
          outputPath: join(wrongClosure.root, 'openneko-computer-use-0.19.2-darwin-arm64.tar.gz'),
        }),
      /package closure does not match/u,
    );
  });

  it('preserves an existing output when exclusive creation fails', async () => {
    const fixture = createFixture();
    const outputPath = join(fixture.root, 'openneko-computer-use-0.19.2-darwin-arm64.tar.gz');
    writeFileSync(outputPath, 'existing release candidate');

    await assert.rejects(
      () => buildCuaDriverArtifactCandidate({ ...fixture.options, outputPath }),
      /EEXIST/u,
    );
    assert.equal(readFileSync(outputPath, 'utf8'), 'existing release candidate');
  });
});

function createFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'openneko-cua-builder-test-'));
  const pluginRoot = join(root, 'plugin');
  mkdirSync(pluginRoot, { recursive: true });
  writeFileSync(
    join(pluginRoot, 'plugin.json'),
    JSON.stringify({
      name: 'computer-use',
      version: '0.19.2',
      extensions: { 'io.openneko': { mcpToolExposure: 'adapter-only' } },
    }),
  );
  writeFileSync(
    join(pluginRoot, 'mcp.json'),
    JSON.stringify({
      mcpServers: {
        'cua-driver': {
          type: 'stdio',
          command: './runtime/bin/cua-driver',
          args: ['mcp', '--direct'],
        },
      },
    }),
  );
  const licenseInventoryPath = join(root, 'licenses.spdx.json');
  writeFileSync(
    licenseInventoryPath,
    JSON.stringify(createLicenseInventory([packageEntry('SPDXRef-Package-cua')])),
  );
  const upstreamArchivePath = join(root, 'cua-driver-rs-0.19.2-darwin-arm64.tar.gz');
  const archive = createTarGzip([
    { path: 'cua-driver-rs-0.19.2-darwin-arm64/', content: '', type: '5' },
    {
      path: 'cua-driver-rs-0.19.2-darwin-arm64/cua-driver',
      content: 'driver',
      mode: 0o755,
    },
    {
      path: 'cua-driver-rs-0.19.2-darwin-arm64/cua-cursor-theme',
      content: 'cursor',
      mode: 0o755,
    },
    {
      path: 'cua-driver-rs-0.19.2-darwin-arm64/cua_driver_node_runtime.node',
      content: 'node-runtime',
    },
    {
      path: 'cua-driver-rs-0.19.2-darwin-arm64/libcua_driver_sdk.dylib',
      content: 'sdk',
    },
    {
      path: 'cua-driver-rs-0.19.2-darwin-arm64/CuaDriver.app/Contents/MacOS/cua-driver',
      content: 'app-driver',
      mode: 0o755,
    },
    ...(options.linkedEntry
      ? [
          {
            path: 'cua-driver-rs-0.19.2-darwin-arm64/linked-driver',
            content: '',
            type: '2',
          },
        ]
      : []),
  ]);
  writeFileSync(upstreamArchivePath, archive);
  chmodSync(upstreamArchivePath, 0o644);
  const artifact = {
    target: 'darwin-arm64',
    archive: 'tar.gz',
    name: 'cua-driver-rs-0.19.2-darwin-arm64.tar.gz',
    url: 'https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.19.2/cua-driver-rs-0.19.2-darwin-arm64.tar.gz',
    bytes: archive.byteLength,
    sha256: digest(archive),
  };
  const nodeRuntimeEvidence = {
    sourcePackage: 'uniffi-bindgen-react-native',
    sourceRelease: '0.31.0-3',
    runtimeSource: {
      sha256: 'sha256:916971c075e809d312453ca6fd4d0c4e35d1cf641ac1339e53f3de758ab81d1e',
    },
    firstPartyCargoLock: {
      path: 'scripts/release-inputs/cua-driver-node-runtime-0.19.2.Cargo.lock',
      sha256: 'sha256:31ad587c083cec15a6cc927e3e552a4833789342ef5a684b6fd1e863dd50402c',
      packages: 36,
    },
    rustToolchain: {
      release: '1.97.1',
      rustcCommit: '8bab26f4f',
      releaseDate: '2026-07-14',
    },
    sourceDateEpoch: 1786135742,
  };
  const inputs = {
    cuaDriver: {
      repository: 'https://github.com/trycua/cua',
      release: '0.19.2',
      sourceCommit: '20bb34b16ad7c6c56221c332e46b1875e9d8af8c',
      buildEvidence: {
        releaseWorkflow: {
          path: '.github/workflows/cd-rust-cua-driver.yml',
          sha256: digest(Buffer.from('workflow')),
          runId: 31217509888,
          runUrl: 'https://github.com/trycua/cua/actions/runs/31217509888',
          runLogsSha256: digest(Buffer.from('logs')),
        },
        rustWorkspace: {
          manifestPath: 'libs/cua-driver/rust/Cargo.toml',
          manifestSha256: digest(Buffer.from('manifest')),
          lockPath: 'libs/cua-driver/rust/Cargo.lock',
          lockSha256: digest(Buffer.from('lock')),
          rootPackages: ['cua-driver', 'cursor-theme-cli', 'cua-driver-sdk'],
          targets: ['aarch64-apple-darwin', 'x86_64-apple-darwin'],
        },
        nodeRuntime: nodeRuntimeEvidence,
        licenseClosure: {
          target: 'darwin-arm64',
          packages: 1,
          sha256: digest(Buffer.from(JSON.stringify(['cua-driver@0.19.2']))),
        },
      },
      platformArtifacts: [artifact],
    },
  };
  const nodeRuntimePath = join(root, 'cua_driver_node_runtime.node');
  writeFileSync(nodeRuntimePath, 'first-party-node-runtime');
  const nodeRuntimeReceiptPath = join(root, 'cua-node-runtime-receipt.json');
  const nodeRuntime = readFileSync(nodeRuntimePath);
  writeFileSync(
    nodeRuntimeReceiptPath,
    JSON.stringify({
      artifact: {
        name: 'cua_driver_node_runtime.node',
        bytes: nodeRuntime.byteLength,
        sha256: digest(nodeRuntime),
      },
      source: {
        package: nodeRuntimeEvidence.sourcePackage,
        release: nodeRuntimeEvidence.sourceRelease,
        sha256: nodeRuntimeEvidence.runtimeSource.sha256,
      },
      cargo: {
        lockPath: nodeRuntimeEvidence.firstPartyCargoLock.path,
        lockSha256: nodeRuntimeEvidence.firstPartyCargoLock.sha256,
        packages: nodeRuntimeEvidence.firstPartyCargoLock.packages,
      },
      rustToolchain: nodeRuntimeEvidence.rustToolchain,
      targets: ['aarch64-apple-darwin', 'x86_64-apple-darwin'],
      sourceDateEpoch: nodeRuntimeEvidence.sourceDateEpoch,
      pathRemap: '/openneko/cua-node-runtime',
      cargoHomeRemap: '/openneko/cargo-home',
      installName: '@rpath/cua_driver_node_runtime.node',
      buildJobs: 1,
      codegenUnits: 1,
      machOUuid: false,
      isolatedHome: true,
      recipeSha256: digest(readFileSync(CUA_NODE_REBUILDER_PATH)),
      independentBuilds: 2,
    }),
  );
  return {
    root,
    artifact,
    inputs,
    upstreamArchivePath,
    licenseInventoryPath,
    nodeRuntimePath,
    nodeRuntimeReceiptPath,
    options: {
      target: 'darwin-arm64',
      upstreamArchivePath,
      licenseInventoryPath,
      nodeRuntimePath,
      nodeRuntimeReceiptPath,
      pluginRoot,
      releaseInputs: inputs,
    },
  };
}

function createLicenseInventory(packages) {
  return {
    spdxVersion: 'SPDX-2.3',
    SPDXID: 'SPDXRef-DOCUMENT',
    documentDescribes: ['SPDXRef-Package-cua'],
    packages,
  };
}

function packageEntry(SPDXID) {
  return {
    SPDXID,
    name: 'cua-driver',
    versionInfo: '0.19.2',
    licenseDeclared: 'MIT',
  };
}

function createTarGzip(entries) {
  const blocks = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content);
    const header = Buffer.alloc(512);
    writeText(header, 0, 100, entry.path);
    writeOctal(header, 100, 8, entry.mode ?? (entry.type === '5' ? 0o755 : 0o644));
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, content.byteLength);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = (entry.type ?? '0').charCodeAt(0);
    writeText(header, 257, 6, 'ustar');
    writeText(header, 263, 2, '00');
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
    header[154] = 0;
    header[155] = 0x20;
    blocks.push(header, content);
    const padding = (512 - (content.byteLength % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 });
}

function readTarGzip(path) {
  const tar = gunzipSync(readFileSync(path));
  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= tar.byteLength) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = readText(header, 0, 100);
    const prefix = readText(header, 345, 155);
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const mode = Number.parseInt(readText(header, 100, 8).trim(), 8);
    const size = Number.parseInt(readText(header, 124, 12).trim(), 8);
    const content = Buffer.from(tar.subarray(offset + 512, offset + 512 + size));
    entries.set(entryPath, { mode, content });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function writeText(buffer, offset, length, value) {
  Buffer.from(value).copy(buffer, offset, 0, length);
}

function writeOctal(buffer, offset, length, value) {
  buffer.write(value.toString(8).padStart(length - 1, '0'), offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

function readText(buffer, offset, length) {
  return buffer
    .subarray(offset, offset + length)
    .toString('utf8')
    .replace(/\0.*$/u, '');
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
