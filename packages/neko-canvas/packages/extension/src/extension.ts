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
  type CanvasImportAssetRequest,
  getPanoramicPreviewRoute,
  type DocumentArchiveResourceRef,
  type CanvasMarkdownCapabilityInput,
  type ResourceRef,
  CANVAS_WORKSPACE_BOARD_PATH,
  resolveGlobalStorageLayout,
  type LocalMetadataStore,
  type NekoCutAPI,
  NEKO_EXTENSION_IDS,
  isNekoCutAPI,
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
import { CanvasProjectAuthoringService } from './services/canvasProjectAuthoringService';
import { WorkspaceBoardProjector } from './services/workspaceBoardProjector';
import { WorkspaceBoardEditorLeaseOwner } from './services/workspaceBoardEditorLeaseOwner';
import { registerWorkspaceBoardFunctionalAcceptance } from './debug/workspaceBoardFunctionalAcceptance';
import type { PurposeGenerationJobPort } from '@neko/generation';
import { handoffCanvasDraftToCut } from './services/CanvasCutRouteHandoff';

export interface NekoCanvasHostServices {
  readonly purposeGenerationJobs?: PurposeGenerationJobPort;
}

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
export async function activate(
  context: vscode.ExtensionContext,
  _hostServices?: NekoCanvasHostServices,
): Promise<NekoCanvasAPI> {
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
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceRoot = workspaceFolder?.uri.fsPath;
  canvasEditorProvider = await CanvasEditorProvider.create(context);
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
    markdown: {
      invoke: async (input) => {
        return invokeCanvasMarkdownCapability(input, {
          applyAgentContent: (payload) =>
            canvasProjectAuthoringService.applyAgentContent({
              payload,
              fallbackTitle: createMarkdownCanvasName(input),
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
      sendRouteToCut: async (request) => {
        const draft = canvasEditorProvider.createCutDraftFromRoute(request);
        return handoffCanvasDraftToCut(await resolveCutApi(), draft, request.target);
      },
      reorderUnits: (request) => canvasEditorProvider.reorderPlaybackUnits(request),
    },
    nodes: {
      list: (type) => canvasEditorProvider.listNodes(type),
      get: (nodeId) => canvasEditorProvider.getNode(nodeId),
      update: (nodeId, data) => canvasEditorProvider.updateNode(nodeId, data),
      create: async (type, position, data) => {
        const result = await canvasProjectAuthoringService.createNode({
          node: { type, position, data: data as Record<string, unknown> },
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
  registerCommands(context);

  logger.info('Extension activated');

  const capabilityProvider = createNekoCanvasCapabilityProvider(api);
  void registerOptionalAgentCapabilityProvider(capabilityProvider).catch((error: unknown) =>
    handleError(error),
  );

  return api;
}

async function resolveCutApi(): Promise<NekoCutAPI> {
  const extension = vscode.extensions.getExtension(NEKO_EXTENSION_IDS.NEKO_CUT);
  if (!extension) throw new Error('Neko Cut extension is not installed.');
  const api = extension.isActive ? extension.exports : await extension.activate();
  if (!isNekoCutAPI(api)) throw new Error('Neko Cut extension API contract mismatch.');
  return api;
}

/**
 * Get default canvas data for new files
 */
function getCanvasTemplate(
  name: string,
  options: {
    readonly creativeScope?: CanvasCreativeScope;
    readonly relatedBoards?: CanvasConfig['relatedBoards'];
  } = {},
): string {
  const data = {
    version: '3.0',
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
function registerCommands(context: vscode.ExtensionContext): void {
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
        const { type: requestedType, ...assetWithoutType } = asset;
        if (
          requestedType !== undefined &&
          requestedType !== 'image' &&
          requestedType !== 'audio' &&
          requestedType !== 'video'
        ) {
          void handleError(
            new Error(`neko.canvas.importAsset: unsupported media type ${requestedType}`),
            {
              showToUser: true,
              severity: 'warning',
            },
          );
          return;
        }
        const request: CanvasImportAssetRequest = {
          ...assetWithoutType,
          ...(requestedType ? { type: requestedType } : {}),
        };

        const result = await canvasProjectAuthoringService.importAsset({ asset: request });

        const source =
          request.path ??
          request.resourceRef?.id ??
          request.documentResourceRef?.entryPath ??
          'linked-resource';
        getRootLogger().info(
          `importAsset: created media node ${result.nodeId} in ${result.documentUri} from ${source} (${result.mediaType})`,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.revealPlaybackWorkspace', async () => {
      const revealed = await canvasEditorProvider.revealPlaybackWorkspace();
      if (!revealed) {
        await handleError(new Error('Open a Canvas editor before revealing Playback Workspace.'), {
          showToUser: true,
          severity: 'warning',
        });
      }
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

function createMarkdownCanvasName(input: CanvasMarkdownCapabilityInput): string {
  const sourceTitle = 'title' in input ? input.title?.trim() : '';
  return sanitizeCanvasFileName(sourceTitle || 'Agent Canvas').slice(0, 80);
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
  const [folder] = folders;
  if (!folder) throw new Error('No workspace folder open');

  const canvasFile = await createAvailableCanvasFilePath(folder.uri.fsPath, config.name);
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
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
