import * as path from 'node:path';
import type { GeneratedAsset, ResourceCacheManifestStore } from '@neko/shared';
import {
  createResourceCacheGeneratedAssetIndex,
  type GeneratedAssetIndex,
} from '@neko/platform/media/generated-asset-index';

export interface GeneratedAssetLookup {
  get(id: string): GeneratedAsset | undefined;
}

export function resolveGeneratedAssetOpenPath(
  ref: string,
  lookup: GeneratedAssetLookup | undefined,
): string | undefined {
  if (!lookup || !ref.startsWith('generated-assets/')) return undefined;

  const basename = path.basename(ref);
  const extension = path.extname(basename);
  const assetId = extension ? basename.slice(0, -extension.length) : basename;
  if (!assetId) return undefined;

  return lookup.get(assetId)?.path;
}

export async function createWorkspaceGeneratedAssetIndex(options: {
  readonly manifestStore: ResourceCacheManifestStore;
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly logger?: {
    warn(message: string, details?: unknown): void;
  };
}): Promise<GeneratedAssetIndex> {
  const binding = await createResourceCacheGeneratedAssetIndex(options);
  if (
    binding.migrationReport.sourceStatus === 'quarantined' ||
    binding.migrationReport.verifiedEntryCount !== binding.migrationReport.importedEntryCount
  ) {
    options.logger?.warn('Generated asset index migration requires attention', {
      report: binding.migrationReport,
    });
  }
  return binding.index;
}
