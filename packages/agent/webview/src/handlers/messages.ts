/**
 * Desktop host → Webview message contracts
 *
 * Shared protocol definitions live in @neko/agent-contracts. Handlers import
 * their package-owned message types through this barrel.
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
} from '@neko/agent-contracts';
