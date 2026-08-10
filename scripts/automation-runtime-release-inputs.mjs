import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = dirname(fileURLToPath(import.meta.url));
export const AUTOMATION_RUNTIME_RELEASE_INPUTS_PATH = resolve(
  SCRIPT_ROOT,
  'automation-runtime-release-inputs.json',
);

const TARGET_ARCHIVES = Object.freeze({
  'darwin-arm64': 'tar.gz',
  'darwin-x64': 'tar.gz',
  'linux-arm64': 'tar.gz',
  'linux-x64': 'tar.gz',
  'win32-arm64': 'zip',
  'win32-x64': 'zip',
});

export function loadAutomationRuntimeReleaseInputs(path = AUTOMATION_RUNTIME_RELEASE_INPUTS_PATH) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  assertAutomationRuntimeReleaseInputs(value);
  return deepFreeze(value);
}

export function assertAutomationRuntimeReleaseInputs(value) {
  assertRecordWithKeys(value, ['browserUse', 'cuaDriver', 'mcpSdk'], 'release input root');
  assertBrowserUse(value.browserUse);
  assertCuaDriver(value.cuaDriver);
  assertMcpSdk(value.mcpSdk);
}

export async function assertPinnedArtifactFile(path, artifact) {
  if (
    !artifact ||
    typeof artifact !== 'object' ||
    typeof artifact.name !== 'string' ||
    artifact.name.length === 0 ||
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes <= 0 ||
    !isSha256(artifact.sha256)
  ) {
    throw new Error('Pinned artifact file metadata is invalid.');
  }
  const stats = statSync(path);
  if (!stats.isFile()) throw new Error(`Pinned artifact is not a regular file: ${path}.`);
  if (stats.size !== artifact.bytes) {
    throw new Error(
      `Pinned artifact size mismatch for ${artifact.name}: expected ${artifact.bytes}, received ${stats.size}.`,
    );
  }
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  const sha256 = `sha256:${digest.digest('hex')}`;
  if (sha256 !== artifact.sha256) {
    throw new Error(`Pinned artifact digest mismatch for ${artifact.name}.`);
  }
  return Object.freeze({ path: resolve(path), bytes: stats.size, sha256 });
}

export async function verifyCuaDriverUpstreamArtifact(path, target, inputs) {
  const releaseInputs = inputs ?? loadAutomationRuntimeReleaseInputs();
  const artifact = releaseInputs.cuaDriver.platformArtifacts.find(
    (candidate) => candidate.target === target,
  );
  if (!artifact) throw new Error(`No pinned Cua Driver artifact exists for ${target}.`);
  if (basename(path) !== artifact.name) {
    throw new Error(`Cua Driver artifact filename does not match the pinned ${target} input.`);
  }
  return await assertPinnedArtifactFile(path, artifact);
}

export function automationRuntimeReleaseReadiness(inputs) {
  const releaseInputs = inputs ?? loadAutomationRuntimeReleaseInputs();
  return Object.freeze({
    browserUse: Object.freeze({
      installable: false,
      blockers: Object.freeze([
        releaseInputs.browserUse.githubReleaseAssets.length === 0
          ? 'upstream-release-has-no-binary-assets'
          : 'openneko-self-contained-runtime-not-produced',
        'transitive-license-inventory-not-reviewed',
        'openneko-release-signature-not-produced',
        'packaged-darwin-arm64-qualification-not-run',
      ]),
    }),
    cuaDriver: Object.freeze({
      installable: false,
      blockers: Object.freeze([
        'contained-candidate-not-released',
        'first-party-locked-node-runtime-not-released',
        'transitive-license-inventory-not-reviewed',
        'openneko-release-signature-not-produced',
        'packaged-darwin-arm64-qualification-not-run',
      ]),
    }),
  });
}

