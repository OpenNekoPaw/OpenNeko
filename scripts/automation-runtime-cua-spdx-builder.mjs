import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import parseSpdxExpression from 'spdx-expression-parse';
import {
  indexAutomationRuntimeCargoLock,
  parseAutomationRuntimeCargoLock,
} from './automation-runtime-cargo-lock.mjs';
import { assertCuaNodeRuntimeSourceRoot } from './automation-runtime-cua-node-rebuilder.mjs';
import { loadAutomationRuntimeReleaseInputs } from './automation-runtime-release-inputs.mjs';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECIPE_PATH = fileURLToPath(import.meta.url);
const TARGET = 'darwin-arm64';
const CARGO_TARGET = 'aarch64-apple-darwin';
const MAIN_ROOT_PACKAGES = Object.freeze(['cua-driver', 'cursor-theme-cli', 'cua-driver-sdk']);
const NODE_ROOT_PACKAGES = Object.freeze(['uniffi-runtime-napi']);
const CRATES_IO_SOURCE = 'registry+https://github.com/rust-lang/crates.io-index';
const MAX_METADATA_BYTES = 64 * 1024 * 1024;

export function buildCuaDriverSpdxCandidate(options) {
  const inputs = options.releaseInputs ?? loadAutomationRuntimeReleaseInputs();
  if (options.target !== TARGET) {
    throw new Error(`Cua Driver SPDX generation is unavailable for '${options.target}'.`);
  }
  const outputPath = resolve(options.outputPath);
  const expectedName = `openneko-computer-use-${inputs.cuaDriver.release}-${TARGET}.spdx.json`;
  if (basename(outputPath) !== expectedName) {
    throw new Error(`Cua Driver SPDX output must be named '${expectedName}'.`);
  }
  const cuaSourceRoot = realpathSync(options.cuaSourceRoot);
  const ubrnSourceRoot = realpathSync(options.ubrnSourceRoot);
  assertCuaSourceRoot(cuaSourceRoot, inputs);
  assertCuaNodeRuntimeSourceRoot(ubrnSourceRoot, inputs.cuaDriver.buildEvidence.nodeRuntime);
  const nodeLockPath = realpathSync(
    options.nodeLockPath ??
      join(REPOSITORY_ROOT, inputs.cuaDriver.buildEvidence.nodeRuntime.firstPartyCargoLock.path),
  );
  assertDigest(
    nodeLockPath,
    inputs.cuaDriver.buildEvidence.nodeRuntime.firstPartyCargoLock.sha256,
    'Cua Driver Node runtime first-party Cargo lock',
  );

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'openneko-cua-spdx-'));
  try {
    const homeRoot = join(temporaryRoot, 'home');
    const nodeWorkspaceRoot = join(temporaryRoot, 'node-runtime');
    mkdirSync(homeRoot, { mode: 0o700 });
    cpSync(join(ubrnSourceRoot, 'runtimes', 'core'), join(nodeWorkspaceRoot, 'core'), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    cpSync(join(ubrnSourceRoot, 'runtimes', 'napi'), join(nodeWorkspaceRoot, 'napi'), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
    });
    copyFileSync(
      nodeLockPath,
      join(nodeWorkspaceRoot, 'napi', 'Cargo.lock'),
      constants.COPYFILE_EXCL,
    );
    const runner = options.runner ?? runCommand;
    const environment = createMetadataEnvironment(homeRoot);
    assertPinnedToolchain(
      runner,
      inputs.cuaDriver.buildEvidence.nodeRuntime.rustToolchain,
      temporaryRoot,
      environment,
    );
    const mainManifestPath = join(
      cuaSourceRoot,
      inputs.cuaDriver.buildEvidence.rustWorkspace.manifestPath,
    );
    const mainMetadata = readCargoMetadata(
      runner,
      mainManifestPath,
      inputs.cuaDriver.buildEvidence.nodeRuntime.rustToolchain.release,
      temporaryRoot,
      environment,
      'Cua Driver main runtime',
    );
    const nodeManifestPath = join(nodeWorkspaceRoot, 'napi', 'Cargo.toml');
    const nodeMetadata = readCargoMetadata(
      runner,
      nodeManifestPath,
      inputs.cuaDriver.buildEvidence.nodeRuntime.rustToolchain.release,
      temporaryRoot,
      environment,
      'Cua Driver Node runtime',
    );
    const mainLock = indexAutomationRuntimeCargoLock(
      parseAutomationRuntimeCargoLock(
        readFileSync(
          join(cuaSourceRoot, inputs.cuaDriver.buildEvidence.rustWorkspace.lockPath),
          'utf8',
        ),
        'Cua Driver main runtime',
      ),
      'Cua Driver main runtime',
    );
    const nodeLock = indexAutomationRuntimeCargoLock(
      parseAutomationRuntimeCargoLock(
        readFileSync(nodeLockPath, 'utf8'),
        'Cua Driver Node runtime first-party',
      ),
      'Cua Driver Node runtime first-party',
    );
    const main = collectCargoClosure({
      metadata: mainMetadata,
      rootNames: MAIN_ROOT_PACKAGES,
      lock: mainLock,
      owner: 'cua-main',
      workspaceRoot: join(cuaSourceRoot, 'libs', 'cua-driver', 'rust'),
      workspaceLicense: inputs.cuaDriver.license.spdx,
      workspaceLocation: `${inputs.cuaDriver.repository}/tree/${inputs.cuaDriver.sourceCommit}/libs/cua-driver/rust`,
    });
    const node = collectCargoClosure({
      metadata: nodeMetadata,
      rootNames: NODE_ROOT_PACKAGES,
      lock: nodeLock,
      owner: 'first-party-node-runtime',
      workspaceRoot: realpathSync(nodeWorkspaceRoot),
      workspaceLicense: inputs.cuaDriver.buildEvidence.nodeRuntime.runtimeSource.licenseSpdx,
      workspaceLocation: `https://www.npmjs.com/package/${inputs.cuaDriver.buildEvidence.nodeRuntime.sourcePackage}/v/${inputs.cuaDriver.buildEvidence.nodeRuntime.sourceRelease}`,
    });
    const combined = combineClosures(main, node);
    const identities = combined.packages.map((entry) => entry.identity);
    const closureSha256 = sha256Buffer(Buffer.from(JSON.stringify(identities)));
    const expectedClosure = inputs.cuaDriver.buildEvidence.licenseClosure;
    if (
      expectedClosure.target !== TARGET ||
      identities.length !== expectedClosure.packages ||
      closureSha256 !== expectedClosure.sha256
    ) {
      throw new Error('Cua Driver SPDX metadata does not match the locked package closure.');
    }
    const document = createSpdxDocument(inputs, combined, closureSha256);
    const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes, { flag: 'wx', mode: 0o644 });
    return Object.freeze({
      artifact: Object.freeze({
        name: expectedName,
        bytes: bytes.byteLength,
        sha256: sha256Buffer(bytes),
      }),
      target: TARGET,
      packages: identities.length,
      closureSha256,
      reviewed: false,
      source: Object.freeze({
        repository: inputs.cuaDriver.repository,
        commit: inputs.cuaDriver.sourceCommit,
        mainCargoLockSha256: inputs.cuaDriver.buildEvidence.rustWorkspace.lockSha256,
        nodeCargoLockSha256: inputs.cuaDriver.buildEvidence.nodeRuntime.firstPartyCargoLock.sha256,
      }),
      rustToolchain: Object.freeze({
        ...inputs.cuaDriver.buildEvidence.nodeRuntime.rustToolchain,
      }),
      isolatedHome: true,
      offlineMetadata: true,
      recipeSha256: sha256File(RECIPE_PATH),
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function assertCuaSourceRoot(sourceRoot, inputs) {
  const evidence = inputs.cuaDriver.buildEvidence;
  for (const [relativePath, digest, label] of [
    [inputs.cuaDriver.license.path, inputs.cuaDriver.license.sha256, 'root license'],
    [evidence.releaseWorkflow.path, evidence.releaseWorkflow.sha256, 'release workflow'],
    [evidence.rustWorkspace.manifestPath, evidence.rustWorkspace.manifestSha256, 'Cargo manifest'],
    [evidence.rustWorkspace.lockPath, evidence.rustWorkspace.lockSha256, 'Cargo lock'],
  ]) {
    assertDigest(join(sourceRoot, relativePath), digest, `Cua Driver ${label}`);
  }
}

function createMetadataEnvironment(homeRoot) {
  const inherited = {};
  for (const name of ['PATH', 'CARGO_HOME', 'RUSTUP_HOME', 'TMPDIR']) {
    const value = process.env[name];
    if (value) inherited[name] = value;
  }
  return Object.freeze({
    ...inherited,
    HOME: homeRoot,
    CARGO_NET_OFFLINE: 'true',
    LC_ALL: 'C',
    LANG: 'C',
  });
}

function assertPinnedToolchain(runner, toolchain, cwd, env) {
  const result = runner({
    command: 'rustup',
    args: ['run', toolchain.release, 'rustc', '--version'],
    cwd,
    env,
  });
  assertCommand(result, 'Cua Driver SPDX pinned Rust toolchain check');
  const expected = `rustc ${toolchain.release} (${toolchain.rustcCommit} ${toolchain.releaseDate})`;
  if (result.stdout.trim() !== expected) {
    throw new Error(`Cua Driver SPDX Rust toolchain mismatch: expected '${expected}'.`);
  }
}

function readCargoMetadata(runner, manifestPath, toolchain, cwd, env, label) {
  const result = runner({
    command: 'rustup',
    args: [
      'run',
      toolchain,
      'cargo',
      'metadata',
      '--locked',
      '--offline',
      '--format-version',
      '1',
      '--filter-platform',
      CARGO_TARGET,
      '--manifest-path',
      manifestPath,
    ],
    cwd,
    env,
  });
  assertCommand(result, `${label} locked offline metadata`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} metadata is not valid JSON.`, { cause: error });
  }
}

function collectCargoClosure(options) {
  const packages = new Map(options.metadata.packages.map((entry) => [entry.id, entry]));
  const nodes = new Map(options.metadata.resolve?.nodes?.map((entry) => [entry.id, entry]));
  if (!options.metadata.resolve || nodes.size === 0) {
    throw new Error(`${options.owner} Cargo metadata has no resolved dependency graph.`);
  }
  const rootNameSet = new Set(options.rootNames);
  const roots = options.metadata.workspace_members.filter((id) =>
    rootNameSet.has(packages.get(id)?.name),
  );
  if (roots.length !== rootNameSet.size) {
    const found = roots.map((id) => packages.get(id)?.name).filter(Boolean);
    throw new Error(
      `${options.owner} Cargo metadata root mismatch: expected ${JSON.stringify(options.rootNames)}, found ${JSON.stringify(found)}.`,
    );
  }
  const pending = [...roots];
  const reached = new Set();
  const edges = new Set();
  while (pending.length > 0) {
    const id = pending.pop();
    if (reached.has(id)) continue;
    reached.add(id);
    const node = nodes.get(id);
    if (!node) throw new Error(`${options.owner} Cargo metadata is missing a package node.`);
    for (const dependency of node.deps) {
      if (!dependency.dep_kinds.some((kind) => kind.kind !== 'dev')) continue;
      edges.add(`${id}\0${dependency.pkg}`);
      pending.push(dependency.pkg);
    }
  }
  const entries = [...reached].map((id) => {
    const value = packages.get(id);
    if (!value) throw new Error(`${options.owner} Cargo metadata references an unknown package.`);
    const identity = `${value.name}@${value.version}`;
    const locked = options.lock.get(identity);
    if (!locked) throw new Error(`${options.owner} Cargo lock is missing '${identity}'.`);
    const isWorkspace = value.source === null;
    if (!isWorkspace && value.source !== CRATES_IO_SOURCE) {
      throw new Error(`${options.owner} package '${identity}' uses an unreviewed source.`);
    }
    if (isWorkspace) {
      const manifestPath = realpathSync(value.manifest_path);
      const relativeManifest = relative(options.workspaceRoot, manifestPath);
      if (
        relativeManifest === '..' ||
        relativeManifest.startsWith(`..${sep}`) ||
        resolve(options.workspaceRoot, relativeManifest) !== manifestPath
      ) {
        throw new Error(
          `${options.owner} workspace package '${identity}' escapes its source root.`,
        );
      }
      if (locked.source !== undefined || locked.checksum !== undefined) {
        throw new Error(`${options.owner} workspace lock identity '${identity}' is inconsistent.`);
      }
    } else if (
      locked.source !== CRATES_IO_SOURCE ||
      !/^[a-f0-9]{64}$/u.test(locked.checksum ?? '')
    ) {
      throw new Error(`${options.owner} registry lock identity '${identity}' is incomplete.`);
    }
    const licenseDeclared = normalizeLicenseExpression(
      value.license ?? (isWorkspace ? options.workspaceLicense : undefined),
      identity,
    );
    return Object.freeze({
      cargoId: id,
      identity,
      name: value.name,
      release: value.version,
      licenseDeclared,
      checksum: locked.checksum,
      downloadLocation: isWorkspace
        ? options.workspaceLocation
        : `https://crates.io/api/v1/crates/${encodeURIComponent(value.name)}/${encodeURIComponent(value.version)}/download`,
      owner: options.owner,
    });
  });
  const identityByCargoId = new Map(entries.map((entry) => [entry.cargoId, entry.identity]));
  return Object.freeze({
    roots: Object.freeze(roots.map((id) => identityByCargoId.get(id))),
    packages: Object.freeze(entries),
    edges: Object.freeze(
      [...edges].map((edge) => {
        const [source, dependency] = edge.split('\0');
        return Object.freeze({
          source: identityByCargoId.get(source),
          dependency: identityByCargoId.get(dependency),
        });
      }),
    ),
  });
}

