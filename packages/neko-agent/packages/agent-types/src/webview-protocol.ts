/**
 * Webview ↔ Extension protocol contracts.
 *
 * This file is the shared schema for values that cross the VS Code webview
 * boundary. Keep it dependency-light and validate data at the Extension edge.
 */

import type {
  AgentContextPayload,
  AgentCapabilityActivationProgressEvent,
  AgentCapabilityInvocationInput,
  AgentCapabilityInvocationResult,
  AgentContextType,
  CanvasMarkdownCapabilityTarget,
  CanvasMarkdownCapabilityResult,
  CanvasMarkdownResourceRef,
  ChatModelOption,
  DocumentLocator,
  DocumentSourceRef,
  MessageAttachment,
  ModelType,
  NpcTranscriptArtifact,
  SkillSummary,
  StoryboardTable,
  TaskRunScope,
} from '@neko/shared';
import type { StoryboardTextCue, StoryboardVoiceCue } from '@neko/shared';
import {
  validateChildRunScope,
  STORYBOARD_TEXT_CUE_KINDS,
  isAgentCapabilityInvocationInput,
  isCanvasMarkdownCapabilityTarget,
  isCanvasMarkdownResourceRef,
  isThreeReferenceContextData,
  isResourceRef,
  parseDocumentArchiveResourceRef,
  parseDocumentLocator,
  parseDocumentSourceRef,
  normalizeCanonicalStoryboardTable,
  validateCanonicalStoryboardTable,
} from '@neko/shared';
import type { AgentPhase } from './phase';
import type { AgentFileReference, ContentBlock, Message } from './message';
import type { ConfiguredProvider } from './provider';
import type {
  ConversationSummary,
  CharacterDialogueSessionProjection,
  EmbodyCharacterSessionProjection,
  OpenTab,
  SessionMode,
  SettingsState,
  SsoSession,
  TabState,
} from './ui';
import type { PluginSlashCommandInvocation } from './plugin-slash-command';
import type {
  AgentWorkItem,
  SubAgentWorkItem,
  SubAgentWorkItemEvent,
  TaskWorkItem,
} from './work-item';
import type { DashboardTask } from '@neko/shared/types/dashboard-task';
import type { AgentArtifactTransferPayload } from './artifact-transfer';
import type {
  PluginTransferAssetRef,
  PluginTransferCutStoryboardPayload,
  PluginTransferCutStoryboardShot,
  PluginTransferPayload,
  PluginTransferProvenance,
  PluginTransferTargetMode,
  PluginTransferTargetRef,
} from './plugin-transfer-contract';
import type { AgentConfigDiagnostic } from './config-diagnostic';
import type {
  ProjectionAttachRequest,
  ProjectionAttachmentHostFrame,
  ProjectionAttachmentKey,
  ProjectionDetachMessage,
  ProjectionSnapshotAcknowledgement,
} from './projection-attachment';
import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from './conversation-projection';
export { NEKO_AGENT_HOST_MESSAGE_EVENT } from './host-message-event';

export type ProtocolModelCategory = ModelType;

export type MediaModelCategory = Exclude<ProtocolModelCategory, 'llm'>;
export type AgentMediaModelCategory = Extract<MediaModelCategory, 'image' | 'video' | 'audio'>;
export type AgentModelSlot = 'primary' | 'fast' | 'deep' | 'summarizer' | 'vision';
export type AgentReasoningPreset = 'fast' | 'balanced' | 'deep';
export type AgentVerbosityPreset = 'brief' | 'standard' | 'detailed';
export type AgentCreativityPreset = 'stable' | 'creative' | 'wild';
export type AgentReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type AgentTextVerbosity = 'low' | 'medium' | 'high';
export type AgentServiceTier = 'auto' | 'default' | 'fast' | 'flex' | 'priority';

export interface ModelRef<Category extends ProtocolModelCategory = ProtocolModelCategory> {
  providerId: string;
  modelId: string;
  category: Category;
  providerExpressionProfileId?: string;
}

export type AgentMediaModelSelections = Partial<{
  image: ModelRef<'image'>;
  video: ModelRef<'video'>;
  audio: ModelRef<'audio'>;
}>;

export interface AgentFlatPurposeModelRefMap {
  readonly 'image.generate': ModelRef<'image'>;
  readonly 'image.edit': ModelRef<'image'>;
  readonly 'image.understand': ModelRef<'llm'>;
  readonly 'video.generate': ModelRef<'video'>;
  readonly 'video.understand': ModelRef<'llm'>;
  readonly 'audio.generate': ModelRef<'audio'>;
  readonly 'audio.tts': ModelRef<'audio'>;
  readonly 'audio.music.generate': ModelRef<'audio'>;
  readonly 'audio.understand': ModelRef<'llm'>;
}

export type AgentFlatPurposeModelRefs = Partial<AgentFlatPurposeModelRefMap>;

export type AgentModelSlots = Partial<Record<AgentModelSlot, ModelRef<'llm'>>>;

export interface AgentLlmAdvancedParams {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  reasoningEffort?: AgentReasoningEffort;
  thinkingBudget?: number;
  verbosity?: AgentTextVerbosity;
  serviceTier?: AgentServiceTier;
}

export interface AgentLlmConfig {
  reasoningPreset?: AgentReasoningPreset;
  verbosityPreset?: AgentVerbosityPreset;
  creativityPreset?: AgentCreativityPreset;
  advanced?: AgentLlmAdvancedParams;
}

export type RuntimeMediaModelSelections = Partial<Record<MediaModelCategory, ModelRef>>;

export interface SendMessageWebviewMessage {
  type: 'sendMessage';
  conversationId: string;
  message: string;
  sessionMode: SessionMode;
  chatModel?: ModelRef<'llm'>;
  agentModels?: AgentModelSlots;
  llmConfig?: AgentLlmConfig;
  mediaModel?: ModelRef<MediaModelCategory>;
  purposeModels?: AgentFlatPurposeModelRefs;
  attachments?: MessageAttachment[];
  contextPayloads?: AgentContextPayload[];
  fileReferences?: AgentFileReference[];
  promptId?: string;
  messageTrackingId?: string;
}

export interface SearchProjectFilesWebviewMessage {
  type: 'searchProjectFiles';
  filter: string;
  conversationId?: string;
  purpose?: 'roleplay' | 'entry';
}

export interface ConfirmToolWebviewMessage {
  type: 'confirmTool';
  toolCallId: string;
  approved: boolean;
  conversationId: string;
}

export interface ConversationOnlyWebviewMessage {
  type: 'clearHistory' | 'cancelMessage' | 'getTasks' | 'getContextTokenCount' | 'compressContext';
  conversationId: string;
}

export interface GetMessageQueueWebviewMessage {
  type: 'getMessageQueue';
  conversationId: string;
}

export interface QueuedMessageActionWebviewMessage {
  type: 'promoteQueuedMessage' | 'cancelQueuedMessage';
  conversationId: string;
  queueItemId: string;
}

export interface EditQueuedMessageWebviewMessage {
  type: 'editQueuedMessage';
  tabId: string;
  conversationId: string;
  queueItemId: string;
}

export interface DeleteConversationWebviewMessage {
  type: 'deleteConversation';
  conversationId: string;
  activateNext?: boolean;
}

export interface EmptyWebviewMessage {
  type:
    | 'newConversation'
    | 'clearAllConversations'
    | 'getConversations'
    | 'getActiveConversation'
    | 'getAgentStates'
    | 'getConfig'
    | 'refreshConfigSnapshot'
    | 'getSkills'
    | 'openUserConfigFile'
    | 'ssoLogout'
    | 'openConfigFile'
    | 'getTabState';
}

export interface GetSettingsWebviewMessage {
  type: 'getSettings';
  conversationId: string;
}

export interface GetConversationSnapshotWebviewMessage {
  type: 'getConversationSnapshot';
  conversationId: string;
}

export interface UpdateSettingsWebviewMessage {
  type: 'updateSettings';
  settings: Record<string, unknown>;
  conversationId: string;
}

export interface ActivateConversationWebviewMessage {
  type: 'activateConversation';
  activationId: number;
  conversationId: string;
  tabId: string;
  expectedTabStateRevision: number;
  tabState: TabState;
}

export interface UpdateTabStateWebviewMessage {
  type: 'updateTabState';
  openTabs: OpenTab[];
  activeTabId: string | null;
  expectedTabStateRevision: number;
}

export interface TaskActionWebviewMessage {
  type: 'cancelTask' | 'retryTask' | 'viewTaskResult';
  taskScope: TaskRunScope;
  resultRef?: string;
}

export interface OpenFileWebviewMessage {
  type: 'openFile';
  filePath: string;
  options?: { preview?: boolean; line?: number; column?: number };
}

export interface RevealDocumentLocatorWebviewMessage {
  type: 'revealDocumentLocator';
  filePath: string;
  locator: DocumentLocator;
  source?: DocumentSourceRef;
}

export interface FilePathWebviewMessage {
  type: 'revealFile';
  filePath: string;
}

export interface RevealAssetWebviewMessage {
  type: 'revealAsset';
  assetId: string;
}

export interface OpenUrlWebviewMessage {
  type: 'openUrl';
  url: string;
}

export interface SendToPluginWebviewMessage {
  type: 'sendToPlugin';
  target: string;
  assetPath?: string;
  mediaType?: string;
  payload?: PluginTransferPayload;
}

export interface InvokeAgentCapabilityLifecycleWebviewMessage {
  type: 'invokeAgentCapabilityLifecycle';
  requestId: string;
  conversationId: string;
  invocation: AgentCapabilityInvocationInput;
}

export type CanvasAuthoringHandoffSourceKind =
  'markdown' | 'generated-text' | 'structured-content' | 'resource-backed-content';

export type CanvasAuthoringMarkdownSourceFormat =
  'markdown' | 'markdown-table' | 'gfm-table' | 'resource-reference-markdown';

export type CanvasAuthoringHandoffSourceFormat =
  CanvasAuthoringMarkdownSourceFormat | 'plain-text' | 'json' | 'composite-artifact';

export type CanvasAuthoringHandoffDeclaredIntentHint = 'auto' | 'note' | 'table' | 'creative-table';

export interface CanvasAuthoringHandoffStableRef {
  readonly kind: string;
  readonly id: string;
  readonly namespace?: string;
  readonly token?: string;
  readonly placementHint?: string;
}

export interface CanvasAuthoringHandoffSourceRange {
  readonly start: number;
  readonly end: number;
}

export interface CanvasAuthoringHandoffDiagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly token?: string;
  readonly range?: CanvasAuthoringHandoffSourceRange;
}

export interface CanvasAuthoringHandoffPromptSpan {
  readonly kind: string;
  readonly range: CanvasAuthoringHandoffSourceRange;
  readonly fieldId?: string;
  readonly label?: string;
  readonly ref?: CanvasAuthoringHandoffStableRef;
  readonly tone?: string;
  readonly tooltip?: string;
}

export interface CanvasAuthoringHandoffTargetHints {
  readonly sourceFormat?: CanvasAuthoringHandoffSourceFormat;
  readonly declaredIntentHint?: CanvasAuthoringHandoffDeclaredIntentHint;
  readonly declaredProfileHint?: string;
  readonly operationHint?: string;
}

export interface RequestCanvasAuthoringHandoffWebviewMessage {
  type: 'requestCanvasAuthoringHandoff';
  requestId: string;
  conversationId: string;
  sourceKind: CanvasAuthoringHandoffSourceKind;
  content: string;
  sourceFormat?: CanvasAuthoringHandoffSourceFormat;
  canonicalStoryboard?: StoryboardTable;
  title?: string;
  resources?: readonly CanvasMarkdownResourceRef[];
  stableRefs?: readonly CanvasAuthoringHandoffStableRef[];
  diagnostics?: readonly CanvasAuthoringHandoffDiagnostic[];
  promptSpans?: readonly CanvasAuthoringHandoffPromptSpan[];
  target?: CanvasMarkdownCapabilityTarget;
  provenance?: PluginTransferProvenance;
  userIntent?: string;
  targetHints?: CanvasAuthoringHandoffTargetHints;
}

export interface DragStartWebviewMessage {
  type: 'dnd:start';
  asset: { path: string; mediaType: 'image' | 'video' | 'audio'; name: string };
}

export interface MermaidErrorWebviewMessage {
  type: 'mermaidError';
  error: string;
  code: string;
  feedbackMessage: string;
  conversationId: string;
}

export interface DownloadSvgWebviewMessage {
  type: 'downloadSvg';
  svg: string;
  filename: string;
}

export interface InvokeSlashCommandWebviewMessage {
  type: 'invokeSlashCommand';
  command: string;
  args?: string;
  conversationId: string;
}

export interface InvokeSkillWebviewMessage {
  type: 'invokeSkill';
  skillName: string;
  conversationId: string;
  args?: string;
}

export interface InvokePluginSlashCommandWebviewMessage {
  type: 'invokePluginSlashCommand';
  extensionId: string;
  commandId: string;
  conversationId: string;
  args?: string;
}

export interface ExitCharacterDialogueSessionWebviewMessage {
  type: 'exitCharacterDialogueSession';
  sessionId: string;
}

export interface StartCharacterDialogueFromSlashWebviewMessage {
  type: 'startCharacterDialogueFromSlash';
  args?: string;
}

export interface ExitEmbodyCharacterSessionWebviewMessage {
  type: 'exitEmbodyCharacterSession';
  sessionId: string;
}

export interface SsoLoginWebviewMessage {
  type: 'ssoLogin';
  force?: boolean;
}

export interface RevealContextSourceWebviewMessage {
  type: 'revealContextSource';
  contextType: AgentContextType;
  contextId: string;
  navigationData?: Record<string, string>;
}

export interface WebviewKeyboardFocusWebviewMessage {
  type: 'webviewKeyboardFocus';
  focused: boolean;
}

export interface WebviewKeyboardEditableWebviewMessage {
  type: 'webviewKeyboardEditable';
  editable: boolean;
}

export type ConversationProjectionAttachmentHostFrame = ProjectionAttachmentHostFrame<
  ConversationProjectionSnapshot,
  ConversationProjectionPatch
>;

export interface ProjectionEndpointDiscoverRequest {
  readonly type: 'projectionEndpointDiscover';
  readonly protocolVersion: typeof AGENT_WEBVIEW_PROTOCOL_VERSION;
  readonly realmId: string;
}

