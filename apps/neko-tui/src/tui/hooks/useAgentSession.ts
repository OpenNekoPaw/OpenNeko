/**
 * useAgentSession Hook
 *
 * Manages the conversation-scoped Pi runtime lifecycle: initialization, execution, cleanup.
 * Owns the OpenNeko TUI Agent input and projection path.
 * but exposes it as a React hook for Ink components.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  MCPManager,
  createAllMCPTools,
  createMcpToolCreationOptionsForExternalResearch,
  ToolRegistry,
  createSystemPromptBuilder,
  createInputProcessor,
  ProviderCardRegistry,
  type PromptCompositionFragmentProjection,
  type InputProcessor,
} from '@neko/agent';
import {
  createAgentCapabilityRuntimeRegistries,
  createExternalResearchCapabilityProviderFromMcpConfig,
  createAgentConversationMessageQueue,
  AgentMessageQueueOperationError,
  type AgentConversationMessageQueue,
} from '@neko/agent/runtime';
import { resolvePiToolPermissionAction } from '@neko/agent/pi';
import {
  projectLlmParameters,
  ConfigManager,
  createResourceCacheGeneratedAssetIndex,
  FileUserConfigManager,
  registerMediaAgentTools,
  type GeneratedAssetIndex,
  type Platform,
} from '@neko/platform';
import {
  createPersistentGenerationJobStore,
  GENERATION_JOB_MIGRATIONS,
  GenerationJobCoordinator,
} from '@neko/generation';
import type { AgentLlmConfig } from '@neko-agent/types';
import type {
  AgentContinuationMetadata,
  AgentQueuedMessageDisplayKind,
  AgentQueuedMessageSource,
  AgentTurnSource,
} from '@neko-agent/types';
import * as os from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CLIConfig } from '../core/types';
import type { SupportedLocale } from '@neko/shared/i18n';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import { presentQueueCommand } from '../presentation/work-queue-presentation';
import {
  presentContinuationDiscarded,
  presentContinuationReady,
  presentQueuedContinuation,
  presentResourceCacheGcFailure,
  presentSkillInvocationRejected,
  presentWorkspaceContentDiagnostic,
} from '../presentation/runtime-presentation';
import type { ExecutionMode } from '../types/state';
import {
  type AgentCapabilityProvider,
  type ChatMessage,
  type CanvasWorkspaceProjectionResult,
  type GeneratedAssetRevisionRef,
  type ResourceCacheManifestStore,
  type SearchDocumentRecord,
  formatLocalMetadataUserDiagnostic,
  projectLocalMetadataUserDiagnostic,
} from '@neko/shared';
import type {
  TuiCapabilityPorts,
  TuiMcpServerSnapshot,
  TuiModelIdentity,
  TuiParameterValidationResult,
  TuiSkillOption,
} from '../core/tui-command-router';
import { createCLIPlatform } from '../core/platform-bootstrap';
import {
  createTuiLocalMetadataBinding,
  type TuiConversationPersistenceSnapshot,
  type TuiLocalMetadataBinding,
} from '../host/tui-local-metadata-binding';
import {
  createTuiCapabilityLoader,
  type TuiCapabilityLoaderResult,
} from '../core/tui-capability-loader';
import { presentReferenceLoadingDiagnostics } from '../presentation/reference-presentation';
import { presentTuiConversationIdDiagnostic } from '../presentation/conversation-presentation';
import { toQueueOperationDiagnostic } from '../core/message-queue-semantics';
import {
  connectTuiMcpServer,
  createTuiMcpServerSnapshots,
  disconnectTuiMcpServer,
  listRegisteredTuiMcpTools,
  reconnectTuiMcpServer,
} from '../core/tui-mcp-ports';
import { mergeTuiMediaModelMetadata } from '../core/media-model-metadata';
import { getApiKeyFromEnv, listChatModelOptions } from '../core/config';
import {
  useTuiApplicationRuntime,
  useTuiConversationRuntime,
  useTuiConversationStores,
} from '../runtime/tui-runtime-context';
import {
  createTuiSlashCommandCatalog,
  type TuiSlashCommandOption,
} from '../core/slash-command-catalog';
import { withTuiDefaultCapabilityProviders } from '../host/tui-default-capabilities';
import {
  assertCanonicalTuiConversationId,
  TuiConversationIdError,
} from '../core/tui-conversation-id';
import { NodeWorkspaceContentError } from '../host/node-workspace-content-host';
import { runNodeResourceCacheStartupGc } from '../host/node-resource-cache-startup-gc';
import { TuiPiRuntimeOwner, type TuiPiRuntimeEvidence } from '../core/pi-runtime-owner';
import type { TuiConversationCatalogPort } from '../core/slash-commands';
import {
  createTuiPiEventAdapter,
  type TuiPiEventAdapter,
  type TuiPiProjectionEvidence,
} from '../adapters/pi-event-adapter';
import {
  NodeMediaGenerationDeliveryHost,
  type WorkspaceBoardDeliveryObservability,
} from '../host/node-media-generation-delivery-host';
import {
  collectCreatorVisibleArtifacts,
  type CreatorVisibleArtifactCandidate,
} from '@neko/agent/runtime';

interface ExecutePromptOptions {
  readonly metadata?: Record<string, unknown>;
  readonly source?: AgentTurnSource;
  readonly displayKind?: AgentQueuedMessageDisplayKind | 'user-message';
  readonly continuationMetadata?: AgentContinuationMetadata;
}

interface SubmitInternalContinuationInput {
  readonly prompt: string;
  readonly source: Exclude<AgentTurnSource, 'user'>;
  readonly displayKind?: AgentQueuedMessageDisplayKind;
  readonly metadata?: AgentContinuationMetadata;
}

export interface UseAgentSessionOptions {
  readonly config: CLIConfig;
  /** Host-agnostic package capability providers injected by the CLI host. */
  readonly capabilityProviders?: readonly AgentCapabilityProvider[];
  /** Optional persisted conversation id to load through the Ink TUI session path. */
  readonly resumeConversationId?: string;
  /** Invocation-local terminal presentation shared by router and Ink event projection. */
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  /** Concrete built-in prompt locale resolved once during CLI bootstrap. */
  readonly promptLocale: SupportedLocale;
  /** User metadata root; tests must point this at an isolated temporary directory. */
  readonly localMetadataHome?: string;
  /** Host composition override for isolated storage tests. */
  readonly createLocalMetadata?: (
    homedir: string,
    workDir: string,
  ) => Promise<TuiLocalMetadataBinding>;
}

