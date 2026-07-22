/**
 * NekoCanvas Extension - Canvas editor for VSCode
 *
 * This is the main entry point for the NekoCanvas extension.
 * It provides canvas editing and direct content authoring capabilities.
 */
import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import {
  WorkspaceBoardDeliveryCoordinator,
  WorkspaceBoardDeliveryLedger,
} from '@neko-canvas/domain';
import {
  type CanvasCreativeScope,
  getPanoramicPreviewRoute,
  type ApplyCanvasStoryboardOptions,
  type CanvasStoryboardExecutionSummary,
  type CanvasStoryboardExecutionSummaryRequest,
  type CanvasStoryboardPayload,
  type CreatedCanvasStoryboard,
  type CreativeAiApplyRequest,
  type DocumentArchiveResourceRef,
  type CanvasMarkdownCapabilityInput,
  type ResourceRef,
  type ExternalCreativeAiInvocation,
  CANVAS_WORKSPACE_BOARD_PATH,
  resolveGlobalStorageLayout,
  type LocalMetadataStore,
} from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/shared/local-metadata/node-workspace-identity';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  createNewFile,
  NodeAuthorizedWorkspaceWriter,
  registerOptionalAgentCapabilityProvider,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { getRootLogger, setRootLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';
import { CanvasEditorProvider } from './editor';
import { CanvasOutlineProvider, CanvasStatusBar } from './views';
import type { NekoCanvasAPI, CanvasConfig } from './api';
import { createNekoCanvasCapabilityProvider } from './agentCapabilityProvider';
import { invokeCanvasMarkdownCapability } from './markdownCapabilities';
import {
  NARRATIVE_PREVIEW_CONFIG_SECTION,
  readNarrativePreviewFeatureToggles,
} from './editor/narrativePreviewFeatureGate';
import {
  CANVAS_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND,
  CanvasCreativeAiApplyAdapter,
} from './creativeAiCanvasAdapter';
import { CanvasProjectAuthoringService } from './services/canvasProjectAuthoringService';
import { WorkspaceBoardProjector } from './services/workspaceBoardProjector';
import { WorkspaceBoardEditorLeaseOwner } from './services/workspaceBoardEditorLeaseOwner';
import { registerWorkspaceBoardFunctionalAcceptance } from './debug/workspaceBoardFunctionalAcceptance';

// Extension state
let canvasEditorProvider: CanvasEditorProvider;
let canvasOutlineProvider: CanvasOutlineProvider;
let canvasStatusBar: CanvasStatusBar;
let canvasProjectAuthoringService: CanvasProjectAuthoringService;
let workspaceBoardProjector: WorkspaceBoardProjector;
let workspaceBoardMetadataStore: LocalMetadataStore | undefined;
let workspaceBoardWorkspaceId: string | undefined;

function parseCanvasDocumentUri(documentUri: string | undefined): vscode.Uri | undefined {
  return documentUri ? vscode.Uri.parse(documentUri) : undefined;
}

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<NekoCanvasAPI> {
  const rootLogger = createVSCodeLogger(
    'Neko Canvas',
    'NekoCanvas',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  watchLogLevel(rootLogger, context);
  const logger = getRootLogger();

  logger.info('Activating extension...');

  // Create providers
  const getNarrativePreviewFeatureToggles = () =>
    readNarrativePreviewFeatureToggles(
      vscode.workspace.getConfiguration(NARRATIVE_PREVIEW_CONFIG_SECTION),
    );
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceRoot = workspaceFolder?.uri.fsPath;
  canvasEditorProvider = await CanvasEditorProvider.create(
    context,
    undefined,
    getNarrativePreviewFeatureToggles,
  );
  canvasProjectAuthoringService = new CanvasProjectAuthoringService({
    context,
    canvasEditorProvider,
    logger,
    resolveAuthorizedWrite: (filePath) => ({
      writer: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: path.dirname(filePath) }),
      locator: { kind: 'workspace-file', path: path.basename(filePath) },
    }),
  });
  if (workspaceRoot) {
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: os.homedir() });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(os.homedir()).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(AGENT_STATE_MIGRATIONS);
    workspaceBoardWorkspaceId = (
      await resolveNodeWorkspaceIdentity({
        workspaceRoot,
        homedir: os.homedir(),
        metadataStore,
      })
    ).identity.workspaceId;
    workspaceBoardMetadataStore = metadataStore;
    context.subscriptions.push({ dispose: () => void metadataStore.dispose() });
  }
  const workspaceBoardCoordinators = new Map<string, WorkspaceBoardDeliveryCoordinator>();
  const holderId = `vscode-canvas:${process.pid}:${randomUUID()}`;
  const getWorkspaceBoardCoordinator = (workspaceId: string) => {
    if (!workspaceBoardMetadataStore) {
      throw new Error('Workspace Board delivery ledger is unavailable without a workspace.');
    }
    if (workspaceId !== workspaceBoardWorkspaceId) {
      throw new Error(
        `Workspace Board delivery workspace ${workspaceId} does not match the active Canvas workspace.`,
      );
    }
    let coordinator = workspaceBoardCoordinators.get(workspaceId);
    if (!coordinator) {
      coordinator = new WorkspaceBoardDeliveryCoordinator({
        ledger: new WorkspaceBoardDeliveryLedger({
          metadataStore: workspaceBoardMetadataStore,
          workspaceId,
        }),
        mutation: canvasProjectAuthoringService,
        holderId,
      });
      workspaceBoardCoordinators.set(workspaceId, coordinator);
      void coordinator.flush().catch((error: unknown) => {
        logger.warn('Workspace Board pending delivery resume failed.', error);
      });
    }
    return coordinator;
  };
  workspaceBoardProjector = new WorkspaceBoardProjector({
    getCoordinator: getWorkspaceBoardCoordinator,
  });
  let workspaceBoardEditorLeaseOwner: WorkspaceBoardEditorLeaseOwner | undefined;
  if (workspaceFolder && workspaceBoardWorkspaceId) {
    const workspaceBoardUri = vscode.Uri.joinPath(
      workspaceFolder.uri,
      ...CANVAS_WORKSPACE_BOARD_PATH.split('/'),
    );
    workspaceBoardEditorLeaseOwner = new WorkspaceBoardEditorLeaseOwner({
      workspaceBoardDocumentUri: workspaceBoardUri.toString(),
      coordinator: getWorkspaceBoardCoordinator(workspaceBoardWorkspaceId),
      onDidChangeDocumentLifecycle: canvasEditorProvider.onDidChangeDocumentLifecycle,
      logger,
    });
    context.subscriptions.push(workspaceBoardEditorLeaseOwner);
  }
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    if (
      !workspaceBoardMetadataStore ||
      !workspaceBoardWorkspaceId ||
      !workspaceBoardEditorLeaseOwner
    ) {
      throw new Error('Workspace Board functional acceptance requires an initialized workspace.');
    }
    const editorOwnerCoordinator = getWorkspaceBoardCoordinator(workspaceBoardWorkspaceId);
    const competingHostCoordinator = new WorkspaceBoardDeliveryCoordinator({
      ledger: new WorkspaceBoardDeliveryLedger({
        metadataStore: workspaceBoardMetadataStore,
        workspaceId: workspaceBoardWorkspaceId,
      }),
      mutation: canvasProjectAuthoringService,
      holderId: `functional-tui:${process.pid}:${randomUUID()}`,
    });
    registerWorkspaceBoardFunctionalAcceptance({
      context,
      projector: workspaceBoardProjector,
      competingHostCoordinator,
      editorOwnerCoordinator,
      whenEditorOwnerIdle: () => workspaceBoardEditorLeaseOwner.whenIdle(),
      getWorkspaceId: () => workspaceBoardWorkspaceId,
      getActiveDocumentUri: () => canvasEditorProvider.getActiveCanvasDocumentUri(),
      revealDocument: (uri) => canvasEditorProvider.revealCanvasDocument(uri),
    });
  }
  canvasEditorProvider.setHeadlessAssetImporter((asset) =>
    canvasProjectAuthoringService.importAsset({ asset }),
  );
  const creativeAiApplyAdapter = new CanvasCreativeAiApplyAdapter({
    getNode: (nodeId) => canvasEditorProvider.getNode(nodeId),
    updateNode: (nodeId, data) => canvasEditorProvider.updateNode(nodeId, data),
  });
  canvasEditorProvider.setCreativeAiApplyAdapter(creativeAiApplyAdapter);
  canvasOutlineProvider = new CanvasOutlineProvider();
  canvasStatusBar = new CanvasStatusBar();

  // Wire providers into editor provider for data sync
  canvasEditorProvider.setProviders({
    outline: canvasOutlineProvider,
    statusBar: canvasStatusBar,
  });

  // Register custom editor
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      CanvasEditorProvider.viewType,
      canvasEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  // Register outline tree view
  context.subscriptions.push(
    vscode.window.createTreeView('neko.canvasOutline', {
      treeDataProvider: canvasOutlineProvider,
      showCollapseAll: true,
    }),
  );

  // Register disposables
  context.subscriptions.push(canvasOutlineProvider);
  context.subscriptions.push(canvasStatusBar);
  context.subscriptions.push(canvasEditorProvider);

  // Show/hide status bar based on active editor
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      // Custom editors don't trigger this, but when switching away to a text editor, hide
      canvasStatusBar.hide();
    }),
  );

  // Return API for other extensions.
  const api: NekoCanvasAPI = {
    importAsset: (asset) => canvasProjectAuthoringService.importAsset({ asset }),
    authoring: {
      importAsset: (request) => canvasProjectAuthoringService.importAssetAuthoring(request),
    },
    boards: {
      project: (input) => workspaceBoardProjector.project(input),
    },
    canvas: {
      create: (config) => createCanvas(config),
      addShape: (canvasId, shape) => canvasEditorProvider.addShape(shape),
      updateShape: (canvasId, shapeId, updates) =>
        canvasEditorProvider.updateShape(shapeId, updates),
      deleteShape: (canvasId, shapeId) => canvasEditorProvider.deleteShape(shapeId),
    },
    storyboard: {
      import: async (payload, options) => {
        const created = await importStoryboardToCanvas(payload, options);
        canvasEditorProvider.reportStoryboardImport(payload, created);
        return created;
      },
      getExecutionSummary: (request) => canvasEditorProvider.getStoryboardExecutionSummary(request),
    },
    markdown: {
      invoke: async (input) => {
        return invokeCanvasMarkdownCapability(input, {
          applyAgentContent: (payload) =>
            canvasProjectAuthoringService.applyAgentContent({
              payload,
              fallbackTitle: createMarkdownCanvasName(input),
            }),
          createNode: (type, position, data, preset) =>
            canvasProjectAuthoringService
              .createNode({
                node: { type, position, data, preset },
                fallbackTitle: createMarkdownCanvasName(input),
              })
              .then((result) => result.nodeId),
          updateNode: (nodeId, data) => canvasEditorProvider.updateNode(nodeId, data),
          createComposite: (request) =>
            canvasProjectAuthoringService.createComposite({
              request,
              fallbackTitle: createCompositeCanvasName(request, createMarkdownCanvasName(input)),
            }),
          createStoryboard: (payload, options) =>
            canvasProjectAuthoringService
              .createStoryboardFromPayload({
                target: {
                  title: createStoryboardCanvasName(payload),
                },
                payload,
                startX: options?.startX,
                startY: options?.startY,
                workflowPlanId: options?.workflowPlanId,
              })
              .then((result) => {
                if (!result.storyboard) {
                  throw new Error(
                    'Headless storyboard Markdown creation did not return storyboard results.',
                  );
                }
                return { ...result.storyboard, documentUri: result.documentUri };
              }),
        });
      },
    },
    playback: {
      getPlan: async (sourceCanvasUri) => canvasEditorProvider.getPlaybackPlan(sourceCanvasUri),
      getRoutes: async (sourceCanvasUri) => canvasEditorProvider.getPlaybackRoutes(sourceCanvasUri),
      revealWorkspace: (request) => canvasEditorProvider.revealPlaybackWorkspace(request),
      createCutDraftFromRoute: async (request) =>
        canvasEditorProvider.createCutDraftFromRoute(request),
      reorderUnits: (request) => canvasEditorProvider.reorderPlaybackUnits(request),
    },
    nodes: {
      list: (type) => canvasEditorProvider.listNodes(type),
      get: (nodeId) => canvasEditorProvider.getNode(nodeId),
      update: (nodeId, data) => canvasEditorProvider.updateNode(nodeId, data),
      create: async (type, position, data, preset) => {
        const result = await canvasProjectAuthoringService.createNode({
          node: { type, position, data: data as Record<string, unknown>, preset },
        });
        return result.nodeId;
      },
      derive: (request) => canvasEditorProvider.deriveNode(request),
      createConnection: (request) =>
        canvasProjectAuthoringService.createConnection({ connection: request }),
      createComposite: (request) => canvasProjectAuthoringService.createComposite({ request }),
      updateBlock: (request) => canvasProjectAuthoringService.updateBlock({ request }),
      extractStructuredContent: (request) => canvasEditorProvider.extractStructuredContent(request),
      getActiveContext: (request) => canvasEditorProvider.getActiveContext(request),
      applyAgentContent: (payload) => canvasProjectAuthoringService.applyAgentContent({ payload }),
      generateImage: (nodeId, childNodeId) =>
        canvasEditorProvider.generateImageForNode(nodeId, childNodeId),
      generateBatch: (nodeIds) => canvasEditorProvider.generateBatchForNodes(nodeIds),
      onSelectionChange: canvasEditorProvider.onSelectionChange,
    },
    projections: {
      registerAdapter: (adapter) => canvasEditorProvider.registerProjectionAdapter(adapter),
      open: (source) => canvasEditorProvider.openProjectedCanvas(source),
      writeBack: (source, changes) => canvasEditorProvider.writeProjectionBack(source, changes),
    },
    events: {
      onDidChangeCanvas: canvasEditorProvider.onDidChangeCanvas,
    },
  };

  // Register commands
  registerCommands(
    context,
    api.storyboard.getExecutionSummary,
    getNarrativePreviewFeatureToggles,
    creativeAiApplyAdapter,
  );

  // Register plugin slash commands into neko-agent chat panel
  registerAgentSlashCommands(context);

  logger.info('Extension activated');

  const capabilityProvider = createNekoCanvasCapabilityProvider(api);
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CANVAS_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND,
      (invocation: ExternalCreativeAiInvocation) =>
        capabilityProvider.executeCanvasCreativeAiInvocation(invocation),
    ),
  );
  void registerOptionalAgentCapabilityProvider(capabilityProvider).catch((error: unknown) =>
    handleError(error),
  );

  return api;
}