export interface ProjectionEndpointReadyMessage {
  readonly type: 'projectionEndpointReady';
  readonly protocolVersion: typeof AGENT_WEBVIEW_PROTOCOL_VERSION;
  readonly realmId: string;
  readonly endpointEpoch: string;
}

export const AGENT_WEBVIEW_PROTOCOL_VERSION = 1 as const;

export type WebviewToExtensionMessage =
  | SendMessageWebviewMessage
  | SearchProjectFilesWebviewMessage
  | ConfirmToolWebviewMessage
  | ConversationOnlyWebviewMessage
  | ActivateConversationWebviewMessage
  | GetMessageQueueWebviewMessage
  | QueuedMessageActionWebviewMessage
  | EditQueuedMessageWebviewMessage
  | DeleteConversationWebviewMessage
  | EmptyWebviewMessage
  | GetSettingsWebviewMessage
  | GetConversationSnapshotWebviewMessage
  | UpdateSettingsWebviewMessage
  | UpdateTabStateWebviewMessage
  | TaskActionWebviewMessage
  | OpenFileWebviewMessage
  | RevealDocumentLocatorWebviewMessage
  | FilePathWebviewMessage
  | RevealAssetWebviewMessage
  | OpenUrlWebviewMessage
  | SendToPluginWebviewMessage
  | InvokeAgentCapabilityLifecycleWebviewMessage
  | RequestCanvasAuthoringHandoffWebviewMessage
  | DragStartWebviewMessage
  | MermaidErrorWebviewMessage
  | DownloadSvgWebviewMessage
  | InvokeSlashCommandWebviewMessage
  | InvokeSkillWebviewMessage
  | InvokePluginSlashCommandWebviewMessage
  | StartCharacterDialogueFromSlashWebviewMessage
  | ExitCharacterDialogueSessionWebviewMessage
  | ExitEmbodyCharacterSessionWebviewMessage
  | SsoLoginWebviewMessage
  | RevealContextSourceWebviewMessage
  | WebviewKeyboardFocusWebviewMessage
  | WebviewKeyboardEditableWebviewMessage
  | ProjectionEndpointDiscoverRequest
  | ProjectionAttachRequest
  | ProjectionSnapshotAcknowledgement
  | ProjectionDetachMessage;

export interface ProjectFileMentionInfo {
  path: string;
  name: string;
  type: 'file' | 'folder';
  icon?: string;
  source?: ProjectMentionSource;
  mediaType?: ProjectMentionMediaType;
}

export type ProjectMentionExtraType =
  'canvas-node' | 'character' | 'scene' | 'asset' | 'media' | 'entity';

export type ProjectMentionSource =
  'workspace' | 'asset-library' | 'media-library' | 'entity-graph' | 'story' | 'canvas';

export type ProjectMentionMediaType =
  'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

export interface ProjectMentionExtra {
  type: ProjectMentionExtraType;
  id: string;
  label: string;
  summary: string;
  searchText?: string;
  thumbnailUri?: string;
  source?: ProjectMentionSource;
  icon?: string;
  filePath?: string;
  mediaType?: ProjectMentionMediaType;
  entityType?: string;
  navigationData?: Record<string, string>;
}

export interface ProjectFilesWebviewMessage {
  type: 'projectFiles';
  conversationId?: string;
  filter?: string;
  purpose?: 'roleplay' | 'entry';
  files?: ProjectFileMentionInfo[];
  mentionExtras?: ProjectMentionExtra[];
}

export interface PluginsAvailable {
  canvas?: boolean;
  cut?: boolean;
  sketch?: boolean;
  model?: boolean;
}

export interface ThinkingMessage {
  type: 'thinking';
  conversationId: string;
}

export interface StreamTextMessage {
  type: 'streamText';
  content?: string;
  conversationId: string;
  messageId?: string;
}

export interface AssistantTextReplacementMessage {
  type: 'assistantTextReplacement';
  conversationId: string;
  messageId?: string;
  reason: 'output-validation-retry';
  attempt: number;
}

export interface StreamCompleteMessage {
  type: 'streamComplete';
  conversationId: string;
  messageId?: string;
  contentBlocks?: readonly ContentBlock[];
}

export interface StreamThinkingMessage {
  type: 'streamThinking';
  content?: string;
  conversationId: string;
  messageId?: string;
}

export interface MessageCancelledMessage {
  type: 'messageCancelled';
  conversationId: string;
}

export type AgentTurnSource =
  'user' | 'task-result-continuation' | 'subagent-result-continuation' | 'system-continuation';

export type AgentQueuedMessageSource = AgentTurnSource | 'composer';

export type AgentQueuedMessageDisplayKind =
  'user-message' | 'task-continuation' | 'subagent-continuation' | 'system-continuation';

export interface AgentContinuationMetadata {
  readonly observationId?: string;
  readonly taskId?: string;
  readonly taskGroupId?: string;
  readonly subagentId?: string;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly runId?: string;
  readonly status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'discarded';
  readonly policy?: string;
}

export interface AgentQueuedMessageItem {
  id: string;
  conversationId: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
  source: AgentQueuedMessageSource;
  displayKind?: AgentQueuedMessageDisplayKind;
  metadata?: AgentContinuationMetadata;
}

export interface AgentMessageQueueSnapshot {
  conversationId: string;
  items: readonly AgentQueuedMessageItem[];
  pendingCount: number;
  /** Conversation-local monotonic version used to ignore stale Webview queue snapshots. */
  version: number;
}

export type AgentMessageQueueErrorCode =
  'stale-item' | 'invalid-queue-operation' | 'not-queueable' | 'conversation-not-found';

export interface MessageQueuedMessage {
  type: 'messageQueued';
  content?: string;
  conversationId: string;
  pendingCount?: number;
  item?: AgentQueuedMessageItem;
  releasedItem?: AgentQueuedMessageItem;
  snapshot?: AgentMessageQueueSnapshot;
}

export interface MessageQueueSnapshotMessage {
  type: 'messageQueueSnapshot';
  snapshot: AgentMessageQueueSnapshot;
}

export interface QueuedMessageEditRequestedMessage {
  type: 'queuedMessageEditRequested';
  tabId: string;
  conversationId: string;
  item: AgentQueuedMessageItem;
  snapshot: AgentMessageQueueSnapshot;
}

export interface MessageQueueErrorMessage {
  type: 'messageQueueError';
  conversationId: string;
  code: AgentMessageQueueErrorCode;
  message: string;
  queueItemId?: string;
  snapshot?: AgentMessageQueueSnapshot;
}

export interface AgentPhaseMessage {
  type: 'agentPhase';
  phase: AgentPhase;
  toolName?: string;
  timestamp?: number;
  conversationId: string;
}

export interface AgentStateSnapshotMessage {
  type: 'agentStateSnapshot';
  agentStates: Array<{
    conversationId: string;
    phase?: AgentPhase;
    toolName?: string;
    startedAt?: number;
  }>;
}

export interface ErrorMessage {
  type: 'error';
  message?: string;
  conversationId: string;
}

export interface GlobalErrorMessage {
  type: 'globalError';
  message: string;
}

export type AgentSessionDiagnosticCode =
  | 'unknown-conversation'
  | 'deleted-conversation'
  | 'missing-session-identity'
  | 'invalid-webview-message'
  | 'webview-protocol-mismatch'
  | 'active-tab-mismatch'
  | 'terminal-webview-delivery-unavailable'
  | 'conversation-durability-failed'
  | 'conversation-catalog-stale'
  | 'stale-tab-state-revision'
  | 'invalid-conversation-activation'
  | 'queued-edit-draft-conflict'
  | 'canvas-board-routing-failed'
  | 'canvas-board-delivery-failed'
  | 'projection-attachment-protocol-fatal';

export interface AgentSessionDiagnosticMessage {
  type: 'sessionDiagnostic';
  code: AgentSessionDiagnosticCode;
  severity: 'warning' | 'error';
  message: string;
  action?: string;
  conversationId?: string;
  tabId?: string;
  activeConversationId?: string | null;
  activeTabConversationId?: string | null;
}

export interface HistoryClearedMessage {
  type: 'historyCleared';
  conversationId: string;
}

export interface ConversationListMessage {
  type: 'conversationList';
  conversations: ConversationSummary[];
}

export interface ActiveConversationMessage {
  type: 'activeConversation';
  activation?: {
    activationId: number;
    tabStateRevision: number;
  };
  conversation?: {
    id: string;
    title?: string;
    messages?: Message[];
  };
}

export interface ConversationSnapshotMessage {
  type: 'conversationSnapshot';
  conversation: {
    id: string;
    title?: string;
    messages: Message[];
  };
}

export interface SettingsDataMessage {
  type: 'settingsData';
  conversationId: string;
  providers?: SettingsState['providers'];
  configuredProviders?: ConfiguredProvider[];
  selectedProviderId?: string | null;
  selectedModelId?: string | null;
  /**
   * Stored user/workspace custom instructions. This is not the built-in base
   * system prompt and must not replace runtime protocols.
   */
  customSystemPrompt?: string;
  /**
   * Webview settings field for the same custom-instructions text. Kept as the
   * UI message key used by the settings form; semantically it is an overlay.
   */
  systemPrompt?: string;
  autoExecuteTools?: boolean;
  streamResponses?: boolean;
  showToolCalls?: boolean;
  temperature?: number;
  maxTokens?: number;
  executionMode?: SettingsState['executionMode'];
  chatModelOptions?: ChatModelOption[];
  modelGroups?: SettingsState['modelGroups'];
  defaultMediaModels?: Partial<Record<MediaModelCategory, string>>;
  mediaUnderstandingModels?: SettingsState['mediaUnderstandingModels'];
  configDiagnostic?: AgentConfigDiagnostic;
}

export type ProjectFilesMessage = ProjectFilesWebviewMessage;

export interface ConfigStateMessage {
  type: 'configState';
  config?: {
    providers?: ConfiguredProvider[];
    configuredProviders?: ConfiguredProvider[];
    selectedProviderId?: string | null;
    selectedModelId?: string | null;
    customSystemPrompt?: string;
    autoExecuteTools?: boolean;
    streamResponses?: boolean;
    showToolCalls?: boolean;
    temperature?: number;
    maxTokens?: number;
    executionMode?: SettingsState['executionMode'];
    chatModelOptions?: ChatModelOption[];
    modelGroups?: SettingsState['modelGroups'];
    defaultMediaModels?: Partial<Record<MediaModelCategory, string>>;
    mediaUnderstandingModels?: SettingsState['mediaUnderstandingModels'];
    configDiagnostic?: AgentConfigDiagnostic;
  };
}

export interface ConfigChangedMessage {
  type: 'configChanged';
}

export interface SettingsUpdatedMessage {
  type: 'settingsUpdated';
  success: boolean;
  error?: string;
}

export interface ProviderMutationResultMessage {
  type: 'modelAdded' | 'modelRemoved';
  success: boolean;
  modelType: string;
  error?: string;
}

export interface PluginCommandsMessage {
  type: 'pluginCommands';
  commands?: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    extensionId: string;
  }>;
}

export interface PluginsAvailableMessage {
  type: 'pluginsAvailable';
  plugins?: PluginsAvailable;
}

export interface SsoSessionChangedMessage {
  type: 'ssoSessionChanged';
  session: SsoSession | null;
}

export interface SsoErrorMessage {
  type: 'ssoError';
  error: string;
}

export interface ToolCallMessage {
  type: 'toolCall';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: 'toolResult';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  success: boolean;
  data?: unknown;
  error?: string;
  attachments?: readonly import('@neko/shared').ToolResultAttachment[];
  perceptionCards?: readonly import('@neko/shared').PerceptionCard[];
  backfillDiagnostics?: readonly import('@neko/shared').ToolResultBackfillDiagnostic[];
  artifacts?: readonly AgentArtifactTransferPayload[];
}

export interface ToolResultBackfillMessage {
  type: 'toolResultBackfill';
  conversationId: string;
  messageId?: string;
  toolCallId: string;
  dataPatch: Record<string, unknown>;
  attachments?: readonly import('@neko/shared').ToolResultAttachment[];
  perceptionCards?: readonly import('@neko/shared').PerceptionCard[];
  backfillDiagnostics?: readonly import('@neko/shared').ToolResultBackfillDiagnostic[];
  artifacts?: readonly AgentArtifactTransferPayload[];
}

export interface ToolConfirmationMessage {
  type: 'toolConfirmation';
  conversationId: string;
  toolCallId: string;
  toolName?: string;
  action?: string;
  description?: string;
  details?: Record<string, unknown>;
}

export interface TasksUpdatedMessage {
  type: 'tasksUpdated';
  conversationId: string;
  workItems: AgentWorkItem[];
}

export interface TaskCreatedMessage {
  type: 'taskCreated';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  workItem: AgentWorkItem;
}

export interface TaskUpdatedMessage {
  type: 'taskUpdated';
  conversationId: string;
  workItem: AgentWorkItem;
}

export interface TaskRemovedMessage {
  type: 'taskRemoved';
  conversationId: string;
  taskScope: TaskRunScope;
  taskId: string;
}

export interface SubAgentEventMessage {
  type: 'subagentEvent';
  conversationId: string;
  event: SubAgentWorkItemEvent;
  workItem: SubAgentWorkItem;
}

export interface TabStateMessage {
  type: 'tabState';
  revision: number;
  tabState?: Partial<TabState>;
}

