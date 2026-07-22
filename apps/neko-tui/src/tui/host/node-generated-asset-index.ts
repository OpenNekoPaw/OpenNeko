import * as path from 'node:path';
import {
  GeneratedAssetIndex,
  migrateLegacyGeneratedAssetIndex,
  type GeneratedAssetIndexMigrationReport,
} from '@neko/platform';
import { createNodeGeneratedOutputProjectionBinding } from '@neko/shared/local-metadata/node';

export interface NodeGeneratedAssetIndexBinding {
  readonly index: GeneratedAssetIndex;
  readonly migrationReport: GeneratedAssetIndexMigrationReport;
  dispose(): Promise<void>;
}

export async function createNodeGeneratedAssetIndexBinding(options: {
  readonly workspaceRoot: string;
  readonly homedir: string;
}): Promise<NodeGeneratedAssetIndexBinding> {
  const projectionBinding = await createNodeGeneratedOutputProjectionBinding(options);
  try {
    const migrationReport = await migrateLegacyGeneratedAssetIndex({
      indexPath: path.join(options.workspaceRoot, 'neko', 'generated', 'index.json'),
      store: projectionBinding.store,
    });
    await projectionBinding.store.update((assets) => assets);
    const index = new GeneratedAssetIndex(projectionBinding.store);
    await index.load();
    return { index, migrationReport, dispose: () => projectionBinding.dispose() };
  } catch (error) {
    await projectionBinding.dispose();
    throw error;
  }
}