/**
 * Get default canvas data for new files
 */
function getCanvasTemplate(
  name: string,
  options: {
    readonly creativeScope?: CanvasCreativeScope;
    readonly relatedBoards?: CanvasStoryboardPayload['relatedBoards'];
  } = {},
): string {
  const data = {
    version: '2.1',
    name,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [],
    connections: [],
    ...(options.creativeScope ? { creativeScope: options.creativeScope } : {}),
    ...(options.relatedBoards ? { relatedBoards: options.relatedBoards } : {}),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Register extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  getExecutionSummary: (
    request?: CanvasStoryboardExecutionSummaryRequest,
  ) => Promise<CanvasStoryboardExecutionSummary>,
  getNarrativePreviewFeatureToggles: () => ReturnType<typeof readNarrativePreviewFeatureToggles>,
  creativeAiApplyAdapter: CanvasCreativeAiApplyAdapter,
): void {
  // New Canvas - create file with inline rename.
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.new', async (uri?: vscode.Uri) => {
      try {
        await createNewFile({
          targetFolder: uri,
          ext: '.nkc',
          template: (title) => getCanvasTemplate(title),
          noFolderErrorMessage: vscode.l10n.t('neko.canvas.new.noFolder'),
          onCreated: async (fileUri) => {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              CanvasEditorProvider.viewType,
            );
          },
        });
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // Import GeneratedAsset from another plugin (ADR-5 P0)
  // Receives a GeneratedAsset JSON payload (or { path } shorthand) from agent/other extensions
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.importAsset',
      async (asset?: {
        path?: string;
        type?: string;
        name?: string;
        documentResourceRef?: DocumentArchiveResourceRef;
        resourceRef?: ResourceRef;
      }) => {
        if (!asset?.path && !asset?.documentResourceRef && !asset?.resourceRef) {
          void handleError(
            new Error('neko.canvas.importAsset: missing asset path or resource ref'),
            {
              showToUser: true,
              severity: 'warning',
            },
          );
          return;
        }

        const result = await canvasProjectAuthoringService.importAsset({ asset });

        const source =
          asset.path ??
          asset.resourceRef?.id ??
          asset.documentResourceRef?.entryPath ??
          'linked-resource';
        getRootLogger().info(
          `importAsset: created media node ${result.nodeId} in ${result.documentUri} from ${source} (${result.mediaType})`,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.getStoryboardExecutionSummary',
      async (request?: CanvasStoryboardExecutionSummaryRequest) =>
        getExecutionSummary(request ?? {}),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.creativeAi.apply',
      async (request: CreativeAiApplyRequest) => creativeAiApplyAdapter.apply(request),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.revealPlaybackWorkspace', async () => {
      if (!getNarrativePreviewFeatureToggles().preview) {
        await handleError(new Error('Canvas Playback Workspace is disabled by configuration.'), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }

      const revealed = await canvasEditorProvider.revealPlaybackWorkspace();
      if (!revealed) {
        await handleError(new Error('Open a Canvas editor before revealing Playback Workspace.'), {
          showToUser: true,
          severity: 'warning',
        });
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.openNarrativePreview', async () => {
      await vscode.commands.executeCommand('neko.canvas.revealPlaybackWorkspace');
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.refreshNarrativePreview', () => {
      if (!getNarrativePreviewFeatureToggles().preview) return false;
      return canvasEditorProvider.refreshNarrativePreview();
    }),
  );

  // Canvas keyboard shortcuts - forwarded to webview
  const keyboardActions = [
    'neko.canvas.deleteSelected',
    'neko.canvas.escape',
    'neko.canvas.selectAll',
    'neko.canvas.undo',
    'neko.canvas.redo',
    'neko.canvas.copy',
    'neko.canvas.cut',
    'neko.canvas.paste',
    'neko.canvas.duplicate',
    'neko.canvas.generateSelected',
  ];
  for (const commandId of keyboardActions) {
    const action = commandId.replace('neko.canvas.', '');
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        canvasEditorProvider.postKeyboardAction(action);
      }),
    );
  }

  // Outline commands - select node/connection from tree view
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.selectNodeFromOutline',
      (nodeId: string, documentUri?: string) => {
        canvasEditorProvider.postKeyboardAction(
          'selectNode:' + nodeId,
          parseCanvasDocumentUri(documentUri),
        );
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.selectConnectionFromOutline',
      (connectionId: string, documentUri?: string) => {
        canvasEditorProvider.postKeyboardAction(
          'selectConnection:' + connectionId,
          parseCanvasDocumentUri(documentUri),
        );
      },
    ),
  );

  // Outline context-menu: detach shot from scene
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.detachShotFromScene',
      (element?: {
        kind?: string;
        node?: { id: string };
        parentSceneId?: string;
        documentUri?: string;
      }) => {
        if (element?.kind === 'shot-child' && element.node?.id && element.parentSceneId) {
          canvasEditorProvider.postKeyboardAction(
            `detachShot:${element.node.id}:${element.parentSceneId}`,
            parseCanvasDocumentUri(element.documentUri),
          );
        }
      },
    ),
  );

  // Outline context-menu: delete node
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.deleteNodeFromOutline',
      (element?: { kind?: string; node?: { id: string }; documentUri?: string }) => {
        if (element?.node?.id) {
          canvasEditorProvider.postKeyboardAction(
            `deleteNode:${element.node.id}`,
            parseCanvasDocumentUri(element.documentUri),
          );
        }
      },
    ),
  );

  // Zoom reset command (triggered from status bar)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.resetZoom', () => {
      canvasEditorProvider.postKeyboardAction('resetZoom');
    }),
  );

  // Preview media files with neko-preview (hardware-accelerated customEditor)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) return;

      const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
      const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

      try {
        const panoramicRoute = getPanoramicPreviewRoute({ filePath: uri.fsPath });
        if (panoramicRoute) {
          await vscode.commands.executeCommand('vscode.openWith', uri, panoramicRoute.viewType);
        } else if (videoExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (audioExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        }
      } catch (error) {
        getRootLogger().error(`Failed to open media preview: ${error}`);
      }
    }),
  );
}

