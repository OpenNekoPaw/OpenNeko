import { createHash } from 'node:crypto';

import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  type Entry,
} from '@zip.js/zip.js';
import type {
  WorldPortableArchiveContent,
  WorldPortableArchivePort,
  WorldPortableRecordSource,
  WorldPortableResourceSource,
} from '@neko/world/application';
import {
  parseWorldPortablePackageManifest,
  parseWorldProject,
  parseWorldVersion,
  type WorldPortableExternalDependency,
  type WorldPortablePackageManifest,
  type WorldPortableRecordKind,
} from '@neko/world/contracts';

export interface WorldPortableArchiveLimits {
  readonly maxArchiveBytes: number;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxExpandedBytes: number;
  readonly maxCompressionRatio: number;
}

const DEFAULT_LIMITS: WorldPortableArchiveLimits = Object.freeze({
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntries: 10_000,
  maxEntryBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
});

export class WorldPortableArchiveError extends Error {
  constructor(
    readonly code:
      'world-package-invalid' | 'world-package-limit-exceeded' | 'world-package-integrity-failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WorldPortableArchiveError';
  }
}

export function createWorldPortableArchivePort(
  limitOverrides?: Partial<WorldPortableArchiveLimits>,
): WorldPortableArchivePort {
  const port: WorldPortableArchivePort = {
    async write(input, signal) {
      signal?.throwIfAborted();
      const result = await writeWorldPortableArchive({ ...input, limits: limitOverrides }, signal);
      signal?.throwIfAborted();
      return result;
    },
    async read(archiveBytes, signal) {
      signal?.throwIfAborted();
      const result = await readWorldPortableArchive(archiveBytes, limitOverrides, signal);
      signal?.throwIfAborted();
      return result;
    },
  };
  return Object.freeze(port);
}

export async function writeWorldPortableArchive(
  input: {
    readonly worldProjectId: string;
    readonly entryRecordPath: string;
    readonly records: readonly WorldPortableRecordSource[];
    readonly embeddedResources: readonly WorldPortableResourceSource[];
    readonly externalDependencies: readonly WorldPortableExternalDependency[];
    readonly limits?: Partial<WorldPortableArchiveLimits>;
  },
  signal?: AbortSignal,
): Promise<{ readonly archiveBytes: Uint8Array; readonly manifest: WorldPortablePackageManifest }> {
  const limits = resolveLimits(input.limits);
  signal?.throwIfAborted();
  for (const resource of input.embeddedResources) {
    if (
      resource.declaration.byteLength !== resource.bytes.byteLength ||
      resource.declaration.integrityDigest !== digest(resource.bytes)
    ) {
      throw integrity(
        `Embedded resource '${resource.declaration.resourceId}' bytes do not match its owner declaration.`,
      );
    }
  }
  const manifest = parseWorldPortablePackageManifest({
    worldProjectId: input.worldProjectId,
    entryRecordPath: input.entryRecordPath,
    records: input.records.map((entry) => ({
      kind: entry.kind,
      recordId: entry.recordId,
      archivePath: entry.archivePath,
      byteLength: entry.bytes.byteLength,
      integrityDigest: digest(entry.bytes),
    })),
    embeddedResources: input.embeddedResources.map((entry) => entry.declaration),
    externalDependencies: input.externalDependencies,
  });
  const bytesByPath = new Map<string, Uint8Array>([
    ...input.records.map((entry) => [entry.archivePath, entry.bytes] as const),
    ...input.embeddedResources.map(
      (entry) => [entry.declaration.archivePath, entry.bytes] as const,
    ),
  ]);
  validateExpandedLimits(bytesByPath, limits);
  for (const record of input.records) {
    validateRecordBytes(record.kind, record.recordId, record.bytes, manifest);
  }
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  if (manifestBytes.byteLength > limits.maxEntryBytes) {
    throw limitError('World package manifest exceeds the entry byte limit.');
  }
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  const entryDate = new Date('1980-01-01T00:00:00.000Z');
  await writer.add('manifest.json', new Uint8ArrayReader(manifestBytes), {
    lastModDate: entryDate,
  });
  for (const [archivePath, bytes] of [...bytesByPath].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    signal?.throwIfAborted();
    await writer.add(archivePath, new Uint8ArrayReader(bytes), { lastModDate: entryDate });
  }
  signal?.throwIfAborted();
  const archiveBytes = await writer.close();
  if (archiveBytes.byteLength > limits.maxArchiveBytes) {
    throw limitError('World package exceeds the archive byte limit.');
  }
  return { archiveBytes, manifest };
}

