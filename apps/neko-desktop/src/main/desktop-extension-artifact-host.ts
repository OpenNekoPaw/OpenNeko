import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform, Writable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { Reader, ZipReader } from '@zip.js/zip.js';
import type {
  AgentExtensionArtifactHostPort,
  AgentExtensionArtifactStageReceipt,
  AgentExtensionReviewedArtifact,
} from '@neko/agent-runtime/extensions';

const MAX_REDIRECTS = 5;
const MAX_EXPANDED_BYTES = 1_500_000_000;
const MAX_ARCHIVE_FILES = 20_000;

export interface DesktopExtensionArtifactHostOptions {
  readonly platform: { readonly os: string; readonly arch: string };
  readonly trustedKeys: ReadonlyMap<string, string | KeyObject>;
  readonly request?: typeof fetch;
}

export function createDesktopExtensionArtifactHost(
  options: DesktopExtensionArtifactHostOptions,
): AgentExtensionArtifactHostPort {
  const request = options.request ?? fetch;
  const trustedKeys = new Map(
    [...options.trustedKeys].map(([keyId, key]) => [
      keyId,
      typeof key === 'string' ? createPublicKey(key) : key,
    ]),
  );
  const stagingByOperation = new Map<string, string>();
  return {
    available: trustedKeys.size > 0,
    platform: options.platform,
    async stage(input) {
      input.signal.throwIfAborted();
      if (stagingByOperation.has(input.operationId)) {
        throw new Error(`Extension artifact operation '${input.operationId}' already exists.`);
      }
      assertStageLocation(input.installRoot, input.stagingRoot);
      await assertDiskBudget(input.installRoot, input.artifact.sizeBytes);
      await mkdir(input.stagingRoot, { recursive: false });
      stagingByOperation.set(input.operationId, input.stagingRoot);
      const archivePath = resolve(input.stagingRoot, '.artifact-download');
      try {
        const download = await downloadArtifact({
          request,
          artifact: input.artifact,
          archivePath,
          signal: input.signal,
          reportProgress: input.reportProgress,
        });
        input.signal.throwIfAborted();
        assertArtifactSignature(input.artifact, trustedKeys.get(input.artifact.signature.keyId));
        input.signal.throwIfAborted();
        await extractReviewedArchive(input.artifact.archive, archivePath, input.stagingRoot);
        input.signal.throwIfAborted();
        await rm(archivePath, { force: true });
        await validateContainedProvenance(input.stagingRoot, input.artifact);
        return Object.freeze({
          operationId: input.operationId,
          pluginId: input.pluginId,
          packageRelease: input.packageRelease,
          artifactUrl: input.artifact.url,
          finalUrl: download.finalUrl,
          sizeBytes: download.sizeBytes,
          sha256: download.sha256,
          signatureKeyId: input.artifact.signature.keyId,
          signatureVerified: true,
          provenance: input.artifact.provenance,
          licenseInventory: input.artifact.licenseInventory,
          stagingRoot: input.stagingRoot,
        } satisfies AgentExtensionArtifactStageReceipt);
      } catch (error) {
        await rm(input.stagingRoot, { recursive: true, force: true });
        stagingByOperation.delete(input.operationId);
        throw error;
      }
    },
    async commit(input) {
      const staged = stagingByOperation.get(input.operationId);
      if (staged !== input.stagingRoot) {
        throw new Error(
          `Extension artifact operation '${input.operationId}' does not own staging.`,
        );
      }
      try {
        await lstat(input.targetRoot);
        throw new Error('Extension artifact install target already exists.');
      } catch (error) {
        if (!isEnoent(error)) throw error;
      }
      await rename(input.stagingRoot, input.targetRoot);
      stagingByOperation.delete(input.operationId);
    },
    async discard(operationId) {
      const stagingRoot = stagingByOperation.get(operationId);
      if (!stagingRoot) return;
      await rm(stagingRoot, { recursive: true, force: true });
      stagingByOperation.delete(operationId);
    },
  };
}

export function createExtensionArtifactSignatureMessage(
  artifact: Pick<AgentExtensionReviewedArtifact, 'url' | 'sizeBytes' | 'sha256'>,
): Uint8Array {
  return Buffer.from(`${artifact.url}\n${artifact.sizeBytes}\n${artifact.sha256}\n`, 'utf8');
}