async function importStoryboardToCanvas(
  payload: CanvasStoryboardPayload,
  options?: ApplyCanvasStoryboardOptions,
): Promise<CreatedCanvasStoryboard> {
  const result = await canvasProjectAuthoringService.createStoryboardFromPayload({
    target: {
      title: createStoryboardCanvasName(payload),
    },
    payload,
    startX: options?.startX,
    startY: options?.startY,
    workflowPlanId: options?.workflowPlanId,
  });
  if (!result.storyboard) {
    throw new Error('Headless storyboard import did not return created scene/shot results.');
  }
  return result.storyboard;
}

function isStoryboardMarkdownInput(input: CanvasMarkdownCapabilityInput): boolean {
  return (
    input.capabilityId === 'canvas.createStoryboardFromMarkdown' ||
    ('profileHint' in input && input.profileHint?.toLowerCase() === 'storyboard')
  );
}

function createStoryboardCanvasName(payload: CanvasStoryboardPayload): string {
  const scopeTitle = payload.creativeScope?.title?.trim();
  const firstSceneTitle = payload.scenes[0]?.sceneTitle;
  const multiSceneTitle =
    payload.scenes.length > 1
      ? (payload.creativeScope?.sequenceId ??
        payload.creativeScope?.episodeId ??
        payload.creativeScope?.workId ??
        'Storyboard Sequence')
      : undefined;
  const sourceTitle =
    scopeTitle || multiSceneTitle || firstSceneTitle?.trim() || 'Agent Storyboard';
  return sanitizeCanvasFileName(sourceTitle).slice(0, 80) || 'Agent Storyboard';
}

