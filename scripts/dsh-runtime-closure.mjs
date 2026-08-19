import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const SUPPORTED_TARGET = 'darwin-arm64';
const DSH_RELEASE = '0.1.0-rc.7';

export function stagePackagedDshRuntime(stageRoot, target, runtimeSourceRoot) {
  if (!runtimeSourceRoot) {
    throw new Error(
      `OpenNeko ${target} packaging requires NEKO_DSH_RUNTIME_ROOT with a verified DSH runtime closure.`,
    );
  }
  const source = realpathSync(runtimeSourceRoot);
  assertDshRuntimeDirectory(source, target, { qualify: true, verifyTree: true });
  const destination = join(stageRoot, 'dsh-runtime', target);
  cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  assertDshRuntimeDirectory(destination, target, { qualify: true, verifyTree: true });
  return Object.freeze({ runtimeRoot: destination });
}

export function assertDshRuntimeDirectory(runtimeRoot, target, options = {}) {
  if (target !== SUPPORTED_TARGET) {
    throw new Error(`Unsupported DSH runtime target: ${target}.`);
  }
  const root = realpathSync(runtimeRoot);
  const descriptorPath = join(root, 'descriptor.json');
  if (!existsSync(descriptorPath)) {
    throw new Error(`DSH runtime descriptor is missing: ${descriptorPath}.`);
  }
  const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));
  assertDescriptor(descriptor, target);

  const node = assertRuntimeFile(root, descriptor.node.executable);
  const dshEntrypoint = assertRuntimeFile(root, descriptor.dsh.entrypoint);
  const profileManifest = assertRuntimeFile(root, descriptor.profile.manifest);
  const profilePatch = assertRuntimeFile(root, descriptor.profile.patch);
  assertRuntimeFile(root, descriptor.licenses);

  const profile = JSON.parse(readFileSync(profileManifest, 'utf8'));
  if (
    !isRecordWithExactKeys(profile, ['name', 'private', 'dsh']) ||
    profile.name !== 'openneko-dsh-profile' ||
    profile.private !== true ||
    !isRecordWithExactKeys(profile.dsh, ['profile']) ||
    !isRecordWithExactKeys(profile.dsh.profile, ['bundles']) ||
    !Array.isArray(profile.dsh?.profile?.bundles) ||
    JSON.stringify(profile.dsh.profile.bundles) !==
      JSON.stringify([
        '@deepseek-ai/dsh-base',
        '@neko/dsh-bridge',
        '@neko/chara-dsh-plugin',
        '@neko/generation-dsh-plugin',
        '@neko/canvas-dsh-plugin',
        '@neko/cut-dsh-plugin',
        '@neko/content-dsh-plugin',
      ])
  ) {
    throw new Error('DSH runtime profile manifest does not declare the canonical OpenNeko bundles.');
  }

  if (options.verifyTree) {
    const tree = fingerprintDirectory(join(root, descriptor.closure.directory));
    if (
      tree.files !== descriptor.closure.files ||
      tree.bytes !== descriptor.closure.bytes ||
      tree.sha256 !== descriptor.closure.sha256
    ) {
      throw new Error('DSH runtime dependency closure fingerprint does not match its descriptor.');
    }
  }

  if (options.qualify) {
    const nodeRelease = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim();
    if (nodeRelease !== `v${descriptor.node.release}`) {
      throw new Error(
        `DSH runtime Node release mismatch: expected v${descriptor.node.release}, received ${nodeRelease}.`,
      );
    }
    const dshRelease = execFileSync(node, [dshEntrypoint, '--version'], {
      encoding: 'utf8',
      env: {},
    }).trim();
    if (dshRelease !== descriptor.dsh.release) {
      throw new Error(
        `DSH runtime CLI release mismatch: expected ${descriptor.dsh.release}, received ${dshRelease}.`,
      );
    }
  }

  return Object.freeze({
    descriptor,
    node,
    dshEntrypoint,
    profileManifest,
    profilePatch,
  });
}

