import { access, copyFile, readFile, rename } from 'node:fs/promises';
import * as path from 'node:path';
import {
  isResourceCacheManifest,
  type ResourceCacheEntry,
  type ResourceCacheManifest,
  type ResourceCacheManifestStore,
  type ResourceCacheVariantEntry,
} from '../types/resource-cache';

export interface ResourceCacheManifestMigrationUnrecoverable {
  readonly resourceId: string;
  readonly variantKey: string | null;
  readonly fields: readonly string[];
  readonly reason: string;
}

export interface ResourceCacheManifestMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'quarantined';
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
  readonly manifestStore: ResourceCacheManifestStore;
  readonly now?: () => number;
}): Promise<ResourceCacheManifestMigrationReport> {
  if (!(await pathExists(options.manifestPath))) {
    return emptyMigrationReport(options.manifestPath);
  }
  const migratedAt = (options.now ?? (() => Date.now()))();
  const backupPath = `${options.manifestPath}.backup-${migratedAt}`;
  try {
    await copyFile(options.manifestPath, backupPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return emptyMigrationReport(options.manifestPath);
    }
    throw error;
  }

  let legacyManifest: ResourceCacheManifest;
  try {
    const parsed: unknown = JSON.parse(await readFile(backupPath, 'utf8'));
    if (!isResourceCacheManifest(parsed)) {
      throw new Error('Legacy ResourceCache manifest must use the valid version 1 schema.');
    }
    legacyManifest = parsed;
  } catch (error) {
    let quarantinePath: string | null = `${options.manifestPath}.quarantine-${migratedAt}`;
    try {
      await rename(options.manifestPath, quarantinePath);
    } catch (renameError) {
      if (!hasNodeErrorCode(renameError, 'ENOENT')) throw renameError;
      quarantinePath = null;
    }
    return {
      ...emptyMigrationReport(options.manifestPath),
      sourceStatus: 'quarantined',
      backupPath,
      quarantinePath,
      sourceDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  const normalized = normalizeLegacyManifest(legacyManifest, options.cacheRoot);
  await options.manifestStore.save(normalized.manifest);
  const verified = await options.manifestStore.load({ refresh: true });
  assertVerifiedProjection(normalized.manifest, verified);
  const archivedPath = `${options.manifestPath}.migrated-${migratedAt}`;
  let retiredPath: string | null = archivedPath;
  try {
    await rename(options.manifestPath, archivedPath);
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
    retiredPath = null;
  }
  return {
    sourceStatus: 'migrated',
    sourcePath: options.manifestPath,
    backupPath,
    archivedPath: retiredPath,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedEntryCount: Object.keys(normalized.manifest.entries).length,
    importedVariantCount: countVariants(normalized.manifest),
    verifiedEntryCount: Object.keys(verified.entries).length,
    verifiedVariantCount: countVariants(verified),
    unrecoverable: normalized.unrecoverable,
  };
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

function normalizeLegacyManifest(
  manifest: ResourceCacheManifest,
  cacheRoot: string,
): {
  readonly manifest: ResourceCacheManifest;
  readonly unrecoverable: readonly ResourceCacheManifestMigrationUnrecoverable[];
} {
  const entries: Record<string, ResourceCacheEntry> = {};
  const unrecoverable: ResourceCacheManifestMigrationUnrecoverable[] = [];
  for (const [resourceId, entry] of Object.entries(manifest.entries)) {
    if (resourceId !== entry.resource.id) {
      unrecoverable.push({
        resourceId,
        variantKey: null,
        fields: ['resource.id'],
        reason: `Manifest key does not match resource identity ${entry.resource.id}.`,
      });
      continue;
    }
    const variants = entry.variants.flatMap((variant) => {
      const normalized = normalizeVariantPath(variant, cacheRoot);
      if (normalized) return [normalized];
      unrecoverable.push({
        resourceId,
        variantKey: variant.key,
        fields: ['relativePath', 'absolutePath'],
        reason: 'Variant artifact path is outside the managed cache root.',
      });
      return [];
    });
    entries[resourceId] = { ...entry, variants };
  }
  return {
    manifest: {
      ...manifest,
      entries,
    },
    unrecoverable,
  };
}

function normalizeVariantPath(
  variant: ResourceCacheVariantEntry,
  cacheRoot: string,
): ResourceCacheVariantEntry | null {
  const relativePath = variant.absolutePath
    ? path.relative(path.resolve(cacheRoot), path.resolve(variant.absolutePath))
    : variant.relativePath;
  if (!relativePath || !isManagedRelativePath(relativePath)) return null;
  const { absolutePath: _absolutePath, ...portableVariant } = variant;
  return { ...portableVariant, relativePath: relativePath.split(path.sep).join('/') };
}

function isManagedRelativePath(value: string): boolean {
  if (path.isAbsolute(value)) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}

function assertVerifiedProjection(
  expected: ResourceCacheManifest,
  actual: ResourceCacheManifest,
): void {
  const expectedIdentities = projectionIdentities(expected);
  const actualIdentities = projectionIdentities(actual);
  if (
    expectedIdentities.length !== actualIdentities.length ||
    expectedIdentities.some((identity, index) => identity !== actualIdentities[index])
  ) {
    throw new Error(
      `ResourceCache migration identity verification failed: expected ${expectedIdentities.length}, received ${actualIdentities.length}.`,
    );
  }
}

function projectionIdentities(manifest: ResourceCacheManifest): string[] {
  return Object.values(manifest.entries)
    .flatMap((entry) => [
      `resource:${entry.resource.id}`,
      ...entry.variants.map((variant) => `variant:${entry.resource.id}:${variant.key}`),
    ])
    .sort();
}

function countVariants(manifest: ResourceCacheManifest): number {
  return Object.values(manifest.entries).reduce((count, entry) => count + entry.variants.length, 0);
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
