/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * Main entry point for the NekoAgent extension.
 * Provides AI-powered assistance for video and canvas editing.
 */

import * as vscode from 'vscode';
import * as nodeOs from 'node:os';
import {
  ServiceCollection,
  setGlobalServices,
  getService,
  setRootLogger,
  setErrorHandler,
  getRootLogger,
} from './base';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  inspectLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import {
  formatLocalMetadataUserDiagnostic,
  LogLevel,
  projectLocalMetadataUserDiagnostic,
  withTimeout,
  type NekoAgentAPI,
  type SkillDef,
  type ProjectQualityFacade,
  type QualityProjectRef,
  type ICapabilityPurposeMediaService,
} from '@neko/shared';
import {
  createNodeGlobalResourceCacheMetadataBinding,
  type NodeGlobalResourceCacheMetadataBinding,
} from '@neko/shared/local-metadata/node';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { ITaskManager } from './bootstrap';
import { createGeneratedAssetResourceResolver, setPlatformRootLogger } from '@neko/platform';
import { setRootLogger as setAgentRootLogger } from '@neko/agent';
import { ChatViewProvider } from './chat';
import {
  createExtensionLocalMetadata,
  type ExtensionLocalMetadataBinding,
} from './chat/extensionLocalMetadata';
import { buildEmbedFn } from './bootstrap/toolBootstrap';
import { registerAgentCoreCommands } from './commands/agentCoreCommands';
import {
  registerCreationQuickStartCommands,
  registerDocumentContextCommands,
} from './commands/agentContextCommands';
import {
  registerCanvasAmbientExtensionBridge,
  subscribeCanvasSelection,
} from './services/canvasAmbientExtensionBridge';
import {
  createAgentCapabilityRuntimeRegistries,
  createExternalResearchCapabilityProviderFromMcpConfig,
} from '@neko/agent/runtime';
import { registerEntityContributionAutomationCommand } from '@neko/entity/host-vscode';
import {
  bootstrapCapabilities,
  setCapabilityRuntimeContentAccessRuntime,
  setCapabilityRuntimeExternalProcessorRuntime,
} from './bootstrap/capabilityBootstrap';
import { createDocumentReadCapabilityProvider } from './tools/documentCapabilityProvider';
import { createMediaReadCapabilityProvider } from './tools/mediaCapabilityProvider';
import { createSemanticCoverageCapabilityProvider } from './tools/searchCapabilityProvider';
import { createQualityCapabilityProvider } from './tools/qualityCapabilityProvider';
import { createPerceptionCapabilityProvider } from './tools/perceptionCapabilityProvider';
import { createStatusBar } from './statusBar';
import {
  createVSCodeSemanticCoverageProvider,
  registerProjectSearchService,
} from '@neko/search/host-vscode';
import { createAgentProjectSearchAdapters } from './services/agentProjectSearchAdapters';
import { ExternalProcessorRegistryService } from './services/externalProcessorRegistryService';
import { runResourceCacheStartupGc } from './services/resourceCacheStartupGcService';
import { getEngineClientProvider } from './services/engineClientProvider';
import { createExtensionAgentContentAccessRuntime } from './services/agentContentAccessRuntime';
import { createWorkspaceGeneratedAssetIndex } from './services/generatedAssetOpenResolver';
import { cleanupLegacyCanvasBoardMetadata } from './services/legacyCanvasBoardMetadataCleanup';
import { cleanupLegacyConversationWorkspaceState } from './services/legacyConversationWorkspaceStateCleanup';
import {
  createHostContentMediaPathContext,
  createHostContentPathResolver,
  getHostContentAuthorizedReadRoots,
} from '@neko/shared/vscode/extension';
import {
  registerStreamLifecycleAcceptanceCommands,
  StreamLifecycleAcceptanceController,
} from './debug/streamLifecycleAcceptance';

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Off]: 'off',
};

const SHOW_LOGS_COMMAND = 'neko.agent.showLogs';
const LOCAL_METADATA_REVISION_POLL_MS = 2_000;

/**
 * Activate the extension
 */

const PROJECT_QUALITY_EXTENSION_BY_DOMAIN: Readonly<
  Partial<Record<QualityProjectRef['domain'], string>>
> = {
  cut: 'neko.neko-cut',
};