function assertBrowserUse(value) {
  assertRecordWithKeys(
    value,
    [
      'repository',
      'release',
      'tag',
      'sourceCommit',
      'license',
      'python',
      'dependencyDeclaration',
      'githubReleaseAssets',
    ],
    'Browser Use input',
  );
  assertRepository(value.repository, 'browser-use/browser-use');
  assertRelease(value.release, value.tag, 'Browser Use');
  assertSourceCommit(value.sourceCommit, 'Browser Use');
  assertLicense(value.license, 'Browser Use');
  assertRecordWithKeys(
    value.python,
    ['release', 'declarationPath', 'declarationSha256'],
    'Browser Use Python input',
  );
  if (
    value.python.release !== '3.12' ||
    value.python.declarationPath !== '.python-version' ||
    !isSha256(value.python.declarationSha256)
  ) {
    throw new Error('Browser Use Python input is not pinned to the reviewed declaration.');
  }
  assertRecordWithKeys(
    value.dependencyDeclaration,
    ['path', 'sha256'],
    'Browser Use dependency declaration',
  );
  if (
    value.dependencyDeclaration.path !== 'pyproject.toml' ||
    !isSha256(value.dependencyDeclaration.sha256)
  ) {
    throw new Error('Browser Use dependency declaration is invalid.');
  }
  if (!Array.isArray(value.githubReleaseAssets) || value.githubReleaseAssets.length !== 0) {
    throw new Error(
      'Browser Use 0.13.7 must remain source-only until an OpenNeko self-contained artifact is produced.',
    );
  }
}

function assertCuaDriver(value) {
  assertRecordWithKeys(
    value,
    [
      'repository',
      'release',
      'tag',
      'sourceCommit',
      'license',
      'releaseManifest',
      'buildEvidence',
      'platformArtifacts',
    ],
    'Cua Driver input',
  );
  assertRepository(value.repository, 'trycua/cua');
  assertRelease(value.release, value.tag, 'Cua Driver');
  assertSourceCommit(value.sourceCommit, 'Cua Driver');
  assertLicense(value.license, 'Cua Driver');
  assertArtifact(value.releaseManifest, undefined);
  assertCuaBuildEvidence(value.buildEvidence);
  if (!Array.isArray(value.platformArtifacts)) {
    throw new Error('Cua Driver platform artifact inventory is invalid.');
  }
  const expectedTargets = Object.keys(TARGET_ARCHIVES);
  const actualTargets = value.platformArtifacts.map((artifact) => artifact.target);
  if (
    actualTargets.length !== expectedTargets.length ||
    new Set(actualTargets).size !== actualTargets.length ||
    !expectedTargets.every((target) => actualTargets.includes(target))
  ) {
    throw new Error('Cua Driver platform artifact inventory is incomplete or duplicated.');
  }
  for (const artifact of value.platformArtifacts) {
    assertArtifact(artifact, value.tag);
    if (TARGET_ARCHIVES[artifact.target] !== artifact.archive) {
      throw new Error(`Cua Driver archive kind is invalid for ${artifact.target}.`);
    }
  }
}

function assertCuaBuildEvidence(value) {
  assertRecordWithKeys(
    value,
    ['releaseWorkflow', 'rustWorkspace', 'nodeRuntime', 'licenseClosure', 'payloadOwners'],
    'Cua Driver build evidence',
  );
  assertRecordWithKeys(
    value.releaseWorkflow,
    ['path', 'sha256', 'runId', 'runUrl', 'runLogsSha256'],
    'Cua Driver release workflow evidence',
  );
  if (
    value.releaseWorkflow.path !== '.github/workflows/cd-rust-cua-driver.yml' ||
    !isSha256(value.releaseWorkflow.sha256) ||
    value.releaseWorkflow.runId !== 31217509888 ||
    value.releaseWorkflow.runUrl !== 'https://github.com/trycua/cua/actions/runs/31217509888' ||
    !isSha256(value.releaseWorkflow.runLogsSha256)
  ) {
    throw new Error('Cua Driver release workflow evidence is not exact.');
  }
  assertRecordWithKeys(
    value.rustWorkspace,
    ['manifestPath', 'manifestSha256', 'lockPath', 'lockSha256', 'rootPackages', 'targets'],
    'Cua Driver Rust workspace evidence',
  );
  if (
    value.rustWorkspace.manifestPath !== 'libs/cua-driver/rust/Cargo.toml' ||
    !isSha256(value.rustWorkspace.manifestSha256) ||
    value.rustWorkspace.lockPath !== 'libs/cua-driver/rust/Cargo.lock' ||
    !isSha256(value.rustWorkspace.lockSha256) ||
    JSON.stringify(value.rustWorkspace.rootPackages) !==
      JSON.stringify(['cua-driver', 'cursor-theme-cli', 'cua-driver-sdk']) ||
    JSON.stringify(value.rustWorkspace.targets) !==
      JSON.stringify(['aarch64-apple-darwin', 'x86_64-apple-darwin'])
  ) {
    throw new Error('Cua Driver Rust workspace evidence is not exact.');
  }
  assertCuaNodeRuntimeEvidence(value.nodeRuntime);
  assertRecordWithKeys(
    value.licenseClosure,
    ['target', 'packages', 'sha256'],
    'Cua Driver license closure evidence',
  );
  if (
    value.licenseClosure.target !== 'darwin-arm64' ||
    value.licenseClosure.packages !== 367 ||
    value.licenseClosure.sha256 !==
      'sha256:aaaa49126e1de4500915ddccb371a7688d11d283b57ef114ddba0e4c2b9bad93'
  ) {
    throw new Error('Cua Driver license closure evidence is not exact.');
  }
  const expectedPayloadOwners = [
    ['cua-driver', 'cua-driver'],
    ['cua-cursor-theme', 'cursor-theme-cli'],
    ['libcua_driver_sdk.dylib', 'cua-driver-sdk'],
    ['cua_driver_node_runtime.node', 'uniffi-runtime-napi'],
    ['cua_driver_abi.h', 'cua-driver-sdk'],
    ['CuaDriver.app/Contents/MacOS/cua-driver', 'cua-driver'],
    ['CuaDriver.app/Contents/MacOS/cua-cursor-theme', 'cursor-theme-cli'],
    ['CuaDriver.app/Contents/Info.plist', 'CuaDriverBundle'],
    ['CuaDriver.app/Contents/Resources/AppIcon.icns', 'CuaDriverBundle'],
  ];
  if (
    !Array.isArray(value.payloadOwners) ||
    value.payloadOwners.length !== expectedPayloadOwners.length ||
    value.payloadOwners.some((entry, index) => {
      assertRecordWithKeys(entry, ['path', 'owner'], 'Cua Driver payload owner');
      const expected = expectedPayloadOwners[index];
      return entry.path !== expected[0] || entry.owner !== expected[1];
    })
  ) {
    throw new Error('Cua Driver payload owner evidence is incomplete or reordered.');
  }
}

