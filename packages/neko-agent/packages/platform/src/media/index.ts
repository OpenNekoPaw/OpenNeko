export * from './media-operation-capabilities';
/**
 * Media Module - AI media generation
 *
 * Public API: MediaGenerationService + types + createMediaPlatform factory.
 * Adapter classes, registries, routing, and executors are internal implementation details.
 */

// =============================================================================
// Public Types
// =============================================================================

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
  MediaTaskManagerDeps,
} from './types';

// =============================================================================
// Public Service
// =============================================================================

export { MediaGenerationService } from './media-generation-service';
export {
  adoptWorkspaceGeneratedOutputs,
  retainLegacyGeneratedOutput,
  type GeneratedOutputAdoptionDiagnostic,
  type GeneratedOutputAdoptionIndex,
  type GeneratedOutputAdoptionReport,
  type LegacyGeneratedOutputRetentionDiagnostic,
  type LegacyGeneratedOutputRetentionIndex,
  type LegacyGeneratedOutputRetentionResult,
} from './generated-output-adoption';
export {
  GeneratedOutputLifecycleService,
  type GeneratedOutputLifecycleIndex,
  type GeneratedOutputLifecycleResult,
  type GeneratedOutputReferenceInspector,
} from './generated-output-lifecycle';

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
} from './media-turn-dispatcher';
export {
  downloadMediaOutputs,
  detectMediaExtension,
  type DownloadMediaOptions,
} from './media-file-downloader';
export type { MediaRequestAssetMaterializer } from './media-request-assets';
export {
  buildGeneratedMediaAssets,
  computeAspectRatioLabel,
  inferGeneratedMediaMimeType,
  toStableGeneratedAssetUri,
  type BuildGeneratedMediaAssetsInput,
  type GeneratedMediaTaskType,
} from './media-generated-asset';
export {
  createMediaTaskView,
  createMediaTaskProgressView,
  getMediaTaskConversationId,
  matchesMediaTaskConversation,
  toMediaBackgroundTaskStatus,
  toMediaBackgroundTaskType,
  type MediaBackgroundTaskStatus,
  type MediaBackgroundTaskType,
  type MediaTaskOutputView,
  type MediaTaskProgressView,
  type MediaTaskProgressViewInput,
  type MediaTaskResultView,
  type MediaTaskView,
  type MediaTaskViewOptions,
} from './media-task-view';
export {
  finalizeCompletedMediaTaskOutputs,
  getMediaTaskPrimaryOutputUrl,
  type FinalizeCompletedMediaTaskOutputsInput,
  type FinalizedMediaTaskOutputs,
  type GeneratedAssetSink,
} from './media-task-result';
export {
  MEDIA_TASK_SAVE_NOTIFICATION_ACTION,
  buildMediaTaskProgressDeliveryPlan,
  isTerminalMediaTaskStatus,
  type BuildMediaTaskProgressDeliveryPlanInput,
  type MediaTaskProgressDeliveryPlan,
  type MediaTaskSaveNotificationPlan,
} from './media-task-progress-plan';
export {
  readMediaTaskResultDeliveryPolicy,
  toMediaTaskResultObservationTask,
  type MediaTaskResultObservationAssetData,
  type MediaTaskResultObservationAssetInput,
  type MediaTaskResultObservationProjectionInput,
} from './media-task-result-observation';
export {
  buildMediaTaskViewDelivery,
  buildMediaTaskProgressViewDelivery,
  type BuildMediaTaskProgressViewDeliveryInput,
  type MediaTaskProgressViewDelivery,
  type MediaTaskViewDelivery,
} from './media-task-progress-view';
export {
  DEFAULT_MEDIA_TASK_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION,
  MEDIA_TASK_DELIVERY_CONFIG_SECTION,
  MEDIA_TASK_OUTPUT_DIR_SETTING_KEY,
  MEDIA_TASK_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaTaskDeliverySettingsPlan,
  type MediaTaskDeliverySettingsInput,
  type MediaTaskDeliverySettingsPlan,
} from './media-task-delivery-settings';
export { GeneratedAssetIndex, generateAssetId, type AssetFilter } from './generated-asset-index';
export {
  createGeneratedAssetResourceResolver,
  type GeneratedAssetResourceResolver,
} from './generated-asset-resource-resolver';
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
} from './vision-preprocess-policy';
export {
  VisionPreprocessor,
  type VisionImageMetadataResult,
  type VisionImageProcessor,
  type VisionImageTransformInput,
  type VisionMediaProcessOptions,
  type VisionProcessedMedia,
  type VisionPreprocessorDeps,
  type VisionPreprocessorLogger,
  type VisionVideoProbeResult,
  type VisionVideoProcessor,
} from './vision-preprocessor';

