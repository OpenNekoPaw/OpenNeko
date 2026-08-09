/**
 * Runtime public barrel.
 *
 * Canonical implementation owners live in the narrow runtime subdirectories
 * documented in README.md:
 * - session/: host-neutral session bootstrap, conversation/run ownership,
 *   cancellation, queueing, and exact Tool Call execution identity.
 * - projection/: versioned conversation projection store and operation buffer.
 * - turn/: one user-message dispatch plus context, artifact, and multimodal
 *   assembly around the Pi conversation runtime.
 * - capability/: Agent-side consumption of AgentCapabilityProvider
 *   contributions into Agent registries and bindings.
 * - stream/: pure Markdown/composite render projection.
 *
 * Existing owner directories remain canonical for input/message
 * projection, context, memory, prompt, Skill lifecycle, permission, approval,
 * plan projection, and commands. This barrel preserves package imports; it
 * must not become a governance or compatibility layer.
 */
export {
  createAgentContentAccessDiagnostic,
  isAgentContentAccessReady,
  type AgentContentAccessRuntime,
  type AgentContentAccessDiagnostic,
  type AgentContentAccessDiagnosticCode,
  type AgentContentAccessBaseInput,
  type AgentContentAccessOperationResult,
  type AgentContentAccessStatus,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentProviderAssetResult,
} from './capability/agent-content-access-runtime';

export {
  AGENT_CONFIG_CONTROLLER_ROUTE_TYPES,
  AGENT_CONTENT_CONTROLLER_ROUTE_TYPES,
  AGENT_CONVERSATION_CONTROLLER_ROUTE_TYPES,
  AGENT_PROJECTION_CONTROLLER_ROUTE_TYPES,
  AGENT_SHARED_CONTROLLER_ROUTE_TYPES,
  AGENT_SKILL_CONTROLLER_ROUTE_TYPES,
  createAgentHostMessageController,
  tryHandleAgentConfigControllerRoute,
  tryHandleAgentContentControllerRoute,
  tryHandleAgentConversationControllerRoute,
  tryHandleAgentProjectionControllerRoute,
  tryHandleAgentSkillControllerRoute,
  type AgentConfigControllerEffectPort,
  type AgentConfigControllerMessage,
  type AgentConfigControllerRouteOperation,
  type AgentConversationControllerEffectPort,
  type AgentContentControllerMessage,
  type AgentContentControllerEffectPort,
  type AgentContentControllerRouteOperation,
  type AgentConversationControllerMessage,
  type AgentConversationControllerRouteOperation,
  type AgentConversationControllerTurnRequest,
  type AgentHostConnectionIdentity,
  type AgentHostMessageController,
  type AgentHostControllerConnection,
  type AgentHostControllerEffectPorts,
  type AgentHostControllerSubscription,
  type AgentHostRouteEffectContext,
  type AgentHostRouteEffectPort,
  type AgentProjectionControllerMessage,
  type AgentProjectionControllerEffectPort,
  type AgentProjectionControllerRouteOperation,
  type AgentSharedControllerMissingRouteCoverage,
  type AgentSharedControllerUnexpectedRouteCoverage,
  type AgentSkillControllerMessage,
  type AgentSkillControllerEffectPort,
  type AgentSkillControllerRouteOperation,
} from './host-controller';

export {
  createAgentDocumentReaderModuleUnavailableError,
  type AgentDocumentReaderHostSurface,
} from './document-module-diagnostics';

export {
  createHostAgentContentAccessRuntime,
  type CreateHostAgentContentAccessRuntimeOptions,
} from './capability/host-content-access-runtime-adapter';

export {
  collectCreatorVisibleArtifacts,
  collectCreatorVisibleArtifactsFromTurnProjection,
  deliverCreatorVisibleArtifactsFromTurnProjection,
  type AgentCreatorVisibleArtifactDeliveryInput,
  type AgentCreatorVisibleArtifactDeliveryOutcome,
  type AgentCreatorVisibleArtifactDeliveryPort,
  type CreatorVisibleArtifactCandidate,
  type CreatorVisibleArtifactCollectionInput,
  type CreatorVisibleToolResult,
} from './turn/creator-visible-artifact-collector';

