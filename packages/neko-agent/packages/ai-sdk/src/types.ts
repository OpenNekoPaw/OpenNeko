/**
 * AI SDK Provider Types
 *
 * Shared types for the AI SDK integration layer.
 */

import type { ImageModelV3, Experimental_VideoModelV3, SpeechModelV3 } from '@ai-sdk/provider';

/**
 * Configuration for creating an AI SDK provider instance
 */
export interface ProviderConfig {
  /** API endpoint URL */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Optional task callback for providers that expose external task IDs */
  onExternalTaskId?: (externalTaskId: string) => void | Promise<void>;
}

/**
 * Resolved AI SDK provider with media model factories.
 * Returns null for unsupported model types.
 */
export type ResolvedProviderSource = 'native';

export interface ResolvedProvider {
  /** Provider type identifier */
  type: string;
  /** Provider execution ownership classification */
  source: ResolvedProviderSource;
  /** Create an image model by model ID, or null if not supported */
  image(modelId: string): ImageModelV3 | null;
  /** Create a video model by model ID, or null if not supported */
  video(modelId: string): Experimental_VideoModelV3 | null;
  /** Create a speech model by model ID, or null if not supported */
  speech(modelId: string): SpeechModelV3 | null;
}
