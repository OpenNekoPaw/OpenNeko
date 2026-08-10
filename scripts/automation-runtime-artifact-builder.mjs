import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  assertPinnedArtifactFile,
  loadAutomationRuntimeReleaseInputs,
} from './automation-runtime-release-inputs.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER_PATH = fileURLToPath(import.meta.url);
const CUA_NODE_REBUILDER_PATH = join(
  REPOSITORY_ROOT,
  'scripts',
  'automation-runtime-cua-node-rebuilder.mjs',
);
const CUA_EXTENSION_ID = 'computer-use';
const CUA_TARGET = 'darwin-arm64';
const LICENSE_INVENTORY_PATH = 'THIRD_PARTY_LICENSES.spdx.json';
const MAX_UPSTREAM_FILES = 20_000;
const MAX_UPSTREAM_BYTES = 1_500_000_000;

export async function buildCuaDriverArtifactCandidate(options) {
  const inputs = options.releaseInputs ?? loadAutomationRuntimeReleaseInputs();
  const pluginRoot = realpathSync(
    options.pluginRoot ??
      join(
        REPOSITORY_ROOT,
        'apps',
        'neko-desktop',
        'resources',
        'extension-marketplace',
        'plugins',
        CUA_EXTENSION_ID,
      ),
  );
  const upstreamArtifact = requireCuaArtifact(inputs, options.target);
  const expectedOutputName = `openneko-computer-use-${inputs.cuaDriver.release}-${options.target}.tar.gz`;
  if (basename(options.outputPath) !== expectedOutputName) {
    throw new Error(`Cua Driver candidate output must be named '${expectedOutputName}'.`);
  }
  await assertPinnedArtifactFile(options.upstreamArchivePath, upstreamArtifact);
  const nodeRuntime = readFirstPartyNodeRuntime(
    inputs,
    options.nodeRuntimePath,
    options.nodeRuntimeReceiptPath,
  );
  const pluginEntries = readPluginEntries(pluginRoot, inputs.cuaDriver.release);
  const licenseInventory = readCandidateLicenseInventory(
    options.licenseInventoryPath,
    inputs.cuaDriver.buildEvidence.licenseClosure,
  );
  const buildRecipeSha256 = sha256File(BUILDER_PATH);
  const sourceFacts = Object.freeze({
    sourceRepository: inputs.cuaDriver.repository,
    sourceCommit: inputs.cuaDriver.sourceCommit,
    upstreamBuild: Object.freeze({
      releaseWorkflow: Object.freeze({ ...inputs.cuaDriver.buildEvidence.releaseWorkflow }),
      rustWorkspace: Object.freeze({ ...inputs.cuaDriver.buildEvidence.rustWorkspace }),
      licenseClosure: Object.freeze({ ...inputs.cuaDriver.buildEvidence.licenseClosure }),
    }),
    buildRecipeSha256,
    firstPartyNodeRuntime: nodeRuntime.provenance,
  });
  const licenseFacts = Object.freeze({
    path: LICENSE_INVENTORY_PATH,
    sha256: sha256Buffer(licenseInventory),
  });
  const generatedEntries = [
    ...pluginEntries,
    bufferEntry(
      '.openneko-plugin/artifact-provenance.json',
      stableJsonBuffer({
        ...sourceFacts,
        licenseInventory: licenseFacts,
      }),
    ),
    bufferEntry(
      '.openneko-plugin/build-inputs.json',
      stableJsonBuffer({
        extensionId: CUA_EXTENSION_ID,
        target: options.target,
        upstream: {
          repository: inputs.cuaDriver.repository,
          release: inputs.cuaDriver.release,
          sourceCommit: inputs.cuaDriver.sourceCommit,
          artifact: {
            name: upstreamArtifact.name,
            url: upstreamArtifact.url,
            bytes: upstreamArtifact.bytes,
            sha256: upstreamArtifact.sha256,
          },
        },
        buildRecipeSha256,
        firstPartyNodeRuntime: nodeRuntime.provenance,
      }),
    ),
    bufferEntry(LICENSE_INVENTORY_PATH, licenseInventory),
  ];

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'openneko-cua-artifact-'));
  const expandedTarPath = join(temporaryRoot, 'upstream.tar');
  try {
    await pipeline(
      createReadStream(options.upstreamArchivePath),
      createGunzip(),
      createWriteStream(expandedTarPath, { flags: 'wx', mode: 0o600 }),
    );
    const runtimeEntries = await readCuaRuntimeEntries(
      expandedTarPath,
      inputs.cuaDriver.release,
      options.target,
      nodeRuntime.entry,
    );
    const entries = [...generatedEntries, ...runtimeEntries].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    assertUniqueEntries(entries);
    await writeDeterministicTarGzip(entries, options.outputPath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const output = await hashFile(options.outputPath);
  return Object.freeze({
    extensionId: CUA_EXTENSION_ID,
    target: options.target,
    artifact: Object.freeze({
      name: expectedOutputName,
      archive: 'tar.gz',
      sizeBytes: output.bytes,
      sha256: output.sha256,
    }),
    provenance: sourceFacts,
    licenseInventory: licenseFacts,
    catalogReady: false,
    blockers: Object.freeze([
      'transitive-license-inventory-review-required',
      'openneko-release-signature-not-produced',
      'packaged-darwin-arm64-qualification-not-run',
    ]),
  });
}

function readFirstPartyNodeRuntime(inputs, runtimePath, receiptPath) {
  if (!runtimePath || !receiptPath) {
    throw new Error('Cua Driver candidate requires a first-party Node runtime and receipt.');
  }
  const runtimeStats = lstatSync(runtimePath);
  const receiptStats = lstatSync(receiptPath);
  if (
    runtimeStats.isSymbolicLink() ||
    !runtimeStats.isFile() ||
    receiptStats.isSymbolicLink() ||
    !receiptStats.isFile()
  ) {
    throw new Error('Cua Driver first-party Node runtime inputs must be regular files.');
  }
  if (basename(runtimePath) !== 'cua_driver_node_runtime.node') {
    throw new Error(
      "Cua Driver first-party Node runtime must be named 'cua_driver_node_runtime.node'.",
    );
  }
  const receipt = parseJson(readFileSync(receiptPath, 'utf8'), 'Cua Driver Node runtime receipt');
  assertExactKeys(
    receipt,
    [
      'artifact',
      'source',
      'cargo',
      'rustToolchain',
      'targets',
      'sourceDateEpoch',
      'pathRemap',
      'cargoHomeRemap',
      'installName',
      'buildJobs',
      'codegenUnits',
      'machOUuid',
      'isolatedHome',
      'recipeSha256',
      'independentBuilds',
    ],
    'Cua Driver Node runtime receipt',
  );
  assertExactKeys(receipt.artifact, ['name', 'bytes', 'sha256'], 'Cua Driver Node artifact');
  assertExactKeys(receipt.source, ['package', 'release', 'sha256'], 'Cua Driver Node source');
  assertExactKeys(
    receipt.cargo,
    ['lockPath', 'lockSha256', 'packages'],
    'Cua Driver Node Cargo input',
  );
  assertExactKeys(
    receipt.rustToolchain,
    ['release', 'rustcCommit', 'releaseDate'],
    'Cua Driver Node Rust toolchain',
  );
  const evidence = inputs.cuaDriver.buildEvidence.nodeRuntime;
  const expectedRecipeSha256 = sha256File(CUA_NODE_REBUILDER_PATH);
  const runtime = hashFileSync(runtimePath);
  if (
    receipt.artifact?.name !== 'cua_driver_node_runtime.node' ||
    receipt.artifact?.bytes !== runtime.bytes ||
    receipt.artifact?.sha256 !== runtime.sha256 ||
    receipt.source?.package !== evidence.sourcePackage ||
    receipt.source?.release !== evidence.sourceRelease ||
    receipt.source?.sha256 !== evidence.runtimeSource.sha256 ||
    receipt.cargo?.lockPath !== evidence.firstPartyCargoLock.path ||
    receipt.cargo?.lockSha256 !== evidence.firstPartyCargoLock.sha256 ||
    receipt.cargo?.packages !== evidence.firstPartyCargoLock.packages ||
    receipt.rustToolchain.release !== evidence.rustToolchain.release ||
    receipt.rustToolchain.rustcCommit !== evidence.rustToolchain.rustcCommit ||
    receipt.rustToolchain.releaseDate !== evidence.rustToolchain.releaseDate ||
    JSON.stringify(receipt.targets) !==
      JSON.stringify(['aarch64-apple-darwin', 'x86_64-apple-darwin']) ||
    receipt.sourceDateEpoch !== evidence.sourceDateEpoch ||
    receipt.pathRemap !== '/openneko/cua-node-runtime' ||
    receipt.cargoHomeRemap !== '/openneko/cargo-home' ||
    receipt.installName !== '@rpath/cua_driver_node_runtime.node' ||
    receipt.buildJobs !== 1 ||
    receipt.codegenUnits !== 1 ||
    receipt.machOUuid !== false ||
    receipt.isolatedHome !== true ||
    receipt.recipeSha256 !== expectedRecipeSha256 ||
    receipt.independentBuilds !== 2
  ) {
    throw new Error(
      'Cua Driver first-party Node runtime receipt does not match the release input lock.',
    );
  }
  const provenance = Object.freeze({
    artifact: Object.freeze({ ...receipt.artifact }),
    source: Object.freeze({ ...receipt.source }),
    cargo: Object.freeze({ ...receipt.cargo }),
    rustToolchain: Object.freeze({ ...receipt.rustToolchain }),
    targets: Object.freeze([...receipt.targets]),
    sourceDateEpoch: receipt.sourceDateEpoch,
    pathRemap: receipt.pathRemap,
    cargoHomeRemap: receipt.cargoHomeRemap,
    installName: receipt.installName,
    buildJobs: receipt.buildJobs,
    codegenUnits: receipt.codegenUnits,
    machOUuid: receipt.machOUuid,
    isolatedHome: receipt.isolatedHome,
    recipeSha256: receipt.recipeSha256,
    independentBuilds: receipt.independentBuilds,
  });
  return Object.freeze({
    provenance,
    entry: Object.freeze({
      path: 'runtime/bin/cua_driver_node_runtime.node',
      mode: 0o644,
      size: runtime.bytes,
      source: Object.freeze({ kind: 'file-slice', path: realpathSync(runtimePath), start: 0 }),
    }),
  });
}

function requireCuaArtifact(inputs, target) {
  if (target !== CUA_TARGET) {
    throw new Error(`OpenNeko Cua Driver artifact building is unavailable for '${target}'.`);
  }
  const artifact = inputs.cuaDriver.platformArtifacts.find(
    (candidate) => candidate.target === target,
  );
  if (!artifact) throw new Error(`Pinned Cua Driver input is missing for '${target}'.`);
  return artifact;
}

function readPluginEntries(pluginRoot, release) {
  const manifestPath = join(pluginRoot, '.openneko-plugin', 'plugin.json');
  const mcpPath = join(pluginRoot, '.mcp.json');
  const manifest = parseJson(readFileSync(manifestPath, 'utf8'), 'Computer Use plugin manifest');
  if (
    manifest.name !== CUA_EXTENSION_ID ||
    manifest.version !== release ||
    manifest.mcpToolExposure !== 'adapter-only'
  ) {
    throw new Error('Computer Use plugin manifest does not match the pinned release boundary.');
  }
  const mcp = parseJson(readFileSync(mcpPath, 'utf8'), 'Computer Use MCP descriptor');
  const server = mcp.mcpServers?.['cua-driver'];
  if (
    !server ||
    server.type !== 'stdio' ||
    server.command !== './runtime/bin/cua-driver' ||
    JSON.stringify(server.args) !== JSON.stringify(['mcp', '--direct'])
  ) {
    throw new Error('Computer Use MCP descriptor does not use the contained bounded launcher.');
  }
  return [
    bufferEntry('.mcp.json', stableJsonBuffer(mcp)),
    bufferEntry('.openneko-plugin/plugin.json', stableJsonBuffer(manifest)),
  ];
}

function readCandidateLicenseInventory(path, expectedClosure) {
  const value = parseJson(readFileSync(path, 'utf8'), 'Cua Driver SPDX license inventory');
  if (
    value.spdxVersion !== 'SPDX-2.3' ||
    value.SPDXID !== 'SPDXRef-DOCUMENT' ||
    !Array.isArray(value.documentDescribes) ||
    value.documentDescribes.length === 0 ||
    !Array.isArray(value.packages) ||
    value.packages.length === 0
  ) {
    throw new Error('Cua Driver SPDX license inventory is incomplete.');
  }
  const packageIds = new Set();
  const packageIdentities = new Set();
  for (const entry of value.packages) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.SPDXID !== 'string' ||
      typeof entry.name !== 'string' ||
      typeof entry.versionInfo !== 'string' ||
      typeof entry.licenseDeclared !== 'string' ||
      entry.licenseDeclared.length === 0 ||
      entry.licenseDeclared === 'NOASSERTION' ||
      entry.licenseDeclared === 'NONE'
    ) {
      throw new Error('Cua Driver SPDX package entry is incomplete.');
    }
    if (packageIds.has(entry.SPDXID)) {
      throw new Error(`Cua Driver SPDX package identity '${entry.SPDXID}' is duplicated.`);
    }
    packageIds.add(entry.SPDXID);
    const identity = `${entry.name}@${entry.versionInfo}`;
    if (packageIdentities.has(identity)) {
      throw new Error(`Cua Driver SPDX package identity '${identity}' is duplicated.`);
    }
    packageIdentities.add(identity);
  }
  for (const described of value.documentDescribes) {
    if (typeof described !== 'string' || !packageIds.has(described)) {
      throw new Error('Cua Driver SPDX documentDescribes references an unknown package.');
    }
  }
  const identities = [...packageIdentities].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  const closureSha256 = sha256Buffer(Buffer.from(JSON.stringify(identities)));
  if (
    expectedClosure?.target !== CUA_TARGET ||
    identities.length !== expectedClosure.packages ||
    closureSha256 !== expectedClosure.sha256
  ) {
    throw new Error('Cua Driver SPDX package closure does not match the reviewed build closure.');
  }
  return stableJsonBuffer(value);
}

