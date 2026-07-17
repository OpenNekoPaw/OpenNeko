/**
 * Neko Assets Extension
 *
 * VSCode extension entry point for unified asset management.
 *
 * Responsibilities:
 * - Initialize AssetLibrary with JsonFileStorage
 * - Connect engine probeMedia for rich metadata extraction
 * - Register FileDecorationProvider for Explorer tree enhancement
 * - Register context menu commands (add to timeline/canvas)
 * - Register existing commands (sync, push, pull, LFS, preview)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import {
  AssetLibrary,
  JsonFileStorage,
  RuleClassifier,
  AssetDiffService,
  buildAssetBindingCandidate,
  buildCancelEntityBindingPlan,
  buildDeleteAssetPlan,
  buildRepresentationPackageDetail,
} from '@neko/asset';
import type { IFileSystem } from '@neko/asset';
import * as os from 'os';
import {
  ENTITY_FACADE_COMMANDS,
  contractWorkspaceMediaPath,
  detectMediaType,
  isEntityFacadeAssetReverseLookupResult,
  resolveWorkspaceMediaPath,
  resolveStorageLayout,
  parseEntityUri,
  PathResolver,
  RECORDING_PROMOTION_COMMAND,
  isRecordingPromotionRequest,
  type CreativeEntityKind,
  type RecordingProjectFactInput,
  type WorkspaceMediaPathContext,
  type ResourceVariantRequest,
} from '@neko/shared';
import type { ImportedAssetDescriptor } from '@neko/shared';
import {
  createNodeWorkspaceEntityAssetMetadataBinding,
  createNodeWorkspaceMediaMetadataBinding,
  createNodeWorkspaceSearchMetadataBinding,
} from '@neko/shared/local-metadata/node';
import {
  EntityInspectorProvider,
  VSCodeEntityRuntimeRegistry,
  registerDashboardEntitySourceCommand,
  registerEntityFacadeCommands,
} from '@neko/entity/host-vscode';
import { createEngineMetadataExtractor } from './services/EngineMetadataExtractor';
import { ThumbnailService } from './services/ThumbnailService';
import { MediaMetadataCache } from './services/MediaMetadataCache';
import {
  createLocalMetadataMediaLibrarySearchIndexStore,
  MediaLibrarySearchService,
} from './services/MediaLibrarySearchService';
import { AssetHealthMonitor, createFileAccessChecker } from './services/AssetHealthMonitor';
import { MediaLibrarySettingsService } from './services/MediaLibrarySettingsService';
import { AssetFileDecorationProvider } from './providers/AssetFileDecorationProvider';
import { AssetManagerTreeProvider, type AssetTreeItem } from './providers/AssetManagerTreeProvider';
import {
  EntityBrowserEntityItem,
  EntityBrowserTreeProvider,
} from './providers/EntityBrowserTreeProvider';
import { AssetHistoryTreeProvider } from './providers/AssetHistoryTreeProvider';
import {
  MediaLibraryTreeProvider,
  type MediaLibraryItem,
} from './providers/MediaLibraryTreeProvider';
import { VscodeGitService } from './services/VscodeGitService';
import {
  createVSCodeLogger,
  createVSCodeWorkspaceMediaPathContext,
  createFileThumbnailResourceRef,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { setRootLogger, getLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';
import { openAssetPreview } from './utils/preview';
import { createNekoAssetsCapabilityProvider } from './agentCapabilityProvider';
import { MediaImportDispatcher } from './services/ImportDispatcher';
import { ProjectAssetDependencyManifestService } from './services/ProjectAssetDependencyManifestService';
import { CharacterAssetExportService } from './services/CharacterAssetExportService';
import {
  createEntityFacadeReaders,
  type EntityFacadeReaders,
} from './services/EntityFacadeReaders';
import { RecordingPromotionService } from './services/RecordingPromotionService';
import { AssetFileImportService } from './services/AssetFileImportService';

const logger = getLogger('Extension');

function withWorkspacePathVariable(
  workspaceRoot: string,
  variables: ReadonlyMap<string, string>,
): Map<string, string> {
  const result = new Map(variables);
  result.set('WORKSPACE', workspaceRoot);
  return result;
}

// =============================================================================
// Extension State
// =============================================================================

let library: AssetLibrary | null = null;
let diffService: AssetDiffService | null = null;
let thumbnailService: ThumbnailService | null = null;
let mediaSettingsService:
  import('./services/MediaLibrarySettingsService').MediaLibrarySettingsService | null = null;
let healthMonitor: AssetHealthMonitor | null = null;
/** Entity change event emitter — module-level so command handlers + API can both fire */
let entityChangeEmitter: import('vscode').EventEmitter<void> | null = null;
let dependencyManifestService: ProjectAssetDependencyManifestService | null = null;
let characterAssetExportService: CharacterAssetExportService | null = null;
let entityFacadeReaders: EntityFacadeReaders | null = null;
const runningTasks = new Set<Promise<void>>();

interface AssetWorkspacePathCommandContext {
  readonly sourceDocumentUri?: string;
  readonly documentPath?: string;
  readonly owningWorkspaceRoot?: string;
  readonly workspaceRoots?: readonly string[];
  readonly allowedRoots?: readonly string[];
}

function trackExtensionTask(label: string, task: PromiseLike<unknown>): void {
  const tracked = Promise.resolve(task).catch((error) => {
    logger.warn(`${label} failed (non-fatal):`, error);
  });
  runningTasks.add(tracked);
  void tracked.finally(() => {
    runningTasks.delete(tracked);
  });
}

// =============================================================================
// Node.js IFileSystem Adapter
// =============================================================================

const nodeFileSystem: IFileSystem = {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  },
  async writeFile(filePath: string, content: string): Promise<void> {
    // Ensure parent directory exists (e.g. .neko/assets/ on first run)
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  },
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  },
};

// =============================================================================
// Activation
// =============================================================================

