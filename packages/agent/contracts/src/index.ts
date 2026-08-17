/**
 * @neko/agent-contracts — Shared type definitions for the neko-agent ecosystem
 *
 * Host-neutral contracts consumed by Agent runtimes, provider adapters, and Webviews.
 */

export * from './agent-ai-source';
export * from './agent-context';
export * from './agent-home';
export * from './agent-image-transport';
export * from './agent-availability';
export * from './agent-interaction-binding';
export * from './agent-launch';
export * from './agent-launch-host';
export * from './agent-model-catalog';
export { parseAgentFlatPurposeModelRefs } from './agent-purpose-model';
export * from './agent-conversation-context';
export * from './assistant-resource-host';
export * from './agent-draft-submit';
export * from './agent-draft-mention-search';
export * from './agent-entry-intent';
export * from './agent-token-budget';
export * from './agent-turn-capability';
export * from './config';
export * from './desktop-agent-connection';
export * from './desktop-agent-facts';
export * from './effective-agent-configuration';
export * from './extension-catalog';
export * from './extension-management';
export * from './extension-management-host';
export * from './message-attachment';
export * from './mcp';
export * from './multimodal-context';
export * from './perception-tool';
export * from './recovery-guidance';
export * from './resource-display-projection';

export type {
  ChildRunKind,
  ChildRunScope,
  ConversationRunScope,
  RuntimeScopeDiagnostic,
  RuntimeScopeDiagnosticCode,
  RuntimeScopeValidationResult,
} from './runtime-scope';
export {
  formatChildRunScope,
  formatRunScope,
  validateChildRunScope,
  validateConversationRunScope,
  validateRuntimeScopeOwner,
} from './runtime-scope';
export type { ConversationConfigState, TurnConfigSnapshot } from './runtime-config';
export {
  createConversationConfigState,
  createTurnConfigSnapshot,
  updateConversationConfigState,
} from './runtime-config';
export type {
  ProjectionAttachmentHostFrame,
  ProjectionAttachmentKey,
  ProjectionAttachmentProtocolDiagnostic,
  ProjectionAttachmentProtocolDiagnosticCode,
  ProjectionAttachRequest,
  ProjectionDetachMessage,
  ProjectionPatchFrame,
  ProjectionSnapshotAcknowledgement,
  ProjectionSnapshotFrame,
} from './projection-attachment';
export { isSameProjectionAttachment } from './projection-attachment';
export type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ConversationProjectionUpdate,
  ConversationTurnProjection,
} from './conversation-projection';
export {
  applyAgentTurnProjectionOperations,
  applyConversationProjectionPatch,
  cloneAgentTurnProjectionItem,
  cloneConversationProjectionSnapshot,
} from './conversation-projection';

// Message protocol
export type {
  Message,
  MessageTurnTiming,
  MessageContextReference,
  AgentFileReference,
  AgentFileReferenceMediaType,
  AgentFileReferenceSource,
  AgentAuthorizedContentReferenceContextData,
  ToolCall,
  ToolCallProgress,
  ContentBlock,
  ContentBlockType,
  CodeDiff,
  CanvasLifecycleBlockData,
  CompositeBlockData,
  CompositeSection,
  CompositeTemplate,
  MediaRef,
} from './message';
export { parseMessageContextReference } from './message';
export {
  AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND,
  isAgentAuthorizedContentReferenceContextData,
} from './message';
export type {
  CloseCurrentConversationTabInput,
  CloseCurrentConversationTabProjection,
  SlashCommandResultEffect,
  SlashCommandResultProjection,
  SlashCommandResultProjectionOptions,
} from './command-result-contract';
export {
  buildPluginSlashCommandId,
  type PluginSlashCommandIdInput,
} from './plugin-command-contract';
export type {
  AgentHostKind,
  AgentHostRouteCoverageAuditInput,
  AgentHostRouteCoverageDiagnostic,
  AgentHostRouteCoverageInput,
  AgentHostRouteAuthority,
  AgentHostRouteAuthorityRecord,
  AgentHostRouteConnectionRequirement,
  AgentHostRouteDiagnostic,
  AgentHostRouteFutureOwner,
  AgentHostRouteScopeRequirement,
  AgentHostRouteSupport,
  AgentHostRouteSupportRecord,
  AgentHostRouteUnavailableDiagnostic,
  AgentHostRouteUnavailableSupport,
  AgentHostWorkspaceScopeRequiredDiagnostic,
  AgentDraftHostRuntimeAdapter,
  AgentHostRuntimeAdapter,
  AgentHostRuntimeSubscription,
  AgentMessageSubmissionReceipt,
  AgentNonSubmissionWebviewMessage,
  AgentWebviewToHostMessageType,
  AgentWebviewToHostMessageTypeCoverage,
} from './agent-host-runtime-adapter';
export {
  AGENT_HOST_ROUTE_AUTHORITY,
  ELECTRON_AGENT_HOST_ROUTE_COVERAGE,
  ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS,
  classifyAgentHostRoute,
  createAgentHostRouteCoverageDiagnostics,
  createAgentHostRouteUnavailableDiagnostic,
  createAgentHostWorkspaceScopeRequiredDiagnostic,
  createElectronAgentHostRouteUnavailableDiagnostic,
  requireAgentDraftHostRuntimeAdapter,
} from './agent-host-runtime-adapter';
export type { EnabledStateRecord } from './enabled-state';