export async function readWorldPortableArchive(
  archiveBytes: Uint8Array,
  limitOverrides?: Partial<WorldPortableArchiveLimits>,
  signal?: AbortSignal,
): Promise<WorldPortableArchiveContent> {
  const limits = resolveLimits(limitOverrides);
  if (archiveBytes.byteLength > limits.maxArchiveBytes) {
    throw limitError('World package exceeds the archive byte limit.');
  }
  const reader = new ZipReader(new Uint8ArrayReader(archiveBytes), { useWebWorkers: false });
  try {
    signal?.throwIfAborted();
    const entries = await reader.getEntries();
    validateEntryMetadata(entries, limits);
    const manifestEntry = entries.find((entry) => entry.filename === 'manifest.json');
    if (!manifestEntry || manifestEntry.directory) {
      throw invalid('World package manifest.json is required.');
    }
    const manifestBytes = await manifestEntry.getData(new Uint8ArrayWriter());
    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
    } catch (cause) {
      throw invalid('World package manifest.json is not valid UTF-8 JSON.', cause);
    }
    const manifest = parseWorldPortablePackageManifest(manifestValue);
    const declared = new Map(
      [...manifest.records, ...manifest.embeddedResources].map((entry) => [
        entry.archivePath,
        entry,
      ]),
    );
    const actualPaths = entries
      .filter((entry) => entry.filename !== 'manifest.json')
      .map((entry) => entry.filename);
    for (const archivePath of actualPaths) {
      if (!declared.has(archivePath)) {
        throw invalid(`World package contains undeclared entry '${archivePath}'.`);
      }
    }
    for (const archivePath of declared.keys()) {
      if (!actualPaths.includes(archivePath)) {
        throw invalid(`World package is missing declared entry '${archivePath}'.`);
      }
    }
    const bytesByArchivePath = new Map<string, Uint8Array>();
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (entry.filename === 'manifest.json' || entry.directory) continue;
      const declaration = declared.get(entry.filename);
      if (!declaration) throw invalid(`World package entry '${entry.filename}' is undeclared.`);
      const bytes = await entry.getData(new Uint8ArrayWriter());
      if (
        bytes.byteLength !== declaration.byteLength ||
        digest(bytes) !== declaration.integrityDigest
      ) {
        throw integrity(`World package entry '${entry.filename}' failed integrity validation.`);
      }
      bytesByArchivePath.set(entry.filename, bytes);
    }
    for (const record of manifest.records) {
      const bytes = bytesByArchivePath.get(record.archivePath);
      if (!bytes) throw invalid(`World package record '${record.archivePath}' is unavailable.`);
      validateRecordBytes(record.kind, record.recordId, bytes, manifest);
    }
    return { manifest, bytesByArchivePath };
  } catch (cause) {
    if (cause instanceof WorldPortableArchiveError) throw cause;
    throw invalid('World package archive could not be decoded.', cause);
  } finally {
    await reader.close();
  }
}

