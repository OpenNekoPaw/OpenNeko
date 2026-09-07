/**
 * AI SDK Provider Types
 *
 * Shared types for the AI SDK integration layer.
 */

import type {
  ImageModelV3,
  ImageModelV4,
  Experimental_VideoModelV3,
  Experimental_VideoModelV4,
  LanguageModelV3,
  LanguageModelV4,
  SpeechModelV3,
  SpeechModelV4,
} from '@ai-sdk/provider';

/**
 * Configuration for creating an AI SDK provider instance
 */
export interface ProviderConfig {
  /** API endpoint URL */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
}

/**
 * Resolved AI SDK provider with media model factories.
 * Returns null for unsupported model types.
 */
export type ResolvedProviderSource = 'ai-sdk';

export interface ResolvedProvider {
  /** Provider type identifier */
  type: string;
  /** Provider execution ownership classification */
  source: ResolvedProviderSource;
  /** Create an image model by model ID, or null if not supported */
  image(modelId: string): ImageModelV3 | ImageModelV4 | null;
  /** Create an OpenAI-compatible language model by model ID, or null if not supported. */
  language(modelId: string): LanguageModelV3 | LanguageModelV4 | null;
  /** Create a video model by model ID, or null if not supported */
  video(modelId: string): Experimental_VideoModelV3 | Experimental_VideoModelV4 | null;
  /** Create a speech model by model ID, or null if not supported */
  speech(modelId: string): SpeechModelV3 | SpeechModelV4 | null;
  /** Cancel the exact provider video task when the provider exposes that operation. */
  cancelVideoTask?(modelId: string, externalTaskId: string): Promise<void>;
}
