/**
 * Media Routing Manager
 *
 * Selects provider and model for media generation requests.
 * Explicit routing must be a complete provider/model reference. Default routing
 * only reads configured default model refs; it never infers a provider from a
 * partial request.
 */

import type { MediaModelType } from '@neko/shared';
import type { MediaGenerationType, MediaRoutingResult } from '../types';
import type { ConfigManager } from '../../config/config-manager';
import { isProviderConfigured } from '../../config/provider-configuration';

/**
 * Map generation type to media model type
 */
const GENERATION_TYPE_TO_MEDIA_TYPE: Record<MediaGenerationType, MediaModelType> = {
  'text-to-image': 'image',
  'image-to-image': 'image',
  'image-edit': 'image',
  'text-to-video': 'video',
  'image-to-video': 'video',
  'video-to-video': 'video',
  'video-edit': 'video',
  'text-to-audio': 'audio',
  'text-to-music': 'audio',
  workflow: 'image', // Default to image for workflow
};

/**
 * Media routing manager
 */
export class MediaRoutingManager {
  private configManager: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
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
    if (providerId || modelId) {
      if (!providerId || !modelId) {
        return null;
      }
    }

    // Short-circuit: if specific provider and model are given, use directly
    if (providerId && modelId) {
      const provider = this.configManager.getProvider(providerId);
      const model = this.configManager.getModel(modelId);
      if (provider && model && model.providerId === provider.id && isProviderConfigured(provider)) {
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
      const mediaType = GENERATION_TYPE_TO_MEDIA_TYPE[generationType];
      const defaultModel = this.configManager.getDefaultModelRef(mediaType);
      if (defaultModel) {
        const provider = this.configManager.getProvider(defaultModel.providerId);
        const model = this.configManager.getModel(defaultModel.modelId);
        if (
          provider &&
          model &&
          model.providerId === provider.id &&
          isProviderConfigured(provider)
        ) {
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
