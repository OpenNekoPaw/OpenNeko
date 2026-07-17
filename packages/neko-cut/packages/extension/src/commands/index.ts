/**
 * Commands Module
 * VSCode 命令注册
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  createDefaultProject,
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
  type NekoProjectAuthoringResult,
  type NekoProjectAuthoringTarget,
} from '@neko/shared';
import { createNewFile } from '@neko/shared/vscode/extension';
import type { VideoProjectOutlineProvider } from '../views/outlineProvider';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import { getLogger, handleError } from '../base';
import type {
  CutProjectAuthoringImportedClip,
  ICutProjectAuthoringService,
} from '../services/CutProjectAuthoringService';
import { createNkvProjectRef } from '../services/CutProjectQualityFacade';

const logger = getLogger('Commands');
import { registerTimelineCommands } from './timeline-commands';

type GeneratedClipMediaType = 'image' | 'video' | 'audio';
type ImportGeneratedClipResult = NekoProjectAuthoringResult<CutProjectAuthoringImportedClip>;

interface ImportGeneratedClipCommandParams {
  readonly target?: NekoProjectAuthoringTarget;
  readonly documentUri?: string;
  readonly assetPath?: string;
  readonly data?: string;
  readonly type?: string;
  readonly name?: string;
  readonly mediaType?: string;
  readonly duration?: number;
  readonly startTime?: number;
  readonly trackId?: string;
  readonly trackIndex?: number;
  readonly expectedProjectRevision?: string;
  readonly reveal?: boolean;
}

function inferGeneratedClipMediaType(
  assetPath: string,
  mediaTypeHint?: string,
): GeneratedClipMediaType {
  if (mediaTypeHint === 'image' || mediaTypeHint === 'video' || mediaTypeHint === 'audio') {
    return mediaTypeHint;
  }

  const ext = path.extname(assetPath).toLowerCase();
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) return 'audio';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
  return 'video';
}

/**
 * Register all extension commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  _outlineProvider: VideoProjectOutlineProvider,
  videoEditorProvider: VideoEditorProvider,
  cutProjectAuthoringService: ICutProjectAuthoringService,
): void {
  // Command: New Video Project
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.newProject', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.nkv',
        template: (title) => JSON.stringify(createDefaultProject(title), null, 2),
        noFolderErrorMessage: vscode.l10n.t('neko.newProject.noFolder'),
        onCreated: async (fileUri) => {
          logger.info(`Created video project: ${fileUri.fsPath}`);
          await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');
        },
      });
    }),
  );

  // Command: Add to Timeline
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.cut.authoring.addSourceToTimeline',
      async (uri: vscode.Uri) =>
        addToTimeline(uri, videoEditorProvider, cutProjectAuthoringService),
    ),
  );

  // Command: Open in Video Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.openInEditor', async (uri: vscode.Uri) => {
      await openInEditor(uri);
    }),
  );

  // Command: Select element from outline (internal)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.selectElement',
      async (trackId: string, elementId: string) => {
        // Get the active webview and send a message to select the element
        const webview = videoEditorProvider.getActiveWebview();

        if (!webview) {
          logger.warn('No active webview found for element selection');
          return;
        }

        // Send message to webview to select and jump to the element
        webview.postMessage({
          type: 'selectElement',
          trackId,
          elementId,
        });

        logger.debug(`Selecting element: track=${trackId}, element=${elementId}`);
      },
    ),
  );

  // Command: Show Export Panel (triggered from status bar)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.showExportPanel', async () => {
      const webview = videoEditorProvider.getActiveWebview();

      if (!webview) {
        // No active webview — try to reopen the document with active export
        const exportDocUri = videoEditorProvider.getExportingDocumentUri();
        if (exportDocUri) {
          const uri = vscode.Uri.parse(exportDocUri);
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoEditor');
          // The webview ready handler will auto-show the export panel
          return;
        }
        void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }

      // Focus the video editor panel first
      await videoEditorProvider.focusActiveEditor();

      // Send message to webview to open export panel
      webview.postMessage({
        type: 'showExportPanel',
      });
    }),
  );

  // Command: Export Video (non-Webview, uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.exportVideo', async () => {
      await exportVideoCommand(videoEditorProvider);
    }),
  );

  // Command: Import a generated media clip through host-side Cut authoring.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.cut.authoring.importGeneratedClip',
      async (params?: ImportGeneratedClipCommandParams) => {
        if (!params) {
          return reportGeneratedClipResult(
            createNekoProjectAuthoringResult<CutProjectAuthoringImportedClip>({
              ok: false,
              diagnostics: [
                createNekoProjectAuthoringDiagnostic({
                  code: 'source-resolution-failed',
                  message: 'Generated clip import requires assetPath or data bytes.',
                }),
              ],
            }),
          );
        }

        const target = resolveGeneratedClipAuthoringTarget(params);
        if (!target.ok) return reportGeneratedClipResult(target.result);
        if (target.target.kind === 'file' && !params.expectedProjectRevision) {
          return reportGeneratedClipResult(
            createNekoProjectAuthoringResult({
              ok: false,
              diagnostics: [
                createNekoProjectAuthoringDiagnostic({
                  code: 'missing-project-revision',
                  message:
                    'Cut generated clip import requires expectedProjectRevision for a file target.',
                }),
              ],
            }),
          );
        }

        const mediaType = inferGeneratedClipMediaType(
          params.assetPath ?? params.name ?? 'generated-clip',
          params.mediaType ?? params.type,
        );
        const bytes = typeof params.data === 'string' ? dataUrlToBytes(params.data) : undefined;

        const result = await cutProjectAuthoringService.importGeneratedClip({
          target: target.target,
          ...(params.assetPath ? { sourcePath: params.assetPath } : {}),
          ...(bytes ? { bytes } : {}),
          ...(params.name ? { name: params.name } : {}),
          mediaType,
          ...(params.duration !== undefined ? { duration: params.duration } : {}),
          ...(params.startTime !== undefined ? { startTime: params.startTime } : {}),
          ...(params.trackId ? { trackId: params.trackId } : {}),
          ...(params.trackIndex !== undefined ? { trackIndex: params.trackIndex } : {}),
          ...(params.expectedProjectRevision
            ? { expectedProjectRevision: params.expectedProjectRevision }
            : {}),
        });
        const revealedResult = await revealCutAuthoringResult(
          result,
          target.target.reveal === true,
        );
        reportGeneratedClipResult(revealedResult);

        if (revealedResult.ok) {
          logger.info(
            `authoring.importGeneratedClip: ${params.assetPath ?? params.name ?? 'generated-clip'} (${mediaType})`,
          );
        }
        return revealedResult;
      },
    ),
  );

  // Register timeline commands (element, track, effect, transition, animation, render, export)
  registerTimelineCommands(context, videoEditorProvider, cutProjectAuthoringService);
}

function resolveGeneratedClipAuthoringTarget(
  params: ImportGeneratedClipCommandParams,
):
  | { readonly ok: true; readonly target: NekoProjectAuthoringTarget }
  | { readonly ok: false; readonly result: ImportGeneratedClipResult } {
  const reveal = params.reveal ?? params.target?.reveal ?? false;
  if (params.target?.documentUri) {
    return {
      ok: true,
      target: { ...params.target, reveal },
    };
  }
  if (params.documentUri) {
    return {
      ok: true,
      target: { kind: 'file', documentUri: params.documentUri, reveal },
    };
  }

  return {
    ok: false,
    result: createNekoProjectAuthoringResult<CutProjectAuthoringImportedClip>({
      ok: false,
      diagnostics: [
        createNekoProjectAuthoringDiagnostic({
          code: 'missing-authoring-target',
          message: 'Cut generated clip import requires an explicit file or new .nkv target.',
        }),
      ],
    }),
  };
}

async function revealCutAuthoringResult(
  result: ImportGeneratedClipResult,
  reveal: boolean,
): Promise<ImportGeneratedClipResult> {
  if (!result.ok || !result.documentUri || !reveal) return result;
  try {
    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.parse(result.documentUri),
      'neko.videoEditor',
    );
    return { ...result, revealed: true };
  } catch (error) {
    return {
      ...result,
      revealed: false,
      diagnostics: [
        ...result.diagnostics,
        createNekoProjectAuthoringDiagnostic({
          code: 'authoring-reveal-failed',
          severity: 'warning',
          message:
            error instanceof Error
              ? `Cut project was saved, but reveal failed: ${error.message}`
              : 'Cut project was saved, but reveal failed.',
        }),
      ],
    };
  }
}

function reportGeneratedClipResult(result: ImportGeneratedClipResult): ImportGeneratedClipResult {
  const blockingDiagnostic = result.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (blockingDiagnostic) {
    void handleError(new Error(blockingDiagnostic.message), { showToUser: true });
  }
  return result;
}

/**
 * Add a media file to the explicitly captured editor timeline.
 */