export interface AgentSessionHandle {
  /** Submit a prompt to the agent */
  submit: (
    prompt: string,
    executionOverrides?: { metadata?: Record<string, unknown> },
  ) => Promise<void>;
  /** Cancel current execution */
  cancel: () => void;
  /** Clear conversation history */
  clearHistory: () => void;
  /** Confirm or reject a tool call */
  confirmTool: (toolCallId: string, approved: boolean) => void;
  /** Switch model and rebuild LLM service */
  updateModel: (model: string | TuiModelIdentity) => void;
  /** Switch execution mode and rebuild system prompt */
  updateMode: (mode: ExecutionMode) => void;
  /** Get the current Agent context token estimate. */
  getContextTokenCount: () => number | null;
  /** Compress the current Agent context through the runtime session path. */
  compactContext: () => Promise<import('@neko/agent').CompressionResult>;
  /** Message queue snapshot for running-turn prompt queueing. */
  getMessageQueueSnapshot: () => import('@neko-agent/types').AgentMessageQueueSnapshot | null;
  /** Resume automatic draining of accepted pending messages. */
  resumeQueuedMessages: () => Promise<void>;
  /** Promote a queued message to run next. */
  promoteQueuedMessage: (queueItemId: string) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Cancel a queued message without cancelling the active turn. */
  cancelQueuedMessage: (queueItemId: string) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Explicitly discard a queued internal continuation. */
  discardQueuedContinuation: (
    queueItemId: string,
  ) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Edit a queued message item. */
  editQueuedMessage: (
    queueItemId: string,
    content: string,
  ) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Refresh shared metadata at a TUI command/session boundary. */
  refreshSharedMetadataAtBoundary: () => Promise<void>;
  /** Validate and apply LLM parameter config. */
  validateLlmConfig: (config: AgentLlmConfig) => TuiParameterValidationResult;
  /** Apply a previously validated LLM parameter config. */
  applyLlmConfig: (result: TuiParameterValidationResult) => void;
  /** Execute one turn-scoped Pi Skill invocation; false means unavailable. */
  executeSkill: (name: string, args?: string) => Promise<boolean>;
  /** Pi Skill Host records for terminal commands and selection. */
  readonly listSkills: () => readonly TuiSkillOption[];
  /** Tool registry (for slash commands) */
  readonly getToolRegistry: () => ToolRegistry | undefined;
  /** Snapshot MCP server connection state for /mcp. */
  readonly listMcpServers: () => readonly TuiMcpServerSnapshot[];
  /** List registered MCP tool names, optionally for one server. */
  readonly listMcpTools: (serverId?: string) => readonly string[];
  /** Connect an MCP server and register its tools. */
  readonly connectMcpServer: (serverId: string) => Promise<void>;
  /** Disconnect an MCP server. */
  readonly disconnectMcpServer: (serverId: string) => Promise<void>;
  /** Reconnect an MCP server and refresh its tools. */
  readonly reconnectMcpServer: (serverId: string) => Promise<void>;
  /** Read TUI capability provider diagnostics. */
  readonly getCapabilityProviderSummaries: TuiCapabilityPorts['getProviderSummaries'];
  /** Read TUI capability availability diagnostics. */
  readonly getCapabilityDiagnostics: TuiCapabilityPorts['getDiagnostics'];
  /** List TUI capability tools, optionally scoped by provider id. */
  readonly listCapabilityTools: TuiCapabilityPorts['listTools'];
  /** Terminal-safe `@` reference contributors loaded from capability providers. */
  readonly getReferenceContributors: () => TuiCapabilityLoaderResult['referenceContributors'];
  /** Query portable search projections shared with the Extension Host. */
  readonly querySearchDocuments: (
    query: string,
    limit: number,
  ) => Promise<readonly SearchDocumentRecord[]>;
  /** Pi-backed product conversation catalog for command handlers. */
  readonly getConversationCatalog: () => TuiConversationCatalogPort | undefined;
  /** Current conversation id bound to the Pi session. */
  readonly getCurrentConversationId: () => string;
  /** Switch the active runtime binding to another Pi conversation. */
  readonly resumeConversation: (conversationId: string) => Promise<void>;
  /** Current Agent history for history commands. */
  readonly getHistory: () => ChatMessage[];
  /** Secret-free persistence path evidence for Host diagnostics and debug automation. */
  readonly getConversationPersistenceSnapshot: () => TuiConversationPersistenceSnapshot | null;
  /** Secret-free canonical Pi runtime and immutable turn snapshot evidence. */
  readonly getPiRuntimeEvidence: () => TuiPiRuntimeEvidence | null;
  /** Secret-free shared Timeline projection path and revision evidence. */
  readonly getTimelineProjectionEvidence: () => TuiPiProjectionEvidence | null;
  /** Secret-free prompt composition facts from the canonical Pi runtime. */
  readonly getPromptCompositionProjection: () => readonly PromptCompositionFragmentProjection[];
  /** Secret-free Workspace Board projection outcomes for debug automation. */
  readonly getWorkspaceBoardProjections: () => readonly CanvasWorkspaceProjectionResult[];
  /** Canonical delivery and legacy-fallback counters for debug automation. */
  readonly getWorkspaceBoardDeliveryObservability: () => WorkspaceBoardDeliveryObservability;
  /** Terminal creator-visible artifacts submitted through the canonical delivery host. */
  readonly getCreatorVisibleArtifacts: () => readonly CreatorVisibleArtifactCandidate[];
  /** Stable generated-output lifecycle facts retained without Host paths. */
  readonly getGeneratedOutputLifecycles: () => readonly GeneratedAssetRevisionRef[];
  /** Flush the current TUI runtime projection into shared workspace state. */
  readonly syncRuntimeState: () => void;
  /** Slash command catalog for TUI autocomplete */
  readonly slashCommands: readonly TuiSlashCommandOption[];
  /** Whether session is initialized */
  readonly isReady: boolean;
}

/**
 * Hook that manages the TUI Pi conversation runtime lifecycle.
 *
 * Initialization:
 * 1. Create MCPManager + ToolRegistry
 * 2. Register retained product capabilities and MCP tools
 * 3. Open the Pi conversation/session authority
 * 4. Discover Pi Skills and build the system prompt
 *
 * On submit:
 * 1. Process input (file references)
 * 2. Execute the Pi conversation turn
 * 3. Project Pi product events directly into TUI stores
 */
function presentQueueFailure(
  error: unknown,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  const projection = presentQueueCommand(toQueueOperationDiagnostic(error), presentation);
  if (projection.kind !== 'error') {
    throw new Error('Queue operation failure must project to a terminal diagnostic.');
  }
  return projection.error;
}

function presentQueueOutput(
  result: Parameters<typeof presentQueueCommand>[0],
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  const projection = presentQueueCommand(result, presentation);
  if (projection.kind !== 'output') {
    throw new Error('Queue success must project to terminal output.');
  }
  return projection.output;
}