async function downloadArtifact(input: {
  readonly request: typeof fetch;
  readonly artifact: AgentExtensionReviewedArtifact;
  readonly archivePath: string;
  readonly signal: AbortSignal;
  readonly reportProgress: (transferredBytes: number) => void;
}): Promise<{ readonly finalUrl: string; readonly sizeBytes: number; readonly sha256: string }> {
  let currentUrl = input.artifact.url;
  let response: Response | undefined;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    input.signal.throwIfAborted();
    response = await input.request(currentUrl, { redirect: 'manual', signal: input.signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) throw new Error('Extension artifact redirect has no location.');
    const next = new URL(location, currentUrl);
    if (
      next.protocol !== 'https:' ||
      next.username ||
      next.password ||
      next.port ||
      !input.artifact.allowedHosts.includes(next.hostname)
    ) {
      throw new Error('Extension artifact redirect left the reviewed HTTPS hosts.');
    }
    await response.body?.cancel();
    currentUrl = next.href;
    response = undefined;
  }
  if (!response) throw new Error('Extension artifact exceeded the redirect limit.');
  if (!response.ok || !response.body) {
    throw new Error(`Extension artifact download failed with HTTP ${response.status}.`);
  }
  const responseUrl = response.url || currentUrl;
  const finalUrl = new URL(responseUrl);
  if (finalUrl.protocol !== 'https:' || !input.artifact.allowedHosts.includes(finalUrl.hostname)) {
    throw new Error('Extension artifact response came from an unreviewed host.');
  }
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) !== input.artifact.sizeBytes) {
    throw new Error('Extension artifact Content-Length does not match the catalog.');
  }
  const digest = createHash('sha256');
  let sizeBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.byteLength;
      if (sizeBytes > input.artifact.sizeBytes) {
        callback(new Error('Extension artifact exceeded the reviewed download size.'));
        return;
      }
      digest.update(chunk);
      input.reportProgress(sizeBytes);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.from(readWebResponse(response.body)),
    counter,
    createWriteStream(input.archivePath, { flags: 'wx' }),
    { signal: input.signal },
  );
  const sha256 = `sha256:${digest.digest('hex')}`;
  if (sizeBytes !== input.artifact.sizeBytes || sha256 !== input.artifact.sha256) {
    throw new Error('Extension artifact size or digest does not match the catalog.');
  }
  return { finalUrl: finalUrl.href, sizeBytes, sha256 };
}

function assertArtifactSignature(
  artifact: AgentExtensionReviewedArtifact,
  trustedKey: KeyObject | undefined,
): void {
  if (!trustedKey) {
    throw new Error(`Extension artifact signature key '${artifact.signature.keyId}' is untrusted.`);
  }
  const signature = Buffer.from(artifact.signature.value, 'base64');
  if (!verify(null, createExtensionArtifactSignatureMessage(artifact), trustedKey, signature)) {
    throw new Error('Extension artifact signature is invalid.');
  }
}

async function extractReviewedArchive(
  archive: AgentExtensionReviewedArtifact['archive'],
  archivePath: string,
  stagingRoot: string,
): Promise<void> {
  if (archive === 'zip') {
    await extractZip(archivePath, stagingRoot);
    return;
  }
  await extractTarGzip(archivePath, stagingRoot);
}

class NodeFileReader extends Reader<string> {
  private readonly filePath: string;
  private handle: Awaited<ReturnType<typeof open>> | undefined;

  constructor(filePath: string) {
    super(filePath);
    this.filePath = filePath;
  }

  override async init(): Promise<void> {
    this.handle = await open(this.filePath, 'r');
    this.size = (await this.handle.stat()).size;
  }

  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (!this.handle) throw new Error('ZIP reader is not initialized.');
    const buffer = Buffer.alloc(Math.min(length, this.size - index));
    const { bytesRead } = await this.handle.read(buffer, 0, buffer.length, index);
    return buffer.subarray(0, bytesRead);
  }

  async closeFile(): Promise<void> {
    await this.handle?.close();
    this.handle = undefined;
  }
}

