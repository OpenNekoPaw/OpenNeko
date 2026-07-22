import { promises as fsp } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { GeneratedAsset, GeneratedAssetType } from '@neko/shared';

export interface AssetFilter {
  readonly type?: GeneratedAssetType;
  readonly model?: string;
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

interface IndexFile {
  readonly version: 1;
  readonly assets: GeneratedAsset[];
}

export interface GeneratedAssetIndexStore {
  load(): Promise<readonly GeneratedAsset[]>;
  update(
    operation: (assets: readonly GeneratedAsset[]) => readonly GeneratedAsset[],
  ): Promise<readonly GeneratedAsset[]>;
}

export class GeneratedAssetIndex {
  private readonly assets = new Map<string, GeneratedAsset>();

  constructor(private readonly store: GeneratedAssetIndexStore) {
    if (!isGeneratedAssetIndexStore(store)) {
      throw new Error('Legacy generated asset JSON indexes are migration-only.');
    }
  }

  async load(): Promise<void> {
    this.assets.clear();
    this.replaceAssets(await this.store.load());
  }

  dispose(): void {
    // Store-backed updates commit eagerly; the index owns no buffered handles.
  }

  async add(asset: GeneratedAsset): Promise<void> {
    const assets = await this.store.update((current) => mergeGeneratedAssets(current, [asset]));
    this.replaceAssets(assets);
  }

  get(id: string): GeneratedAsset | undefined {
    return this.assets.get(id);
  }

  async remove(id: string): Promise<boolean> {
    let existed = false;
    const assets = await this.store.update((current) => {
      existed = current.some((asset) => asset.id === id);
      return current.filter((asset) => asset.id !== id);
    });
    this.replaceAssets(assets);
    return existed;
  }

  list(filter?: AssetFilter): GeneratedAsset[] {
    let results = Array.from(this.assets.values());
    if (filter?.type) results = results.filter((asset) => asset.type === filter.type);
    if (filter?.model) results = results.filter((asset) => asset.model === filter.model);
    const after = filter?.after;
    const before = filter?.before;
    if (after) results = results.filter((asset) => asset.generatedAt >= after);
    if (before) results = results.filter((asset) => asset.generatedAt < before);
    results.sort((left, right) => (right.generatedAt > left.generatedAt ? 1 : -1));
    if (filter?.limit !== undefined && filter.limit > 0) results = results.slice(0, filter.limit);
    return results;
  }

  get size(): number {
    return this.assets.size;
  }