export async function activate(
  context: vscode.ExtensionContext,
): Promise<import('@neko/shared').NekoAssetsAPI> {
  const rootLogger = createVSCodeLogger(
    'Neko Assets',
    'NekoAssets',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  watchLogLevel(rootLogger, context);

  logger.info('Activating extension...');

  // 0. Initialize i18n
  const { getVSCodeLocale } = await import('@neko/shared/vscode/extension');
  const locale = getVSCodeLocale();
  const { initI18n } = await import('./i18n');
  initI18n(locale);
  logger.info(`i18n initialized with locale: ${locale}`);

  // Create metadata extractor (used by both AssetLibrary and MediaLibrary)
  const metadataExtractor = createEngineMetadataExtractor();

  // 1. Initialize AssetLibrary
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const entityMetadata = workspaceRoot
    ? await createNodeWorkspaceEntityAssetMetadataBinding({
        homedir: os.homedir(),
        workDir: workspaceRoot,
      })
    : undefined;
  if (entityMetadata) {
    context.subscriptions.push({
      dispose: () => {
        void entityMetadata
          .dispose()
          .catch((error) => logger.warn('Failed to dispose Entity/Asset metadata store', error));
      },
    });
    if (
      entityMetadata.migrationReport.sourceStatus === 'quarantined' ||
      entityMetadata.migrationReport.unrecoverable.length > 0
    ) {
      logger.warn('Entity/Asset projection migration requires attention', {
        report: entityMetadata.migrationReport,
      });
    }
  }
  const entityRuntimeRegistry = new VSCodeEntityRuntimeRegistry({
    logger: rootLogger,
    resolveProjection: (projectRoot) =>
      entityMetadata && workspaceRoot && path.resolve(projectRoot) === path.resolve(workspaceRoot)
        ? {
            repository: entityMetadata.repository,
            partition: entityMetadata.partition,
            markStale: (diagnostic, updatedAt) => entityMetadata.markStale(diagnostic, updatedAt),
          }
        : undefined,
  });
  const entityInspectorProvider = new EntityInspectorProvider({ logger: rootLogger });
  context.subscriptions.push(
    entityRuntimeRegistry,
    entityInspectorProvider,
    registerEntityFacadeCommands({ logger: rootLogger, runtimeRegistry: entityRuntimeRegistry }),
    registerDashboardEntitySourceCommand({
      logger: rootLogger,
      runtimeRegistry: entityRuntimeRegistry,
    }),
    vscode.window.registerWebviewViewProvider(
      EntityInspectorProvider.viewType,
      entityInspectorProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand(ENTITY_FACADE_COMMANDS.inspectEntity, (request: unknown) =>
      entityInspectorProvider.inspect(request),
    ),
    vscode.commands.registerCommand('neko.entityInspector.follow', (request: unknown) =>
      entityInspectorProvider.follow(request),
    ),
  );
  if (workspaceRoot) {
    try {
      const layout = resolveStorageLayout(workspaceRoot, os.homedir());

      const storage = new JsonFileStorage({
        filePath: layout.project.facts.assetLibrary,
        fs: nodeFileSystem,
        autoSaveDelay: 1000,
      });

      // Initialize ThumbnailService
      thumbnailService = new ThumbnailService(layout.project.local.cache.thumbnails);
      context.subscriptions.push(thumbnailService);

      library = new AssetLibrary({
        storage,
        // Automatic import classification stays deterministic. Model-backed image
        // understanding is exposed through the Agent's explicit Pi purpose tool.
        classifier: new RuleClassifier(),
        metadataExtractor,
        thumbnailGenerator: (filePath) => thumbnailService!.generate(filePath),
        fileAccessChecker: createFileAccessChecker((p) => library?.resolvePath(p) ?? p),
      });

      await library.initialize();
      logger.info(`AssetLibrary initialized at ${layout.project.facts.assetLibrary}`);
      dependencyManifestService = new ProjectAssetDependencyManifestService({
        projectRoot: workspaceRoot,
        fs: {
          readFile: async (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
          writeFile: async (filePath, data) =>
            vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data),
          createDirectory: async (dirPath) =>
            vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
          exists: async (filePath) => {
            try {
              await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
              return true;
            } catch {
              return false;
            }
          },
        },
        market: {
          isInstalled: (packageId) => {
            const market = vscode.extensions.getExtension<{ isInstalled(id: string): boolean }>(
              'neko.neko-market',
            );
            return market?.exports?.isInstalled(packageId) ?? false;
          },
        },
      });
      entityFacadeReaders = createEntityFacadeReaders({ projectRoot: workspaceRoot });
      characterAssetExportService = new CharacterAssetExportService({
        fs: {
          readFile: async (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
          writeFile: async (filePath, data) =>
            vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data),
          createDirectory: async (dirPath) =>
            vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
          exists: async (filePath) => {
            try {
              await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
              return true;
            } catch {
              return false;
            }
          },
        },
        library,
        characters: entityFacadeReaders.characters,
        bindings: entityFacadeReaders.bindings,
      });

      // Initialize AssetDiffService with Git integration
      const gitService = new VscodeGitService(
        path.join(layout.project.local.cache.resources, 'git-diff'),
      );
      diffService = new AssetDiffService(storage, gitService, undefined, {
        statFile: async (filePath: string) => {
          try {
            const stats = await fs.stat(filePath);
            return { size: stats.size };
          } catch {
            return null;
          }
        },
      });
      logger.info('AssetDiffService initialized with Git integration');

      // Initialize Asset Health Monitor (initial check deferred until path variables are loaded)
      healthMonitor = new AssetHealthMonitor(library);
      healthMonitor.registerCommands(context);
      context.subscriptions.push(healthMonitor);
    } catch (error) {
      logger.error('Failed to initialize AssetLibrary:', error);
    }
  }

  // 2. Register FileDecorationProvider
  if (library) {
    const decorationProvider = new AssetFileDecorationProvider(library);
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

    // 3. Register Activity Bar tree views
    const assetManagerProvider = new AssetManagerTreeProvider(library, thumbnailService!);
    const assetHistoryProvider = new AssetHistoryTreeProvider(library, thumbnailService!);
    const entityBrowserProvider = new EntityBrowserTreeProvider();

    const assetManagerTree = vscode.window.createTreeView('neko.assetManager', {
      treeDataProvider: assetManagerProvider,
      showCollapseAll: true,
    });
    context.subscriptions.push(
      assetManagerTree,
      vscode.window.createTreeView('neko.assetHistory', {
        treeDataProvider: assetHistoryProvider,
      }),
      vscode.window.createTreeView('neko.entityBrowser', {
        treeDataProvider: entityBrowserProvider,
        showCollapseAll: true,
      }),
      assetManagerProvider,
      assetHistoryProvider,
      entityBrowserProvider,
    );

    // Refresh tree views when library changes
    context.subscriptions.push(
      vscode.commands.registerCommand('neko.assets.refreshViews', () => {
        assetManagerProvider.refresh();
        assetHistoryProvider.refresh();
        entityBrowserProvider.refresh();
      }),
    );
    registerEntityBrowserCommands(context, entityBrowserProvider);

    // Register asset manager context menu commands (entity/variant CRUD)
    registerAssetManagerCommands(
      context,
      library,
      assetManagerProvider,
      assetHistoryProvider,
      assetManagerTree,
    );
  }

  // 4. Initialize Media Library Settings (P1)
  if (library && workspaceRoot) {
    const settingsService = new MediaLibrarySettingsService(workspaceRoot);
    mediaSettingsService = settingsService;
    await settingsService.load();
    context.subscriptions.push(settingsService);

    // Sync path variables into library (must happen before health check)
    library.updatePathVariables(
      withWorkspacePathVariable(workspaceRoot, await settingsService.getPathVariableMap()),
    );
    settingsService.onDidChange(async () => {
      library!.updatePathVariables(
        withWorkspacePathVariable(workspaceRoot, await settingsService.getPathVariableMap()),
      );
    });

    // Run initial health check now that path variables are available
    if (healthMonitor) {
      trackExtensionTask('Initial asset health check', healthMonitor.runInitialCheck());
    }

    // Initialize PathResolver for portable cache keys
    const initialMetadataPathVariables = withWorkspacePathVariable(
      workspaceRoot,
      await settingsService.getPathVariableMap(),
    );
    const cachePathResolver = new PathResolver(initialMetadataPathVariables);
    settingsService.onDidChange(async () => {
      cachePathResolver.setVariables(
        withWorkspacePathVariable(workspaceRoot, await settingsService.getPathVariableMap()),
      );
    });

    const mediaMetadataBinding = await createNodeWorkspaceMediaMetadataBinding({
      homedir: os.homedir(),
      workDir: workspaceRoot,
      pathVariables: initialMetadataPathVariables,
    });
    context.subscriptions.push({
      dispose: () => {
        void mediaMetadataBinding
          .dispose()
          .catch((error) => logger.warn('Failed to dispose media metadata store', { error }));
      },
    });
    if (
      mediaMetadataBinding.migrationReport.sourceStatus === 'quarantined' ||
      mediaMetadataBinding.migrationReport.unrecoverable.length > 0
    ) {
      logger.warn('Media metadata migration requires attention', {
        report: mediaMetadataBinding.migrationReport,
      });
    }
    const metadataCache = new MediaMetadataCache({
      repository: mediaMetadataBinding.repository,
      partition: mediaMetadataBinding.partition,
      pathResolver: cachePathResolver,
    });
    await metadataCache.load();
    context.subscriptions.push(metadataCache);

    const searchMetadataBinding = await createNodeWorkspaceSearchMetadataBinding({
      homedir: os.homedir(),
      workDir: workspaceRoot,
      pathVariables: initialMetadataPathVariables,
    });
    context.subscriptions.push({
      dispose: () => {
        void searchMetadataBinding
          .dispose()
          .catch((error) => logger.warn('Failed to dispose search metadata store', { error }));
      },
    });
    if (
      searchMetadataBinding.mediaSearchMigrationReport.sourceStatus === 'quarantined' ||
      searchMetadataBinding.mediaSearchMigrationReport.unrecoverable.length > 0 ||
      searchMetadataBinding.semanticMigrationReport.sourceStatus === 'partial' ||
      searchMetadataBinding.semanticMigrationReport.sourceStatus === 'quarantined'
    ) {
      logger.warn('Search projection migration requires attention', {
        media: searchMetadataBinding.mediaSearchMigrationReport,
        semantic: searchMetadataBinding.semanticMigrationReport,
      });
    }
    const searchIndexStore = createLocalMetadataMediaLibrarySearchIndexStore({
      repository: searchMetadataBinding.searchDocuments,
      partition: searchMetadataBinding.searchPartition,
      pathResolver: cachePathResolver,
      readRevision: () => searchMetadataBinding.readSearchRevision(),
    });
    const searchService = new MediaLibrarySearchService(
      settingsService,
      metadataCache,
      searchIndexStore,
    );
    context.subscriptions.push(searchService);
    trackExtensionTask('Media library search warmup', searchService.warmup());

    // Register Media Library TreeView
    const mediaLibraryProvider = new MediaLibraryTreeProvider({
      settingsService,
      thumbnailService: thumbnailService!,
      metadataExtractor,
      metadataCache,
    });
    const mediaLibraryTree = vscode.window.createTreeView('neko.mediaLibraries', {
      treeDataProvider: mediaLibraryProvider,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: mediaLibraryProvider,
    });
    context.subscriptions.push(mediaLibraryTree, mediaLibraryProvider);

    // Register media library commands
    registerMediaLibraryCommands(context, settingsService, mediaLibraryProvider, mediaLibraryTree);

    // Register search command
    registerSearchCommand(context, searchService);
  }

  // 5. Register asset action commands
  registerAssetCommands(context);

  // 6. Register baseline preview/history commands
  registerBaselineCommands(context);

  // 7. Register internal API commands (for cross-extension access)
  registerInternalCommands(context);

  // 8. Build typed extension API (returned to VSCode as exports)
  const _onDidChangeEntities = new vscode.EventEmitter<void>();
  const _onDidChangeMediaLibraryRoots = new vscode.EventEmitter<void>();

  const assetFileImportService = library
    ? new AssetFileImportService({
        library,
        fs: { assertReadable: (filePath) => fs.access(filePath) },
        didImport: () => _onDidChangeEntities.fire(),
      })
    : undefined;
  // Bridge command for components that can't import entityChangeEmitter directly
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.entityChanged', () => {
      _onDidChangeEntities.fire();
    }),
  );
  entityChangeEmitter = _onDidChangeEntities;
  context.subscriptions.push(_onDidChangeEntities);

  if (mediaSettingsService) {
    context.subscriptions.push(
      mediaSettingsService.onDidChange(() => {
        _onDidChangeEntities.fire();
        _onDidChangeMediaLibraryRoots.fire();
      }),
    );
  }

  const api: import('@neko/shared').NekoAssetsAPI = {
    getAllEntities: async () => (library ? library.getAllEntities() : []),
    importFile: async (uri) => {
      if (!assetFileImportService) {
        throw new Error('AssetLibrary file import is unavailable.');
      }
      return assetFileImportService.importFile(uri.fsPath);
    },
    getThumbnailPath: async (filePath) => {
      if (!thumbnailService) return undefined;
      return (await thumbnailService.getCached(filePath)) ?? undefined;
    },
    createThumbnailResourceRef: async (filePath, options = {}) => {
      if (!workspaceRoot) return undefined;
      return createFileThumbnailResourceRef({
        filePath,
        scope: 'project',
        ...(options.mediaLibraryId ? { mediaLibraryId: options.mediaLibraryId } : {}),
        ...(options.projectRelativePath
          ? { projectRelativePath: options.projectRelativePath }
          : {}),
      });
    },
    getThumbnailVisual: async (
      filePath,
      variant: ResourceVariantRequest = { role: 'thumbnail', width: 256, height: 256 },
    ) => {
      if (!thumbnailService || !workspaceRoot) return undefined;
      const generated = await thumbnailService.generate(filePath, {
        maxWidth: variant.width,
        maxHeight: variant.height,
      });
      const resource = createFileThumbnailResourceRef({
        filePath,
        scope: 'project',
      });
      return {
        resource: {
          resource,
          role: variant.role,
          ...(variant.format ? { format: variant.format } : {}),
          ...(variant.mimeType ? { mimeType: variant.mimeType } : {}),
          ...((generated?.width ?? variant.width)
            ? { width: generated?.width ?? variant.width }
            : {}),
          ...((generated?.height ?? variant.height)
            ? { height: generated?.height ?? variant.height }
            : {}),
        },
        status: generated?.path ? 'ready' : 'missing',
        alt: path.basename(filePath),
      };
    },
    getMediaLibraryRoots: async () =>
      mediaSettingsService ? mediaSettingsService.getWebviewResourceRoots() : [],
    getPathVariables: async () =>
      mediaSettingsService ? [...(await mediaSettingsService.getPathVariableMap()).entries()] : [],
    resolveEntityUri: async (uri) => {
      if (!library) return undefined;
      const parsed = parseEntityUri(uri);
      if (!parsed) return undefined;

      const entities = await library.getAllEntities();
      const entity = entities.find((e) => e.id === parsed.entityId);
      if (!entity) return undefined;

      for (const variant of entity.variants) {
        const file = variant.files.find((f) => f.purpose === parsed.purpose);
        if (file) {
          return {
            entityId: parsed.entityId,
            variantId: variant.id,
            filePath: file.path,
            resolvedPath: library.resolvePath(file.path),
            mediaType: file.mediaType,
          };
        }
      }
      if (parsed.purpose === 'thumbnail') {
        const variant = entity.variants.find((v) => typeof v.thumbnailPath === 'string');
        if (variant?.thumbnailPath) {
          return {
            entityId: parsed.entityId,
            variantId: variant.id,
            filePath: variant.thumbnailPath,
            resolvedPath: variant.thumbnailPath,
            mediaType: 'image' as const,
          };
        }
      }
      return undefined;
    },
    getCharacterThumbnail: async (name) => {
      if (!library) return undefined;
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return undefined;

      try {
        const readers = entityFacadeReaders ?? createEntityFacadeReaders({ projectRoot: wsRoot });
        const record = await readers.characters.resolveByName(name);
        if (!record) return undefined;

        const assetIds = [
          ...(record.defaults?.assetEntityId ? [record.defaults.assetEntityId] : []),
          ...(record.bindings?.assetEntityIds ?? []),
        ];
        if (assetIds.length === 0) return undefined;

        const entities = await library.getAllEntities();
        for (const id of assetIds) {
          const entity = entities.find((e) => e.id === id);
          if (!entity) continue;
          for (const variant of entity.variants) {
            if (variant.thumbnailPath) return variant.thumbnailPath;
            const thumbFile = variant.files.find((f) => f.purpose === 'thumbnail');
            if (thumbFile) return library.resolvePath(thumbFile.path);
          }
        }
      } catch {
        return undefined;
      }
      return undefined;
    },
    getBindingCandidate: async (entityId) => {
      if (!library) return undefined;
      const entity = await library.getEntity(entityId);
      return entity ? buildAssetBindingCandidate(entity) : undefined;
    },
    getRepresentationPackageDetail: async (entityId) => {
      if (!library) return undefined;
      const entity = await library.getEntity(entityId);
      return entity ? buildRepresentationPackageDetail(entity) : undefined;
    },
    onDidChangeEntities: _onDidChangeEntities.event,
    onDidChangeMediaLibraryRoots: _onDidChangeMediaLibraryRoots.event,
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.getCharacterThumbnail', (name: string) =>
      api.getCharacterThumbnail(name),
    ),
    vscode.commands.registerCommand('neko.assets.getMediaLibraryRoots', () =>
      api.getMediaLibraryRoots(),
    ),
    vscode.commands.registerCommand('neko.assets.resolveProjectAssetRefs', async (input: unknown) =>
      resolveProjectAssetRefsForCommand(input, library, workspaceRoot),
    ),
  );

  try {
    const capabilityProvider = createNekoAssetsCapabilityProvider(api);
    trackExtensionTask(
      'neko-agent capability registration',
      vscode.commands.executeCommand('neko.agent.registerCapabilities', capabilityProvider),
    );
  } catch {
    // neko-agent not installed — capability registration silently skipped
  }

  logger.info('Extension activated, API exported');
  return api;
}