function assertCuaNodeRuntimeEvidence(value) {
  assertRecordWithKeys(
    value,
    [
      'sourcePackage',
      'sourceRelease',
      'sourceIntegrity',
      'packageLockPath',
      'packageLockSha256',
      'buildScriptPath',
      'buildScriptSha256',
      'publishedCargoLock',
      'runtimeSource',
      'firstPartyCargoLock',
      'rustToolchain',
      'sourceDateEpoch',
      'compiledPackages',
    ],
    'Cua Driver Node runtime evidence',
  );
  if (
    value.sourcePackage !== 'uniffi-bindgen-react-native' ||
    value.sourceRelease !== '0.31.0-3' ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value.sourceIntegrity) ||
    value.packageLockPath !== 'libs/cua-driver/typescript/package-lock.json' ||
    !isSha256(value.packageLockSha256) ||
    value.buildScriptPath !== 'libs/cua-driver/scripts/build-node-runtime.mjs' ||
    !isSha256(value.buildScriptSha256) ||
    value.publishedCargoLock !== null ||
    value.sourceDateEpoch !== 1786135742
  ) {
    throw new Error('Cua Driver Node runtime source evidence is not exact.');
  }
  assertRecordWithKeys(
    value.runtimeSource,
    [
      'files',
      'sha256',
      'licenseSpdx',
      'packageJsonSha256',
      'licenseSha256',
      'coreManifestSha256',
      'napiManifestSha256',
    ],
    'Cua Driver Node runtime source tree',
  );
  if (
    value.runtimeSource.files !== 53 ||
    value.runtimeSource.licenseSpdx !== 'MPL-2.0' ||
    !Object.entries(value.runtimeSource)
      .filter(([key]) => key !== 'files' && key !== 'licenseSpdx')
      .every(([, digest]) => isSha256(digest))
  ) {
    throw new Error('Cua Driver Node runtime source tree evidence is invalid.');
  }
  assertRecordWithKeys(
    value.firstPartyCargoLock,
    ['path', 'sha256', 'packages'],
    'Cua Driver Node runtime first-party Cargo lock',
  );
  if (
    value.firstPartyCargoLock.path !==
      'scripts/release-inputs/cua-driver-node-runtime-0.19.2.Cargo.lock' ||
    !isSha256(value.firstPartyCargoLock.sha256) ||
    value.firstPartyCargoLock.packages !== 36
  ) {
    throw new Error('Cua Driver Node runtime first-party Cargo lock evidence is invalid.');
  }
  assertRecordWithKeys(
    value.rustToolchain,
    ['release', 'rustcCommit', 'releaseDate'],
    'Cua Driver Node runtime Rust toolchain',
  );
  if (
    value.rustToolchain.release !== '1.97.1' ||
    value.rustToolchain.rustcCommit !== '8bab26f4f' ||
    value.rustToolchain.releaseDate !== '2026-07-14'
  ) {
    throw new Error('Cua Driver Node runtime Rust toolchain evidence is invalid.');
  }
  if (!Array.isArray(value.compiledPackages) || value.compiledPackages.length !== 31) {
    throw new Error('Cua Driver Node runtime compiled package evidence is incomplete.');
  }
  const identities = new Set();
  for (const entry of value.compiledPackages) {
    assertRecordWithKeys(entry, ['name', 'release'], 'Cua Driver Node runtime package');
    assertFixedText(entry.name, 'Cua Driver Node runtime package name');
    assertFixedText(entry.release, 'Cua Driver Node runtime package release');
    const identity = `${entry.name}@${entry.release}`;
    if (identities.has(identity)) {
      throw new Error(`Cua Driver Node runtime package '${identity}' is duplicated.`);
    }
    identities.add(identity);
  }
  const closureSha256 = createHash('sha256')
    .update(JSON.stringify(value.compiledPackages))
    .digest('hex');
  if (closureSha256 !== '59a45fb943d0b01ad5f839e2de6914a830a1d43b83cb220c959892e778d89f24') {
    throw new Error(
      'Cua Driver Node runtime compiled package evidence does not match the release log.',
    );
  }
}