export type {
  AgentCommandCatalogEntry,
  AgentInputBindingRequirement,
  AgentInputCatalogEntry,
  AgentInputPhaseRequirement,
  AgentInputSourceReceipt,
  AgentInputTriggerKind,
  AgentInputTriggerPrefix,
  AgentMentionCatalogEntry,
  AgentSkillInvocationCatalogEntry,
  ParsedAgentInputTrigger,
  ParseAgentInputTriggerOptions,
} from './agent-input-trigger';
export {
  AGENT_INPUT_TRIGGER_PREFIXES,
  getAgentInputTriggerKind,
  getAgentInputTriggerPrefix,
  isAgentInputCatalogEntryExecutable,
  isAgentInputTriggerBoundary,
  isAgentInputTriggerPrefix,
  normalizeAgentInputTriggerName,
  parseAgentInputCatalog,
  parseAgentInputCatalogEntry,
  parseAgentInputTrigger,
} from './agent-input-trigger';
export type {
  PluginSlashCommandDef,
  PluginSlashCommandInvocation,
  RegisteredPluginSlashCommand,
} from './plugin-slash-command';
export { normalizeSlashCommandName } from './slash-command-utils';
export type {
  ChatWorkspaceModelStateInput,
  ChatWorkspaceModelStateProjection,
  MessageModelProjection,
  MessageModelProjectionInput,
  MediaModelDefaults,
  MediaModelSelectionDefaultsProjection,
  MediaModelSelectionState,
  PluginSlashCommandProjection,
  ProjectFilesProjection,
  ProjectMentionItem,
  ProjectMentionItemKind,
  SessionModeMediaSelectionProjection,
  SettingsDataProjection,
} from './config-message-projector';
export type {
  AgentStateEntry,
  AgentStateStoreProjection,
  ProjectAgentPhaseInput,
  ProjectAgentStateSnapshotInput,
} from './agent-state-contract';
export type {
  ActiveConversationPayload,
  ActiveConversationProjection,
  ActiveConversationProjectionInput,
  ConversationErrorProjectionInput,
  ConversationMessagesProjection,
  ConversationStreamingState,
} from './conversation-ui-contract';
export type {
  CompressionErrorProjection,
  CompressionResultProjection,
  ContextTokenCountProjection,
  ProjectCompressionErrorInput,
  ProjectCompressionResultInput,
  ProjectContextTokenCountInput,
} from './context-state-contract';
export type {
  AgentWorkItem,
  AgentWorkItemStore,
  AgentWorkItemStatus,
  AgentWorkItemStep,
  AgentWorkItemStepStatus,
  SubAgentRuntimeStatus,
  SubAgentWorkItem,
  SubAgentWorkItemEvent,
  SubAgentWorkItemEventType,
} from './work-item';
export type {
  AgentCapabilityContribution,
  AgentCapabilityContributionIdentity,
  AgentCapabilityContributionKind,
  AgentCapabilityDiagnostic,
  AgentCapabilityDiagnosticPhase,
  AgentCapabilityInjectionContext,
  AgentCapabilityPermissionMode,
  AgentCapabilityPermissionRequirement,
  AgentCapabilityRegistryProjection,
  AgentCapabilitySlashCommandContribution,
  AgentCapabilitySource,
  AgentCapabilityTelemetryEvent,
  AgentCapabilityTelemetryEventKind,
  AgentCapabilityTelemetryReason,
  AgentCapabilityTelemetrySnapshot,
  AgentCapabilityPromptChainFragmentContribution,
  AgentArtifactExecutionCapabilityContribution,
  AgentArtifactFacetsContribution,
  AgentLifecycleCapabilityContribution,
  AgentEntityMemoryContributorFacetContribution,
  AgentEntityProviderFacetContribution,
  AgentMediaTextExtractorFacetContribution,
  AgentPerceptionCapabilityCachePolicy,
  AgentPerceptionCapabilityConfidenceKind,
  AgentPerceptionCapabilityDeviceTier,
  AgentPerceptionCapabilityExecutionMode,
  AgentPerceptionCapabilityFacetContribution,
  AgentPerceptionCapabilityMediaKind,
  AgentPerceptionCapabilitySource,
  AgentPerceptionCapabilityTask,
  AgentPerceptionProviderFacetContribution,
  AgentRepresentationResolverFacetContribution,
  AgentReviewSurfaceFacetContribution,
  AgentSemanticFacetAvailability,
  AgentSemanticFacetActionAvailability,
  AgentSemanticIndexProviderFacetContribution,
  AgentInjectedCapabilitySet,
} from './capability';
export type {
  AgentGeneratedArtifactProjection,
  AgentMediaMetadata,
  AgentMediaModality,
  AgentMediaPayload,
  AgentMediaPayloadRequest,
  AgentMultimodalEvidenceRef,
  AgentMultimodalEvidenceFeedback,
  AgentMultimodalEvidenceFeedbackPolicy,
  AgentMultimodalEvidenceWithheldReason,
  AgentMultimodalHostAdapter,
  AgentMultimodalPacketLinkage,
  AgentToolModalityDeclaration,
} from './multimodal-tooling';
export type {
  AgentArtifactTransferPayload,
  ArtifactBackfillTransferPayload,
  ArtifactBlockPageTransferPayload,
  ArtifactExecutionSummaryTransferPayload,
  ArtifactSnapshotTransferPayload,
} from './artifact-transfer';
export {
  getAgentWorkItemRuntimeKey,
  isSubAgentWorkItem,
  projectSubAgentEventToWorkItem,
  toSubAgentWorkItemStatus,
} from './work-item-projector';
export {
  AUDIO_GENERATION_TOOLS,
  FILE_TOOLS,
  IMAGE_GENERATION_TOOLS,
  SEARCH_TOOLS,
  SHELL_TOOLS,
  VIDEO_GENERATION_TOOLS,
  getToolSummary,
} from './tool-summary';
export type {
  AgentTurnTimelineAppendOperation,
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineAssistantTextPayload,
  AgentTurnTimelineCompleteOperation,
  AgentTurnTimelineCompletion,
  AgentTurnTimelineCompletionStatus,
  AgentTurnTimelineCompositeItem,
  AgentTurnTimelineCompositePayload,
  AgentTurnTimelineErrorItem,
  AgentTurnTimelineErrorPayload,
  AgentTurnTimelineItem,
  AgentTurnTimelineItemCore,
  AgentTurnTimelineItemKind,
  AgentTurnTimelineItemStatus,
  AgentTurnTimelineOperation,
  AgentTurnTimelineParentAnchor,
  AgentTurnTimelineParentAnchorKind,
  AgentTurnTimelineReplaceOperation,
  AgentTurnTimelineSnapshotOperation,
  AgentTurnTimelineStructuralItem,
  AgentTurnTimelineTextItem,
  AgentTurnTimelineThinkingItem,
  AgentTurnTimelineThinkingPayload,
  AgentTurnTimelineToolCallItem,
  AgentTurnTimelineToolCallPayload,
  AgentTurnTimelineUpsertOperation,
} from './agent-turn-timeline';
export {
  AGENT_TURN_TIMELINE_ITEM_KINDS,
  AGENT_TURN_TIMELINE_ITEM_STATUSES,
  AGENT_TURN_TIMELINE_PARENT_ANCHORS,
} from './agent-turn-timeline';
export type {
  AgentMediaModelCategory,
  AgentMediaModelSelections,
  AgentFlatPurposeModelRefMap,
  AgentFlatPurposeModelRefs,
  AgentCreativityPreset,
  AgentLlmAdvancedParams,
  AgentLlmConfig,
  AgentMessageQueueErrorCode,
  AgentMessageQueueSnapshot,
  AgentModelSlot,
  AgentModelSlots,
  AgentReasoningEffort,
  AgentReasoningPreset,
  AgentContinuationMetadata,
  AgentQueuedMessageDisplayKind,
  AgentQueuedMessageConfigurationDraft,
  AgentQueuedMessageDraft,
  AgentQueuedMessageItem,
  AgentQueuedMessageSource,
  AgentTurnSource,
  AgentServiceTier,
  AgentTextVerbosity,
  AgentVerbosityPreset,
  ActiveConversationMessage,
  ConversationSnapshotMessage,
  AgentSessionDiagnosticCode,
  AgentSessionDiagnosticMessage,
  AgentPhaseMessage,
  AgentStateSnapshotMessage,
  AmbientCanvasNode,
  AmbientCanvasUpdateMessage,
  AgentCapabilityLifecycleResultMessage,
  CompressionErrorMessage,
  CompressionResultMessage,
  ConfigStateMessage,
  ConfirmToolWebviewMessage,
  ContextTokenCountMessage,
  ConversationListMessage,
  ConversationOnlyWebviewMessage,
  ConversationProjectionAttachmentHostFrame,
  DeleteConversationWebviewMessage,
  DragStartWebviewMessage,
  EmptyWebviewMessage,
  ErrorMessage,
  AgentHostToWebviewMessage,
  ExternalMessage,
  ActivateConversationWebviewMessage,
  RevealFileWebviewMessage,
  GetConversationSnapshotWebviewMessage,
  GlobalErrorMessage,
  HistoryClearedMessage,
  InjectContextMessage,
  InvokeAgentCapabilityLifecycleWebviewMessage,
  CanvasAuthoringHandoffDeclaredIntentHint,
  CanvasAuthoringMarkdownSourceFormat,
  CanvasAuthoringHandoffSourceFormat,
  CanvasAuthoringHandoffSourceKind,
  CanvasAuthoringHandoffDiagnostic,
  CanvasAuthoringHandoffPromptSpan,
  CanvasAuthoringHandoffSourceRange,
  CanvasAuthoringHandoffStableRef,
  CanvasAuthoringHandoffTargetHints,
  ExitCharacterDialogueSessionWebviewMessage,
  ExitEmbodyCharacterSessionWebviewMessage,
  MediaModelCategory,
  MessageQueueErrorMessage,
  MessageQueueSnapshotMessage,
  MessageQueuedMessage,
  MessageOfType,
  ModelRef,
  CharacterDialogueSessionExitedMessage,
  CharacterDialogueSessionStartedMessage,
  EmbodyCharacterSessionExitedMessage,
  EmbodyCharacterSessionStartedMessage,
  OpenFileWebviewMessage,
  OpenUrlWebviewMessage,
  PluginCommandsMessage,
  PluginsAvailable,
  PluginsAvailableMessage,
  PrefillInputMessage,
  ProjectionEndpointDiscoverRequest,
  ProjectionEndpointReadyMessage,
  ProviderMutationResultMessage,
  ProjectFileMentionInfo,
  ProjectFilesWebviewMessage,
  ProjectFilesMessage,
  ProjectMentionExtra,
  ProjectMentionExtraType,
  ProjectMentionMediaType,
  ProjectMentionSource,
  QueuedMessageEditRequestedMessage,
  RequestCanvasAuthoringHandoffWebviewMessage,
  ProtocolModelCategory,
  RuntimeMediaModelSelections,
  SearchProjectFilesWebviewMessage,
  SendMessageWebviewMessage,
  SendToPluginWebviewMessage,
  RevealDocumentLocatorWebviewMessage,
  SettingsDataMessage,
  SettingsUpdatedMessage,
  SlashCommandResultMessage,
  SubAgentEventMessage,
  TabStateMessage,
  UpdateSettingsWebviewMessage,
  UpdateTabStateWebviewMessage,
  AgentWebviewToHostMessage,
  AgentComposerInputCatalogMessage,
  GetAgentComposerInputCatalogWebviewMessage,
  AgentInputCatalogMessage,
  GetAgentInputCatalogWebviewMessage,
  InvokeAgentInputWebviewMessage,
} from './webview-protocol';
export type { AgentConfigDiagnostic, AgentConfigDiagnosticCode } from './config-diagnostic';
export {
  AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES,
  buildAmbientCanvasUpdateMessage,
  parseAmbientCanvasUpdateNodes,
  buildAgentPhaseMessage,
  buildAgentStateSnapshotMessage,
  buildAgentCapabilityLifecycleResultMessage,
  buildAgentComposerInputCatalogMessage,
  buildAgentInputCatalogMessage,
  buildAgentSessionDiagnosticMessage,
  buildConfigStateMessage,
  buildErrorMessage,
  buildExternalInputMessage,
  buildGlobalErrorMessage,
  buildHistoryClearedMessage,
  buildInjectContextMessage,
  buildMessageQueueErrorMessage,
  buildMessageQueueSnapshotMessage,
  buildQueuedMessageReleasedMessage,
  buildQueuedMessageEditRequestedMessage,
  buildCharacterDialogueSessionExitedMessage,
  buildCharacterDialogueSessionStartedMessage,
  buildEmbodyCharacterSessionExitedMessage,
  buildEmbodyCharacterSessionStartedMessage,
  buildPluginCommandsMessage,
  buildPluginsAvailableMessage,
  buildSubAgentEventMessage,
  buildTabStateMessage,
  isSessionMode,
  parseSendMessageWebviewMessage,
  parseAgentWebviewToHostMessage,
} from './webview-protocol';

