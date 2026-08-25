import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDshRuntimeDirectory, fingerprintDirectory } from './dsh-runtime-closure.mjs';

const TARGET = 'darwin-arm64';
const NODE_RELEASE = '24.18.0';
const DSH_RELEASE = '0.1.0-rc.8';
const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const developmentInputRoot = resolve(
  fileURLToPath(new URL('./dsh-development-runtime/', import.meta.url)),
);
const packageInputs = Object.freeze([
  Object.freeze({ name: '@neko/dsh-bridge', path: 'packages/dsh-bridge' }),
  Object.freeze({ name: '@neko/agent-dsh-plugin', path: 'packages/agent/dsh-plugin' }),
  Object.freeze({ name: '@neko/chara-dsh-plugin', path: 'packages/chara/dsh-plugin' }),
  Object.freeze({ name: '@neko/world-dsh-plugin', path: 'packages/world/dsh-plugin' }),
  Object.freeze({
    name: '@neko/generation-dsh-plugin',
    path: 'packages/generation/dsh-plugin',
  }),
  Object.freeze({ name: '@neko/canvas-dsh-plugin', path: 'packages/canvas/dsh-plugin' }),
  Object.freeze({ name: '@neko/cut-dsh-plugin', path: 'packages/cut/dsh-plugin' }),
  Object.freeze({ name: '@neko/content-dsh-plugin', path: 'packages/content/dsh-plugin' }),
]);
const workspaceSourceInputs = Object.freeze([
  ...packageInputs.map(({ path }) => path),
  'packages/agent/contracts',
  'packages/canvas/domain',
  'packages/chara/domain',
  'packages/content/domain',
  'packages/cut/domain',
  'packages/generation/domain',
  'packages/world/domain',
]);
const profileBundles = Object.freeze([
  '@deepseek-ai/dsh-base',
  ...packageInputs.map(({ name }) => name),
]);

export function resolveDshDevelopmentRuntimeRoot(appRoot) {
  return join(realpathSync(appRoot), '.dsh-development-runtime', TARGET);
}

export function listDshDevelopmentInputFiles(options = {}) {
  const projectRoot = realpathSync(options.repositoryRoot ?? repositoryRoot);
  const inputRoot = realpathSync(options.inputRoot ?? developmentInputRoot);
  const files = [
    join(inputRoot, 'package.json'),
    join(inputRoot, 'pnpm-lock.yaml'),
    fileURLToPath(import.meta.url),
  ];
  for (const relativeRoot of workspaceSourceInputs) {
    const packageRoot = join(projectRoot, relativeRoot);
    for (const name of [
      'package.json',
      'cordis.patch.yml',
      'tsconfig.json',
      'tsconfig.build.json',
    ]) {
      const path = join(packageRoot, name);
      if (existsSync(path)) files.push(path);
    }
    collectInputFiles(join(packageRoot, 'src'), files);
  }
  return Object.freeze(files.sort());
}

