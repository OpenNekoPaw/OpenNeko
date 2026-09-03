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

// =============================================================================
// Public Service
// =============================================================================

export { MediaGenerationService } from './media-generation-service';
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
  createNodeGenerationJobOwner,
  type NodeGenerationJobOwnerOptions,
} from './node-generation-job-owner';
export {
  GeneratedAssetIndex,
  generateAssetId,
  type AssetFilter,
  type GeneratedAssetCatalog,
} from './generated-asset-index';
// Factory
import type { MediaExecutionProviderResolver, MediaGenerationConfigPort } from './types';
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
  const routingManager = new MediaRoutingManager(deps.configManager, deps.providerResolver);

  const executor = new MediaGenerationExecutor(deps.configManager, deps.providerResolver, {
    requestAssetMaterializer: deps.requestAssetMaterializer,
  });

  const service = new MediaGenerationService(deps.configManager, routingManager, executor);

  return { service };
}
export * from './local-metadata/generated-output-projection-store';