async function resolveOwningProjectQualityFacade(
  project: QualityProjectRef,
): Promise<ProjectQualityFacade | undefined> {
  const extensionId = PROJECT_QUALITY_EXTENSION_BY_DOMAIN[project.domain];
  if (!extensionId) return undefined;
  const extension = vscode.extensions.getExtension<{
    readonly projectQuality?: ProjectQualityFacade;
  }>(extensionId);
  if (!extension) return undefined;
  const api = extension.isActive ? extension.exports : await extension.activate();
  return api?.projectQuality;
}

export async function activate(context: vscode.ExtensionContext): Promise<NekoAgentAPI> {
  // Initialize logger
  const logLevelSetting = inspectLogLevelSetting(context.extensionMode);
  const resolvedLogLevel = logLevelSetting.level;
  const logger = createVSCodeLogger('Neko Agent', 'NekoAgent', context, resolvedLogLevel, {
    showOutputCommand: SHOW_LOGS_COMMAND,
  });
  setRootLogger(logger);
  setPlatformRootLogger(logger.child('Platform'));
  setAgentRootLogger(logger.child('Agent'));

  // Initialize error handler
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  logger.info('Activating extension...');
  const conversationStateCleanup = await cleanupLegacyConversationWorkspaceState(
    context.workspaceState,
  );
  if (conversationStateCleanup.removedKeys.length > 0) {
    logger.info('Removed obsolete workspace conversation transcript state', {
      keys: conversationStateCleanup.removedKeys,
    });
  }
  const boardMetadataCleanup = await cleanupLegacyCanvasBoardMetadata(context.workspaceState);
  if (boardMetadataCleanup.removedKeys.length > 0) {
    logger.info('Removed obsolete Canvas Board routing metadata', {
      keys: boardMetadataCleanup.removedKeys,
    });
  }
  logger.info('Logger configured', {
    level: LOG_LEVEL_NAMES[resolvedLogLevel],
    extensionMode: context.extensionMode,
    extensionPath: context.extensionUri.fsPath,
    agentRuntimeLogger: logger.child('Agent').source,
    platformRuntimeLogger: logger.child('Platform').source,
    setting: {
      source: logLevelSetting.source,
      value: logLevelSetting.value,
      valid: logLevelSetting.valid,
      defaultValue: logLevelSetting.defaultValue,
      globalValue: logLevelSetting.globalValue,
      workspaceValue: logLevelSetting.workspaceValue,
      workspaceFolderValue: logLevelSetting.workspaceFolderValue,
    },
  });
  if (
    context.extensionMode === vscode.ExtensionMode.Development &&
    resolvedLogLevel !== LogLevel.Debug
  ) {
    logger.warn('Agent debug traces are disabled in the development extension host', {
      level: LOG_LEVEL_NAMES[resolvedLogLevel],
      setting: 'neko.logLevel',
      expected: 'debug',
    });
  }

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);
  context.subscriptions.push(services);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let localMetadata: ExtensionLocalMetadataBinding | undefined;
  let globalResourceCache: NodeGlobalResourceCacheMetadataBinding | undefined;
  if (workspaceRoot) {
    try {
      localMetadata = await createExtensionLocalMetadata({
        homedir: nodeOs.homedir(),
        workDir: workspaceRoot,
      });
    } catch (error) {
      const diagnostic = projectLocalMetadataUserDiagnostic(error);
      if (!diagnostic) throw error;
      const message = formatLocalMetadataUserDiagnostic(diagnostic);
      await vscode.window.showErrorMessage(message);
      throw new Error(message, { cause: error });
    }
  } else {
    globalResourceCache = await createNodeGlobalResourceCacheMetadataBinding({
      homedir: nodeOs.homedir(),
    });
  }

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  let bootstrapResult: Awaited<ReturnType<typeof bootstrapCoreServices>>;
  try {
    bootstrapResult = await bootstrapCoreServices(
      services,
      context,
      localMetadata
        ? {
            taskStorage: localMetadata.taskStorage,
            taskRecoveryStorage: localMetadata.taskRecoveryStorage,
            workspaceId: localMetadata.workspaceId,
          }
        : undefined,
    );
  } catch (error) {
    await localMetadata?.disposeHost();
    throw error;
  }
  logServicesStatus(bootstrapResult);
  void runResourceCacheStartupGc({
    context,
    ...(localMetadata
      ? {
          manifestStores: {
            workspace: localMetadata.workspaceResourceCacheManifestStore,
            global: localMetadata.globalResourceCacheManifestStore,
          },
        }
      : globalResourceCache
        ? { manifestStores: { global: globalResourceCache.manifestStore } }
        : {}),
  })
    .catch((error) => {
      logger.warn('Failed to run resource cache startup GC', { error });
    })
    .finally(() => globalResourceCache?.dispose());

  // Initialize capability discovery (P0-1: sub-packages register their own tools)
  // Platform services are injected into context so providers can use media/config/embed
  // without depending on @neko/platform directly.
  const capabilityRegistries = createAgentCapabilityRuntimeRegistries();
  const generatedAssetIndex =
    localMetadata && workspaceRoot
      ? await createWorkspaceGeneratedAssetIndex({
          manifestStore: localMetadata.workspaceResourceCacheManifestStore,
          workspaceRoot,
          homedir: nodeOs.homedir(),
          logger,
        })
      : undefined;
  const engineClientProvider = getEngineClientProvider();
  await engineClientProvider.setAuthorizedReadRoots?.(
    await getHostContentAuthorizedReadRoots({
      workspaceRoot,
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
  );
  const agentContentAccess = createExtensionAgentContentAccessRuntime({
    context,
    engineClientProvider,
    workspaceRoot,
    ...(localMetadata
      ? { resourceCacheManifestStore: localMetadata.workspaceResourceCacheManifestStore }
      : {}),
    ...(generatedAssetIndex
      ? { resolveGeneratedAsset: createGeneratedAssetResourceResolver(generatedAssetIndex) }
      : {}),
    mediaPathContext: await createHostContentMediaPathContext({
      workspaceRoot,
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
    pathResolver: await createHostContentPathResolver({
      workspaceRoot,
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
  });
  setCapabilityRuntimeContentAccessRuntime(agentContentAccess.runtime);

  // Register neko-agent host tools.

  const purposeMediaService: ICapabilityPurposeMediaService | undefined = bootstrapResult.platform
    .media
    ? {
        generateImage: (purpose: string, request: { prompt: string; [key: string]: unknown }) => {
          const model = requirePurposeModelRef(bootstrapResult.platform, purpose);
          return bootstrapResult.platform.media!.generateImage({ ...request, ...model });
        },
        generateVideo: (purpose: string, request: { prompt: string; [key: string]: unknown }) => {
          const model = requirePurposeModelRef(bootstrapResult.platform, purpose);
          return bootstrapResult.platform.media!.generateVideo({ ...request, ...model });
        },
        waitForTask: (taskScope, timeout) =>
          bootstrapResult.platform.media!.waitForTask(taskScope, timeout),
      }
    : undefined;
  const agentOwnedCapabilityContext = {
    extensionContext: context,
    mediaService: bootstrapResult.platform.media,
    purposeMediaService,
    purposeTextRuntime: bootstrapResult.productPurposeTextRuntime,
    configManager: bootstrapResult.platform.config,
    embedFn: buildEmbedFn(bootstrapResult.platform.config, bootstrapResult.piCredentialStore),
  };
  const capabilityDiscovery = bootstrapCapabilities(
    {
      toolRegistry: bootstrapResult.toolRegistry,
      artifactProfileRegistry: capabilityRegistries.artifactProfileRegistry,
      providerExpressionProfileRegistry: capabilityRegistries.providerExpressionProfileRegistry,
      mediaService: agentOwnedCapabilityContext.mediaService,
      purposeMediaService: agentOwnedCapabilityContext.purposeMediaService,
      purposeTextRuntime: agentOwnedCapabilityContext.purposeTextRuntime,
      configManager: agentOwnedCapabilityContext.configManager,
      embedFn: agentOwnedCapabilityContext.embedFn,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    },
    context,
  );
  capabilityDiscovery.registerProvider(
    createDocumentReadCapabilityProvider(),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createMediaReadCapabilityProvider(),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createSemanticCoverageCapabilityProvider(),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createPerceptionCapabilityProvider({
      getContentAccessRuntime: () => agentContentAccess.runtime,
    }),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createQualityCapabilityProvider({
      getContentAccessRuntime: () => agentContentAccess.runtime,
      projectQualityFacadeResolver: { resolve: resolveOwningProjectQualityFacade },
    }),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createExternalResearchCapabilityProviderFromMcpConfig({
      config:
        bootstrapResult.platform.config.getEffectiveAgentWorkspaceConfigSnapshot().externalResearch,
      mcpManager: bootstrapResult.mcpManager,
    }),
    agentOwnedCapabilityContext,
  );

  const externalProcessorRegistryService = new ExternalProcessorRegistryService({
    context,
    logger: logger.child('ExternalProcessorRegistry'),
  });
  setCapabilityRuntimeExternalProcessorRuntime(externalProcessorRegistryService.runtime);
  context.subscriptions.push(externalProcessorRegistryService);

  // Development acceptance traffic uses the canonical Timeline delivery path but
  // is isolated from product capabilities and conversation persistence.
  const streamLifecycleAcceptance =
    context.extensionMode === vscode.ExtensionMode.Development
      ? new StreamLifecycleAcceptanceController()
      : undefined;

  // Create chat view provider
  const initialPiConversationCatalog =
    await bootstrapResult.piAgentRuntimeManager.listConversationPresentationCatalog();
  const chatViewProvider = new ChatViewProvider(context.extensionUri, context, {
    piConversations: {
      authority: bootstrapResult.piAgentRuntimeManager,
      initialCatalog: initialPiConversationCatalog,
    },
    ...(localMetadata ? { localMetadata } : {}),
    ...(generatedAssetIndex ? { generatedAssetIndex } : {}),
  });
  if (localMetadata) {
    const refreshSharedMetadata = (): void => {
      void chatViewProvider.refreshSharedMetadata().catch((error) => {
        logger.warn('Failed to refresh shared Agent metadata', { error });
      });
    };
    const revisionTimer = setInterval(refreshSharedMetadata, LOCAL_METADATA_REVISION_POLL_MS);
    context.subscriptions.push(
      { dispose: () => clearInterval(revisionTimer) },
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) refreshSharedMetadata();
      }),
    );
  }

  if (streamLifecycleAcceptance) {
    await registerStreamLifecycleAcceptanceCommands({
      context,
      chatViewProvider,
      controller: streamLifecycleAcceptance,
    });
  }

  // Register chat view
  context.subscriptions.push(
    chatViewProvider,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider),
  );

  // Register commands
  registerAgentCoreCommands(context, chatViewProvider, services);

  // Creation quick-start commands — surface QuickPick / right-click entries
  // that funnel user intent into the Agent chat. Agent then picks the right
  // Skill to orchestrate atomic tools (no hard-coded pipeline routing).
  registerCreationQuickStartCommands(context, chatViewProvider);

  // Register document/media context menu commands (explorer/context)
  registerDocumentContextCommands(context, chatViewProvider);

  // Project cache/search service — host-side facade for Agent mention search.
  const projectSearchLogger = getRootLogger().child('ProjectSearch');
  registerProjectSearchService(context, {
    logger: projectSearchLogger,
    adapters: createAgentProjectSearchAdapters({
      logger: projectSearchLogger,
      ...(generatedAssetIndex ? { queryGeneratedAssets: () => generatedAssetIndex.list() } : {}),
      ...(localMetadata
        ? {
            searchProjection: {
              repository: localMetadata.searchDocuments,
              partition: localMetadata.searchPartition,
              hasProjection: async () => {
                if (!(await localMetadata.readSearchRevision())) return false;
                return (
                  await localMetadata.searchDocuments.list(localMetadata.searchPartition)
                ).some((document) => document.partition === 'media-library');
              },
              resolveFileKey: async (fileKey: string) => {
                try {
                  const resolved = await vscode.commands.executeCommand<unknown>(
                    'neko.assets.resolvePath',
                    fileKey,
                    {
                      owningWorkspaceRoot: workspaceRoot,
                      workspaceRoots: workspaceRoot ? [workspaceRoot] : [],
                    },
                  );
                  return typeof resolved === 'string' ? resolved : fileKey;
                } catch (error) {
                  projectSearchLogger.warn('Media search file key resolution failed', {
                    fileKey,
                    error,
                  });
                  return fileKey;
                }
              },
            },
            entityAssetProjection: {
              repository: localMetadata.entityAssetProjections,
              partition: localMetadata.entityAssetPartition,
              readRevision: () => localMetadata.readEntityAssetRevision(),
            },
          }
        : {}),
    }),
    semanticCoverageProviders: [
      createVSCodeSemanticCoverageProvider({
        logger: projectSearchLogger,
        ...(localMetadata
          ? {
              semanticProjection: {
                repository: localMetadata.semanticProjections,
                partition: localMetadata.semanticPartition,
              },
            }
          : {}),
      }),
    ],
  });
  context.subscriptions.push(
    registerEntityContributionAutomationCommand({
      logger: logger.child('EntityContributionAutomation'),
    }),
  );

  // Listen for extension changes to update tools (register disposable + avoid duplicates)
  let bridgeMetaToolsRegistered = true; // Already registered above
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      if (!bridgeMetaToolsRegistered) {
        bridgeMetaToolsRegistered = true;
        // Re-subscribe to canvas selection after late activation
        subscribeCanvasSelection(context);
      }
    }),
  );

  registerCanvasAmbientExtensionBridge(context, {
    onSelectionChanged: (nodes) => {
      chatViewProvider.sendAmbientCanvasContext(nodes);
    },
  });

  // Status bar — shows active LLM model, click to open chat
  context.subscriptions.push(createStatusBar(bootstrapResult.platform));

  void externalProcessorRegistryService.refresh().catch((error) => {
    logger.warn('Failed to initialize external processor registry', { error });
  });

  getRootLogger().info('Extension activated');

  const skillCatalog: readonly SkillDef[] = (
    await bootstrapResult.piAgentRuntimeManager.listSkillCatalog()
  ).map((skill) => ({
    id: `${skill.source.kind}:${skill.name}`,
    name: skill.name,
    description: skill.description,
    command: 'neko.agent.invokeSkill',
    tags: ['ai', 'skill', skill.source.kind],
  }));

  return {
    getSkills() {
      return skillCatalog;
    },
    async resolveGeneratedOutput(resourceRef) {
      if (
        resourceRef.kind !== 'generated' ||
        resourceRef.source.kind !== 'generated-asset' ||
        !resourceRef.source.generatedAssetId
      ) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output resolution requires generated-output ResourceRef identity.',
        };
      }
      const asset = generatedAssetIndex?.get(resourceRef.source.generatedAssetId);
      const lifecycle = asset?.lifecycle;
      if (!asset || !lifecycle) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output lifecycle metadata is unavailable.',
        };
      }
      if (
        lifecycle.resourceRef.id !== resourceRef.id ||
        lifecycle.contentDigest !== resourceRef.fingerprint.value
      ) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output ResourceRef no longer matches its lifecycle revision.',
        };
      }
      return {
        status: 'ready',
        assetId: lifecycle.assetId,
        revision: lifecycle.revision,
        contentDigest: lifecycle.contentDigest,
        mediaKind: lifecycle.mediaKind,
        mimeType: lifecycle.mimeType,
        taskId: lifecycle.generation.taskId,
        ...(lifecycle.generation.runId ? { runId: lifecycle.generation.runId } : {}),
        sourcePath: asset.path,
      };
    },
    async setGeneratedOutputReviewPin(resourceRef, input) {
      if (!agentContentAccess.resourceCache) {
        throw new Error('Generated output review pinning requires ResourceCache.');
      }
      const result = await agentContentAccess.resourceCache.updateLifecycle({
        ref: resourceRef,
        variant: { role: 'source' },
        pinned: input.pinned,
        sessionActive: input.pinned,
        ...(input.pinned ? { retentionHint: 'pinned' as const } : {}),
        reason: input.pinned ? 'canvas-generated-review-open' : 'canvas-generated-review-closed',
        ownerId: input.ownerId,
      });
      if (result.status !== 'ready') {
        throw new Error(result.error ?? 'Generated output review pin update failed.');
      }
    },
  };
}

function requirePurposeModelRef(
  platform: Awaited<ReturnType<typeof bootstrapCoreServices>>['platform'],
  purpose: string,
): { readonly providerId: string; readonly modelId: string } {
  const ref = platform.config.resolveModelRefForPurpose(purpose);
  if (!ref) {
    throw new Error(`No explicit model binding is configured for ${purpose}.`);
  }
  return ref;
}

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
  const logger = getRootLogger();
  logger.info('Deactivating extension...');

  const taskManager = getService(ITaskManager);
  if (!taskManager) {
    return;
  }

  await withTimeout(taskManager.dispose(), 3000).catch((error) => {
    logger.warn('Timed out while disposing task manager during deactivate', { error });
  });
}