export function prepareDshDevelopmentRuntime(options = {}) {
  const projectRoot = realpathSync(options.repositoryRoot ?? repositoryRoot);
  const appRoot = realpathSync(options.appRoot ?? join(projectRoot, 'apps', 'neko-desktop'));
  const runtimeRoot = options.runtimeRoot ?? resolveDshDevelopmentRuntimeRoot(appRoot);
  if (!isAbsolute(runtimeRoot)) {
    throw new Error('Desktop development DSH runtime root must be absolute.');
  }

  const inputRoot = realpathSync(options.inputRoot ?? developmentInputRoot);
  const inputFingerprint = fingerprintDevelopmentInputs(projectRoot, inputRoot);
  const stampPath = join(runtimeRoot, '.development-input.sha256');
  const verifyRuntime = options.verifyRuntime ?? verifyDevelopmentRuntime;
  if (existsSync(runtimeRoot) && readOptionalText(stampPath) === `${inputFingerprint}\n`) {
    try {
      verifyRuntime(runtimeRoot);
      return realpathSync(runtimeRoot);
    } catch {
      // A generated cache is disposable; rebuild through the same canonical path.
    }
  }

  const parentRoot = dirname(runtimeRoot);
  mkdirSync(parentRoot, { recursive: true });
  const operationId = randomUUID();
  const stagingRoot = `${runtimeRoot}.staging-${operationId}`;
  const replacedRoot = `${runtimeRoot}.replaced-${operationId}`;
  let previousMoved = false;
  let stagedInstalled = false;
  let preserveReplacedRoot = false;
  try {
    mkdirSync(stagingRoot, { recursive: false });
    const buildClosure = options.buildClosure ?? buildDshDevelopmentRuntimeClosure;
    buildClosure({
      repositoryRoot: projectRoot,
      inputRoot,
      runtimeRoot: stagingRoot,
      executeFile: options.executeFile ?? execFileSync,
    });
    verifyRuntime(stagingRoot);
    writeFileSync(join(stagingRoot, '.development-input.sha256'), `${inputFingerprint}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    if (existsSync(runtimeRoot)) {
      renameSync(runtimeRoot, replacedRoot);
      previousMoved = true;
    }
    renameSync(stagingRoot, runtimeRoot);
    stagedInstalled = true;
    if (previousMoved) rmSync(replacedRoot, { recursive: true, force: false });
    return realpathSync(runtimeRoot);
  } catch (error) {
    const recoveryErrors = [error];
    try {
      if (stagedInstalled) rmSync(runtimeRoot, { recursive: true, force: true });
      if (previousMoved && existsSync(replacedRoot)) renameSync(replacedRoot, runtimeRoot);
    } catch (recoveryError) {
      preserveReplacedRoot = true;
      recoveryErrors.push(recoveryError);
    }
    if (recoveryErrors.length > 1) {
      throw new AggregateError(
        recoveryErrors,
        'Desktop development DSH runtime replacement failed and its previous cache could not be restored.',
      );
    }
    throw error;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
    if (!preserveReplacedRoot) rmSync(replacedRoot, { recursive: true, force: true });
  }
}

function buildDshDevelopmentRuntimeClosure(options) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(
      `Desktop development DSH runtime supports darwin-arm64; received ${process.platform}-${process.arch}.`,
    );
  }
  const executeFile = options.executeFile ?? execFileSync;
  for (const packageInput of packageInputs) {
    executeFile('pnpm', ['--filter', packageInput.name, 'build'], {
      cwd: options.repositoryRoot,
      stdio: 'inherit',
    });
  }

  const installRoot = join(options.runtimeRoot, '.install');
  mkdirSync(installRoot, { recursive: false });
  cpSync(join(options.inputRoot, 'package.json'), join(installRoot, 'package.json'));
  cpSync(join(options.inputRoot, 'pnpm-lock.yaml'), join(installRoot, 'pnpm-lock.yaml'));
  executeFile(
    'pnpm',
    [
      'install',
      '--prod',
      '--offline',
      '--frozen-lockfile',
      '--ignore-workspace',
      '--node-linker=hoisted',
      '--ignore-scripts',
    ],
    { cwd: installRoot, stdio: 'inherit' },
  );

  const payloadRoot = join(options.runtimeRoot, 'payload');
  const moduleRoot = join(payloadRoot, 'lib', 'node_modules');
  const installedModules = join(installRoot, 'node_modules');
  const nodePackageRoot = join(installedModules, 'node-bin-darwin-arm64');
  const nodeSource = join(nodePackageRoot, 'bin', 'node');
  assertRegularFile(nodeSource, 'Locked Node distribution executable');
  mkdirSync(join(payloadRoot, 'bin'), { recursive: true });
  cpSync(nodeSource, join(payloadRoot, 'bin', 'node'));
  rmSync(join(installedModules, '.bin'), { recursive: true, force: true });
  rmSync(nodePackageRoot, { recursive: true, force: false });
  mkdirSync(dirname(moduleRoot), { recursive: true });
  renameSync(installedModules, moduleRoot);
  rmSync(installRoot, { recursive: true, force: false });

  for (const packageInput of packageInputs) {
    copyPublishedPackage(
      join(options.repositoryRoot, packageInput.path),
      join(moduleRoot, ...packageInput.name.split('/')),
    );
  }

  const profileRoot = join(payloadRoot, 'dsh-home', 'profiles', 'openneko');
  mkdirSync(profileRoot, { recursive: true });
  const profileManifest = join(profileRoot, 'package.json');
  const profilePatch = join(profileRoot, 'cordis.patch.yml');
  writeFileSync(
    profileManifest,
    `${JSON.stringify(
      {
        name: 'openneko-dsh-profile',
        private: true,
        dsh: { profile: { bundles: profileBundles } },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(profilePatch, '[]\n');

  const licensesPath = join(payloadRoot, 'THIRD_PARTY_LICENSES.json');
  writeFileSync(
    licensesPath,
    `${JSON.stringify(collectThirdPartyLicenses(moduleRoot), null, 2)}\n`,
  );
  const dshEntrypoint = join(moduleRoot, '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  assertRegularFile(dshEntrypoint, 'Locked DSH entrypoint');
  const node = join(payloadRoot, 'bin', 'node');
  const closure = fingerprintDirectory(payloadRoot);
  writeFileSync(
    join(options.runtimeRoot, 'descriptor.json'),
    `${JSON.stringify(
      {
        target: TARGET,
        node: {
          release: NODE_RELEASE,
          executable: fileDescriptor(options.runtimeRoot, node),
        },
        dsh: {
          release: DSH_RELEASE,
          entrypoint: fileDescriptor(options.runtimeRoot, dshEntrypoint),
        },
        profile: {
          name: 'openneko',
          manifest: fileDescriptor(options.runtimeRoot, profileManifest),
          patch: fileDescriptor(options.runtimeRoot, profilePatch),
        },
        closure: { directory: 'payload', ...closure },
        licenses: fileDescriptor(options.runtimeRoot, licensesPath),
      },
      null,
      2,
    )}\n`,
  );
}

function verifyDevelopmentRuntime(runtimeRoot) {
  return assertDshRuntimeDirectory(runtimeRoot, TARGET, { qualify: true, verifyTree: true });
}

function fingerprintDevelopmentInputs(projectRoot, inputRoot) {
  const digest = createHash('sha256');
  const files = listDshDevelopmentInputFiles({ repositoryRoot: projectRoot, inputRoot });
  for (const path of files) {
    digest.update(relative(projectRoot, path).split(sep).join('/'));
    digest.update('\0');
    digest.update(readFileSync(path));
    digest.update('\n');
  }
  return digest.digest('hex');
}

function collectInputFiles(directory, files) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink())
      throw new Error(`DSH development input must not be a symlink: ${path}.`);
    if (stats.isDirectory()) collectInputFiles(path, files);
    else if (stats.isFile()) files.push(path);
  }
}

function copyPublishedPackage(sourceRoot, destinationRoot) {
  const manifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    throw new Error(`DSH contribution does not declare published files: ${sourceRoot}.`);
  }
  mkdirSync(destinationRoot, { recursive: true });
  cpSync(join(sourceRoot, 'package.json'), join(destinationRoot, 'package.json'));
  for (const entry of manifest.files) {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      entry.includes('..') ||
      isAbsolute(entry)
    ) {
      throw new Error(`DSH contribution published file is invalid: ${String(entry)}.`);
    }
    const source = join(sourceRoot, entry);
    if (!existsSync(source)) {
      throw new Error(`DSH contribution published file is missing: ${source}.`);
    }
    cpSync(source, join(destinationRoot, entry), { recursive: true, errorOnExist: true });
  }
}

function collectThirdPartyLicenses(moduleRoot) {
  const entries = new Map();
  visitNodeModules(moduleRoot, entries);
  entries.set(`node@${NODE_RELEASE}`, {
    name: 'node',
    version: NODE_RELEASE,
    license: 'MIT',
    sourcePackage: `node-bin-darwin-arm64@${NODE_RELEASE}`,
  });
  return [...entries.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

function visitNodeModules(moduleRoot, entries) {
  if (!existsSync(moduleRoot)) return;
  for (const name of readdirSync(moduleRoot).sort()) {
    if (name.startsWith('.')) continue;
    if (name.startsWith('@')) {
      for (const packageName of readdirSync(join(moduleRoot, name)).sort()) {
        visitPackage(join(moduleRoot, name, packageName), entries);
      }
    } else {
      visitPackage(join(moduleRoot, name), entries);
    }
  }
}

function visitPackage(packageRoot, entries) {
  const stats = lstatSync(packageRoot);
  if (stats.isSymbolicLink()) {
    throw new Error(`DSH runtime dependency must not be a symlink: ${packageRoot}.`);
  }
  if (!stats.isDirectory()) return;
  const manifestPath = join(packageRoot, 'package.json');
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    typeof manifest.name === 'string' &&
    !manifest.name.startsWith('@neko/') &&
    typeof manifest.version === 'string'
  ) {
    entries.set(`${manifest.name}@${manifest.version}`, {
      name: manifest.name,
      version: manifest.version,
      license: normalizeLicense(manifest),
    });
  }
  visitNodeModules(join(packageRoot, 'node_modules'), entries);
}

function normalizeLicense(manifest) {
  if (typeof manifest.license === 'string' && manifest.license.length > 0) return manifest.license;
  if (Array.isArray(manifest.licenses)) {
    const values = manifest.licenses
      .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
      .filter((entry) => typeof entry === 'string' && entry.length > 0);
    if (values.length > 0) return values.join(' OR ');
  }
  return 'UNKNOWN';
}

function fileDescriptor(runtimeRoot, path) {
  return {
    file: relative(runtimeRoot, path).split(sep).join('/'),
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  };
}

function assertRegularFile(path, label) {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file.`);
  }
}

function readOptionalText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