export function fingerprintDirectory(directory) {
  const root = realpathSync(directory);
  const entries = [];
  collectFiles(root, root, entries);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const digest = createHash('sha256');
  let bytes = 0;
  for (const entry of entries) {
    bytes += entry.bytes;
    digest.update(entry.path);
    digest.update('\0');
    digest.update(String(entry.bytes));
    digest.update('\0');
    digest.update(entry.sha256);
    digest.update('\n');
  }
  return Object.freeze({ files: entries.length, bytes, sha256: digest.digest('hex') });
}

function collectFiles(root, directory, entries) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) {
      throw new Error(`DSH runtime closure must not contain symlinks: ${relative(root, path)}.`);
    }
    if (stats.isDirectory()) {
      collectFiles(root, path, entries);
      continue;
    }
    if (!stats.isFile()) {
      throw new Error(`DSH runtime closure contains a non-file entry: ${relative(root, path)}.`);
    }
    const content = readFileSync(path);
    entries.push({
      path: relative(root, path).split(sep).join('/'),
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
}

function assertDescriptor(descriptor, target) {
  if (
    !isRecordWithExactKeys(descriptor, [
      'target',
      'node',
      'dsh',
      'profile',
      'closure',
      'licenses',
    ]) ||
    descriptor.target !== target ||
    !isRecordWithExactKeys(descriptor.node, ['release', 'executable']) ||
    typeof descriptor.node.release !== 'string' ||
    !/^24\.\d+\.\d+$/u.test(descriptor.node.release) ||
    !isRecordWithExactKeys(descriptor.dsh, ['release', 'entrypoint']) ||
    descriptor.dsh.release !== DSH_RELEASE ||
    !isRecordWithExactKeys(descriptor.profile, ['name', 'manifest', 'patch']) ||
    descriptor.profile.name !== 'openneko' ||
    !isRecordWithExactKeys(descriptor.closure, ['directory', 'files', 'bytes', 'sha256']) ||
    descriptor.closure.directory !== 'payload' ||
    !Number.isSafeInteger(descriptor.closure.files) ||
    descriptor.closure.files <= 0 ||
    !Number.isSafeInteger(descriptor.closure.bytes) ||
    descriptor.closure.bytes <= 0 ||
    !isSha256(descriptor.closure.sha256)
  ) {
    throw new Error(`DSH runtime descriptor is invalid for ${target}.`);
  }
  for (const entry of [
    descriptor.node.executable,
    descriptor.dsh.entrypoint,
    descriptor.profile.manifest,
    descriptor.profile.patch,
    descriptor.licenses,
  ]) {
    assertFileDescriptor(entry);
  }
  if (
    descriptor.node.executable.file !== 'payload/bin/node' ||
    descriptor.dsh.entrypoint.file !==
      'payload/lib/node_modules/@deepseek-ai/dsh/lib/bin.js' ||
    descriptor.profile.manifest.file !== 'payload/dsh-home/profiles/openneko/package.json' ||
    descriptor.profile.patch.file !== 'payload/dsh-home/profiles/openneko/cordis.patch.yml' ||
    descriptor.licenses.file !== 'payload/THIRD_PARTY_LICENSES.json'
  ) {
    throw new Error('DSH runtime descriptor does not use the canonical packaged layout.');
  }
}

function assertRuntimeFile(root, entry) {
  assertFileDescriptor(entry);
  const unresolved = join(root, entry.file);
  const stats = lstatSync(unresolved);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`DSH runtime entry must be a regular file: ${entry.file}.`);
  }
  const path = realpathSync(unresolved);
  const relativePath = relative(root, path);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`DSH runtime entry escapes its root: ${entry.file}.`);
  }
  if (sha256File(path) !== entry.sha256) {
    throw new Error(`DSH runtime checksum mismatch for ${entry.file}.`);
  }
  return path;
}

function assertFileDescriptor(entry) {
  if (
    !isRecordWithExactKeys(entry, ['file', 'sha256']) ||
    typeof entry.file !== 'string' ||
    isAbsolute(entry.file) ||
    entry.file.includes('\\') ||
    entry.file.split('/').includes('..') ||
    !entry.file.startsWith('payload/') ||
    !isSha256(entry.sha256)
  ) {
    throw new Error('DSH runtime file descriptor is invalid.');
  }
}

function isRecordWithExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
