import { createHash } from 'node:crypto';
import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  type Entry,
} from '@zip.js/zip.js';
import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterPortablePackageManifest,
  parseCharacterProject,
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
  parseCharacterStorylineVersion,
  parseCharacterVersion,
  parseCharacterVersionLineage,
  type CharacterPortableExternalDependency,
  type CharacterPortablePackageManifest,
  type CharacterPortableRecordKind,
} from '@neko/chara/contracts';
import type {
  CharacterPortableArchivePort,
  CharacterPortableAssetSource,
  CharacterPortableRecordSource,
} from '@neko/chara/application';

export interface CharacterPortableArchiveLimits {
  readonly maxArchiveBytes: number;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxExpandedBytes: number;
  readonly maxCompressionRatio: number;
}

export interface CharacterPortableArchive {
  readonly manifest: CharacterPortablePackageManifest;
  readonly bytesByArchivePath: ReadonlyMap<string, Uint8Array>;
}

const DEFAULT_LIMITS: CharacterPortableArchiveLimits = Object.freeze({
  maxArchiveBytes: 512 * 1024 * 1024,
  maxEntries: 10_000,
  maxEntryBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
});

export class CharacterPortableArchiveError extends Error {
  constructor(
    readonly code:
      | 'character-package-invalid'
      | 'character-package-limit-exceeded'
      | 'character-package-integrity-failed',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CharacterPortableArchiveError';
  }
}

export function createCharacterPortableArchivePort(
  limitOverrides?: Partial<CharacterPortableArchiveLimits>,
): CharacterPortableArchivePort {
  const port: CharacterPortableArchivePort = {
    async write(input, signal) {
      signal?.throwIfAborted();
      const result = await writeCharacterPortableArchive({ ...input, limits: limitOverrides });
      signal?.throwIfAborted();
      return result;
    },
    async read(archiveBytes, signal) {
      signal?.throwIfAborted();
      const result = await readCharacterPortableArchive(archiveBytes, limitOverrides);
      signal?.throwIfAborted();
      return result;
    },
  };
  return Object.freeze(port);
}

export async function writeCharacterPortableArchive(input: {
  readonly characterProjectId: string;
  readonly entryRecordPath: string;
  readonly records: readonly CharacterPortableRecordSource[];
  readonly embeddedAssets: readonly CharacterPortableAssetSource[];
  readonly externalDependencies: readonly CharacterPortableExternalDependency[];
  readonly limits?: Partial<CharacterPortableArchiveLimits>;
}): Promise<{
  readonly archiveBytes: Uint8Array;
  readonly manifest: CharacterPortablePackageManifest;
}> {
  const limits = resolveLimits(input.limits);
  const manifest = parseCharacterPortablePackageManifest({
    characterProjectId: input.characterProjectId,
    entryRecordPath: input.entryRecordPath,
    records: input.records.map((entry) => ({
      kind: entry.kind,
      recordId: entry.recordId,
      archivePath: entry.archivePath,
      byteLength: entry.bytes.byteLength,
      integrityDigest: digest(entry.bytes),
    })),
    embeddedAssets: input.embeddedAssets.map((entry) => ({
      representationId: entry.representationId,
      kind: entry.kind,
      resourceRef: entry.resourceRef,
      archivePath: entry.archivePath,
      entry: entry.entry,
      mediaType: entry.mediaType,
      byteLength: entry.bytes.byteLength,
      integrityDigest: digest(entry.bytes),
    })),
    externalDependencies: input.externalDependencies,
  });
  const bytesByPath = new Map<string, Uint8Array>([
    ...input.records.map((entry) => [entry.archivePath, entry.bytes] as const),
    ...input.embeddedAssets.map((entry) => [entry.archivePath, entry.bytes] as const),
  ]);
  validateExpandedLimits(bytesByPath, limits);
  for (const entry of input.records)
    validateRecordBytes(entry.kind, entry.recordId, entry.bytes, manifest);

  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  const entryDate = new Date('1980-01-01T00:00:00.000Z');
  await writer.add('manifest.json', new Uint8ArrayReader(manifestBytes), {
    lastModDate: entryDate,
  });
  for (const [path, bytes] of [...bytesByPath].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    await writer.add(path, new Uint8ArrayReader(bytes), { lastModDate: entryDate });
  }
  const archiveBytes = await writer.close();
  if (archiveBytes.byteLength > limits.maxArchiveBytes) {
    throw limitError(`Character package exceeds ${String(limits.maxArchiveBytes)} archive bytes.`);
  }
  return { archiveBytes, manifest };
}