// Factory
import { ConfigManager } from '../config/config-manager';
import { MediaAdapterRegistry, getMediaAdapterRegistry } from './adapters/media-adapter-registry';
import { OpenAICompatMediaAdapter } from './adapters/openai-compat-media-adapter';
import { RunwayMediaAdapter } from './adapters/runway-media-adapter';
import { LumaMediaAdapter } from './adapters/luma-media-adapter';
import { MiniMaxMediaAdapter } from './adapters/minimax-media-adapter';
import { LiblibMediaAdapter } from './adapters/liblib-media-adapter';
import { SunoMediaAdapter } from './adapters/suno-media-adapter';
import { ViduMediaAdapter } from './adapters/vidu-media-adapter';
import { MidjourneyMediaAdapter } from './adapters/midjourney-media-adapter';
import { FalMediaAdapter } from './adapters/fal-media-adapter';
import { DashScopeMediaAdapter } from './adapters/dashscope-media-adapter';
import { MediaRoutingManager } from './routing/media-routing-manager';
import { MediaTaskExecutor } from './media-task-executor';
import { MediaGenerationService } from './media-generation-service';
import type { MediaTaskManagerDeps } from './types';
import type { MediaRequestAssetMaterializer } from './media-request-assets';

/**
 * Media platform dependencies
 */
export interface MediaPlatformDeps {
  configManager: ConfigManager;
  taskManager: MediaTaskManagerDeps;
  requestAssetMaterializer?: MediaRequestAssetMaterializer;
}

/**
 * Media platform components
 */
export interface MediaPlatform {
  adapterRegistry: MediaAdapterRegistry;
  routingManager: MediaRoutingManager;
  taskExecutor: MediaTaskExecutor;
  service: MediaGenerationService;
  resumeFromRecovery(): Promise<number>;
}

/**
 * Create a complete media platform instance
 */
export function createMediaPlatform(deps: MediaPlatformDeps): MediaPlatform {
  // Get or create adapter registry
  const adapterRegistry = getMediaAdapterRegistry();

  // Register built-in adapters
  // OpenAI-compatible adapters (covers OpenAI, NekoAPI, and other compatible APIs)
  const openaiCompatAdapter = new OpenAICompatMediaAdapter();
  adapterRegistry.registerBuiltin('openai', openaiCompatAdapter);
  adapterRegistry.registerBuiltin('generic', openaiCompatAdapter); // For NekoAPI and other compatible APIs
  adapterRegistry.registerBuiltin('newapi', openaiCompatAdapter); // NewAPI is OpenAI-compatible
  adapterRegistry.registerBuiltin('xai', openaiCompatAdapter);
  adapterRegistry.registerBuiltin('kling', openaiCompatAdapter);

  // Specialized adapters
  adapterRegistry.registerBuiltin('runway', new RunwayMediaAdapter());
  adapterRegistry.registerBuiltin('luma', new LumaMediaAdapter());
  adapterRegistry.registerBuiltin('minimax', new MiniMaxMediaAdapter());
  adapterRegistry.registerBuiltin('liblib', new LiblibMediaAdapter());
  adapterRegistry.registerBuiltin('suno', new SunoMediaAdapter());
  adapterRegistry.registerBuiltin('vidu', new ViduMediaAdapter());
  adapterRegistry.registerBuiltin('midjourney', new MidjourneyMediaAdapter());
  adapterRegistry.registerBuiltin('fal', new FalMediaAdapter());
  adapterRegistry.registerBuiltin('dashscope', new DashScopeMediaAdapter());

  // Create routing manager
  const routingManager = new MediaRoutingManager(deps.configManager);

  // Create task executor
  const taskExecutor = new MediaTaskExecutor(deps.configManager, {
    requestAssetMaterializer: deps.requestAssetMaterializer,
  });

  // Register executor with task manager
  taskExecutor.registerWith(deps.taskManager);

  // Create service
  const service = new MediaGenerationService(
    deps.taskManager,
    deps.configManager,
    routingManager,
  );

  return {
    adapterRegistry,
    routingManager,
    taskExecutor,
    service,
    resumeFromRecovery: () => taskExecutor.resumeFromRecovery(deps.taskManager),
  };
}
