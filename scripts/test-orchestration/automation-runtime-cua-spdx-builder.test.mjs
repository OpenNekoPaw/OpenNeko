import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { buildCuaDriverSpdxCandidate } from '../automation-runtime-cua-spdx-builder.mjs';
import { hashCuaNodeRuntimeSourceTree } from '../automation-runtime-cua-node-rebuilder.mjs';
import { loadAutomationRuntimeReleaseInputs } from '../automation-runtime-release-inputs.mjs';

describe('Cua Driver locked SPDX candidate builder', () => {
  it('produces a deterministic unreviewed production-only inventory', () => {
    const fixture = createFixture();
    const first = join(
      fixture.root,
      'first',
      'openneko-computer-use-0.19.2-darwin-arm64.spdx.json',
    );
    const second = join(
      fixture.root,
      'second',
      'openneko-computer-use-0.19.2-darwin-arm64.spdx.json',
    );
    const firstReceipt = buildCuaDriverSpdxCandidate({ ...fixture.options, outputPath: first });
    const secondReceipt = buildCuaDriverSpdxCandidate({ ...fixture.options, outputPath: second });

    assert.deepEqual(readFileSync(first), readFileSync(second));
    assert.deepEqual(firstReceipt, secondReceipt);
    assert.equal(firstReceipt.reviewed, false);
    assert.equal(firstReceipt.isolatedHome, true);
    assert.equal(firstReceipt.offlineMetadata, true);
    assert.equal(firstReceipt.packages, 6);

    const document = JSON.parse(readFileSync(first, 'utf8'));
    assert.match(document.documentComment, /UNREVIEWED CANDIDATE/u);
    assert.equal(document.creationInfo.created, '2026-08-07T20:49:02.000Z');
    assert.equal(
      document.packages.some((entry) => entry.name === 'cua-driver-testkit'),
      false,
    );
    assert.equal(
      document.packages.find((entry) => entry.name === 'serde').licenseDeclared,
      'MIT OR Apache-2.0',
    );
    assert.equal(
      document.packages.find((entry) => entry.name === 'uniffi-runtime-napi').licenseDeclared,
      'MPL-2.0',
    );
    assert.deepEqual(document.packages.find((entry) => entry.name === 'serde').checksums, [
      { algorithm: 'SHA256', checksumValue: '1'.repeat(64) },
    ]);
    for (const command of fixture.commands) {
      assert.equal(command.env.CARGO_NET_OFFLINE, 'true');
      assert.notEqual(command.env.HOME, process.env.HOME);
      assert.match(command.env.HOME, /openneko-cua-spdx-.*\/home$/u);
      if (command.args.includes('metadata')) {
        assert.ok(command.args.includes('--locked'));
        assert.ok(command.args.includes('--offline'));
        assert.ok(command.args.includes('--filter-platform'));
        assert.ok(command.args.includes('aarch64-apple-darwin'));
      }
    }
  });

  it('rejects source, license, registry and closure drift before publication', () => {
    const modified = createFixture();
    writeFileSync(join(modified.cuaSourceRoot, 'LICENSE.md'), 'modified');
    assert.throws(() => buildCuaDriverSpdxCandidate(modified.options), /root license digest/u);

    const missingLicense = createFixture({ serdeLicense: undefined });
    assert.throws(
      () => buildCuaDriverSpdxCandidate(missingLicense.options),
      /serde@1\.0\.0.*no declared license/u,
    );

    const unknownRegistry = createFixture({ serdeSource: 'git+https://example.invalid/serde' });
    assert.throws(
      () => buildCuaDriverSpdxCandidate(unknownRegistry.options),
      /uses an unreviewed source/u,
    );

    const wrongClosure = createFixture();
    wrongClosure.inputs.cuaDriver.buildEvidence.licenseClosure.packages = 7;
    assert.throws(
      () => buildCuaDriverSpdxCandidate(wrongClosure.options),
      /does not match the locked package closure/u,
    );
  });

  it('preserves an existing output and rejects a different Rust toolchain', () => {
    const existing = createFixture();
    writeFileSync(existing.outputPath, 'existing inventory');
    assert.throws(() => buildCuaDriverSpdxCandidate(existing.options), /EEXIST/u);
    assert.equal(readFileSync(existing.outputPath, 'utf8'), 'existing inventory');

    const toolchain = createFixture({ rustcOutput: 'rustc 1.98.0 (different 2026-08-01)' });
    assert.throws(() => buildCuaDriverSpdxCandidate(toolchain.options), /Rust toolchain mismatch/u);
  });
});

function createFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'openneko-cua-spdx-builder-test-'));
  const cuaSourceRoot = join(root, 'cua');
  const ubrnSourceRoot = join(root, 'ubrn');
  const nodeLockPath = join(root, 'node.Cargo.lock');
  writeCuaSource(cuaSourceRoot);
  writeUbrnSource(ubrnSourceRoot);
  writeFileSync(nodeLockPath, cargoLock(['uniffi-runtime-napi', 'uniffi-runtime-core', 'serde']));

  const inputs = structuredClone(loadAutomationRuntimeReleaseInputs());
  const cuaEvidence = inputs.cuaDriver.buildEvidence;
  cuaEvidence.releaseWorkflow.sha256 = digestFile(
    join(cuaSourceRoot, cuaEvidence.releaseWorkflow.path),
  );
  cuaEvidence.rustWorkspace.manifestSha256 = digestFile(
    join(cuaSourceRoot, cuaEvidence.rustWorkspace.manifestPath),
  );
  cuaEvidence.rustWorkspace.lockSha256 = digestFile(
    join(cuaSourceRoot, cuaEvidence.rustWorkspace.lockPath),
  );
  inputs.cuaDriver.license.sha256 = digestFile(join(cuaSourceRoot, inputs.cuaDriver.license.path));
  refreshUbrnEvidence(inputs, ubrnSourceRoot, nodeLockPath);

  const metadataOptions = {
    serdeLicense: Object.hasOwn(overrides, 'serdeLicense')
      ? overrides.serdeLicense
      : 'MIT/Apache-2.0',
    serdeSource: overrides.serdeSource ?? 'registry+https://github.com/rust-lang/crates.io-index',
  };
  const identities = [
    'cua-driver@0.19.2',
    'cua-driver-sdk@0.19.2',
    'cursor-theme-cli@0.19.2',
    'serde@1.0.0',
    'uniffi-runtime-core@0.1.0',
    'uniffi-runtime-napi@0.1.0',
  ].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  cuaEvidence.licenseClosure = {
    target: 'darwin-arm64',
    packages: identities.length,
    sha256: digest(Buffer.from(JSON.stringify(identities))),
  };

  const commands = [];
  const runner = (command) => {
    commands.push(command);
    if (command.args.includes('rustc')) {
      return {
        status: 0,
        stdout: `${overrides.rustcOutput ?? 'rustc 1.97.1 (8bab26f4f 2026-07-14)'}\n`,
        stderr: '',
      };
    }
    const manifestPath = command.args[command.args.indexOf('--manifest-path') + 1];
    const metadata = manifestPath.includes('/libs/cua-driver/rust/')
      ? mainMetadata(cuaSourceRoot, metadataOptions)
      : nodeMetadata(dirname(dirname(manifestPath)), metadataOptions);
    return { status: 0, stdout: JSON.stringify(metadata), stderr: '' };
  };
  const outputPath = join(root, 'openneko-computer-use-0.19.2-darwin-arm64.spdx.json');
  return {
    root,
    cuaSourceRoot,
    ubrnSourceRoot,
    nodeLockPath,
    inputs,
    commands,
    outputPath,
    options: {
      target: 'darwin-arm64',
      cuaSourceRoot,
      ubrnSourceRoot,
      nodeLockPath,
      outputPath,
      releaseInputs: inputs,
      runner,
    },
  };
}

function writeCuaSource(root) {
  write(root, 'LICENSE.md', 'MIT\n');
  write(root, '.github/workflows/cd-rust-cua-driver.yml', 'release workflow\n');
  write(root, 'libs/cua-driver/rust/Cargo.toml', '[workspace]\n');
  write(
    root,
    'libs/cua-driver/rust/Cargo.lock',
    cargoLock(['cua-driver', 'cursor-theme-cli', 'cua-driver-sdk', 'cua-driver-testkit', 'serde']),
  );
  for (const name of ['cua-driver', 'cursor-theme-cli', 'cua-driver-sdk', 'cua-driver-testkit']) {
    write(root, `libs/cua-driver/rust/${name}/Cargo.toml`, `[package]\nname = "${name}"\n`);
  }
}