function createMarkdownCanvasName(input: CanvasMarkdownCapabilityInput): string {
  const tableTitle =
    input.capabilityId === 'canvas.createTableFromMarkdown' ? input.tableTitle?.trim() : '';
  const sourceTitle = 'title' in input ? input.title?.trim() : '';
  const profileHint = 'profileHint' in input ? input.profileHint?.trim() : '';
  const fallbackTitle = isStoryboardMarkdownInput(input) ? 'Agent Storyboard' : 'Agent Canvas';
  return sanitizeCanvasFileName(sourceTitle || tableTitle || profileHint || fallbackTitle).slice(
    0,
    80,
  );
}

function createCompositeCanvasName(
  request: { readonly data?: Readonly<Record<string, unknown>> },
  defaultName: string,
): string {
  const data = request.data ?? {};
  const title =
    asTrimmedString(data['sceneTitle']) ??
    asTrimmedString(data['label']) ??
    asTrimmedString(data['title']) ??
    defaultName;
  return sanitizeCanvasFileName(title).slice(0, 80) || defaultName;
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function sanitizeCanvasFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a new canvas file
 */
async function createCanvas(config: CanvasConfig): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder open');
  }

  const canvasFile = await createAvailableCanvasFilePath(folders[0].uri.fsPath, config.name);
  const content = getCanvasTemplate(config.name, {
    creativeScope: config.creativeScope,
    relatedBoards: config.relatedBoards,
  });
  await vscode.workspace.fs.writeFile(vscode.Uri.file(canvasFile), Buffer.from(content, 'utf-8'));
  return canvasFile;
}

