import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
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
import {
  DESKTOP_EXTENSION_MAX_EXPANDED_BYTES,
  DesktopExtensionArchiveInventory,
  assertDesktopExtensionDiskBudget,
  normalizeDesktopExtensionArchivePath,
  resolveDesktopExtensionArchiveTarget,
} from './desktop-extension-archive-policy';

const MAX_REDIRECTS = 5;
const MAX_RESUME_ATTEMPTS = 1;

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
      await assertDiskBudget(input.installRoot, input.artifact.sizeBytes, input.artifact.archive);
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
        await extractReviewedArchive(
          input.artifact.archive,
          archivePath,
          input.stagingRoot,
          input.signal,
        );
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
  artifact: Pick<AgentExtensionReviewedArtifact, 'deliverySource' | 'url' | 'sizeBytes' | 'sha256'>,
): Uint8Array {
  return Buffer.from(
    `${artifact.deliverySource}\n${artifact.url}\n${artifact.sizeBytes}\n${artifact.sha256}\n`,
    'utf8',
  );
}

async function downloadArtifact(input: {
  readonly request: typeof fetch;
  readonly artifact: AgentExtensionReviewedArtifact;
  readonly archivePath: string;
  readonly signal: AbortSignal;
  readonly reportProgress: (transferredBytes: number) => void;
}): Promise<{ readonly finalUrl: string; readonly sizeBytes: number; readonly sha256: string }> {
  let resume: ArtifactDownloadResume | undefined;
  let reportedBytes = 0;
  for (let attempt = 0; attempt <= MAX_RESUME_ATTEMPTS; attempt += 1) {
    const { response, finalUrl } = await requestArtifactResponse(input, resume);
    const responseBody = await validateArtifactResponse(response, input.artifact, resume);
    const digest = createHash('sha256');
    let sizeBytes = resume?.transferredBytes ?? 0;
    if (resume) {
      await hashExistingArtifact(input.archivePath, sizeBytes, digest);
    }
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.byteLength;
        if (sizeBytes > input.artifact.sizeBytes) {
          callback(new Error('Extension artifact exceeded the reviewed download size.'));
          return;
        }
        digest.update(chunk);
        if (sizeBytes > reportedBytes) {
          input.reportProgress(sizeBytes);
          reportedBytes = sizeBytes;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        Readable.from(readWebResponse(responseBody)),
        counter,
        createWriteStream(input.archivePath, { flags: resume ? 'a' : 'wx' }),
        { signal: input.signal },
      );
    } catch (error) {
      if (
        !(error instanceof ArtifactDownloadInterruptedError) ||
        input.signal.aborted ||
        resume !== undefined ||
        attempt >= MAX_RESUME_ATTEMPTS
      ) {
        throw error;
      }
      resume = await createArtifactDownloadResume({
        archivePath: input.archivePath,
        artifact: input.artifact,
        response,
        finalUrl,
        transferredBytes: sizeBytes,
      });
      if (!resume) throw error;
      continue;
    }
    const sha256 = `sha256:${digest.digest('hex')}`;
    if (sizeBytes !== input.artifact.sizeBytes || sha256 !== input.artifact.sha256) {
      throw new Error('Extension artifact size or digest does not match the catalog.');
    }
    return { finalUrl, sizeBytes, sha256 };
  }
  throw new Error('Extension artifact resume attempts were exhausted.');
}

interface ArtifactDownloadResume {
  readonly url: string;
  readonly transferredBytes: number;
  readonly validator: ArtifactDownloadValidator;
}

interface ArtifactDownloadValidator {
  readonly header: 'etag' | 'last-modified';
  readonly value: string;
}

async function requestArtifactResponse(
  input: {
    readonly request: typeof fetch;
    readonly artifact: AgentExtensionReviewedArtifact;
    readonly signal: AbortSignal;
  },
  resume: ArtifactDownloadResume | undefined,
): Promise<{ readonly response: Response; readonly finalUrl: string }> {
  let currentUrl = assertReviewedArtifactUrl(resume?.url ?? input.artifact.url, input.artifact);
  let response: Response | undefined;
  const requestHeaders = resume
    ? {
        Range: `bytes=${resume.transferredBytes}-`,
        'If-Range': resume.validator.value,
      }
    : undefined;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    input.signal.throwIfAborted();
    response = await input.request(currentUrl, {
      redirect: 'manual',
      signal: input.signal,
      ...(requestHeaders ? { headers: requestHeaders } : {}),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location) {
      await response.body?.cancel();
      throw new Error('Extension artifact redirect has no location.');
    }
    await response.body?.cancel();
    currentUrl = assertReviewedArtifactUrl(new URL(location, currentUrl).href, input.artifact);
    response = undefined;
  }
  if (!response) throw new Error('Extension artifact exceeded the redirect limit.');
  let finalUrl: string;
  try {
    finalUrl = assertReviewedArtifactUrl(response.url || currentUrl, input.artifact);
  } catch (error) {
    await response.body?.cancel();
    throw error;
  }
  return { response, finalUrl };
}