async function resolveProjectAssetRefsForCommand(
  input: unknown,
  lib: AssetLibrary | null,
  workspaceRoot: string | undefined,
): Promise<readonly { readonly assetRef: string; readonly uris: readonly vscode.Uri[] }[]> {
  if (!lib || !isProjectAssetRefResolveRequest(input)) return [];
  if (workspaceRoot && input.projectRoot !== workspaceRoot) return [];
  const output: { assetRef: string; uris: vscode.Uri[] }[] = [];
  for (const assetRef of input.assetRefs) {
    const assetEntityId = parseProjectAssetEntityIdFromRef(assetRef);
    if (!assetEntityId) continue;
    const entity = await lib.getEntity(assetEntityId);
    if (!entity) continue;
    const uris = collectEntityFilePaths(entity)
      .map((storedPath) => vscode.Uri.file(lib.resolvePath(storedPath)))
      .filter(
        (uri, index, values) => values.findIndex((item) => item.fsPath === uri.fsPath) === index,
      );
    output.push({ assetRef, uris });
  }
  return output;
}

function collectEntityFilePaths(entity: import('@neko/shared').AssetEntity): readonly string[] {
  return entity.variants.flatMap((variant) => [
    ...(variant.thumbnailPath ? [variant.thumbnailPath] : []),
    ...variant.files.map((file) => file.path),
  ]);
}

function parseProjectAssetEntityIdFromRef(assetRef: string): string | undefined {
  const prefix = 'project://assets/';
  if (!assetRef.startsWith(prefix)) return undefined;
  const raw = assetRef.slice(prefix.length).split('?')[0];
  return raw ? decodeURIComponent(raw) : undefined;
}

function isProjectAssetRefResolveRequest(
  value: unknown,
): value is { readonly projectRoot: string; readonly assetRefs: readonly string[] } {
  return (
    isRecord(value) &&
    typeof value['projectRoot'] === 'string' &&
    Array.isArray(value['assetRefs']) &&
    value['assetRefs'].every((item) => typeof item === 'string')
  );
}

// =============================================================================
// Asset Manager Context Menu Commands (entity / variant CRUD)
// =============================================================================