async function createAvailableCanvasFilePath(folderPath: string, name: string): Promise<string> {
  const baseName = sanitizeCanvasFileName(name) || 'Canvas';
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : ` ${index + 1}`;
    const candidate = path.join(folderPath, `${baseName}${suffix}.nkc`);
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
    } catch {
      return candidate;
    }
  }
  return path.join(folderPath, `${baseName}-${Date.now()}.nkc`);
}

/**
 * Register plugin slash commands into the neko-agent chat panel.
 * Uses the `neko.agent.registerSlashCommands` VSCode command API.
 * Also registers the handler commands that neko-agent invokes on selection.
 */
function registerAgentSlashCommands(context: vscode.ExtensionContext): void {
  // Register command handlers that neko-agent will call via invokePluginSlashCommand
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.neko-canvas.slashCommand.batch',
      async (args?: string) => {
        // Trigger batch image generation for selected shots
        const nodeIds = (await canvasEditorProvider.listNodes('shot')).map((n) => n.id);
        if (nodeIds.length === 0) {
          vscode.window.showInformationMessage(
            'No shot nodes found. Add shot nodes to the canvas first.',
          );
          return;
        }
        await canvasEditorProvider.generateBatchForNodes(nodeIds);
        getRootLogger().info(`/batch: queued ${nodeIds.length} shots`, { args });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.neko-canvas.slashCommand.export',
      async (_args?: string) => {
        // Export storyboard — show quick pick for format
        const choice = await vscode.window.showQuickPick(
          [
            { label: '$(file-pdf) PDF', description: 'Export storyboard as PDF', value: 'pdf' },
            {
              label: '$(file-zip) ZIP',
              description: 'Export shot images as ZIP archive',
              value: 'zip',
            },
          ],
          { placeHolder: 'Select export format' },
        );
        if (!choice) return;
        await vscode.commands.executeCommand('neko.canvas.exportStoryboard', choice.value);
      },
    ),
  );

  // Register the slash commands with neko-agent (fires after agent extension activates)
  const doRegister = () => {
    vscode.commands
      .executeCommand('neko.agent.registerSlashCommands', 'neko.neko-canvas', [
        {
          id: 'batch',
          name: '/batch',
          description: 'Batch generate images for all shot nodes',
          icon: '🖼️',
        },
        {
          id: 'export',
          name: '/export',
          description: 'Export storyboard to PDF or ZIP',
          icon: '📦',
        },
      ])
      .then(undefined, () => {
        // neko-agent not installed — silently ignore
      });
  };

  // Try immediately (agent may already be active)
  doRegister();

  // Re-register if extensions change (late activation of neko-agent)
  context.subscriptions.push(vscode.extensions.onDidChange(doRegister));
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
