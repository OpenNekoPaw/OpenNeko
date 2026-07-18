/**
 * Runtime public barrel.
 *
 * Canonical implementation owners live in the narrow runtime subdirectories
 * documented in README.md:
 * - session/: host-neutral session bootstrap, manager, pool, controller, and
 *   host-neutral product projection around the Pi conversation runtime.
 * - runner/: one configured session execution port, confirmation flow, cancel,
 *   history, and queue contracts.
 * - turn/: one user-message dispatch, provider/model selection, context and
 *   attachment assembly, runner configuration, stream processing, and
 *   assistant-message persistence.
 * - capability/: Agent-side consumption of AgentCapabilityProvider
 *   contributions into Agent registries and bindings.
 * - stream/: event stream projection, background task observation, and stream
 *   state.
 *
 * Existing owner directories remain canonical for input/message
 * projection, context, memory, prompt, Skill lifecycle, permission, approval,
 * plan/task projection, and commands. This barrel preserves package imports; it
 * must not become a governance or compatibility layer.
 */
export {
  createAgentContentAccessDiagnostic,
  createAgentContentAccessFailureResult,
  isAgentContentAccessReady,
  toAgentContentAccessDiagnostics,
  type AgentContentAccessRuntime,
  type AgentContentAccessRuntimeRequest,
  type AgentContentAccessCaller,
  type AgentContentAccessDiagnostic,
  type AgentContentAccessDiagnosticCode,
  type AgentContentAccessBaseInput,
  type AgentContentAccessOperationResult,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
  type AgentResourceProjectionInput,
  type AgentResourceProjectionResult,
} from './capability/agent-content-access-runtime';

export {
  createAgentProjectResourceCacheTarget,
  type AgentProjectResourceCacheTarget,
} from './resource-cache-runtime';

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
  buildConfigChangedRuntimeMessage,
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
} from './capability/external-processor-runtime';

export {
  createTimelineContextRuntime,
  type BuildTimelineContextPacketInput,
  type TimelineContextEditorLike,
  type TimelineContextRuntime,
  type TimelineContextRuntimeOptions,
} from './turn/timeline-context-runtime';

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
  mergeReferencedMediaImageAttachments,
  prepareAgentMessageDispatch,
  prepareAgentMessageFileReferences,
  appendAmbientCanvasSystemPrompt,
  summarizeAgentEventProgress,
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
  type AgentMessageTurnMediaExecutionInput,
  type AgentMessageTurnRuntimeMessage,
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

export type { AgentFlatPurposeModelRefs } from '@neko-agent/types';

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
  projectMessageForResourceDisplay,
  projectMessagesForResourceDisplay,
  projectResourceValue,
  updateBackgroundTaskToolResultUrls,
  type MessageResourceUpdateResult,
  type MessageResourceProjectionOptions,
} from '../input/message-resource-projector';

export {
  applyAgentStreamEventToState,
  createAgentStreamMessageId,
  createAgentStreamProjectionState,
  finalizeAgentStreamProjectionState,
  projectAgentStreamEventToHostMessages,
  projectAgentStreamEventToWebviewMessages,
  type AgentStreamProjectionMessage,
  type AgentStreamProjectionState,
  type AgentStreamCompositeProjector,
  type AgentStreamFinalizeOptions,
  type AgentStreamMessageIdOptions,
  type AgentStreamStateOptions,
  type AgentStreamStateUpdate,
  type AgentStreamWebviewMessage,
  type CollectedToolCall,
  type ProjectAgentStreamEventToHostMessagesInput,
  type ProjectAgentStreamEventToWebviewMessagesInput,
} from './stream/agent-stream-state';

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
  applyToolResultBackfillToResult,
  mergeToolResultAttachments,
  mergeToolResultBackfillData,
  mergeToolResultPerceptionCards,
  type ApplyToolResultBackfillResult,
  type BackfillableToolResult,
} from './tool-result-backfill';

export {
  createAgentTurnTimelineAccumulator,
  type AgentTurnTimelineAccumulator,
  type AgentTurnTimelineAccumulatorUpdate,
} from './stream/agent-turn-timeline-accumulator';

export {
  AgentEventStreamRuntimeProcessor,
  type AgentEventStreamRuntimeBackgroundTasks,
  type AgentEventStreamRuntimeMessage,
  type ProcessAgentEventStreamRuntimeInput,
} from './stream/agent-event-stream-runtime';

export {
  persistAgentStreamBackgroundTaskResultUrls,
  projectAgentStreamBackgroundTaskProgress,
  projectAgentStreamBackgroundTaskStart,
  type AgentStreamBackgroundTaskProgressInput,
  type AgentStreamBackgroundTaskProgressProjection,
  type AgentStreamBackgroundTaskStartInput,
  type AgentStreamBackgroundTaskStartProjection,
  type PersistAgentStreamBackgroundTaskResultUrlsInput,
} from './stream/agent-stream-background-task';

export {
  startAgentStreamBackgroundTaskObserver,
  type AgentStreamBackgroundTaskDeliveryContext,
  type AgentStreamBackgroundTaskIgnoredEvent,
  type AgentStreamBackgroundTaskObservedProgress,
  type AgentStreamBackgroundTaskProgressErrorEvent,
  type AgentStreamBackgroundTaskProgressEvent,
  type AgentStreamBackgroundTaskTerminalEvent,
  type ObserveAgentStreamBackgroundTaskProgressInput,
  type StartAgentStreamBackgroundTaskObserverInput,
  type StartAgentStreamBackgroundTaskObserverResult,
} from './stream/agent-stream-task-observer';

export {
  runAgentMediaTurn,
  type AgentMediaTurnExecutionInput,
  type AgentMediaTurnIgnoredTaskEvent,
  type AgentMediaTurnProgressErrorEvent,
  type AgentMediaTurnRuntimeMessage,
  type AgentMediaTurnTaskEvent,
  type RunAgentMediaTurnInput,
  type RunAgentMediaTurnResult,
} from './turn/media-turn-runtime';

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
  buildRuntimePluginSlashCommandDispatch,
  buildRuntimePluginsAvailableMessage,
  createRuntimePluginSlashCommandRegistry,
  expandRuntimePluginTransferInputs,
  type BuildPluginTransferPlanInput,
  type PluginSlashCommandDef,
  type RegisteredPluginSlashCommand,
  type RuntimePluginSlashCommandDispatch,
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
  createTimelineContextPacketFromEditor,
  createTimelineSelectionContextPacket,
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
  type TimelineEditorContextInput,
  type TimelineSelectionContextElement,
  type TimelineSelectionContextOptions,
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