export async function readCharacterPortableArchive(
  archiveBytes: Uint8Array,
  limitOverrides?: Partial<CharacterPortableArchiveLimits>,
): Promise<CharacterPortableArchive> {
  const limits = resolveLimits(limitOverrides);
  if (archiveBytes.byteLength > limits.maxArchiveBytes) {
    throw limitError(`Character package exceeds ${String(limits.maxArchiveBytes)} archive bytes.`);
  }
  const reader = new ZipReader(new Uint8ArrayReader(archiveBytes), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    validateEntryMetadata(entries, limits);
    const manifestEntry = entries.find((entry) => entry.filename === 'manifest.json');
    if (!manifestEntry || manifestEntry.directory)
      throw invalid('Character package manifest.json is required.');
    const manifestBytes = await manifestEntry.getData(new Uint8ArrayWriter());
    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
    } catch (cause) {
      throw invalid('Character package manifest.json is not valid UTF-8 JSON.', cause);
    }
    const manifest = parseCharacterPortablePackageManifest(manifestValue);
    const declared = new Map(
      [...manifest.records, ...manifest.embeddedAssets].map((entry) => [entry.archivePath, entry]),
    );
    const actualPaths = entries
      .filter((entry) => entry.filename !== 'manifest.json')
      .map((entry) => entry.filename);
    for (const path of actualPaths)
      if (!declared.has(path))
        throw invalid(`Character package contains undeclared entry '${path}'.`);
    for (const path of declared.keys())
      if (!actualPaths.includes(path))
        throw invalid(`Character package is missing declared entry '${path}'.`);

    const bytesByArchivePath = new Map<string, Uint8Array>();
    for (const entry of entries) {
      if (entry.filename === 'manifest.json' || entry.directory) continue;
      const declaration = declared.get(entry.filename);
      if (!declaration) throw invalid(`Character package entry '${entry.filename}' is undeclared.`);
      const bytes = await entry.getData(new Uint8ArrayWriter());
      if (
        bytes.byteLength !== declaration.byteLength ||
        digest(bytes) !== declaration.integrityDigest
      ) {
        throw new CharacterPortableArchiveError(
          'character-package-integrity-failed',
          `Character package entry '${entry.filename}' failed integrity validation.`,
        );
      }
      bytesByArchivePath.set(entry.filename, bytes);
    }
    for (const record of manifest.records) {
      const bytes = bytesByArchivePath.get(record.archivePath);
      if (!bytes) throw invalid(`Character package record '${record.archivePath}' is unavailable.`);
      validateRecordBytes(record.kind, record.recordId, bytes, manifest);
    }
    return { manifest, bytesByArchivePath };
  } catch (cause) {
    if (cause instanceof CharacterPortableArchiveError) throw cause;
    throw invalid('Character package archive could not be decoded.', cause);
  } finally {
    await reader.close();
  }
}

function validateEntryMetadata(
  entries: readonly Entry[],
  limits: CharacterPortableArchiveLimits,
): void {
  if (entries.length > limits.maxEntries)
    throw limitError('Character package contains too many entries.');
  const names = new Set<string>();
  let expandedBytes = 0;
  for (const entry of entries) {
    requireSafeZipPath(entry.filename);
    if (names.has(entry.filename))
      throw invalid(`Character package contains duplicate entry '${entry.filename}'.`);
    names.add(entry.filename);
    if (entry.directory)
      throw invalid(`Character package directory entry '${entry.filename}' is not allowed.`);
    if (entry.encrypted)
      throw invalid(`Character package entry '${entry.filename}' cannot be encrypted.`);
    if (isSymbolicLink(entry))
      throw invalid(`Character package entry '${entry.filename}' cannot be a symbolic link.`);
    if (
      !Number.isSafeInteger(entry.uncompressedSize) ||
      entry.uncompressedSize < 0 ||
      entry.uncompressedSize > limits.maxEntryBytes
    ) {
      throw limitError(`Character package entry '${entry.filename}' exceeds the entry byte limit.`);
    }
    expandedBytes += entry.uncompressedSize;
    if (expandedBytes > limits.maxExpandedBytes)
      throw limitError('Character package exceeds the expanded byte limit.');
    if (
      entry.uncompressedSize > 0 &&
      (entry.compressedSize <= 0 ||
        entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio)
    ) {
      throw limitError(
        `Character package entry '${entry.filename}' exceeds the compression ratio limit.`,
      );
    }
  }
}

