export * from './media-operation-capabilities';
/**
 * Media Module - AI media generation
 *
 * Public API: MediaGenerationService and Platform-owned delivery/runtime helpers.
 * Adapter classes, registries, routing, and executors are internal implementation details.
 */

// =============================================================================
// Public Types
// =============================================================================

export type {
  MediaGenerationConfigPort,
  MediaExecutionProviderResolver,
  MediaModel,
  MediaProvider,
  MediaRoutingResult,
} from './types';
export { resolveImageGenerationType, resolveVideoGenerationType } from './media-generation-kind';
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
} from './media-adapter-capabilities';

// =============================================================================
// Public Service
// =============================================================================

export { MediaGenerationService } from './media-generation-service';
export {
  GeneratedOutputLifecycleService,
  type GeneratedOutputLifecycleIndex,
  type GeneratedOutputLifecycleResult,
  type GeneratedOutputReferenceInspector,
} from './generated-output-lifecycle';

export {
  downloadMediaOutputs,
  detectMediaExtension,
  type DownloadMediaOptions,
} from './media-file-downloader';
export {
  createContentReadMediaRequestAssetMaterializer,
  type ContentReadMediaRequestAssetMaterializerOptions,
  type MediaRequestAssetMaterializer,
  type MediaRequestMaterializationOptions,
} from './media-request-assets';
export {
  buildGeneratedMediaAssets,
  computeAspectRatioLabel,
  inferGeneratedMediaMimeType,
  toStableGeneratedAssetUri,
  type BuildGeneratedMediaAssetsInput,
  type GeneratedMediaKind,
} from './media-generated-asset';
export {
  finalizeMediaGenerationOutputs,
  type FinalizedMediaGenerationOutputs,
  type FinalizeMediaGenerationOutputsInput,
  type GeneratedAssetSink,
} from './media-generation-output-finalizer';
export {
  DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION,
  MEDIA_GENERATION_DELIVERY_CONFIG_SECTION,
  MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
  MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaGenerationDeliverySettingsPlan,
  type MediaGenerationDeliverySettingsInput,
  type MediaGenerationDeliverySettingsPlan,
} from './media-generation-delivery-settings';
export {
  createNodeGenerationJobOwner,
  type NodeGenerationJobOwnerOptions,
} from './node-generation-job-owner';
export {
  GeneratedAssetIndex,
  generateAssetId,
  type AssetFilter,
  type GeneratedAssetCatalog,
} from './generated-asset-index';
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
import type { MediaExecutionProviderResolver, MediaGenerationConfigPort } from './types';
import { getMediaAdapterRegistry } from './adapters/media-adapter-registry';
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
import { MediaGenerationExecutor } from './media-generation-executor';
import { MediaGenerationService } from './media-generation-service';
import type { MediaRequestAssetMaterializer } from './media-request-assets';

/**
 * Media platform dependencies
 */
export interface MediaPlatformDeps {
  configManager: MediaGenerationConfigPort;
  providerResolver: MediaExecutionProviderResolver;
  requestAssetMaterializer?: MediaRequestAssetMaterializer;
}

/**
 * Media platform components
 */
export interface MediaPlatform {
  readonly service: MediaGenerationService;
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
  const routingManager = new MediaRoutingManager(deps.configManager, deps.providerResolver);

  const executor = new MediaGenerationExecutor(deps.configManager, deps.providerResolver, {
    requestAssetMaterializer: deps.requestAssetMaterializer,
  });

  const service = new MediaGenerationService(deps.configManager, routingManager, executor);

  return { service };
}
export * from './local-metadata/generated-output-projection-store';