function assertMcpSdk(value) {
  assertRecordWithKeys(
    value,
    ['package', 'release', 'repository', 'sourceCommit', 'license', 'npmIntegrity'],
    'MCP SDK input',
  );
  if (value.package !== '@modelcontextprotocol/sdk') {
    throw new Error('MCP SDK package identity is invalid.');
  }
  assertRepository(value.repository, 'modelcontextprotocol/typescript-sdk');
  assertFixedText(value.release, 'MCP SDK release');
  assertSourceCommit(value.sourceCommit, 'MCP SDK');
  assertLicense(value.license, 'MCP SDK');
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value.npmIntegrity)) {
    throw new Error('MCP SDK npm integrity is invalid.');
  }
}

function assertArtifact(value, releaseTag) {
  const keys = releaseTag
    ? ['target', 'archive', 'name', 'url', 'bytes', 'sha256']
    : ['url', 'bytes', 'sha256'];
  assertRecordWithKeys(value, keys, 'pinned artifact');
  const url = new URL(value.url);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    url.port ||
    /(?:^|\/)latest(?:\/|$)/u.test(url.pathname)
  ) {
    throw new Error('Pinned artifact URL is not an exact reviewed GitHub HTTPS URL.');
  }
  if (releaseTag) {
    const expectedPath = `/trycua/cua/releases/download/${releaseTag}/${value.name}`;
    if (url.pathname !== expectedPath) {
      throw new Error(`Pinned Cua Driver URL does not match ${releaseTag}.`);
    }
  }
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0 || !isSha256(value.sha256)) {
    throw new Error('Pinned artifact size or digest is invalid.');
  }
}

function assertLicense(value, label) {
  assertRecordWithKeys(value, ['spdx', 'path', 'sha256'], `${label} license`);
  if (value.spdx !== 'MIT' || typeof value.path !== 'string' || !isSha256(value.sha256)) {
    throw new Error(`${label} license input is invalid.`);
  }
}

function assertRepository(value, expectedPath) {
  if (value !== `https://github.com/${expectedPath}`) {
    throw new Error(`Repository input must be the reviewed ${expectedPath} HTTPS URL.`);
  }
}

function assertRelease(release, tag, label) {
  assertFixedText(release, `${label} release`);
  assertFixedText(tag, `${label} tag`);
}

function assertFixedText(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.toLocaleLowerCase('en-US').includes('latest')
  ) {
    throw new Error(`${label} is not fixed.`);
  }
}

function assertSourceCommit(value, label) {
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error(`${label} source commit is invalid.`);
}

function isSha256(value) {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function assertRecordWithKeys(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object.`);
  }
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    !actualKeys.every((key, index) => key === expected[index])
  ) {
    throw new Error(`${label} does not have the exact reviewed fields.`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = loadAutomationRuntimeReleaseInputs();
  const readiness = automationRuntimeReleaseReadiness(inputs);
  process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
}
