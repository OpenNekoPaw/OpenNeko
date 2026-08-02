/**
 * NewAPI/OneAPI Custom Provider
 *
 * Handles API differences between NewAPI proxy services and standard OpenAI:
 * - Video endpoint: /v1/video/generations (not /v1/videos/generations)
 * - Response task ID: task_id (not id)
 * - Resolution: width/height (not resolution string)
 * - Image-to-video: image (not image_url)
 */

import type { ProviderConfig, ResolvedProvider } from '../../types';
import { NewAPIImageModel } from './newapi-image-model';
import { NewAPIChatImageModel } from './newapi-chat-image-model';
import { NewAPIVideoModel } from './newapi-video-model';
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
  return {
    type: 'newapi',
    source: 'native',
    image: (modelId: string) =>
      options?.imageMode === 'chat'
        ? new NewAPIChatImageModel(modelId, config)
        : new NewAPIImageModel(modelId, config),
    video: (modelId: string) => new NewAPIVideoModel(modelId, config),
    speech: (modelId: string) => new NewAPISpeechModel(modelId, config),
  };
}