// Builtin slash command metadata shared across runtime + UI surfaces
export type {
  BuiltinSlashCommandName,
  BuiltinSlashCommandCategory,
  BuiltinSlashCommandDefinition,
} from './builtin-slash-command';
export {
  BUILTIN_SLASH_COMMANDS,
  BUILTIN_SLASH_COMMAND_ALIASES,
  listBuiltinSlashCommands,
  getBuiltinSlashCommand,
} from './builtin-slash-command';

// Provider
export type { ConfiguredProvider } from './provider';

// Settings
export type { AIAssistantSettings, ShellExecutionMode } from './settings';
export { DEFAULT_SETTINGS } from './settings';

// Agent phase
export type { AgentPhase, AgentState } from './phase';

// UI types
export type {
  ConversationSummary,
  ConversationKind,
  CharacterDialogueSessionProjection,
  EmbodyCharacterSessionProjection,
  OpenTab,
  TabState,
  TabType,
  SessionMode,
  MediaUnderstandingCategory,
  MediaUnderstandingPurpose,
  MediaUnderstandingModelSource,
  MediaUnderstandingModelStatus,
  MediaUnderstandingModelStatusValue,
  MediaUnderstandingModels,
  MediaUnderstandingModelSelections,
  SettingsState,
} from './ui';
export {
  EMPTY_TAB_STATE,
  normalizeTabState,
  projectTabStateUpdate,
  resolveActiveTabConversationId,
  type ProjectTabStateUpdateInput,
  type ResolveActiveTabConversationIdInput,
} from './tab-state-projector';
export {
  NEKO_PLUGIN_IDS,
  type NekoPluginKey,
  type PluginTransferAssetRef,
  type PluginTransferAuthoringPayloadBase,
  type PluginTransferCanvasImportAssetPayload,
  type PluginTransferCommand,
  type PluginTransferCommandPayload,
  type PluginTransferCommandPlanMap,
  type PluginTransferCutImportGeneratedClipPayload,
  type PluginTransferCutStoryboardAuthoringPayload,
  type PluginTransferCutStoryboardPayload,
  type PluginTransferCutStoryboardShot,
  type PluginTransferCutStoryboardShotBase,
  type PluginTransferMediaType,
  type PluginTransferProvenance,
  type PluginTransferCommandPlan,
  type PluginTransferPayload,
  type PluginTransferTargetMode,
  type PluginTransferTargetRef,
  type PluginTransferTarget,
  type ProjectPluginsAvailableInput,
} from './plugin-transfer-contract';

// Agent-owned capability, tool, profile, and prompt contracts.
export * from './agent-capability-diagnostics';
export * from './agent-capability-lifecycle';
export * from './agent-capability';
export * from './agent-observation';
export * from './agent-profile';
export * from './agent-runtime-scope';
export * from './agent-trace';
export * from './decision-rationale';
export * from './domain-routing';
export * from './perception-card';
export * from './portable-skill';
export * from './prompt-fragment';
export * from './reference-contributor';
export * from './skill';
export * from './tool-names';
export * from './tool-planning';
export * from './tool';
export * from './platform';
export * from './comic-animation-indexing';
export * from './composite-artifact';
export * from './storyboard-plan-overlay';
export * from './shot-image-prep';
export * from './external-research';
export * from './character-dialogue-handoff';