async function addToTimeline(
  fileUri: vscode.Uri,
  editorProvider: VideoEditorProvider,
  cutProjectAuthoringService: ICutProjectAuthoringService,
): Promise<void> {
  // Get file extension and determine media type
  const ext = path.extname(fileUri.fsPath).toLowerCase();
  let mediaType: 'video' | 'audio' | 'image';

  if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].includes(ext)) {
    mediaType = 'video';
  } else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) {
    mediaType = 'audio';
  } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
    mediaType = 'image';
  } else {
    void handleError(new Error(vscode.l10n.t('timeline.error.unsupportedType', { ext })), {
      showToUser: true,
    });
    return;
  }

  const documentUri = editorProvider.getActiveDocumentVsCodeUri()?.toString();
  const project = documentUri ? editorProvider.getProjectDataForDocument(documentUri) : null;
  const expectedProjectRevision =
    documentUri && project ? createNkvProjectRef(documentUri, project).projectRevision : undefined;
  const target = resolveGeneratedClipAuthoringTarget({
    assetPath: fileUri.fsPath,
    name: path.basename(fileUri.fsPath),
    mediaType,
    reveal: false,
    ...(documentUri ? { documentUri } : {}),
  });
  if (!target.ok) {
    reportGeneratedClipResult(target.result);
    return;
  }
  if (!expectedProjectRevision) {
    reportGeneratedClipResult(
      createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: [
          createNekoProjectAuthoringDiagnostic({
            code: 'missing-project-revision',
            message: 'The invoking Cut editor could not provide a project revision.',
          }),
        ],
      }),
    );
    return;
  }

  const result = await cutProjectAuthoringService.importMediaSource({
    target: target.target,
    sourcePath: fileUri.fsPath,
    name: path.basename(fileUri.fsPath),
    mediaType,
    ...(expectedProjectRevision ? { expectedProjectRevision } : {}),
  });
  if (!result.ok) {
    reportGeneratedClipResult(result);
    return;
  }

  vscode.window.showInformationMessage(
    vscode.l10n.t('timeline.info.addingToTimeline', {
      filename: path.basename(result.data?.sourcePath ?? fileUri.fsPath),
    }),
  );
}

