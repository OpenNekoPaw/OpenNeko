/**
 * OpenNeko Platform - AI Service Platform
 *
 * A unified AI service layer providing:
 * - Multi-provider support (OpenAI, Anthropic, Google, DeepSeek)
 * - Configuration management with two-tier priority (User → Workspace)
 * - Model selection with provider/model configuration
 */

// =============================================================================
// Types - Re-export from types module
// =============================================================================

export * from './types';

// =============================================================================
// Configuration Layer
// =============================================================================

export {
  FileUserConfigManager,
  getUserConfigPath,
  type UserConfig,
  type IUserConfigManager,
} from './config/user-config';
export {
  CUSTOM_NEWAPI_PROVIDER_ID,
  DEFAULT_USER_CONFIG,
  GOOGLE_GEMINI_MEDIA_UNDERSTAND_MODEL_ID,
  GOOGLE_PROVIDER_ID,
  NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
  NEKO_GATEWAY_PROVIDER_ID,
  OLLAMA_LOCAL_PROVIDER_ID,
} from './config/default-config';
export { buildUserConfigTemplate } from './config/user-config-template';

export { type WorkspaceConfig } from './config/workspace-config';

export {
  ConfigManager,
  type MergedConfig,
  type ConfigManagerOptions,
} from './config/config-manager';
export {
  getModelPurposeCapabilityMatches,
  modelSupportsPurpose,
  type AgentModelPurpose,
} from './config/model-purpose-registry';
export {
  buildConfigUnavailableMessage,
  buildSafeConfigDiagnosticMessage,
  projectAssistantConfigDiagnostic,
  projectAssistantConfigReadResultDiagnostic,
  type AssistantConfigDiagnostic,
  type AssistantConfigDiagnosticCode,
} from './config/config-diagnostic';
export {
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config/config-export-service';
export {
  buildAssistantConfigState,
  buildAssistantConfiguredProviderViews,
  buildAssistantProviderMutationResultMessage,
  buildAssistantProviderViews,
  buildAssistantRuntimeSettingsSnapshot,
  buildAssistantSettingsDataMessage,
  buildAssistantSettingsResetScalars,
  buildAssistantSettingsUpdatedMessage,
  buildAssistantProviderMutationSettingsUpdate,
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
  type AssistantProviderMutationResultMessage,
  type AssistantProviderSelection,
  type AssistantProviderView,
  type AssistantRuntimeSettingsSnapshot,
  type AssistantSettingsData,
  type AssistantSettingsDataMessage,
  type AssistantSettingsSnapshot,
  type AssistantSettingsUpdatedMessage,
  type MediaUnderstandingCategory,
  type MediaUnderstandingModelSource,
  type MediaUnderstandingModelStatus,
  type MediaUnderstandingModelStatusValue,
  type MediaUnderstandingModels,
  type MediaUnderstandingPurpose,
} from './config/assistant-config';
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
} from './config/llm-parameter-projection';
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
} from './config/assistant-provider-mutation-runtime';
export {
  buildAssistantSettingsRuntimeDataMessage,
  runAssistantSettingsUpdateRuntime,
  type AssistantSettingsRuntimeEffects,
} from './config/assistant-settings-runtime';
export {
  refreshOllamaModels,
  type OllamaModelRefreshConfig,
  type OllamaModelRefreshLogger,
  type RefreshOllamaModelsInput,
  type RefreshOllamaModelsResult,
} from './config/ollama-model-refresh';
export {
  buildAssistantStatusBarPresentation,
  type AssistantStatusBarPresentation,
  type BuildAssistantStatusBarPresentationInput,
} from './config/assistant-status-bar';
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
} from './config/config-file-import';
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
} from './config/mcp-server-config';

// =============================================================================
// Provider Layer
// =============================================================================

export { PlatformError } from './provider/platform-error';
export { setRootLogger as setPlatformRootLogger } from './utils/logger';

// =============================================================================
// File Operation Layer
// =============================================================================

export {
  DEFAULT_NEKO_SETTINGS_TEMPLATE,
  buildConfigFilePath,
  buildSettingsFilePlan,
  buildSvgDownloadPlan,
  buildSvgDownloadSavedMessage,
  createOpenFilePlan,
  detectFileOpenViewer,
  stripFileProtocol,
  type EnsureFileOperationPlan,
  type EnsureFilePlan,
  type FileOpenViewer,
  type FileOperationFailurePlan,
  type FileOperationPlan,
  type FileOperationSuccessPlan,
  type NekoSettingsFileSource,
  type OpenFilePlan,
  type SaveDialogFilterPlan,
  type SvgDownloadPlan,
} from './files';

// =============================================================================
// Media Layer (service + types only; adapters are internal)
// =============================================================================

