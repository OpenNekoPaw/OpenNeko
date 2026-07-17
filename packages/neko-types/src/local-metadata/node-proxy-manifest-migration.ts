import { access, copyFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { ProxyEntry, ProxyManifest, ProxyStatus } from '../types/proxyProtocol';
import type {
  ResourceCacheEntry,
  ResourceCacheManifest,
  ResourceCacheManifestStore,
  ResourceCacheStatus,
  ResourceCacheVariantEntry,
} from '../types/resource-cache';

export interface ProxyManifestMigrationUnrecoverable {
  readonly resourceId: string;
  readonly fields: readonly string[];
  readonly reason: string;
}

export interface ProxyManifestMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'quarantined';
  readonly sourcePath: string;
  readonly backupPath: string | null;
  readonly archivedPath: string | null;
  readonly quarantinePath: string | null;
  readonly sourceDiagnostic: string | null;
  readonly importedEntryCount: number;
  readonly importedVariantCount: number;
  readonly copiedArtifactCount: number;
  readonly verifiedEntryCount: number;
  readonly verifiedVariantCount: number;
  readonly unrecoverable: readonly ProxyManifestMigrationUnrecoverable[];
}

interface PreparedProxyEntry {
  readonly resourceId: string;
  readonly entry: ResourceCacheEntry;
  readonly artifactSourcePath: string;
  readonly artifactTargetPath: string;
}

const PROXY_PROVIDER = 'neko-cut-proxy';
const LEGACY_PROXY_VARIANT_KEY = 'proxy:legacy';