export interface SlashCommandResultMessage {
  type: 'slashCommandResult';
  conversationId: string;
  command: string;
  success: boolean;
  action?: string;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface AgentCapabilityLifecycleResultMessage {
  type: 'agentCapabilityLifecycleResult';
  requestId: string;
  conversationId: string;
  success: boolean;
  lifecycleResult?: AgentCapabilityInvocationResult;
  result?: CanvasMarkdownCapabilityResult;
  error?: string;
}

export interface AgentCapabilityActivationProgressMessage {
  type: 'agentCapabilityActivationProgress';
  conversationId: string;
  events: readonly AgentCapabilityActivationProgressEvent[];
}

export interface CharacterDialogueSessionStartedMessage {
  type: 'characterDialogueSessionStarted';
  tab: OpenTab;
  session: CharacterDialogueSessionProjection;
}

export interface CharacterDialogueSessionExitedMessage {
  type: 'characterDialogueSessionExited';
  sessionId: string;
  artifact?: NpcTranscriptArtifact;
  savedPath?: string;
}

export interface EmbodyCharacterSessionStartedMessage {
  type: 'embodyCharacterSessionStarted';
  tab: OpenTab;
  session: EmbodyCharacterSessionProjection;
}

export interface EmbodyCharacterSessionExitedMessage {
  type: 'embodyCharacterSessionExited';
  sessionId: string;
  artifact?: NpcTranscriptArtifact;
  savedPath?: string;
}

export interface SkillsListMessage {
  type: 'skillsList';
  skills?: SkillSummary[];
}

export interface ContextTokenCountMessage {
  type: 'contextTokenCount';
  conversationId: string;
  tokenCount?: number;
}

export interface CompressionResultMessage {
  type: 'compressionResult';
  conversationId: string;
  compressedTokens?: number;
}

export interface CompressionErrorMessage {
  type: 'compressionError';
  conversationId: string;
  error?: string;
}

export interface MediaTaskCreatedMessage {
  type: 'mediaTaskCreated';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  parentScope?: 'turn';
  workItem: TaskWorkItem;
}

export interface MediaTaskProgressMessage {
  type: 'mediaTaskProgress';
  conversationId: string;
  messageId?: string;
  toolCallId?: string;
  parentScope?: 'turn';
  workItem: TaskWorkItem;
}

export interface TaskDeliveryReplayMessage {
  type: 'taskDeliveryReplay';
  conversationId: string;
  task: DashboardTask;
}

export interface ExternalMessage {
  type: 'externalMessage';
  message?: string;
}

export interface PrefillInputMessage {
  type: 'prefillInput';
  message?: string;
}

export interface InjectContextMessage {
  type: 'injectContext';
  tabId: string;
  conversationId: string;
  payload: AgentContextPayload;
}

export interface AmbientCanvasUpdateMessage {
  type: 'ambientCanvasUpdate';
  conversationId?: string | null;
  nodes?: Array<{ nodeId: string; type: string; summary: string }>;
}

export type ExtensionToWebviewMessage =
  | ThinkingMessage
  | StreamTextMessage
  | AssistantTextReplacementMessage
  | StreamCompleteMessage
  | StreamThinkingMessage
  | MessageCancelledMessage
  | MessageQueuedMessage
  | MessageQueueSnapshotMessage
  | QueuedMessageEditRequestedMessage
  | MessageQueueErrorMessage
  | AgentPhaseMessage
  | AgentStateSnapshotMessage
  | ErrorMessage
  | GlobalErrorMessage
  | AgentSessionDiagnosticMessage
  | HistoryClearedMessage
  | ConversationListMessage
  | ActiveConversationMessage
  | ConversationSnapshotMessage
  | SettingsDataMessage
  | ProjectFilesMessage
  | ConfigStateMessage
  | ConfigChangedMessage
  | SettingsUpdatedMessage
  | ProviderMutationResultMessage
  | PluginCommandsMessage
  | PluginsAvailableMessage
  | SsoSessionChangedMessage
  | SsoErrorMessage
  | ToolCallMessage
  | ToolResultMessage
  | ToolResultBackfillMessage
  | ToolConfirmationMessage
  | TasksUpdatedMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskRemovedMessage
  | SubAgentEventMessage
  | TabStateMessage
  | SlashCommandResultMessage
  | AgentCapabilityLifecycleResultMessage
  | AgentCapabilityActivationProgressMessage
  | CharacterDialogueSessionStartedMessage
  | CharacterDialogueSessionExitedMessage
  | EmbodyCharacterSessionStartedMessage
  | EmbodyCharacterSessionExitedMessage
  | SkillsListMessage
  | ContextTokenCountMessage
  | CompressionResultMessage
  | CompressionErrorMessage
  | MediaTaskCreatedMessage
  | MediaTaskProgressMessage
  | TaskDeliveryReplayMessage
  | ExternalMessage
  | PrefillInputMessage
  | InjectContextMessage
  | AmbientCanvasUpdateMessage
  | ProjectionEndpointReadyMessage
  | ConversationProjectionAttachmentHostFrame;

export type MessageOfType<T extends ExtensionToWebviewMessage['type']> = Extract<
  ExtensionToWebviewMessage,
  { type: T }
>;

const SESSION_MODES: readonly SessionMode[] = ['agent', 'image', 'video', 'audio'];
const MODEL_CATEGORIES: readonly ProtocolModelCategory[] = ['llm', 'image', 'video', 'audio'];
const AGENT_MODEL_SLOTS: readonly AgentModelSlot[] = [
  'primary',
  'fast',
  'deep',
  'summarizer',
  'vision',
];
const AGENT_REASONING_PRESETS: readonly AgentReasoningPreset[] = ['fast', 'balanced', 'deep'];
const AGENT_VERBOSITY_PRESETS: readonly AgentVerbosityPreset[] = ['brief', 'standard', 'detailed'];
const AGENT_CREATIVITY_PRESETS: readonly AgentCreativityPreset[] = ['stable', 'creative', 'wild'];
const AGENT_REASONING_EFFORTS: readonly AgentReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];
const AGENT_TEXT_VERBOSITIES: readonly AgentTextVerbosity[] = ['low', 'medium', 'high'];
const AGENT_SERVICE_TIERS: readonly AgentServiceTier[] = [
  'auto',
  'default',
  'fast',
  'flex',
  'priority',
];
const CONVERSATION_ONLY_MESSAGE_TYPES: readonly ConversationOnlyWebviewMessage['type'][] = [
  'clearHistory',
  'cancelMessage',
  'getTasks',
  'getContextTokenCount',
  'compressContext',
];
const EMPTY_MESSAGE_TYPES: readonly EmptyWebviewMessage['type'][] = [
  'newConversation',
  'clearAllConversations',
  'getConversations',
  'getActiveConversation',
  'getAgentStates',
  'getConfig',
  'refreshConfigSnapshot',
  'getSkills',
  'openUserConfigFile',
  'ssoLogout',
  'openConfigFile',
  'getTabState',
];
const TASK_ACTION_MESSAGE_TYPES: readonly TaskActionWebviewMessage['type'][] = [
  'cancelTask',
  'retryTask',
  'viewTaskResult',
];
const QUEUED_MESSAGE_ACTION_TYPES: readonly QueuedMessageActionWebviewMessage['type'][] = [
  'promoteQueuedMessage',
  'cancelQueuedMessage',
];
export const WEBVIEW_TO_EXTENSION_MESSAGE_TYPES = [
  'sendMessage',
  'searchProjectFiles',
  'confirmTool',
  ...CONVERSATION_ONLY_MESSAGE_TYPES,
  'getMessageQueue',
  ...QUEUED_MESSAGE_ACTION_TYPES,
  ...EMPTY_MESSAGE_TYPES,
  'getSettings',
  'getConversationSnapshot',
  'updateSettings',
  'activateConversation',
  'updateTabState',
  ...TASK_ACTION_MESSAGE_TYPES,
  'openFile',
  'revealDocumentLocator',
  'revealFile',
  'revealAsset',
  'openUrl',
  'sendToPlugin',
  'invokeAgentCapabilityLifecycle',
  'requestCanvasAuthoringHandoff',
  'dnd:start',
  'mermaidError',
  'downloadSvg',
  'invokeSlashCommand',
  'invokeSkill',
  'invokePluginSlashCommand',
  'startCharacterDialogueFromSlash',
  'exitCharacterDialogueSession',
  'exitEmbodyCharacterSession',
  'ssoLogin',
  'revealContextSource',
  'webviewKeyboardFocus',
  'webviewKeyboardEditable',
  'projectionEndpointDiscover',
  'projectionAttach',
  'projectionSnapshotAck',
  'projectionDetach',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

const DRAG_MEDIA_TYPES: ReadonlyArray<DragStartWebviewMessage['asset']['mediaType']> = [
  'image',
  'video',
  'audio',
];
export function isSessionMode(value: unknown): value is SessionMode {
  return typeof value === 'string' && SESSION_MODES.includes(value as SessionMode);
}

export function buildGlobalErrorMessage(message: string): GlobalErrorMessage {
  return { type: 'globalError', message };
}

export function buildAgentSessionDiagnosticMessage(input: {
  readonly code: AgentSessionDiagnosticCode;
  readonly severity?: 'warning' | 'error';
  readonly message: string;
  readonly action?: string;
  readonly conversationId?: string;
  readonly tabId?: string;
  readonly activeConversationId?: string | null;
  readonly activeTabConversationId?: string | null;
}): AgentSessionDiagnosticMessage {
  if (!isNonEmptyString(input.message)) {
    throw new Error('sessionDiagnostic requires non-empty message');
  }
  return {
    type: 'sessionDiagnostic',
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    ...(input.action !== undefined ? { action: input.action } : {}),
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    ...(input.tabId !== undefined ? { tabId: input.tabId } : {}),
    ...(input.activeConversationId !== undefined
      ? { activeConversationId: input.activeConversationId }
      : {}),
    ...(input.activeTabConversationId !== undefined
      ? { activeTabConversationId: input.activeTabConversationId }
      : {}),
  };
}

export function buildThinkingMessage(conversationId: string): ThinkingMessage {
  return {
    type: 'thinking',
    conversationId: requireBuilderConversationId(conversationId, 'thinking'),
  };
}

export function buildStreamTextMessage(input: {
  readonly conversationId: string;
  readonly content?: string;
  readonly messageId?: string;
}): StreamTextMessage {
  const conversationId = requireBuilderConversationId(input.conversationId, 'streamText');
  return {
    type: 'streamText',
    conversationId,
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
  };
}

export function buildAssistantTextReplacementMessage(input: {
  readonly conversationId: string;
  readonly messageId?: string;
  readonly reason: 'output-validation-retry';
  readonly attempt: number;
}): AssistantTextReplacementMessage {
  const conversationId = requireBuilderConversationId(
    input.conversationId,
    'assistantTextReplacement',
  );
  return {
    type: 'assistantTextReplacement',
    conversationId,
    reason: input.reason,
    attempt: input.attempt,
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
  };
}

export function buildStreamCompleteMessage(input: {
  readonly conversationId: string;
  readonly messageId?: string;
  readonly contentBlocks?: readonly ContentBlock[];
}): StreamCompleteMessage {
  const conversationId = requireBuilderConversationId(input.conversationId, 'streamComplete');
  return {
    type: 'streamComplete',
    conversationId,
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.contentBlocks && input.contentBlocks.length > 0
      ? { contentBlocks: input.contentBlocks }
      : {}),
  };
}

export function buildErrorMessage(input: {
  readonly conversationId: string;
  readonly message?: string;
}): ErrorMessage {
  return {
    type: 'error',
    conversationId: requireBuilderConversationId(input.conversationId, 'error'),
    ...(input.message !== undefined ? { message: input.message } : {}),
  };
}

export function buildHistoryClearedMessage(conversationId: string): HistoryClearedMessage {
  return {
    type: 'historyCleared',
    conversationId: requireBuilderConversationId(conversationId, 'historyCleared'),
  };
}

export function buildMessageCancelledMessage(conversationId: string): MessageCancelledMessage {
  return {
    type: 'messageCancelled',
    conversationId: requireBuilderConversationId(conversationId, 'messageCancelled'),
  };
}

export function buildMessageQueueSnapshotMessage(
  snapshot: AgentMessageQueueSnapshot,
): MessageQueueSnapshotMessage {
  return {
    type: 'messageQueueSnapshot',
    snapshot: cloneAgentMessageQueueSnapshot(snapshot, 'messageQueueSnapshot'),
  };
}

export function buildQueuedMessageEditRequestedMessage(input: {
  readonly tabId: string;
  readonly conversationId: string;
  readonly item: AgentQueuedMessageItem;
  readonly snapshot: AgentMessageQueueSnapshot;
}): QueuedMessageEditRequestedMessage {
  const tabId = requireBuilderTabId(input.tabId, 'queuedMessageEditRequested');
  const conversationId = requireBuilderConversationId(
    input.conversationId,
    'queuedMessageEditRequested',
  );
  const snapshot = cloneAgentMessageQueueSnapshot(input.snapshot, 'queuedMessageEditRequested');
  if (snapshot.conversationId !== conversationId) {
    throw new Error('queuedMessageEditRequested snapshot conversationId must match conversationId');
  }
  return {
    type: 'queuedMessageEditRequested',
    tabId,
    conversationId,
    item: cloneAgentQueuedMessageItem(input.item, conversationId, 'queuedMessageEditRequested'),
    snapshot,
  };
}

export function buildMessageQueueErrorMessage(input: {
  readonly conversationId: string;
  readonly code: AgentMessageQueueErrorCode;
  readonly message: string;
  readonly queueItemId?: string;
  readonly snapshot?: AgentMessageQueueSnapshot;
}): MessageQueueErrorMessage {
  const conversationId = requireBuilderConversationId(input.conversationId, 'messageQueueError');
  const snapshot =
    input.snapshot !== undefined
      ? cloneAgentMessageQueueSnapshot(input.snapshot, 'messageQueueError')
      : undefined;
  if (snapshot !== undefined && snapshot.conversationId !== conversationId) {
    throw new Error('messageQueueError snapshot conversationId must match conversationId');
  }
  return {
    type: 'messageQueueError',
    conversationId,
    code: input.code,
    message: input.message,
    ...(input.queueItemId !== undefined ? { queueItemId: input.queueItemId } : {}),
    ...(snapshot !== undefined ? { snapshot } : {}),
  };
}

export function buildAgentPhaseMessage(input: {
  readonly conversationId: string;
  readonly phase: AgentPhase;
  readonly toolName?: string;
  readonly timestamp?: number;
}): AgentPhaseMessage {
  return {
    type: 'agentPhase',
    conversationId: requireBuilderConversationId(input.conversationId, 'agentPhase'),
    phase: input.phase,
    ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
    ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
  };
}

export function buildAgentStateSnapshotMessage(
  agentStates: AgentStateSnapshotMessage['agentStates'],
): AgentStateSnapshotMessage {
  return {
    type: 'agentStateSnapshot',
    agentStates: agentStates.map((state) => ({
      ...state,
      conversationId: requireBuilderConversationId(state.conversationId, 'agentStateSnapshot'),
    })),
  };
}

