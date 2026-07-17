/**
 * Provider Resolution Factory
 *
 * Maps provider type + config to AI SDK provider instances.
 * Returns null for provider types that don't have AI SDK support.
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig, ResolvedProvider } from './types';
import { createNewAPIProvider } from './providers/newapi';

export interface ResolveProviderOptions {
  readonly imageMode?: 'standard' | 'chat';
}

/**
 * Resolve a provider type to an AI SDK provider instance.
 *
 * @returns ResolvedProvider if AI SDK supports this provider type, null otherwise.
 */
export function resolveProvider(
  providerType: string,
  config: ProviderConfig,
  options?: ResolveProviderOptions,
): ResolvedProvider | null {
  switch (providerType) {
    case 'openai': {
      const openai = createOpenAI({
        baseURL: normalizeBaseUrl(config.apiUrl),
        apiKey: config.apiKey,
      });
      return {
        type: 'openai',
        source: 'native',
        image: (modelId: string) => openai.image(modelId),
        // OpenAI provider does not support video model creation
        video: () => null,
        speech: (modelId: string) => openai.speech(modelId),
      };
    }

    case 'newapi':
      return createNewAPIProvider(config, options);

    case 'oneapi':
    case 'generic':
      return createCompatibleProvider(providerType, config, options);

    case 'xai':
    case 'kling':
      return createCompatibleProvider(providerType, config, options);

    default:
      break;
  }

  return null;
}

function createCompatibleProvider(
  providerType: string,
  config: ProviderConfig,
  options?: ResolveProviderOptions,
): ResolvedProvider {
  const provider = createNewAPIProvider(config, options);
  return {
    ...provider,
    type: providerType,
  };
}

/**
 * Normalize base URL: remove trailing slash and /v1 suffix
 * (AI SDK providers add their own path prefixes)
 */
function normalizeBaseUrl(url: string): string {
  let base = url.replace(/\/+$/, '');
  base = base.replace(/\/v1$/, '');
  return base;
}
