/**
 * NewAPI/OneAPI Custom Provider
 *
 * Handles verified image and speech API differences between NewAPI proxy
 * services and the standard OpenAI provider.
 */

import type { ProviderConfig, ResolvedProvider } from '../../types';
import { createOpenAI } from '@ai-sdk/openai';
import { NewAPIImageModel } from './newapi-image-model';
import { NewAPIChatImageModel } from './newapi-chat-image-model';
import { NewAPISpeechModel } from './newapi-speech-model';

/**
 * Create a NewAPI/OneAPI provider instance
 *
 * @param options.imageMode - 'chat' for multimodal LLMs (Gemini, GPT-image)
 *   that generate images via /v1/chat/completions with modalities: ['text', 'image'].
 *   Default 'standard' uses /v1/images/generations.
 */
export function createNewAPIProvider(
  config: ProviderConfig,
  options?: { imageMode?: 'standard' | 'chat' },
): ResolvedProvider {
  const languageProvider = createOpenAI({
    baseURL: normalizeLanguageBaseUrl(config.apiUrl),
    apiKey: config.apiKey,
  });
  return {
    type: 'newapi',
    source: 'ai-sdk',
    image: (modelId: string) =>
      options?.imageMode === 'chat'
        ? new NewAPIChatImageModel(modelId, config)
        : new NewAPIImageModel(modelId, config),
    language: (modelId: string) => languageProvider(modelId),
    video: () => null,
    speech: (modelId: string) => new NewAPISpeechModel(modelId, config),
  };
}

function normalizeLanguageBaseUrl(value: string): string {
  const base = value.replace(/\/+$/u, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}