async function readCuaRuntimeEntries(tarPath, release, target, firstPartyNodeRuntimeEntry) {
  const root = `cua-driver-rs-${release}-${target}/`;
  const stats = statSync(tarPath);
  if (stats.size > MAX_UPSTREAM_BYTES) {
    throw new Error('Cua Driver expanded upstream archive exceeds the release build limit.');
  }
  const handle = await open(tarPath, 'r');
  const entries = [];
  let offset = 0;
  let expandedBytes = 0;
  try {
    while (offset + 512 <= stats.size) {
      const header = Buffer.alloc(512);
      const { bytesRead } = await handle.read(header, 0, header.length, offset);
      if (bytesRead !== 512) throw new Error('Cua Driver upstream TAR header is truncated.');
      if (header.every((value) => value === 0)) break;
      validateTarChecksum(header);
      const name = readTarText(header, 0, 100);
      const prefix = readTarText(header, 345, 155);
      const path = normalizeArchivePath(prefix ? `${prefix}/${name}` : name);
      const size = readTarOctal(header, 124, 12);
      const mode = readTarOctal(header, 100, 8);
      const type = String.fromCharCode(header[156] ?? 0);
      const isDirectory = type === '5';
      const isFile = type === '0' || type === '\0';
      if ((!isDirectory && !isFile) || (isDirectory && size !== 0)) {
        throw new Error('Cua Driver upstream TAR contains a linked or unsupported entry.');
      }
      if (path !== root.slice(0, -1) && !path.startsWith(root)) {
        throw new Error('Cua Driver upstream TAR contains an unexpected top-level path.');
      }
      if (isFile) {
        const relativePath = path.slice(root.length);
        if (!relativePath) throw new Error('Cua Driver upstream TAR file path is invalid.');
        expandedBytes += size;
        if (expandedBytes > MAX_UPSTREAM_BYTES) {
          throw new Error('Cua Driver upstream files exceed the release build limit.');
        }
        entries.push(
          Object.freeze({
            path: normalizeArchivePath(`runtime/bin/${relativePath}`),
            mode: (mode & 0o111) !== 0 ? 0o755 : 0o644,
            size,
            source: Object.freeze({
              kind: 'file-slice',
              path: tarPath,
              start: offset + 512,
            }),
          }),
        );
      }
      if (entries.length > MAX_UPSTREAM_FILES) {
        throw new Error('Cua Driver upstream archive contains too many files.');
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } finally {
    await handle.close();
  }
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const required of [
    'runtime/bin/cua-driver',
    'runtime/bin/cua-cursor-theme',
    'runtime/bin/cua_driver_node_runtime.node',
    'runtime/bin/libcua_driver_sdk.dylib',
    'runtime/bin/CuaDriver.app/Contents/MacOS/cua-driver',
  ]) {
    if (!byPath.has(required)) throw new Error(`Cua Driver runtime is missing '${required}'.`);
  }
  if (byPath.get('runtime/bin/cua-driver').mode !== 0o755) {
    throw new Error('Cua Driver contained launcher is not executable.');
  }
  return [
    ...entries.filter((entry) => entry.path !== 'runtime/bin/cua_driver_node_runtime.node'),
    firstPartyNodeRuntimeEntry,
  ];
}

async function writeDeterministicTarGzip(entries, outputPath) {
  const outputHandle = await open(outputPath, 'wx', 0o644);
  const output = outputHandle.createWriteStream();
  const gzip = createGzip({ level: 9, mtime: 0 });
  const completion = pipeline(gzip, output);
  try {
    for (const entry of entries) {
      await writeChunk(gzip, createTarHeader(entry));
      if (entry.source.kind === 'buffer') {
        await writeChunk(gzip, entry.source.value);
      } else if (entry.size > 0) {
        const input = createReadStream(entry.source.path, {
          start: entry.source.start,
          end: entry.source.start + entry.size - 1,
        });
        for await (const chunk of input) await writeChunk(gzip, chunk);
      }
      const padding = (512 - (entry.size % 512)) % 512;
      if (padding > 0) await writeChunk(gzip, Buffer.alloc(padding));
    }
    await writeChunk(gzip, Buffer.alloc(1024));
    gzip.end();
    await completion;
    normalizeGzipHeader(outputPath);
  } catch (error) {
    gzip.destroy();
    output.destroy();
    await completion.catch(() => undefined);
    rmSync(outputPath, { force: true });
    throw error;
  }
}

function createTarHeader(entry) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(entry.path);
  writeTarText(header, 0, 100, name);
  writeTarOctal(header, 100, 8, entry.mode);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, entry.size);
  writeTarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeTarText(header, 257, 6, 'ustar');
  writeTarText(header, 263, 2, '00');
  writeTarText(header, 265, 32, 'root');
  writeTarText(header, 297, 32, 'root');
  writeTarText(header, 345, 155, prefix);
  const checksum = header.reduce((sum, value) => sum + value, 0);
  const checksumText = checksum.toString(8).padStart(6, '0');
  header.write(checksumText, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function splitTarPath(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: '' };
  const segments = path.split('/');
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const name = segments.slice(index).join('/');
    const prefix = segments.slice(0, index).join('/');
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) {
      return { name, prefix };
    }
  }
  throw new Error(`Release artifact path is too long for USTAR: ${path}.`);
}