function validateEntryMetadata(
  entries: readonly Entry[],
  limits: WorldPortableArchiveLimits,
): void {
  if (entries.length > limits.maxEntries)
    throw limitError('World package contains too many entries.');
  const normalizedNames = new Set<string>();
  let expandedBytes = 0;
  for (const entry of entries) {
    requireSafeZipPath(entry.filename);
    const normalized = entry.filename.normalize('NFC');
    if (normalized !== entry.filename) {
      throw invalid(`World package entry '${entry.filename}' is not normalized.`);
    }
    if (normalizedNames.has(normalized)) {
      throw invalid(`World package contains duplicate entry '${entry.filename}'.`);
    }
    normalizedNames.add(normalized);
    if (entry.directory)
      throw invalid(`World package directory '${entry.filename}' is not allowed.`);
    if (entry.encrypted)
      throw invalid(`World package entry '${entry.filename}' cannot be encrypted.`);
    if (isSymbolicLink(entry)) {
      throw invalid(`World package entry '${entry.filename}' cannot be a symbolic link.`);
    }
    if (
      !Number.isSafeInteger(entry.uncompressedSize) ||
      entry.uncompressedSize < 0 ||
      entry.uncompressedSize > limits.maxEntryBytes
    ) {
      throw limitError(`World package entry '${entry.filename}' exceeds the entry byte limit.`);
    }
    expandedBytes += entry.uncompressedSize;
    if (expandedBytes > limits.maxExpandedBytes) {
      throw limitError('World package exceeds the expanded byte limit.');
    }
    if (
      entry.uncompressedSize > 0 &&
      (entry.compressedSize <= 0 ||
        entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio)
    ) {
      throw limitError(
        `World package entry '${entry.filename}' exceeds the compression ratio limit.`,
      );
    }
  }
}

function validateExpandedLimits(
  entries: ReadonlyMap<string, Uint8Array>,
  limits: WorldPortableArchiveLimits,
): void {
  if (entries.size + 1 > limits.maxEntries)
    throw limitError('World package contains too many entries.');
  let expandedBytes = 0;
  for (const [archivePath, bytes] of entries) {
    requireSafeZipPath(archivePath);
    if (archivePath.normalize('NFC') !== archivePath) {
      throw invalid(`World package entry '${archivePath}' is not normalized.`);
    }
    if (bytes.byteLength > limits.maxEntryBytes) {
      throw limitError(`World package entry '${archivePath}' exceeds the entry byte limit.`);
    }
    expandedBytes += bytes.byteLength;
    if (expandedBytes > limits.maxExpandedBytes) {
      throw limitError('World package exceeds the expanded byte limit.');
    }
  }
}

function validateRecordBytes(
  kind: WorldPortableRecordKind,
  recordId: string,
  bytes: Uint8Array,
  manifest: WorldPortablePackageManifest,
): void {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (cause) {
    throw invalid(`World package record '${recordId}' is not valid UTF-8 JSON.`, cause);
  }
  if (kind === 'world-project') {
    const project = parseWorldProject(value);
    if (project.worldProjectId !== recordId || project.worldProjectId !== manifest.worldProjectId) {
      throw invalid(`World package project record '${recordId}' has mismatched authority.`);
    }
    return;
  }
  const version = parseWorldVersion(value);
  if (version.worldVersionId !== recordId || version.worldProjectId !== manifest.worldProjectId) {
    throw invalid(`World package version record '${recordId}' has mismatched authority.`);
  }
}

function requireSafeZipPath(archivePath: string): void {
  if (
    archivePath.startsWith('/') ||
    /^[a-z]:/iu.test(archivePath) ||
    archivePath.includes('\\') ||
    archivePath.includes('\u0000') ||
    archivePath.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw invalid(`World package entry path '${archivePath}' is unsafe.`);
  }
}

function isSymbolicLink(entry: Entry): boolean {
  return entry.unixMode !== undefined && (entry.unixMode & 0o170000) === 0o120000;
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function resolveLimits(
  overrides?: Partial<WorldPortableArchiveLimits>,
): WorldPortableArchiveLimits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`World package limit '${name}' must be a positive safe integer.`);
    }
  }
  return limits;
}

function invalid(message: string, cause?: unknown): WorldPortableArchiveError {
  return new WorldPortableArchiveError(
    'world-package-invalid',
    message,
    cause === undefined ? undefined : { cause },
  );
}

function integrity(message: string): WorldPortableArchiveError {
  return new WorldPortableArchiveError('world-package-integrity-failed', message);
}

function limitError(message: string): WorldPortableArchiveError {
  return new WorldPortableArchiveError('world-package-limit-exceeded', message);
}