async function extractZip(archivePath: string, stagingRoot: string): Promise<void> {
  const reader = new NodeFileReader(archivePath);
  const zip = new ZipReader(reader, {
    checkOverlappingEntryOnly: false,
    checkOverlappingEntry: true,
  });
  try {
    const entries = await zip.getEntries();
    const inventory = new ArchiveInventory();
    for (const entry of entries) {
      const mode = entry.unixMode ?? 0;
      const fileType = mode & 0o170000;
      const kind = entry.directory ? 'directory' : 'file';
      if (entry.encrypted || (!entry.directory && fileType !== 0 && fileType !== 0o100000)) {
        throw new Error('Extension ZIP contains an encrypted or linked entry.');
      }
      inventory.add(entry.filename, kind, entry.uncompressedSize);
    }
    for (const entry of entries) {
      const normalized = normalizeArchivePath(entry.filename);
      const target = resolveArchiveTarget(stagingRoot, normalized);
      if (entry.directory) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
      await entry.getData(Writable.toWeb(output), {
        checkSignature: true,
        checkOverlappingEntry: true,
      });
      await chmod(
        target,
        entry.executable || ((entry.unixMode ?? 0) & 0o111) !== 0 ? 0o755 : 0o644,
      );
    }
  } finally {
    await zip.close();
    await reader.closeFile();
  }
}

async function extractTarGzip(archivePath: string, stagingRoot: string): Promise<void> {
  const tarPath = resolve(stagingRoot, '.expanded.tar');
  let expandedBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      expandedBytes += chunk.byteLength;
      if (expandedBytes > MAX_EXPANDED_BYTES) {
        callback(new Error('Extension TAR expansion exceeded its byte limit.'));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    createReadStream(archivePath),
    createGunzip(),
    counter,
    createWriteStream(tarPath, { flags: 'wx' }),
  );
  const handle = await open(tarPath, 'r');
  const inventory = new ArchiveInventory();
  try {
    let offset = 0;
    while (offset + 512 <= expandedBytes) {
      const header = Buffer.alloc(512);
      const { bytesRead } = await handle.read(header, 0, header.length, offset);
      if (bytesRead !== 512) throw new Error('Extension TAR header is truncated.');
      if (header.every((value) => value === 0)) break;
      validateTarChecksum(header);
      const name = readTarText(header, 0, 100);
      const prefix = readTarText(header, 345, 155);
      const path = prefix ? `${prefix}/${name}` : name;
      const size = readTarOctal(header, 124, 12);
      const mode = readTarOctal(header, 100, 8);
      const type = String.fromCharCode(header[156] ?? 0);
      const kind = type === '5' ? 'directory' : type === '0' || type === '\0' ? 'file' : undefined;
      if (!kind || (kind === 'directory' && size !== 0)) {
        throw new Error('Extension TAR contains a link or unsupported entry type.');
      }
      const normalized = inventory.add(path, kind, size);
      const target = resolveArchiveTarget(stagingRoot, normalized);
      if (kind === 'directory') {
        await mkdir(target, { recursive: true });
      } else {
        await mkdir(dirname(target), { recursive: true });
        if (size === 0) {
          await writeFile(target, new Uint8Array(), { flag: 'wx', mode: 0o600 });
        } else {
          await pipeline(
            createReadStream(tarPath, { start: offset + 512, end: offset + 512 + size - 1 }),
            createWriteStream(target, { flags: 'wx', mode: 0o600 }),
          );
        }
        await chmod(target, (mode & 0o111) !== 0 ? 0o755 : 0o644);
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } finally {
    await handle.close();
    await rm(tarPath, { force: true });
  }
}

class ArchiveInventory {
  private readonly entries = new Map<string, 'file' | 'directory'>();
  private expandedBytes = 0;

  add(rawPath: string, kind: 'file' | 'directory', size: number): string {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('Extension archive entry size is invalid.');
    }
    const path = normalizeArchivePath(rawPath);
    const key = path.toLocaleLowerCase('en-US');
    if (this.entries.has(key)) {
      throw new Error('Extension archive contains a duplicate or case-colliding path.');
    }
    const segments = key.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      if (this.entries.get(segments.slice(0, index).join('/')) === 'file') {
        throw new Error('Extension archive places an entry below a file.');
      }
    }
    if (
      kind === 'file' &&
      [...this.entries.keys()].some((candidate) => candidate.startsWith(`${key}/`))
    ) {
      throw new Error('Extension archive replaces a directory with a file.');
    }
    this.entries.set(key, kind);
    if (this.entries.size > MAX_ARCHIVE_FILES) {
      throw new Error('Extension archive contains too many entries.');
    }
    this.expandedBytes += size;
    if (this.expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error('Extension archive expanded size exceeds its limit.');
    }
    return path;
  }
}

function normalizeArchivePath(value: string): string {
  const path = value.replace(/\/$/u, '');
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0')) {
    throw new Error('Extension archive path is unsafe.');
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
        segment.includes(':') ||
        isWindowsReservedSegment(segment),
    )
  ) {
    throw new Error('Extension archive path is unsafe on a supported platform.');
  }
  return segments.join('/');
}