export {
  buildAgentRuntimeStateSnapshotMessage,
  createAgentStateRuntime,
  type AgentStateRuntime,
  type AgentStateRuntimeEntry,
  type UpdateAgentStateRuntimeInput,
} from './agent-state-runtime';

export {
  createConversationProjectionOperationBuffer,
  isCoalescibleConversationProjectionOperation,
  type ConversationProjectionOperationBuffer,
} from './projection/conversation-projection-operation-buffer';

export {
  createConversationProjectionStore,
  type ConversationProjectionListener,
  type ConversationProjectionStore,
} from './projection/conversation-projection-store';

export {
  ProjectionAttachmentProtocolError,
  createConversationProjectionAttachmentServer,
  type ConversationProjectionAttachmentHostFrame,
  type ConversationProjectionAttachmentServer,
  type ConversationProjectionAttachmentServerOptions,
} from './projection/conversation-projection-attachment-server';

export { projectPiConversationEntries } from './projection/pi-conversation-history-projector';

export {
  createAgentResourceDisplayProjector,
  type AgentResourceDisplayLease,
  type AgentResourceDisplayHostIdentity,
  type AgentResourceDisplayProjector,
  type AgentResourceDisplayRegistrationPort,
} from './projection/agent-resource-display-projector';

export {
  assertCompleteDesktopAgentNeutralFacts,
  createDesktopAgentNeutralFacts,
  type CreateDesktopAgentNeutralFactsInput,
  type DesktopAgentConversationEvidence,
  type DesktopAgentFactsTurnResult,
} from './projection/desktop-agent-facts';

export {
  createDesktopAgentFactsProjector,
  type DesktopAgentFactsProjector,
} from './projection/desktop-agent-facts-projector';

export {
  ExecutionOwnershipRegistryError,
  createExecutionOwnershipRegistry,
  createToolCallExecution,
  type ExecutionOwnerKind,
  type ExecutionOwnershipAttachment,
  type ExecutionOwnershipRegistry,
  type ExecutionRef,
  type OwnedExecution,
  type ToolCallExecution,
  type ToolCallExecutionIdentity,
} from './session/execution-ownership';

export {
  ConversationRunRegistryError,
  createConversationRunRegistry,
  type ConversationRunCancellationHandle,
  type ConversationRunRegistry,
  type ConversationRunRegistryErrorCode,
} from './session/conversation-run-registry';

export {
  AgentMessageQueueOperationError,
  createAgentConversationMessageQueue,
  createAgentRuntimeSessionMessageQueuePort,
  type AgentConversationMessageQueue,
  type AgentMessageQueueOperationErrorCode,
  type AgentRuntimeSessionMessageQueuePort,
  type CreateAgentConversationMessageQueueOptions,
  type EnqueueAgentMessageInput,
} from './session/agent-message-queue';

export {
  createAgentCapabilityRuntimeRegistries,
  type AgentCapabilityRuntimeRegistries,
} from './capability/capability-runtime-registries';

export {
  EXTERNAL_RESEARCH_CAPABILITY_PROVIDER_ID,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  createExternalResearchCapabilityProvider,
  resolveExternalResearchCapability,
  type CreateExternalResearchCapabilityProviderOptions,
  type ExternalResearchProviderResolver,
} from './capability/external-research-capability-provider';

export {
  createFakeExternalResearchProvider,
  type FakeExternalResearchProviderOptions,
} from './capability/fake-external-research-provider';

export {
  createMcpExternalResearchProvider,
  type CreateMcpExternalResearchProviderOptions,
} from './capability/mcp-external-research-provider';

export { createExternalResearchCapabilityProviderFromMcpConfig } from './capability/external-research-mcp-capability';

export {
  saveResearchNoteMarkdown,
  serializeResearchNoteMarkdown,
  type ResearchNoteMarkdownFs,
  type SaveResearchNoteMarkdownInput,
} from './capability/research-note-markdown';