export { MediaGenerationService } from './media/media-generation-service';
export { registerMediaAgentTools } from './media/media-agent-tools';
export {
  DEFAULT_VISION_PREPROCESS_POLICY,
  VISION_IMAGE_OUTPUT_MEDIA_TYPE,
  calculateVisionVideoFrameSize,
  calculateVisionVideoSampleRange,
  getDefaultVisionVideoMaxFrames,
  getVisionMediaKindFromMime,
  getVisionMediaKindFromPath,
  isVisionImageMime,
  isVisionVideoMime,
  planVisionImagePreprocess,
  resolveVisionImageAttachmentMediaType,
  selectVisionVideoSampleTimestamps,
  uniformVisionVideoSample,
  type VisionImageMetadata,
  type VisionImagePreprocessPlan,
  type VisionMediaKind,
  type VisionPreprocessPolicy,
  type VisionVideoFrameSize,
  type VisionVideoSampleRange,
  type VisionVideoSegment,
} from './media/vision-preprocess-policy';
export {
  downloadMediaOutputs,
  detectMediaExtension,
  type DownloadMediaOptions,
} from './media/media-file-downloader';
export type { MediaRequestAssetMaterializer } from './media/media-request-assets';
export {
  finalizeMediaGenerationOutputs,
  type FinalizeMediaGenerationOutputsInput,
  type FinalizedMediaGenerationOutputs,
} from './media/media-generation-output-finalizer';
export {
  DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION,
  MEDIA_GENERATION_DELIVERY_CONFIG_SECTION,
  MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
  MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaGenerationDeliverySettingsPlan,
  type MediaGenerationDeliverySettingsInput,
  type MediaGenerationDeliverySettingsPlan,
} from './media/media-generation-delivery-settings';
export {
  GeneratedAssetIndex,
  generateAssetId,
  migrateLegacyGeneratedAssetIndex,
  type AssetFilter,
  type GeneratedAssetIndexMigrationReport,
  type GeneratedAssetIndexStore,
} from './media/generated-asset-index';
export {
  createGeneratedAssetResourceResolver,
  type GeneratedAssetResourceResolver,
} from './media/generated-asset-resource-resolver';
export type { MediaRoutingResult } from './media/types';
export {
  isMediaTaskCanceller,
  isMediaTaskDescriber,
  isMediaImageSubmitter,
  isMediaVideoSubmitter,
  isMediaAudioSubmitter,
  requireMediaTaskCanceller,
  requireMediaTaskDescriber,
  requireMediaImageSubmitter,
  requireMediaVideoSubmitter,
  requireMediaAudioSubmitter,
  MediaAdapterCapabilityError,
  type MediaAdapterCapabilityErrorCode,
} from './media/media-adapter-capabilities';
// =============================================================================
// Factory Functions
// =============================================================================

import { type IUserConfigManager } from './config/user-config';
import { ConfigManager, type ConfigManagerOptions } from './config/config-manager';
import type { IToolRegistry } from '@neko/shared';
// Media Generation imports
import { MediaGenerationService } from './media/media-generation-service';
import { createMediaPlatform } from './media';
import type { MediaRequestAssetMaterializer } from './media/media-request-assets';

/**
 * Platform initialization options
 */
export interface PlatformOptions {
  /** User config manager (file-based) */
  userConfigManager?: IUserConfigManager;
  /** Workspace path for .neko/config.toml */
  workspacePath?: string;
  /**
   * Tool registry instance (from @neko/agent).
   * Platform no longer creates its own ToolRegistry.
   */
  toolRegistry: IToolRegistry;
  /**
   * Host-owned content access adapter for media request assets.
   * Platform must not read local binary files directly.
   */
  requestAssetMaterializer?: MediaRequestAssetMaterializer;
}

/**
 * Platform instance with all components
 */
export interface Platform {
  /** Configuration manager */
  config: ConfigManager;
  /** Tool registry */
  tools: IToolRegistry;
  /** Linked media generation service. */
  media: MediaGenerationService;
  /** Dispose resources */
  dispose: () => void;
}

/**
 * Create a fully configured platform instance
 */
export function createPlatform(options: PlatformOptions): Platform {
  // Initialize configuration manager
  const configOptions: ConfigManagerOptions = {
    userConfigManager: options.userConfigManager,
    workspacePath: options.workspacePath,
  };
  const configManager = new ConfigManager(configOptions);

  // Use injected tool registry (from @neko/agent)
  const toolRegistry = options.toolRegistry;

  const mediaPlatform = createMediaPlatform({
    configManager,
    requestAssetMaterializer: options.requestAssetMaterializer,
  });
  const mediaGenerationService = mediaPlatform.service;

  const dispose = (): void => {
    configManager.dispose();
  };

  return {
    config: configManager,
    tools: toolRegistry,
    media: mediaGenerationService,
    dispose,
  };
}
