/**
 * Neko Assets Extension
 *
 * VSCode extension entry point for Media Library and Creative Entity surfaces.
 *
 * Responsibilities:
 * - Connect engine probeMedia for rich metadata extraction
 * - Register context menu commands (add to timeline/canvas)
 * - Register linked Media Library and preview commands
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { createNodeDocumentLowLevelAccess } from '@neko/content/document/node';
import {
  ENTITY_FACADE_COMMANDS,
  detectMediaType,
  PathResolver,
  type CreativeEntityKind,
  type ResourceVariantRequest,
  validateWorkspaceLinkedMediaLibraryName,
} from '@neko/shared';
import {
  createNodeWorkspaceEntityAssetMetadataBinding,
  createNodeWorkspaceMediaMetadataBinding,
  createNodeWorkspaceSearchMetadataBinding,
} from '@neko/shared/local-metadata/node';
import {
  EntityInspectorProvider,
  VSCodeEntityRuntimeRegistry,
  registerEntityFacadeCommands,
} from '@neko/entity/host-vscode';
import { createEngineMetadataExtractor } from './services/EngineMetadataExtractor';
import { AssetsThumbnailGenerator, ThumbnailService } from './services/ThumbnailService';
import { MediaMetadataCache } from './services/MediaMetadataCache';
import {
  createLocalMetadataMediaLibrarySearchIndexStore,
  MediaLibrarySearchService,
} from './services/MediaLibrarySearchService';
import { WorkspaceLinkedMediaLibraryService } from './services/WorkspaceLinkedMediaLibraryService';
import { WorkspaceLinkedMediaLibraryGitCompatibilityService } from './services/WorkspaceLinkedMediaLibraryGitCompatibilityService';
import {
  EntityBrowserEntityItem,
  EntityBrowserTreeProvider,
} from './providers/EntityBrowserTreeProvider';
import {
  MediaLibraryTreeProvider,
  type MediaLibraryItem,
} from './providers/MediaLibraryTreeProvider';
import {
  createVSCodeLogger,
  createNodeHostContentReadService,
  createHostDerivedContentRuntime,
  NodeAuthorizedWorkspaceDeleter,
  NodeAuthorizedWorkspaceWriter,
  NodeWorkspaceContentReadHandler,
  registerOptionalAgentCapabilityProvider,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { setRootLogger, getLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';
import { openAssetPreview } from './utils/preview';
import { SemanticSourceDiscoveryService } from './services/SemanticSourceDiscoveryService';
import { createMediaLibraryAgentCapabilityRuntime } from './services/MediaLibraryAgentCapability';
import { MediaLibraryDeleteService } from './services/MediaLibraryDeleteService';
import { createCreativeEntityHeadlessCapabilityProvider } from '@neko/entity';
import type { ContentLocator, ContentReadService } from '@neko/shared';
import { isContentLocator } from '@neko/shared';
import { MediaLibraryCopyService } from './services/MediaLibraryCopyService';

const logger = getLogger('Extension');

function withWorkspacePathVariable(workspaceRoot: string): Map<string, string> {
  const result = new Map<string, string>();
  result.set('WORKSPACE', workspaceRoot);
  result.set('PROJECT', workspaceRoot);
  return result;
}

function createWorkspaceContentReadService(workspaceRoot: string): ContentReadService {
  const documentAccess = createNodeDocumentLowLevelAccess();
  return createNodeHostContentReadService({
    workspaceRoot,
    documentEntryReader: {
      readEntry: (sourcePath, entryPath) => documentAccess.readEntry(sourcePath, entryPath),
    },
  });
}

// =============================================================================
// Extension State
// =============================================================================

let thumbnailService: ThumbnailService | null = null;
const runningTasks = new Set<Promise<void>>();

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
// Activation
// =============================================================================

export async function activate(
  context: vscode.ExtensionContext,
): Promise<import('@neko/shared').NekoMediaRepresentationAPI> {
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

  // Create metadata extractor for the Media Library projection.
  const metadataExtractor = createEngineMetadataExtractor();

  // 1. Initialize Creative Entity runtime and local projections.
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceRoot = workspaceFolder?.uri.fsPath;
  const workspaceContentRead = workspaceRoot
    ? createWorkspaceContentReadService(workspaceRoot)
    : undefined;
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
    resolveContentRead: (projectRoot) =>
      workspaceContentRead &&
      workspaceRoot &&
      path.resolve(projectRoot) === path.resolve(workspaceRoot)
        ? workspaceContentRead
        : undefined,
    resolveProjection: (projectRoot) =>
      entityMetadata && workspaceRoot && path.resolve(projectRoot) === path.resolve(workspaceRoot)
        ? {
            repository: entityMetadata.repository,
            partition: entityMetadata.partition,
            markStale: (diagnostic, updatedAt) => entityMetadata.markStale(diagnostic, updatedAt),
          }
        : undefined,
  });
  const entityInspectorProvider = new EntityInspectorProvider({
    logger: rootLogger,
    subscribeEntityChanges: (projectRoot, listener) =>
      entityRuntimeRegistry.get(projectRoot).onDidChangeEntity(listener),
  });
  context.subscriptions.push(
    entityRuntimeRegistry,
    entityInspectorProvider,
    registerEntityFacadeCommands({ logger: rootLogger, runtimeRegistry: entityRuntimeRegistry }),
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
    const derivedRuntime = await createHostDerivedContentRuntime({
      target: { kind: 'workspace', workspaceRoot, homedir: os.homedir() },
      representationGenerators: [new AssetsThumbnailGenerator(workspaceRoot)],
      logger: rootLogger,
    });
    thumbnailService = new ThumbnailService(workspaceRoot, derivedRuntime.contentRepresentation);
    context.subscriptions.push(thumbnailService);
    context.subscriptions.push({
      dispose: () => {
        void derivedRuntime
          .dispose()
          .catch((error) => logger.warn('Failed to dispose derived content runtime', { error }));
      },
    });
  }

  // 2. Register the Creative Entity browser. Media Library is registered below
  // from filesystem-derived linked roots and is the only file-resource tree.
  const entityBrowserProvider = new EntityBrowserTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('neko.entityBrowser', {
      treeDataProvider: entityBrowserProvider,
      showCollapseAll: true,
    }),
    entityBrowserProvider,
    vscode.commands.registerCommand('neko.assets.refreshViews', () => {
      entityBrowserProvider.refresh();
    }),
  );
  registerEntityBrowserCommands(context, entityBrowserProvider);

  // 4. Initialize workspace-linked media libraries
  if (workspaceFolder && workspaceRoot && thumbnailService && workspaceContentRead) {
    const linkedLibraryService = new WorkspaceLinkedMediaLibraryService(workspaceRoot);
    const gitCompatibility = new WorkspaceLinkedMediaLibraryGitCompatibilityService(
      workspaceFolder,
      context.workspaceState,
    );
    context.subscriptions.push(linkedLibraryService);
    trackExtensionTask(
      'Reconcile linked media library Git compatibility',
      linkedLibraryService.list().then(async (libraries) => {
        await gitCompatibility.reconcile(libraries.length > 0);
      }),
    );

    const semanticSourceService = new SemanticSourceDiscoveryService({
      workspaceRoot,
      libraryService: linkedLibraryService,
      entityService: entityRuntimeRegistry.get(workspaceRoot).service,
      homedir: os.homedir(),
    });
    await semanticSourceService.start();
    context.subscriptions.push(
      semanticSourceService,
      vscode.languages.registerDocumentSymbolProvider([{ scheme: 'file' }], semanticSourceService),
      vscode.commands.registerCommand('neko.assets.refreshSemanticSources', () =>
        semanticSourceService.refresh(),
      ),
      vscode.commands.registerCommand('neko.assets.listSemanticCandidateReviews', () =>
        semanticSourceService.listCandidateReviews(),
      ),
      vscode.commands.registerCommand(
        'neko.assets.saveSemanticCandidateForReview',
        (candidateId: string) => semanticSourceService.saveCandidateForReview(candidateId),
      ),
      vscode.commands.registerCommand(
        'neko.assets.dismissSemanticCandidate',
        (candidateId: string) => semanticSourceService.dismissCandidate(candidateId),
      ),
      vscode.commands.registerCommand(
        'neko.assets.promoteSemanticCandidate',
        (candidateId: string) => semanticSourceService.promoteCandidate(candidateId),
      ),
      vscode.commands.registerCommand(
        'neko.assets.rejectSemanticCandidate',
        (candidateId: string) => semanticSourceService.rejectCandidate(candidateId),
      ),
      vscode.commands.registerCommand(
        'neko.assets.mergeSemanticCandidate',
        (candidateId: string, entityId: string, asAlias?: boolean) =>
          semanticSourceService.mergeCandidate(candidateId, entityId, asAlias),
      ),
    );

    // Initialize PathResolver for portable cache keys
    const initialMetadataPathVariables = withWorkspacePathVariable(workspaceRoot);
    const cachePathResolver = new PathResolver(initialMetadataPathVariables);

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
      readRevision: () => searchMetadataBinding.readSearchRevision(),
    });
    const searchService = new MediaLibrarySearchService(
      linkedLibraryService,
      workspaceRoot,
      metadataCache,
      searchIndexStore,
      {
        load: async () =>
          context.workspaceState.get<readonly string[]>('neko.mediaLibrary.recentLocators') ?? [],
        save: async (paths) =>
          context.workspaceState.update('neko.mediaLibrary.recentLocators', paths),
      },
    );
    context.subscriptions.push(searchService);
    trackExtensionTask('Media library search warmup', searchService.warmup());

    // Register Media Library TreeView
    const mediaLibraryProvider = new MediaLibraryTreeProvider({
      libraryService: linkedLibraryService,
      thumbnailService,
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
    registerMediaLibraryCommands(
      context,
      linkedLibraryService,
      mediaLibraryProvider,
      mediaLibraryTree,
      gitCompatibility,
      workspaceContentRead,
    );

    // Register search command
    registerSearchCommand(context, searchService, workspaceRoot);

    const mediaLibraryAgentCapability = createMediaLibraryAgentCapabilityRuntime({
      searchService,
      projectRoot: workspaceRoot,
    });
    context.subscriptions.push(mediaLibraryAgentCapability);
    trackExtensionTask(
      'Register Media Library Agent capability',
      registerOptionalAgentCapabilityProvider(mediaLibraryAgentCapability.provider),
    );
    trackExtensionTask(
      'Register Creative Entity Agent capability',
      registerOptionalAgentCapabilityProvider(
        createCreativeEntityHeadlessCapabilityProvider(
          entityRuntimeRegistry.get(workspaceRoot).service,
        ),
      ),
    );
  }

  // 5. Register direct media file actions
  registerAssetCommands(context);

  // 6. Register baseline preview commands
  registerBaselineCommands(context);

  const api: import('@neko/shared').NekoMediaRepresentationAPI = {
    generateThumbnail: async (
      filePath,
      variant: ResourceVariantRequest = { role: 'thumbnail', width: 256, height: 256 },
    ) => {
      if (!thumbnailService) return undefined;
      const generated = await thumbnailService.generate(filePath, {
        maxWidth: variant.width,
        maxHeight: variant.height,
      });
      if (!generated) return undefined;
      return {
        bytes: generated.bytes,
        width: generated.width,
        height: generated.height,
        mimeType: generated.mimeType,
      };
    },
  };

  logger.info('Extension activated, API exported');
  return api;
}

// =============================================================================
// Asset Action Commands
// =============================================================================

function registerAssetCommands(context: vscode.ExtensionContext): void {
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
                sourceKind: 'entity-browser',
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

// =============================================================================
// Media Library Commands (P1)
// =============================================================================

function registerMediaLibraryCommands(
  context: vscode.ExtensionContext,
  linkedLibraryService: WorkspaceLinkedMediaLibraryService,
  mediaLibraryProvider: MediaLibraryTreeProvider,
  mediaLibraryTree: vscode.TreeView<MediaLibraryItem>,
  gitCompatibility: WorkspaceLinkedMediaLibraryGitCompatibilityService,
  contentRead: ContentReadService,
): void {
  const { t } = require('./i18n');
  const workspaceReader = new NodeWorkspaceContentReadHandler({
    workspaceRoot: linkedLibraryService.workspaceRoot,
  });
  const deleteService = new MediaLibraryDeleteService(
    linkedLibraryService,
    new NodeAuthorizedWorkspaceDeleter({ workspaceRoot: linkedLibraryService.workspaceRoot }),
  );
  const copyService = new MediaLibraryCopyService(
    linkedLibraryService,
    contentRead,
    new NodeAuthorizedWorkspaceWriter({ workspaceRoot: linkedLibraryService.workspaceRoot }),
  );

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
        validateInput: (value) =>
          validateWorkspaceLinkedMediaLibraryName(value)?.message ?? undefined,
      });
      if (!name) return;

      try {
        await linkedLibraryService.add(name, dirUri[0].fsPath);
        await gitCompatibility.reconcile(true);
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
      let name: string | undefined;
      if (item && typeof item === 'object' && 'library' in item) {
        name = (item as { library: { name: string } }).library.name;
      } else {
        const libraries = await linkedLibraryService.list();
        const picked = await vscode.window.showQuickPick(
          libraries.map((l) => ({
            label: l.name,
            description: l.workspacePath,
            name: l.name,
          })),
          { title: t('mediaLibrary.remove.selectTitle') },
        );
        name = picked?.name;
      }
      if (!name) return;

      try {
        await linkedLibraryService.remove(name);
        const remainingLibraries = await linkedLibraryService.list();
        await gitCompatibility.reconcile(remainingLibraries.length > 0);
        vscode.window.showInformationMessage(t('mediaLibrary.remove.success'));
      } catch (error) {
        void handleError(error instanceof Error ? error : new Error(String(error)), {
          showToUser: true,
        });
      }
    }),
  );

  // Relink an existing workspace link
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.relinkMediaLibrary', async (item?: unknown) => {
      let name: string | undefined;
      if (item && typeof item === 'object' && 'library' in item) {
        name = (item as { library: { name: string } }).library.name;
      } else {
        const libraries = await linkedLibraryService.list();
        const picked = await vscode.window.showQuickPick(
          libraries.map((l) => ({
            label: l.name,
            description: l.workspacePath,
            name: l.name,
          })),
          { title: t('mediaLibrary.relink.selectTitle') },
        );
        name = picked?.name;
      }
      if (!name) return;

      const confirmAction = t('mediaLibrary.relink.confirmAction');
      const confirmation = await vscode.window.showWarningMessage(
        t('mediaLibrary.relink.structureWarning', { name }),
        { modal: true },
        confirmAction,
      );
      if (confirmation !== confirmAction) return;

      const dirUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: t('mediaLibrary.relink.dialogTitle', { name }),
      });
      if (!dirUri?.[0]) return;

      try {
        await linkedLibraryService.relink(name, dirUri[0].fsPath);
        await gitCompatibility.reconcile(true);
        vscode.window.showInformationMessage(t('mediaLibrary.relink.success', { name }));
      } catch (error) {
        void handleError(error instanceof Error ? error : new Error(String(error)), {
          showToUser: true,
        });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.deleteMediaLibraryFile',
      async (item?: unknown) => {
        const locator = readMediaLibraryFileLocator(item);
        const libraryName = locator ? readLibraryNameFromLocator(locator.path) : undefined;
        if (!locator || !libraryName) {
          vscode.window.showErrorMessage(t('mediaLibrary.delete.invalidSelection'));
          return undefined;
        }

        const deleteAction = t('mediaLibrary.delete.action');
        const confirmed = await vscode.window.showWarningMessage(
          t('mediaLibrary.delete.confirm', { fileName: path.basename(locator.path) }),
          { modal: true },
          deleteAction,
        );
        if (confirmed !== deleteAction) return undefined;

        const current = await workspaceReader.stat(locator, {});
        if (current.status === 'unavailable') {
          vscode.window.showErrorMessage(
            t('mediaLibrary.delete.failed', { code: current.diagnostic.code }),
          );
          return current;
        }
        const result = await deleteService.delete({
          libraryName,
          locator,
          expectedFingerprint: current.fingerprint,
        });
        if (result.status === 'unavailable') {
          vscode.window.showErrorMessage(
            t('mediaLibrary.delete.failed', { code: result.diagnostic.code }),
          );
          return result;
        }
        mediaLibraryProvider.refresh();
        vscode.window.showInformationMessage(t('mediaLibrary.delete.success'));
        return result;
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.copyToMediaLibrary', async (input?: unknown) => {
      const source = readMediaLibraryCopySource(input);
      if (!source) {
        vscode.window.showErrorMessage(t('mediaLibrary.copy.invalidSource'));
        return undefined;
      }
      const libraries = (await linkedLibraryService.list()).filter(
        (library) => library.availability === 'available',
      );
      const selected = await vscode.window.showQuickPick(
        libraries.map((library) => ({
          label: library.name,
          description: library.workspacePath,
          library,
        })),
        { title: t('mediaLibrary.copy.selectLibrary') },
      );
      if (!selected) return undefined;

      const targetRoot = linkedLibraryService.resolveWorkspacePath(selected.library.workspacePath);
      const destination = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(targetRoot, contentLocatorFileName(source))),
        title: t('mediaLibrary.copy.selectDestination'),
      });
      if (!destination) return undefined;
      const relativeTarget = path.relative(targetRoot, destination.fsPath);
      if (
        relativeTarget.length === 0 ||
        path.isAbsolute(relativeTarget) ||
        relativeTarget === '..' ||
        relativeTarget.startsWith(`..${path.sep}`)
      ) {
        vscode.window.showErrorMessage(t('mediaLibrary.copy.destinationOutsideLibrary'));
        return undefined;
      }
      const relativeDirectory = path.dirname(relativeTarget).replace(/\\/gu, '/');
      const destinationDirectory =
        relativeDirectory === '.'
          ? selected.library.workspacePath
          : `${selected.library.workspacePath}/${relativeDirectory}`;
      const result = await copyService.copy({
        source,
        libraryName: selected.library.name,
        destinationDirectory,
        fileName: path.basename(relativeTarget),
        conflict: 'fail-if-exists',
      });
      if (result.status === 'unavailable') {
        vscode.window.showErrorMessage(
          t('mediaLibrary.copy.failed', { code: result.diagnostic.code }),
        );
        return result;
      }
      mediaLibraryProvider.refresh();
      vscode.window.showInformationMessage(t('mediaLibrary.copy.success'));
      return result;
    }),
  );

  // Reveal File in OS
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.revealFileInOS', async (item?: unknown) => {
      const items = getMediaFileItems(item, undefined);
      if (items.length === 0) return;
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(items[0].absolutePath));
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
      const mediaType = detectMediaType(filePath);
      await vscode.env.clipboard.writeText(
        JSON.stringify(
          {
            kind: 'media-library-file-reference',
            path: filePath,
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

        await openAssetPreview(vscode.Uri.file(items[0].absolutePath));
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
            vscode.Uri.file(fileItem.absolutePath),
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
            vscode.Uri.file(fileItem.absolutePath),
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
            vscode.Uri.file(fileItem.absolutePath),
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

function readMediaLibraryFileLocator(
  value: unknown,
): import('@neko/shared').WorkspaceFileContentLocator | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const projection = Reflect.get(value, 'projection');
  if (!projection || typeof projection !== 'object') return undefined;
  const locator = Reflect.get(projection, 'locator');
  if (!locator || typeof locator !== 'object') return undefined;
  const locatorPath = Reflect.get(locator, 'path');
  return Reflect.get(locator, 'kind') === 'workspace-file' && typeof locatorPath === 'string'
    ? { kind: 'workspace-file', path: locatorPath }
    : undefined;
}

function readMediaLibraryCopySource(value: unknown): ContentLocator | undefined {
  if (isContentLocator(value)) return value;
  if (!value || typeof value !== 'object') return undefined;
  const projection = Reflect.get(value, 'projection');
  if (!projection || typeof projection !== 'object') return undefined;
  const locator = Reflect.get(projection, 'locator');
  return isContentLocator(locator) ? locator : undefined;
}

function contentLocatorFileName(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
      return path.basename(locator.path);
    case 'document-entry':
      return path.basename(locator.entryPath);
    case 'generated-output':
      return path.basename(locator.path ?? `${locator.outputId}.bin`);
    case 'package-resource':
      return path.basename(locator.resourcePath);
  }
}

function readLibraryNameFromLocator(locatorPath: string): string | undefined {
  const segments = locatorPath.split('/');
  if (segments.length < 4 || segments[0] !== 'neko' || segments[1] !== 'assets') {
    return undefined;
  }
  const name = segments[2];
  return name && !validateWorkspaceLinkedMediaLibraryName(name) ? name : undefined;
}

/**
 * Extract MediaFileItem objects from tree selection.
 * Handles both single-click (item) and multi-select (selectedItems).
 */
