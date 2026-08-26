/**
 * Media Routing Manager
 *
 * Selects provider and model for media generation requests.
 * Explicit routing must be a complete provider/model reference. Default routing
 * only reads configured default model refs; it never infers a provider from a
 * partial request.
 */

import type { MediaGenerationType } from '@neko/generation-domain';
import { assertMediaModelType, resolveMediaModelType } from '../media-generation-kind';
import type {
  MediaExecutionProviderResolver,
  MediaGenerationConfigPort,
  MediaProvider,
  MediaRoutingResult,
} from '../types';

/**
 * Media routing manager
 */
export class MediaRoutingManager {
  private readonly configManager: MediaGenerationConfigPort;
  private readonly providerResolver: MediaExecutionProviderResolver;

  constructor(
    configManager: MediaGenerationConfigPort,
    providerResolver: MediaExecutionProviderResolver,
  ) {
    this.configManager = configManager;
    this.providerResolver = providerResolver;
  }

  /**
   * Select best provider and model for the given generation type
   *
   * @param generationType - Type of media generation
   * @param providerId - Optional specific provider ID
   * @param modelId - Optional specific model ID
   */
  async selectProvider(
    generationType: MediaGenerationType,
    providerId?: string,
    modelId?: string,
  ): Promise<MediaRoutingResult | null> {
    const mediaType = resolveMediaModelType(generationType);
    if (providerId || modelId) {
      if (!providerId || !modelId) {
        return null;
      }
    }

    // Short-circuit: if specific provider and model are given, use directly
    if (providerId && modelId) {
      const provider = await this.providerResolver.resolveProvider(providerId);
      const model = this.configManager.getModel(modelId);
      if (
        provider &&
        provider.id === providerId &&
        model &&
        model.providerId === provider.id &&
        isExecutionProviderAvailable(provider)
      ) {
        assertMediaModelType(model, generationType);
        return {
          providerId,
          modelId,
          score: 100,
          reason: 'User specified provider and model',
        };
      }
    }

    // Try to use configured default media model for this type
    if (!modelId) {
      const defaultModel = this.configManager.getDefaultModelRef(mediaType);
      if (defaultModel) {
        const provider = await this.providerResolver.resolveProvider(defaultModel.providerId);
        const model = this.configManager.getModel(defaultModel.modelId);
        if (
          provider &&
          model &&
          model.providerId === provider.id &&
          provider.id === defaultModel.providerId &&
          isExecutionProviderAvailable(provider)
        ) {
          assertMediaModelType(model, generationType);
          return {
            providerId: provider.id,
            modelId: model.id,
            score: 90,
            reason: `Configured default ${mediaType} model`,
          };
        }
      }
    }

    // No default configured and no explicit model specified - return null
    return null;
  }

  // The default model binding is read through ConfigManager so provider identity
  // remains explicit in config instead of inferred from a global default provider.
}

function isExecutionProviderAvailable(provider: MediaProvider): boolean {
  if (typeof provider.apiUrl !== 'string' || provider.apiUrl.length === 0) return false;
  if (provider.requiresApiKey === false) return true;
  return typeof provider.apiKey === 'string' && provider.apiKey.length > 0;
}
