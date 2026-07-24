import * as path from 'node:path';
import type { GeneratedAsset } from '@neko/shared';
import { createNodeGeneratedOutputProjectionBinding } from '@neko/shared/local-metadata/node';
import {
  GeneratedAssetIndex,
  migrateLegacyGeneratedAssetIndex,
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

export interface WorkspaceGeneratedAssetIndexBinding {
  readonly index: GeneratedAssetIndex;
  dispose(): Promise<void>;
}

export async function createWorkspaceGeneratedAssetIndex(options: {
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly logger?: {
    warn(message: string, details?: unknown): void;
  };
}): Promise<WorkspaceGeneratedAssetIndexBinding> {
  const projectionBinding = await createNodeGeneratedOutputProjectionBinding(options);
  try {
    const migrationReport = await migrateLegacyGeneratedAssetIndex({
      indexPath: path.join(options.workspaceRoot, 'neko', 'generated', 'index.json'),
      store: projectionBinding.store,
    });
    if (
      migrationReport.sourceStatus === 'quarantined' ||
      migrationReport.verifiedEntryCount !== migrationReport.importedEntryCount
    ) {
      options.logger?.warn('Generated asset index migration requires attention', {
        report: migrationReport,
      });
    }
    await projectionBinding.store.update((assets) => assets);
    const index = new GeneratedAssetIndex(projectionBinding.store);
    await index.load();
    return { index, dispose: () => projectionBinding.dispose() };
  } catch (error) {
    await projectionBinding.dispose();
    throw error;
  }
}
