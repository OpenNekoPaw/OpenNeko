import { access, copyFile, readFile, rename } from 'node:fs/promises';
import { PathResolver } from '../path';
import type { MediaFileMetadata } from '../types/media-file';
import type { LocalMetadataStore } from './contracts';
import type { LocalMetadataPartition } from './model';
import type { MediaMetadataRecord } from './repositories';

interface LegacyMediaMetadataEntry {
  readonly metadata: MediaFileMetadata;
  readonly mtime: number;
}

interface LegacyMediaMetadataCache {
  readonly version: 1;
  readonly entries: Readonly<Record<string, LegacyMediaMetadataEntry>>;
}

export interface MediaMetadataMigrationUnrecoverable {
  readonly sourceKey: string;
  readonly fields: readonly string[];
  readonly reason: string;
}

export interface MediaMetadataMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'quarantined';
  readonly sourcePath: string;
  readonly backupPath: string | null;
  readonly archivedPath: string | null;
  readonly quarantinePath: string | null;
  readonly sourceDiagnostic: string | null;
  readonly importedEntryCount: number;
  readonly verifiedEntryCount: number;
  readonly unrecoverable: readonly MediaMetadataMigrationUnrecoverable[];
}

export async function migrateLegacyMediaMetadata(options: {
  readonly cachePath: string;
  readonly metadataStore: LocalMetadataStore;
  readonly partition: LocalMetadataPartition;
  readonly pathResolver: PathResolver;
  readonly now?: () => string;
}): Promise<MediaMetadataMigrationReport> {
  if (!(await pathExists(options.cachePath))) {
    return emptyMigrationReport(options.cachePath);
  }
  const migratedAt = (options.now ?? (() => new Date().toISOString()))();
  const suffix = migratedAt.replace(/[^0-9A-Za-z-]/gu, '-');
  const backupPath = `${options.cachePath}.backup-${suffix}`;
  try {
    await copyFile(options.cachePath, backupPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return emptyMigrationReport(options.cachePath);
    throw error;
  }

  let legacyCache: LegacyMediaMetadataCache;
  try {
    const parsed: unknown = JSON.parse(await readFile(backupPath, 'utf8'));
    if (!isLegacyMediaMetadataCache(parsed)) {
      throw new Error('Legacy media metadata cache must use the valid version 1 schema.');
    }
    legacyCache = parsed;
  } catch (error) {
    const quarantinePath = await moveIfPresent(
      options.cachePath,
      `${options.cachePath}.quarantine-${suffix}`,
    );
    return {
      ...emptyMigrationReport(options.cachePath),
      sourceStatus: 'quarantined',
      backupPath,
      quarantinePath,
      sourceDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  const normalized = normalizeLegacyEntries(legacyCache, options.pathResolver, migratedAt);
  await options.metadataStore.transaction(
    {
      mode: 'cache-write',
      ownership: 'cache',
      operation: 'migrate-media-metadata',
    },
    async ({ repositories }) => {
      for (const record of normalized.records) {
        await repositories.mediaMetadata.upsert({ partition: options.partition, record });
      }
    },
  );
  const importedKeys = new Set(normalized.records.map((record) => record.sourceKey));
  const verified = (await options.metadataStore.repositories.mediaMetadata.list(options.partition))
    .filter((record) => importedKeys.has(record.sourceKey))
    .map((record) => record.sourceKey)
    .sort();
  const expected = [...importedKeys].sort();
  if (
    expected.length !== verified.length ||
    expected.some((sourceKey, index) => sourceKey !== verified[index])
  ) {
    throw new Error(
      `Media metadata migration verification failed: expected ${expected.length}, received ${verified.length}.`,
    );
  }
  const archivedPath = await moveIfPresent(
    options.cachePath,
    `${options.cachePath}.migrated-${suffix}`,
  );
  return {
    sourceStatus: 'migrated',
    sourcePath: options.cachePath,
    backupPath,
    archivedPath,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedEntryCount: normalized.records.length,
    verifiedEntryCount: verified.length,
    unrecoverable: normalized.unrecoverable,
  };
}

function normalizeLegacyEntries(
  cache: LegacyMediaMetadataCache,
  pathResolver: PathResolver,
  updatedAt: string,
): {
  readonly records: readonly MediaMetadataRecord[];
  readonly unrecoverable: readonly MediaMetadataMigrationUnrecoverable[];
} {
  const records: MediaMetadataRecord[] = [];
  const unrecoverable: MediaMetadataMigrationUnrecoverable[] = [];
  for (const [sourceKey, entry] of Object.entries(cache.entries)) {
    if (!isLegacyMediaMetadataEntry(entry)) {
      unrecoverable.push({
        sourceKey,
        fields: ['metadata', 'mtime'],
        reason: 'Legacy media metadata entry does not match the version 1 contract.',
      });
      continue;
    }
    const portableKey = toPortableSourceKey(sourceKey, pathResolver);
    if (!portableKey) {
      unrecoverable.push({
        sourceKey,
        fields: ['sourceKey'],
        reason: 'Media source path cannot be represented as a relative or variable path.',
      });
      continue;
    }
    records.push({
      sourceKey: portableKey,
      sourceMtimeMs: entry.mtime,
      metadata: entry.metadata,
      updatedAt,
    });
  }
  return { records, unrecoverable };
}

function toPortableSourceKey(sourceKey: string, pathResolver: PathResolver): string | null {
  const contracted = pathResolver.contract(sourceKey).replace(/\\/gu, '/');
  if (
    !contracted.trim() ||
    contracted.startsWith('/') ||
    /^[A-Za-z]:\//u.test(contracted) ||
    contracted === '..' ||
    contracted.startsWith('../') ||
    contracted.includes('/../')
  ) {
    return null;
  }
  return contracted;
}

function isLegacyMediaMetadataCache(value: unknown): value is LegacyMediaMetadataCache {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Reflect.get(value, 'version') === 1 &&
    typeof Reflect.get(value, 'entries') === 'object' &&
    Reflect.get(value, 'entries') !== null &&
    !Array.isArray(Reflect.get(value, 'entries'))
  );
}

function isLegacyMediaMetadataEntry(value: unknown): value is LegacyMediaMetadataEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const metadata = Reflect.get(value, 'metadata');
  const mtime = Reflect.get(value, 'mtime');
  return (
    typeof mtime === 'number' &&
    Number.isFinite(mtime) &&
    mtime >= 0 &&
    isMediaFileMetadata(metadata)
  );
}

function isMediaFileMetadata(value: unknown): value is MediaFileMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof Reflect.get(value, 'fileSize') === 'number' &&
    Number.isFinite(Reflect.get(value, 'fileSize')) &&
    Reflect.get(value, 'fileSize') >= 0 &&
    typeof Reflect.get(value, 'mimeType') === 'string' &&
    Reflect.get(value, 'mimeType').trim().length > 0
  );
}

async function moveIfPresent(sourcePath: string, targetPath: string): Promise<string | null> {
  try {
    await rename(sourcePath, targetPath);
    return targetPath;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return null;
    throw error;
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function emptyMigrationReport(sourcePath: string): MediaMetadataMigrationReport {
  return {
    sourceStatus: 'absent',
    sourcePath,
    backupPath: null,
    archivedPath: null,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedEntryCount: 0,
    verifiedEntryCount: 0,
    unrecoverable: [],
  };
}