export function useAgentSession(options: UseAgentSessionOptions): AgentSessionHandle {
  const {
    config,
    capabilityProviders,
    resumeConversationId,
    presentation,
    promptLocale,
  } = options;
  const applicationRuntime = useTuiApplicationRuntime();
  const conversationRuntime = useTuiConversationRuntime();
  const stores = useTuiConversationStores();
  const initialConversationId = conversationRuntime.conversationId;
  if (!initialConversationId) {
    throw new Error('TUI conversation runtime must be bound before session initialization.');
  }
  const promptDomainLocale = promptLocale === 'zh-cn' ? 'zh' : 'en';
  const inputProcessorRef = useRef<InputProcessor | null>(null);
  const mcpManagerRef = useRef<MCPManager | null>(null);
  const platformRef = useRef<Platform | null>(null);
  const toolRegistryRef = useRef<ToolRegistry | null>(null);
  const workspaceBoardProjectionsRef = useRef<readonly CanvasWorkspaceProjectionResult[]>([]);
  const creatorVisibleArtifactsRef = useRef<readonly CreatorVisibleArtifactCandidate[]>([]);
  const generatedOutputLifecyclesRef = useRef<readonly GeneratedAssetRevisionRef[]>([]);
  const generatedAssetIndexRef = useRef<GeneratedAssetIndex | null>(null);
  const mediaGenerationDeliveryHostRef = useRef<NodeMediaGenerationDeliveryHost | null>(null);
  const generationJobCoordinatorRef = useRef<GenerationJobCoordinator | null>(null);
  const capabilityLoadResultRef = useRef<TuiCapabilityLoaderResult | null>(null);
  const localMetadataBindingRef = useRef<TuiLocalMetadataBinding | null>(null);
  const conversationPersistenceSnapshotRef = useRef<TuiConversationPersistenceSnapshot | null>(
    null,
  );
  const conversationIdRef = useRef(initialConversationId);
  const conversationTitleRef = useRef('');
  const piRuntimeOwnerRef = useRef<TuiPiRuntimeOwner | null>(null);
  const piEventAdapterRef = useRef<TuiPiEventAdapter | null>(null);
  const messageQueueRef = useRef<AgentConversationMessageQueue | null>(null);
  const submitRef = useRef<AgentSessionHandle['submit'] | null>(null);
  const submitInternalContinuationRef = useRef<
    ((input: SubmitInternalContinuationInput) => Promise<void>) | null
  >(null);
  const isReadyRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [slashCommands, setSlashCommands] = useState<readonly TuiSlashCommandOption[]>(
    createTuiSlashCommandCatalog(undefined, presentation),
  );

  const requireGeneratedAssetIndex = useCallback(
    async (
      workDir: string,
      manifestStore: ResourceCacheManifestStore,
    ): Promise<GeneratedAssetIndex> => {
      if (!generatedAssetIndexRef.current) {
        const binding = await createResourceCacheGeneratedAssetIndex({
          manifestStore,
          workspaceRoot: workDir,
          homedir: options.localMetadataHome ?? os.homedir(),
        });
        generatedAssetIndexRef.current = binding.index;
        if (binding.migrationReport.sourceStatus === 'quarantined') {
          stores.conversation
            .getState()
            .addError(
              new Error(
                `Generated asset index was quarantined: ${binding.migrationReport.sourceDiagnostic ?? 'invalid legacy index'}`,
              ),
            );
        }
      }
      return generatedAssetIndexRef.current;
    },
    [options.localMetadataHome],
  );

  const syncRuntimeProjection = useCallback((contextTokenCount: number | null = null): void => {
    stores.agent.getState().setContextTokenCount(contextTokenCount);
  }, []);

  const resumeConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      const targetRuntime =
        applicationRuntime.findConversation(conversationId) ??
        applicationRuntime.createConversation({
          conversationId,
          config: stores.config.getState().config,
          activate: false,
        });
      applicationRuntime.activateRuntime(targetRuntime.runtimeId);
    },
    [applicationRuntime, stores],
  );

  // Initialize session on mount
  useEffect(() => {
    let disposed = false;
    const disposeResources = (projectState: boolean): void => {
      messageQueueRef.current?.clear();
      messageQueueRef.current = null;
      const piRuntimeOwner = piRuntimeOwnerRef.current;
      piRuntimeOwnerRef.current = null;
      piEventAdapterRef.current?.dispose();
      piEventAdapterRef.current = null;
      void piRuntimeOwner?.dispose().catch(() => undefined);
      const generationJobCoordinator = generationJobCoordinatorRef.current;
      generationJobCoordinatorRef.current = null;
      void generationJobCoordinator?.dispose().catch(() => undefined);
      mediaGenerationDeliveryHostRef.current?.dispose();
      mediaGenerationDeliveryHostRef.current = null;
      platformRef.current?.dispose();
      platformRef.current = null;
      const localMetadataBinding = localMetadataBindingRef.current;
      localMetadataBindingRef.current = null;
      conversationPersistenceSnapshotRef.current = null;
      void localMetadataBinding?.dispose().catch(() => undefined);
      const mcpManager = mcpManagerRef.current;
      mcpManagerRef.current = null;
      void mcpManager?.disconnectAll().catch(() => undefined);
    };
    const init = async () => {
      try {
        isReadyRef.current = false;
        workspaceBoardProjectionsRef.current = [];
        creatorVisibleArtifactsRef.current = [];
        generatedOutputLifecyclesRef.current = [];
        setIsReady(false);
        setCapabilityRevision((revision) => revision + 1);
        stores.agent.getState().setExecutionMode(config.executionMode);
        // 1. MCP Manager
        const mcpManager = new MCPManager();
        mcpManagerRef.current = mcpManager;
        for (const serverConfig of config.mcpServers) {
          mcpManager.register(serverConfig);
        }
        if (config.mcpServers.length > 0) {
          await mcpManager.connectAll();
        }

        // 2. Tool Registry
        const toolRegistry = new ToolRegistry();
        toolRegistryRef.current = toolRegistry;
        const mcpTools = await createAllMCPTools(
          mcpManager,
          createMcpToolCreationOptionsForExternalResearch(config.externalResearch),
        );
        toolRegistry.registerMany(mcpTools);

        const localMetadataHome = options.localMetadataHome ?? os.homedir();
        const localMetadataBinding = options.createLocalMetadata
          ? await options.createLocalMetadata(localMetadataHome, config.workDir)
          : await createTuiLocalMetadataBinding({
              homedir: localMetadataHome,
              workDir: config.workDir,
            });
        localMetadataBindingRef.current = localMetadataBinding;
        conversationPersistenceSnapshotRef.current = {
          ...localMetadataBinding.persistenceBackend,
          resume: { status: 'new', restoredMessageCount: 0 },
        };
        const generatedAssetIndex = await requireGeneratedAssetIndex(
          config.workDir,
          localMetadataBinding.resourceCacheManifestStore,
        );
        const resourceCacheGcResults = await runNodeResourceCacheStartupGc({
          workDir: config.workDir,
          manifestStore: localMetadataBinding.resourceCacheManifestStore,
        });
        for (const result of resourceCacheGcResults) {
          if (result.error) {
            const message =
              result.error instanceof Error ? result.error.message : String(result.error);
            stores.conversation
              .getState()
              .addError(new Error(presentResourceCacheGcFailure(message, presentation)));
          }
        }
        conversationTitleRef.current = '';
        const explicitResumeId = resumeConversationId?.trim();
        if (explicitResumeId) {
          assertCanonicalTuiConversationId(explicitResumeId);
        }

        const providerCardRegistry = new ProviderCardRegistry();
        const profileRegistries = createAgentCapabilityRuntimeRegistries();

        const capabilityLoader = createTuiCapabilityLoader({
          toolRegistry,
          providerCardRegistry,
          artifactProfileRegistry: profileRegistries.artifactProfileRegistry,
          providerExpressionProfileRegistry: profileRegistries.providerExpressionProfileRegistry,
          locale: promptDomainLocale,
        });
        const capabilityLoadResult = capabilityLoader.registerProviders([
          ...withTuiDefaultCapabilityProviders({
            workDir: config.workDir,
            resourceCacheManifestStore: localMetadataBinding.resourceCacheManifestStore,
            generatedAssetIndex,
            capabilityProviders,
          }),
          createExternalResearchCapabilityProviderFromMcpConfig({
            config: config.externalResearch,
            mcpManager,
          }),
        ]);
        capabilityLoadResultRef.current = capabilityLoadResult;
        setCapabilityRevision((revision) => revision + 1);

        const cliPlatform = createCLIPlatform({
          workspacePath: config.workDir,
          toolRegistry,
        });
        platformRef.current = cliPlatform.platform;
        const mediaGenerationDeliveryHost = new NodeMediaGenerationDeliveryHost({
          workspaceRoot: config.workDir,
          workspaceId: localMetadataBinding.workspaceId,
          metadataStore: localMetadataBinding.metadataStore,
          assetIndex: generatedAssetIndex,
          onWorkspaceBoardProjection: (results) => {
            workspaceBoardProjectionsRef.current = Object.freeze([
              ...workspaceBoardProjectionsRef.current,
              ...results,
            ]);
          },
          onGeneratedOutputDelivery: (lifecycles) => {
            generatedOutputLifecyclesRef.current = Object.freeze([
              ...generatedOutputLifecyclesRef.current,
              ...lifecycles,
            ]);
          },
        });
        mediaGenerationDeliveryHostRef.current = mediaGenerationDeliveryHost;
        await localMetadataBinding.metadataStore.migrateNamespace(GENERATION_JOB_MIGRATIONS);
        const generationJobCoordinator = new GenerationJobCoordinator({
          store: createPersistentGenerationJobStore({
            metadataStore: localMetadataBinding.metadataStore,
            workspaceId: localMetadataBinding.workspaceId,
          }),
          execution: cliPlatform.platform.media,
          resultCommitter: {
            commit: async ({ ref, generation }) => {
              const delivery = await mediaGenerationDeliveryHost.deliverMediaGeneration({
                operationId: ref.jobId,
                result: generation,
              });
              return delivery.resourceRefs;
            },
          },
        });
        generationJobCoordinatorRef.current = generationJobCoordinator;
        await generationJobCoordinator.recoverPersistedGenerationJobs();
        registerMediaAgentTools(toolRegistry, generationJobCoordinator);
        await mediaGenerationDeliveryHost.resumePendingWorkspaceBoardDeliveries();
        const executionMode = stores.agent.getState().executionMode;
        const basePromptBuilder = createSystemPromptBuilder({
          locale: promptDomainLocale,
          executionMode,
        });
        await basePromptBuilder.loadAgentsFile(
          config.workDir,
          join(localMetadataHome, '.neko'),
        );
        const piEventAdapter = createTuiPiEventAdapter(stores, {
          conversationId: conversationIdRef.current,
          presentation,
        });
        piEventAdapterRef.current = piEventAdapter;
        const piRuntimeOwner = new TuiPiRuntimeOwner({
          userHome: localMetadataHome,
          workspaceId: localMetadataBinding.workspaceId,
          conversationId: conversationIdRef.current,
          hostId: applicationRuntime.applicationId,
          credentials: applicationRuntime.credentials,
          builtinSkillRoot: resolveTuiBuiltinSkillRoot(),
          getConfig: () => stores.config.getState().config,
          getTools: () => toolRegistry.list(),
          getSystemPrompt: () =>
            buildSystemPromptWithContext(
              basePromptBuilder.buildForExecutionMode(
                stores.agent.getState().executionMode,
              ),
              stores.config.getState().config,
            ),
          getPromptComposition: () =>
            basePromptBuilder.projectCompositionForExecutionMode(
              stores.agent.getState().executionMode,
            ),
          permissionPolicy: {
            preflight: async ({ tool, args, identity }) => {
              const mode = stores.agent.getState().executionMode;
              const action = resolvePiToolPermissionAction(
                mode,
                tool.requiresConfirmation,
                tool.isReadOnly,
              );
              if (action === 'deny') {
                return { allowed: false, reason: 'Plan mode does not execute tools.' };
              }
              if (action === 'allow') {
                return { allowed: true };
              }
              return new Promise((resolve) => {
                stores.agent.getState().setWaitingConfirmation();
                stores.ui.getState().showToolApproval({
                  toolCallId: identity.toolCallId,
                  toolName: tool.name,
                  arguments:
                    typeof args === 'object' && args !== null && !Array.isArray(args)
                      ? Object.fromEntries(Object.entries(args))
                      : {},
                  resolve: (approved) =>
                    resolve(
                      approved
                        ? { allowed: true }
                        : { allowed: false, reason: 'User denied tool execution.' },
                    ),
                });
              });
            },
          },
          workspaceTrusted: true,
          locale: promptDomainLocale,
          requireExistingConversation: explicitResumeId !== undefined,
        });
        piRuntimeOwnerRef.current = piRuntimeOwner;
        await piRuntimeOwner.initialize();
        conversationPersistenceSnapshotRef.current = {
          authority: 'pi-session',
          catalog: 'sqlite',
          databaseScope: options.createLocalMetadata ? 'isolated-test' : 'user-global',
          resume: {
            status: piRuntimeOwner.wasRestored ? 'restored' : 'new',
            requestedConversationId: resumeConversationId,
            restoredConversationId: conversationIdRef.current,
            recordSource: 'pi-session',
            restoredMessageCount: piRuntimeOwner.messages.length,
          },
        };
        setSlashCommands(
          createTuiSlashCommandCatalog(
            piRuntimeOwner.skills.map((skill) => ({
              command: skill.name,
              description: skill.description,
              enabled: skill.enabled,
              entryPointKind: 'skill',
            })),
            presentation,
          ),
        );
        messageQueueRef.current = createAgentConversationMessageQueue({
          conversationId: conversationIdRef.current,
        });
        stores.agent.getState().setMessageQueuePausedAfterCancel(false);
        stores.agent.getState().setMessageQueueSnapshot(messageQueueRef.current.snapshot());

        // 7. Input Processor
        inputProcessorRef.current = createInputProcessor({
          workspaceRoot: config.workDir,
          maxFileSize: 1024 * 1024,
          maxFiles: 20,
          includeLineNumbers: true,
          includeLanguageHints: true,
        });

        if (disposed) {
          return;
        }
        isReadyRef.current = true;
        setIsReady(true);
      } catch (error) {
        if (disposed) {
          return;
        }
        const localMetadataDiagnostic = projectLocalMetadataUserDiagnostic(error);
        const err =
          error instanceof NodeWorkspaceContentError
            ? new Error(presentWorkspaceContentDiagnostic(error.diagnostic, presentation))
            : error instanceof TuiConversationIdError
              ? new Error(presentTuiConversationIdDiagnostic(error.diagnostic, presentation))
              : localMetadataDiagnostic
                ? new Error(formatLocalMetadataUserDiagnostic(localMetadataDiagnostic), {
                    cause: error,
                  })
                : error instanceof Error
                  ? error
                  : new Error(String(error));
        stores.agent.getState().setError(err);
        stores.conversation.getState().addError(err);
      } finally {
        if (disposed) {
          disposeResources(false);
        }
      }
    };

    initPromiseRef.current = init();

    return () => {
      disposed = true;
      isReadyRef.current = false;
      disposeResources(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const executePrompt = useCallback(
    async (prompt: string, options: ExecutePromptOptions = {}): Promise<void> => {
      const piRuntimeOwner = piRuntimeOwnerRef.current;
      const piEventAdapter = piEventAdapterRef.current;
      const inputProcessor = inputProcessorRef.current;
      if (!piRuntimeOwner || !piEventAdapter) {
        throw new Error('Session not initialized');
      }

      let finalPrompt = prompt;
      if (inputProcessor) {
        const processed = await inputProcessor.process(prompt);
        const referenceDiagnostic = presentReferenceLoadingDiagnostics(
          processed.errors,
          presentation,
        );
        if (referenceDiagnostic) {
          throw new Error(referenceDiagnostic);
        }
        finalPrompt = processed.message;
        if (processed.hasFiles) {
          finalPrompt = `${processed.message}\n\n## Referenced Files\n\n${processed.fileContents}`;
        }
      }

      piEventAdapter.reset();
      if (!options.source || options.source === 'user') {
        stores.conversation.getState().addUserMessage(prompt);
      } else {
        stores.conversation.getState().addSystemMessage({
          content: presentContinuationReady(
            options.source,
            options.continuationMetadata,
            presentation,
          ),
          source: options.source,
          displayKind: options.displayKind ?? displayKindForTurnSource(options.source),
          metadata: options.continuationMetadata,
        });
      }
      stores.agent.getState().setRunning();
      if (!conversationTitleRef.current) {
        conversationTitleRef.current = deriveConversationTitle([{ role: 'user', content: prompt }]);
      }
      syncRuntimeProjection();

      const currentConfig = config;
      const metadata = mergeTuiMediaModelMetadata(
        options.metadata,
        currentConfig.defaultMediaModels,
        currentConfig.chatModel?.providerId ?? currentConfig.provider,
        listChatModelOptions(currentConfig.workDir),
        currentConfig.perceptionModels,
      );

      await piRuntimeOwner.execute({
        prompt: finalPrompt,
        events: piEventAdapter,
        ...(metadata ? { metadata } : {}),
      });
      const runtimeEvidence = piRuntimeOwner.getRuntimeEvidence();
      const turnEvidence = runtimeEvidence?.lastTurn;
      const candidates = collectCreatorVisibleArtifacts({
        toolResults: piEventAdapter.readTerminalToolResults(),
        assistantMarkdown: readLastPiAssistantText(piRuntimeOwner.messages),
      });
      if (candidates.length > 0 && turnEvidence) {
        const deliveryHost = mediaGenerationDeliveryHostRef.current;
        if (!deliveryHost) {
          throw new Error('TUI Workspace Board delivery host is unavailable at turn completion.');
        }
        await deliveryHost.deliverCreatorVisibleArtifacts({
          deliveryId: `agent-turn:${turnEvidence.turnId}`,
          createdAt: new Date().toISOString(),
          artifacts: candidates,
          runId: options.continuationMetadata?.runId ?? turnEvidence.runId,
        });
        creatorVisibleArtifactsRef.current = Object.freeze([
          ...creatorVisibleArtifactsRef.current,
          ...candidates,
        ]);
      }
      syncRuntimeProjection();
    },
    [syncRuntimeProjection],
  );

  const requireRuntimeMessageQueue = useCallback((): AgentConversationMessageQueue => {
    const queue = messageQueueRef.current;
    if (!queue) {
      throw new Error('Pi conversation message queue is not initialized');
    }
    return queue;
  }, []);

  const projectRuntimeMessageQueue = useCallback((queue: AgentConversationMessageQueue): void => {
    stores.agent.getState().setMessageQueuePausedAfterCancel(queue.isPausedAfterActiveTurnCancel());
    stores.agent.getState().setMessageQueueSnapshot(queue.snapshot());
  }, []);

  const releaseRuntimeQueuedPrompts = useCallback(async (): Promise<void> => {
    const queue = requireRuntimeMessageQueue();
    await queue.drain(async (released) => {
      projectRuntimeMessageQueue(queue);
      syncRuntimeProjection();
      await executePrompt(released.content, {
        source: normalizeTurnSource(released.source),
        displayKind: released.displayKind,
        ...(released.metadata ? { continuationMetadata: released.metadata } : {}),
        ...(released.metadata ? { metadata: { continuation: released.metadata } } : {}),
      });
    });
    projectRuntimeMessageQueue(queue);
    syncRuntimeProjection();
  }, [
    executePrompt,
    projectRuntimeMessageQueue,
    requireRuntimeMessageQueue,
    syncRuntimeProjection,
  ]);

  const submit = useCallback(
    async (prompt: string, executionOverrides?: { metadata?: Record<string, unknown> }) => {
      if (initPromiseRef.current) {
        await initPromiseRef.current;
      }

      const piRuntimeOwner = piRuntimeOwnerRef.current;

      if (!piRuntimeOwner) {
        stores.agent.getState().setError(new Error('Session not initialized'));
        return;
      }

      if (piRuntimeOwner.isRunning || stores.agent.getState().status === 'running') {
        try {
          const queue = requireRuntimeMessageQueue();
          if (executionOverrides?.metadata && Object.keys(executionOverrides.metadata).length > 0) {
            throw new AgentMessageQueueOperationError(
              'not-queueable',
              'Prompts with execution metadata cannot be queued while an Agent turn is running.',
            );
          }
          queue.enqueue({
            content: prompt,
            source: 'user',
            displayKind: 'user-message',
          });
          const snapshot = queue.snapshot();
          projectRuntimeMessageQueue(queue);
          syncRuntimeProjection();
          stores.conversation.getState().addSystemMessage({
            content: presentQueueOutput(
              { kind: 'enqueued', pendingCount: snapshot.pendingCount },
              presentation,
            ),
            source: 'system-continuation',
            displayKind: 'system-continuation',
          });
        } catch (error) {
          const message = presentQueueFailure(error, presentation);
          stores.agent.getState().setMessageQueueDiagnostic(message);
          stores.conversation.getState().addError(new Error(message));
        }
        return;
      }

      try {
        await executePrompt(prompt, { metadata: executionOverrides?.metadata, source: 'user' });
        await releaseRuntimeQueuedPrompts();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        stores.agent.getState().setError(err);
        stores.conversation.getState().addError(err);
        syncRuntimeProjection();
      }
    },
    [
      executePrompt,
      projectRuntimeMessageQueue,
      releaseRuntimeQueuedPrompts,
      requireRuntimeMessageQueue,
      syncRuntimeProjection,
    ],
  );

  const submitInternalContinuation = useCallback(
    async (input: SubmitInternalContinuationInput): Promise<void> => {
      if (!isReadyRef.current && initPromiseRef.current) {
        await initPromiseRef.current;
      }

      const piRuntimeOwner = piRuntimeOwnerRef.current;
      if (!piRuntimeOwner) {
        throw new Error('Session not initialized');
      }

      const displayKind = input.displayKind ?? displayKindForTurnSource(input.source);
      const continuationMetadata: AgentContinuationMetadata = {
        ...input.metadata,
        status: input.metadata?.status ?? 'queued',
      };

      const queue = requireRuntimeMessageQueue();
      const item = queue.enqueue({
        content: input.prompt,
        source: input.source,
        displayKind,
        metadata: continuationMetadata,
      });
      const snapshot = queue.snapshot();
      projectRuntimeMessageQueue(queue);
      syncRuntimeProjection();
      stores.conversation.getState().addSystemMessage({
        content: presentQueuedContinuation(item, snapshot.pendingCount, presentation),
        source: normalizeTurnSource(item.source),
        displayKind,
        metadata: continuationMetadata,
      });
      if (piRuntimeOwner.isRunning || stores.agent.getState().status === 'running') return;
      await releaseRuntimeQueuedPrompts();
    },
    [
      executePrompt,
      projectRuntimeMessageQueue,
      releaseRuntimeQueuedPrompts,
      requireRuntimeMessageQueue,
      syncRuntimeProjection,
    ],
  );

  const cancel = useCallback(() => {
    const piRuntimeOwner = piRuntimeOwnerRef.current;
    const queue = messageQueueRef.current;
    const wasRunning =
      Boolean(piRuntimeOwner?.isRunning) || stores.agent.getState().status === 'running';
    piRuntimeOwner?.cancel();
    if (wasRunning && queue && queue.snapshot().pendingCount > 0) {
      queue.pauseAfterActiveTurnCancel();
      projectRuntimeMessageQueue(queue);
    }
    stores.agent.getState().setIdle();
    syncRuntimeProjection();
  }, [projectRuntimeMessageQueue, syncRuntimeProjection]);

  const getMessageQueueSnapshot = useCallback(() => {
    return messageQueueRef.current?.snapshot() ?? null;
  }, []);

  const refreshSharedMetadataAtBoundary = useCallback(async (): Promise<void> => {
    const binding = localMetadataBindingRef.current;
    if (!binding) return;
    await binding.pollRevisions();
  }, []);

  const resumeQueuedMessages = useCallback(async (): Promise<void> => {
    const queue = requireRuntimeMessageQueue();
    queue.resume();
    projectRuntimeMessageQueue(queue);
    if (queue.snapshot().pendingCount === 0) {
      return;
    }
    try {
      await releaseRuntimeQueuedPrompts();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      stores.agent.getState().setError(err);
      stores.conversation.getState().addError(err);
      syncRuntimeProjection();
    }
  }, [
    projectRuntimeMessageQueue,
    releaseRuntimeQueuedPrompts,
    requireRuntimeMessageQueue,
    syncRuntimeProjection,
  ]);

  const promoteQueuedMessage = useCallback(
    (queueItemId: string) => {
      const queue = requireRuntimeMessageQueue();
      const wasPaused = queue.isPausedAfterActiveTurnCancel();
      const item = queue.promote(queueItemId);
      if (wasPaused) {
        queue.resume();
      }
      projectRuntimeMessageQueue(queue);
      syncRuntimeProjection();
      if (wasPaused) {
        void releaseRuntimeQueuedPrompts();
      }
      return item;
    },
    [
      projectRuntimeMessageQueue,
      releaseRuntimeQueuedPrompts,
      requireRuntimeMessageQueue,
      syncRuntimeProjection,
    ],
  );

  const cancelQueuedMessage = useCallback(
    (queueItemId: string) => {
      const queue = requireRuntimeMessageQueue();
      const item = queue.remove(queueItemId);
      projectRuntimeMessageQueue(queue);
      syncRuntimeProjection();
      return item;
    },
    [projectRuntimeMessageQueue, requireRuntimeMessageQueue, syncRuntimeProjection],
  );

  const discardQueuedContinuation = useCallback(
    (queueItemId: string) => {
      const queue = requireRuntimeMessageQueue();
      const item = queue.discardContinuation(queueItemId);
      projectRuntimeMessageQueue(queue);
      stores.conversation.getState().addSystemMessage({
        content: presentContinuationDiscarded(item.id, presentation),
        source: normalizeTurnSource(item.source),
        displayKind: item.displayKind ?? displayKindForTurnSource(normalizeTurnSource(item.source)),
        metadata: item.metadata,
      });
      syncRuntimeProjection();
      return item;
    },
    [presentation, projectRuntimeMessageQueue, requireRuntimeMessageQueue, syncRuntimeProjection],
  );

  const editQueuedMessage = useCallback(
    (queueItemId: string, content: string) => {
      const queue = requireRuntimeMessageQueue();
      const item = queue.edit(queueItemId, content);
      projectRuntimeMessageQueue(queue);
      syncRuntimeProjection();
      return item;
    },
    [projectRuntimeMessageQueue, requireRuntimeMessageQueue, syncRuntimeProjection],
  );

  const clearHistory = useCallback(() => {
    stores.conversation.getState().clearMessages();
    stores.agent.getState().setContextTokenCount(null);
    void piRuntimeOwnerRef.current?.clearContext().catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      stores.agent.getState().setError(failure);
      stores.conversation.getState().addError(failure);
    });
  }, []);

  const confirmTool = useCallback(
    (toolCallId: string, approved: boolean) => {
      const pending = stores.ui.getState().pendingApproval;
      if (!pending || pending.toolCallId !== toolCallId) {
        throw new Error(`No pending Pi tool confirmation owns ${toolCallId}.`);
      }
      pending.resolve(approved);
      stores.ui.getState().dismissToolApproval();
      if (approved) {
        stores.agent.getState().setRunning();
        syncRuntimeProjection();
      } else {
        syncRuntimeProjection();
      }
    },
    [presentation, syncRuntimeProjection],
  );

  const updateModel = useCallback(
    (model: string | TuiModelIdentity) => {
      const identity =
        typeof model === 'string'
          ? { providerId: stores.config.getState().config.provider, modelId: model }
          : model;
      const currentConfig = stores.config.getState().config;
      const manager = new ConfigManager({
        userConfigManager: new FileUserConfigManager(),
        workspacePath: currentConfig.workDir,
      });
      try {
        const provider = manager.getProvider(identity.providerId);
        const configuredModel = manager.getModel(identity.modelId);
        if (!provider || !configuredModel || configuredModel.providerId !== identity.providerId) {
          throw new Error(
            `Configured Pi model ${identity.providerId}/${identity.modelId} was not found.`,
          );
        }
        const protocolProfile = configuredModel.protocolProfile ?? provider.protocolProfile;
        if (!protocolProfile) {
          throw new Error(
            `Configured Pi model ${identity.providerId}/${identity.modelId} has no protocol profile.`,
          );
        }
        const contextWindow = configuredModel.contextWindow;
        const maxOutputTokens = configuredModel.maxOutputTokens;
        if (!contextWindow || !maxOutputTokens) {
          throw new Error(
            `Configured Pi model ${identity.providerId}/${identity.modelId} lacks context limits.`,
          );
        }
        stores.config.getState().setConfig({
          provider: identity.providerId,
          providerType: provider.type,
          providerRequiresApiKey: provider.requiresApiKey !== false,
          protocolProfile,
          model: identity.modelId,
          apiKey:
            getApiKeyFromEnv(provider.id) ?? getApiKeyFromEnv(provider.type) ?? provider.apiKey,
          baseUrl: provider.apiUrl,
          chatModel: {
            providerId: identity.providerId,
            modelId: identity.modelId,
            apiModelId: configuredModel.name,
            contextWindow,
            maxOutputTokens,
            ...(identity.providerExpressionProfileId
              ? { providerExpressionProfileId: identity.providerExpressionProfileId }
              : {}),
            ...(configuredModel.capabilities ? { capabilities: configuredModel.capabilities } : {}),
          },
        });
      } finally {
        manager.dispose();
      }
      syncRuntimeProjection();
    },
    [syncRuntimeProjection],
  );

  const validateLlmConfig = useCallback(
    (llmConfig: AgentLlmConfig): TuiParameterValidationResult =>
      projectCliLlmParameters(stores.config.getState().config, llmConfig),
    [],
  );

  const applyLlmConfig = useCallback(
    (result: TuiParameterValidationResult): void => {
      const config = stores.config.getState().config;
      stores.config.getState().setConfig({
        llmConfig: result.config,
        temperature: result.chatOptions?.temperature ?? config.temperature,
        maxTokens: result.chatOptions?.maxTokens ?? config.maxTokens,
        thinkingBudget: result.chatOptions?.thinkingBudget ?? config.thinkingBudget,
      });
      syncRuntimeProjection();
    },
    [syncRuntimeProjection],
  );

  const executeSkill = useCallback(
    async (name: string, args?: string): Promise<boolean> => {
      const owner = piRuntimeOwnerRef.current;
      const events = piEventAdapterRef.current;
      if (!owner || !events || !owner.skills.some((skill) => skill.name === name)) {
        stores.conversation
          .getState()
          .addSystemMessage(presentSkillInvocationRejected(name, presentation));
        return false;
      }
      events.reset();
      stores.conversation.getState().addUserMessage(`$${name}${args ? ` ${args}` : ''}`);
      stores.agent.getState().setRunning();
      await owner.executeSkill({
        skillName: name,
        ...(args === undefined ? {} : { additionalInstructions: args }),
        events,
      });
      syncRuntimeProjection();
      return true;
    },
    [presentation, syncRuntimeProjection],
  );

  const updateMode = useCallback(
    (mode: ExecutionMode) => {
      stores.agent.getState().setExecutionMode(mode);
      syncRuntimeProjection();
    },
    [promptDomainLocale, syncRuntimeProjection],
  );

  const getContextTokenCount = useCallback((): number | null => {
    return piRuntimeOwnerRef.current?.getContextTokenCount() ?? null;
  }, []);

  const compactContext = useCallback(async () => {
    const owner = piRuntimeOwnerRef.current;
    if (!owner) throw new Error('Pi conversation runtime is not initialized.');
    const result = await owner.compactContext();
    return {
      originalTokens: result.originalTokens,
      compressedTokens: result.compressedTokens,
      ratio: result.ratio,
    };
  }, []);

  const listMcpServers = useCallback((): readonly TuiMcpServerSnapshot[] => {
    return createTuiMcpServerSnapshots(mcpManagerRef.current, toolRegistryRef.current);
  }, []);

  const listMcpTools = useCallback((serverId?: string): readonly string[] => {
    return listRegisteredTuiMcpTools(toolRegistryRef.current, serverId);
  }, []);

  const connectMcpServer = useCallback(async (serverId: string): Promise<void> => {
    const manager = mcpManagerRef.current;
    const registry = toolRegistryRef.current;
    if (!manager || !registry) {
      throw new Error('MCP runtime is not initialized');
    }
    await connectTuiMcpServer(manager, registry, serverId);
  }, []);

  const disconnectMcpServer = useCallback(async (serverId: string): Promise<void> => {
    const manager = mcpManagerRef.current;
    const registry = toolRegistryRef.current;
    if (!manager || !registry) {
      throw new Error('MCP runtime is not initialized');
    }
    await disconnectTuiMcpServer(manager, registry, serverId);
  }, []);

  const reconnectMcpServer = useCallback(async (serverId: string): Promise<void> => {
    const manager = mcpManagerRef.current;
    const registry = toolRegistryRef.current;
    if (!manager || !registry) {
      throw new Error('MCP runtime is not initialized');
    }
    await reconnectTuiMcpServer(manager, registry, serverId);
  }, []);

  const getCapabilityProviderSummaries = useCallback(() => {
    return capabilityLoadResultRef.current?.providers ?? [];
  }, [capabilityRevision]);

  const getCapabilityDiagnostics = useCallback(() => {
    return capabilityLoadResultRef.current?.diagnostics ?? [];
  }, [capabilityRevision]);

  const listCapabilityTools = useCallback(
    (providerId?: string): readonly string[] => {
      const tools = toolRegistryRef.current?.list() ?? [];
      if (!providerId) {
        return tools.map((tool) => tool.name);
      }
      const summary = capabilityLoadResultRef.current?.providers.find(
        (provider) => provider.providerId === providerId,
      );
      if (!summary) {
        return [];
      }
      const providerToolNames = new Set(
        summary.loaded
          .filter((contribution) => contribution.kind === 'tool')
          .map((contribution) => contribution.name),
      );
      return tools.map((tool) => tool.name).filter((toolName) => providerToolNames.has(toolName));
    },
    [capabilityRevision],
  );

  const getReferenceContributors = useCallback(() => {
    return capabilityLoadResultRef.current?.referenceContributors ?? [];
  }, [capabilityRevision]);

  const querySearchDocuments = useCallback(
    async (query: string, limit: number): Promise<readonly SearchDocumentRecord[]> => {
      if (initPromiseRef.current) await initPromiseRef.current;
      const binding = localMetadataBindingRef.current;
      if (!binding || !(await binding.readSearchRevision())) return [];
      return binding.searchDocuments.query({
        partition: binding.searchPartition,
        text: query,
        limit,
      });
    },
    [],
  );

  useEffect(() => {
    submitRef.current = submit;
    submitInternalContinuationRef.current = submitInternalContinuation;
    return () => {
      if (submitRef.current === submit) {
        submitRef.current = null;
      }
      if (submitInternalContinuationRef.current === submitInternalContinuation) {
        submitInternalContinuationRef.current = null;
      }
    };
  }, [submit, submitInternalContinuation]);

  return {
    submit,
    cancel,
    clearHistory,
    confirmTool,
    updateModel,
    updateMode,
    getContextTokenCount,
    compactContext,
    getMessageQueueSnapshot,
    refreshSharedMetadataAtBoundary,
    resumeQueuedMessages,
    promoteQueuedMessage,
    cancelQueuedMessage,
    discardQueuedContinuation,
    editQueuedMessage,
    validateLlmConfig,
    applyLlmConfig,
    executeSkill,
    listSkills: () =>
      (piRuntimeOwnerRef.current?.skills ?? []).map((skill) => ({
        name: skill.name,
        description: skill.description,
      })),
    getToolRegistry: () => toolRegistryRef.current ?? undefined,
    listMcpServers,
    listMcpTools,
    connectMcpServer,
    disconnectMcpServer,
    reconnectMcpServer,
    getCapabilityProviderSummaries,
    getCapabilityDiagnostics,
    listCapabilityTools,
    getReferenceContributors,
    querySearchDocuments,
    getConversationCatalog: () => {
      const owner = piRuntimeOwnerRef.current;
      if (!owner) return undefined;
      const project = async () =>
        (await owner.listConversations()).map((record) => ({
          id: record.conversationId,
          title: record.title,
          updatedAt: Date.parse(record.updatedAt),
          messageCount: record.messageCount,
        }));
      return {
        list: project,
        get: async (id) => (await project()).find((record) => record.id === id),
      };
    },
    getCurrentConversationId: () => conversationIdRef.current,
    resumeConversation,
    getHistory: () => projectPiHistoryToChatMessages(piRuntimeOwnerRef.current?.messages ?? []),
    getConversationPersistenceSnapshot: () => conversationPersistenceSnapshotRef.current,
    getPiRuntimeEvidence: () => piRuntimeOwnerRef.current?.getRuntimeEvidence() ?? null,
    getTimelineProjectionEvidence: () =>
      piEventAdapterRef.current?.readProjectionEvidence() ?? null,
    getPromptCompositionProjection: () =>
      piRuntimeOwnerRef.current?.getPromptCompositionProjection() ?? [],
    getWorkspaceBoardProjections: () => workspaceBoardProjectionsRef.current,
    getWorkspaceBoardDeliveryObservability: () =>
      mediaGenerationDeliveryHostRef.current?.getWorkspaceBoardDeliveryObservability() ?? {
        canonicalSubmissionCount: 0,
        resumeScanCount: 0,
        legacyFallbackCounts: {
          activeCanvas: 0,
          recentCanvas: 0,
          directWriter: 0,
          genericSendToCanvas: 0,
        },
      },
    getCreatorVisibleArtifacts: () => creatorVisibleArtifactsRef.current,
    getGeneratedOutputLifecycles: () => generatedOutputLifecyclesRef.current,
    syncRuntimeState: () => syncRuntimeProjection(),
    slashCommands,
    isReady,
  };
}

function resolveTuiBuiltinSkillRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDirectory, 'skills'),
    resolve(moduleDirectory, '../../../../../packages/neko-skills/skills'),
  ];
  const root = candidates.find((candidate) => existsSync(candidate));
  if (root === undefined) {
    throw new Error('TUI builtin Pi Skill packages are missing from the application bundle.');
  }
  return root;
}