function writeUbrnSource(root) {
  write(
    root,
    'package.json',
    JSON.stringify({ name: 'uniffi-bindgen-react-native', version: '0.31.0-3' }),
  );
  write(root, 'LICENSE', 'MPL-2.0\n');
  write(root, 'runtimes/core/Cargo.toml', '[package]\nname = "uniffi-runtime-core"\n');
  write(root, 'runtimes/core/src/lib.rs', 'pub fn core() {}\n');
  write(root, 'runtimes/napi/Cargo.toml', '[package]\nname = "uniffi-runtime-napi"\n');
  write(root, 'runtimes/napi/src/lib.rs', 'pub fn napi() {}\n');
}

function refreshUbrnEvidence(inputs, sourceRoot, lockPath) {
  const evidence = inputs.cuaDriver.buildEvidence.nodeRuntime;
  const sourceTree = hashCuaNodeRuntimeSourceTree(sourceRoot);
  evidence.runtimeSource.files = sourceTree.files;
  evidence.runtimeSource.sha256 = sourceTree.sha256;
  evidence.runtimeSource.packageJsonSha256 = digestFile(join(sourceRoot, 'package.json'));
  evidence.runtimeSource.licenseSha256 = digestFile(join(sourceRoot, 'LICENSE'));
  evidence.runtimeSource.coreManifestSha256 = digestFile(
    join(sourceRoot, 'runtimes/core/Cargo.toml'),
  );
  evidence.runtimeSource.napiManifestSha256 = digestFile(
    join(sourceRoot, 'runtimes/napi/Cargo.toml'),
  );
  evidence.firstPartyCargoLock.sha256 = digestFile(lockPath);
  evidence.firstPartyCargoLock.packages = 3;
}

function mainMetadata(root, options) {
  const workspaceRoot = join(root, 'libs/cua-driver/rust');
  const packageNames = ['cua-driver', 'cursor-theme-cli', 'cua-driver-sdk', 'cua-driver-testkit'];
  const packages = packageNames.map((name) => workspacePackage(workspaceRoot, name, '0.19.2'));
  packages.push(registryPackage(options));
  return metadata(
    packages,
    packageNames.map((name) => name),
    [
      node('cua-driver', [dependency('serde'), dependency('cua-driver-testkit', 'dev')]),
      node('cursor-theme-cli', [dependency('serde')]),
      node('cua-driver-sdk', [dependency('serde')]),
      node('cua-driver-testkit', []),
      node('serde', []),
    ],
  );
}

function nodeMetadata(root, options) {
  return metadata(
    [
      workspacePackage(root, 'uniffi-runtime-napi', '0.1.0', 'napi'),
      workspacePackage(root, 'uniffi-runtime-core', '0.1.0', 'core', 'MPL-2.0'),
      registryPackage(options),
    ],
    ['uniffi-runtime-napi', 'uniffi-runtime-core'],
    [
      node('uniffi-runtime-napi', [dependency('uniffi-runtime-core'), dependency('serde')]),
      node('uniffi-runtime-core', []),
      node('serde', []),
    ],
  );
}

function metadata(packages, workspaceMembers, nodes) {
  return {
    packages,
    workspace_members: workspaceMembers,
    resolve: { nodes },
  };
}

function workspacePackage(root, name, version, directory = name, license = null) {
  return {
    id: name,
    name,
    version,
    source: null,
    license,
    manifest_path: join(root, directory, 'Cargo.toml'),
  };
}

function registryPackage(options) {
  return {
    id: 'serde',
    name: 'serde',
    version: '1.0.0',
    source: options.serdeSource,
    license: options.serdeLicense,
    manifest_path: '/cargo/registry/serde/Cargo.toml',
  };
}

function node(id, dependencies) {
  return { id, deps: dependencies };
}

function dependency(pkg, kind = null) {
  return { pkg, dep_kinds: [{ kind }] };
}

function cargoLock(names) {
  return `${names
    .map((name) => {
      const registry = name === 'serde';
      const version = name.startsWith('uniffi-') ? '0.1.0' : name === 'serde' ? '1.0.0' : '0.19.2';
      return `[[package]]\nname = "${name}"\nversion = "${version}"${
        registry
          ? `\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "${'1'.repeat(64)}"`
          : ''
      }\n`;
    })
    .join('\n')}`;
}

function write(root, path, value) {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, value);
}

function digestFile(path) {
  return digest(readFileSync(path));
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