export function buildToolConfirmationMessage(input: {
  readonly conversationId: string;
  readonly toolCallId: string;
  readonly toolName?: string;
  readonly action?: string;
  readonly description?: string;
  readonly details?: Record<string, unknown>;
}): ToolConfirmationMessage {
  return {
    type: 'toolConfirmation',
    conversationId: requireBuilderConversationId(input.conversationId, 'toolConfirmation'),
    toolCallId: input.toolCallId,
    ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
    ...(input.action !== undefined ? { action: input.action } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
  };
}

export function buildAmbientCanvasUpdateMessage(input: {
  readonly nodes?: AmbientCanvasUpdateMessage['nodes'];
  readonly conversationId?: string | null;
}): AmbientCanvasUpdateMessage {
  return {
    type: 'ambientCanvasUpdate',
    ...(input.nodes !== undefined ? { nodes: input.nodes } : {}),
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
  };
}

export function buildAgentCapabilityLifecycleResultMessage(input: {
  readonly requestId: string;
  readonly conversationId: string;
  readonly success: boolean;
  readonly lifecycleResult?: AgentCapabilityInvocationResult;
  readonly result?: CanvasMarkdownCapabilityResult;
  readonly error?: string;
}): AgentCapabilityLifecycleResultMessage {
  return {
    type: 'agentCapabilityLifecycleResult',
    requestId: input.requestId,
    conversationId: requireBuilderConversationId(
      input.conversationId,
      'agentCapabilityLifecycleResult',
    ),
    success: input.success,
    ...(input.lifecycleResult !== undefined ? { lifecycleResult: input.lifecycleResult } : {}),
    ...(input.result !== undefined ? { result: input.result } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
  };
}

export function buildAgentCapabilityActivationProgressMessage(input: {
  readonly conversationId: string;
  readonly events: readonly AgentCapabilityActivationProgressEvent[];
}): AgentCapabilityActivationProgressMessage {
  return {
    type: 'agentCapabilityActivationProgress',
    conversationId: requireBuilderConversationId(
      input.conversationId,
      'agentCapabilityActivationProgress',
    ),
    events: input.events,
  };
}

export function buildInjectContextMessage(
  payload: AgentContextPayload,
  input: { readonly tabId: string; readonly conversationId: string },
): InjectContextMessage {
  return {
    type: 'injectContext',
    tabId: requireBuilderTabId(input.tabId, 'injectContext'),
    conversationId: requireBuilderConversationId(input.conversationId, 'injectContext'),
    payload,
  };
}

export function buildExternalInputMessage(input: {
  readonly message: string;
  readonly autoSend: boolean;
}): ExternalMessage | PrefillInputMessage {
  if (input.autoSend) {
    return { type: 'externalMessage', message: input.message };
  }
  return { type: 'prefillInput', message: input.message };
}

export function buildPluginCommandsMessage(
  commands: NonNullable<PluginCommandsMessage['commands']>,
): PluginCommandsMessage {
  return { type: 'pluginCommands', commands };
}

export function buildPluginsAvailableMessage(plugins: PluginsAvailable): PluginsAvailableMessage {
  return { type: 'pluginsAvailable', plugins };
}

export function buildConfigStateMessage(config: ConfigStateMessage['config']): ConfigStateMessage {
  return { type: 'configState', config };
}

export function buildConfigChangedMessage(): ConfigChangedMessage {
  return { type: 'configChanged' };
}

export function buildTabStateMessage(tabState: TabState, revision: number): TabStateMessage {
  return {
    type: 'tabState',
    revision,
    tabState: {
      openTabs: tabState.openTabs.map((tab) => ({ ...tab })),
      activeTabId: tabState.activeTabId,
    },
  };
}

export function buildTasksUpdatedMessage(input: {
  readonly conversationId: string;
  readonly workItems: readonly AgentWorkItem[];
}): TasksUpdatedMessage {
  return {
    type: 'tasksUpdated',
    conversationId: requireBuilderConversationId(input.conversationId, 'tasksUpdated'),
    workItems: [...input.workItems],
  };
}

export function buildTaskCreatedMessage(input: {
  readonly conversationId: string;
  readonly workItem: AgentWorkItem;
  readonly messageId?: string;
  readonly toolCallId?: string;
}): TaskCreatedMessage {
  return {
    type: 'taskCreated',
    conversationId: requireBuilderConversationId(input.conversationId, 'taskCreated'),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {}),
    workItem: input.workItem,
  };
}

export function buildTaskUpdatedMessage(input: {
  readonly conversationId: string;
  readonly workItem: AgentWorkItem;
}): TaskUpdatedMessage {
  return {
    type: 'taskUpdated',
    conversationId: requireBuilderConversationId(input.conversationId, 'taskUpdated'),
    workItem: input.workItem,
  };
}

export function buildTaskRemovedMessage(input: {
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
}): TaskRemovedMessage {
  if (input.taskScope.childKind !== 'task' || input.taskScope.childRunId !== input.taskId) {
    throw new Error(
      `taskRemoved scope mismatch: ${input.taskScope.childKind}:${input.taskScope.childRunId} cannot remove task ${input.taskId}.`,
    );
  }
  return {
    type: 'taskRemoved',
    conversationId: requireBuilderConversationId(input.taskScope.conversationId, 'taskRemoved'),
    taskScope: input.taskScope,
    taskId: input.taskId,
  };
}

export function buildMediaTaskCreatedMessage(input: {
  readonly conversationId: string;
  readonly workItem: TaskWorkItem;
  readonly messageId?: string;
  readonly toolCallId?: string;
  readonly parentScope?: 'turn';
}): MediaTaskCreatedMessage {
  return {
    type: 'mediaTaskCreated',
    conversationId: requireBuilderConversationId(input.conversationId, 'mediaTaskCreated'),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {}),
    ...(input.parentScope !== undefined ? { parentScope: input.parentScope } : {}),
    workItem: input.workItem,
  };
}

export function buildMediaTaskProgressMessage(input: {
  readonly conversationId: string;
  readonly workItem: TaskWorkItem;
  readonly messageId?: string;
  readonly toolCallId?: string;
  readonly parentScope?: 'turn';
}): MediaTaskProgressMessage {
  return {
    type: 'mediaTaskProgress',
    conversationId: requireBuilderConversationId(input.conversationId, 'mediaTaskProgress'),
    ...(input.messageId !== undefined ? { messageId: input.messageId } : {}),
    ...(input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {}),
    ...(input.parentScope !== undefined ? { parentScope: input.parentScope } : {}),
    workItem: input.workItem,
  };
}

export function buildTaskDeliveryReplayMessage(input: {
  readonly conversationId: string;
  readonly task: DashboardTask;
}): TaskDeliveryReplayMessage {
  return {
    type: 'taskDeliveryReplay',
    conversationId: requireBuilderConversationId(input.conversationId, 'taskDeliveryReplay'),
    task: input.task,
  };
}

export function buildSubAgentEventMessage(input: {
  readonly event: SubAgentWorkItemEvent;
  readonly workItem: SubAgentWorkItem;
}): SubAgentEventMessage {
  const conversationId = requireBuilderConversationId(input.event.conversationId, 'subagentEvent');
  return {
    type: 'subagentEvent',
    conversationId,
    event: input.event,
    workItem: input.workItem,
  };
}

function cloneAgentMessageQueueSnapshot(
  snapshot: AgentMessageQueueSnapshot,
  messageType: string,
): AgentMessageQueueSnapshot {
  const conversationId = requireBuilderConversationId(snapshot.conversationId, messageType);
  return {
    conversationId,
    pendingCount: snapshot.pendingCount,
    version: snapshot.version,
    items: snapshot.items.map((item) =>
      cloneAgentQueuedMessageItem(item, conversationId, messageType),
    ),
  };
}

function cloneAgentQueuedMessageItem(
  item: AgentQueuedMessageItem,
  conversationId: string,
  messageType: string,
): AgentQueuedMessageItem {
  const itemConversationId = requireBuilderConversationId(
    item.conversationId,
    `${messageType} item`,
  );
  if (itemConversationId !== conversationId) {
    throw new Error(`${messageType} item conversationId must match conversationId`);
  }
  return { ...item, conversationId: itemConversationId };
}

export function parseWebviewToExtensionMessage(raw: unknown): WebviewToExtensionMessage | null {
  if (!isRecord(raw) || typeof raw.type !== 'string') return null;

  const type = raw.type;
  if (type === 'projectionEndpointDiscover') {
    return raw.protocolVersion === AGENT_WEBVIEW_PROTOCOL_VERSION && isNonEmptyString(raw.realmId)
      ? { type, protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION, realmId: raw.realmId }
      : null;
  }
  if (type === 'projectionAttach') {
    const key = parseProjectionAttachmentKey(raw.key);
    return key ? { type, key } : null;
  }
  if (type === 'projectionSnapshotAck') {
    const key = parseProjectionAttachmentKey(raw.key);
    const projectionVersion = nonNegativeInteger(raw.projectionVersion);
    if (!key || raw.sequence !== 0 || projectionVersion === null) return null;
    return { type, key, sequence: 0, projectionVersion };
  }
  if (type === 'projectionDetach') {
    const key = parseProjectionAttachmentKey(raw.key);
    if (!key || !isProjectionDetachReason(raw.reason)) return null;
    return { type, key, reason: raw.reason };
  }
  if (type === 'sendMessage') {
    return parseSendMessageWebviewMessage(raw);
  }
  if (type === 'activateConversation') {
    return parseActivateConversationMessage(raw);
  }
  if (type === 'getSettings') {
    const conversationId = requiredString(raw.conversationId);
    return conversationId ? { type, conversationId } : null;
  }
  if (type === 'getConversationSnapshot') {
    const conversationId = requiredString(raw.conversationId);
    return conversationId ? { type, conversationId } : null;
  }
  if (isEmptyMessageType(type)) {
    return { type };
  }
  if (isConversationOnlyMessageType(type)) {
    const conversationId = requiredString(raw.conversationId);
    return conversationId ? { type, conversationId } : null;
  }
  if (type === 'getMessageQueue') {
    const conversationId = requiredString(raw.conversationId);
    return conversationId ? { type, conversationId } : null;
  }
  if (type === 'editQueuedMessage') {
    return parseEditQueuedMessage(raw);
  }
  if (isQueuedMessageActionType(type)) {
    return parseQueuedMessageActionMessage(type, raw);
  }
  if (isTaskActionMessageType(type)) {
    return parseTaskActionMessage(type, raw);
  }

  switch (type) {
    case 'searchProjectFiles':
      return parseSearchProjectFilesMessage(raw);
    case 'confirmTool':
      return parseConfirmToolMessage(raw);
    case 'deleteConversation':
      return parseDeleteConversationMessage(raw);
    case 'updateSettings':
      return parseUpdateSettingsMessage(raw);
    case 'updateTabState':
      return parseUpdateTabStateMessage(raw);
    case 'openFile':
      return parseOpenFileMessage(raw);
    case 'revealDocumentLocator':
      return parseRevealDocumentLocatorMessage(raw);
    case 'revealFile':
      return parseFilePathMessage('revealFile', raw);
    case 'revealAsset':
      return parseRevealAssetMessage(raw);
    case 'openUrl':
      return parseOpenUrlMessage(raw);
    case 'sendToPlugin':
      return parseSendToPluginMessage(raw);
    case 'invokeAgentCapabilityLifecycle':
      return parseInvokeAgentCapabilityLifecycleMessage(raw);
    case 'requestCanvasAuthoringHandoff':
      return parseRequestCanvasAuthoringHandoffMessage(raw);
    case 'dnd:start':
      return parseDragStartMessage(raw);
    case 'mermaidError':
      return parseMermaidErrorMessage(raw);
    case 'downloadSvg':
      return parseDownloadSvgMessage(raw);
    case 'invokeSlashCommand':
      return parseInvokeSlashCommandMessage(raw);
    case 'invokeSkill':
      return parseInvokeSkillMessage(raw);
    case 'invokePluginSlashCommand':
      return parseInvokePluginSlashCommandMessage(raw);
    case 'startCharacterDialogueFromSlash':
      return parseStartCharacterDialogueFromSlashMessage(raw);
    case 'exitCharacterDialogueSession':
      return parseExitCharacterDialogueSessionMessage(raw);
    case 'exitEmbodyCharacterSession':
      return parseExitEmbodyCharacterSessionMessage(raw);
    case 'ssoLogin':
      return parseSsoLoginMessage(raw);
    case 'revealContextSource':
      return parseRevealContextSourceMessage(raw);
    case 'webviewKeyboardFocus':
      return typeof raw.focused === 'boolean' ? { type, focused: raw.focused } : null;
    case 'webviewKeyboardEditable':
      return typeof raw.editable === 'boolean' ? { type, editable: raw.editable } : null;
    default:
      return null;
  }
}