function registerAssetManagerCommands(
  context: vscode.ExtensionContext,
  lib: AssetLibrary,
  assetManagerProvider: AssetManagerTreeProvider,
  assetHistoryProvider: AssetHistoryTreeProvider,
  assetManagerTree: vscode.TreeView<AssetTreeItem>,
): void {
  const refresh = () => {
    assetManagerProvider.refresh();
    assetHistoryProvider.refresh();
  };

  // --- helpers ---------------------------------------------------------------

  /** Extract entity from EntityItem duck-typed argument */
  function getEntity(item: unknown) {
    if (item && typeof item === 'object' && 'entity' in item) {
      return (item as { entity: import('@neko/shared').AssetEntity }).entity;
    }
    return null;
  }

  /** Extract entity + variant from VariantItem duck-typed argument */
  function getVariant(item: unknown) {
    if (item && typeof item === 'object' && 'entity' in item && 'variant' in item) {
      const typed = item as {
        entity: import('@neko/shared').AssetEntity;
        variant: import('@neko/shared').AssetVariant;
      };
      return { entity: typed.entity, variant: typed.variant };
    }
    return null;
  }

  /** Resolve the primary file path of an entity (first file of first variant) */
  function primaryFilePath(entity: import('@neko/shared').AssetEntity): string | null {
    const storedPath = entity.variants[0]?.files[0]?.path;
    if (!storedPath) return null;
    return lib.resolvePath(storedPath);
  }

  function getFacadeReaders(): EntityFacadeReaders | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;
    if (!entityFacadeReaders) {
      entityFacadeReaders = createEntityFacadeReaders({ projectRoot: workspaceRoot });
    }
    return entityFacadeReaders;
  }

  async function listBindingsForAsset(entityId: string) {
    const readers = getFacadeReaders();
    return readers ? readers.bindings.listForProjectAsset(entityId) : [];
  }

  // --- entity commands -------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.revealEntity', async (entityId?: unknown) => {
      if (typeof entityId !== 'string' || entityId.trim().length === 0) {
        vscode.window.showWarningMessage('Asset id is required.');
        return;
      }
      const item = await assetManagerProvider.getEntityTreeItem(entityId.trim());
      if (!item) {
        vscode.window.showWarningMessage(`Asset not found: ${entityId}`);
        return;
      }
      await assetManagerTree.reveal(item, { focus: true, select: true, expand: true });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.entity.copyReference', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const storedPath = entity.variants[0]?.files[0]?.path;
      const resolvedPath = storedPath ? lib.resolvePath(storedPath) : undefined;
      await vscode.env.clipboard.writeText(
        JSON.stringify(
          {
            kind: 'asset-reference',
            assetId: entity.id,
            label: entity.name,
            category: entity.category,
            ...(storedPath ? { path: storedPath } : {}),
            ...(resolvedPath ? { resolvedPath } : {}),
            ...(entity.variants[0]?.files[0]?.mediaType
              ? { mediaType: entity.variants[0].files[0].mediaType }
              : {}),
            source: {
              partition: 'asset-library',
              sourceId: entity.id,
            },
          },
          null,
          2,
        ),
      );
      vscode.window.showInformationMessage('Asset reference copied to clipboard.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.entity.preview', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const filePath = primaryFilePath(entity);
      if (!filePath) return;
      await openAssetPreview(vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.entity.addToTimeline', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const filePath = primaryFilePath(entity);
      if (!filePath) return;
      await vscode.commands.executeCommand('neko.assets.addToTimeline', vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.entity.addToCanvas', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const filePath = primaryFilePath(entity);
      if (!filePath) return;
      await vscode.commands.executeCommand('neko.assets.addToCanvas', vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.entity.rename', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new name',
        value: entity.name,
        valueSelection: [0, entity.name.length],
      });
      if (!newName || newName === entity.name) return;
      try {
        await lib.updateEntity(entity.id, { name: newName });
        await lib.flush();
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.entity.addVariant', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const variantName = await vscode.window.showInputBox({
        prompt: 'Enter variant name',
        placeHolder: 'e.g., 4K, Draft, v2',
      });
      if (!variantName) return;
      try {
        await lib.addVariant(entity.id, { name: variantName });
        await lib.flush();
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand(
      'neko.assets.entity.showBindingCandidates',
      async (item?: unknown) => {
        const entity = getEntity(item);
        if (!entity) return;
        const candidate = buildAssetBindingCandidate(entity);
        await vscode.window.showQuickPick(
          candidate.suggestedRoles.map((role) => ({
            label: `$(link) ${role}`,
            description: candidate.assetRef,
            detail: `${Math.round(candidate.confidence * 100)}% · ${candidate.reason}`,
          })),
          {
            title: `Binding candidates for ${entity.name}`,
            placeHolder:
              candidate.suggestedRoles.length > 0
                ? 'Select a representation role to inspect'
                : candidate.reason,
          },
        );
      },
    ),

    vscode.commands.registerCommand(
      'neko.assets.entity.showRepresentationPackage',
      async (item?: unknown) => {
        const entity = getEntity(item);
        if (!entity) return;
        const detail = buildRepresentationPackageDetail(entity);
        const fileItems = detail.files.map((file) => ({
          label: `$(${file.role === 'thumbnail' ? 'file-media' : 'file'}) ${file.role}`,
          description: file.path,
          detail: `${file.mediaType ?? 'unknown'} · ${file.assetRef}`,
        }));
        const summary = {
          label: '$(symbol-structure) Package summary',
          description: detail.representationKinds.join(', ') || 'unknown representation',
          detail: [
            `Capabilities: ${detail.capabilities.join(', ') || 'none'}`,
            `Missing: ${detail.missingRoles.join(', ') || 'none'}`,
          ].join('\n'),
        };
        await vscode.window.showQuickPick([summary, ...fileItems], {
          title: `Representation package: ${entity.name}`,
          placeHolder: 'Component files, capabilities, and missing roles',
        });
      },
    ),

    vscode.commands.registerCommand('neko.assets.entity.cancelBinding', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const bindings = await listBindingsForAsset(entity.id);
      if (bindings.length === 0) {
        vscode.window.showInformationMessage(`No entity binding points to "${entity.name}".`);
        return;
      }

      const picked = await vscode.window.showQuickPick(
        bindings.map((binding) => ({
          label: `$(debug-disconnect) ${binding.entityId} · ${binding.role}`,
          description: binding.assetRef,
          detail: 'Cancels the binding only. The asset entity and files remain in the library.',
          binding,
        })),
        { title: `Cancel binding for ${entity.name}` },
      );
      if (!picked) return;

      const plan = buildCancelEntityBindingPlan(picked.binding);
      const confirm = await vscode.window.showWarningMessage(
        `Cancel binding ${plan.bindingId}? This will not delete "${entity.name}".`,
        { modal: true },
        'Cancel Binding',
      );
      if (confirm !== 'Cancel Binding') return;

      try {
        await vscode.commands.executeCommand(ENTITY_FACADE_COMMANDS.unbindAsset, {
          projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          bindingId: plan.bindingId,
        });
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.entity.delete', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const bindings = await listBindingsForAsset(entity.id);
      const plan = buildDeleteAssetPlan(entity, bindings);
      const bindingNote =
        plan.bindingIds.length > 0
          ? ` It has ${plan.bindingIds.length} entity binding(s); cancel bindings separately if you only want to unlink.`
          : '';
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${entity.name}"? This removes the asset entity and does not mean "cancel binding."${bindingNote}`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;
      try {
        await lib.deleteEntity(entity.id);
        await lib.flush();
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // --- variant commands ------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.variant.preview', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const storedPath = result.variant.files[0]?.path;
      if (!storedPath) return;
      const filePath = lib.resolvePath(storedPath);
      await openAssetPreview(vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.variant.addFile', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        title: 'Select file to add to variant',
      });
      if (!uris?.[0]) return;
      try {
        await lib.addFile(result.variant.id, uris[0].fsPath);
        await lib.flush();
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.variant.rename', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new variant name',
        value: result.variant.name,
        valueSelection: [0, result.variant.name.length],
      });
      if (!newName || newName === result.variant.name) return;
      try {
        await lib.updateVariant(result.entity.id, result.variant.id, { name: newName });
        await lib.flush();
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.variant.delete', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const confirm = await vscode.window.showWarningMessage(
        `Delete variant "${result.variant.name}"? This cannot be undone.`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;
      try {
        await lib.deleteVariant(result.entity.id, result.variant.id);
        await lib.flush();
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // --- directory command -----------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.directory.reveal', (item?: unknown) => {
      if (item && typeof item === 'object' && 'dirPath' in item) {
        const dirPath = (item as { dirPath: string }).dirPath;
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dirPath));
      }
    }),
  );

  // --- recent entity commands ------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.recentEntity.addToTimeline',
      async (item?: unknown) => {
        if (item && typeof item === 'object' && 'resourceUri' in item) {
          const uri = (item as { resourceUri: vscode.Uri }).resourceUri;
          if (uri) {
            await vscode.commands.executeCommand('neko.assets.addToTimeline', uri);
          }
        }
      },
    ),

    vscode.commands.registerCommand(
      'neko.assets.recentEntity.addToCanvas',
      async (item?: unknown) => {
        if (item && typeof item === 'object' && 'resourceUri' in item) {
          const uri = (item as { resourceUri: vscode.Uri }).resourceUri;
          if (uri) {
            await vscode.commands.executeCommand('neko.assets.addToCanvas', uri);
          }
        }
      },
    ),
  );
}

// =============================================================================
// Asset Action Commands
// =============================================================================

function registerAssetCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(RECORDING_PROMOTION_COMMAND, async (input: unknown) => {
      if (!isRecordingPromotionRequest(input)) {
        throw new Error('Invalid recording promotion request.');
      }
      const assetLibrary = library;
      if (!assetLibrary) {
        throw new Error('AssetLibrary is unavailable for recording promotion.');
      }
      const service = new RecordingPromotionService({
        registerProjectFact: async (fact: RecordingProjectFactInput) => {
          const imported = await assetLibrary.importFile(fact.destinationPath, {
            entityInput: {
              name: path.parse(fact.destinationPath).name,
              category: fact.mediaType === 'audio' ? 'audio' : 'object',
              metadata: {
                source: {
                  type: 'recording',
                  recording: fact.provenance,
                },
              },
              tags: ['recording', fact.mediaType, fact.provenance.producer],
              ownership: { scope: 'project', access: 'editable' },
            },
            variantInput: {
              name: 'Recorded take',
              attributes: {},
              tags: ['recording'],
            },
          });
          await assetLibrary.flush();
          entityChangeEmitter?.fire();
          return {
            entityId: imported.entity.id,
            variantId: imported.variant.id,
            fileId: imported.file.id,
            storedPath: imported.file.path,
          };
        },
      });
      return service.promote(input);
    }),
  );

  // Add to Timeline (neko-cut)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.addToTimeline', async (uri?: vscode.Uri) => {
      if (!uri) return;

      const mediaType = detectMediaType(uri.fsPath);
      if (mediaType !== 'video' && mediaType !== 'audio' && mediaType !== 'image') {
        void handleError(new Error('Only media files can be added to the timeline.'), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }

      try {
        await vscode.commands.executeCommand('neko.cut.addElement', {
          path: uri.fsPath,
          type: mediaType,
        });
      } catch {
        void handleError(new Error('Failed to add to timeline. Is neko-cut active?'), {
          showToUser: true,
        });
      }
    }),
  );

  // Add to Canvas (neko-canvas)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.addToCanvas', async (uri?: vscode.Uri) => {
      if (!uri) return;

      try {
        await vscode.commands.executeCommand('neko.canvas.addNode', {
          path: uri.fsPath,
          type: 'MediaNode',
        });
      } catch {
        void handleError(new Error('Failed to add to canvas. Is neko-canvas active?'), {
          showToUser: true,
        });
      }
    }),
  );

  // Import to Asset Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.importFile', async (uri?: vscode.Uri) => {
      if (!uri || !library) return;

      try {
        const dispatcher = createMediaImportDispatcher();
        const validation = dispatcher.validateFormat(uri.fsPath);
        if (validation.supported) {
          const workspaceFolderPaths = (vscode.workspace.workspaceFolders ?? []).map(
            (folder) => folder.uri.fsPath,
          );
          const owningWorkspaceRoot = findOwningWorkspaceRoot(
            uri,
            vscode.workspace.workspaceFolders ?? [],
          );
          await dispatcher.importFile({
            sourcePath: uri.fsPath,
            owningWorkspaceRoot,
            workspaceFolderPaths,
            pathVariables: mediaSettingsService
              ? await mediaSettingsService.getPathVariableMap()
              : undefined,
          });
          vscode.window.showInformationMessage(
            `Imported media asset: ${path.basename(uri.fsPath)}`,
          );
          return;
        }

        const result = await library.importFile(uri.fsPath);
        await library.flush();
        entityChangeEmitter?.fire();
        vscode.window.showInformationMessage(
          `Imported: ${result.entity.name} (${result.isNewEntity ? 'new entity' : 'existing entity'})`,
        );
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
    vscode.commands.registerCommand('neko.assets.validateAssetDependencies', async () => {
      if (!dependencyManifestService) {
        vscode.window.showWarningMessage('No workspace asset dependency manifest is available.');
        return;
      }
      const result = await dependencyManifestService.validate();
      if (result.issues.length === 0) {
        vscode.window.showInformationMessage('All project asset dependencies are recoverable.');
        return result;
      }

      const selected = await vscode.window.showQuickPick(
        result.issues.map((issue) => ({
          label: `$(${issue.code === 'missing-market-package' ? 'package' : 'warning'}) ${issue.code}`,
          description: issue.dependencyId,
          detail: issue.message,
          issue,
        })),
        {
          title: `Asset Dependency Recovery (${result.issues.length} issues)`,
          placeHolder: 'Select an issue to inspect',
        },
      );
      if (selected) {
        const target =
          selected.issue.packageId ?? selected.issue.path ?? selected.issue.dependencyId;
        await vscode.env.clipboard.writeText(target);
        vscode.window.showInformationMessage('Dependency recovery reference copied to clipboard.');
      }
      return result;
    }),
    vscode.commands.registerCommand('neko.assets.exportEntity', async (input?: unknown) =>
      exportNkEntity(input),
    ),
    vscode.commands.registerCommand('neko.assets.exportCharacterPack', async (input?: unknown) =>
      exportCharacterPack(input),
    ),
    vscode.commands.registerCommand('neko.entity.export', async (input?: unknown) =>
      exportNkEntity(input),
    ),
    vscode.commands.registerCommand('neko.entity.exportCharacterPack', async (input?: unknown) =>
      exportCharacterPack(input),
    ),
  );
}

function registerEntityBrowserCommands(
  context: vscode.ExtensionContext,
  entityBrowserProvider: EntityBrowserTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.entityBrowser.refresh', () => {
      entityBrowserProvider.refresh();
    }),
    vscode.commands.registerCommand('neko.entityBrowser.inspect', async (item?: unknown) => {
      if (item instanceof EntityBrowserEntityItem) {
        await entityBrowserProvider.inspect(item);
      }
    }),
    vscode.commands.registerCommand('neko.entityBrowser.rename', async (item?: unknown) => {
      if (!(item instanceof EntityBrowserEntityItem) || !item.item.entityRef) return;
      await vscode.commands.executeCommand(ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction, {
        context: {
          surface: 'treeview',
          projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        },
        action: 'rename-entity',
        entityRef: item.item.entityRef,
      });
      entityBrowserProvider.refresh();
    }),
    vscode.commands.registerCommand('neko.entityBrowser.editAppearance', async (item?: unknown) => {
      if (!(item instanceof EntityBrowserEntityItem) || !item.item.entityRef) return;
      await vscode.commands.executeCommand(ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction, {
        context: {
          surface: 'treeview',
          projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        },
        action: 'update-metadata',
        entityRef: item.item.entityRef,
      });
      entityBrowserProvider.refresh();
    }),
    vscode.commands.registerCommand('neko.entityBrowser.createCandidate', async () => {
      const name = await vscode.window.showInputBox({
        title: 'Create entity candidate',
        prompt: 'Enter the entity name.',
        validateInput: (value) => (value.trim().length > 0 ? undefined : 'Name is required.'),
      });
      if (!name) return;
      const kind = await pickCreativeEntityKind();
      if (!kind) return;
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const candidate = await vscode.commands.executeCommand<unknown>(
        ENTITY_FACADE_COMMANDS.proposeCandidate,
        {
          ...(projectRoot ? { projectRoot } : {}),
          candidate: {
            kind,
            name: name.trim(),
            provenance: [
              {
                providerId: 'neko-assets',
                sourceKind: 'asset',
                label: 'Entity Browser',
              },
            ],
          },
        },
      );
      entityBrowserProvider.refresh();
      if (candidate && typeof candidate === 'object' && 'id' in candidate) {
        vscode.window.showInformationMessage(`Created entity candidate: ${name.trim()}`);
      }
    }),
    vscode.commands.registerCommand(
      'neko.assets.inspectBoundCreativeEntity',
      async (item?: unknown) => {
        const assetRef = readAssetRefFromAssetItem(item);
        if (!assetRef) {
          vscode.window.showInformationMessage('No asset reference is available.');
          return;
        }
        const result = await vscode.commands.executeCommand<unknown>(
          ENTITY_FACADE_COMMANDS.findEntitiesByAsset,
          {
            projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            assetRef,
          },
        );
        if (!isEntityFacadeAssetReverseLookupResult(result) || result.entities.length === 0) {
          vscode.window.showInformationMessage('No bound creative entity is available.');
          return;
        }
        const selected =
          result.entities.length === 1
            ? result.entities[0]
            : await vscode.window
                .showQuickPick(
                  result.entities.map((entry) => ({
                    label: entry.label,
                    description: entry.role,
                    detail: entry.entityRef.entityId,
                    entry,
                  })),
                  { title: 'Inspect bound creative entity' },
                )
                .then((picked) => picked?.entry);
        if (!selected) return;
        await vscode.commands.executeCommand(ENTITY_FACADE_COMMANDS.inspectEntity, {
          projectRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          entityRef: selected.entityRef,
          context: { surface: 'assets', assetRef },
        });
      },
    ),
  );
}

async function pickCreativeEntityKind(): Promise<CreativeEntityKind | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'Character', kind: 'character' as const },
      { label: 'Location', kind: 'location' as const },
      { label: 'Object', kind: 'object' as const },
      { label: 'Scene', kind: 'scene' as const },
      { label: 'Style', kind: 'style' as const },
    ],
    {
      title: 'Entity kind',
      placeHolder: 'Select the kind for this candidate',
    },
  );
  return picked?.kind;
}

function readAssetRefFromAssetItem(item: unknown): string | undefined {
  if (item && typeof item === 'object' && 'entity' in item) {
    const entity = (item as { readonly entity?: { readonly id?: unknown } }).entity;
    return typeof entity?.id === 'string' ? `project://assets/${entity.id}` : undefined;
  }
  return undefined;
}

async function exportNkEntity(input: unknown): Promise<unknown> {
  if (!characterAssetExportService) {
    vscode.window.showWarningMessage('No workspace character asset export service is available.');
    return undefined;
  }

  try {
    const args = parseCharacterAssetExportArgs(input);
    const workspaceRoot = args.projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showWarningMessage('Open a workspace before exporting an entity.');
      return undefined;
    }
    const characterName = args.characterName ?? args.name ?? (await promptCharacterName());
    if (!args.entityId && !characterName) return undefined;

    const outputPath =
      args.outputPath ??
      (await promptSavePath(
        path.join(
          workspaceRoot,
          'neko',
          'exports',
          `${slugify(characterName ?? args.entityId ?? 'character')}.nkentity`,
        ),
        { 'Neko Entity': ['nkentity'] },
      ));
    if (!outputPath) return undefined;

    const result = await characterAssetExportService.exportEntity({
      projectRoot: workspaceRoot,
      outputPath,
      ...(args.entityId ? { entityId: args.entityId } : {}),
      ...(characterName ? { characterName } : {}),
      ...(args.name ? { name: args.name } : {}),
    });
    vscode.window.showInformationMessage(`Exported entity: ${result.outputPath}`);
    return result;
  } catch (error) {
    await handleError(error, { showToUser: true });
    return undefined;
  }
}

