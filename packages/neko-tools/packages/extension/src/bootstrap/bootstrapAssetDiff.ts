import * as vscode from 'vscode';
import type { IAssetEntityReader } from '../contracts/IAssetEntityReader';
import type { IVariantComparisonService } from '../contracts/IVariantComparisonService';
import {
  AssetVariantDiffEditorProvider,
  AssetVariantDiffSessionFactory,
  initializeAssetDiff,
} from '../asset-diff';

export function bootstrapAssetDiff(
  context: vscode.ExtensionContext,
  assetEntityReader: IAssetEntityReader,
  variantComparisonService: IVariantComparisonService,
): AssetVariantDiffEditorProvider {
  const getEntity = async (entityId: string) => assetEntityReader.getEntity(entityId);
  const compareVariants = async (entityId: string, variantIdA: string, variantIdB: string) =>
    variantComparisonService.compare(entityId, variantIdA, variantIdB);
  const sessionFactory = new AssetVariantDiffSessionFactory(compareVariants);

  return initializeAssetDiff(context, getEntity, compareVariants, sessionFactory);
}