function assertReviewedArtifactUrl(
  value: string,
  artifact: AgentExtensionReviewedArtifact,
): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !artifact.allowedHosts.includes(url.hostname)
  ) {
    throw new Error('Extension artifact request left the reviewed HTTPS hosts.');
  }
  return url.href;
}

async function validateArtifactResponse(
  response: Response,
  artifact: AgentExtensionReviewedArtifact,
  resume: ArtifactDownloadResume | undefined,
): Promise<ReadableStream<Uint8Array>> {
  try {
    if (!response.body) {
      throw new Error(`Extension artifact download failed with HTTP ${response.status}.`);
    }
    if (!resume) {
      if (response.status !== 200) {
        throw new Error(`Extension artifact download failed with HTTP ${response.status}.`);
      }
      assertContentLength(response, artifact.sizeBytes);
      return response.body;
    }
    if (response.status !== 206) {
      throw new Error('Extension artifact resume did not return partial content.');
    }
    if (response.headers.get(resume.validator.header) !== resume.validator.value) {
      throw new Error('Extension artifact resume validator changed.');
    }
    const contentRange = response.headers.get('content-range');
    const expectedRange = `bytes ${resume.transferredBytes}-${artifact.sizeBytes - 1}/${artifact.sizeBytes}`;
    if (contentRange !== expectedRange) {
      throw new Error('Extension artifact resume Content-Range is invalid.');
    }
    assertContentLength(response, artifact.sizeBytes - resume.transferredBytes);
    return response.body;
  } catch (error) {
    await response.body?.cancel();
    throw error;
  }
}

function assertContentLength(response: Response, expectedBytes: number): void {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength === null) return;
  const parsedLength = Number(declaredLength);
  if (
    !/^[0-9]+$/u.test(declaredLength) ||
    !Number.isSafeInteger(parsedLength) ||
    parsedLength !== expectedBytes
  ) {
    throw new Error('Extension artifact Content-Length does not match the catalog.');
  }
}

async function createArtifactDownloadResume(input: {
  readonly archivePath: string;
  readonly artifact: AgentExtensionReviewedArtifact;
  readonly response: Response;
  readonly finalUrl: string;
  readonly transferredBytes: number;
}): Promise<ArtifactDownloadResume | undefined> {
  if (!hasByteRangeSupport(input.response.headers)) {
    return undefined;
  }
  const validator = readArtifactDownloadValidator(input.response.headers);
  if (!validator) return undefined;
  let file: Awaited<ReturnType<typeof stat>>;
  try {
    file = await stat(input.archivePath);
  } catch (error) {
    if (isEnoent(error)) return undefined;
    throw error;
  }
  if (!file.isFile() || file.size > input.transferredBytes) {
    throw new Error('Extension artifact partial download state is invalid.');
  }
  if (file.size <= 0 || file.size >= input.artifact.sizeBytes) return undefined;
  return Object.freeze({
    url: input.finalUrl,
    transferredBytes: file.size,
    validator,
  });
}

function hasByteRangeSupport(headers: Headers): boolean {
  return (headers.get('accept-ranges') ?? '')
    .split(',')
    .some((value) => value.trim().toLocaleLowerCase('en-US') === 'bytes');
}

function readArtifactDownloadValidator(headers: Headers): ArtifactDownloadValidator | undefined {
  const etag = headers.get('etag');
  if (etag && !etag.startsWith('W/') && etag.startsWith('"') && etag.endsWith('"')) {
    return Object.freeze({ header: 'etag', value: etag });
  }
  const lastModified = headers.get('last-modified');
  const lastModifiedTime = lastModified ? Date.parse(lastModified) : Number.NaN;
  if (
    lastModified &&
    Number.isFinite(lastModifiedTime) &&
    new Date(lastModifiedTime).toUTCString() === lastModified
  ) {
    return Object.freeze({ header: 'last-modified', value: lastModified });
  }
  return undefined;
}