export function parseSendMessageWebviewMessage(raw: unknown): SendMessageWebviewMessage | null {
  if (!isRecord(raw) || raw.type !== 'sendMessage') return null;
  if (!isNonEmptyString(raw.conversationId)) return null;
  if (typeof raw.message !== 'string') return null;
  if (!isSessionMode(raw.sessionMode)) return null;
  if (
    raw.providerId !== undefined ||
    raw.modelId !== undefined ||
    raw.mediaProviderId !== undefined ||
    raw.mediaModelId !== undefined ||
    raw.agentMediaModels !== undefined ||
    raw.mediaModels !== undefined ||
    raw.understandingModels !== undefined ||
    raw.agentModel !== undefined ||
    raw.agentLlmConfig !== undefined ||
    raw.llmParams !== undefined ||
    raw.temperature !== undefined ||
    raw.maxTokens !== undefined ||
    raw.maxOutputTokens !== undefined ||
    raw.topP !== undefined ||
    raw.reasoningEffort !== undefined ||
    raw.thinkingBudget !== undefined ||
    raw.verbosity !== undefined ||
    raw.serviceTier !== undefined
  ) {
    return null;
  }

  const chatModel = raw.chatModel === undefined ? undefined : parseModelRef(raw.chatModel, 'llm');
  if (raw.chatModel !== undefined && !chatModel) return null;

  const agentModels =
    raw.agentModels === undefined ? undefined : parseAgentModelSlots(raw.agentModels);
  if (raw.agentModels !== undefined && !agentModels) return null;

  const llmConfig = raw.llmConfig === undefined ? undefined : parseAgentLlmConfig(raw.llmConfig);
  if (raw.llmConfig !== undefined && !llmConfig) return null;

  const mediaModel = raw.mediaModel === undefined ? undefined : parseMediaModelRef(raw.mediaModel);
  if (raw.mediaModel !== undefined && !mediaModel) return null;

  const purposeModels =
    raw.purposeModels === undefined ? undefined : parseAgentFlatPurposeModelRefs(raw.purposeModels);
  if (raw.purposeModels !== undefined && !purposeModels) return null;

  const attachments =
    raw.attachments === undefined
      ? undefined
      : Array.isArray(raw.attachments)
        ? (raw.attachments as MessageAttachment[])
        : null;
  if (attachments === null) return null;

  const contextPayloads =
    raw.contextPayloads === undefined
      ? undefined
      : Array.isArray(raw.contextPayloads)
        ? parseAgentContextPayloads(raw.contextPayloads)
        : null;
  if (contextPayloads === null) return null;

  const fileReferences =
    raw.fileReferences === undefined
      ? undefined
      : Array.isArray(raw.fileReferences)
        ? parseAgentFileReferences(raw.fileReferences)
        : null;
  if (fileReferences === null) return null;

  const promptId = optionalString(raw.promptId);
  if (raw.promptId !== undefined && promptId === undefined) return null;

  const messageTrackingId = optionalString(raw.messageTrackingId);
  if (raw.messageTrackingId !== undefined && messageTrackingId === undefined) return null;

  if (raw.sessionMode === 'agent') {
    if (mediaModel) return null;
  } else {
    if (!mediaModel || mediaModel.category !== raw.sessionMode) return null;
    if (purposeModels) return null;
    if (agentModels || llmConfig) return null;
  }

  return {
    type: 'sendMessage',
    conversationId: raw.conversationId,
    message: raw.message,
    sessionMode: raw.sessionMode,
    ...(chatModel ? { chatModel } : {}),
    ...(agentModels ? { agentModels } : {}),
    ...(llmConfig ? { llmConfig } : {}),
    ...(mediaModel ? { mediaModel } : {}),
    ...(purposeModels ? { purposeModels } : {}),
    ...(attachments ? { attachments } : {}),
    ...(contextPayloads ? { contextPayloads } : {}),
    ...(fileReferences ? { fileReferences } : {}),
    ...(promptId ? { promptId } : {}),
    ...(messageTrackingId ? { messageTrackingId } : {}),
  };
}

function parseAgentFileReferences(raw: readonly unknown[]): AgentFileReference[] | null {
  const references: AgentFileReference[] = [];

  for (const item of raw) {
    if (!isAgentFileReference(item)) {
      return null;
    }
    references.push(item);
  }

  return references;
}

function isAgentFileReference(raw: unknown): raw is AgentFileReference {
  if (!isRecord(raw)) return false;
  if (!isNonEmptyString(raw.id)) return false;
  if (!isNonEmptyString(raw.path)) return false;
  if (!isNonEmptyString(raw.label)) return false;
  if (raw.mediaType !== undefined && !isAgentFileReferenceMediaType(raw.mediaType)) return false;
  if (raw.source !== undefined && !isAgentFileReferenceSource(raw.source)) return false;
  if (raw.thumbnailUri !== undefined && typeof raw.thumbnailUri !== 'string') return false;
  return true;
}

function isAgentFileReferenceMediaType(value: unknown): value is AgentFileReference['mediaType'] {
  return (
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
  );
}

function isAgentFileReferenceSource(value: unknown): value is AgentFileReference['source'] {
  return (
    value === 'workspace' ||
    value === 'asset-library' ||
    value === 'media-library' ||
    value === 'entity-graph' ||
    value === 'story' ||
    value === 'canvas'
  );
}

function parseAgentContextPayloads(raw: readonly unknown[]): AgentContextPayload[] | null {
  const payloads: AgentContextPayload[] = [];

  for (const item of raw) {
    if (!isAgentContextPayload(item)) {
      return null;
    }
    payloads.push(item);
  }

  return payloads;
}

function isAgentContextPayload(raw: unknown): raw is AgentContextPayload {
  return (
    isRecord(raw) &&
    isAgentContextPayloadType(raw.type) &&
    isNonEmptyString(raw.id) &&
    isNonEmptyString(raw.label) &&
    typeof raw.summary === 'string' &&
    'data' in raw &&
    (raw.type !== '3d-reference' || isThreeReferenceContextData(raw.data)) &&
    (raw.intent === undefined || typeof raw.intent === 'string') &&
    (raw.generationParams === undefined || isRecord(raw.generationParams))
  );
}

function isAgentContextPayloadType(type: unknown): type is AgentContextPayload['type'] {
  return (
    type === 'canvas-node' ||
    type === 'cut-clip' ||
    type === 'story-selection' ||
    type === 'character' ||
    type === 'scene' ||
    type === 'asset' ||
    type === 'media' ||
    type === 'entity' ||
    type === 'sketch-layer' ||
    type === '3d-reference' ||
    type === 'audio-clip' ||
    type === 'file' ||
    type === 'image' ||
    type === 'document-selection' ||
    type === 'canvas-storyboard-action-intent'
  );
}

function parseSearchProjectFilesMessage(
  raw: Record<string, unknown>,
): SearchProjectFilesWebviewMessage | null {
  const purpose = optionalSearchProjectFilesPurpose(raw.purpose);
  if (purpose === null) return null;
  const conversationId = requiredString(raw.conversationId);
  if (typeof raw.filter !== 'string') return null;
  if (!conversationId && purpose !== 'roleplay' && purpose !== 'entry') return null;
  return {
    type: 'searchProjectFiles',
    filter: raw.filter,
    ...(conversationId ? { conversationId } : {}),
    ...(purpose ? { purpose } : {}),
  };
}

function parseConfirmToolMessage(raw: Record<string, unknown>): ConfirmToolWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  const toolCallId = requiredString(raw.toolCallId);
  if (!conversationId || !toolCallId || typeof raw.approved !== 'boolean') return null;
  return { type: 'confirmTool', toolCallId, approved: raw.approved, conversationId };
}

function parseDeleteConversationMessage(
  raw: Record<string, unknown>,
): DeleteConversationWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  if (!conversationId) return null;
  const activateNext = typeof raw.activateNext === 'boolean' ? raw.activateNext : undefined;
  return {
    type: 'deleteConversation',
    conversationId,
    ...(activateNext !== undefined ? { activateNext } : {}),
  };
}

function parseUpdateSettingsMessage(
  raw: Record<string, unknown>,
): UpdateSettingsWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  if (!isRecord(raw.settings) || !conversationId) return null;
  return {
    type: 'updateSettings',
    settings: raw.settings,
    conversationId,
  };
}

function parseActivateConversationMessage(
  raw: Record<string, unknown>,
): ActivateConversationWebviewMessage | null {
  const activationId = nonNegativeInteger(raw.activationId);
  const conversationId = requiredString(raw.conversationId);
  const tabId = requiredString(raw.tabId);
  const expectedTabStateRevision = nonNegativeInteger(raw.expectedTabStateRevision);
  if (
    activationId === null ||
    !conversationId ||
    !tabId ||
    expectedTabStateRevision === null ||
    !isRecord(raw.tabState)
  ) {
    return null;
  }
  const openTabs = parseOpenTabs(raw.tabState.openTabs);
  const activeTabId = requiredString(raw.tabState.activeTabId);
  if (!openTabs || !activeTabId) return null;
  return {
    type: 'activateConversation',
    activationId,
    conversationId,
    tabId,
    expectedTabStateRevision,
    tabState: { openTabs, activeTabId },
  };
}

function parseUpdateTabStateMessage(
  raw: Record<string, unknown>,
): UpdateTabStateWebviewMessage | null {
  const openTabs = parseOpenTabs(raw.openTabs);
  const expectedTabStateRevision = nonNegativeInteger(raw.expectedTabStateRevision);
  if (!openTabs || expectedTabStateRevision === null) return null;
  if (raw.activeTabId === null) {
    return { type: 'updateTabState', openTabs, activeTabId: null, expectedTabStateRevision };
  }
  if (typeof raw.activeTabId !== 'string') return null;
  return {
    type: 'updateTabState',
    openTabs,
    activeTabId: raw.activeTabId,
    expectedTabStateRevision,
  };
}

function parseTaskActionMessage(
  type: TaskActionWebviewMessage['type'],
  raw: Record<string, unknown>,
): TaskActionWebviewMessage | null {
  const scopeResult = validateChildRunScope(raw.taskScope);
  if (!scopeResult.ok || scopeResult.scope.childKind !== 'task') {
    return null;
  }
  const resultRef = typeof raw.resultRef === 'string' && raw.resultRef ? raw.resultRef : undefined;
  return {
    type,
    taskScope: scopeResult.scope as TaskRunScope,
    ...(resultRef ? { resultRef } : {}),
  };
}

function parseEditQueuedMessage(
  raw: Record<string, unknown>,
): EditQueuedMessageWebviewMessage | null {
  const tabId = requiredString(raw.tabId);
  const conversationId = requiredString(raw.conversationId);
  const queueItemId = requiredString(raw.queueItemId);
  return tabId && conversationId && queueItemId
    ? { type: 'editQueuedMessage', tabId, conversationId, queueItemId }
    : null;
}

function parseQueuedMessageActionMessage(
  type: QueuedMessageActionWebviewMessage['type'],
  raw: Record<string, unknown>,
): QueuedMessageActionWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  const queueItemId = requiredString(raw.queueItemId);
  return conversationId && queueItemId ? { type, conversationId, queueItemId } : null;
}

function parseOpenFileMessage(raw: Record<string, unknown>): OpenFileWebviewMessage | null {
  const filePath = requiredString(raw.filePath);
  const options = raw.options === undefined ? undefined : parseOpenFileOptions(raw.options);
  if (!filePath || options === null) return null;
  return { type: 'openFile', filePath, ...(options !== undefined ? { options } : {}) };
}

function parseRevealDocumentLocatorMessage(
  raw: Record<string, unknown>,
): RevealDocumentLocatorWebviewMessage | null {
  const filePath = requiredString(raw.filePath);
  const locator = parseDocumentLocator(raw.locator);
  const source = raw.source === undefined ? undefined : parseDocumentSourceRef(raw.source);
  if (!filePath || !locator || (raw.source !== undefined && source === undefined)) return null;
  return {
    type: 'revealDocumentLocator',
    filePath,
    locator,
    ...(source !== undefined ? { source } : {}),
  };
}

function parseFilePathMessage(
  type: FilePathWebviewMessage['type'],
  raw: Record<string, unknown>,
): FilePathWebviewMessage | null {
  const filePath = requiredString(raw.filePath);
  return filePath ? { type, filePath } : null;
}

function parseRevealAssetMessage(raw: Record<string, unknown>): RevealAssetWebviewMessage | null {
  const assetId = requiredString(raw.assetId);
  return assetId ? { type: 'revealAsset', assetId } : null;
}

function parseOpenUrlMessage(raw: Record<string, unknown>): OpenUrlWebviewMessage | null {
  const url = requiredString(raw.url);
  return url ? { type: 'openUrl', url } : null;
}

function parseSendToPluginMessage(raw: Record<string, unknown>): SendToPluginWebviewMessage | null {
  const target = requiredString(raw.target);
  const assetPath = optionalStringStrict(raw.assetPath);
  const mediaType = optionalStringStrict(raw.mediaType);
  const payload = raw.payload === undefined ? undefined : parsePluginTransferPayload(raw.payload);
  if (!target || assetPath === null || mediaType === null || payload === null) return null;
  if (payload === undefined && assetPath === undefined) return null;
  return {
    type: 'sendToPlugin',
    target,
    ...(assetPath !== undefined ? { assetPath } : {}),
    ...(mediaType !== undefined ? { mediaType } : {}),
    ...(payload !== undefined ? { payload } : {}),
  };
}

function parseInvokeAgentCapabilityLifecycleMessage(
  raw: Record<string, unknown>,
): InvokeAgentCapabilityLifecycleWebviewMessage | null {
  const requestId = requiredString(raw.requestId);
  const conversationId = requiredString(raw.conversationId);
  if (!requestId || !conversationId || !isAgentCapabilityInvocationInput(raw.invocation)) {
    return null;
  }
  return {
    type: 'invokeAgentCapabilityLifecycle',
    requestId,
    conversationId,
    invocation: raw.invocation,
  };
}

function parseRequestCanvasAuthoringHandoffMessage(
  raw: Record<string, unknown>,
): RequestCanvasAuthoringHandoffWebviewMessage | null {
  if (
    raw.capabilityId !== undefined ||
    raw.input !== undefined ||
    raw.intentHint !== undefined ||
    raw.profileHint !== undefined
  ) {
    return null;
  }

  const requestId = requiredString(raw.requestId);
  const conversationId = requiredString(raw.conversationId);
  const content = requiredString(raw.content);
  const sourceKind = parseCanvasAuthoringSourceKind(raw.sourceKind);
  if (!requestId || !conversationId || !content || !sourceKind) return null;

  const sourceFormat =
    raw.sourceFormat === undefined ? undefined : parseCanvasAuthoringSourceFormat(raw.sourceFormat);
  if (raw.sourceFormat !== undefined && sourceFormat === undefined) return null;
  const canonicalStoryboard = parseCanonicalStoryboardHandoff(raw.canonicalStoryboard);
  if (canonicalStoryboard === null) return null;
  const title = optionalString(raw.title);
  if (raw.title !== undefined && title === undefined) return null;
  const resources =
    raw.resources === undefined
      ? undefined
      : Array.isArray(raw.resources) && raw.resources.every(isCanvasMarkdownResourceRef)
        ? raw.resources
        : null;
  if (resources === null) return null;
  const stableRefs =
    raw.stableRefs === undefined ? undefined : parseCanvasAuthoringStableRefs(raw.stableRefs);
  if (stableRefs === null) return null;
  const diagnostics =
    raw.diagnostics === undefined
      ? undefined
      : parseCanvasAuthoringHandoffDiagnostics(raw.diagnostics);
  if (diagnostics === null) return null;
  const promptSpans =
    raw.promptSpans === undefined
      ? undefined
      : parseCanvasAuthoringHandoffPromptSpans(raw.promptSpans);
  if (promptSpans === null) return null;
  const target =
    raw.target === undefined
      ? undefined
      : isCanvasMarkdownCapabilityTarget(raw.target)
        ? raw.target
        : null;
  if (target === null) return null;
  const provenance =
    raw.provenance === undefined
      ? undefined
      : parseOptionalPluginTransferProvenance(raw.provenance);
  if (provenance === null) return null;
  const userIntent = optionalString(raw.userIntent);
  if (raw.userIntent !== undefined && userIntent === undefined) return null;
  const targetHints =
    raw.targetHints === undefined ? undefined : parseCanvasAuthoringTargetHints(raw.targetHints);
  if (targetHints === null) return null;

  return {
    type: 'requestCanvasAuthoringHandoff',
    requestId,
    conversationId,
    sourceKind,
    content,
    ...(sourceFormat ? { sourceFormat } : {}),
    ...(canonicalStoryboard ? { canonicalStoryboard } : {}),
    ...(title ? { title } : {}),
    ...(resources ? { resources } : {}),
    ...(stableRefs ? { stableRefs } : {}),
    ...(diagnostics ? { diagnostics } : {}),
    ...(promptSpans ? { promptSpans } : {}),
    ...(target ? { target } : {}),
    ...(provenance ? { provenance } : {}),
    ...(userIntent ? { userIntent } : {}),
    ...(targetHints ? { targetHints } : {}),
  };
}