/** Build system prompt with runtime context appended */
function buildSystemPromptWithContext(base: string, config: CLIConfig): string {
  const context = [
    `\n\n---\n\n## Runtime Context`,
    `- Working directory: ${config.workDir}`,
    `- OS: ${process.platform} ${process.arch}`,
    `- Model: ${config.model}`,
    `- Provider: ${config.provider}`,
  ];
  return base + context.join('\n');
}

function projectCliLlmParameters(
  config: CLIConfig,
  llmConfig: AgentLlmConfig,
): TuiParameterValidationResult {
  const manager = new ConfigManager({
    userConfigManager: new FileUserConfigManager(),
    workspacePath: config.workDir,
  });
  try {
    const providerId = config.chatModel?.providerId ?? config.provider;
    const modelId = config.chatModel?.modelId ?? config.model;
    const provider = manager.getProvider(providerId);
    if (!provider) {
      return {
        config: llmConfig,
        diagnostics: [{ code: 'provider-not-configured', providerId }],
      };
    }
    const model = manager.getModel(modelId);
    if (!model) {
      return {
        config: llmConfig,
        diagnostics: [{ code: 'model-not-configured', modelId }],
      };
    }

    const result = projectLlmParameters({ provider, model, llmConfig });
    if (result.diagnostics.length > 0) {
      return {
        config: llmConfig,
        diagnostics: result.diagnostics.map(({ code, field }) => ({ code, field })),
      };
    }
    return {
      config: llmConfig,
      chatOptions: result.chatOptions,
      providerOptions: result.providerOptions,
    };
  } finally {
    manager.dispose();
  }
}