function bufferEntry(path, value, mode = 0o644) {
  return Object.freeze({
    path: normalizeArchivePath(path),
    mode,
    size: value.byteLength,
    source: Object.freeze({ kind: 'buffer', value }),
  });
}

function assertUniqueEntries(entries) {
  const identities = new Set();
  for (const entry of entries) {
    const identity = entry.path.toLocaleLowerCase('en-US');
    if (identities.has(identity)) {
      throw new Error(`Release artifact path '${entry.path}' is duplicated or case-colliding.`);
    }
    identities.add(identity);
  }
}

function normalizeArchivePath(value) {
  const path = value.replace(/\/$/u, '');
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0')) {
    throw new Error(`Release artifact path '${value}' is unsafe.`);
  }
  const segments = path.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        segment.includes(':'),
    )
  ) {
    throw new Error(`Release artifact path '${value}' is unsafe.`);
  }
  return segments.join('/');
}

function validateTarChecksum(header) {
  const expected = readTarOctal(header, 148, 8);
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const actual = copy.reduce((sum, value) => sum + value, 0);
  if (actual !== expected) throw new Error('Cua Driver upstream TAR checksum is invalid.');
}

function readTarText(header, offset, length) {
  return header
    .subarray(offset, offset + length)
    .toString('utf8')
    .replace(/\0.*$/u, '');
}