function parseCanonicalStoryboardHandoff(value: unknown): StoryboardTable | null | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeCanonicalStoryboardTable({ value });
  if (!normalized.table) return null;
  return validateCanonicalStoryboardTable(normalized.table).ok ? normalized.table : null;
}

function parseCanvasMarkdownSourceFormat(
  value: unknown,
): CanvasAuthoringMarkdownSourceFormat | undefined {
  return value === 'markdown' ||
    value === 'markdown-table' ||
    value === 'gfm-table' ||
    value === 'resource-reference-markdown'
    ? value
    : undefined;
}

function parseCanvasAuthoringSourceKind(
  value: unknown,
): CanvasAuthoringHandoffSourceKind | undefined {
  return value === 'markdown' ||
    value === 'generated-text' ||
    value === 'structured-content' ||
    value === 'resource-backed-content'
    ? value
    : undefined;
}

function parseCanvasAuthoringSourceFormat(
  value: unknown,
): CanvasAuthoringHandoffSourceFormat | undefined {
  const markdownFormat = parseCanvasMarkdownSourceFormat(value);
  if (markdownFormat) return markdownFormat;
  return value === 'plain-text' || value === 'json' || value === 'composite-artifact'
    ? value
    : undefined;
}

function parseCanvasMarkdownIntentHint(
  value: unknown,
): CanvasAuthoringHandoffDeclaredIntentHint | undefined {
  return value === 'auto' || value === 'note' || value === 'table' || value === 'creative-table'
    ? value
    : undefined;
}

function parseCanvasAuthoringStableRefs(
  value: unknown,
): readonly CanvasAuthoringHandoffStableRef[] | null {
  if (!Array.isArray(value)) return null;
  const refs: CanvasAuthoringHandoffStableRef[] = [];
  for (const item of value) {
    const ref = parseCanvasAuthoringStableRef(item);
    if (!ref) return null;
    refs.push(ref);
  }
  return refs;
}

function parseCanvasAuthoringTargetHints(value: unknown): CanvasAuthoringHandoffTargetHints | null {
  if (!isRecord(value)) return null;
  const sourceFormat =
    value.sourceFormat === undefined
      ? undefined
      : parseCanvasAuthoringSourceFormat(value.sourceFormat);
  if (value.sourceFormat !== undefined && sourceFormat === undefined) return null;
  const declaredIntentHint =
    value.declaredIntentHint === undefined
      ? undefined
      : parseCanvasMarkdownIntentHint(value.declaredIntentHint);
  if (value.declaredIntentHint !== undefined && declaredIntentHint === undefined) return null;
  const declaredProfileHint = optionalString(value.declaredProfileHint);
  if (value.declaredProfileHint !== undefined && declaredProfileHint === undefined) return null;
  const operationHint = optionalString(value.operationHint);
  if (value.operationHint !== undefined && operationHint === undefined) return null;

  return {
    ...(sourceFormat ? { sourceFormat } : {}),
    ...(declaredIntentHint ? { declaredIntentHint } : {}),
    ...(declaredProfileHint ? { declaredProfileHint } : {}),
    ...(operationHint ? { operationHint } : {}),
  };
}

function parseCanvasAuthoringSourceRange(value: unknown): CanvasAuthoringHandoffSourceRange | null {
  if (!isRecord(value)) return null;
  const start =
    typeof value.start === 'number' && Number.isFinite(value.start) ? value.start : null;
  const end = typeof value.end === 'number' && Number.isFinite(value.end) ? value.end : null;
  if (start === null || end === null || start < 0 || end < start) return null;
  return { start, end };
}

function parseCanvasAuthoringHandoffDiagnostics(
  value: unknown,
): readonly CanvasAuthoringHandoffDiagnostic[] | null {
  if (!Array.isArray(value)) return null;
  const diagnostics: CanvasAuthoringHandoffDiagnostic[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (item.severity !== 'info' && item.severity !== 'warning' && item.severity !== 'error') {
      return null;
    }
    const code = requiredString(item.code);
    const message = requiredString(item.message);
    if (!code || !message) return null;
    const token = optionalString(item.token);
    if (item.token !== undefined && token === undefined) return null;
    const range =
      item.range === undefined ? undefined : parseCanvasAuthoringSourceRange(item.range);
    if (range === null) return null;
    diagnostics.push({
      severity: item.severity,
      code,
      message,
      ...(token ? { token } : {}),
      ...(range ? { range } : {}),
    });
  }
  return diagnostics;
}

function parseCanvasAuthoringHandoffPromptSpans(
  value: unknown,
): readonly CanvasAuthoringHandoffPromptSpan[] | null {
  if (!Array.isArray(value)) return null;
  const spans: CanvasAuthoringHandoffPromptSpan[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const kind = requiredString(item.kind);
    const range = parseCanvasAuthoringSourceRange(item.range);
    if (!kind || !range) return null;
    const fieldId = optionalString(item.fieldId);
    if (item.fieldId !== undefined && fieldId === undefined) return null;
    const label = optionalString(item.label);
    if (item.label !== undefined && label === undefined) return null;
    const ref = item.ref === undefined ? undefined : parseCanvasAuthoringStableRef(item.ref);
    if (ref === null) return null;
    const tone = optionalString(item.tone);
    if (item.tone !== undefined && tone === undefined) return null;
    const tooltip = optionalString(item.tooltip);
    if (item.tooltip !== undefined && tooltip === undefined) return null;
    spans.push({
      kind,
      range,
      ...(fieldId ? { fieldId } : {}),
      ...(label ? { label } : {}),
      ...(ref ? { ref } : {}),
      ...(tone ? { tone } : {}),
      ...(tooltip ? { tooltip } : {}),
    });
  }
  return spans;
}

function parseCanvasAuthoringStableRef(value: unknown): CanvasAuthoringHandoffStableRef | null {
  if (!isRecord(value)) return null;
  const kind = requiredString(value.kind);
  const id = requiredString(value.id);
  if (!kind || !id) return null;
  const namespace = optionalString(value.namespace);
  if (value.namespace !== undefined && namespace === undefined) return null;
  const token = optionalString(value.token);
  if (value.token !== undefined && token === undefined) return null;
  const placementHint = optionalString(value.placementHint);
  if (value.placementHint !== undefined && placementHint === undefined) return null;
  return {
    kind,
    id,
    ...(namespace ? { namespace } : {}),
    ...(token ? { token } : {}),
    ...(placementHint ? { placementHint } : {}),
  };
}

function parsePluginTransferPayload(value: unknown): PluginTransferPayload | null {
  if (!isRecord(value)) return null;

  if (value.kind === 'singleAsset') {
    const asset = parsePluginTransferAssetRef(value.asset);
    const target = parseOptionalPluginTransferTargetRef(value.target);
    const provenance = parseOptionalPluginTransferProvenance(value.provenance);
    if (!asset || target === null || provenance === null) return null;
    return {
      kind: 'singleAsset',
      asset,
      ...(target !== undefined ? { target } : {}),
      ...(provenance !== undefined ? { provenance } : {}),
    };
  }

  if (value.kind === 'assetBatch') {
    if (!Array.isArray(value.assets)) return null;
    const assets: PluginTransferAssetRef[] = [];
    for (const item of value.assets) {
      const asset = parsePluginTransferAssetRef(item);
      if (!asset) return null;
      assets.push(asset);
    }
    const target = parseOptionalPluginTransferTargetRef(value.target);
    const provenance = parseOptionalPluginTransferProvenance(value.provenance);
    if (target === null || provenance === null) return null;
    return {
      kind: 'assetBatch',
      assets,
      ...(target !== undefined ? { target } : {}),
      ...(provenance !== undefined ? { provenance } : {}),
    };
  }

  if (value.kind === 'cutStoryboard') {
    const storyboard = parseCutStoryboardPayload(value.storyboard);
    const target = parseOptionalPluginTransferTargetRef(value.target);
    const provenance = parseOptionalPluginTransferProvenance(value.provenance);
    if (!storyboard || target === null || provenance === null) return null;
    return {
      kind: 'cutStoryboard',
      storyboard,
      ...(target !== undefined ? { target } : {}),
      ...(provenance !== undefined ? { provenance } : {}),
    };
  }

  return null;
}

function parsePluginTransferAssetRef(value: unknown): PluginTransferAssetRef | null {
  if (!isRecord(value)) return null;
  const path = optionalStringStrict(value.path);
  const mediaType = optionalStringStrict(value.mediaType);
  const name = optionalStringStrict(value.name);
  const documentResourceRef =
    value.documentResourceRef === undefined
      ? undefined
      : parseDocumentArchiveResourceRef(value.documentResourceRef);
  const resourceRef = value.resourceRef === undefined ? undefined : value.resourceRef;
  const target = parseOptionalPluginTransferTargetRef(value.target);
  const provenance = parseOptionalPluginTransferProvenance(value.provenance);
  if (
    path === null ||
    mediaType === null ||
    name === null ||
    (value.documentResourceRef !== undefined && documentResourceRef === undefined) ||
    (value.resourceRef !== undefined && !isResourceRef(resourceRef)) ||
    target === null ||
    provenance === null
  ) {
    return null;
  }
  if (!path && documentResourceRef === undefined && !isResourceRef(resourceRef)) {
    return null;
  }
  const suffix = {
    ...(path !== undefined ? { path } : {}),
    ...(documentResourceRef !== undefined ? { documentResourceRef } : {}),
    ...(isResourceRef(resourceRef) ? { resourceRef } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(provenance !== undefined ? { provenance } : {}),
  };
  if (mediaType !== undefined) {
    if (!isPluginTransferMediaType(mediaType)) return null;
    if (name !== undefined) return { mediaType, name, ...suffix };
    return { mediaType, ...suffix };
  }
  if (name !== undefined) return { name, ...suffix };
  return suffix;
}

function isPluginTransferMediaType(
  value: string,
): value is NonNullable<PluginTransferAssetRef['mediaType']> {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'model';
}

function parseOptionalPluginTransferTargetRef(
  value: unknown,
): PluginTransferTargetRef | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const plugin = optionalStringStrict(value.plugin);
  const canvasId = optionalStringStrict(value.canvasId);
  const nodeId = optionalStringStrict(value.nodeId);
  const containerId = optionalStringStrict(value.containerId);
  const slotId = optionalStringStrict(value.slotId);
  const fieldPath = optionalStringStrict(value.fieldPath);
  const mode = optionalStringStrict(value.mode);
  const kind = optionalStringStrict(value.kind);
  const documentUri = optionalStringStrict(value.documentUri);
  const title = optionalStringStrict(value.title);
  const expectedProjectRevision = optionalStringStrict(value.expectedProjectRevision);
  const reveal = value.reveal;
  const insertionPoint = parseOptionalTransferInsertionPoint(value.insertionPoint);
  if (
    plugin === null ||
    canvasId === null ||
    nodeId === null ||
    containerId === null ||
    slotId === null ||
    fieldPath === null ||
    mode === null ||
    kind === null ||
    documentUri === null ||
    title === null ||
    expectedProjectRevision === null ||
    (reveal !== undefined && typeof reveal !== 'boolean') ||
    insertionPoint === null
  ) {
    return null;
  }
  if (plugin !== undefined && !isPluginTransferTarget(plugin)) return null;
  if (mode !== undefined && !isPluginTransferTargetMode(mode)) return null;
  if (kind !== undefined && kind !== 'active' && kind !== 'file' && kind !== 'new') return null;
  const parsedFieldPath = parseOptionalJsonPointerPath(fieldPath);
  if (parsedFieldPath === null) return null;
  const parsedPlugin = plugin as NonNullable<PluginTransferTargetRef['plugin']> | undefined;
  const parsedMode = mode as PluginTransferTargetMode | undefined;
  return {
    ...(parsedPlugin !== undefined ? { plugin: parsedPlugin } : {}),
    ...(canvasId !== undefined ? { canvasId } : {}),
    ...(nodeId !== undefined ? { nodeId } : {}),
    ...(containerId !== undefined ? { containerId } : {}),
    ...(slotId !== undefined ? { slotId } : {}),
    ...(parsedFieldPath !== undefined ? { fieldPath: parsedFieldPath } : {}),
    ...(insertionPoint !== undefined ? { insertionPoint } : {}),
    ...(parsedMode !== undefined ? { mode: parsedMode } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(documentUri !== undefined ? { documentUri } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(expectedProjectRevision !== undefined ? { expectedProjectRevision } : {}),
    ...(typeof reveal === 'boolean' ? { reveal } : {}),
  };
}

function parseOptionalJsonPointerPath(
  value: string | undefined,
): NonNullable<PluginTransferTargetRef['fieldPath']> | undefined | null {
  if (value === undefined) return undefined;
  return isJsonPointerPath(value) ? value : null;
}

function parseOptionalTransferInsertionPoint(
  value: unknown,
): PluginTransferTargetRef['insertionPoint'] | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y)
  ) {
    return null;
  }
  return { x: value.x, y: value.y };
}

