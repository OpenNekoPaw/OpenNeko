import * as path from 'node:path';
import {
  stripGeneratedAssetPath,
  type GeneratedAsset,
  type PathlessGeneratedAsset,
} from '../types/generated-asset';
import type { ResourceCacheEntry, ResourceCacheManifestStore } from '../types/resource-cache';
import { PathResolver } from '../path/resolver';
import { createNodeWorkspaceResourceCacheMetadataBinding } from './node-workspace-resource-cache-binding';

export interface GeneratedOutputProjectionStore {
  load(): Promise<readonly GeneratedAsset[]>;
  update(
    operation: (assets: readonly GeneratedAsset[]) => readonly GeneratedAsset[],
  ): Promise<readonly GeneratedAsset[]>;
}

export interface NodeGeneratedOutputProjectionBinding {
  readonly store: GeneratedOutputProjectionStore;
  dispose(): Promise<void>;
}

interface GeneratedOutputProjectionPayload {
  readonly version: 1;
  readonly asset: PathlessGeneratedAsset;
  readonly pathKey: string;
  readonly storyboardShotPathKeys?: readonly (readonly string[])[];
}

export interface LocalMetadataGeneratedOutputProjectionStoreOptions {
  readonly manifestStore: ResourceCacheManifestStore;
  readonly workspaceRoot: string;
  readonly pathResolver: PathResolver;
  readonly now?: () => string;
}

const GENERATED_OUTPUT_INDEX_PROVIDER = 'generated-output-index';
const GENERATED_OUTPUT_PROJECTION_FIELD = 'generatedOutputProjection';

/**
 * Host-only adapter preserving the existing generated-output projection ledger while keeping
 * ResourceCache contracts out of product packages. Generated files remain durable workspace data.
 */
export class LocalMetadataGeneratedOutputProjectionStore implements GeneratedOutputProjectionStore {
  private readonly now: () => string;

  constructor(private readonly options: LocalMetadataGeneratedOutputProjectionStoreOptions) {
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
    if (isRetiredGeneratedDraftProjection(entry)) {
      throw new Error(
        `retired-generated-draft-projection: Resource ${entry.resource.id} must be rebuilt through the generated output index.`,
      );
    }
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
      entry.resource.provider === GENERATED_OUTPUT_INDEX_PROVIDER &&
      entry.providerMetadata?.[GENERATED_OUTPUT_PROJECTION_FIELD] !== undefined
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

export async function createNodeGeneratedOutputProjectionBinding(options: {
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly now?: () => string;
}): Promise<NodeGeneratedOutputProjectionBinding> {
  const metadataBinding = await createNodeWorkspaceResourceCacheMetadataBinding({
    homedir: options.homedir,
    workDir: options.workspaceRoot,
    ...(options.now ? { now: options.now } : {}),
  });
  const pathResolver = new PathResolver(
    new Map([
      ['WORKSPACE', normalizePath(options.workspaceRoot)],
      ['HOME', normalizePath(options.homedir)],
    ]),
  );
  return {
    store: new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: metadataBinding.manifestStore,
      workspaceRoot: options.workspaceRoot,
      pathResolver,
      ...(options.now ? { now: options.now } : {}),
    }),
    dispose: () => metadataBinding.dispose(),
  };
}

function isRetiredGeneratedDraftProjection(entry: ResourceCacheEntry): boolean {
  return (
    entry.resource.kind === 'generated' &&
    (entry.resource.provider === ['generated', 'draft', 'index'].join('-') ||
      entry.providerMetadata?.[['generated', 'Draft', 'Projection'].join('')] !== undefined)
  );
}

function readGeneratedOutputProjection(
  entry: ResourceCacheEntry,
): GeneratedOutputProjectionPayload | undefined {
  const value =
    entry.resource.provider === GENERATED_OUTPUT_INDEX_PROVIDER
      ? entry.providerMetadata?.[GENERATED_OUTPUT_PROJECTION_FIELD]
      : undefined;
  return isGeneratedOutputProjectionPayload(value) ? value : undefined;
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

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/gu, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/u, '') : normalized;
}