function getMediaFileItems(
  item: unknown,
  selectedItems?: unknown[],
): Array<{ filePath: string; absolutePath: string }> {
  const items: Array<{ filePath: string; absolutePath: string }> = [];

  // Multi-select takes priority
  if (selectedItems && selectedItems.length > 0) {
    for (const selected of selectedItems) {
      if (
        selected &&
        typeof selected === 'object' &&
        'filePath' in selected &&
        'absolutePath' in selected
      ) {
        items.push(selected as { filePath: string; absolutePath: string });
      }
    }
  } else if (item && typeof item === 'object' && 'filePath' in item && 'absolutePath' in item) {
    items.push(item as { filePath: string; absolutePath: string });
  }

  return items;
}

// =============================================================================
// Search Command
// =============================================================================

interface MediaSearchQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
  mediaType: string;
  locator?: import('@neko/shared').WorkspaceFileContentLocator;
}

interface QueryMediaLibraryCommandInput {
  readonly keyword?: unknown;
  readonly limit?: unknown;
  readonly types?: unknown;
}

function isMediaFileType(value: unknown): value is import('@neko/shared').MediaFileType {
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
  workspaceRoot: string,
): void {
  const { t } = require('./i18n');

  // Type filter labels and their MediaFileType values
  const TYPE_FILTERS: Array<{ label: string; types: import('@neko/shared').MediaFileType[] }> = [
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
          ? input.types.filter((type): type is import('@neko/shared').MediaFileType =>
              isMediaFileType(type),
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
              locator: r.locator,
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
        if (!selected || !selected.filePath || !selected.locator) return;
        void searchService.recordRecentUse(selected.locator);

        const uri = vscode.Uri.file(path.join(workspaceRoot, ...selected.filePath.split('/')));
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
// Deactivation
// =============================================================================

export async function deactivate(): Promise<void> {
  if (runningTasks.size > 0) {
    await Promise.allSettled([...runningTasks]);
    runningTasks.clear();
  }
  thumbnailService = null;
}