interface CharacterAssetExportCommandArgs {
  readonly projectRoot?: string;
  readonly entityId?: string;
  readonly characterName?: string;
  readonly outputPath?: string;
  readonly name?: string;
  readonly bundleId?: string;
  readonly version?: string;
}

function parseCharacterAssetExportArgs(input: unknown): CharacterAssetExportCommandArgs {
  if (!isRecord(input)) return {};
  const projectRoot = readStringField(input, 'projectRoot');
  const entityId = readStringField(input, 'entityId');
  const characterName = readStringField(input, 'characterName');
  const outputPath = readStringField(input, 'outputPath');
  const name = readStringField(input, 'name');
  const bundleId = readStringField(input, 'bundleId');
  const version = readStringField(input, 'version');
  return {
    ...(projectRoot ? { projectRoot } : {}),
    ...(entityId ? { entityId } : {}),
    ...(characterName ? { characterName } : {}),
    ...(outputPath ? { outputPath } : {}),
    ...(name ? { name } : {}),
    ...(bundleId ? { bundleId } : {}),
    ...(version ? { version } : {}),
  };
}

async function promptCharacterName(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Export Character Asset',
    prompt: 'Character name',
  });
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

async function promptSavePath(
  defaultPath: string,
  filters: Record<string, readonly string[]>,
): Promise<string | undefined> {
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultPath),
    filters,
  });
  return uri?.fsPath;
}

function readStringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'character'
  );
}

async function exportCharacterPack(input: unknown): Promise<unknown> {
  if (!characterAssetExportService) {
    vscode.window.showWarningMessage('No workspace character asset export service is available.');
    return undefined;
  }

  try {
    const args = parseCharacterAssetExportArgs(input);
    const workspaceRoot = args.projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showWarningMessage('Open a workspace before exporting a character pack.');
      return undefined;
    }
    const characterName = args.characterName ?? args.name ?? (await promptCharacterName());
    if (!args.entityId && !characterName) return undefined;

    const outputPath =
      args.outputPath ??
      (await promptSavePath(
        path.join(
          workspaceRoot,
          'neko',
          'exports',
          `${slugify(characterName ?? args.entityId ?? 'character')}-character-pack.zip`,
        ),
        { 'Character Pack': ['zip'] },
      ));
    if (!outputPath) return undefined;

    const result = await characterAssetExportService.exportCharacterPack({
      projectRoot: workspaceRoot,
      outputPath,
      ...(args.entityId ? { entityId: args.entityId } : {}),
      ...(characterName ? { characterName } : {}),
      ...(args.name ? { name: args.name } : {}),
      ...(args.bundleId ? { bundleId: args.bundleId } : {}),
      ...(args.version ? { version: args.version } : {}),
    });
    vscode.window.showInformationMessage(`Exported character pack: ${result.outputPath}`);
    return result;
  } catch (error) {
    await handleError(error, { showToUser: true });
    return undefined;
  }
}

function createMediaImportDispatcher(): MediaImportDispatcher {
  return new MediaImportDispatcher({
    fs: {
      readFile: async (filePath) => vscode.workspace.fs.readFile(vscode.Uri.file(filePath)),
      writeFile: async (filePath, data) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), data),
      createDirectory: async (dirPath) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
      exists: async (filePath) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
          return true;
        } catch {
          return false;
        }
      },
    },
    commands: {
      executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
    },
    assetRegistrar: {
      registerImportedAsset: registerImportedAssetDescriptor,
    },
  });
}

