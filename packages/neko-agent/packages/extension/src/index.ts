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
  contentLocatorsEqual,
  projectLocalMetadataUserDiagnostic,
  type NekoAgentAPI,
  type GeneratedAsset,
  type GeneratedOutputContentLocator,
  type SkillDef,
  type ProjectQualityFacade,
  type QualityProjectRef,
} from '@neko/shared';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import {
  registerMediaAgentTools,
  setPlatformRootLogger,
  type GeneratedAssetCatalog,
  type GeneratedAssetIndex,
} from '@neko/platform';
import {
  createPersistentGenerationJobStore,
  GENERATION_JOB_MIGRATIONS,
  GenerationJobCoordinator,
  type GenerationJobPort,
} from '@neko/generation';
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
import { getEngineClientProvider } from './services/engineClientProvider';
import { createExtensionAgentContentAccessRuntime } from './services/agentContentAccessRuntime';
import {
  createWorkspaceGeneratedAssetIndex,
  type WorkspaceGeneratedAssetIndexBinding,
} from './services/generatedAssetOpenResolver';
import { MediaGenerationDeliveryHost } from './services/mediaGenerationDeliveryHost';
import { cleanupLegacyCanvasBoardMetadata } from './services/legacyCanvasBoardMetadataCleanup';
import { cleanupLegacyConversationWorkspaceState } from './services/legacyConversationWorkspaceStateCleanup';
import {
  createHostContentPathResolver,
  getHostContentAuthorizedReadRoots,
} from '@neko/shared/vscode/extension';
import {
  registerTimelineProjectionAcceptanceCommands,
  TimelineProjectionAcceptanceController,
} from './debug/timelineProjectionAcceptance';
import type { Platform } from '@neko/platform';
import type { ToolRegistry } from '@neko/agent';

export interface NekoAgentHostServices {
  readonly platform: Platform;
  readonly toolRegistry: ToolRegistry;
  readonly generationJobs?: GenerationJobPort;
  readonly generatedAssets?: GeneratedAssetCatalog;
  readonly resolveGenerationResult?: (locator: GeneratedOutputContentLocator) => {
    readonly path: string;
    readonly asset: GeneratedAsset;
  };
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Off]: 'off',
};

const SHOW_LOGS_COMMAND = 'neko.agent.showLogs';
const LOCAL_METADATA_REVISION_POLL_MS = 2_000;
let generationJobCoordinator: GenerationJobCoordinator | undefined;

/**
 * Activate the extension
 */

async function resolveOwningProjectQualityFacade(
  _project: QualityProjectRef,
): Promise<ProjectQualityFacade | undefined> {
  return undefined;
}

