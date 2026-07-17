/**
 * Configuration Module - Public API
 */

export { ConfigManager, type ConfigManagerOptions, type MergedConfig } from './config-manager';
export {
  buildConfigUnavailableMessage,
  buildSafeConfigDiagnosticMessage,
  projectAssistantConfigDiagnostic,
  projectAssistantConfigReadResultDiagnostic,
  type AssistantConfigDiagnostic,
  type AssistantConfigDiagnosticCode,
} from './config-diagnostic';
export {
  FileUserConfigManager,
  type UserConfig,
  type IUserConfigManager,
  getUserConfigPath,
} from './user-config';
export {
  loadWorkspaceConfig,
  saveWorkspaceConfig,
  getWorkspaceConfigPath,
  type WorkspaceConfig,
} from './workspace-config';
export {
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config-export-service';
export {
  buildAssistantConfigState,
  buildAssistantConfiguredProviderViews,
  buildAssistantProviderViews,
  buildAssistantSettingsResetScalars,
  buildAssistantProviderMutationSettingsUpdate,
  buildAssistantRuntimeSettingsSnapshot,
  buildAssistantSettingsSnapshot,
  buildDefaultMediaModelOptionIds,
  MEDIA_UNDERSTANDING_PURPOSES,
  mapAssistantSettingsToUnifiedScalars,
  mapWebviewSettingsToUnifiedScalars,
  selectAssistantDefaultProvider,
  selectAssistantProvider,
  type AssistantConfigState,
  type AssistantConfiguredProviderView,
  type AssistantExecutionMode,
  type AssistantProviderModelView,
  type AssistantProviderMutation,
  type AssistantProviderSelection,
  type AssistantProviderView,
  type AssistantRuntimeSettingsSnapshot,
  type AssistantSettingsData,
  type AssistantSettingsSnapshot,
  type MediaUnderstandingCategory,
  type MediaUnderstandingModelSource,
  type MediaUnderstandingModelStatus,
  type MediaUnderstandingModelStatusValue,
  type MediaUnderstandingModels,
  type MediaUnderstandingPurpose,
} from './assistant-config';
export {
  projectAgentPresetIntent,
  projectLlmModelCapabilities,
  projectLlmParameterControls,
  projectLlmParameters,
  resolveLlmProviderFamily,
  type AgentPresetIntent,
  type LlmCapabilityProjectionInput,
  type LlmModelCapabilities,
  type LlmParameterDiagnostic,
  type LlmParameterDiagnosticCode,
  type LlmParameterControlAvailability,
  type LlmParameterProjection,
  type LlmParameterProjectionInput,
  type LlmProviderFamily,
} from './llm-parameter-projection';
export {
  refreshOllamaModels,
  type OllamaModelRefreshConfig,
  type OllamaModelRefreshLogger,
  type RefreshOllamaModelsInput,
  type RefreshOllamaModelsResult,
} from './ollama-model-refresh';
export {
  buildAssistantStatusBarPresentation,
  type AssistantStatusBarPresentation,
  type BuildAssistantStatusBarPresentationInput,
} from './assistant-status-bar';
export {
  resolveEffectiveAgentWorkspaceConfigSnapshot,
  type EffectiveAgentConfigSelectionSource,
  type EffectiveAgentConfigValueSource,
  type EffectiveAgentRuntimeOverrides,
  type EffectiveAgentWorkspaceConfigSnapshot,
  type ResolveEffectiveAgentWorkspaceConfigInput,
} from './effective-agent-config';
export {
  runAssistantProviderConfigMutationRuntime,
  runAssistantProviderConfigMutationNotificationRuntime,
  runAssistantProviderMutationRuntime,
  type AssistantProviderConfigInput,
  type AssistantProviderConfigMutationNotificationEffects,
  type AssistantProviderConfigMutationNotificationResult,
  type AssistantProviderMutationNotificationMessage,
  type AssistantProviderMutationConfigRuntime,
  type AssistantProviderMutationOperationResult,
  type AssistantProviderMutationRuntimeEffects,
  type AssistantProviderMutationRuntimeRequest,
  type AssistantProviderMutationRuntimeResult,
} from './assistant-provider-mutation-runtime';
export {
  buildAssistantSettingsRuntimeDataMessage,
  runAssistantSettingsUpdateRuntime,
  type AssistantSettingsRuntimeEffects,
} from './assistant-settings-runtime';
export {
  buildProviderCredentialImports,
  runProviderCredentialConfigFileChangeRuntime,
  runProviderCredentialConfigFileImportRuntime,
  type ProviderCredentialConfigFileChangeRuntimeEffects,
  type ProviderCredentialConfigFileChangeRuntimeResult,
  type ProviderCredentialConfigFileImportLogger,
  type ProviderCredentialConfigFileImportRuntime,
  type ProviderCredentialConfigFileImportRuntimeEffects,
  type ProviderCredentialConfigFileImportRuntimeInput,
  type ProviderCredentialConfigFileImportRuntimeResult,
  type ProviderCredentialImportApplyResult,
  type ProviderCredentialImportFailure,
  type ProviderCredentialImport,
} from './config-file-import';
export {
  MCP_CONFIGURATION_UNAVAILABLE_MESSAGE,
  buildMCPServerAddedMessage,
  buildMCPServerAddFailureMessage,
  buildMCPStdioServerPreset,
  parseMCPArgsInput,
  runAddMCPStdioServerRuntime,
  type AddMCPStdioServerInput,
  type AddMCPStdioServerResult,
  type BuildMCPStdioServerPresetInput,
  type MCPServerConfigWriter,
} from './mcp-server-config';
export { RETRY_TIMEOUT_PRESETS } from './retry-timeout-presets';
export {
  CUSTOM_NEWAPI_PROVIDER_ID,
  DEFAULT_USER_CONFIG,
  NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
  NEKO_GATEWAY_PROVIDER_ID,
  OLLAMA_LOCAL_PROVIDER_ID,
} from './default-config';
export { buildUserConfigTemplate } from './user-config-template';