function findOwningWorkspaceRoot(
  uri: vscode.Uri,
  workspaceFolders: readonly vscode.WorkspaceFolder[],
): string | undefined {
  if (uri.scheme !== 'file') return workspaceFolders[0]?.uri.fsPath;
  return workspaceFolders
    .map((folder) => folder.uri.fsPath)
    .filter((root) => isPathInsideOrEqual(uri.fsPath, root))
    .sort((left, right) => right.length - left.length)[0];
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function createAssetsWorkspaceMediaPathContext(
  commandContext: AssetWorkspacePathCommandContext,
): Promise<WorkspaceMediaPathContext> {
  const sourceDocumentUri = readCommandContextDocumentUri(commandContext);
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const pathVariables = mediaSettingsService
    ? await mediaSettingsService.getPathVariableMap()
    : new Map<string, string>();
  if (commandContext.owningWorkspaceRoot) {
    pathVariables.set('WORKSPACE', commandContext.owningWorkspaceRoot);
    pathVariables.set('PROJECT', commandContext.owningWorkspaceRoot);
  }
  const workspaceRoots =
    commandContext.workspaceRoots ?? workspaceFolders.map((folder) => folder.uri.fsPath);
  const allowedRoots = commandContext.allowedRoots ?? [
    ...workspaceRoots,
    ...[...pathVariables.entries()]
      .filter(([variable]) => variable !== 'WORKSPACE' && variable !== 'PROJECT')
      .map(([, root]) => root),
  ];

  return {
    ...createVSCodeWorkspaceMediaPathContext({
      documentUri: sourceDocumentUri,
      workspaceFolders,
      pathVariables,
      allowedRoots,
    }),
    ...(commandContext.documentPath
      ? { documentDir: path.dirname(commandContext.documentPath) }
      : {}),
    ...(commandContext.owningWorkspaceRoot
      ? {
          owningWorkspaceRoot: commandContext.owningWorkspaceRoot,
          pathVariables,
        }
      : {}),
    workspaceRoots,
    allowedRoots,
  };
}

function readCommandContextDocumentUri(
  commandContext: AssetWorkspacePathCommandContext,
): vscode.Uri | undefined {
  if (commandContext.sourceDocumentUri) {
    try {
      return vscode.Uri.parse(commandContext.sourceDocumentUri);
    } catch {
      // Fall through to documentPath.
    }
  }
  return commandContext.documentPath ? vscode.Uri.file(commandContext.documentPath) : undefined;
}

function isExistingLocalFile(filePath: string): boolean {
  try {
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isAuthorizedLocalPath(
  filePath: string,
  allowedRoots: readonly string[] | undefined,
): boolean {
  if (!allowedRoots || allowedRoots.length === 0) return true;
  return allowedRoots.some((root) => isPathInsideOrEqual(filePath, root));
}

async function registerImportedAssetDescriptor(descriptor: ImportedAssetDescriptor): Promise<void> {
  if (!library || !descriptor.path) return;
  const category =
    descriptor.mediaKind.startsWith('puppet-') || descriptor.mediaKind.startsWith('model-')
      ? 'character'
      : 'object';
  const durableProjectRef =
    typeof descriptor.metadata?.['durableProjectRef'] === 'string'
      ? descriptor.metadata['durableProjectRef']
      : descriptor.path;
  await library.importFile(descriptor.path, {
    entityInput: {
      name: path.basename(descriptor.path).replace(/\.[^.]+$/i, ''),
      category,
      tags: [descriptor.mediaKind, descriptor.dimension],
    },
    variantInput: {
      name: descriptor.dimension,
      tags: [descriptor.storageMode],
    },
    fileOptions: {
      purpose: descriptor.dimension === 'model' ? 'main' : 'source',
      characterAsset: {
        assetDimension: descriptor.dimension,
        mediaKind: descriptor.mediaKind,
        storageMode: descriptor.storageMode,
        ...(descriptor.locator ? { bundleLocator: descriptor.locator } : {}),
        sourceOrigin: durableProjectRef,
        ...(descriptor.sourceHash ? { sourceHash: descriptor.sourceHash } : {}),
      },
    },
  });
  await library.flush();
  await registerProjectAssetDependency(descriptor);
  entityChangeEmitter?.fire();
}

async function registerProjectAssetDependency(descriptor: ImportedAssetDescriptor): Promise<void> {
  if (!dependencyManifestService || !descriptor.path) return;
  const originalSourcePath =
    typeof descriptor.metadata?.['originalSourcePath'] === 'string'
      ? descriptor.metadata['originalSourcePath']
      : descriptor.path;
  const importDestination =
    typeof descriptor.metadata?.['importDestination'] === 'string'
      ? descriptor.metadata['importDestination']
      : descriptor.storageMode === 'disk'
        ? descriptor.path
        : undefined;
  const files = Array.isArray(descriptor.metadata?.['files'])
    ? descriptor.metadata['files'].filter((entry): entry is string => typeof entry === 'string')
    : undefined;

  await dependencyManifestService.upsert(
    dependencyManifestService.createImportDependency({
      id: `${descriptor.mediaKind}:${descriptor.dimension}:${descriptor.path}`,
      originalFile: originalSourcePath,
      mediaKind: descriptor.mediaKind,
      dimensions: [descriptor.dimension],
      storageMode: descriptor.storageMode,
      ...(descriptor.sourceHash ? { contentHash: descriptor.sourceHash } : {}),
      ...(importDestination ? { importDestination } : {}),
      ...(files ? { files } : {}),
    }),
  );
}

// =============================================================================
// Media Library Commands (P1)
// =============================================================================

/**
 * Derive a UPPER_SNAKE_CASE variable name from a human-readable library name.
 * Strips non-ASCII characters, normalizes spaces, uppercases, and snake-cases.
 * Falls back to "MEDIA_LIB" if the result would be empty.
 */
function suggestVariableName(name: string): string {
  const snake = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ') // remove non-ASCII / special chars
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_') // collapse spaces to underscore
    .replace(/^[0-9]/, 'LIB_$&'); // must start with a letter
  return snake || 'MEDIA_LIB';
}

function registerMediaLibraryCommands(
  context: vscode.ExtensionContext,
  settingsService: MediaLibrarySettingsService,
  mediaLibraryProvider: MediaLibraryTreeProvider,
  mediaLibraryTree: vscode.TreeView<MediaLibraryItem>,
): void {
  const { t } = require('./i18n');

  // Add Media Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.addMediaLibrary', async () => {
      const dirUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: t('mediaLibrary.add.title'),
      });
      if (!dirUri?.[0]) return;

      const name = await vscode.window.showInputBox({
        prompt: t('mediaLibrary.add.namePrompt'),
        placeHolder: t('mediaLibrary.add.namePlaceholder'),
        title: t('mediaLibrary.add.title'),
      });
      if (!name) return;

      const suggestedVar = suggestVariableName(name);
      const variable = await vscode.window.showInputBox({
        prompt: t('mediaLibrary.add.variablePrompt'),
        placeHolder: t('mediaLibrary.add.variablePlaceholder'),
        title: t('mediaLibrary.add.title'),
        value: suggestedVar,
        valueSelection: [0, suggestedVar.length],
        validateInput: (v) => {
          if (!/^[A-Z_][A-Z0-9_]*$/.test(v)) {
            return t('mediaLibrary.add.variableError');
          }
          return undefined;
        },
      });
      if (!variable) return;

      try {
        await settingsService.addLibrary({
          name,
          path: dirUri[0].fsPath,
          variable,
        });
        vscode.window.showInformationMessage(t('mediaLibrary.add.success', { name }));
      } catch (error) {
        void handleError(error instanceof Error ? error : new Error(String(error)), {
          showToUser: true,
        });
      }
    }),
  );

  // Remove Media Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.removeMediaLibrary', async (item?: unknown) => {
      // Get variable from tree item context or show picker
      let variable: string | undefined;
      if (item && typeof item === 'object' && 'library' in item) {
        variable = (item as { library: { variable: string } }).library.variable;
      } else {
        const libraries = await settingsService.getResolvedLibraries();
        const picked = await vscode.window.showQuickPick(
          libraries.map((l) => ({
            label: l.name,
            description: `\${${l.variable}}`,
            variable: l.variable,
          })),
          { title: t('mediaLibrary.remove.selectTitle') },
        );
        variable = picked?.variable;
      }
      if (!variable) return;

      await settingsService.removeLibrary(variable);
      vscode.window.showInformationMessage(t('mediaLibrary.remove.success'));
    }),
  );

  // Set Local Override
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.setLocalOverride', async (item?: unknown) => {
      let variable: string | undefined;
      if (item && typeof item === 'object' && 'library' in item) {
        variable = (item as { library: { variable: string } }).library.variable;
      } else {
        const libraries = await settingsService.getResolvedLibraries();
        const picked = await vscode.window.showQuickPick(
          libraries.map((l) => ({
            label: l.name,
            description: `\${${l.variable}}`,
            variable: l.variable,
          })),
          { title: t('mediaLibrary.override.selectTitle') },
        );
        variable = picked?.variable;
      }
      if (!variable) return;

      const dirUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: t('mediaLibrary.override.dialogTitle').replace('${variable}', variable),
      });
      if (!dirUri?.[0]) return;

      await settingsService.setLocalOverride(variable, dirUri[0].fsPath);
      vscode.window.showInformationMessage(
        t('mediaLibrary.override.success').replace('${variable}', variable),
      );
    }),
  );

  // Import from Library (context menu on media library files)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.importFromLibrary',
      async (item?: unknown, selectedItems?: unknown[]) => {
        if (!library) return;

        // Extract MediaFileItem objects from selection
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        try {
          const results: string[] = [];
          for (const fileItem of items) {
            const result = await library.importFile(fileItem.filePath, { autoClassify: true });
            results.push(result.entity.name);
          }
          await library.flush();
          entityChangeEmitter?.fire();

          if (results.length === 1) {
            vscode.window.showInformationMessage(
              t('mediaLibrary.import.success', { name: results[0] }),
            );
          } else {
            vscode.window.showInformationMessage(
              t('mediaLibrary.import.successMultiple', { count: results.length }),
            );
          }
          vscode.commands.executeCommand('neko.assets.refreshViews');
        } catch (error) {
          await handleError(error, { showToUser: true });
        }
      },
    ),
  );

  // Reveal File in OS
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.revealFileInOS', async (item?: unknown) => {
      const items = getMediaFileItems(item, undefined);
      if (items.length === 0) return;
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(items[0].filePath));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.revealMediaLibraryFile',
      async (filePath?: unknown) => {
        if (typeof filePath !== 'string' || filePath.trim().length === 0) {
          vscode.window.showWarningMessage('Media library file path is required.');
          return;
        }
        const item = mediaLibraryProvider.getMediaFileTreeItem(filePath.trim());
        await mediaLibraryTree.reveal(item, { focus: true, select: true, expand: true });
      },
    ),
  );

  // Copy File Path
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.copyFilePath', async (item?: unknown) => {
      const items = getMediaFileItems(item, undefined);
      if (items.length === 0) return;
      await vscode.env.clipboard.writeText(items[0].filePath);
      vscode.window.showInformationMessage(t('mediaLibrary.copyPath.success'));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.copyFileReference', async (item?: unknown) => {
      const items = getMediaFileItems(item, undefined);
      if (items.length === 0) return;
      const filePath = items[0].filePath;
      const portablePath = library?.contractPath(filePath) ?? filePath;
      const mediaType = detectMediaType(filePath);
      await vscode.env.clipboard.writeText(
        JSON.stringify(
          {
            kind: 'media-library-file-reference',
            path: portablePath,
            resolvedPath: filePath,
            name: path.basename(filePath),
            mediaType,
            source: {
              partition: 'media-library',
            },
          },
          null,
          2,
        ),
      );
      vscode.window.showInformationMessage('Media library file reference copied to clipboard.');
    }),
  );

  // Preview Media Library File
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.previewMediaLibraryFile',
      async (item?: unknown) => {
        const items = getMediaFileItems(item, undefined);
        if (items.length === 0) return;

        const filePath = items[0].filePath;
        await openAssetPreview(vscode.Uri.file(filePath));
      },
    ),
  );

  // Add to Timeline from Library
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.addToTimelineFromLibrary',
      async (item?: unknown, selectedItems?: unknown[]) => {
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        for (const fileItem of items) {
          await vscode.commands.executeCommand(
            'neko.assets.addToTimeline',
            vscode.Uri.file(fileItem.filePath),
          );
        }
      },
    ),
  );

  // Add to Canvas from Library
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.addToCanvasFromLibrary',
      async (item?: unknown, selectedItems?: unknown[]) => {
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        for (const fileItem of items) {
          await vscode.commands.executeCommand(
            'neko.assets.addToCanvas',
            vscode.Uri.file(fileItem.filePath),
          );
        }
      },
    ),
  );

  // Add to Agent from Library — delegates to neko-agent via cross-extension command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.addToAgent',
      async (item?: unknown, selectedItems?: unknown[]) => {
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        for (const fileItem of items) {
          await vscode.commands.executeCommand(
            'neko.agent.addToContext',
            vscode.Uri.file(fileItem.filePath),
          );
        }
      },
    ),
  );

  // Refresh Media Libraries
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.refreshMediaLibraries', () => {
      vscode.commands.executeCommand('neko.assets.refreshViews');
    }),
  );
}

/**
 * Extract MediaFileItem objects from tree selection.
 * Handles both single-click (item) and multi-select (selectedItems).
 */
function getMediaFileItems(item: unknown, selectedItems?: unknown[]): Array<{ filePath: string }> {
  const items: Array<{ filePath: string }> = [];

  // Multi-select takes priority
  if (selectedItems && selectedItems.length > 0) {
    for (const selected of selectedItems) {
      if (selected && typeof selected === 'object' && 'filePath' in selected) {
        items.push(selected as { filePath: string });
      }
    }
  } else if (item && typeof item === 'object' && 'filePath' in item) {
    items.push(item as { filePath: string });
  }

  return items;
}

// =============================================================================
// Search Command
// =============================================================================

interface MediaSearchQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
  mediaType: string;
}

interface QueryMediaLibraryCommandInput {
  readonly keyword?: unknown;
  readonly limit?: unknown;
  readonly types?: unknown;
}