function readTarOctal(header, offset, length) {
  const value = readTarText(header, offset, length).trim();
  if (!/^[0-7]+$/u.test(value)) throw new Error('Cua Driver upstream TAR number is invalid.');
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed))
    throw new Error('Cua Driver upstream TAR number is too large.');
  return parsed;
}

function writeTarText(buffer, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length) throw new Error(`USTAR text field '${value}' is too long.`);
  bytes.copy(buffer, offset);
}

function writeTarOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  if (text.length >= length) throw new Error(`USTAR numeric value '${value}' is too large.`);
  buffer.write(text, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

async function writeChunk(stream, chunk) {
  if (chunk.byteLength === 0) return;
  if (!stream.write(chunk))
    await new Promise((resolvePromise) => stream.once('drain', resolvePromise));
}

function normalizeGzipHeader(path) {
  const descriptor = openSync(path, 'r+');
  try {
    const header = Buffer.alloc(10);
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      throw new Error('Generated GZIP header is truncated.');
    }
    if (header[0] !== 0x1f || header[1] !== 0x8b || header[2] !== 8) {
      throw new Error('Generated artifact is not a GZIP stream.');
    }
    writeSync(descriptor, Buffer.from([0, 0, 0, 0]), 0, 4, 4);
    writeSync(descriptor, Buffer.from([255]), 0, 1, 9);
  } finally {
    closeSync(descriptor);
  }
}

function parseJson(source, label) {
  const value = JSON.parse(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not a JSON object.`);
  }
  return value;
}

function assertExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object.`);
  }
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} does not contain the exact reviewed fields.`);
  }
}

function stableJsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(sortJson(value), null, 2)}\n`, 'utf8');
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    );
  }
  return value;
}

function sha256Buffer(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function hashFileSync(path) {
  const value = readFileSync(path);
  return Object.freeze({ bytes: value.byteLength, sha256: sha256Buffer(value) });
}

async function hashFile(path) {
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.byteLength;
    digest.update(chunk);
  }
  return Object.freeze({ bytes, sha256: `sha256:${digest.digest('hex')}` });
}
