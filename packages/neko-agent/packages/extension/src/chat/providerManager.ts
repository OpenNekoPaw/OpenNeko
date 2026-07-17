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
import type { AccountAiCatalogSnapshot } from '@neko/shared';
import type { AccountAiCatalogCache } from '../services/accountAiCatalogCache';

/**
 * Provider Manager using Platform API
 */
export class ProviderManager {
  private readonly _platform: Platform;

  constructor(
    platform: Platform,
    private readonly accountAiCatalog?: AccountAiCatalogCache,
  ) {
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
    const accountProvider = this.getAccountProvider(providerId);
    if (accountProvider) return accountProvider;
    return this._platform.config.getAssistantProvider(providerId);
  }

  getProviderConfig(providerId: string): Provider | undefined {
    const accountProvider = this.getAccountProviderConfig(providerId);
    if (accountProvider) return accountProvider;
    return this._platform.config.getProvider(providerId);
  }

  getModel(modelId: string): Model | undefined {
    const accountModel = this.getAccountModel(modelId);
    if (accountModel) return accountModel;
    return this._platform.config.getModel(modelId);
  }

  getProviderSource(providerId: string): 'explicit-config' | 'account-gateway' {
    const snapshot = this.accountAiCatalog?.getCachedSnapshot();
    return snapshot?.provider.id === providerId ? 'account-gateway' : 'explicit-config';
  }

  private getAccountProvider(providerId: string): AssistantProviderSelection | undefined {
    const snapshot = this.accountAiCatalog?.getCachedSnapshot();
    if (!snapshot || snapshot.provider.id !== providerId) return undefined;
    return buildAccountProviderSelection(snapshot);
  }

  private getAccountProviderConfig(providerId: string): Provider | undefined {
    const snapshot = this.accountAiCatalog?.getCachedSnapshot();
    if (!snapshot || snapshot.provider.id !== providerId) return undefined;
    return snapshot.provider as Provider;
  }

  private getAccountModel(modelId: string): Model | undefined {
    const snapshot = this.accountAiCatalog?.getCachedSnapshot();
    if (!snapshot || snapshot.status !== 'available') return undefined;
    const allowed = new Set(snapshot.entitlement.allowedModelIds);
    const disabled = new Set(snapshot.entitlement.disabledModelIds ?? []);
    if (!allowed.has(modelId) || disabled.has(modelId)) return undefined;
    const model = snapshot.models.find((candidate) => candidate.id === modelId);
    return model?.enabled === false ? undefined : (model as Model | undefined);
  }
}

function buildAccountProviderSelection(
  snapshot: AccountAiCatalogSnapshot,
): AssistantProviderSelection {
  const allowed = new Set(snapshot.entitlement.allowedModelIds);
  const disabled = new Set(snapshot.entitlement.disabledModelIds ?? []);
  const modelIds = snapshot.models
    .filter((model) => model.enabled !== false)
    .filter((model) => allowed.has(model.id) && !disabled.has(model.id))
    .map((model) => model.id);
  return {
    id: snapshot.provider.id,
    isConfigured: snapshot.status === 'available' && modelIds.length > 0,
    defaultModel: snapshot.defaults?.chat ?? modelIds[0] ?? '',
    modelIds,
    source: 'account-gateway',
    accountCatalogAvailable: snapshot.status === 'available',
    entitledModelIds: [...allowed],
    modelCapabilities: Object.fromEntries(
      snapshot.models.map((model) => [model.id, [...model.capabilities]]),
    ),
  };
}