function isWindowsReservedSegment(segment: string): boolean {
  const stem = segment.split('.', 1)[0]?.toLocaleLowerCase('en-US') ?? '';
  if (['con', 'prn', 'aux', 'nul'].includes(stem)) return true;
  if (stem.length !== 4 || (stem.slice(0, 3) !== 'com' && stem.slice(0, 3) !== 'lpt')) {
    return false;
  }
  const unit = stem.charCodeAt(3) - '0'.charCodeAt(0);
  return unit >= 1 && unit <= 9;
}

function resolveArchiveTarget(root: string, path: string): string {
  const target = resolve(root, path);
  const fromRoot = relative(resolve(root), target);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('Extension archive target escaped staging.');
  }
  return target;
}

function validateTarChecksum(header: Buffer): void {
  const expected = readTarOctal(header, 148, 8);
  const copy = Buffer.from(header);
  copy.fill(0x20, 148, 156);
  const actual = copy.reduce((sum, value) => sum + value, 0);
  if (actual !== expected) throw new Error('Extension TAR header checksum is invalid.');
}

function readTarText(header: Buffer, offset: number, length: number): string {
  return header
    .subarray(offset, offset + length)
    .toString('utf8')
    .replace(/\0.*$/u, '');
}

function readTarOctal(header: Buffer, offset: number, length: number): number {
  const value = readTarText(header, offset, length).trim();
  if (!/^[0-7]+$/u.test(value)) throw new Error('Extension TAR numeric field is invalid.');
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) throw new Error('Extension TAR numeric field is too large.');
  return parsed;
}

async function validateContainedProvenance(
  stagingRoot: string,
  artifact: AgentExtensionReviewedArtifact,
): Promise<void> {
  const provenancePath = resolve(stagingRoot, '.openneko-plugin', 'artifact-provenance.json');
  const provenance = parseExactJson(await readFile(provenancePath, 'utf8'));
  if (
    !hasExactKeys(provenance, [
      'sourceRepository',
      'sourceCommit',
      'buildRecipeSha256',
      'licenseInventory',
    ]) ||
    provenance.sourceRepository !== artifact.provenance.sourceRepository ||
    provenance.sourceCommit !== artifact.provenance.sourceCommit ||
    provenance.buildRecipeSha256 !== artifact.provenance.buildRecipeSha256 ||
    !isRecord(provenance.licenseInventory) ||
    !hasExactKeys(provenance.licenseInventory, ['path', 'sha256']) ||
    provenance.licenseInventory.path !== artifact.licenseInventory.path ||
    provenance.licenseInventory.sha256 !== artifact.licenseInventory.sha256
  ) {
    throw new Error('Extension artifact contained provenance does not match the catalog.');
  }
  const licensePath = resolveArchiveTarget(stagingRoot, artifact.licenseInventory.path);
  const licenseDigest = `sha256:${createHash('sha256')
    .update(await readFile(licensePath))
    .digest('hex')}`;
  if (licenseDigest !== artifact.licenseInventory.sha256) {
    throw new Error('Extension artifact license inventory digest is invalid.');
  }
}

function parseExactJson(source: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)) {
    throw new Error('Extension artifact provenance document is invalid.');
  }
  return value;
}

async function* readWebResponse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array, void, void> {
  const reader = body.getReader();
  let completed = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        completed = true;
        return;
      }
      yield result.value;
    }
  } finally {
    if (!completed) await reader.cancel();
    reader.releaseLock();
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

async function assertDiskBudget(installRoot: string, archiveBytes: number): Promise<void> {
  const stats = await statfs(installRoot);
  const available = stats.bavail * stats.bsize;
  const required = archiveBytes + MAX_EXPANDED_BYTES;
  if (!Number.isSafeInteger(available) || available < required) {
    throw new Error('Extension artifact staging has insufficient disk space.');
  }
}

function assertStageLocation(installRoot: string, stagingRoot: string): void {
  const fromRoot = relative(resolve(installRoot), resolve(stagingRoot));
  if (
    !fromRoot ||
    fromRoot.startsWith('..') ||
    isAbsolute(fromRoot) ||
    !basename(stagingRoot).startsWith('.artifact-')
  ) {
    throw new Error('Extension artifact staging root is outside the install authority.');
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === 'ENOENT'
  );
}
