import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  constants,
  copyFileSync,
  cpSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAutomationRuntimeCargoLock } from './automation-runtime-cargo-lock.mjs';
import { loadAutomationRuntimeReleaseInputs } from './automation-runtime-release-inputs.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECIPE_PATH = fileURLToPath(import.meta.url);
const OUTPUT_NAME = 'cua_driver_node_runtime.node';
const CANONICAL_BUILD_ROOT = '/openneko/cua-node-runtime';
const CANONICAL_CARGO_HOME = '/openneko/cargo-home';
const MACH_O_INSTALL_NAME = '@rpath/cua_driver_node_runtime.node';
const LOCAL_BUILD_ROOT = '/tmp/openneko-cua-node-runtime-build';
const TARGETS = Object.freeze(['aarch64-apple-darwin', 'x86_64-apple-darwin']);
const NON_DARWIN_LOCK_PACKAGES = new Set([
  'libloading@0.8.9',
  'winapi@0.3.9',
  'winapi-i686-pc-windows-gnu@0.4.0',
  'winapi-x86_64-pc-windows-gnu@0.4.0',
  'windows-link@0.2.1',
]);

export function rebuildReproducibleCuaDriverNodeRuntime(options) {
  const outputPath = resolve(options.outputPath);
  const verificationRoot = mkdtempSync(join(tmpdir(), 'openneko-cua-node-reproducibility-'));
  try {
    const firstOutput = join(verificationRoot, 'first', OUTPUT_NAME);
    const secondOutput = join(verificationRoot, 'second', OUTPUT_NAME);
    mkdirSync(dirname(firstOutput));
    mkdirSync(dirname(secondOutput));
    const first = rebuildCuaDriverNodeRuntime({ ...options, outputPath: firstOutput });
    const second = rebuildCuaDriverNodeRuntime({ ...options, outputPath: secondOutput });
    const firstBytes = readFileSync(firstOutput);
    const secondBytes = readFileSync(secondOutput);
    if (!firstBytes.equals(secondBytes) || JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error('Cua Driver Node runtime independent builds are not reproducible.');
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(firstOutput, outputPath, constants.COPYFILE_EXCL);
    return Object.freeze({ ...first, independentBuilds: 2 });
  } finally {
    rmSync(verificationRoot, { recursive: true, force: true });
  }
}

export function rebuildCuaDriverNodeRuntime(options) {
  const inputs = options.releaseInputs ?? loadAutomationRuntimeReleaseInputs();
  const evidence = inputs.cuaDriver.buildEvidence.nodeRuntime;
  const sourceRoot = realpathSync(options.sourceRoot);
  const outputPath = resolve(options.outputPath);
  if (basename(outputPath) !== OUTPUT_NAME) {
    throw new Error(`Cua Driver Node runtime output must be named '${OUTPUT_NAME}'.`);
  }
  assertCuaNodeRuntimeSourceRoot(sourceRoot, evidence);
  const lockPath = realpathSync(
    options.lockPath ?? join(REPOSITORY_ROOT, evidence.firstPartyCargoLock.path),
  );
  assertFirstPartyLock(lockPath, evidence);
  const runner = options.runner ?? runCommand;
  mkdirSync(LOCAL_BUILD_ROOT, { mode: 0o700 });
  try {
    mkdirSync(join(LOCAL_BUILD_ROOT, 'home'), { mode: 0o700 });
    const runtimeRoot = join(LOCAL_BUILD_ROOT, 'runtime');
    cpSync(join(sourceRoot, 'runtimes', 'core'), join(runtimeRoot, 'core'), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    cpSync(join(sourceRoot, 'runtimes', 'napi'), join(runtimeRoot, 'napi'), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    copyFileSync(lockPath, join(runtimeRoot, 'napi', 'Cargo.lock'), constants.COPYFILE_EXCL);
    patchRuntimeSources(runtimeRoot);
    const buildEnvironment = createBuildEnvironment(LOCAL_BUILD_ROOT, evidence.sourceDateEpoch);
    assertPinnedToolchain(runner, evidence.rustToolchain, LOCAL_BUILD_ROOT, buildEnvironment);
    for (const target of TARGETS) {
      assertCommand(
        runner({
          command: 'rustup',
          args: [
            'run',
            evidence.rustToolchain.release,
            'cargo',
            'build',
            '--locked',
            '--release',
            '--manifest-path',
            join(runtimeRoot, 'napi', 'Cargo.toml'),
            '--target',
            target,
          ],
          cwd: LOCAL_BUILD_ROOT,
          env: buildEnvironment,
        }),
        `locked Cua Driver Node runtime build for ${target}`,
      );
    }
    const universalPath = join(LOCAL_BUILD_ROOT, OUTPUT_NAME);
    assertCommand(
      runner({
        command: 'lipo',
        args: [
          '-create',
          ...TARGETS.map((target) =>
            join(runtimeRoot, 'napi', 'target', target, 'release', 'libuniffi_runtime_napi.dylib'),
          ),
          '-output',
          universalPath,
        ],
        cwd: LOCAL_BUILD_ROOT,
        env: buildEnvironment,
      }),
      'Cua Driver universal Node runtime assembly',
    );
    const universal = statSync(universalPath);
    if (!universal.isFile() || universal.size === 0) {
      throw new Error('Cua Driver universal Node runtime build produced no regular payload.');
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(universalPath, outputPath, constants.COPYFILE_EXCL);
  } finally {
    rmSync(LOCAL_BUILD_ROOT, { recursive: true, force: true });
  }
  const artifact = hashFile(outputPath);
  return Object.freeze({
    artifact: Object.freeze({ name: OUTPUT_NAME, bytes: artifact.bytes, sha256: artifact.sha256 }),
    source: Object.freeze({
      package: evidence.sourcePackage,
      release: evidence.sourceRelease,
      sha256: evidence.runtimeSource.sha256,
    }),
    cargo: Object.freeze({
      lockPath: evidence.firstPartyCargoLock.path,
      lockSha256: evidence.firstPartyCargoLock.sha256,
      packages: evidence.firstPartyCargoLock.packages,
    }),
    rustToolchain: Object.freeze({ ...evidence.rustToolchain }),
    targets: TARGETS,
    sourceDateEpoch: evidence.sourceDateEpoch,
    pathRemap: CANONICAL_BUILD_ROOT,
    cargoHomeRemap: CANONICAL_CARGO_HOME,
    installName: MACH_O_INSTALL_NAME,
    buildJobs: 1,
    codegenUnits: 1,
    machOUuid: false,
    isolatedHome: true,
    recipeSha256: sha256File(RECIPE_PATH),
  });
}

function createBuildEnvironment(localBuildRoot, reproducibleTimestamp) {
  const inherited = {};
  for (const name of [
    'PATH',
    'CARGO_HOME',
    'RUSTUP_HOME',
    'TMPDIR',
    'DEVELOPER_DIR',
    'SDKROOT',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
  ]) {
    const value = process.env[name];
    if (value) inherited[name] = value;
  }
  const cargoHome = inherited.CARGO_HOME ?? join(localBuildRoot, 'home', '.cargo');
  return Object.freeze({
    ...inherited,
    HOME: join(localBuildRoot, 'home'),
    SOURCE_DATE_EPOCH: String(reproducibleTimestamp),
    CARGO_INCREMENTAL: '0',
    CARGO_BUILD_JOBS: '1',
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS: '1',
    ZERO_AR_DATE: '1',
    LC_ALL: 'C',
    LANG: 'C',
    RUSTFLAGS: [
      `--remap-path-prefix=${localBuildRoot}=${CANONICAL_BUILD_ROOT}`,
      `--remap-path-prefix=${cargoHome}=${CANONICAL_CARGO_HOME}`,
      `-C link-arg=-Wl,-install_name,${MACH_O_INSTALL_NAME}`,
      '-C link-arg=-Wl,-no_uuid',
    ].join(' '),
  });
}

export function hashCuaNodeRuntimeSourceTree(sourceRoot) {
  const root = realpathSync(sourceRoot);
  const runtimeRoot = join(root, 'runtimes');
  const files = [];
  collectRegularFiles(runtimeRoot, files);
  files.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const digest = createHash('sha256');
  for (const path of files) {
    const relativePath = relative(root, path).split(sep).join('/');
    const value = readFileSync(path);
    digest.update(relativePath);
    digest.update('\0');
    digest.update((statSync(path).mode & 0o111) !== 0 ? '755' : '644');
    digest.update('\0');
    digest.update(String(value.byteLength));
    digest.update('\0');
    digest.update(value);
  }
  return Object.freeze({ files: files.length, sha256: `sha256:${digest.digest('hex')}` });
}

export function assertCuaNodeRuntimeSourceRoot(sourceRoot, evidence) {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  if (manifest.name !== evidence.sourcePackage || manifest.version !== evidence.sourceRelease) {
    throw new Error(
      'Cua Driver Node runtime source package identity does not match the input lock.',
    );
  }
  const sourceTree = hashCuaNodeRuntimeSourceTree(sourceRoot);
  if (
    sourceTree.files !== evidence.runtimeSource.files ||
    sourceTree.sha256 !== evidence.runtimeSource.sha256
  ) {
    throw new Error('Cua Driver Node runtime source tree does not match the pinned npm payload.');
  }
  for (const [path, expected] of [
    ['package.json', evidence.runtimeSource.packageJsonSha256],
    ['LICENSE', evidence.runtimeSource.licenseSha256],
    ['runtimes/core/Cargo.toml', evidence.runtimeSource.coreManifestSha256],
    ['runtimes/napi/Cargo.toml', evidence.runtimeSource.napiManifestSha256],
  ]) {
    if (sha256File(join(sourceRoot, path)) !== expected) {
      throw new Error(`Cua Driver Node runtime source '${path}' does not match the input lock.`);
    }
  }
}

function assertFirstPartyLock(lockPath, evidence) {
  if (sha256File(lockPath) !== evidence.firstPartyCargoLock.sha256) {
    throw new Error('Cua Driver Node runtime first-party Cargo lock digest is invalid.');
  }
  const packages = parseAutomationRuntimeCargoLock(
    readFileSync(lockPath, 'utf8'),
    'Cua Driver Node runtime first-party',
  );
  if (packages.length !== evidence.firstPartyCargoLock.packages) {
    throw new Error('Cua Driver Node runtime first-party Cargo lock package count is invalid.');
  }
  const darwinPackages = packages
    .map(({ name, release }) => `${name}@${release}`)
    .filter((identity) => !NON_DARWIN_LOCK_PACKAGES.has(identity))
    .sort();
  const releaseLogPackages = evidence.compiledPackages
    .map(({ name, release }) => `${name}@${release}`)
    .sort();
  if (JSON.stringify(darwinPackages) !== JSON.stringify(releaseLogPackages)) {
    throw new Error('Cua Driver Node runtime Cargo lock does not match the release-log closure.');
  }
}

function collectRegularFiles(directory, files) {
  const stats = lstatSync(directory);
  if (stats.isSymbolicLink()) {
    throw new Error('Cua Driver Node runtime source tree contains a symbolic link.');
  }
  if (!stats.isDirectory())
    throw new Error('Cua Driver Node runtime source tree is not a directory.');
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const child = lstatSync(path);
    if (child.isSymbolicLink()) {
      throw new Error('Cua Driver Node runtime source tree contains a symbolic link.');
    }
    if (child.isDirectory()) collectRegularFiles(path, files);
    else if (child.isFile()) files.push(path);
    else throw new Error('Cua Driver Node runtime source tree contains an unsupported file type.');
  }
}

function patchRuntimeSources(runtimeRoot) {
  const registerPath = join(runtimeRoot, 'napi', 'src', 'register', 'mod.rs');
  writeFileSync(registerPath, patchRegister(readFileSync(registerPath, 'utf8')));
  const callPath = join(runtimeRoot, 'napi', 'src', 'call', 'mod.rs');
  writeFileSync(callPath, patchCall(readFileSync(callPath, 'utf8')));
}

function replaceOnce(source, needle, replacement, description) {
  const matches = source.split(needle).length - 1;
  if (matches !== 1) throw new Error(`Expected one UBRN ${description}, found ${matches}.`);
  return source.replace(needle, replacement);
}

function patchRegister(source) {
  const allocationStart = source.indexOf(
    '    let alloc_module = Arc::clone(&module);\n    let alloc_fn =',
  );
  const allocationEndNeedle = '    result.set_named_property("rustbuffer_alloc", alloc_fn)?;';
  const allocationEnd = source.indexOf(allocationEndNeedle, allocationStart);
  if (allocationStart < 0 || allocationEnd < 0) {
    throw new Error('UBRN allocation patch boundary changed.');
  }
  source = `${source.slice(0, allocationStart)}    let alloc_fn = env.create_function_from_closure("rustbuffer_alloc", move |ctx| {
        let size_arg: i32 = ctx.get(0)?;
        if size_arg < 0 {
            return Err(napi::Error::from_reason(
                "rustbuffer_alloc size must be non-negative".to_string(),
            ));
        }
        let len = usize::try_from(size_arg).map_err(|_| {
            napi::Error::from_reason("RustBuffer size exceeds addressable memory".to_string())
        })?;
        let typedarray = unsafe {
            napi_utils::create_uint8array(ctx.env.raw(), std::ptr::null(), len)?
        };
        unsafe { JsUnknown::from_raw(ctx.env.raw(), typedarray) }
    })?;
${source.slice(allocationEnd)}`;
  const freeStart = source.indexOf('    let free_module = Arc::clone(&module);');
  const freeEndNeedle = '    result.set_named_property("rustbuffer_free", free_fn)?;';
  const freeEnd = source.indexOf(freeEndNeedle, freeStart);
  if (freeStart < 0 || freeEnd < 0) throw new Error('UBRN free patch boundary changed.');
  return `${source.slice(0, freeStart)}    let free_fn = env.create_function_from_closure("rustbuffer_free", move |ctx| {
        // Copy-mode buffers are JavaScript-owned. RustBuffer arguments are
        // separately allocated by rustbuffer_from_bytes inside call dispatch.
        ctx.env.get_undefined().map(|u| u.into_unknown())
    })?;
${source.slice(freeEnd)}`;
}

function patchCall(source) {
  source = replaceOnce(
    source,
    'rust_buffer_to_js_uint8array_handoff(env, *rb, capacity_symbol)',
    'rust_buffer_to_js_uint8array_copy(env, *rb, module.rb_ops().free_ptr)',
    'RustBuffer return dispatch',
  );
  source = replaceOnce(
    source,
    'fn rust_buffer_to_js_uint8array_handoff(\n    env: &napi::Env,\n    rb: RustBufferC,\n    capacity_symbol: &CapacitySymbol,\n)',
    'fn rust_buffer_to_js_uint8array_copy(\n    env: &napi::Env,\n    rb: RustBufferC,\n    free_ptr: *const c_void,\n)',
    'RustBuffer return function',
  );
  const bodyStart = source.indexOf(
    '    // Empty RustBuffer (capacity == 0 or null data): no allocation to alias,',
  );
  const bodyEndNeedle = '    Ok(unsafe { JsUnknown::from_raw(raw_env, typedarray)? })\n}';
  const bodyEnd = source.indexOf(bodyEndNeedle, bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) throw new Error('UBRN RustBuffer body patch changed.');
  const replacement = `    // Electron disallows external ArrayBuffers. Copy into a V8-owned
    // Uint8Array, then release the Rust allocation before returning to JS.
    let typedarray = unsafe { napi_utils::create_uint8array(raw_env, rb.data, len) };
    unsafe { napi_utils::free_rustbuffer(rb, free_ptr) };
    let typedarray = typedarray?;
    Ok(unsafe { JsUnknown::from_raw(raw_env, typedarray)? })
}`;
  return `${source.slice(0, bodyStart)}${replacement}${source.slice(bodyEnd + bodyEndNeedle.length)}`;
}

function assertPinnedToolchain(runner, toolchain, cwd, env) {
  const result = runner({
    command: 'rustup',
    args: ['run', toolchain.release, 'rustc', '--version'],
    cwd,
    env,
  });
  assertCommand(result, 'Cua Driver pinned Rust toolchain check');
  const expected = `rustc ${toolchain.release} (${toolchain.rustcCommit} ${toolchain.releaseDate})`;
  if (result.stdout.trim() !== expected) {
    throw new Error(`Cua Driver Rust toolchain mismatch: expected '${expected}'.`);
  }
}

function runCommand({ command, args, cwd, env }) {
  return spawnSync(command, args, { cwd, env, encoding: 'utf8' });
}

function assertCommand(result, label) {
  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`${label} failed with status ${String(result.status)}: ${stderr}`);
  }
}

function hashFile(path) {
  const value = readFileSync(path);
  return Object.freeze({
    bytes: value.byteLength,
    sha256: `sha256:${createHash('sha256').update(value).digest('hex')}`,
  });
}

function sha256File(path) {
  return hashFile(path).sha256;
}