function normalizeLicenseExpression(value, identity) {
  if (!value) throw new Error(`Cua Driver package '${identity}' has no declared license.`);
  const normalized = /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/u.test(value)
    ? value.replace('/', ' OR ')
    : value;
  try {
    parseSpdxExpression(normalized);
  } catch (error) {
    throw new Error(`Cua Driver package '${identity}' has an invalid SPDX license expression.`, {
      cause: error,
    });
  }
  return normalized;
}

function combineClosures(...closures) {
  const packages = new Map();
  const roots = new Set();
  const edges = new Set();
  for (const closure of closures) {
    for (const root of closure.roots) roots.add(root);
    for (const edge of closure.edges) edges.add(`${edge.source}\0${edge.dependency}`);
    for (const entry of closure.packages) {
      const existing = packages.get(entry.identity);
      if (existing) {
        if (
          existing.licenseDeclared !== entry.licenseDeclared ||
          existing.checksum !== entry.checksum ||
          existing.downloadLocation !== entry.downloadLocation
        ) {
          throw new Error(`Cua Driver package '${entry.identity}' has conflicting provenance.`);
        }
        existing.owners.add(entry.owner);
      } else {
        packages.set(entry.identity, { ...entry, owners: new Set([entry.owner]) });
      }
    }
  }
  const sortedPackages = [...packages.values()].sort((left, right) =>
    Buffer.compare(Buffer.from(left.identity), Buffer.from(right.identity)),
  );
  const sortedEdges = [...edges]
    .map((edge) => {
      const [source, dependency] = edge.split('\0');
      return { source, dependency };
    })
    .sort((left, right) =>
      Buffer.compare(
        Buffer.from(`${left.source}\0${left.dependency}`),
        Buffer.from(`${right.source}\0${right.dependency}`),
      ),
    );
  return Object.freeze({
    roots: Object.freeze(
      [...roots].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
    ),
    packages: Object.freeze(sortedPackages),
    edges: Object.freeze(sortedEdges),
  });
}