export async function migrateLegacyProxyManifest(options: {
  readonly manifestPath: string;
  readonly workDir: string;
  readonly legacyProxyRoot: string;
  readonly resourceCacheRoot: string;
  readonly manifestStore: ResourceCacheManifestStore;
  readonly now?: () => number;
}): Promise<ProxyManifestMigrationReport> {
  if (!(await pathExists(options.manifestPath))) {
    return emptyMigrationReport(options.manifestPath);
  }
  const migratedAt = (options.now ?? (() => Date.now()))();
  const backupPath = `${options.manifestPath}.backup-${migratedAt}`;
  try {
    await copyFile(options.manifestPath, backupPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return emptyMigrationReport(options.manifestPath);
    throw error;
  }

  let prepared: readonly PreparedProxyEntry[];
  try {
    const parsed: unknown = JSON.parse(await readFile(backupPath, 'utf8'));
    if (!isProxyManifest(parsed)) {
      throw new Error('Legacy proxy manifest must use the valid version 1 schema.');
    }
    prepared = prepareProxyEntries(parsed, options);
  } catch (error) {
    const quarantinePath = await quarantineSource(options.manifestPath, migratedAt);
    return {
      ...emptyMigrationReport(options.manifestPath),
      sourceStatus: 'quarantined',
      backupPath,
      quarantinePath,
      sourceDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  const unrecoverable: ProxyManifestMigrationUnrecoverable[] = [];
  let copiedArtifactCount = 0;
  const importedEntries: ResourceCacheEntry[] = [];
  for (const candidate of prepared) {
    let artifactStatus: ResourceCacheStatus = candidate.entry.status;
    let sizeBytes: number | undefined;
    try {
      const artifactStat = await stat(candidate.artifactSourcePath);
      if (!artifactStat.isFile()) {
        throw new Error('Legacy proxy artifact is not a file.');
      }
      await mkdir(path.dirname(candidate.artifactTargetPath), { recursive: true });
      await copyFile(candidate.artifactSourcePath, candidate.artifactTargetPath);
      copiedArtifactCount += 1;
      sizeBytes = artifactStat.size;
    } catch (error) {
      if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
      artifactStatus = 'missing';
      unrecoverable.push({
        resourceId: candidate.resourceId,
        fields: ['proxy'],
        reason: 'Legacy proxy artifact is missing and must be rebuilt.',
      });
    }
    importedEntries.push({
      ...candidate.entry,
      status: artifactStatus,
      variants: candidate.entry.variants.map((variant) => ({
        ...variant,
        status: artifactStatus,
        ...(sizeBytes === undefined ? {} : { sizeBytes }),
      })),
    });
  }

  await options.manifestStore.update((manifest) =>
    mergeImportedEntries(manifest, importedEntries, migratedAt),
  );
  const verified = await options.manifestStore.load({ refresh: true });
  assertVerifiedProjection(importedEntries, verified);

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
    importedEntryCount: importedEntries.length,
    importedVariantCount: importedEntries.length,
    copiedArtifactCount,
    verifiedEntryCount: importedEntries.length,
    verifiedVariantCount: importedEntries.length,
    unrecoverable,
  };
}

function prepareProxyEntries(
  manifest: ProxyManifest,
  options: {
    readonly workDir: string;
    readonly legacyProxyRoot: string;
    readonly resourceCacheRoot: string;
  },
): readonly PreparedProxyEntry[] {
  const destinations = new Map<string, string>();
  return Object.entries(manifest.proxies).map(([resourceId, proxy]) => {
    if (!resourceId) throw new Error('Legacy proxy resource identity must not be empty.');
    const source = normalizeProxySourcePath(proxy.source, options.workDir);
    const artifactSourcePath = resolveLegacyProxyPath(
      proxy.proxy,
      options.workDir,
      options.legacyProxyRoot,
    );
    const artifactFileName = path.basename(artifactSourcePath);
    const relativeArtifactPath = path.posix.join('proxies', artifactFileName);
    const artifactTargetPath = path.join(
      options.resourceCacheRoot,
      ...relativeArtifactPath.split('/'),
    );
    const existingSource = destinations.get(artifactTargetPath);
    if (existingSource !== undefined && existingSource !== artifactSourcePath) {
      throw new Error(`Legacy proxy artifacts collide at ${relativeArtifactPath}.`);
    }
    destinations.set(artifactTargetPath, artifactSourcePath);
    const createdAt = new Date(proxy.createdAt).toISOString();
    const resolution = parseProxyResolution(proxy.proxyResolution);
    const status = mapProxyStatus(proxy.status);
    const variant: ResourceCacheVariantEntry = {
      key: LEGACY_PROXY_VARIANT_KEY,
      role: 'proxy',
      status,
      relativePath: relativeArtifactPath,
      format: path.extname(artifactFileName).slice(1) || undefined,
      mimeType: path.extname(artifactFileName).toLowerCase() === '.mp4' ? 'video/mp4' : undefined,
      ...(resolution ? { width: resolution.width, height: resolution.height } : {}),
      sourceFingerprint: {
        strategy: 'mtime-size',
        value: `${proxy.sourceModified}:${proxy.sourceSize}`,
      },
      createdAt,
      updatedAt: createdAt,
      rebuildable: true,
      ...(proxy.error ? { error: proxy.error } : {}),
    };
    return {
      resourceId,
      artifactSourcePath,
      artifactTargetPath,
      entry: {
        resource: {
          id: resourceId,
          scope: 'project',
          provider: PROXY_PROVIDER,
          kind: 'media',
          source: {
            kind: 'file',
            ...source.reference,
            identity: {
              sizeBytes: proxy.sourceSize,
              mtimeMs: proxy.sourceModified,
            },
          },
          locator: { kind: 'file', path: source.path },
          fingerprint: {
            strategy: 'mtime-size',
            value: `${proxy.sourceModified}:${proxy.sourceSize}`,
          },
        },
        variants: [variant],
        createdAt,
        updatedAt: createdAt,
        status,
        providerMetadata: {
          legacyProxyStatus: proxy.status,
          proxyResolution: proxy.proxyResolution,
        },
      },
    };
  });
}

function mergeImportedEntries(
  manifest: ResourceCacheManifest,
  importedEntries: readonly ResourceCacheEntry[],
  migratedAt: number,
): ResourceCacheManifest {
  const entries = { ...manifest.entries };
  for (const imported of importedEntries) {
    const existing = entries[imported.resource.id];
    if (!existing) {
      entries[imported.resource.id] = imported;
      continue;
    }
    const variants = new Map(existing.variants.map((variant) => [variant.key, variant]));
    for (const variant of imported.variants) variants.set(variant.key, variant);
    entries[imported.resource.id] = {
      ...existing,
      variants: [...variants.values()],
      updatedAt: new Date(migratedAt).toISOString(),
    };
  }
  return {
    ...manifest,
    updatedAt: new Date(migratedAt).toISOString(),
    entries,
  };
}

function assertVerifiedProjection(
  importedEntries: readonly ResourceCacheEntry[],
  actual: ResourceCacheManifest,
): void {
  for (const imported of importedEntries) {
    const actualEntry = actual.entries[imported.resource.id];
    if (!actualEntry) {
      throw new Error(`Proxy migration identity verification failed for ${imported.resource.id}.`);
    }
    for (const variant of imported.variants) {
      if (!actualEntry.variants.some((candidate) => candidate.key === variant.key)) {
        throw new Error(
          `Proxy migration variant verification failed for ${imported.resource.id}:${variant.key}.`,
        );
      }
    }
  }
}

function normalizeProxySourcePath(
  value: string,
  workDir: string,
): {
  readonly path: string;
  readonly reference: { readonly projectRelativePath: string } | { readonly filePath: string };
} {
  const portable = value.replace(/\\/gu, '/');
  if (portable.startsWith('${')) {
    const match = /^\$\{[A-Z][A-Z0-9_]*\}\/([^\0]+)$/u.exec(portable);
    if (!match || !isManagedPortableSuffix(match[1] ?? '')) {
      throw new Error('Legacy proxy source path uses an invalid variable-based path.');
    }
    return { path: portable, reference: { filePath: portable } };
  }
  if (portable.includes('${')) {
    throw new Error('Legacy proxy source path contains a misplaced path variable.');
  }
  const projectRelativePath = normalizeWorkspaceRelativePath(portable, workDir, 'source');
  return { path: projectRelativePath, reference: { projectRelativePath } };
}

function normalizeWorkspaceRelativePath(value: string, workDir: string, field: string): string {
  if (path.isAbsolute(value)) {
    throw new Error(`Legacy proxy ${field} path must be workspace-relative.`);
  }
  const absolute = path.resolve(workDir, value);
  if (!isPathInside(absolute, workDir)) {
    throw new Error(`Legacy proxy ${field} path escapes the workspace root.`);
  }
  return path.relative(workDir, absolute).split(path.sep).join('/');
}

function isManagedPortableSuffix(value: string): boolean {
  if (!value || path.posix.isAbsolute(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function resolveLegacyProxyPath(value: string, workDir: string, legacyProxyRoot: string): string {
  if (path.isAbsolute(value)) {
    throw new Error('Legacy proxy artifact path must be workspace-relative.');
  }
  const absolute = path.resolve(workDir, value);
  if (!isPathInside(absolute, legacyProxyRoot)) {
    throw new Error('Legacy proxy artifact path escapes the managed proxy root.');
  }
  return absolute;
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

function parseProxyResolution(
  value: string,
): { readonly width: number; readonly height: number } | null {
  const match = /^(\d+)x(\d+)$/u.exec(value);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

function mapProxyStatus(status: ProxyStatus): ResourceCacheStatus {
  switch (status) {
    case 'pending':
    case 'generating':
      return 'materializing';
    case 'ready':
    case 'failed':
    case 'stale':
      return status;
  }
}

function isProxyManifest(value: unknown): value is ProxyManifest {
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['proxies'])) return false;
  return Object.values(value['proxies']).every(isProxyEntry);
}

function isProxyEntry(value: unknown): value is ProxyEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value['source'] === 'string' &&
    typeof value['proxy'] === 'string' &&
    isFiniteNumber(value['sourceSize']) &&
    value['sourceSize'] >= 0 &&
    isFiniteNumber(value['sourceModified']) &&
    typeof value['proxyResolution'] === 'string' &&
    isProxyStatus(value['status']) &&
    (value['error'] === undefined || typeof value['error'] === 'string') &&
    isFiniteNumber(value['createdAt'])
  );
}

function isProxyStatus(value: unknown): value is ProxyStatus {
  return (
    value === 'pending' ||
    value === 'generating' ||
    value === 'ready' ||
    value === 'failed' ||
    value === 'stale'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function quarantineSource(sourcePath: string, migratedAt: number): Promise<string | null> {
  const quarantinePath = `${sourcePath}.quarantine-${migratedAt}`;
  try {
    await rename(sourcePath, quarantinePath);
    return quarantinePath;
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

function emptyMigrationReport(sourcePath: string): ProxyManifestMigrationReport {
  return {
    sourceStatus: 'absent',
    sourcePath,
    backupPath: null,
    archivedPath: null,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedEntryCount: 0,
    importedVariantCount: 0,
    copiedArtifactCount: 0,
    verifiedEntryCount: 0,
    verifiedVariantCount: 0,
    unrecoverable: [],
  };
}
