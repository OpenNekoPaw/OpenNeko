import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  stripGeneratedAssetPath,
  type GeneratedAsset,
  type GeneratedAssetType,
  type PathlessGeneratedAsset,
  type ResourceCacheEntry,
  type ResourceCacheManifestStore,
} from '@neko/shared';
import { PathResolver } from '@neko/shared';

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

interface GeneratedOutputProjectionPayload {
  readonly version: 1;
  readonly asset: PathlessGeneratedAsset;
  readonly pathKey: string;
  readonly storyboardShotPathKeys?: readonly (readonly string[])[];
}

export interface ResourceCacheGeneratedAssetIndexStoreOptions {
  readonly manifestStore: ResourceCacheManifestStore;
  readonly workspaceRoot: string;
  readonly pathResolver: PathResolver;
  readonly now?: () => string;
}

export interface ResourceCacheGeneratedAssetIndexBinding {
  readonly index: GeneratedAssetIndex;
  readonly migrationReport: GeneratedAssetIndexMigrationReport;
}

const INDEX_FILE_NAME = 'index.json';
const GENERATED_OUTPUT_INDEX_PROVIDER = 'generated-output-index';
const GENERATED_OUTPUT_PROJECTION_FIELD = 'generatedOutputProjection';
const LEGACY_GENERATED_DRAFT_INDEX_PROVIDER = 'generated-draft-index';
const LEGACY_GENERATED_DRAFT_PROJECTION_FIELD = 'generatedDraftProjection';

export class ResourceCacheGeneratedAssetIndexStore implements GeneratedAssetIndexStore {
  private readonly now: () => string;