function createSpdxDocument(inputs, closure, closureSha256) {
  const packageIdByIdentity = new Map(
    closure.packages.map((entry) => [entry.identity, spdxPackageId(entry.identity)]),
  );
  const packages = closure.packages.map((entry) => ({
    SPDXID: packageIdByIdentity.get(entry.identity),
    name: entry.name,
    versionInfo: entry.release,
    downloadLocation: entry.downloadLocation,
    filesAnalyzed: false,
    checksums: entry.checksum
      ? [{ algorithm: 'SHA256', checksumValue: entry.checksum }]
      : undefined,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: entry.licenseDeclared,
    copyrightText: 'NOASSERTION',
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: `pkg:cargo/${encodeURIComponent(entry.name)}@${encodeURIComponent(entry.release)}`,
      },
    ],
    sourceInfo: `Unreviewed Cargo metadata candidate; included by ${[...entry.owners].sort().join(', ')}.`,
  }));
  const relationships = [
    ...closure.roots.map((identity) => ({
      spdxElementId: 'SPDXRef-DOCUMENT',
      relationshipType: 'DESCRIBES',
      relatedSpdxElement: packageIdByIdentity.get(identity),
    })),
    ...closure.edges.map((edge) => ({
      spdxElementId: packageIdByIdentity.get(edge.source),
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: packageIdByIdentity.get(edge.dependency),
    })),
  ];
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `OpenNeko Cua Driver ${inputs.cuaDriver.release} ${TARGET} candidate dependency inventory`,
    documentNamespace: `${inputs.cuaDriver.repository}/spdx/${inputs.cuaDriver.sourceCommit}/${TARGET}/${closureSha256.slice('sha256:'.length)}`,
    documentComment:
      'UNREVIEWED CANDIDATE: package identities, Cargo checksums and declared license expressions require independent human review before release signing or catalog publication.',
    creationInfo: {
      created: new Date(
        inputs.cuaDriver.buildEvidence.nodeRuntime.sourceDateEpoch * 1000,
      ).toISOString(),
      creators: ['Organization: OpenNeko', 'Tool: automation-runtime-cua-spdx-builder'],
    },
    documentDescribes: closure.roots.map((identity) => packageIdByIdentity.get(identity)),
    packages,
    relationships,
  };
}

function spdxPackageId(identity) {
  return `SPDXRef-Package-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function assertDigest(path, expected, label) {
  const stats = statSync(path);
  if (!stats.isFile()) throw new Error(`${label} is not a regular file.`);
  if (sha256File(path) !== expected) throw new Error(`${label} digest is invalid.`);
}

function runCommand({ command, args, cwd, env }) {
  return spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: MAX_METADATA_BYTES,
  });
}

function assertCommand(result, label) {
  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`, { cause: result.error });
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(`${label} failed with status ${String(result.status)}: ${stderr}`);
  }
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function sha256Buffer(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
