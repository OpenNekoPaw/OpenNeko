/**
 * 视频编辑器 Provider
 * 使用新架构 (VideoEditorModel + EditorRegistry)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  formatProjectFileDiagnostics,
  loadNkv,
  type ProjectData,
  type ProjectFileSaveReason,
} from '@neko/shared';
import {
  createHostContentAccessRuntime,
  requestWebviewProjectSnapshot,
  createProjectSnapshotPackage,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import { IEditorRegistry } from '../common/editorRegistry';
import { VideoEditorModel } from './videoEditorModel';
import { MessageHandler } from './messageHandler';
import { VideoProjectDocument } from './videoProjectDocument';
import { prepareCutProjectFileSave, saveCutProjectFile } from './cutProjectFilePersistence';
import { MediaService } from '../../services/MediaService';
import { EngineConnection } from '../../services/EngineConnection';
import { ExportService } from '../../services/ExportService';
import { resolveMediaPath } from '../../services/tools/helpers';
import { ExportPresetService } from '../../services/ExportPresetService';
import { getService, getLogger } from '../../base';
import { isAssetMessage, handleAssetMessage } from '../../handlers/assetHandlers';
import { createNkvProjectRef } from '../../services/CutProjectQualityFacade';

const logger = getLogger('VideoEditorProvider');
import { IStatusBar } from '../../views/statusBar';
import { IVideoProjectOutlineProvider } from '../../views/outlineProvider';
export class VideoEditorProvider implements vscode.CustomEditorProvider<VideoProjectDocument> {
  private static readonly viewType = 'neko.videoEditor';
  private readonly onDidChangeCustomDocumentEmitter = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<VideoProjectDocument>
  >();
  readonly onDidChangeCustomDocument = this.onDidChangeCustomDocumentEmitter.event;
  private readonly documents = new Map<string, VideoProjectDocument>();
  private activeWebviews: Map<string, vscode.Webview> = new Map();
  private activeWebviewPanels: Map<string, vscode.WebviewPanel> = new Map();
  private modelDisposables: Map<string, vscode.Disposable> = new Map();
  private mediaServices: Map<string, MediaService> = new Map();
  private engineConnection: EngineConnection = new EngineConnection();
  private exportServices: Map<string, ExportService> = new Map();
  private presetService: ExportPresetService | null = null;
  /** Deferred cleanup subscriptions (cancelled when editor is reopened during export) */
  private deferredCleanupSubs: Map<string, vscode.Disposable[]> = new Map();
  private readonly localResourceAccess: LocalResourceAccessService;

  constructor(private readonly context: vscode.ExtensionContext) {
    const contentRuntime = createHostContentAccessRuntime({
      extensionUri: context.extensionUri,
      context,
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
      logger,
    });
    if (!contentRuntime.localResourceAccess) {
      throw new Error('Cut video editor requires LocalResourceAccessService.');
    }
    this.localResourceAccess = contentRuntime.localResourceAccess;
  }

  /**
   * Pin the editor tab for the given document URI to prevent accidental closure during export
   */
  private pinEditorTab(documentUri: vscode.Uri): void {
    try {
      // The editor should be active when export starts, so we can just pin the active editor
      vscode.commands.executeCommand('workbench.action.pinEditor');
    } catch (error) {
      logger.warn('Failed to pin editor tab:', error);
    }
  }

  /**
   * Unpin the editor tab for the given document URI after export completes
   */
  private unpinEditorTab(_documentUri: vscode.Uri): void {
    // Don't auto-unpin - let user decide when to unpin
    // This is safer as the user might want to continue editing
  }

  /**
   * Find project root by looking for package.json or .git directory
   */
  private findProjectRoot(filePath: string): string | null {
    const fs = require('fs');
    let currentDir = path.dirname(filePath);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      // Check for project markers
      if (
        fs.existsSync(path.join(currentDir, 'package.json')) ||
        fs.existsSync(path.join(currentDir, '.git'))
      ) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  /**
   * Get the webview for a specific document URI
   */
  public getWebviewForDocument(documentUri: string): vscode.Webview | null {
    return this.activeWebviews.get(documentUri) || null;
  }

  /**
   * Get the currently active/visible webview based on active/visible editors
   */
  public getActiveWebview(): vscode.Webview | null {
    // Find the visible/active webview panel
    for (const [uri, panel] of this.activeWebviewPanels) {
      if (panel.visible && panel.active) {
        return panel.webview;
      }
    }

    // Fallback: find any visible panel
    for (const [uri, panel] of this.activeWebviewPanels) {
      if (panel.visible) {
        return panel.webview;
      }
    }

    // Last resort: return any webview (for single project case)
    for (const [uri, webview] of this.activeWebviews) {
      return webview;
    }

    return null;
  }

  /**
   * Get the currently active/visible webview panel
   */
  public getActiveWebviewPanel(): vscode.WebviewPanel | null {
    // Find the visible/active webview panel
    for (const [uri, panel] of this.activeWebviewPanels) {
      if (panel.visible && panel.active) {
        return panel;
      }
    }

    // Fallback: find any visible panel
    for (const [uri, panel] of this.activeWebviewPanels) {
      if (panel.visible) {
        return panel;
      }
    }

    // Last resort: return any panel (for single project case)
    for (const [uri, panel] of this.activeWebviewPanels) {
      return panel;
    }

    return null;
  }

  /**
   * Focus the active video editor panel
   * @returns true if successfully focused, false if no panel available
   */
  public async focusActiveEditor(): Promise<boolean> {
    const panel = this.getActiveWebviewPanel();
    if (!panel) {
      return false;
    }

    // Reveal the panel to bring it to focus
    panel.reveal(undefined, true); // preserveFocus = true to avoid stealing focus from webview
    return true;
  }

  /**
   * Broadcast export status to all active webviews
   */
  private broadcastExportStatus() {
    let hasActiveExport = false;
    for (const [, svc] of this.exportServices) {
      if (svc.isExporting()) {
        hasActiveExport = true;
        break;
      }
    }
    for (const [, webview] of this.activeWebviews) {
      webview.postMessage({
        type: 'export:globalStatus',
        hasActiveExport,
      });
    }
  }

  /**
   * Get the ExportService for a document URI (for non-Webview callers)
   */
  public getExportService(documentUri: string): ExportService | undefined {
    return this.exportServices.get(documentUri);
  }

  /**
   * Get the URI of the currently active/visible document
   */
  public getActiveDocumentUri(): string | null {
    for (const [uri, panel] of this.activeWebviewPanels) {
      if (panel.visible && panel.active) {
        return uri;
      }
    }
    for (const [uri, panel] of this.activeWebviewPanels) {
      if (panel.visible) {
        return uri;
      }
    }
    for (const [uri] of this.activeWebviewPanels) {
      return uri;
    }
    return null;
  }

  public getActiveDocumentVsCodeUri(): vscode.Uri | null {
    const uri = this.getActiveDocumentUri();
    return uri ? vscode.Uri.parse(uri) : null;
  }

  public getProjectDataForDocument(documentUri: string): ProjectData | null {
    const model = getService<IEditorRegistry>(IEditorRegistry)?.getEditorByUri(
      vscode.Uri.parse(documentUri),
    ) as VideoEditorModel | undefined;
    return model?.getProjectData() ?? this.documents.get(documentUri)?.projectData ?? null;
  }

  /**
   * Get the active ExportService (for the currently active document)
   */
  public getActiveExportService(): ExportService | undefined {
    const uri = this.getActiveDocumentUri();
    if (!uri) return undefined;
    return this.getExportServiceForDocument(uri);
  }

  public getExportServiceForDocument(documentUri: string): ExportService | undefined {
    return this.exportServices.get(documentUri);
  }

  /**
   * Get the document URI that has an active background export (if any).
   * Used to reopen the editor when user clicks the status bar export item.
   */
  public getExportingDocumentUri(): string | null {
    for (const [uri, svc] of this.exportServices) {
      if (svc.isExporting()) return uri;
    }
    return null;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<VideoProjectDocument> {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    const result = loadNkv(text);
    if (!result.validation.valid) {
      logger.warn(
        'NKV validation errors:',
        result.validation.errors.map((error) => `${error.field}: ${error.message}`).join('; '),
      );
    }
    const document = new VideoProjectDocument(uri, result.project, () => {
      this.documents.delete(uri.toString());
    });
    this.documents.set(uri.toString(), document);
    return document;
  }

  async saveCustomDocument(
    document: VideoProjectDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    logger.info('cut.customDocument.save.start', {
      uri: document.uri.toString(),
      hasWebview: this.activeWebviewPanels.has(document.uri.toString()),
    });
    const webviewPanel = this.activeWebviewPanels.get(document.uri.toString());
    const snapshot = webviewPanel
      ? await requestCutProjectSnapshot(webviewPanel.webview, 'vscode-save')
      : document.projectData;
    const result = await saveCutProjectFile(document.uri, snapshot, 'vscode-save');
    if (!result.ok || !result.document) {
      throw new Error(
        formatProjectFileDiagnostics(result.diagnostics, 'Failed to save NKV project'),
      );
    }
    document.setProjectData(result.document);
    const model = getService<IEditorRegistry>(IEditorRegistry)?.getEditorByUri(document.uri) as
      VideoEditorModel | undefined;
    model?.applyIncrementalUpdate(result.document);
    webviewPanel?.webview.postMessage({ type: 'saved' });
    logger.info('cut.customDocument.save.done', {
      uri: document.uri.toString(),
      diagnostics: result.diagnostics.map((diagnostic) => diagnostic.code),
    });
  }

  async saveCustomDocumentAs(
    document: VideoProjectDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const webviewPanel = this.activeWebviewPanels.get(document.uri.toString());
    const snapshot = webviewPanel
      ? await requestCutProjectSnapshot(webviewPanel.webview, 'save-as')
      : document.projectData;
    const result = await saveCutProjectFile(destination, snapshot, 'save-as', {
      sourceUri: document.uri,
      useSaveAs: true,
    });
    if (!result.ok || !result.document) {
      throw new Error(
        formatProjectFileDiagnostics(result.diagnostics, 'Failed to save NKV project'),
      );
    }
    document.setProjectData(result.document);
    webviewPanel?.webview.postMessage({ type: 'saved' });
  }

  async revertCustomDocument(
    document: VideoProjectDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(document.uri));
    const result = loadNkv(text);
    document.setProjectData(result.project);
    const model = getService<IEditorRegistry>(IEditorRegistry)?.getEditorByUri(document.uri) as
      VideoEditorModel | undefined;
    model?.applyIncrementalUpdate(result.project);
    this.activeWebviewPanels
      .get(document.uri.toString())
      ?.webview.postMessage({ type: 'update', content: result.project });
  }

  async backupCustomDocument(
    document: VideoProjectDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    const result = await saveCutProjectFile(context.destination, document.projectData, 'backup', {
      sourceUri: document.uri,
    });
    if (!result.ok) {
      throw new Error(
        formatProjectFileDiagnostics(result.diagnostics, 'Failed to backup NKV project'),
      );
    }
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // Best-effort backup cleanup.
        }
      },
    };
  }

  private markDocumentDirty(document: VideoProjectDocument): void {
    logger.info('cut.customDocument.dirty', {
      uri: document.uri.toString(),
    });
    this.onDidChangeCustomDocumentEmitter.fire({
      document,
    });
  }

  public async resolveCustomEditor(
    document: VideoProjectDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // 从 DI 容器获取服务
    const statusBar = getService<IStatusBar>(IStatusBar);
    const outlineProvider = getService<IVideoProjectOutlineProvider>(IVideoProjectOutlineProvider);
    const editorRegistry = getService<IEditorRegistry>(IEditorRegistry);

    // Validate required services
    if (!editorRegistry) {
      throw new Error('EditorRegistry service not available');
    }

    // Track this webview and panel
    const docUri = document.uri.toString();
    this.activeWebviews.set(docUri, webviewPanel.webview);
    this.activeWebviewPanels.set(docUri, webviewPanel);

    const jviDir = path.dirname(document.uri.fsPath);
    const jviParent = path.dirname(jviDir);
    const detectedProjectRoot = this.findProjectRoot(document.uri.fsPath);
    await this.localResourceAccess.configureWebview(webviewPanel.webview, {
      enableScripts: true,
      extraRoots: [
        vscode.Uri.file(jviDir),
        ...(jviParent !== path.parse(jviParent).root ? [vscode.Uri.file(jviParent)] : []),
        ...(detectedProjectRoot ? [vscode.Uri.file(detectedProjectRoot)] : []),
      ],
    });

    // 从 EditorRegistry 获取或创建 VideoEditorModel
    let model = editorRegistry.getEditorByUri(document.uri) as VideoEditorModel | undefined;

    if (!model) {
      // 通过 provider 创建新模型
      const provider = editorRegistry.getModelProvider('video');
      if (!provider) {
        throw new Error('Video editor model provider not registered');
      }
      model = provider.createModel(document) as VideoEditorModel;

      // 注册模型到 EditorRegistry
      const modelDisposable = editorRegistry.registerModel(model);
      this.modelDisposables.set(docUri, modelDisposable);
    }

    // 设置为活动编辑器
    editorRegistry.setActiveEditor(model);

    // Cancel deferred cleanup if editor is being reopened during background export
    const deferSubs = this.deferredCleanupSubs.get(docUri);
    if (deferSubs) {
      logger.info('Cancelling deferred cleanup — editor reopened');
      for (const s of deferSubs) s.dispose();
      this.deferredCleanupSubs.delete(docUri);
    }

    // Initialize EngineClient — shared across all documents
    const client = await this.engineConnection.ensureClient();
    if (!client) {
      logger.error('EngineClient not available — media operations will fail');
    }
    const frameServerPort = this.engineConnection.port;

    // Create MediaService — routes Webview messages to NativeEngine via EngineClient
    // Always create a new one for the new webview (old one holds stale webview ref)
    if (client) {
      const oldMedia = this.mediaServices.get(docUri);
      if (oldMedia) {
        // Dispose without destroying editor stream (export may still use client)
        oldMedia.dispose();
      }
      const mediaService = new MediaService(webviewPanel, client, document.uri);
      this.mediaServices.set(docUri, mediaService);

      // The editor stream is created after the Webview sends `ready`.
      // Creating it earlier can start the Rust stream before WebSocket
      // subscribers exist, causing the engine to wait until its subscriber
      // timeout and leaving the editor with a fragile first-load race.
    }

    // Create or reuse ExportService — reuse if there's an active background export
    let exportService = this.exportServices.get(docUri);
    const reusingExport = exportService?.isExporting() ?? false;
    if (client && !reusingExport) {
      exportService?.dispose();
      const jviDir = path.dirname(document.uri.fsPath);
      exportService = new ExportService(client, jviDir, {}, document.uri);
      this.exportServices.set(docUri, exportService);
    }
    if (reusingExport) {
      logger.info('Reusing ExportService with active export');
    }

    if (client && exportService) {
      // Forward export events to the Webview
      // NOTE: postMessage may throw after panel disposal (background export).
      // We wrap each call in try-catch so status bar updates always execute.
      const postToWebview = (msg: unknown) => {
        try {
          webviewPanel.webview.postMessage(msg);
        } catch {
          /* panel disposed */
        }
      };

      const disposables: vscode.Disposable[] = [];
      disposables.push(
        exportService.onDidProgress((progress) => {
          // Map Rust ExportProgress to Webview expected format
          postToWebview({
            type: 'export:progress',
            progress: {
              stage: progress.state,
              percent: progress.progress,
              currentFrame: progress.currentFrame,
              totalFrames: progress.totalFrames,
              elapsedTime: progress.elapsedMs,
              estimatedTimeRemaining: progress.estimatedRemainingMs,
              currentFps: progress.stats?.avgFps ?? 0,
              performanceStats: progress.stats
                ? {
                    avgDecodeTime: progress.stats.hwDecodeMs,
                    avgRenderTime: progress.stats.compositeMs,
                    avgEncodeTime: progress.stats.encodeSubmitMs,
                    memoryUsedMB: progress.stats.peakMemoryBytes
                      ? progress.stats.peakMemoryBytes / (1024 * 1024)
                      : undefined,
                    vramUsedMB: progress.stats.vramUsageBytes
                      ? progress.stats.vramUsageBytes / (1024 * 1024)
                      : undefined,
                    cpuUsage: progress.stats.cpuUsagePercent,
                    gpuUsage: progress.stats.gpuUsagePercent,
                  }
                : undefined,
            },
          });

          // Update status bar (always executes, even when webview is disposed)
          statusBar?.updateExportProgress({
            isExporting: true,
            percent: progress.progress,
            message: `Exporting ${Math.round(progress.progress)}%`,
            currentFrame: progress.currentFrame,
            totalFrames: progress.totalFrames,
            currentFps: progress.stats?.avgFps ?? 0,
            estimatedTimeRemaining: progress.estimatedRemainingMs,
          });
        }),
      );

      disposables.push(
        exportService.onDidComplete((result) => {
          postToWebview({ type: 'export:completed', ...result });
          statusBar?.updateExportProgress({ isExporting: false, percent: 0, message: '' });
          this.broadcastExportStatus();

          if (result.success && result.outputPath) {
            vscode.window
              .showInformationMessage(
                `Video exported successfully: ${path.basename(result.outputPath)}`,
                'Open File',
                'Open Folder',
              )
              .then((selection) => {
                if (selection === 'Open File' && result.outputPath) {
                  vscode.env.openExternal(vscode.Uri.file(result.outputPath));
                } else if (selection === 'Open Folder' && result.outputPath) {
                  vscode.env.openExternal(vscode.Uri.file(path.dirname(result.outputPath)));
                }
              });
          }
        }),
      );

      disposables.push(
        exportService.onDidError((error) => {
          postToWebview({ type: 'export:error', error });
          statusBar?.updateExportProgress({ isExporting: false, percent: 0, message: '' });
          this.broadcastExportStatus();
        }),
      );

      disposables.push(
        exportService.onDidCancel(() => {
          postToWebview({ type: 'export:cancelled' });
          statusBar?.updateExportProgress({ isExporting: false, percent: 0, message: '' });
          this.broadcastExportStatus();
        }),
      );

      disposables.push(
        exportService.onDidQueueChange((status) => {
          postToWebview({
            type: 'export:queueStatus',
            active: status.active,
            pending: status.pending,
          });
        }),
      );

      // Store disposables for cleanup
      this.context.subscriptions.push(...disposables);
    }

    // Create message handler
    const messageHandler = new MessageHandler(
      webviewPanel.webview,
      model,
      this.context,
      client,
      this.localResourceAccess,
    );

    // Initialize preset service (lazy, shared across documents)
    if (!this.presetService) {
      this.presetService = new ExportPresetService(this.context.workspaceState);
    }

    // Send initial/current document content to webview. This is intentionally
    // reusable so the `ready` handshake can replay project data if an early
    // postMessage was dropped while the Webview was still loading.
    const projectRoot = path.dirname(document.uri.fsPath);
    const updateWebview = () => {
      const content = model!.getProjectData();
      webviewPanel.webview.postMessage({
        type: 'update',
        content,
        projectRoot, // Project root directory for resolving relative media paths
      });
      // Update outline when document changes
      if (webviewPanel.visible) {
        outlineProvider?.updateProject(content);
      }
    };

    const ensureEditorStream = async () => {
      const mediaService = this.mediaServices.get(docUri);
      if (!mediaService) {
        return;
      }

      try {
        await mediaService.createEditorStream(model!.getProjectData());
      } catch (err) {
        logger.error('Failed to create editor stream:', err);
        // Non-fatal: Webview can still edit the project and request a retry on reload.
      }
    };

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        // 1. Try to handle media requests via MediaService (media:*)
        const mediaService = this.mediaServices.get(docUri);
        if (mediaService) {
          const mediaHandled = await mediaService.handleMessage(message);
          if (mediaHandled) {
            return;
          }
        }

        // 2. Handle status updates separately
        if (message.type === 'statusUpdate') {
          statusBar?.update({
            currentTime: message.currentTime ?? 0,
            totalDuration: message.totalDuration ?? 0,
            trackCount: message.trackCount ?? 0,
            elementCount: message.elementCount ?? 0,
            isPlaying: message.isPlaying ?? false,
            fps: message.fps ?? 30,
          });
          return;
        }

        // Handle export progress updates (Webview -> Extension status bar)
        if (message.type === 'exportProgress') {
          statusBar?.updateExportProgress({
            isExporting: message.isExporting,
            percent: message.percent,
            message: message.message,
            currentFrame: message.currentFrame,
            totalFrames: message.totalFrames,
            currentFps: message.currentFps,
            estimatedTimeRemaining: message.estimatedTimeRemaining,
          });
          return;
        }

        // Handle export start request (Webview → ExportService → NativeEngine)
        if (message.type === 'export:start') {
          const exportService = this.exportServices.get(docUri);
          if (!exportService) {
            webviewPanel.webview.postMessage({
              type: 'export:error',
              error: 'Export service not available (NativeEngine required)',
            });
            return;
          }
          try {
            this.pinEditorTab(document.uri);
            await exportService.startExport(message.project, message.config);
            this.broadcastExportStatus();
          } catch (e) {
            webviewPanel.webview.postMessage({
              type: 'export:error',
              error: e instanceof Error ? e.message : String(e),
            });
          }
          return;
        }

        if (message.type === 'project:package') {
          await createProjectSnapshotPackage({
            packageId: 'neko-cut',
            title: 'Package Cut Project',
            sourceUri: document.uri,
            sourceBytes: Buffer.from(JSON.stringify(model!.getProjectData(), null, 2), 'utf-8'),
            metadata: {
              kind: 'video',
              viewType: VideoEditorProvider.viewType,
            },
          });
          return;
        }

        // Handle export cancel request
        if (message.type === 'export:cancel') {
          const exportService = this.exportServices.get(docUri);
          if (exportService) {
            await exportService.cancelExport();
          }
          return;
        }

        // Handle hardware capabilities query
        if (message.type === 'export:queryHwCapabilities') {
          const exportService = this.exportServices.get(docUri);
          if (exportService) {
            const codecs = await exportService.queryHwCapabilities();
            webviewPanel.webview.postMessage({
              type: 'export:hwCapabilities',
              codecs,
            });
          }
          return;
        }

        // Handle export global status query
        if (message.type === 'export:queryGlobalStatus') {
          let hasActiveExport = false;
          for (const [, svc] of this.exportServices) {
            if (svc.isExporting()) {
              hasActiveExport = true;
              break;
            }
          }
          webviewPanel.webview.postMessage({
            type: 'export:globalStatus',
            hasActiveExport,
          });
          return;
        }

        // Handle LUT load request (Webview → Extension → NativeEngine)
        if (message.type === 'colorCorrection:loadLut') {
          await this.handleLoadLut(webviewPanel.webview, docUri);
          return;
        }

        // Handle preset list request
        if (message.type === 'preset:list') {
          const presets = this.presetService?.listPresets() ?? [];
          webviewPanel.webview.postMessage({ type: 'preset:list', presets });
          return;
        }

        // Handle preset save request
        if (message.type === 'preset:save') {
          const { name, settings } = message as {
            name: string;
            settings: import('@neko/shared').ExportPresetSettings;
          };
          // Defensive validation
          if (
            typeof name !== 'string' ||
            !name.trim() ||
            typeof settings !== 'object' ||
            settings === null
          ) {
            logger.warn('Received malformed preset:save message, ignoring');
            return;
          }
          if (this.presetService) {
            try {
              await this.presetService.savePreset(name, settings);
              const presets = this.presetService.listPresets();
              webviewPanel.webview.postMessage({ type: 'preset:list', presets });
            } catch (error) {
              logger.error('Failed to save preset:', error);
            }
          }
          return;
        }

        // Handle file validation request
        if (message.type === 'validateFile') {
          const filePath = message.path;
          let exists = false;
          let absolutePath = filePath;

          try {
            const fs = await import('fs');

            const jviDir = path.dirname(document.uri.fsPath);
            absolutePath = await resolveMediaPath(filePath, jviDir, {
              documentUri: document.uri,
              projectFilePath: document.uri.fsPath,
            });

            exists = fs.existsSync(absolutePath);
          } catch (error) {
            logger.error('File validation error:', error);
            exists = false;
          }

          try {
            webviewPanel.webview.postMessage({
              type: 'fileValidation',
              path: filePath,
              exists,
            });
          } catch (postError) {
            logger.error('Failed to send validation response:', postError);
          }
          return;
        }

        // Handle webview ready message - send frame server config
        if (message.type === 'ready') {
          logger.info('Webview ready, replaying project data and frame server config');
          updateWebview();
          webviewPanel.webview.postMessage(
            client
              ? { type: 'engine:status', status: 'ready' }
              : {
                  type: 'engine:status',
                  status: 'unavailable',
                  diagnostic: {
                    code: 'cut.engine.unavailable',
                    message:
                      'Neko Engine is unavailable. Timeline editing remains available, but media preview and processing cannot run.',
                  },
                },
          );
          if (frameServerPort) {
            webviewPanel.webview.postMessage({
              type: 'frameServer:config',
              port: frameServerPort,
            });
          }
          await ensureEditorStream();
          // Re-notify stream info in case a stream already existed for this editor.
          const ms = this.mediaServices.get(docUri);
          if (ms) {
            ms.notifyStreamCreated();
          }
          // If there's a background export in progress, tell webview to show progress
          const activeExport = this.exportServices.get(docUri);
          if (activeExport?.isExporting()) {
            // Open the export panel first, then send progress state
            webviewPanel.webview.postMessage({ type: 'showExportPanel' });
            activeExport
              .getProgress()
              .then((progress) => {
                if (progress) {
                  webviewPanel.webview.postMessage({
                    type: 'export:activeExport',
                    progress: {
                      stage: progress.state,
                      percent: progress.progress,
                      currentFrame: progress.currentFrame,
                      totalFrames: progress.totalFrames,
                      elapsedTime: progress.elapsedMs,
                      estimatedTimeRemaining: progress.estimatedRemainingMs,
                      currentFps: progress.stats?.avgFps ?? 0,
                    },
                  });
                }
              })
              .catch(() => {});
          }
          return;
        }

        // Cross-extension drag-and-drop (ADR-5 P1)
        if (message.type === 'dnd:drop') {
          try {
            const payload = await vscode.commands.executeCommand<{
              path: string;
              mediaType: 'image' | 'video' | 'audio';
              name: string;
            } | null>('neko.agent.getDndPayload');
            if (payload) {
              const documentUri = document.uri.toString();
              const expectedProjectRevision = createNkvProjectRef(
                documentUri,
                model.getProjectData(),
              ).projectRevision;
              await vscode.commands.executeCommand('neko.cut.authoring.importGeneratedClip', {
                assetPath: payload.path,
                target: { kind: 'file', documentUri },
                expectedProjectRevision,
              });
              await vscode.commands.executeCommand('neko.agent.clearDndPayload');
              logger.info(`DnD drop accepted: ${payload.name}`);
            }
          } catch (error) {
            logger.warn(`DnD drop failed (agent extension may not be installed): ${error}`);
          }
          return;
        }

        // Handle asset messages (asset:*)
        if (isAssetMessage(message)) {
          await handleAssetMessage(message, (response) => {
            webviewPanel.webview.postMessage(response);
          });
          return;
        }

        await messageHandler.handleMessage(message);

        if (message.type === 'project:changed' || message.type === 'save') {
          this.markDocumentDirty(document);
        }

        if (message.type === 'save') {
          await vscode.commands.executeCommand('workbench.action.files.save');
        }

        // Update FrameServer and outline on incremental sync
        if (message.type === 'operationApplied') {
          const mediaService = this.mediaServices.get(docUri);
          if (mediaService) {
            const operation = message.operation;
            // Operations that Rust engine can apply incrementally
            const RUST_FAST_PATH_OPS = new Set([
              // P0: field patches
              'element.update',
              'track.toggle',
              'element.toggle',
              // P1: simple mutations
              'track.update',
              'element.splitKeepLeft',
              'element.splitKeepRight',
              'project.update',
              // P2: structural operations
              'element.add',
              'element.remove',
              'element.move',
              'track.add',
              'track.remove',
              'track.reorder',
              'element.splitAt',
              'element.linkAudio',
              'element.unlinkAudio',
              'batch',
            ]);
            const isIncremental = RUST_FAST_PATH_OPS.has(operation.type);
            if (isIncremental) {
              // Fast path: send just the operation to Rust (~100 bytes)
              mediaService
                .handleMessage({
                  type: 'media:frameServer:projectPlayback:applyOperation',
                  payload: { operation },
                })
                .catch(() => {
                  // Fallback to full update on failure
                  const content = model!.getProjectData();
                  mediaService
                    .handleMessage({
                      type: 'media:frameServer:projectPlayback:update',
                      payload: { projectData: content },
                    })
                    .catch((err: unknown) => {
                      logger.warn('Stream fallback update failed:', err);
                    });
                });
            } else {
              // Slow path: send full ProjectData for complex operations
              const content = model!.getProjectData();
              mediaService
                .handleMessage({
                  type: 'media:frameServer:projectPlayback:update',
                  payload: { projectData: content },
                })
                .catch((err: unknown) => {
                  logger.warn('Stream update from operation failed:', err);
                });
            }
          }

          if (webviewPanel.visible) {
            outlineProvider?.updateProject(model!.getProjectData());
          }
        }
      },
      undefined,
      this.context.subscriptions,
    );

    // Set up the webview HTML content after registering the message listener,
    // so a fast-loading Webview cannot send `ready` before the Extension is
    // listening.
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Show status bar only when THIS editor is the currently visible one.
    // When multiple editors exist, only the most recently focused panel
    // should drive the status bar and outline (fixes NKC-008 race).
    const updateStatusBarVisibility = () => {
      if (webviewPanel.visible) {
        statusBar?.show();
        const content = model!.getProjectData();
        outlineProvider?.updateProject(content);
        webviewPanel.webview.postMessage({ type: 'requestStatus' });
      } else {
        // Only hide if no other panel is visible
        let anyVisible = false;
        for (const [, panel] of this.activeWebviewPanels) {
          if (panel !== webviewPanel && panel.visible) {
            anyVisible = true;
            break;
          }
        }
        if (!anyVisible) {
          statusBar?.hide();
          outlineProvider?.updateProject(null);
        }
      }
    };

    // Track visibility changes
    webviewPanel.onDidChangeViewState(() => {
      updateStatusBarVisibility();
    });

    // Initial visibility check
    updateStatusBarVisibility();

    // Listen for model changes (来自 VideoEditorModel 的事件)
    const modelChangeSubscription = model.onDidChange(() => {
      updateWebview();

      // Hot-update timeline data in the active stream
      const mediaService = this.mediaServices.get(docUri);
      if (mediaService) {
        const content = model!.getProjectData();
        mediaService
          .handleMessage({
            type: 'media:frameServer:projectPlayback:update',
            payload: { projectData: content },
          })
          .catch((err: unknown) => {
            logger.warn('Timeline update failed:', err);
          });
      }
    });

    // Clean up when editor is closed
    webviewPanel.onDidDispose(async () => {
      modelChangeSubscription.dispose();

      // Remove from active webviews and panels
      this.activeWebviews.delete(docUri);
      this.activeWebviewPanels.delete(docUri);

      // If export is running, defer cleanup until export completes
      const exportService = this.exportServices.get(docUri);
      if (exportService?.isExporting()) {
        logger.info('Export in progress — deferring cleanup until export finishes');

        const deferCleanup = () => {
          // Now safe to dispose everything
          exportService.dispose();
          this.exportServices.delete(docUri);

          const ms = this.mediaServices.get(docUri);
          if (ms) {
            ms.destroyEditorStream()
              .then(() => ms.dispose())
              .catch(() => ms.dispose());
            this.mediaServices.delete(docUri);
          }

          this.broadcastExportStatus();
        };

        // Listen for terminal events to trigger deferred cleanup
        const subs: vscode.Disposable[] = [];
        const onDone = () => {
          for (const s of subs) s.dispose();
          this.deferredCleanupSubs.delete(docUri);
          deferCleanup();
        };
        subs.push(exportService.onDidComplete(onDone));
        subs.push(exportService.onDidError(onDone));
        subs.push(exportService.onDidCancel(onDone));
        // Store subs so they can be cancelled if editor is reopened
        this.deferredCleanupSubs.set(docUri, subs);
      } else {
        // No active export — clean up immediately
        if (exportService) {
          exportService.dispose();
          this.exportServices.delete(docUri);
        }

        // Destroy editor stream, then dispose MediaService
        const mediaService = this.mediaServices.get(docUri);
        if (mediaService) {
          await mediaService.destroyEditorStream();
          mediaService.dispose();
          this.mediaServices.delete(docUri);
        }
      }

      // Clear outline when editor is closed
      outlineProvider?.updateProject(null);

      // 注销模型（如果这是最后一个使用该文档的编辑器）
      const modelDisposable = this.modelDisposables.get(docUri);
      if (modelDisposable) {
        modelDisposable.dispose();
        this.modelDisposables.delete(docUri);
      }

      // 清除活动编辑器（如果是当前活动的）
      if (editorRegistry.getActiveEditor() === model) {
        editorRegistry.setActiveEditor(undefined);
      }
    });

    // Initial update
    updateWebview();
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // Check if running in development mode
    const isDev = process.env.VITE_DEV_MODE === 'true';
    const devServerPort = process.env.VITE_DEV_PORT || '5173';

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    // Get VS Code locale
    const locale = vscode.env.language || 'en';

    if (isDev) {
      // Development mode: connect to Vite dev server for HMR
      const devServerUrl = `http://localhost:${devServerPort}`;
      logger.info(`Dev mode enabled, connecting to ${devServerUrl}`);

      return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' http://localhost:${devServerPort}; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval' http://localhost:${devServerPort}; worker-src ${webview.cspSource} blob:; img-src ${webview.cspSource} data: blob: https: http://127.0.0.1:* http://localhost:${devServerPort}; media-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource} data: http://localhost:${devServerPort}; connect-src ${webview.cspSource} https: data: blob: ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:${devServerPort} http://localhost:${devServerPort};">
  <title>OpenNeko - Video Editor (Dev)</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // Acquire VSCode API BEFORE loading any modules
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script type="module" nonce="${nonce}">
    // React Fast Refresh preamble - must be before any React code
    import RefreshRuntime from '${devServerUrl}/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
  <script type="module" nonce="${nonce}" src="${devServerUrl}/@vite/client"></script>
  <script type="module" nonce="${nonce}" src="${devServerUrl}/src/main.tsx"></script>
</body>
</html>`;
    }

    // Production mode: load from dist/webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'style.css'),
    );

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src ${webview.cspSource} blob:; img-src ${webview.cspSource} data: blob: https: http://127.0.0.1:*; media-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource} data:; connect-src ${webview.cspSource} https: data: blob: ws://127.0.0.1:* http://127.0.0.1:*;">
  <link rel="stylesheet" href="${styleUri}">
  <title>OpenNeko - Video Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // Acquire VSCode API BEFORE loading any modules
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Handle colorCorrection:loadLut — open file dialog, read .cube, upload to engine.
   * Responds with colorCorrection:lutLoaded or colorCorrection:lutError.
   */
  private async handleLoadLut(webview: vscode.Webview, _docUri: string): Promise<void> {
    try {
      // 1. Open file picker for .cube files
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'LUT Files': ['cube'] },
        title: 'Load LUT (.cube)',
      });

      if (!uris || uris.length === 0) {
        // User cancelled — no response needed
        return;
      }

      const fileUri = uris[0]!;
      const fileName = path.basename(fileUri.fsPath, '.cube');

      // 2. Read .cube file
      const fileData = await vscode.workspace.fs.readFile(fileUri);

      // 3. Base64-encode the UTF-8 content
      const base64Data = Buffer.from(fileData).toString('base64');

      // 4. Upload to engine via EngineClient
      const client = await this.engineConnection.ensureClient();
      if (!client) {
        webview.postMessage({
          type: 'colorCorrection:lutError',
          error: 'Engine not available',
        });
        return;
      }

      const response = await client.dispatch({
        group: 'color-correction',
        action: 'upload_lut',
        options: { name: fileName },
        body: { data: base64Data },
      });

      if (response.status !== 'ok') {
        webview.postMessage({
          type: 'colorCorrection:lutError',
          error: (response.error as { message?: string } | null)?.message ?? 'LUT upload failed',
        });
        return;
      }

      const data = response.data as Record<string, unknown> | undefined;
      const lutId = data?.['lutId'] as string | undefined;
      const name = (data?.['name'] as string | undefined) ?? fileName;

      if (!lutId) {
        webview.postMessage({
          type: 'colorCorrection:lutError',
          error: 'Engine did not return a lutId',
        });
        return;
      }

      // 5. Notify webview
      webview.postMessage({
        type: 'colorCorrection:lutLoaded',
        lutId,
        name,
      });
    } catch (error) {
      logger.error('handleLoadLut error', error);
      webview.postMessage({
        type: 'colorCorrection:lutError',
        error: error instanceof Error ? error.message : 'Failed to load LUT',
      });
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function requestCutProjectSnapshot(
  webview: Pick<vscode.Webview, 'postMessage' | 'onDidReceiveMessage'>,
  saveReason: ProjectFileSaveReason,
): Promise<ProjectData> {
  return requestWebviewProjectSnapshot<ProjectData>(webview, {
    formatId: 'nkv',
    saveReason,
  });
}