function validateExpandedLimits(
  entries: ReadonlyMap<string, Uint8Array>,
  limits: CharacterPortableArchiveLimits,
): void {
  if (entries.size + 1 > limits.maxEntries)
    throw limitError('Character package contains too many entries.');
  let total = 0;
  for (const [path, bytes] of entries) {
    requireSafeZipPath(path);
    if (bytes.byteLength > limits.maxEntryBytes)
      throw limitError(`Character package entry '${path}' exceeds the entry byte limit.`);
    total += bytes.byteLength;
    if (total > limits.maxExpandedBytes)
      throw limitError('Character package exceeds the expanded byte limit.');
  }
}

function validateRecordBytes(
  kind: CharacterPortableRecordKind,
  recordId: string,
  bytes: Uint8Array,
  manifest: CharacterPortablePackageManifest,
): void {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (cause) {
    throw invalid(`Character package record '${recordId}' is not valid UTF-8 JSON.`, cause);
  }
  let actualId: string;
  let ownerCharacterProjectId: string | undefined;
  switch (kind) {
    case 'character-project': {
      const parsed = parseCharacterProject(value);
      actualId = parsed.characterProjectId;
      ownerCharacterProjectId = parsed.characterProjectId;
      break;
    }
    case 'character-version': {
      const parsed = parseCharacterVersion(value);
      actualId = parsed.characterVersionId;
      ownerCharacterProjectId = parsed.characterProjectId;
      break;
    }
    case 'character-version-lineage': {
      const parsed = parseCharacterVersionLineage(value);
      actualId = parsed.characterProjectId;
      ownerCharacterProjectId = parsed.characterProjectId;
      break;
    }
    case 'character-storyline': {
      const parsed = parseCharacterStoryline(value);
      actualId = parsed.characterStorylineId;
      ownerCharacterProjectId = parsed.characterProjectId;
      break;
    }
    case 'character-storyline-draft':
      actualId = parseCharacterStorylineDraft(value).characterStorylineId;
      break;
    case 'character-storyline-version':
      actualId = parseCharacterStorylineVersion(value).characterStorylineVersionId;
      break;
    case 'authoring-test-snapshot': {
      const parsed = parseCharacterAuthoringTestSnapshot(value);
      actualId = parsed.authoringTestSnapshotId;
      ownerCharacterProjectId = parsed.characterProjectId;
      break;
    }
  }
  if (actualId !== recordId)
    throw invalid(`Character package record '${recordId}' has mismatched identity '${actualId}'.`);
  if (
    ownerCharacterProjectId !== undefined &&
    ownerCharacterProjectId !== manifest.characterProjectId
  ) {
    throw invalid(`Character package record '${recordId}' belongs to another CharacterProject.`);
  }
}

function requireSafeZipPath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\u0000') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw invalid(`Character package entry path '${path}' is unsafe.`);
  }
}

function isSymbolicLink(entry: Entry): boolean {
  return entry.unixMode !== undefined && (entry.unixMode & 0o170000) === 0o120000;
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function resolveLimits(
  overrides?: Partial<CharacterPortableArchiveLimits>,
): CharacterPortableArchiveLimits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`Character package limit '${name}' must be a positive safe integer.`);
  }
  return limits;
}

function invalid(message: string, cause?: unknown): CharacterPortableArchiveError {
  return new CharacterPortableArchiveError(
    'character-package-invalid',
    message,
    cause === undefined ? undefined : { cause },
  );
}

function limitError(message: string): CharacterPortableArchiveError {
  return new CharacterPortableArchiveError('character-package-limit-exceeded', message);
}