function parseOptionalPluginTransferProvenance(
  value: unknown,
): PluginTransferProvenance | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const source = optionalStringStrict(value.source);
  const conversationId = optionalStringStrict(value.conversationId);
  const messageId = optionalStringStrict(value.messageId);
  const toolCallId = optionalStringStrict(value.toolCallId);
  const label = optionalStringStrict(value.label);
  const metadata =
    value.metadata === undefined ? undefined : parseJsonMetadataRecord(value.metadata);
  if (
    source === null ||
    conversationId === null ||
    messageId === null ||
    toolCallId === null ||
    label === null ||
    metadata === null
  ) {
    return null;
  }
  if (source !== undefined && !isPluginTransferProvenanceSource(source)) return null;
  const parsedSource = source as NonNullable<PluginTransferProvenance['source']> | undefined;
  return {
    ...(parsedSource !== undefined ? { source: parsedSource } : {}),
    ...(conversationId !== undefined ? { conversationId } : {}),
    ...(messageId !== undefined ? { messageId } : {}),
    ...(toolCallId !== undefined ? { toolCallId } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function parseJsonMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const metadata: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'documentResourceRef') {
      const resourceRef = parseDocumentArchiveResourceRef(item);
      if (!resourceRef) return null;
      metadata[key] = resourceRef;
      continue;
    }
    if (isRecord(item)) {
      const parsed = parseJsonMetadataRecord(item);
      if (parsed === null) return null;
      metadata[key] = parsed;
      continue;
    }
    metadata[key] = item;
  }
  return metadata;
}

function isPluginTransferTarget(
  value: string,
): value is NonNullable<PluginTransferTargetRef['plugin']> {
  return (
    value === 'canvas' ||
    value === 'cut' ||
    value === 'sketch' ||
    value === 'model' ||
    value === 'explorer'
  );
}

function isPluginTransferTargetMode(value: string): value is PluginTransferTargetMode {
  return (
    value === 'insert' ||
    value === 'append' ||
    value === 'replace' ||
    value === 'apply' ||
    value === 'create-child'
  );
}

function isJsonPointerPath(
  value: string,
): value is NonNullable<PluginTransferTargetRef['fieldPath']> {
  return value === '' || value.startsWith('/');
}

function isPluginTransferProvenanceSource(
  value: string,
): value is NonNullable<PluginTransferProvenance['source']> {
  return (
    value === 'agent' ||
    value === 'webview' ||
    value === 'tool' ||
    value === 'user' ||
    value === 'plugin'
  );
}

function parseCutStoryboardPayload(value: unknown): PluginTransferCutStoryboardPayload | null {
  if (!isRecord(value)) return null;
  const projectName = requiredString(value.projectName);
  if (!projectName || !Array.isArray(value.shots)) return null;
  const shots: PluginTransferCutStoryboardShot[] = [];
  for (const item of value.shots) {
    const shot = parseCutStoryboardShot(item);
    if (!shot) return null;
    shots.push(shot);
  }
  return shots.length > 0 ? { projectName, shots } : null;
}

function parseCutStoryboardShot(value: unknown): PluginTransferCutStoryboardShot | null {
  if (!isRecord(value)) return null;
  const id = requiredString(value.id);
  const label = requiredString(value.label);
  const imagePath = optionalStringStrict(value.imagePath);
  const imageDataUrl = optionalStringStrict(value.imageDataUrl);
  const dialogue = optionalStringStrict(value.dialogue);
  const voiceOver = optionalStringStrict(value.voiceOver);
  const soundCue = optionalStringStrict(value.soundCue);
  const textCues = parseStoryboardTextCues(value.textCues);
  const voiceCues = parseStoryboardVoiceCues(value.voiceCues);
  if (
    !id ||
    !label ||
    typeof value.shotNumber !== 'number' ||
    !Number.isFinite(value.shotNumber) ||
    typeof value.duration !== 'number' ||
    !Number.isFinite(value.duration) ||
    imagePath === null ||
    imageDataUrl === null ||
    dialogue === null ||
    voiceOver === null ||
    soundCue === null ||
    textCues === null ||
    voiceCues === null
  ) {
    return null;
  }

  const base = {
    id,
    shotNumber: value.shotNumber,
    duration: value.duration,
    ...(dialogue !== undefined ? { dialogue } : {}),
    ...(voiceOver !== undefined ? { voiceOver } : {}),
    ...(soundCue !== undefined ? { soundCue } : {}),
    ...(textCues !== undefined ? { textCues } : {}),
    ...(voiceCues !== undefined ? { voiceCues } : {}),
    label,
  };

  if (imagePath) {
    return {
      ...base,
      imagePath,
      ...(imageDataUrl !== undefined ? { imageDataUrl } : {}),
    };
  }

  if (imageDataUrl) {
    return {
      ...base,
      imageDataUrl,
    };
  }

  return null;
}

function parseStoryboardTextCues(value: unknown): readonly StoryboardTextCue[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const cues: StoryboardTextCue[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const cueId = requiredString(item.cueId);
    const text = requiredString(item.text);
    if (!cueId || !text || !isStoryboardTextCueKind(item.kind)) return null;
    const optional = parseStoryboardCueOptionalStrings(item, [
      'speakerName',
      'speakerCharacterId',
      'sourceRefId',
      'language',
      'emotion',
      'delivery',
    ]);
    if (!optional) return null;
    const speakerEntityRef = parseCharacterEntityRef(item.speakerEntityRef);
    if (speakerEntityRef === null) return null;
    const confidence = optionalConfidence(item.confidence);
    if (confidence === null) return null;
    cues.push({
      cueId,
      kind: item.kind,
      text,
      ...(optional.speakerName !== undefined ? { speakerName: optional.speakerName } : {}),
      ...(optional.speakerCharacterId !== undefined
        ? { speakerCharacterId: optional.speakerCharacterId }
        : {}),
      ...(speakerEntityRef ? { speakerEntityRef } : {}),
      ...(optional.sourceRefId !== undefined ? { sourceRefId: optional.sourceRefId } : {}),
      ...(optional.language !== undefined ? { language: optional.language } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      ...(optional.emotion !== undefined ? { emotion: optional.emotion } : {}),
      ...(optional.delivery !== undefined ? { delivery: optional.delivery } : {}),
    });
  }
  return cues;
}

function parseStoryboardVoiceCues(
  value: unknown,
): readonly StoryboardVoiceCue[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const cues: StoryboardVoiceCue[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const cueId = requiredString(item.cueId);
    const text = requiredString(item.text);
    if (!cueId || !text || (item.kind !== 'dialogue' && item.kind !== 'voiceOver')) return null;
    const optional = parseStoryboardCueOptionalStrings(item, [
      'speakerName',
      'speakerCharacterId',
      'emotion',
      'delivery',
      'voiceAssetId',
      'sourceRefId',
    ]);
    if (!optional) return null;
    const speakerEntityRef = parseCharacterEntityRef(item.speakerEntityRef);
    if (speakerEntityRef === null) return null;
    cues.push({
      cueId,
      kind: item.kind,
      text,
      ...(optional.speakerName !== undefined ? { speakerName: optional.speakerName } : {}),
      ...(optional.speakerCharacterId !== undefined
        ? { speakerCharacterId: optional.speakerCharacterId }
        : {}),
      ...(speakerEntityRef ? { speakerEntityRef } : {}),
      ...(optional.emotion !== undefined ? { emotion: optional.emotion } : {}),
      ...(optional.delivery !== undefined ? { delivery: optional.delivery } : {}),
      ...(optional.voiceAssetId !== undefined ? { voiceAssetId: optional.voiceAssetId } : {}),
      ...(optional.sourceRefId !== undefined ? { sourceRefId: optional.sourceRefId } : {}),
    });
  }
  return cues;
}

function parseStoryboardCueOptionalStrings(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, string | undefined> | null {
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    const parsed = optionalStringStrict(value[key]);
    if (parsed === null) return null;
    if (parsed !== undefined && parsed.trim().length > 0) {
      result[key] = parsed.trim();
    }
  }
  return result;
}

function parseCharacterEntityRef(
  value: unknown,
): StoryboardTextCue['speakerEntityRef'] | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const entityId = requiredString(value.entityId);
  if (!entityId || value.entityKind !== 'character') return null;
  return { entityId, entityKind: 'character' };
}

function isStoryboardTextCueKind(value: unknown): value is StoryboardTextCue['kind'] {
  return STORYBOARD_TEXT_CUE_KINDS.includes(value as StoryboardTextCue['kind']);
}

