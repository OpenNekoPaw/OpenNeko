/**
 * 消息处理器
 * 处理 Extension Host 和 WebView 之间的消息通信
 *
 * 职责：编辑器核心消息（保存、文件请求、导出）
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { EngineClient } from '@neko/neko-client';
import {
  createHostContentAccessRuntime,
  type ContentAccessService,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import {
  formatProjectFileDiagnostics,
  MessageFromWebview,
  handleProjectSourceAddHostRequest,
  isProjectFileSnapshotResponseMessage,
  ProjectData,
  ContextMenuItem,
  type EditOperation,
  type ProjectSourceAddRequest,
} from '@neko/shared';
import { VideoEditorModel } from './videoEditorModel';
import { prepareCutProjectFileSave } from './cutProjectFilePersistence';
import { getLogger } from '../../base';
import { isExistingLocalFile, resolveMediaPath } from '../../services/tools/helpers';
import { AIActionHandler } from '../../services/AIActionHandler';
import { addCutProjectSource } from './cutProjectSourceIngest';

const logger = getLogger('MessageHandler');

/**
 * Handles messages between Extension Host and WebView
 */
export class MessageHandler {
  // 当前导出文件的写入流
  private _exportWriteStream: fs.WriteStream | null = null;
  private _exportFilePath: string | null = null;
  // AI action handler (lazy initialized)
  private _aiActionHandler: AIActionHandler | null = null;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly model: VideoEditorModel,
    private readonly _context: vscode.ExtensionContext,
    private readonly engineClient: EngineClient | null = null,
    private readonly localResourceAccess?: LocalResourceAccessService,
    private readonly contentAccess: ContentAccessService = createFileRangeContentAccessService(
      path.dirname(model.uri.fsPath),
    ),
  ) {}

  /**
   * Handle incoming messages from the webview
   */
  public async handleMessage(message: MessageFromWebview): Promise<void> {
    if (isProjectFileSnapshotResponseMessage(message)) {
      return;
    }

    switch (message.type) {
      case 'ready':
        this.sendUpdate();
        break;

      case 'save':
        await this.handleSave(message.content);
        break;

      case 'project:changed':
        await this.handleProjectChanged(message.document);
        break;

      case 'requestFile':
        await this.handleRequestFile(message.path);
        break;

      case 'project:addSource':
        await this.handleProjectAddSource(message.request);
        break;

      case 'saveBlob':
        await this.handleSaveBlob(message.data, message.filename, message.mimeType);
        break;

      case 'selectExportPath':
        await this.handleSelectExportPath(message.filename, message.format);
        break;

      case 'saveBlobToPath':
        await this.handleSaveBlobToPath(message.data, message.path, message.mimeType);
        break;

      case 'showExportDialog':
        await this.handleShowExportDialog(message.filename, message.format);
        break;

      case 'writeExportChunk':
        await this.handleWriteExportChunk(message.data);
        break;

      case 'finalizeExport':
        await this.handleFinalizeExport(message.success, message.error);
        break;

      case 'cancelExport':
        await this.handleCancelExport();
        break;

      case 'showContextMenu':
        await this.handleShowContextMenu(message.menuId, message.items);
        break;

      case 'readFileRange':
        await this.handleReadFileRange(message.requestId, message.path, message.start, message.end);
        break;

      case 'operationApplied':
        await this.handleOperationApplied(message.operation);
        break;

      case 'executeAIAction':
        await this.handleExecuteAIAction(message);
        break;

      // These are handled by videoEditorProvider before reaching messageHandler
      case 'export:start':
      case 'export:cancel':
      case 'export:queryGlobalStatus':
      case 'validateFile':
        break;

      default:
        logger.warn(`Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  /**
   * Send updated content to WebView
   */
  public sendUpdate(): void {
    this.webview.postMessage({
      type: 'update',
      content: this.model.getProjectData(),
    });
  }

  /**
   * Send error message to WebView
   */
  public sendError(message: string): void {
    this.webview.postMessage({
      type: 'error',
      message,
    });
  }

  // ==========================================================================
  // AI Action 处理
  // ==========================================================================

  /**
   * Handle AI action request from Webview.
   * Delegates to AIActionHandler which routes retained media analysis or Agent actions.
   */
  private async handleExecuteAIAction(message: {
    type: 'executeAIAction';
    actionId: string;
    elementIds: string[];
    trackIds?: string[];
    params?: Record<string, unknown>;
  }): Promise<void> {
    if (!this._aiActionHandler) {
      this._aiActionHandler = new AIActionHandler(this.webview, this.model.uri);
    }
    await this._aiActionHandler.handleAction(
      message.actionId,
      message.elementIds,
      message.trackIds,
      message.params,
    );
  }

  // ==========================================================================
  // 增量同步处理
  // ==========================================================================

  /**
   * Handle incremental operation sync from Webview.
   * The current Webview also sends a project:changed snapshot for durable
   * document sync. Operations remain available for preview-engine fast paths
   * in VideoEditorProvider, but must not mutate the TextDocument here.
   */
  private async handleOperationApplied(_operation: EditOperation): Promise<void> {
    return;
  }

  // ==========================================================================
  // 编辑器核心处理方法
  // ==========================================================================

  /**
   * Handle save request from WebView
   */
  private async handleSave(content: ProjectData): Promise<void> {
    try {
      const result = await prepareCutProjectFileSave(this.model.uri, content);
      if (!result.ok || !result.document) {
        this.sendError(formatProjectFileDiagnostics(result.diagnostics, 'Failed to save project'));
        return;
      }

      await this.model.syncSavedProjectData(result.document);
    } catch (error) {
      logger.error('Save error', error);
      this.sendError(`Save error: ${error}`);
    }
  }

  /**
   * Sync the latest Webview project snapshot into the custom document model.
   * This does not write to disk; VS Code save requests a live Webview snapshot
   * and persists through ProjectFileStore.
   */
  private async handleProjectChanged(document: ProjectData): Promise<void> {
    try {
      const result = await prepareCutProjectFileSave(this.model.uri, document);
      if (!result.ok || !result.document) {
        this.sendError(formatProjectFileDiagnostics(result.diagnostics, 'Failed to sync project'));
        return;
      }

      await this.model.syncSavedProjectData(result.document);
    } catch (error) {
      logger.error('Project change sync error', error);
      this.sendError(`Project change sync error: ${error}`);
    }
  }

  /**
   * Resolve a stored path (PathVariable, relative, or absolute) to absolute.
   */
  private async resolveStoredMediaPath(filePath: string): Promise<string> {
    const jviDir = path.dirname(this.model.uri.fsPath);
    return resolveMediaPath(filePath, jviDir, {
      documentUri: this.model.uri,
      projectFilePath: this.model.uri.fsPath,
      fileExists: isExistingLocalFile,
    });
  }

  private async resolveEngineFileAccessPath(filePath: string): Promise<string> {
    const absolutePath = await this.resolveStoredMediaPath(filePath);
    const result = await this.contentAccess.resolve({
      ref: { kind: 'file', path: absolutePath },
      intent: 'verify',
      target: 'local-path',
      caller: 'neko-cut.file-range',
    });
    if (result.status !== 'ready' || !result.localPath) {
      throw new Error(result.error ?? `Unable to resolve source file for range read: ${filePath}`);
    }
    return result.localPath;
  }

  /**
   * Handle file request from WebView
   * Uses webview URI for all media types (video, audio, image)
   * Avoids base64 encoding for better performance
   */
  private async handleRequestFile(filePath: string): Promise<void> {
    try {
      // Resolve path relative to .nkv file
      const absolutePath = await this.resolveEngineFileAccessPath(filePath);
      const fileUri = vscode.Uri.file(absolutePath);

      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        logger.error(`File not found: ${absolutePath}`);
        this.sendError(`File not found: ${filePath}`);
        return;
      }

      // Use webview URI for all media types (no base64 encoding)
      const projector = this.localResourceAccess?.createSyncProjector(
        this.webview,
        this.webview.options.localResourceRoots ?? [],
        { caller: 'neko-cut.request-file' },
      );
      const webviewUri = projector?.(fileUri.fsPath);
      if (!webviewUri) {
        logger.warn(`Unauthorized media file path: ${absolutePath}`);
        this.sendError(
          `File is outside authorized media roots. Add its folder as a media library or move it next to the project: ${filePath}`,
        );
        return;
      }
      this.webview.postMessage({
        type: 'fileUri',
        path: filePath,
        uri: webviewUri,
      });
    } catch (error) {
      logger.error('File request error', error);
      this.sendError(`Failed to load file: ${filePath}`);
    }
  }

  private async handleProjectAddSource(request: ProjectSourceAddRequest): Promise<void> {
    await handleProjectSourceAddHostRequest(request, {
      addSource: (sourceRequest) => addCutProjectSource(this.model.uri, sourceRequest),
      postMessage: (message) => this.webview.postMessage(message),
      logger,
    });
  }

  /**
   * Handle showing VSCode native context menu
   */
  private async handleShowContextMenu(menuId: string, items: ContextMenuItem[]): Promise<void> {
    try {
      const quickPickItems: vscode.QuickPickItem[] = items
        .filter((item) => !item.separator)
        .map((item) => ({
          label: item.label,
          description: item.shortcut,
          detail: item.disabled ? '(disabled)' : undefined,
        }));

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select an action',
        canPickMany: false,
      });

      const selectedItem = items.find((item) => item.label === selected?.label);

      this.webview.postMessage({
        type: 'contextMenuResult',
        menuId,
        selectedId: selectedItem?.id,
      });
    } catch (error) {
      logger.error('Context menu error', error);
      this.webview.postMessage({
        type: 'contextMenuResult',
        menuId,
        selectedId: undefined,
      });
    }
  }

  // ==========================================================================
  // 导出处理方法
  // ==========================================================================

  /**
   * Handle showing export dialog and preparing write stream
   */
  private async handleShowExportDialog(filename: string, format: string): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
        filters: { Video: [format] },
        title: 'Export Video',
      });

      if (!saveUri) {
        this.webview.postMessage({
          type: 'exportDialogResult',
          success: false,
          cancelled: true,
        });
        return;
      }

      this._exportFilePath = saveUri.fsPath;
      this._exportWriteStream = fs.createWriteStream(this._exportFilePath);

      this._exportWriteStream.on('error', (error) => {
        logger.error('Write stream error', error);
        this.webview.postMessage({
          type: 'exportStreamError',
          error: error.message,
        });
      });

      this.webview.postMessage({
        type: 'exportDialogResult',
        success: true,
        path: saveUri.fsPath,
      });
    } catch (error) {
      logger.error('Show export dialog error', error);
      this.webview.postMessage({
        type: 'exportDialogResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to show export dialog',
      });
    }
  }

  /**
   * Handle writing export chunk to file
   */
  private async handleWriteExportChunk(data: ArrayBuffer): Promise<void> {
    if (!this._exportWriteStream || !this._exportFilePath) {
      logger.error('No export stream available');
      this.webview.postMessage({
        type: 'exportChunkResult',
        success: false,
        error: 'No export stream available',
      });
      return;
    }

    try {
      const buffer = Buffer.from(data);
      const canContinue = this._exportWriteStream.write(buffer);

      if (!canContinue) {
        await new Promise<void>((resolve) => {
          this._exportWriteStream!.once('drain', resolve);
        });
      }

      this.webview.postMessage({
        type: 'exportChunkResult',
        success: true,
      });
    } catch (error) {
      logger.error('Write chunk error:', error);
      this.webview.postMessage({
        type: 'exportChunkResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write chunk',
      });
    }
  }

  /**
   * Handle finalizing export
   */
  private async handleFinalizeExport(success: boolean, error?: string): Promise<void> {
    const filePath = this._exportFilePath;

    try {
      if (this._exportWriteStream) {
        await new Promise<void>((resolve, reject) => {
          this._exportWriteStream!.end((err: Error | null | undefined) => {
            if (err) reject(err);
            else resolve();
          });
        });
        this._exportWriteStream = null;
      }

      if (success && filePath) {
        this.webview.postMessage({
          type: 'exportComplete',
          success: true,
          path: filePath,
        });

        const selection = await vscode.window.showInformationMessage(
          `Video exported successfully: ${path.basename(filePath)}`,
          'Open File',
          'Open Folder',
        );

        if (selection === 'Open File') {
          vscode.env.openExternal(vscode.Uri.file(filePath));
        } else if (selection === 'Open Folder') {
          vscode.env.openExternal(vscode.Uri.file(path.dirname(filePath)));
        }
      } else {
        this.webview.postMessage({
          type: 'exportComplete',
          success: false,
          error: error || 'Export failed',
        });

        if (filePath) {
          const fsp = await import('node:fs/promises');
          await fsp.unlink(filePath).catch(() => {});
        }
      }
    } catch (err) {
      logger.error('Finalize export error:', err);
      this.webview.postMessage({
        type: 'exportComplete',
        success: false,
        error: err instanceof Error ? err.message : 'Failed to finalize export',
      });
    } finally {
      this._exportFilePath = null;
    }
  }

  /**
   * Handle canceling export
   */
  private async handleCancelExport(): Promise<void> {
    try {
      const filePath = this._exportFilePath;

      if (this._exportWriteStream) {
        this._exportWriteStream.destroy();
        this._exportWriteStream = null;
      }

      if (filePath) {
        const fsp = await import('node:fs/promises');
        await fsp.unlink(filePath).catch(() => {});
      }

      this._exportFilePath = null;

      this.webview.postMessage({
        type: 'exportCancelled',
      });
    } catch (error) {
      logger.error('Cancel export error:', error);
    }
  }

  /**
   * Handle saving blob data from WebView (WebCodecs export)
   */
  private async handleSaveBlob(
    data: ArrayBuffer,
    filename: string,
    mimeType: string,
  ): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

      const extMap: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'image/gif': 'gif',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      };
      const ext = extMap[mimeType] || 'mp4';

      // Determine if this is an image or video
      const isImage = mimeType.startsWith('image/');
      const filterLabel = isImage ? 'Image' : 'Video';
      const title = isImage ? 'Save Screenshot' : 'Save Exported Video';

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
        filters: { [filterLabel]: [ext] },
        title,
      });

      if (!saveUri) {
        this.webview.postMessage({
          type: 'blobSaveResult',
          success: false,
          cancelled: true,
        });
        return;
      }

      const buffer = readBlobBuffer(data);

      await vscode.workspace.fs.writeFile(saveUri, buffer);

      this.webview.postMessage({
        type: 'blobSaveResult',
        success: true,
        path: saveUri.fsPath,
      });

      const successMessage = isImage
        ? `Screenshot saved successfully: ${path.basename(saveUri.fsPath)}`
        : `Video exported successfully: ${path.basename(saveUri.fsPath)}`;

      const selection = await vscode.window.showInformationMessage(
        successMessage,
        'Open File',
        'Open Folder',
      );

      if (selection === 'Open File') {
        vscode.env.openExternal(saveUri);
      } else if (selection === 'Open Folder') {
        vscode.env.openExternal(vscode.Uri.file(path.dirname(saveUri.fsPath)));
      }
    } catch (error) {
      logger.error('Save blob error:', error);
      this.webview.postMessage({
        type: 'blobSaveResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save file',
      });
    }
  }

  /**
   * Handle selecting export path before export starts
   * Shows save dialog and returns the selected path
   */
  private async handleSelectExportPath(filename: string, format: string): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

      const extMap: Record<string, string> = {
        mp4: 'mp4',
        webm: 'webm',
        gif: 'gif',
      };
      const ext = extMap[format] || 'mp4';

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
        filters: { Video: [ext] },
        title: '选择导出位置',
      });

      if (!saveUri) {
        this.webview.postMessage({
          type: 'exportPathSelected',
          success: false,
          cancelled: true,
        });
        return;
      }

      this.webview.postMessage({
        type: 'exportPathSelected',
        success: true,
        path: saveUri.fsPath,
      });
    } catch (error) {
      logger.error('Select export path error:', error);
      this.webview.postMessage({
        type: 'exportPathSelected',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to select export path',
      });
    }
  }

  /**
   * Handle saving blob data to a pre-selected path (no dialog)
   */
  private async handleSaveBlobToPath(
    data: ArrayBuffer,
    filePath: string,
    mimeType: string,
  ): Promise<void> {
    try {
      const buffer = readBlobBuffer(data);

      const saveUri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.writeFile(saveUri, buffer);

      this.webview.postMessage({
        type: 'blobSaveResult',
        success: true,
        path: filePath,
      });

      // Determine if this is an image or video
      const isImage = mimeType.startsWith('image/');
      const successMessage = isImage
        ? `Screenshot saved successfully: ${path.basename(filePath)}`
        : `Video exported successfully: ${path.basename(filePath)}`;

      const selection = await vscode.window.showInformationMessage(
        successMessage,
        'Open File',
        'Open Folder',
      );

      if (selection === 'Open File') {
        vscode.env.openExternal(saveUri);
      } else if (selection === 'Open Folder') {
        vscode.env.openExternal(vscode.Uri.file(path.dirname(filePath)));
      }
    } catch (error) {
      logger.error('Save blob to path error:', error);
      this.webview.postMessage({
        type: 'blobSaveResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save file',
      });
    }
  }

  /**
   * Handle file range read request (for testing on-demand loading)
   * Uses neko-engine file access so binary source bytes stay behind the
   * engine-owned token and range boundary.
   */
  private async handleReadFileRange(
    requestId: string,
    filePath: string,
    start: number,
    end: number,
  ): Promise<void> {
    try {
      // Resolve path relative to .nkv file
      const absolutePath = await this.resolveStoredMediaPath(filePath);
      if (!this.engineClient) {
        throw new Error('Neko Engine is not available for file range reads');
      }

      const actualStart = Math.max(0, start);
      const registered = await this.engineClient.registerFile({
        filePath: absolutePath,
        purpose: 'subtitle',
      });
      try {
        const fileSize = registered.fileSizeBytes;
        const actualEnd = Math.min(end, fileSize - 1);

        if (actualStart > actualEnd || actualStart >= fileSize) {
          this.webview.postMessage({
            type: 'fileRangeResult',
            requestId,
            success: false,
            error: `Invalid range: ${start}-${end} for file size ${fileSize}`,
          });
          return;
        }

        const data = await this.engineClient.readFileRange(
          registered.token,
          actualStart,
          actualEnd,
        );
        const buffer = Buffer.from(data);
        const base64Data = buffer.toString('base64');

        logger.debug(
          `readFileRange: path=${filePath}, requested=${start}-${end}, actual=${actualStart}-${actualEnd}, size=${buffer.byteLength}, fileSize=${fileSize}`,
        );

        this.webview.postMessage({
          type: 'fileRangeResult',
          requestId,
          success: true,
          data: base64Data,
          actualStart,
          actualEnd,
          fileSize,
        });
      } finally {
        await this.engineClient.unregisterFile(registered.token);
      }
    } catch (error) {
      logger.error('File range read error:', error);
      this.webview.postMessage({
        type: 'fileRangeResult',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file range',
      });
    }
  }
}

function readBlobBuffer(data: unknown): Buffer {
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (isStructuredCloneByteRecord(data)) {
    return Buffer.from(Object.values(data));
  }
  throw new Error('Invalid binary data format for blob save');
}

function isStructuredCloneByteRecord(data: unknown): data is Record<string, number> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }
  const values = Object.values(data);
  return (
    values.length > 0 &&
    values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
  );
}

function createFileRangeContentAccessService(projectRoot: string): ContentAccessService {
  return createHostContentAccessRuntime({
    workspaceRoot: projectRoot,
    documentEntryProvider: { enabled: false },
    ingest: { enabled: false },
  }).contentAccess;
}