  private replaceAssets(assets: readonly GeneratedAsset[]): void {
    this.assets.clear();
    for (const asset of assets) {
      if (asset.id && asset.type) this.assets.set(asset.id, asset);
    }
  }
}

export interface GeneratedAssetIndexMigrationReport {
  readonly sourceStatus: 'absent' | 'migrated' | 'quarantined';
  readonly sourcePath: string;
  readonly backupPath: string | null;
  readonly archivedPath: string | null;
  readonly quarantinePath: string | null;
  readonly sourceDiagnostic: string | null;
  readonly importedEntryCount: number;
  readonly verifiedEntryCount: number;
}

export async function migrateLegacyGeneratedAssetIndex(options: {
  readonly indexPath: string;
  readonly store: GeneratedAssetIndexStore;
  readonly now?: () => string;
}): Promise<GeneratedAssetIndexMigrationReport> {
  if (!(await fileExists(options.indexPath)))
    return emptyGeneratedAssetMigration(options.indexPath);
  const migratedAt = (options.now ?? (() => new Date().toISOString()))();
  const suffix = migratedAt.replace(/[^0-9A-Za-z-]/gu, '-');
  const backupPath = `${options.indexPath}.backup-${suffix}`;
  try {
    await fsp.copyFile(options.indexPath, backupPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return emptyGeneratedAssetMigration(options.indexPath);
    throw error;
  }

  let legacyAssets: readonly GeneratedAsset[];
  try {
    const parsed: unknown = JSON.parse(await fsp.readFile(backupPath, 'utf8'));
    if (!isIndexFile(parsed)) {
      throw new Error('Legacy generated asset index must use the valid version 1 schema.');
    }
    legacyAssets = parsed.assets;
  } catch (error) {
    const quarantinePath = await moveFileIfPresent(
      options.indexPath,
      `${options.indexPath}.quarantine-${suffix}`,
    );
    return {
      ...emptyGeneratedAssetMigration(options.indexPath),
      sourceStatus: 'quarantined',
      backupPath,
      quarantinePath,
      sourceDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }

  await options.store.update((current) => mergeGeneratedAssets(current, legacyAssets));
  const importedIds = new Set(legacyAssets.map((asset) => asset.id));
  const verifiedIds = (await options.store.load())
    .filter((asset) => importedIds.has(asset.id))
    .map((asset) => asset.id)
    .sort();
  const expectedIds = [...importedIds].sort();
  if (
    expectedIds.length !== verifiedIds.length ||
    expectedIds.some((id, index) => id !== verifiedIds[index])
  ) {
    throw new Error(
      `Generated asset index migration verification failed: expected ${expectedIds.length}, received ${verifiedIds.length}.`,
    );
  }
  const archivedPath = await moveFileIfPresent(
    options.indexPath,
    `${options.indexPath}.migrated-${suffix}`,
  );
  return {
    sourceStatus: 'migrated',
    sourcePath: options.indexPath,
    backupPath,
    archivedPath,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedEntryCount: legacyAssets.length,
    verifiedEntryCount: verifiedIds.length,
  };
}

export function generateAssetId(): string {
  return randomUUID();
}

function mergeGeneratedAssets(
  existingAssets: readonly GeneratedAsset[],
  pendingAssets: readonly GeneratedAsset[],
): GeneratedAsset[] {
  const merged = new Map<string, GeneratedAsset>();
  for (const asset of existingAssets) {
    if (asset.id && asset.type) merged.set(asset.id, asset);
  }
  for (const asset of pendingAssets) {
    if (asset.id && asset.type) merged.set(asset.id, asset);
  }
  return [...merged.values()];
}

function isIndexFile(value: unknown): value is IndexFile {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    Array.isArray(value['assets']) &&
    value['assets'].every(isGeneratedAsset)
  );
}

function isGeneratedAssetIndexStore(value: unknown): value is GeneratedAssetIndexStore {
  return (
    isRecord(value) && typeof value['load'] === 'function' && typeof value['update'] === 'function'
  );
}

function isGeneratedAsset(value: unknown): value is GeneratedAsset {
  return isRecord(value) && typeof value['path'] === 'string' && isPathlessGeneratedAsset(value);
}

function isPathlessGeneratedAsset(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['type'] !== 'string' ||
    typeof value['mimeType'] !== 'string' ||
    typeof value['generatedAt'] !== 'string'
  ) {
    return false;
  }
  switch (value['type']) {
    case 'generated-image':
      return isGeneratedImageShape(value);
    case 'generated-audio':
      return (
        isFiniteNumber(value['duration']) &&
        isFiniteNumber(value['sampleRate']) &&
        isFiniteNumber(value['channels'])
      );
    case 'generated-video':
      return (
        isFiniteNumber(value['duration']) &&
        isFiniteNumber(value['width']) &&
        isFiniteNumber(value['height']) &&
        isFiniteNumber(value['fps'])
      );
    case 'generated-storyboard':
      return (
        Array.isArray(value['scenes']) &&
        value['scenes'].every(
          (scene) =>
            isRecord(scene) &&
            isFiniteNumber(scene['sceneIndex']) &&
            typeof scene['heading'] === 'string' &&
            Array.isArray(scene['shots']) &&
            scene['shots'].every(
              (shot) =>
                isRecord(shot) && shot['type'] === 'generated-image' && isGeneratedImageShape(shot),
            ),
        )
      );
    default:
      return false;
  }
}

function isGeneratedImageShape(value: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(value['width']) &&
    isFiniteNumber(value['height']) &&
    typeof value['ratio'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function moveFileIfPresent(sourcePath: string, targetPath: string): Promise<string | null> {
  try {
    await fsp.rename(sourcePath, targetPath);
    return targetPath;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return null;
    throw error;
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

function emptyGeneratedAssetMigration(sourcePath: string): GeneratedAssetIndexMigrationReport {
  return {
    sourceStatus: 'absent',
    sourcePath,
    backupPath: null,
    archivedPath: null,
    quarantinePath: null,
    sourceDiagnostic: null,
    importedEntryCount: 0,
    verifiedEntryCount: 0,
  };
}
