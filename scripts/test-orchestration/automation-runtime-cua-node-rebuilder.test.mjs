import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  hashCuaNodeRuntimeSourceTree,
  rebuildCuaDriverNodeRuntime,
  rebuildReproducibleCuaDriverNodeRuntime,
} from '../automation-runtime-cua-node-rebuilder.mjs';
import { loadAutomationRuntimeReleaseInputs } from '../automation-runtime-release-inputs.mjs';

describe('Cua Driver first-party Node runtime rebuild', () => {
  it('uses locale-independent byte ordering for the pinned source tree', () => {
    const fixture = createFixture();
    const originalLocaleCompare = String.prototype.localeCompare;
    String.prototype.localeCompare = () => {
      throw new Error('source hashing must not use the host locale');
    };
    try {
      assert.equal(
        hashCuaNodeRuntimeSourceTree(fixture.sourceRoot).sha256,
        fixture.inputs.cuaDriver.buildEvidence.nodeRuntime.runtimeSource.sha256,
      );
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
  });

  it('uses the pinned lock, toolchain, targets and upstream patch boundaries', () => {
    const fixture = createFixture();
    const firstOutput = join(fixture.root, 'first', 'cua_driver_node_runtime.node');
    mkdirSync(dirname(firstOutput));

    const first = rebuildReproducibleCuaDriverNodeRuntime({
      ...fixture.options,
      outputPath: firstOutput,
    });

    assert.equal(first.independentBuilds, 2);
    assert.equal(first.cargo.packages, 36);
    assert.equal(first.source.release, '0.31.0-3');
    assert.deepEqual(first.targets, ['aarch64-apple-darwin', 'x86_64-apple-darwin']);
    assert.equal(first.pathRemap, '/openneko/cua-node-runtime');
    assert.equal(first.cargoHomeRemap, '/openneko/cargo-home');
    assert.equal(first.installName, '@rpath/cua_driver_node_runtime.node');
    assert.equal(first.buildJobs, 1);
    assert.equal(first.codegenUnits, 1);
    assert.equal(first.machOUuid, false);
    assert.equal(first.isolatedHome, true);
    assert.equal(fixture.commands.filter((command) => command.args.includes('build')).length, 4);
    for (const command of fixture.commands.filter((entry) => entry.args.includes('build'))) {
      assert.ok(command.args.includes('--locked'));
      assert.equal(command.env.SOURCE_DATE_EPOCH, '1786135742');
      assert.equal(command.env.CARGO_INCREMENTAL, '0');
      assert.equal(command.env.CARGO_BUILD_JOBS, '1');
      assert.equal(command.env.CARGO_PROFILE_RELEASE_CODEGEN_UNITS, '1');
      assert.equal(command.env.ZERO_AR_DATE, '1');
      assert.equal(command.env.LC_ALL, 'C');
      assert.match(command.env.HOME, /openneko-cua-node-runtime-build\/home$/u);
      assert.notEqual(command.env.HOME, process.env.HOME);
      assert.match(
        command.env.RUSTFLAGS,
        /^--remap-path-prefix=.*=\/openneko\/cua-node-runtime --remap-path-prefix=.*=\/openneko\/cargo-home -C link-arg=-Wl,-install_name,@rpath\/cua_driver_node_runtime\.node -C link-arg=-Wl,-no_uuid$/u,
      );
      assert.equal(command.env.CARGO_ENCODED_RUSTFLAGS, undefined);
      assert.equal(command.env.RUSTC_WRAPPER, undefined);
    }
  });

  it('rejects nondeterministic independent builds without publishing output', () => {
    const fixture = createFixture({ nondeterministicLipo: true });
    assert.throws(
      () => rebuildReproducibleCuaDriverNodeRuntime(fixture.options),
      /independent builds are not reproducible/u,
    );
    assert.throws(() => readFileSync(fixture.outputPath), /ENOENT/u);
  });

  it('rejects source changes and symbolic links before invoking the toolchain', () => {
    const modified = createFixture();
    writeFileSync(join(modified.sourceRoot, 'runtimes', 'core', 'src', 'lib.rs'), 'modified');
    assert.throws(
      () => rebuildCuaDriverNodeRuntime(modified.options),
      /source tree does not match/u,
    );
    assert.equal(modified.commands.length, 0);

    const linked = createFixture();
    symlinkSync('lib.rs', join(linked.sourceRoot, 'runtimes', 'core', 'src', 'linked.rs'));
    assert.throws(() => rebuildCuaDriverNodeRuntime(linked.options), /contains a symbolic link/u);
    assert.equal(linked.commands.length, 0);
  });

  it('rejects poisoned locks, release-log drift and upstream patch drift', () => {
    const poisonedLock = createFixture();
    const lockPath = join(poisonedLock.root, 'poisoned.Cargo.lock');
    writeFileSync(lockPath, `${readFileSync(poisonedLock.options.lockPath, 'utf8')}\n# poison\n`);
    assert.throws(
      () => rebuildCuaDriverNodeRuntime({ ...poisonedLock.options, lockPath }),
      /Cargo lock digest is invalid/u,
    );

    const closureDrift = createFixture();
    closureDrift.inputs.cuaDriver.buildEvidence.nodeRuntime.compiledPackages.find(
      (entry) => entry.name === 'cc',
    ).release = '1.4.2';
    assert.throws(
      () => rebuildCuaDriverNodeRuntime(closureDrift.options),
      /does not match the release-log closure/u,
    );

    const patchDrift = createFixture();
    const registerPath = join(
      patchDrift.sourceRoot,
      'runtimes',
      'napi',
      'src',
      'register',
      'mod.rs',
    );
    writeFileSync(
      registerPath,
      readFileSync(registerPath, 'utf8').replace('alloc_module', 'changed'),
    );
    refreshFixtureSourceEvidence(patchDrift);
    assert.throws(
      () => rebuildCuaDriverNodeRuntime(patchDrift.options),
      /allocation patch boundary changed/u,
    );
  });

  it('rejects a different Rust toolchain and preserves an existing output', () => {
    const toolchainDrift = createFixture({ rustcOutput: 'rustc 1.98.0 (different 2026-08-01)' });
    assert.throws(
      () => rebuildCuaDriverNodeRuntime(toolchainDrift.options),
      /Rust toolchain mismatch/u,
    );

    const existing = createFixture();
    writeFileSync(existing.outputPath, 'existing output');
    assert.throws(() => rebuildCuaDriverNodeRuntime(existing.options), /EEXIST/u);
    assert.equal(readFileSync(existing.outputPath, 'utf8'), 'existing output');

    const missingToolchain = createFixture();
    assert.throws(
      () =>
        rebuildCuaDriverNodeRuntime({
          ...missingToolchain.options,
          runner: () => ({ error: new Error('spawnSync rustup ENOENT') }),
        }),
      /pinned Rust toolchain check failed to start/u,
    );
  });
});

function createFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'openneko-cua-node-rebuilder-test-'));
  const sourceRoot = join(root, 'source');
  writeFixtureSource(sourceRoot);
  const inputs = structuredClone(loadAutomationRuntimeReleaseInputs());
  const fixture = {
    root,
    sourceRoot,
    inputs,
    commands: [],
    outputPath: join(root, 'cua_driver_node_runtime.node'),
  };
  refreshFixtureSourceEvidence(fixture);
  const runner = createFakeRunner(
    fixture,
    options.rustcOutput ?? 'rustc 1.97.1 (8bab26f4f 2026-07-14)',
    options.nondeterministicLipo ?? false,
  );
  fixture.options = {
    sourceRoot,
    outputPath: fixture.outputPath,
    lockPath: join(
      process.cwd(),
      inputs.cuaDriver.buildEvidence.nodeRuntime.firstPartyCargoLock.path,
    ),
    releaseInputs: inputs,
    runner,
  };
  return fixture;
}