  constructor(private readonly options: ResourceCacheGeneratedAssetIndexStoreOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async load(): Promise<readonly GeneratedAsset[]> {
    const manifest = await this.options.manifestStore.load();
    return Object.values(manifest.entries).flatMap((entry) => {
      const asset = this.decodeEntry(entry);
      return asset ? [asset] : [];
    });
  }

  async update(
    operation: (assets: readonly GeneratedAsset[]) => readonly GeneratedAsset[],
  ): Promise<readonly GeneratedAsset[]> {
    let updatedAssets: readonly GeneratedAsset[] = [];
    await this.options.manifestStore.update((manifest) => {
      const currentAssets = Object.values(manifest.entries).flatMap((entry) => {
        const asset = this.decodeEntry(entry);
        return asset ? [asset] : [];
      });
      updatedAssets = operation(currentAssets);
      const retainedEntries = Object.fromEntries(
        Object.entries(manifest.entries).filter(([, entry]) => !this.isProjectionEntry(entry)),
      );
      const projectionEntries = Object.fromEntries(
        updatedAssets.map((asset) => {
          const entry = this.encodeEntry(asset);
          return [entry.resource.id, entry];
        }),
      );
      return {
        ...manifest,
        updatedAt: this.now(),
        entries: { ...retainedEntries, ...projectionEntries },
      };
    });
    return updatedAssets;
  }

  private encodeEntry(asset: GeneratedAsset): ResourceCacheEntry {
    const pathKey = this.toPortablePathKey(asset.path);
    const projection: GeneratedOutputProjectionPayload = {
      version: 1,
      asset: stripGeneratedAssetPath(asset),
      pathKey,
      ...(asset.type === 'generated-storyboard'
        ? {
            storyboardShotPathKeys: asset.scenes.map((scene) =>
              scene.shots.map((shot) => this.toPortablePathKey(shot.path)),
            ),
          }
        : {}),
    };
    const projectRelativePath = this.toProjectRelativePath(pathKey);
    return {
      resource: {
        id: `generated-output:${asset.id}`,
        scope: 'project',
        provider: GENERATED_OUTPUT_INDEX_PROVIDER,
        kind: 'generated',
        source: {
          kind: 'generated-asset',
          generatedAssetId: asset.id,
          ...(projectRelativePath ? { projectRelativePath } : { filePath: pathKey }),
          metadata: { type: asset.type, mimeType: asset.mimeType },
        },
        locator: { kind: 'generated-asset', assetId: asset.id },
        fingerprint: asset.lifecycle
          ? { strategy: 'hash', value: asset.lifecycle.contentDigest }
          : { strategy: 'provider', value: `${asset.id}:${asset.generatedAt}` },
      },
      variants: [],
      createdAt: asset.generatedAt,
      updatedAt: this.now(),
      status: 'ready',
      providerMetadata: { [GENERATED_OUTPUT_PROJECTION_FIELD]: projection },
    };
  }

  private decodeEntry(entry: ResourceCacheEntry): GeneratedAsset | null {
    if (!this.isProjectionEntry(entry)) return null;
    const projection = readGeneratedOutputProjection(entry);
    if (!projection) return null;
    const assetPath = this.resolvePathKey(projection.pathKey);
    switch (projection.asset.type) {
      case 'generated-image':
      case 'generated-audio':
      case 'generated-video':
        return { ...projection.asset, path: assetPath };
      case 'generated-storyboard': {
        const shotPathKeys = projection.storyboardShotPathKeys;
        if (!shotPathKeys || shotPathKeys.length !== projection.asset.scenes.length) return null;
        return {
          ...projection.asset,
          path: assetPath,
          scenes: projection.asset.scenes.map((scene, sceneIndex) => {
            const scenePathKeys = shotPathKeys[sceneIndex];
            if (!scenePathKeys || scenePathKeys.length !== scene.shots.length) {
              throw new Error(
                `Generated storyboard ${projection.asset.id} has invalid shot paths.`,
              );
            }
            return {
              ...scene,
              shots: scene.shots.map((shot, shotIndex) => {
                const shotPathKey = scenePathKeys[shotIndex];
                if (!shotPathKey) {
                  throw new Error(
                    `Generated storyboard ${projection.asset.id} is missing shot path ${shotIndex}.`,
                  );
                }
                return { ...shot, path: this.resolvePathKey(shotPathKey) };
              }),
            };
          }),
        };
      }
    }
  }

  private isProjectionEntry(entry: ResourceCacheEntry): boolean {
    return (
      entry.resource.kind === 'generated' &&
      ((entry.resource.provider === GENERATED_OUTPUT_INDEX_PROVIDER &&
        entry.providerMetadata?.[GENERATED_OUTPUT_PROJECTION_FIELD] !== undefined) ||
        (entry.resource.provider === LEGACY_GENERATED_DRAFT_INDEX_PROVIDER &&
          entry.providerMetadata?.[LEGACY_GENERATED_DRAFT_PROJECTION_FIELD] !== undefined))
    );
  }

  private toPortablePathKey(filePath: string): string {
    const pathKey = this.options.pathResolver.contract(filePath).replace(/\\/gu, '/');
    if (!isPortablePathKey(pathKey)) {
      throw new Error(`Generated asset path is not portable: ${filePath}`);
    }
    return pathKey;
  }

  private resolvePathKey(pathKey: string): string {
    if (!isPortablePathKey(pathKey)) {
      throw new Error(`Generated asset projection path is not portable: ${pathKey}`);
    }
    const resolved = this.options.pathResolver.resolve(pathKey);
    if (resolved.includes('${')) {
      throw new Error(`Generated asset projection path variable is unresolved: ${pathKey}`);
    }
    return path.isAbsolute(resolved)
      ? resolved
      : path.resolve(this.options.workspaceRoot, resolved);
  }

  private toProjectRelativePath(pathKey: string): string | undefined {
    const prefix = '${WORKSPACE}/';
    return pathKey.startsWith(prefix) ? pathKey.slice(prefix.length) : undefined;
  }
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

export async function createResourceCacheGeneratedAssetIndex(options: {
  readonly manifestStore: ResourceCacheManifestStore;
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly now?: () => string;
}): Promise<ResourceCacheGeneratedAssetIndexBinding> {
  const pathResolver = new PathResolver(
    new Map([
      ['WORKSPACE', normalizePath(options.workspaceRoot)],
      ['HOME', normalizePath(options.homedir)],
    ]),
  );
  const store = new ResourceCacheGeneratedAssetIndexStore({
    manifestStore: options.manifestStore,
    workspaceRoot: options.workspaceRoot,
    pathResolver,
    ...(options.now ? { now: options.now } : {}),
  });
  const migrationReport = await migrateLegacyGeneratedAssetIndex({
    indexPath: path.join(options.workspaceRoot, 'neko', 'generated', INDEX_FILE_NAME),
    store,
    ...(options.now ? { now: options.now } : {}),
  });
  const index = new GeneratedAssetIndex(store);
  await store.update((assets) => assets);
  await index.load();
  return { index, migrationReport };
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

function isGeneratedOutputProjectionPayload(
  value: unknown,
): value is GeneratedOutputProjectionPayload {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    isPathlessGeneratedAsset(value['asset']) &&
    typeof value['pathKey'] === 'string' &&
    isPortablePathKey(value['pathKey']) &&
    (value['storyboardShotPathKeys'] === undefined ||
      (Array.isArray(value['storyboardShotPathKeys']) &&
        value['storyboardShotPathKeys'].every(
          (scene) => Array.isArray(scene) && scene.every(isPortablePathKey),
        )))
  );
}

function readGeneratedOutputProjection(
  entry: ResourceCacheEntry,
): GeneratedOutputProjectionPayload | undefined {
  const value =
    entry.resource.provider === GENERATED_OUTPUT_INDEX_PROVIDER
      ? entry.providerMetadata?.[GENERATED_OUTPUT_PROJECTION_FIELD]
      : entry.resource.provider === LEGACY_GENERATED_DRAFT_INDEX_PROVIDER
        ? entry.providerMetadata?.[LEGACY_GENERATED_DRAFT_PROJECTION_FIELD]
        : undefined;
  return isGeneratedOutputProjectionPayload(value) ? value : undefined;
}

function isGeneratedAsset(value: unknown): value is GeneratedAsset {
  return isRecord(value) && typeof value['path'] === 'string' && isPathlessGeneratedAsset(value);
}

function isPathlessGeneratedAsset(value: unknown): value is PathlessGeneratedAsset {
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

function isPortablePathKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.replace(/\\/gu, '/');
  return (
    normalized.trim().length > 0 &&
    !normalized.startsWith('/') &&
    !/^[A-Za-z]:\//u.test(normalized) &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    !normalized.includes('/../')
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

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/gu, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/u, '') : normalized;
}