/**
 * Open a .nkv file in the video editor
 */
async function openInEditor(fileUri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');
}

function dataUrlToBytes(data: string): Uint8Array {
  const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  return Buffer.from(base64, 'base64');
}

/**
 * Export video using ExportService (non-Webview path)
 *
 * Shows a save dialog, reads project data from the active document,
 * and runs the export with a VSCode progress notification.
 */
async function exportVideoCommand(editorProvider: VideoEditorProvider): Promise<void> {
  const docUri = editorProvider.getActiveDocumentUri();
  if (!docUri) {
    void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
      showToUser: true,
      severity: 'warning',
    });
    return;
  }

  const exportService = editorProvider.getExportService(docUri);
  if (!exportService) {
    void handleError(new Error('Export service not available for this document.'), {
      showToUser: true,
    });
    return;
  }

  if (exportService.isExporting()) {
    void handleError(new Error('An export is already in progress.'), {
      showToUser: true,
      severity: 'warning',
    });
    return;
  }

  const project = editorProvider.getProjectDataForDocument(docUri);
  if (!project) {
    void handleError(new Error('Cannot read project data: document not found.'), {
      showToUser: true,
    });
    return;
  }

  // Show save dialog
  const defaultName = project.name ? `${project.name}.mp4` : 'export.mp4';
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(
      path.join(path.dirname(vscode.Uri.parse(docUri).fsPath), defaultName),
    ),
    filters: {
      'MP4 Video': ['mp4'],
      'WebM Video': ['webm'],
      'MOV Video': ['mov'],
      'MKV Video': ['mkv'],
    },
  });

  if (!saveUri) return; // User cancelled

  const ext = path.extname(saveUri.fsPath).toLowerCase().slice(1);
  const formatMap: Record<string, 'mp4' | 'webm' | 'mov' | 'mkv'> = {
    mp4: 'mp4',
    webm: 'webm',
    mov: 'mov',
    mkv: 'mkv',
  };
  const format = formatMap[ext] ?? 'mp4';

  const config: import('@neko/shared').ExportStartConfig = {
    outputPath: saveUri.fsPath,
    format,
    width: project.resolution?.width ?? 1920,
    height: project.resolution?.height ?? 1080,
    fps: project.fps ?? 30,
    quality: 'medium',
    audioBitrate: 192000,
  };

  // Run export with progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Exporting ${path.basename(saveUri.fsPath)}`,
      cancellable: true,
    },
    async (progress, token) => {
      return new Promise<void>((resolve) => {
        const disposables: vscode.Disposable[] = [];

        // Subscribe to events
        disposables.push(
          exportService.onDidProgress((p) => {
            progress.report({
              message: `${p.progress}% — Frame ${p.currentFrame}/${p.totalFrames}`,
              increment: undefined,
            });
          }),
        );

        disposables.push(
          exportService.onDidComplete((result) => {
            cleanup();
            if (result.success) {
              vscode.window.showInformationMessage(
                `Export completed: ${path.basename(saveUri.fsPath)}`,
              );
            }
            resolve();
          }),
        );

        disposables.push(
          exportService.onDidError((error) => {
            cleanup();
            handleError(error, { showToUser: true, severity: 'error' });
            resolve();
          }),
        );

        disposables.push(
          exportService.onDidCancel(() => {
            cleanup();
            vscode.window.showInformationMessage('Export cancelled.');
            resolve();
          }),
        );

        // Handle cancellation from progress notification
        token.onCancellationRequested(() => {
          exportService.cancelExport().catch(() => {});
        });

        function cleanup() {
          for (const d of disposables) {
            d.dispose();
          }
        }

        // Start the export
        exportService.startExport(project, config).catch((error) => {
          cleanup();
          handleError(error, { showToUser: true, severity: 'error' });
          resolve();
        });
      });
    },
  );
}