function refreshFixtureSourceEvidence(fixture) {
  const evidence = fixture.inputs.cuaDriver.buildEvidence.nodeRuntime.runtimeSource;
  const tree = hashCuaNodeRuntimeSourceTree(fixture.sourceRoot);
  evidence.files = tree.files;
  evidence.sha256 = tree.sha256;
  evidence.packageJsonSha256 = digestFile(join(fixture.sourceRoot, 'package.json'));
  evidence.licenseSha256 = digestFile(join(fixture.sourceRoot, 'LICENSE'));
  evidence.coreManifestSha256 = digestFile(
    join(fixture.sourceRoot, 'runtimes', 'core', 'Cargo.toml'),
  );
  evidence.napiManifestSha256 = digestFile(
    join(fixture.sourceRoot, 'runtimes', 'napi', 'Cargo.toml'),
  );
}

function writeFixtureSource(root) {
  write(
    root,
    'package.json',
    JSON.stringify({ name: 'uniffi-bindgen-react-native', version: '0.31.0-3' }),
  );
  write(root, 'LICENSE', 'MPL-2.0');
  write(root, 'runtimes/core/Cargo.toml', '[package]\nname = "uniffi-runtime-core"\n');
  write(root, 'runtimes/core/src/lib.rs', 'pub fn core() {}\n');
  write(root, 'runtimes/napi/Cargo.toml', '[package]\nname = "uniffi-runtime-napi"\n');
  write(
    root,
    'runtimes/napi/src/register/mod.rs',
    `fn register() {
    let alloc_module = Arc::clone(&module);
    let alloc_fn = old_alloc();
    result.set_named_property("rustbuffer_alloc", alloc_fn)?;
    let free_module = Arc::clone(&module);
    let free_fn = old_free();
    result.set_named_property("rustbuffer_free", free_fn)?;
}
`,
  );
  write(
    root,
    'runtimes/napi/src/call/mod.rs',
    `rust_buffer_to_js_uint8array_handoff(env, *rb, capacity_symbol)
fn rust_buffer_to_js_uint8array_handoff(
    env: &napi::Env,
    rb: RustBufferC,
    capacity_symbol: &CapacitySymbol,
) {
    // Empty RustBuffer (capacity == 0 or null data): no allocation to alias,
    old_body();
    Ok(unsafe { JsUnknown::from_raw(raw_env, typedarray)? })
}
`,
  );
}