export {
  projectExternalResearchToolResult,
  type ExternalResearchTraceProjection,
} from './capability/external-research-projection';

export {
  createCapabilityRuntimeBindingStore,
  mergeCapabilityRuntimeBindings,
  type CapabilityRuntimeBindingLogger,
  type CapabilityRuntimeBindingStore,
  type CapabilityRuntimeBindings,
} from './capability/capability-runtime-bindings';

export {
  buildConfigBridgeGlobalErrorMessage,
  runConfigBridgeQueryRuntime,
  type ConfigBridgeRuntimeLogger,
  type ConfigBridgeQueryConfigState,
  type ConfigBridgeQueryMessage,
  type ConfigBridgeQueryRequest,
  type ConfigBridgeQueryRuntimeDeps,
  type ConfigBridgeQueryRuntimeResult,
} from './config-bridge-runtime';

export {
  createSubAgentEventRuntime,
  type ProjectSubAgentEventForConversationInput,
  type SubAgentEventRuntime,
} from './subagent-event-runtime';

export {
  createWorkspaceInputProcessorRuntime,
  type WorkspaceInputProcessorRuntime,
  type WorkspaceInputProcessorRuntimeOptions,
} from './turn/workspace-input-processor-runtime';

export {
  createDeveloperModeTemporaryProcessorRequest,
  createAgentExternalProcessorRuntime,
  type AgentExternalProcessorRuntime,
  type AgentExternalProcessorRuntimeOptions,
  type AgentExternalProcessorPlanInput,
  type AgentExternalProcessorPlanResult,
  type AgentExternalProcessorReadyPlan,
  type AgentExternalProcessorBlockedPlan,
  type AgentExternalProcessorResultInput,
  type AgentExternalProcessorResultProjection,
  type AgentExternalProcessorChainApprovalContinuationInput,
  type AgentExternalProcessorChainRun,
  type AgentExternalProcessorChainStageInput,
  type AgentExternalProcessorChainStagePlanResult,
  type AgentExternalProcessorChainStageRecord,
  type AgentExternalProcessorChainStartInput,
  type AgentExternalProcessorChainTargetChangeInput,
  type DeveloperModeTemporaryProcessorRequest,
  type DeveloperModeTemporaryProcessorRequestInput,
  type DeveloperModeTemporaryProcessorDefinition,
} from './capability/external-processor-runtime';

export {
  createAgentTurnContext,
  inferAgentTurnProjectType,
  type AgentTurnActiveEditorLike,
  type AgentTurnContext,
  type AgentTurnContextInput,
  type AgentTurnProjectType,
} from './turn/agent-turn-context';

