/**
 * Asset Diff Module Index
 *
 * Exports all asset diff functionality for use by the extension.
 */

// Editor exports
export {
  AssetVariantDiffEditorProvider,
  AssetVariantDiffFileSystemProvider,
} from './editor/AssetVariantDiffEditorProvider';
export { AssetVariantDiffMessageHandler } from './editor/AssetVariantDiffMessageHandler';
export {
  AssetVariantDiffSession,
  type IAssetVariantDiffMessageHandler,
  type IAssetVariantDiffSession,
  type IAssetVariantDiffSessionFactory,
  type IAssetVariantDiffSessionOptions,
} from './editor/AssetVariantDiffSession';
export { AssetVariantDiffSessionFactory } from './editor/AssetVariantDiffSessionFactory';

// =============================================================================
// Module Initialization
// =============================================================================

import * as vscode from 'vscode';
import type { AssetEntity, VariantComparisonResult } from '@neko/shared';
import {
  AssetVariantDiffEditorProvider,
  AssetVariantDiffFileSystemProvider,
} from './editor/AssetVariantDiffEditorProvider';
import type { IAssetVariantDiffSessionFactory } from './editor/AssetVariantDiffSession';

/**
 * Initialize the asset diff module
 * Call this during extension activation
 */
export function initializeAssetDiff(
  context: vscode.ExtensionContext,
  getEntity: (id: string) => Promise<AssetEntity | null>,
  compareVariants?: (
    entityId: string,
    variantIdA: string,
    variantIdB: string,
  ) => Promise<VariantComparisonResult>,
  sessionFactory?: IAssetVariantDiffSessionFactory,
): AssetVariantDiffEditorProvider {
  // Register file system provider for virtual documents
  const fsProvider = new AssetVariantDiffFileSystemProvider();
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(AssetVariantDiffEditorProvider.scheme, fsProvider, {
      isCaseSensitive: true,
      isReadonly: true,
    }),
  );

  // Create and register the editor provider
  const editorProvider = new AssetVariantDiffEditorProvider(
    context,
    getEntity,
    compareVariants,
    sessionFactory,
  );

  // Register custom editor
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      AssetVariantDiffEditorProvider.viewType,
      editorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  // Register command for comparing two variants
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assetDiff.compareVariants',
      async (entityId: string, variantIdA: string, variantIdB: string) => {
        // Create the comparison URI
        const uri = AssetVariantDiffEditorProvider.createCompareUri(
          entityId,
          variantIdA,
          variantIdB,
        );

        // Set up comparison state
        editorProvider.setComparisonState(uri, {
          entityId,
          variantIdA,
          variantIdB,
        });

        // Open the custom editor
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          AssetVariantDiffEditorProvider.viewType,
        );
      },
    ),
  );

  return editorProvider;
}
