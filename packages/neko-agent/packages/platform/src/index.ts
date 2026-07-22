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
// Service Layer
// =============================================================================

export { PromptManager } from './service/prompt-manager';

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
export {
  observeMediaTaskProgress,
  runMediaTurn,
  submitMediaTurn,
  type MediaTurnCategory,
  type MediaTurnDeliveryEvent,
  type MediaTurnIgnoredTaskEvent,
  type MediaTurnModelRef,
  type MediaTurnProgressErrorEvent,
  type ObserveMediaTaskProgressInput,
  type RunMediaTurnInput,
  type RunMediaTurnResult,
  type SubmitMediaTurnInput,
} from './media/media-turn-dispatcher';
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
  createMediaTaskProgressView,
  createMediaTaskView,
  getMediaTaskConversationId,
  matchesMediaTaskConversation,
  type MediaTaskProgressView,
  type MediaTaskProgressViewInput,
  type MediaTaskResultView,
  type MediaTaskView,
  type MediaTaskViewOptions,
} from './media/media-task-view';
export { isTerminalMediaTaskStatus } from './media/media-task-progress-plan';
export {
  readMediaTaskResultDeliveryPolicy,
  toMediaTaskResultObservationTask,
  type MediaTaskResultObservationAssetData,
  type MediaTaskResultObservationAssetInput,
  type MediaTaskResultObservationProjectionInput,
} from './media/media-task-result-observation';
export {
  buildMediaTaskViewDelivery,
  buildMediaTaskProgressViewDelivery,
  type BuildMediaTaskProgressViewDeliveryInput,
  type MediaTaskProgressViewDelivery,
  type MediaTaskViewDelivery,
} from './media/media-task-progress-view';
export {
  DEFAULT_MEDIA_TASK_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION,
  MEDIA_TASK_DELIVERY_CONFIG_SECTION,
  MEDIA_TASK_OUTPUT_DIR_SETTING_KEY,
  MEDIA_TASK_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaTaskDeliverySettingsPlan,
  type MediaTaskDeliverySettingsInput,
  type MediaTaskDeliverySettingsPlan,
} from './media/media-task-delivery-settings';
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
export type {
  MediaGenerationType,
  MediaTaskStatus,
  MediaOutputType,
  MediaGenerationRequestBase,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaOutput,
  MediaAdapterResult,
  MediaAdapterError,
  MediaAdapter,
  MediaRoutingResult,
  MediaTask,
  MediaProgressCallback,
} from './media/types';

// =============================================================================
// Factory Functions
// =============================================================================

import { type IUserConfigManager } from './config/user-config';
import { ConfigManager, type ConfigManagerOptions } from './config/config-manager';
import type { ITaskManager, IToolRegistry, TaskRunScope } from '@neko/shared';
import { PromptManager } from './service/prompt-manager';
// Media Generation imports
import { MediaGenerationService } from './media/media-generation-service';
import { createMediaPlatform } from './media';
import { registerMediaAgentTools } from './media/media-agent-tools';
import type { MediaRequestAssetMaterializer } from './media/media-request-assets';
import { getLogger } from './utils/logger';

const logger = getLogger('Platform');

/**
 * Platform initialization options
 */
export interface PlatformOptions {
  /** User config manager (file-based) */
  userConfigManager?: IUserConfigManager;
  /** Workspace path for .neko/config.toml */
  workspacePath?: string;
  /**
   * Task manager instance for media generation
   * NOTE: TaskManager implementation is now in @neko/agent package.
   * Pass an instance from agent package for full functionality.
   */
  taskManager?: ITaskManager & {
    initialize?(): Promise<void>;
    resumePendingTasks?(): Promise<TaskRunScope[]>;
    dispose?(): void | Promise<void>;
    registerExecutor?(type: string, executor: unknown): void;
    saveRecoveryInfo?(
      scope: TaskRunScope,
      externalTaskId: string,
      providerId: string,
    ): Promise<void>;
    deleteRecoveryInfo?(scope: TaskRunScope): Promise<void>;
    getRecoveryStorage?(): import('@neko/shared').ITaskRecoveryStorage | undefined;
    updateOutputData?(scope: TaskRunScope, outputData: Record<string, unknown>): Promise<boolean>;
    upsertExternalTask?(task: import('@neko/shared').SerializableTask): Promise<void>;
    delete?(scope: TaskRunScope): Promise<boolean>;
  };
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
  /** Prompt manager */
  prompts: PromptManager;
  /** Media generation service (undefined when taskManager not provided) */
  media: MediaGenerationService | undefined;
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

  // Initialize prompt manager (extension registers prompts via platform.prompts.register())
  const promptManager = new PromptManager();

  // ==========================================================================
  // Initialize Media Generation Service (optional — requires taskManager)
  // ==========================================================================
  const mediaTaskManager = options.taskManager;
  let mediaGenerationService: MediaGenerationService | undefined;
  let resumeMediaRecovery: (() => Promise<number>) | undefined;

  if (mediaTaskManager) {
    // Initialize media platform with all components
    const mediaPlatform = createMediaPlatform({
      configManager,
      taskManager: mediaTaskManager,
      requestAssetMaterializer: options.requestAssetMaterializer,
    });

    mediaGenerationService = mediaPlatform.service;
    resumeMediaRecovery = mediaPlatform.resumeFromRecovery;

    // Register media generation tools so agents can call GenerateImage, GenerateVideo, etc.
    registerMediaAgentTools(toolRegistry, mediaGenerationService);

    startPlatformTaskManager(mediaTaskManager, resumeMediaRecovery);
  } else {
    logger.debug('taskManager not provided — media generation disabled');
    mediaGenerationService = undefined;
  }

  const dispose = (): void => {
    configManager.dispose();
  };

  return {
    config: configManager,
    tools: toolRegistry,
    prompts: promptManager,
    media: mediaGenerationService,
    dispose,
  };
}

function startPlatformTaskManager(
  taskManager: NonNullable<PlatformOptions['taskManager']>,
  resumeMediaRecovery?: () => Promise<number>,
): void {
  void (async () => {
    await taskManager.initialize?.();
    const recoveryResumed = await resumeMediaRecovery?.();
    if (recoveryResumed && recoveryResumed > 0) {
      logger.info(`Resumed ${recoveryResumed} external media task(s)`);
    }
    const resumed = await taskManager.resumePendingTasks?.();
    if (resumed && resumed.length > 0) {
      logger.info(`Resumed ${resumed.length} pending task(s)`);
    }
  })().catch((err) => {
    logger.error('Failed to initialize task manager', { error: err });
  });
}