async function hashExistingArtifact(
  archivePath: string,
  expectedBytes: number,
  digest: ReturnType<typeof createHash>,
): Promise<void> {
  const file = await stat(archivePath);
  if (!file.isFile() || file.size !== expectedBytes) {
    throw new Error('Extension artifact partial download state is invalid.');
  }
  await pipeline(
    createReadStream(archivePath),
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        digest.update(chunk);
        callback();
      },
    }),
  );
}

class ArtifactDownloadInterruptedError extends Error {
  constructor(readError: unknown) {
    super('Extension artifact response body was interrupted.', { cause: readError });
    this.name = 'ArtifactDownloadInterruptedError';
  }
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
  signal: AbortSignal,
): Promise<void> {
  if (archive === 'zip') {
    await extractZip(archivePath, stagingRoot, signal);
    return;
  }
  await extractTarGzip(archivePath, stagingRoot, signal);
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

async function extractZip(
  archivePath: string,
  stagingRoot: string,
  signal: AbortSignal,
): Promise<void> {
  const reader = new NodeFileReader(archivePath);
  const zip = new ZipReader(reader, {
    checkOverlappingEntryOnly: false,
    checkOverlappingEntry: true,
  });
  try {
    const entries = await zip.getEntries();
    const inventory = new DesktopExtensionArchiveInventory();
    for (const entry of entries) {
      signal.throwIfAborted();
      const mode = entry.unixMode ?? 0;
      const fileType = mode & 0o170000;
      const kind = entry.directory ? 'directory' : 'file';
      if (entry.encrypted || (!entry.directory && fileType !== 0 && fileType !== 0o100000)) {
        throw new Error('Extension ZIP contains an encrypted or linked entry.');
      }
      inventory.add(entry.filename, kind, entry.uncompressedSize);
    }
    for (const entry of entries) {
      signal.throwIfAborted();
      const normalized = normalizeDesktopExtensionArchivePath(entry.filename);
      const target = resolveDesktopExtensionArchiveTarget(stagingRoot, normalized);
      if (entry.directory) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
      await entry.getData(Writable.toWeb(output), {
        checkSignature: true,
        checkOverlappingEntry: true,
        signal,
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

async function extractTarGzip(
  archivePath: string,
  stagingRoot: string,
  signal: AbortSignal,
): Promise<void> {
  const tarPath = resolve(stagingRoot, '.expanded.tar');
  let expandedBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      expandedBytes += chunk.byteLength;
      if (expandedBytes > DESKTOP_EXTENSION_MAX_EXPANDED_BYTES) {
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
    { signal },
  );
  const handle = await open(tarPath, 'r');
  const inventory = new DesktopExtensionArchiveInventory();
  try {
    let offset = 0;
    while (offset + 512 <= expandedBytes) {
      signal.throwIfAborted();
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
      const target = resolveDesktopExtensionArchiveTarget(stagingRoot, normalized);
      const dataEnd = offset + 512 + size;
      const nextOffset = offset + 512 + Math.ceil(size / 512) * 512;
      if (dataEnd > expandedBytes || nextOffset > expandedBytes) {
        throw new Error('Extension TAR entry content is truncated.');
      }
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
            { signal },
          );
        }
        await chmod(target, (mode & 0o111) !== 0 ? 0o755 : 0o644);
      }
      offset = nextOffset;
    }
  } finally {
    await handle.close();
    await rm(tarPath, { force: true });
  }
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
  const licensePath = resolveDesktopExtensionArchiveTarget(
    stagingRoot,
    artifact.licenseInventory.path,
  );
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
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        throw new ArtifactDownloadInterruptedError(error);
      }
      if (result.done) {
        completed = true;
        return;
      }
      yield result.value;
    }
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the primary stream or pipeline failure.
      }
    }
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

async function assertDiskBudget(
  installRoot: string,
  archiveBytes: number,
  archive: AgentExtensionReviewedArtifact['archive'],
): Promise<void> {
  const stats = await statfs(installRoot);
  const available = stats.bavail * stats.bsize;
  assertDesktopExtensionDiskBudget(available, archiveBytes, archive);
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
