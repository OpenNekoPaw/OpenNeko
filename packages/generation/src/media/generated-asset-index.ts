import { randomUUID } from 'node:crypto';
import {
  validateGeneratedAssetRevisionRef,
  type GeneratedAsset,
  type GeneratedAssetType,
} from '@neko/generation';

export interface AssetFilter {
  readonly type?: GeneratedAssetType;
  readonly model?: string;
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

export interface GeneratedAssetIndexStore {
  load(): Promise<readonly GeneratedAsset[]>;
  update(
    operation: (assets: readonly GeneratedAsset[]) => readonly GeneratedAsset[],
  ): Promise<readonly GeneratedAsset[]>;
}

export interface GeneratedAssetCatalog {
  get(id: string): GeneratedAsset | undefined;
  list(filter?: AssetFilter): GeneratedAsset[];
}

export class GeneratedAssetIndex implements GeneratedAssetCatalog {
  private readonly assets = new Map<string, GeneratedAsset>();

  constructor(private readonly store: GeneratedAssetIndexStore) {
    if (!isGeneratedAssetIndexStore(store)) {
      throw new Error('Generated asset index requires a GeneratedAssetIndexStore.');
    }
  }

  async load(): Promise<void> {
    this.replaceAssets(assertGeneratedAssets(await this.store.load()));
  }

  dispose(): void {
    // Store-backed updates commit eagerly; the index owns no buffered handles.
  }

  async add(asset: GeneratedAsset): Promise<void> {
    assertGeneratedAsset(asset);
    const assets = await this.store.update((current) =>
      mergeGeneratedAssets(assertGeneratedAssets(current), [asset]),
    );
    this.replaceAssets(assertGeneratedAssets(assets));
  }

  get(id: string): GeneratedAsset | undefined {
    return this.assets.get(id);
  }

  async remove(id: string): Promise<boolean> {
    let existed = false;
    const assets = await this.store.update((current) => {
      const validated = assertGeneratedAssets(current);
      existed = validated.some((asset) => asset.id === id);
      return validated.filter((asset) => asset.id !== id);
    });
    this.replaceAssets(assertGeneratedAssets(assets));
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
      this.assets.set(asset.id, asset);
    }
  }
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

function isGeneratedAssetIndexStore(value: unknown): value is GeneratedAssetIndexStore {
  return (
    isRecord(value) && typeof value['load'] === 'function' && typeof value['update'] === 'function'
  );
}

function isGeneratedAsset(value: unknown): value is GeneratedAsset {
  return (
    isRecord(value) &&
    typeof value['path'] === 'string' &&
    isPathlessGeneratedAsset(value) &&
    isGeneratedAssetLifecycleConsistent(value)
  );
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

function assertGeneratedAssets(assets: readonly GeneratedAsset[]): readonly GeneratedAsset[] {
  for (const asset of assets) assertGeneratedAsset(asset);
  return assets;
}

function assertGeneratedAsset(asset: unknown): asserts asset is GeneratedAsset {
  if (!isGeneratedAsset(asset)) {
    const assetId = isRecord(asset) && typeof asset['id'] === 'string' ? asset['id'] : '<unknown>';
    throw new Error(
      `invalid-generated-asset: Generated asset ${assetId} does not satisfy the canonical contract.`,
    );
  }
}

function isGeneratedAssetLifecycleConsistent(asset: Record<string, unknown>): boolean {
  if (asset['lifecycle'] === undefined) return true;
  const validation = validateGeneratedAssetRevisionRef(asset['lifecycle']);
  if (!validation.ok) return false;
  return (
    validation.lifecycle.assetId === asset['id'] &&
    validation.lifecycle.mimeType === asset['mimeType'] &&
    validation.lifecycle.mediaKind === generatedAssetMediaKind(asset['type'])
  );
}

function generatedAssetMediaKind(
  value: unknown,
): 'image' | 'audio' | 'video' | 'storyboard' | undefined {
  switch (value) {
    case 'generated-image':
      return 'image';
    case 'generated-audio':
      return 'audio';
    case 'generated-video':
      return 'video';
    case 'generated-storyboard':
      return 'storyboard';
    default:
      return undefined;
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
