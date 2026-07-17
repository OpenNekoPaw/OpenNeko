/**
 * @neko/ai-sdk - AI SDK Integration Layer
 *
 * Provides native AI SDK provider resolution and NewAPI media models.
 * Provider-owned MediaAdapters remain a separate Platform media boundary.
 */

export { resolveProvider } from './resolve';
export type { ResolveProviderOptions } from './resolve';
export type { ProviderConfig, ResolvedProvider, ResolvedProviderSource } from './types';
export { createNewAPIProvider } from './providers/newapi';
export {
  projectMultimodalPacketToChatMessageAsync,
  projectMultimodalPacketToChatMessage,
  projectPerceptionCardToContentParts,
  resolveProviderInputModalities,
  type AsyncMultimodalMessageProjectionOptions,
  type AsyncMultimodalMessageProjectionResult,
  type PerceptionAssetLoader,
  type ProjectionDiagnostic,
  type ProviderInputModalities,
  type ProviderInputModalityResolverInput,
  type MultimodalMessageProjectionOptions,
  type ProviderReadyAssetPayload,
  type VisionPreprocessPolicy,
} from './multimodal-message-projection';
