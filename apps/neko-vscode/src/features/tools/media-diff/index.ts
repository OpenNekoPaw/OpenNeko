import type { FeatureRuntimeContext } from '../../../feature-runtime-context';

export { MediaDiffService } from './services/MediaDiffService';
export { MediaDiffEditorProvider } from './editor/MediaDiffEditorProvider';
export { MediaDiffEditorSessionFactory } from './editor/MediaDiffEditorSessionFactory';

// =============================================================================
// Module Initialization
// =============================================================================

import * as vscode from 'vscode';
import { getMediaType } from '@neko-tools/contracts';
import type { IMediaDiffService } from './services/MediaDiffService';
import { MediaDiffEditorProvider } from './editor/MediaDiffEditorProvider';
import type { IMediaDiffEditorSessionFactory } from './editor/MediaDiffEditorSession';
import { handleError } from '../utils/errorHandler';

/**
 * Initialize the media diff module
 * Call this during extension activation
 */
export function initializeMediaDiff(
  context: FeatureRuntimeContext,
  diffService: IMediaDiffService,
  sessionFactory: IMediaDiffEditorSessionFactory,
): MediaDiffEditorProvider {
  // Create and register the editor provider
  const editorProvider = new MediaDiffEditorProvider(context, diffService, sessionFactory);

  // Register custom editor
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(MediaDiffEditorProvider.viewType, editorProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register command for comparing two selected files (local comparison)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.mediaDiff.compareFiles',
      async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
        // Multi-select: uris contains all selected files
        // Single-select: only uri is provided
        const selectedFiles = uris ?? (uri ? [uri] : []);

        if (selectedFiles.length !== 2) {
          void handleError(new Error(vscode.l10n.t('mediaDiff.error.selectTwoFiles')), {
            showToUser: true,
          });
          return;
        }

        const [file1, file2] = selectedFiles as [vscode.Uri, vscode.Uri];

        // Validate both files are supported media types
        if (!diffService.isSupported(file1)) {
          void handleError(new Error(vscode.l10n.t('mediaDiff.error.unsupportedType')), {
            showToUser: true,
          });
          return;
        }
        if (!diffService.isSupported(file2)) {
          void handleError(new Error(vscode.l10n.t('mediaDiff.error.unsupportedType')), {
            showToUser: true,
          });
          return;
        }

        // Validate both files have the same media type
        const mediaType1 = getMediaType(file1.fsPath);
        const mediaType2 = getMediaType(file2.fsPath);
        if (mediaType1 !== mediaType2) {
          void handleError(new Error(vscode.l10n.t('mediaDiff.error.typeMismatch')), {
            showToUser: true,
          });
          return;
        }

        // Set up local comparison mode
        // file2 is shown on the right (current), file1 is shown on the left (previous)
        editorProvider.setLocalCompareFile(file2, file1);

        // Open the custom editor with file2 as the document
        await vscode.commands.executeCommand(
          'vscode.openWith',
          file2,
          MediaDiffEditorProvider.viewType,
        );
      },
    ),
  );

  return editorProvider;
}
