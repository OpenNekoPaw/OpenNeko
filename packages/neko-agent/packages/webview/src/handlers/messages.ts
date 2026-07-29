/**
 * Extension → Webview Message Contracts
 *
 * Shared protocol definitions live in @neko-agent/types. This module remains
 * as a local compatibility barrel for existing handler imports.
 */

export type {
  ActiveConversationMessage,
  AgentPhaseMessage,
  AgentSessionDiagnosticMessage,
  AgentCapabilityLifecycleResultMessage,
  AgentCapabilityActivationProgressMessage,
  AgentStateSnapshotMessage,
  AmbientCanvasUpdateMessage,
  CompressionErrorMessage,
  CompressionResultMessage,
  ConfigChangedMessage,
  ConfigStateMessage,
  ContextTokenCountMessage,
  ConversationListMessage,
  ConversationSnapshotMessage,
  ErrorMessage,
  AgentHostToWebviewMessage,
  ExternalMessage,
  GlobalErrorMessage,
  HistoryClearedMessage,
  InjectContextMessage,
  MessageQueueErrorMessage,
  MessageQueueSnapshotMessage,
  MessageQueuedMessage,
  MessageOfType,
  QueuedMessageEditRequestedMessage,
  CharacterDialogueSessionExitedMessage,
  CharacterDialogueSessionStartedMessage,
  EmbodyCharacterSessionExitedMessage,
  EmbodyCharacterSessionStartedMessage,
  PluginCommandsMessage,
  PluginsAvailableMessage,
  PrefillInputMessage,
  ProviderMutationResultMessage,
  ProjectFilesMessage,
  SettingsDataMessage,
  SettingsUpdatedMessage,
  SkillsListMessage,
  SlashCommandResultMessage,
  SubAgentEventMessage,
  TabStateMessage,
} from '@neko-agent/types';
