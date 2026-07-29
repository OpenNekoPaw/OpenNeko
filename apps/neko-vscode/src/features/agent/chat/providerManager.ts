/**
 * Provider Manager
 *
 * Manages AI provider configurations using the Platform API.
 * Provides a UI-friendly interface for provider management.
 */

import type {
  AssistantConfiguredProviderView,
  AssistantProviderSelection,
  AssistantProviderView,
  Model,
  Platform,
  Provider,
} from '@neko/platform';

/**
 * Provider Manager using Platform API
 */
export class ProviderManager {
  private readonly _platform: Platform;

  constructor(platform: Platform) {
    this._platform = platform;
  }

  /**
   * Get all available providers from config
   */
  getAllProviders(): AssistantProviderView[] {
    return this._platform.config.getAssistantProviderViews();
  }

  /**
   * Get configured providers with API keys
   */
  getConfiguredProviders(): AssistantConfiguredProviderView[] {
    return this._platform.config.getAssistantConfiguredProviderViews();
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): AssistantProviderSelection | undefined {
    return this._platform.config.getAssistantDefaultProvider();
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): AssistantProviderSelection | undefined {
    return this._platform.config.getAssistantProvider(providerId);
  }

  getProviderConfig(providerId: string): Provider | undefined {
    return this._platform.config.getProvider(providerId);
  }

  getModel(modelId: string): Model | undefined {
    return this._platform.config.getModel(modelId);
  }

  getProviderSource(_providerId: string): 'explicit-config' {
    return 'explicit-config';
  }
}