function isAssetMediaType(value: unknown): value is import('@neko/shared').AssetMediaType {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function registerSearchCommand(
  context: vscode.ExtensionContext,
  searchService: MediaLibrarySearchService,
): void {
  const { t } = require('./i18n');

  // Type filter labels and their AssetMediaType values
  const TYPE_FILTERS: Array<{ label: string; types: import('@neko/shared').AssetMediaType[] }> = [
    { label: '$(filter) All', types: [] },
    { label: '$(file-media) Video', types: ['video'] },
    { label: '$(unmute) Audio', types: ['audio'] },
    { label: '$(file) Image', types: ['image'] },
    { label: '$(file-text) Document', types: ['document', 'text'] },
  ];

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.queryMediaLibrary',
      async (input?: QueryMediaLibraryCommandInput) => {
        const keyword = typeof input?.keyword === 'string' ? input.keyword : '';
        const limit =
          typeof input?.limit === 'number' && Number.isFinite(input.limit)
            ? Math.max(1, Math.floor(input.limit))
            : undefined;
        const types = Array.isArray(input?.types)
          ? input.types.filter((type): type is import('@neko/shared').AssetMediaType =>
              isAssetMediaType(type),
            )
          : undefined;
        return searchService.search(keyword, {
          ...(limit !== undefined ? { limit } : {}),
          ...(types && types.length > 0 ? { types } : {}),
        });
      },
    ),
    vscode.commands.registerCommand('neko.assets.searchMediaLibrary', () => {
      const quickPick = vscode.window.createQuickPick<MediaSearchQuickPickItem>();
      quickPick.placeholder = t('mediaLibrary.search.placeholder');
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      // Type filter state — buttons in the QuickPick title bar
      let activeFilterIndex = 0;
      quickPick.buttons = TYPE_FILTERS.map((f, i) => ({
        iconPath:
          i === activeFilterIndex
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline'),
        tooltip: f.label,
      }));

      const getActiveTypes = () => TYPE_FILTERS[activeFilterIndex]?.types ?? [];

      let searchTimer: ReturnType<typeof setTimeout> | undefined;
      let lastQuery = '';

      const doSearch = async (value: string) => {
        if (value.length < 2) {
          quickPick.items = [];
          return;
        }
        quickPick.busy = true;
        try {
          const activeTypes = getActiveTypes();
          const results = await searchService.search(value, {
            types: activeTypes.length > 0 ? activeTypes : undefined,
          });

          quickPick.items = results.map((r) => {
            const iconMap: Record<string, string> = {
              video: 'file-media',
              audio: 'unmute',
              image: 'file',
              document: 'file-text',
            };
            const icon = iconMap[r.mediaType] ?? 'file';

            let detail: string | undefined;
            if (r.metadata) {
              const parts: string[] = [];
              if (r.metadata.width && r.metadata.height) {
                parts.push(`${r.metadata.width}×${r.metadata.height}`);
              }
              if (r.metadata.duration) {
                const d = r.metadata.duration;
                const m = Math.floor(d / 60);
                const s = Math.round(d % 60);
                parts.push(`${m}:${s.toString().padStart(2, '0')}`);
              }
              if (r.metadata.fileSize > 0) {
                const mb = r.metadata.fileSize / (1024 * 1024);
                parts.push(
                  mb >= 1 ? `${mb.toFixed(1)} MB` : `${(r.metadata.fileSize / 1024).toFixed(0)} KB`,
                );
              }
              if (parts.length > 0) detail = parts.join('  ·  ');
            }

            return {
              label: `$(${icon}) ${r.fileName}`,
              description: r.libraryName,
              detail,
              filePath: r.filePath,
              mediaType: r.mediaType,
            };
          });
          if (results.length === 0) {
            quickPick.items = [
              {
                label: t('mediaLibrary.search.noResults'),
                filePath: '',
                mediaType: '',
              },
            ];
          }
        } catch {
          // Search failed silently
        } finally {
          quickPick.busy = false;
        }
      };

      quickPick.onDidChangeValue((value) => {
        lastQuery = value;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => void doSearch(value), 200);
      });

      quickPick.onDidTriggerButton((button) => {
        const idx = quickPick.buttons.indexOf(button);
        if (idx >= 0 && idx !== activeFilterIndex) {
          activeFilterIndex = idx;
          quickPick.buttons = TYPE_FILTERS.map((f, i) => ({
            iconPath:
              i === activeFilterIndex
                ? new vscode.ThemeIcon('check')
                : new vscode.ThemeIcon('circle-outline'),
            tooltip: f.label,
          }));
          // Re-search with new filter
          if (lastQuery.length >= 2) {
            void doSearch(lastQuery);
          }
        }
      });

      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (!selected || !selected.filePath) return;

        const uri = vscode.Uri.file(selected.filePath);
        if (selected.mediaType === 'video') {
          vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (selected.mediaType === 'audio') {
          vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        } else {
          vscode.commands.executeCommand('vscode.open', uri);
        }

        quickPick.dispose();
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    }),
  );
}

function registerBaselineCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.viewHistory', () => {
      vscode.commands.executeCommand('neko.assetHistory.focus');
    }),
    // Preview media files with neko-preview
    vscode.commands.registerCommand('neko.assets.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) {
        const fileUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          filters: {
            'Preview Files': [
              'mp4',
              'mov',
              'avi',
              'mkv',
              'webm',
              'm4v',
              'ts',
              'flv',
              'wmv',
              'mp3',
              'wav',
              'ogg',
              'flac',
              'aac',
              'm4a',
              'wma',
              'opus',
              'pdf',
              'epub',
              'cbz',
              'cbr',
              'docx',
              'doc',
            ],
          },
        });
        if (!fileUri?.[0]) return;
        uri = fileUri[0];
      }

      try {
        await openAssetPreview(uri);
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );
}

// =============================================================================
// Internal API Commands (cross-extension access)
// =============================================================================

function registerInternalCommands(context: vscode.ExtensionContext): void {
  // Compare two variants (used by neko-cut DiffViewer)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.compareVariants',
      async (entityId: string, variantIdA: string, variantIdB: string) => {
        if (!diffService) return null;
        try {
          return await diffService.compareVariants(entityId, variantIdA, variantIdB);
        } catch (error) {
          logger.error('compareVariants failed:', error);
          return null;
        }
      },
    ),
  );

  // Compare two files/paths (general diff)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.compare',
      async (request: import('@neko/shared').AssetDiffRequest) => {
        if (!diffService) return null;
        try {
          return await diffService.compare(request);
        } catch (error) {
          logger.error('compare failed:', error);
          return null;
        }
      },
    ),
  );

  // Get version history for a file
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.getVersionHistory', async (filePath: string) => {
      if (!diffService) return [];
      try {
        return await diffService.getVersionHistory(filePath);
      } catch (error) {
        logger.error('getVersionHistory failed:', error);
        return [];
      }
    }),
  );

  // Compare with Git version
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.compareWithGit',
      async (filePath: string, ref?: string) => {
        if (!diffService) return null;
        try {
          return await diffService.compareWithGit(filePath, ref);
        } catch (error) {
          logger.error('compareWithGit failed:', error);
          return null;
        }
      },
    ),
  );

  // Generate thumbnail for a file (used by other extensions)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.generateThumbnail', async (filePath: string) => {
      if (!thumbnailService) return null;
      try {
        return await thumbnailService.generate(filePath);
      } catch (error) {
        logger.error('generateThumbnail failed:', error);
        return null;
      }
    }),
  );

  // Get cached thumbnail path for a file
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.getThumbnailPath', async (filePath: string) => {
      if (!thumbnailService) return null;
      try {
        return await thumbnailService.getCached(filePath);
      } catch (error) {
        logger.error('getThumbnailPath failed:', error);
        return null;
      }
    }),
  );

  // Contract absolute path → portable path (${VAR}/rest or relative)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.contractPath',
      async (absolutePath: string, commandContext?: AssetWorkspacePathCommandContext) => {
        if (commandContext) {
          const pathContext = await createAssetsWorkspaceMediaPathContext(commandContext);
          const contracted = contractWorkspaceMediaPath(absolutePath, pathContext);
          if (
            contracted.format === 'workspace-relative' ||
            contracted.format === 'variable' ||
            contracted.format === 'remote-url'
          ) {
            return contracted.path;
          }
        }
        if (!library) return absolutePath;
        return library.contractPath(absolutePath);
      },
    ),
  );

  // Resolve portable path → absolute path
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.resolvePath',
      async (storedPath: string, commandContext?: AssetWorkspacePathCommandContext) => {
        if (commandContext) {
          const pathContext = await createAssetsWorkspaceMediaPathContext(commandContext);
          const resolved = resolveWorkspaceMediaPath({
            source: storedPath,
            context: pathContext,
            fileExists: isExistingLocalFile,
            isPathAuthorized: (filePath) =>
              isAuthorizedLocalPath(filePath, pathContext.allowedRoots),
          });
          if (resolved.status === 'resolved-local') return resolved.path;
          if (resolved.status === 'remote') return resolved.url;
        }
        if (!library) return storedPath;
        return library.resolvePath(storedPath);
      },
    ),
  );
}

// =============================================================================
// Deactivation
// =============================================================================

export async function deactivate(): Promise<void> {
  try {
    if (runningTasks.size > 0) {
      await Promise.allSettled([...runningTasks]);
      runningTasks.clear();
    }
    await library?.flush();
  } catch (error) {
    logger.error('Failed to flush library on deactivate:', error);
  } finally {
    dependencyManifestService = null;
    characterAssetExportService = null;
    diffService = null;
    thumbnailService = null;
    mediaSettingsService = null;
    healthMonitor = null;
    entityChangeEmitter = null;
    library = null;
  }
}