export {
  buildAgentExecutionMetadata,
  buildAgentAssistantMessageFromStream,
  buildAgentErrorAssistantMessage,
  buildAgentProjectFileSearchPlan,
  buildAgentTurnConfigurationPlan,
  buildAgentTurnContextPatch,
  buildAgentTurnRuntimePlan,
  buildAgentTurnExecutionMetadata,
  buildProviderExpressionTargets,
  buildRuntimeMediaModelSelections,
  buildEnhancedAgentMessage,
  createAgentMessageId,
  executeAgentProjectFileSearch,
  runAgentMessageTurnRuntime,
  projectAgentFileMentions,
  projectAgentMentionExtras,
  projectAgentProjectFilesMessage,
  projectContextReferences,
  projectThreeReferenceContextImageResources,
  mergeReferencedMediaImageAttachments,
  prepareAgentMessageDispatch,
  prepareAgentMessageFileReferences,
  appendAmbientCanvasSystemPrompt,
  selectAgentTurnProvider,
  shouldPersistAgentAssistantStream,
  type AgentAmbientCanvasNode,
  type AgentLlmRuntimeOptions,
  type AgentExecutionMetadataInput,
  type AgentStreamPersistenceSnapshot,
  type BuildAgentAssistantMessageInput,
  type BuildAgentErrorAssistantMessageInput,
  type AgentMessageFileReferenceProcessor,
  type AgentProviderCandidate,
  type AgentProjectFileCandidate,
  type AgentProjectFileSearchPurpose,
  type AgentProjectFileSearchPlan,
  type AgentProjectFileSearchPlanInput,
  type AgentProjectFilesProjectionInput,
  type AgentProjectMentionCandidate,
  type AgentProcessedReferencedMedia,
  type AgentReferencedMediaProcessor,
  type AgentReferencedFileContent,
  type AgentMessageDispatchRoute,
  type AgentMessageExecutionOverrides,
  type AgentMessageIdOptions,
  type AgentMessageRuntimeRequest,
  type AgentMessageTurnAgentExecutionInput,
  type AgentMessageTurnPreconditionReason,
  type AgentMessageTurnRuntimeMessage,
  type AgentThreeReferenceImageResource,
  type AgentTurnConfigurationPlan,
  type AgentTurnConfigurationPlanInput,
  type AgentTurnContextPatch,
  type AgentTurnContextPatchInput,
  type AgentTurnProviderSelection,
  type AgentTurnProviderSelectionInput,
  type AgentTurnRuntimePlan,
  type AgentTurnRuntimePlanInput,
  type BuildEnhancedAgentMessageInput,
  type ExecuteAgentProjectFileSearchInput,
  type MergeReferencedMediaImageAttachmentsInput,
  type PreparedAgentMessageDispatch,
  type PreparedAgentMessageFileReferences,
  type PrepareAgentMessageDispatchInput,
  type PrepareAgentMessageFileReferencesInput,
  type ProviderExpressionTargetConfig,
  type RunAgentMessageTurnRuntimeInput,
  type RunAgentMessageTurnRuntimeResult,
} from './turn/message-runtime';

export type { AgentFlatPurposeModelRefs } from '@neko/agent-contracts';

export {
  AGENT_DOCUMENT_CONTEXT_INTENTS,
  AGENT_RETRY_CREATION_MESSAGE,
  buildAgentCreationMessage,
  buildAgentFileContextPayload,
  buildAgentPromptCommandMessage,
  buildAgentRetryCreationMessage,
  buildAgentScriptCommandMessage,
  createAgentFileContextPayloadId,
  inferAgentCreationIntentFromFilePath,
  inferAgentFileContextType,
  type AgentPromptCommandKind,
  type AgentScriptCommandKind,
  type BuildAgentCreationMessageInput,
  type BuildAgentFileContextPayloadInput,
  type BuildAgentPromptCommandMessageInput,
  type BuildAgentScriptCommandMessageInput,
} from './agent-entry-intent-runtime';

export {
  isLocalMediaFilePath,
  messageResourceProjectionKey,
  projectConversationProjectionPatchForResourceDisplay,
  projectConversationProjectionSnapshotForResourceDisplay,
  projectMessageForResourceDisplay,
  projectMessagesForResourceDisplay,
  projectResourceValue,
  type MessageResourceProjectionOptions,
} from '../input/message-resource-projector';

export type {
  BackfillSink,
  IPerceptionPipeline,
  MediaProbePort,
  PerceptionClientPort,
  PerceptionPipelinePorts,
  PerceptualAssetPort,
  PerceptualAssetResolverPort,
  ResolvedPerceptualAsset,
} from '../perception';
export { createPerceptionPipeline, PerceptionPipeline } from '../perception';

export {
  buildActiveConversationMessage,
  buildConversationListMessage,
  type ActiveConversationMessage,
  type ActiveConversationView,
  type ConversationListItemView,
  type ConversationListMessage,
  type ConversationViewSource,
} from '../session/conversation-host-message';