function normalizeTurnSource(source: AgentQueuedMessageSource): AgentTurnSource {
  if (source === 'composer') return 'user';
  return source;
}

function displayKindForTurnSource(source: AgentTurnSource): AgentQueuedMessageDisplayKind {
  if (source === 'subagent-result-continuation') return 'subagent-continuation';
  if (source === 'system-continuation') return 'system-continuation';
  return 'user-message';
}

function deriveConversationTitle(messages: readonly ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) return '';
  const content = stringifyChatMessageContent(firstUserMessage.content).trim();
  if (!content) return '';
  return content.length > 50 ? `${content.slice(0, 50)}...` : content;
}

function projectPiHistoryToChatMessages(messages: readonly unknown[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (typeof message !== 'object' || message === null || !('role' in message)) return [];
    if (
      message.role !== 'system' &&
      message.role !== 'user' &&
      message.role !== 'assistant' &&
      message.role !== 'toolResult'
    ) {
      return [];
    }
    if (!('content' in message)) return [];
    const role = message.role === 'toolResult' ? 'tool' : message.role;
    const content = projectPiMessageContent(message.content);
    return [{ role, content }];
  });
}

function readLastPiAssistantText(messages: readonly unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      typeof message === 'object' &&
      message !== null &&
      'role' in message &&
      message.role === 'assistant' &&
      'content' in message
    ) {
      return projectPiMessageContent(message.content);
    }
  }
  return '';
}

function projectPiMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => {
      if (typeof part !== 'object' || part === null || !('type' in part)) return [];
      if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
        return [part.text];
      }
      if (part.type === 'thinking' && 'thinking' in part && typeof part.thinking === 'string') {
        return [part.thinking];
      }
      if (part.type === 'toolCall' && 'name' in part && typeof part.name === 'string') {
        return [`[tool] ${part.name}`];
      }
      return [];
    })
    .join('\n');
}

function stringifyChatMessageContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'image') return `[image] ${part.imageUrl}`;
      if (part.type === 'audio') return `[audio] ${part.audioUrl}`;
      if (part.type === 'video') return `[video] ${part.videoUrl}`;
      return '[content]';
    })
    .join('\n');
}
