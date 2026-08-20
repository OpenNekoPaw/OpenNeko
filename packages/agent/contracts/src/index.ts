/**
 * @neko/agent-contracts — Shared type definitions for the neko-agent ecosystem
 *
 * Host-neutral contracts consumed by Agent application, Desktop adapters, and extension management.
 */

export * from './agent-ai-source';
export * from './agent-ui-contracts';
export * from './agent-context';
export * from './agent-home';
export * from './retired-conversation-unavailable';
export * from './agent-image-transport';
export * from './agent-availability';
export * from './agent-interaction-binding';
export * from './agent-model-catalog';
export {
  parseAgentFlatPurposeModelRefs,
  type AgentFlatPurposeModelRefMap,
  type AgentFlatPurposeModelRefs,
  type AgentPurposeModelRef,
} from './agent-purpose-model';
export * from './agent-conversation-context';
export * from './agent-conversation-binding';
export * from './agent-input-intent';
export * from './agent-llm-configuration';
export * from './agent-entry-intent';
export * from './agent-token-budget';
export * from './agent-turn-capability';
export * from './creative-domain';
export * from './config';
export * from './desktop-agent-connection';
export * from './dsh-acp';
export * from './dsh-permission-host';
export * from './dsh-runtime-host';
export * from './dsh-session-host';
export * from './effective-agent-configuration';
export * from './extension-management';
export * from './extension-management-host';
export * from './message-attachment';
export * from './multimodal-context';
export * from './recovery-guidance';

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
  CompositeBlockData,
  MarkdownDerivedCompositeSource,
  CompositeSection,
  CompositeTemplate,
  MediaRef,
} from './message';
export { parseMessageContextReference } from './message';
export {
  COMPOSITE_CONTENT_FENCE_LANGUAGES,
  extractCompositeContentFenceCandidates,
  isCompositeContentFenceLanguage,
  parseCompositeContentJsonCandidates,
  parseCompositeContentJson,
  type CompositeContentFenceCandidate,
} from './composite-content-contract';
export {
  AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND,
  isAgentAuthorizedContentReferenceContextData,
} from './message';
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
export { normalizeSlashCommandName } from './slash-command-utils';
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
  AUDIO_GENERATION_TOOLS,
  FILE_TOOLS,
  IMAGE_GENERATION_TOOLS,
  SEARCH_TOOLS,
  SHELL_TOOLS,
  VIDEO_GENERATION_TOOLS,
  getToolSummary,
} from './tool-summary';
export type { AgentConfigDiagnostic, AgentConfigDiagnosticCode } from './config-diagnostic';

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

// Agent-owned message, tool, profile, and perception contracts.
export * from './agent-observation';
export * from './agent-profile';
export * from './decision-rationale';
export * from './perception-card';
export * from './provider-card';
export * from './tool-names';
export * from './tool-planning';
export * from './tool';
export * from './platform';
export * from './comic-animation-indexing';
export * from './composite-artifact';
export * from './storyboard-plan-overlay';
export * from './shot-image-prep';
export * from './character-dialogue-handoff';