export {
  buildChatAmbientCanvasUpdateMessage,
  buildChatContextInjectionMessage,
  buildChatExternalInputMessage,
  buildChatPluginCommandsMessage,
  buildChatRestorePlan,
  buildChatTabStateMessage,
  buildInvalidWebviewPayloadMessage,
  requireActiveConversationTabBinding,
  syncActiveConversationFromTabState,
  updateTabStateRuntime,
  type BuildChatRestorePlanInput,
  type ChatRestorePlan,
  type ChatRestorePlanAction,
  type ConversationTabBinding,
  type ConversationTabRuntimeEffects,
  type ConversationTabSyncReason,
  type ConversationTabSyncResult,
  type SyncActiveConversationFromTabStateInput,
  type UpdateTabStateRuntimeInput,
  type UpdateTabStateRuntimeResult,
} from './conversation-tab-runtime';

export {
  resolveRequiredConversationRoute,
  type ResolveRequiredConversationRouteInput,
  type ResolveRequiredConversationRouteResult,
} from './conversation-route-runtime';

export {
  buildCompressionErrorMessage,
  buildCompressionResultMessage,
  buildContextTokenCountMessage,
  type CompressionErrorMessage,
  type CompressionResultData,
  type CompressionResultMessage,
  type ContextTokenCountMessage,
  type ContextWebviewMessage,
} from '../session/context-host-message';

export {
  compressAgentContext,
  sendAgentContextTokenCount,
  type AgentContextControlAction,
  type AgentContextControlBaseInput,
  type AgentContextControlResult,
  type CompressAgentContextInput,
  type SendAgentContextTokenCountInput,
} from './turn/context-control-runtime';

export {
  buildRuntimePluginsAvailableMessage,
  createRuntimePluginSlashCommandRegistry,
  expandRuntimePluginTransferInputs,
  type BuildPluginTransferPlanInput,
  type PluginSlashCommandDef,
  type RegisteredPluginSlashCommand,
  type RuntimePluginSlashCommandRegistry,
} from './plugin-transfer-runtime';

export {
  extractFileReferencePaths,
  formatDocumentAttachmentReference,
  formatFileAttachmentContent,
  formatMediaAttachmentReference,
  formatReadDocumentInstruction,
  formatUnreadableFileAttachment,
  normalizeAgentRuntimePromptLocale,
  parseBase64DataUrl,
  projectAgentMessageAttachments,
  type AgentAttachmentProjectionDeps,
  type AgentAttachmentProjectionError,
  type AgentBase64ImageAttachment,
  type AgentProcessedAttachments,
  type AgentRuntimePromptLocale,
} from '../input/attachment-projection';

export {
  buildTurnMultimodalContextPacket,
  combineMultimodalContextPackets,
  applyEvidenceFeedbackPolicy,
  createCanvasSelectionContextPacket,
  createMediaAttachmentContextPacket,
  createTextContextPacket,
  createToolProducedMultimodalEvidenceFeedback,
  filterToolsByModalityAvailability,
  loadPacketMediaPayloads,
  projectGeneratedArtifactReference,
  summarizeEvidenceFeedback,
  type BuildTurnMultimodalContextPacketInput,
  type CanvasSelectionContextNode,
  type CanvasSelectionContextOptions,
  type CombineMultimodalContextPacketsOptions,
  type MediaAttachmentContextInput,
  type TextContextInput,
  type ToolProducedMultimodalEvidenceInput,
} from './turn/multimodal-context-packet';

export {
  CapabilityRegistryRuntime,
  type CapabilityDiscoveryDeps,
  type CapabilityProtocolInfo,
  type CapabilityRegistryRuntimeDeps,
  type CapabilityRegistryRuntimeLogger,
} from './capability/capability-registry-runtime';

export {
  CanvasAmbientContextRuntime,
  DEFAULT_CANVAS_AMBIENT_SCOPE_ID,
  projectCanvasAssetChangeSummary,
  projectCanvasChangeSummary,
  readCanvasNodeAssetKind,
  readCanvasNodeAssetUri,
  summarizeCanvasNode,
  type CanvasAssetChangeInput,
  type CanvasAmbientContextRuntimeOptions,
  type CanvasAmbientContextScopeState,
  type CanvasChangeInput,
  type CanvasChangeSummary,
  type SelectedNodeSummary,
} from './turn/canvas-ambient-context-runtime';
