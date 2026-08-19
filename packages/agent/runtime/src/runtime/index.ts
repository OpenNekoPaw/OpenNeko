/**
 * Runtime public barrel.
 *
 * Canonical implementation owners live in the narrow runtime subdirectories
 * documented in README.md:
 * - turn/: content, context, and multimodal pure adapters still used directly
 *   by product surfaces; these never execute a model turn.
 * - capability/: Host content-access boundary adapters; these never register
 *   Agent Tools or own DSH capabilities.
 * - stream/: pure Markdown/composite render projection.
 *
 * Existing owner directories remain canonical for input/message
 * input projection and content access. This barrel must not become a
 * compatibility layer for the retired Agent runtime.
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
  createAgentDocumentReaderModuleUnavailableError,
  type AgentDocumentReaderHostSurface,
} from './document-module-diagnostics';

export {
  createHostAgentContentAccessRuntime,
  type CreateHostAgentContentAccessRuntimeOptions,
} from './capability/host-content-access-runtime-adapter';

export {
  createWorkspaceInputProcessorRuntime,
  type WorkspaceInputProcessorRuntime,
  type WorkspaceInputProcessorRuntimeOptions,
} from './turn/workspace-input-processor-runtime';

export {
  createAgentTurnContext,
  inferAgentTurnProjectType,
  type AgentTurnActiveEditorLike,
  type AgentTurnContext,
  type AgentTurnContextInput,
  type AgentTurnProjectType,
} from './turn/agent-turn-context';

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
  projectMessageForResourceDisplay,
  projectMessagesForResourceDisplay,
  projectResourceValue,
  type MessageResourceProjectionOptions,
} from '../input/message-resource-projector';

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