export async function activate(
  context: vscode.ExtensionContext,
  hostServices?: NekoAgentHostServices,
): Promise<NekoAgentAPI> {
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
  }

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  let bootstrapResult: Awaited<ReturnType<typeof bootstrapCoreServices>>;
  try {
    bootstrapResult = await bootstrapCoreServices(
      services,
      context,
      localMetadata ? { workspaceId: localMetadata.workspaceId } : undefined,
      hostServices
        ? {
            platform: hostServices.platform,
            toolRegistry: hostServices.toolRegistry,
          }
        : undefined,
    );
  } catch (error) {
    await localMetadata?.disposeHost();
    throw error;
  }
  logServicesStatus(bootstrapResult);

  // Initialize capability discovery (P0-1: sub-packages register their own tools)
  // Platform services are injected into context so providers can use media/config/embed
  // without depending on @neko/platform directly.
  const capabilityRegistries = createAgentCapabilityRuntimeRegistries();
  const generatedAssetIndexBinding =
    !hostServices?.generatedAssets && localMetadata && workspaceRoot
      ? await createWorkspaceGeneratedAssetIndex({
          workspaceRoot,
          homedir: nodeOs.homedir(),
          logger,
        })
      : undefined;
  const standaloneGeneratedAssetIndex = generatedAssetIndexBinding?.index;
  const generatedAssetCatalog = hostServices?.generatedAssets ?? standaloneGeneratedAssetIndex;
  if (generatedAssetIndexBinding) {
    reportRejectedGeneratedOutputProjections(generatedAssetIndexBinding.rejectedProjections);
    context.subscriptions.push({
      dispose: () => {
        void generatedAssetIndexBinding
          .dispose()
          .catch((error) => logger.warn('Failed to dispose generated output index', { error }));
      },
    });
  }
  if (!hostServices?.generationJobs && localMetadata && standaloneGeneratedAssetIndex) {
    await localMetadata.metadataStore.migrateNamespace(GENERATION_JOB_MIGRATIONS);
    const generationDelivery = new MediaGenerationDeliveryHost({
      assetIndex: standaloneGeneratedAssetIndex,
    });
    const coordinator = new GenerationJobCoordinator({
      store: createPersistentGenerationJobStore({
        metadataStore: localMetadata.metadataStore,
        workspaceId: localMetadata.workspaceId,
      }),
      execution: bootstrapResult.platform.media,
      resultCommitter: {
        commit: async ({ ref, generation }) => {
          const finalized = await generationDelivery.commitMediaGeneration({
            operationId: ref.jobId,
            result: generation,
          });
          return finalized.generatedAssets.map((asset) => {
            if (!asset.lifecycle) {
              throw new Error(
                `Generated asset ${asset.id} is missing its durable ResourceRef lifecycle.`,
              );
            }
            return asset.lifecycle.contentLocator;
          });
        },
      },
    });
    generationJobCoordinator = coordinator;
    await coordinator.recoverPersistedGenerationJobs();
    registerMediaAgentTools(bootstrapResult.toolRegistry, coordinator);
  }
  const engineClientProvider = getEngineClientProvider();
  await engineClientProvider.setAuthorizedReadRoots?.(
    await getHostContentAuthorizedReadRoots({
      workspaceRoot,
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
  );
  const agentContentAccess = await createExtensionAgentContentAccessRuntime({
    context,
    workspaceRoot,
    pathResolver: await createHostContentPathResolver({
      workspaceRoot,
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
  });
  context.subscriptions.push({
    dispose: () => {
      void agentContentAccess.derivedRuntime
        .dispose()
        .catch((error) =>
          logger.warn('Failed to dispose Agent derived content runtime', { error }),
        );
    },
  });
  setCapabilityRuntimeContentAccessRuntime(agentContentAccess.runtime);

  // Register neko-agent host tools.

  const agentOwnedCapabilityContext = {
    extensionContext: context,
    purposeTextRuntime: bootstrapResult.productPurposeTextRuntime,
    configManager: bootstrapResult.platform.config,
    embedFn: buildEmbedFn(bootstrapResult.platform.config, bootstrapResult.piCredentialStore),
  };
  const capabilityDiscovery = bootstrapCapabilities(
    {
      toolRegistry: bootstrapResult.toolRegistry,
      artifactProfileRegistry: capabilityRegistries.artifactProfileRegistry,
      providerExpressionProfileRegistry: capabilityRegistries.providerExpressionProfileRegistry,
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

  // Create chat view provider
  const initialPiConversationCatalog =
    await bootstrapResult.piAgentRuntimeManager.listConversationPresentationCatalog();
  const chatViewProvider = new ChatViewProvider(context.extensionUri, context, {
    piConversations: {
      authority: bootstrapResult.piAgentRuntimeManager,
      initialCatalog: initialPiConversationCatalog,
    },
    ...(localMetadata ? { localMetadata } : {}),
    ...(generatedAssetCatalog ? { generatedAssetCatalog } : {}),
    ...((hostServices?.generationJobs ?? generationJobCoordinator)
      ? {
          generationJobs: hostServices?.generationJobs ?? generationJobCoordinator,
        }
      : {}),
    ...(hostServices?.resolveGenerationResult
      ? { resolveGenerationResult: hostServices.resolveGenerationResult }
      : generatedAssetCatalog
        ? {
            resolveGenerationResult: (locator: GeneratedOutputContentLocator) =>
              resolveGeneratedAssetResult(generatedAssetCatalog, locator),
          }
        : {}),
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

  // Register chat view
  context.subscriptions.push(
    chatViewProvider,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider),
  );

  // Register commands
  registerAgentCoreCommands(context, chatViewProvider, services);
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    await registerTimelineProjectionAcceptanceCommands({
      context,
      chatViewProvider,
      controller: new TimelineProjectionAcceptanceController(bootstrapResult.agentManager),
    });
  }

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
      ...(generatedAssetCatalog
        ? { queryGeneratedAssets: () => generatedAssetCatalog.list() }
        : {}),
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
    async resolveGeneratedOutput(contentLocator) {
      if (contentLocator.kind !== 'generated-output') {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output resolution requires a generated-output ContentLocator.',
        };
      }
      const asset = generatedAssetCatalog?.get(contentLocator.outputId);
      const lifecycle = asset?.lifecycle;
      if (!asset || !lifecycle) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output lifecycle metadata is unavailable.',
        };
      }
      if (!contentLocatorsEqual(lifecycle.contentLocator, contentLocator)) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output ContentLocator no longer matches its lifecycle revision.',
        };
      }
      return {
        status: 'ready',
        assetId: lifecycle.assetId,
        revision: lifecycle.revision,
        contentDigest: lifecycle.contentDigest,
        mediaKind: lifecycle.mediaKind,
        mimeType: lifecycle.mimeType,
        operationId: lifecycle.generation.operationId,
        ...(lifecycle.generation.runId ? { runId: lifecycle.generation.runId } : {}),
        sourcePath: asset.path,
      };
    },
  };
}

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
  const logger = getRootLogger();
  logger.info('Deactivating extension...');
  const coordinator = generationJobCoordinator;
  generationJobCoordinator = undefined;
  await coordinator?.dispose();
}

function reportRejectedGeneratedOutputProjections(
  rejections: WorkspaceGeneratedAssetIndexBinding['rejectedProjections'],
): void {
  if (rejections.length === 0) return;
  const count = rejections.length;
  const visibleResourceIds = rejections.slice(0, 3).map(({ resourceId }) => resourceId);
  const hiddenCount = count - visibleResourceIds.length;
  const resourceSummary =
    visibleResourceIds.join(', ') + (hiddenCount > 0 ? `, and ${hiddenCount} more` : '');
  const message =
    `OpenNeko skipped ${count} generated-output index ${count === 1 ? 'record' : 'records'} ` +
    `that require migration (${resourceSummary}). The generated files were preserved, but these ` +
    'outputs are unavailable until they are regenerated or sent through the current path.';
  void vscode.window.showWarningMessage(message);
}

function resolveGeneratedAssetResult(
  index: Pick<GeneratedAssetIndex, 'get'>,
  locator: GeneratedOutputContentLocator,
): { readonly path: string; readonly asset: GeneratedAsset } {
  const asset = index.get(locator.outputId);
  if (!asset?.lifecycle || !contentLocatorsEqual(asset.lifecycle.contentLocator, locator)) {
    throw new Error(
      `Generation result ${locator.outputId}/${locator.revision} does not match the generated asset index.`,
    );
  }
  return { path: asset.path, asset };
}