function createFakeRunner(fixture, rustcOutput, nondeterministicLipo) {
  return (command) => {
    fixture.commands.push(command);
    if (command.args.includes('rustc')) {
      return { status: 0, stdout: `${rustcOutput}\n`, stderr: '' };
    }
    if (command.args.includes('build')) {
      const manifestIndex = command.args.indexOf('--manifest-path');
      const targetIndex = command.args.indexOf('--target');
      const manifestPath = command.args[manifestIndex + 1];
      const target = command.args[targetIndex + 1];
      assert.equal(basename(manifestPath), 'Cargo.toml');
      assert.ok(readFileSync(join(dirname(manifestPath), 'Cargo.lock'), 'utf8').includes('cc'));
      assert.doesNotMatch(
        readFileSync(join(dirname(manifestPath), 'src', 'register', 'mod.rs'), 'utf8'),
        /alloc_module/u,
      );
      const built = join(dirname(manifestPath), 'target', target, 'release');
      mkdirSync(built, { recursive: true });
      writeFileSync(join(built, 'libuniffi_runtime_napi.dylib'), `runtime:${target}`);
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command.command === 'lipo') {
      const outputIndex = command.args.indexOf('-output');
      const output = command.args[outputIndex + 1];
      const inputs = command.args.slice(1, outputIndex);
      const suffix = nondeterministicLipo
        ? Buffer.from(
            `:${String(fixture.commands.filter((entry) => entry.command === 'lipo').length)}`,
          )
        : Buffer.alloc(0);
      writeFileSync(output, Buffer.concat([...inputs.map((path) => readFileSync(path)), suffix]));
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`Unexpected fake command: ${command.command} ${command.args.join(' ')}`);
  };
}

function write(root, path, value) {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, value);
}

function digestFile(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}
