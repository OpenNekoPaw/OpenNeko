import { access, copyFile, readFile, rename } from 'node:fs/promises';

export interface ResourceCacheManifestMigrationUnrecoverable {
  readonly resourceId: string;
  readonly variantKey: string | null;
  readonly fields: readonly string[];
  readonly reason: string;
}

export interface ResourceCacheManifestMigrationReport {
  readonly sourceStatus: 'absent' | 'invalidated' | 'quarantined';
  readonly sourcePath: string;
  readonly backupPath: string | null;
  readonly archivedPath: string | null;
  readonly quarantinePath: string | null;
  readonly sourceDiagnostic: string | null;
  readonly importedEntryCount: number;
  readonly importedVariantCount: number;
  readonly verifiedEntryCount: number;
  readonly verifiedVariantCount: number;
  readonly unrecoverable: readonly ResourceCacheManifestMigrationUnrecoverable[];
}

export async function migrateLegacyResourceCacheManifest(options: {
  readonly manifestPath: string;
  readonly cacheRoot: string;
  readonly manifestStore: unknown;
  readonly now?: () => number;
}): Promise<ResourceCacheManifestMigrationReport> {
  if (!(await pathExists(options.manifestPath))) {
    return emptyMigrationReport(options.manifestPath);
  }

  const invalidatedAt = (options.now ?? (() => Date.now()))();
  const backupPath = `${options.manifestPath}.backup-${invalidatedAt}`;
  try {
    await copyFile(options.manifestPath, backupPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return emptyMigrationReport(options.manifestPath);
    }
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(await readFile(backupPath, 'utf8'));
    if (!isLegacyResourceCacheManifest(parsed)) {
      throw new Error(
        'Legacy ResourceCache manifest is not the retired version 1 schema and cannot be rebuilt safely.',
      );
    }
  } catch (error) {
    const quarantinePath = `${options.manifestPath}.quarantine-${invalidatedAt}`;
    const moved = await moveIfPresent(options.manifestPath, quarantinePath);
    return {
      ...emptyMigrationReport(options.manifestPath),
      sourceStatus: 'quarantined',
      backupPath,
      quarantinePath: moved ? quarantinePath : null,
      sourceDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  const archivedPath = `${options.manifestPath}.invalidated-${invalidatedAt}`;
  const moved = await moveIfPresent(options.manifestPath, archivedPath);
  return {
    ...emptyMigrationReport(options.manifestPath),
    sourceStatus: 'invalidated',
    backupPath,
    archivedPath: moved ? archivedPath : null,
    sourceDiagnostic:
      'Retired version 1 ResourceCache manifest was invalidated; derived entries must be rebuilt.',
  };
}

function isLegacyResourceCacheManifest(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Reflect.get(value, 'version') === 1 &&
    isRecord(Reflect.get(value, 'entries'))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function moveIfPresent(sourcePath: string, targetPath: string): Promise<boolean> {
  try {
    await rename(sourcePath, targetPath);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
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

function emptyMigrationReport(sourcePath: string): ResourceCacheManifestMigrationReport {
  return {
    sourceStatus: 'absent',
    sourcePath,
    backupPath: null,
    archivedPath: null,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedEntryCount: 0,
    importedVariantCount: 0,
    verifiedEntryCount: 0,
    verifiedVariantCount: 0,
    unrecoverable: [],
  };
}
