/**
 * Provider Resolution Factory
 *
 * Maps provider type + config to AI SDK provider instances.
 * Returns null for provider types that don't have AI SDK support.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createByteDance } from '@ai-sdk/bytedance';
import type { ProviderConfig, ResolvedProvider } from './types';
import { createNewAPIProvider } from './providers/newapi';
import { MiniMaxH3VideoModel } from './providers/minimax';

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
        source: 'ai-sdk',
        image: (modelId: string) => openai.image(modelId),
        language: (modelId: string) => openai(modelId),
        // OpenAI provider does not support video model creation
        video: () => null,
        speech: (modelId: string) => openai.speech(modelId),
      };
    }

    case 'newapi':
      return createNewAPIProvider(config, options);

    case 'bytedance': {
      const bytedance = createByteDance({
        baseURL: config.apiUrl.replace(/\/+$/u, ''),
        apiKey: config.apiKey,
      });
      const baseURL = config.apiUrl.replace(/\/+$/u, '');
      return {
        type: 'bytedance',
        source: 'ai-sdk',
        image: (modelId: string) => bytedance.image(modelId),
        language: () => null,
        video: (modelId: string) => bytedance.video(modelId),
        speech: () => null,
        cancelVideoTask: async (_modelId: string, externalTaskId: string) => {
          const response = await fetch(
            `${baseURL}/contents/generations/tasks/${encodeURIComponent(externalTaskId)}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${config.apiKey}` },
            },
          );
          if (!response.ok) {
            throw new Error(
              `ByteDance video task cancellation failed (${response.status}): ${await response.text()}`,
            );
          }
        },
      };
    }

    case 'minimax':
      return {
        type: 'minimax',
        source: 'ai-sdk',
        image: () => null,
        language: () => null,
        video: (modelId: string) => new MiniMaxH3VideoModel(modelId, config),
        speech: () => null,
        cancelVideoTask: async (modelId: string, externalTaskId: string) => {
          await new MiniMaxH3VideoModel(modelId, config).cancelTask(externalTaskId);
        },
      };

    case 'oneapi':
    case 'generic':
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