function optionalConfidence(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

function parseDragStartMessage(raw: Record<string, unknown>): DragStartWebviewMessage | null {
  if (!isRecord(raw.asset)) return null;
  const path = requiredString(raw.asset.path);
  const name = requiredString(raw.asset.name);
  if (!path || !name || !isDragMediaType(raw.asset.mediaType)) return null;
  return { type: 'dnd:start', asset: { path, mediaType: raw.asset.mediaType, name } };
}

function parseMermaidErrorMessage(raw: Record<string, unknown>): MermaidErrorWebviewMessage | null {
  const conversationId = requiredString(raw.conversationId);
  const feedbackMessage = requiredString(raw.feedbackMessage);
  if (
    !conversationId ||
    !feedbackMessage ||
    typeof raw.error !== 'string' ||
    typeof raw.code !== 'string'
  ) {
    return null;
  }
  return {
    type: 'mermaidError',
    error: raw.error,
    code: raw.code,
    feedbackMessage,
    conversationId,
  };
}

function parseDownloadSvgMessage(raw: Record<string, unknown>): DownloadSvgWebviewMessage | null {
  const filename = requiredString(raw.filename);
  if (!filename || typeof raw.svg !== 'string') return null;
  return { type: 'downloadSvg', svg: raw.svg, filename };
}

function parseInvokeSlashCommandMessage(
  raw: Record<string, unknown>,
): InvokeSlashCommandWebviewMessage | null {
  const command = requiredString(raw.command);
  const conversationId = requiredString(raw.conversationId);
  const args = optionalStringStrict(raw.args);
  if (!command || !conversationId || args === null) return null;
  return {
    type: 'invokeSlashCommand',
    command,
    conversationId,
    ...(args !== undefined ? { args } : {}),
  };
}

function parseInvokeSkillMessage(raw: Record<string, unknown>): InvokeSkillWebviewMessage | null {
  const skillName = requiredString(raw.skillName);
  const conversationId = requiredString(raw.conversationId);
  const args = optionalStringStrict(raw.args);
  if (!skillName || !conversationId || args === null) return null;
  return {
    type: 'invokeSkill',
    skillName,
    conversationId,
    ...(args !== undefined ? { args } : {}),
  };
}

function parseInvokePluginSlashCommandMessage(
  raw: Record<string, unknown>,
): InvokePluginSlashCommandWebviewMessage | null {
  const extensionId = requiredString(raw.extensionId);
  const commandId = requiredString(raw.commandId);
  const conversationId = requiredString(raw.conversationId);
  const args = optionalStringStrict(raw.args);
  if (!extensionId || !commandId || !conversationId || args === null) return null;
  return {
    type: 'invokePluginSlashCommand',
    extensionId,
    commandId,
    conversationId,
    ...(args !== undefined ? { args } : {}),
  };
}

function parseStartCharacterDialogueFromSlashMessage(
  raw: Record<string, unknown>,
): StartCharacterDialogueFromSlashWebviewMessage | null {
  const args = optionalStringStrict(raw.args);
  if (args === null) return null;
  return {
    type: 'startCharacterDialogueFromSlash',
    ...(args !== undefined ? { args } : {}),
  };
}

function parseExitCharacterDialogueSessionMessage(
  raw: Record<string, unknown>,
): ExitCharacterDialogueSessionWebviewMessage | null {
  const sessionId = requiredString(raw.sessionId);
  if (!sessionId) return null;
  return { type: 'exitCharacterDialogueSession', sessionId };
}

function parseExitEmbodyCharacterSessionMessage(
  raw: Record<string, unknown>,
): ExitEmbodyCharacterSessionWebviewMessage | null {
  const sessionId = requiredString(raw.sessionId);
  if (!sessionId) return null;
  return { type: 'exitEmbodyCharacterSession', sessionId };
}

export function buildPluginSlashCommandInvocation(
  message: InvokePluginSlashCommandWebviewMessage,
): PluginSlashCommandInvocation {
  return {
    extensionId: message.extensionId,
    commandId: message.commandId,
    conversationId: message.conversationId,
    ...(message.args !== undefined ? { args: message.args } : {}),
  };
}

export function buildCharacterDialogueSessionStartedMessage(input: {
  readonly tab: OpenTab;
  readonly session: CharacterDialogueSessionProjection;
}): CharacterDialogueSessionStartedMessage {
  return { type: 'characterDialogueSessionStarted', tab: input.tab, session: input.session };
}

export function buildCharacterDialogueSessionExitedMessage(input: {
  readonly sessionId: string;
  readonly artifact?: NpcTranscriptArtifact;
  readonly savedPath?: string;
}): CharacterDialogueSessionExitedMessage {
  return {
    type: 'characterDialogueSessionExited',
    sessionId: input.sessionId,
    ...(input.artifact ? { artifact: input.artifact } : {}),
    ...(input.savedPath ? { savedPath: input.savedPath } : {}),
  };
}

export function buildEmbodyCharacterSessionStartedMessage(input: {
  readonly tab: OpenTab;
  readonly session: EmbodyCharacterSessionProjection;
}): EmbodyCharacterSessionStartedMessage {
  return { type: 'embodyCharacterSessionStarted', tab: input.tab, session: input.session };
}

export function buildEmbodyCharacterSessionExitedMessage(input: {
  readonly sessionId: string;
  readonly artifact?: NpcTranscriptArtifact;
  readonly savedPath?: string;
}): EmbodyCharacterSessionExitedMessage {
  return {
    type: 'embodyCharacterSessionExited',
    sessionId: input.sessionId,
    ...(input.artifact ? { artifact: input.artifact } : {}),
    ...(input.savedPath ? { savedPath: input.savedPath } : {}),
  };
}

function parseSsoLoginMessage(raw: Record<string, unknown>): SsoLoginWebviewMessage | null {
  const force = raw.force;
  if (force === undefined) return { type: 'ssoLogin' };
  if (typeof force !== 'boolean') return null;
  return { type: 'ssoLogin', force };
}

function parseRevealContextSourceMessage(
  raw: Record<string, unknown>,
): RevealContextSourceWebviewMessage | null {
  if (!isAgentContextType(raw.contextType)) return null;
  if (typeof raw.contextId !== 'string') return null;
  const navigationData =
    raw.navigationData !== undefined && isRecord(raw.navigationData)
      ? (raw.navigationData as Record<string, string>)
      : undefined;
  return {
    type: 'revealContextSource',
    contextType: raw.contextType,
    contextId: raw.contextId,
    ...(navigationData ? { navigationData } : {}),
  };
}

function isAgentContextType(value: unknown): value is AgentContextType {
  return (
    value === 'canvas-node' ||
    value === 'cut-clip' ||
    value === 'story-selection' ||
    value === 'character' ||
    value === 'scene' ||
    value === 'asset' ||
    value === 'media' ||
    value === 'entity' ||
    value === 'sketch-layer' ||
    value === '3d-reference' ||
    value === 'audio-clip' ||
    value === 'file' ||
    value === 'image' ||
    value === 'document-selection' ||
    value === 'canvas-storyboard-action-intent'
  );
}

function parseAgentFlatPurposeModelRefs(value: unknown): AgentFlatPurposeModelRefs | null {
  if (!isRecord(value)) return null;

  const selections: {
    -readonly [Purpose in keyof AgentFlatPurposeModelRefMap]?: AgentFlatPurposeModelRefMap[Purpose];
  } = {};
  for (const purpose of Object.keys(value)) {
    const category = purposeModelCategory(purpose);
    if (!category) return null;
    const model = parseModelRef(value[purpose], category);
    if (!model) return null;
    if (purpose === 'image.generate') selections['image.generate'] = model as ModelRef<'image'>;
    if (purpose === 'image.edit') selections['image.edit'] = model as ModelRef<'image'>;
    if (purpose === 'image.understand') selections['image.understand'] = model as ModelRef<'llm'>;
    if (purpose === 'video.generate') selections['video.generate'] = model as ModelRef<'video'>;
    if (purpose === 'video.understand') selections['video.understand'] = model as ModelRef<'llm'>;
    if (purpose === 'audio.generate') selections['audio.generate'] = model as ModelRef<'audio'>;
    if (purpose === 'audio.tts') selections['audio.tts'] = model as ModelRef<'audio'>;
    if (purpose === 'audio.music.generate') {
      selections['audio.music.generate'] = model as ModelRef<'audio'>;
    }
    if (purpose === 'audio.understand') selections['audio.understand'] = model as ModelRef<'llm'>;
  }

  return Object.keys(selections).length > 0 ? selections : null;
}

function purposeModelCategory(value: string): ProtocolModelCategory | undefined {
  if (value === 'image.generate' || value === 'image.edit') return 'image';
  if (value === 'video.generate') return 'video';
  if (value === 'audio.generate' || value === 'audio.tts' || value === 'audio.music.generate') {
    return 'audio';
  }
  if (
    value === 'image.understand' ||
    value === 'video.understand' ||
    value === 'audio.understand'
  ) {
    return 'llm';
  }
  return undefined;
}

function parseAgentModelSlots(value: unknown): AgentModelSlots | null {
  if (!isRecord(value)) return null;

  const selections: AgentModelSlots = {};
  for (const key of Object.keys(value)) {
    if (!isAgentModelSlot(key)) return null;
    const model = parseModelRef(value[key], 'llm');
    if (!model) return null;
    selections[key] = model;
  }

  return Object.keys(selections).length > 0 ? selections : null;
}

function parseAgentLlmConfig(value: unknown): AgentLlmConfig | null {
  if (!isRecord(value)) return null;

  const reasoningPreset = optionalAgentReasoningPreset(value.reasoningPreset);
  if (value.reasoningPreset !== undefined && reasoningPreset === undefined) return null;

  const verbosityPreset = optionalAgentVerbosityPreset(value.verbosityPreset);
  if (value.verbosityPreset !== undefined && verbosityPreset === undefined) return null;

  const creativityPreset = optionalAgentCreativityPreset(value.creativityPreset);
  if (value.creativityPreset !== undefined && creativityPreset === undefined) return null;

  const advanced =
    value.advanced === undefined ? undefined : parseAgentLlmAdvancedParams(value.advanced);
  if (value.advanced !== undefined && !advanced) return null;

  const config: AgentLlmConfig = {
    ...(reasoningPreset ? { reasoningPreset } : {}),
    ...(verbosityPreset ? { verbosityPreset } : {}),
    ...(creativityPreset ? { creativityPreset } : {}),
    ...(advanced ? { advanced } : {}),
  };

  return Object.keys(config).length > 0 ? config : null;
}

function parseAgentLlmAdvancedParams(value: unknown): AgentLlmAdvancedParams | null {
  if (!isRecord(value)) return null;

  const temperature = optionalNumber(value.temperature);
  if (value.temperature !== undefined && temperature === undefined) return null;

  const topP = optionalNumber(value.topP);
  if (value.topP !== undefined && topP === undefined) return null;

  const maxOutputTokens = optionalPositiveInteger(value.maxOutputTokens);
  if (value.maxOutputTokens !== undefined && maxOutputTokens === undefined) return null;

  const reasoningEffort = optionalAgentReasoningEffort(value.reasoningEffort);
  if (value.reasoningEffort !== undefined && reasoningEffort === undefined) return null;

  const thinkingBudget = optionalNonNegativeInteger(value.thinkingBudget);
  if (value.thinkingBudget !== undefined && thinkingBudget === undefined) return null;

  const verbosity = optionalAgentTextVerbosity(value.verbosity);
  if (value.verbosity !== undefined && verbosity === undefined) return null;

  const serviceTier = optionalAgentServiceTier(value.serviceTier);
  if (value.serviceTier !== undefined && serviceTier === undefined) return null;

  const params: AgentLlmAdvancedParams = {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
    ...(verbosity ? { verbosity } : {}),
    ...(serviceTier ? { serviceTier } : {}),
  };

  return Object.keys(params).length > 0 ? params : null;
}

function parseModelRef<Category extends ProtocolModelCategory>(
  value: unknown,
  expectedCategory: Category | undefined,
): ModelRef<Category> | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.providerId) || !isNonEmptyString(value.modelId)) return null;
  if (!isModelCategory(value.category)) return null;
  if (expectedCategory && value.category !== expectedCategory) return null;

  return {
    providerId: value.providerId,
    modelId: value.modelId,
    category: value.category as Category,
    ...(isNonEmptyString(value.providerExpressionProfileId)
      ? { providerExpressionProfileId: value.providerExpressionProfileId }
      : {}),
  };
}

function parseMediaModelRef(value: unknown): ModelRef<MediaModelCategory> | null {
  const model = parseModelRef(value, undefined);
  if (!model || model.category === 'llm') return null;
  return model as ModelRef<MediaModelCategory>;
}

function parseOpenTabs(value: unknown): OpenTab[] | null {
  if (!Array.isArray(value)) return null;

  const tabs: OpenTab[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = requiredString(item.id);
    const title = typeof item.title === 'string' ? item.title : null;
    const conversationId = requiredString(item.conversationId);
    if (!id || title === null || !conversationId) return null;
    const kind =
      item.kind === 'character-dialogue'
        ? 'character-dialogue'
        : item.kind === 'embody-character'
          ? 'embody-character'
          : item.kind === 'chat'
            ? 'chat'
            : undefined;
    if (item.kind !== undefined && kind === undefined) return null;
    const characterDialogueSession = item.characterDialogueSession;
    const embodyCharacterSession = item.embodyCharacterSession;
    tabs.push({
      id,
      title,
      conversationId,
      ...(kind ? { kind } : {}),
      ...(kind === 'character-dialogue' &&
      isCharacterDialogueSessionProjection(characterDialogueSession)
        ? { characterDialogueSession }
        : {}),
      ...(kind === 'embody-character' && isEmbodyCharacterSessionProjection(embodyCharacterSession)
        ? { embodyCharacterSession }
        : {}),
    });
  }
  return tabs;
}

function parseOpenFileOptions(value: unknown): OpenFileWebviewMessage['options'] | null {
  if (!isRecord(value)) return null;
  const options: NonNullable<OpenFileWebviewMessage['options']> = {};
  if (value.preview !== undefined) {
    if (typeof value.preview !== 'boolean') return null;
    options.preview = value.preview;
  }
  if (value.line !== undefined) {
    if (!isFiniteNumber(value.line)) return null;
    options.line = value.line;
  }
  if (value.column !== undefined) {
    if (!isFiniteNumber(value.column)) return null;
    options.column = value.column;
  }
  return options;
}

function isConversationOnlyMessageType(
  value: string,
): value is ConversationOnlyWebviewMessage['type'] {
  return includesString(CONVERSATION_ONLY_MESSAGE_TYPES, value);
}

function isEmptyMessageType(value: string): value is EmptyWebviewMessage['type'] {
  return includesString(EMPTY_MESSAGE_TYPES, value);
}

function isTaskActionMessageType(value: string): value is TaskActionWebviewMessage['type'] {
  return includesString(TASK_ACTION_MESSAGE_TYPES, value);
}

function isQueuedMessageActionType(
  value: string,
): value is QueuedMessageActionWebviewMessage['type'] {
  return includesString(QUEUED_MESSAGE_ACTION_TYPES, value);
}

function isDragMediaType(value: unknown): value is DragStartWebviewMessage['asset']['mediaType'] {
  return typeof value === 'string' && includesString(DRAG_MEDIA_TYPES, value);
}

function isCharacterDialogueSessionProjection(
  value: unknown,
): value is CharacterDialogueSessionProjection {
  const record = isRecord(value) ? value : null;
  if (!record) return false;
  return (
    isNonEmptyString(record.sessionId) &&
    isNonEmptyString(record.entityId) &&
    isNonEmptyString(record.displayName) &&
    (record.mode === 'roleplay' || record.mode === 'consult') &&
    isRecord(record.profile) &&
    isNonEmptyString(record.summary) &&
    isNonEmptyString(record.startedAt) &&
    (record.projectRoot === undefined || isNonEmptyString(record.projectRoot)) &&
    (record.status === 'active' || record.status === 'exited')
  );
}

function isEmbodyCharacterSessionProjection(
  value: unknown,
): value is EmbodyCharacterSessionProjection {
  const record = isRecord(value) ? value : null;
  if (!record) return false;
  return (
    isNonEmptyString(record.sessionId) &&
    isNonEmptyString(record.entityId) &&
    isNonEmptyString(record.displayName) &&
    isRecord(record.profile) &&
    (record.source === undefined || isNonEmptyString(record.source)) &&
    (record.projectRoot === undefined || isNonEmptyString(record.projectRoot)) &&
    Array.isArray(record.scopeSummary) &&
    record.scopeSummary.every((item) => typeof item === 'string') &&
    (record.prompt === undefined || typeof record.prompt === 'string') &&
    isNonEmptyString(record.summary) &&
    isNonEmptyString(record.startedAt) &&
    (record.status === 'active' || record.status === 'exited')
  );
}

function isModelCategory(value: unknown): value is ProtocolModelCategory {
  return typeof value === 'string' && MODEL_CATEGORIES.includes(value as ProtocolModelCategory);
}

function isAgentModelSlot(value: string): value is AgentModelSlot {
  return includesString(AGENT_MODEL_SLOTS, value);
}

function optionalAgentReasoningPreset(value: unknown): AgentReasoningPreset | undefined {
  return typeof value === 'string' && includesString(AGENT_REASONING_PRESETS, value)
    ? value
    : undefined;
}

function optionalAgentVerbosityPreset(value: unknown): AgentVerbosityPreset | undefined {
  return typeof value === 'string' && includesString(AGENT_VERBOSITY_PRESETS, value)
    ? value
    : undefined;
}

function optionalAgentCreativityPreset(value: unknown): AgentCreativityPreset | undefined {
  return typeof value === 'string' && includesString(AGENT_CREATIVITY_PRESETS, value)
    ? value
    : undefined;
}

function optionalAgentReasoningEffort(value: unknown): AgentReasoningEffort | undefined {
  return typeof value === 'string' && includesString(AGENT_REASONING_EFFORTS, value)
    ? value
    : undefined;
}

function optionalAgentTextVerbosity(value: unknown): AgentTextVerbosity | undefined {
  return typeof value === 'string' && includesString(AGENT_TEXT_VERBOSITIES, value)
    ? value
    : undefined;
}

function optionalAgentServiceTier(value: unknown): AgentServiceTier | undefined {
  return typeof value === 'string' && includesString(AGENT_SERVICE_TIERS, value)
    ? value
    : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseProjectionAttachmentKey(value: unknown): ProjectionAttachmentKey | null {
  if (!isRecord(value)) return null;
  const endpointEpoch = requiredString(value.endpointEpoch);
  const attachmentId = requiredString(value.attachmentId);
  const tabId = requiredString(value.tabId);
  const conversationId = requiredString(value.conversationId);
  if (!endpointEpoch || !attachmentId || !tabId || !conversationId) return null;
  return { endpointEpoch, attachmentId, tabId, conversationId };
}

function isProjectionDetachReason(value: unknown): value is ProjectionDetachMessage['reason'] {
  return (
    value === 'tab-closed' ||
    value === 'endpoint-replaced' ||
    value === 'conversation-disposed' ||
    value === 'protocol-fatal'
  );
}

function requiredString(value: unknown): string | null {
  return isNonEmptyString(value) ? value : null;
}

function requireBuilderTabId(value: unknown, messageType: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${messageType} requires non-empty tabId`);
  }
  return value;
}

function requireBuilderConversationId(value: unknown, messageType: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${messageType} requires non-empty conversationId`);
  }
  return value;
}

function optionalStringStrict(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalSearchProjectFilesPurpose(
  value: unknown,
): 'roleplay' | 'entry' | undefined | null {
  if (value === undefined) return undefined;
  return value === 'roleplay' || value === 'entry' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function includesString<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}
