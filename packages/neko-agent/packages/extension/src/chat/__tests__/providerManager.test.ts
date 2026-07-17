import { describe, expect, it } from 'vitest';
import { ProviderManager } from '../providerManager';
import type { AccountAiCatalogSnapshot } from '@neko/shared';
import type { AccountAiCatalogCache } from '../../services/accountAiCatalogCache';

function createAccountCatalog(): AccountAiCatalogSnapshot {
  return {
    source: 'account-gateway',
    status: 'available',
    provider: {
      id: 'neko-account-gateway',
      name: 'neko-account-gateway',
      displayName: 'Neko Official',
      type: 'newapi',
      apiUrl: '',
      enabled: true,
      connectionKind: 'gateway',
      protocolProfile: 'newapi',
      supportLevel: 'verified',
      requiresApiKey: false,
    },
    models: [
      {
        id: 'official-chat',
        name: 'gpt-4o-mini',
        providerId: 'neko-account-gateway',
        type: 'llm',
        capabilities: ['chat', 'vision'],
        enabled: true,
      },
      {
        id: 'official-denied',
        name: 'denied',
        providerId: 'neko-account-gateway',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      },
    ],
    entitlement: {
      allowedModelIds: ['official-chat'],
      disabledModelIds: ['official-denied'],
    },
    defaults: { chat: 'official-chat' },
    expiresAt: Date.now() + 60_000,
  };
}

describe('ProviderManager', () => {
  it('projects account gateway cache into a source-aware provider candidate', () => {
    const platform = {
      config: {
        getAssistantProviderViews: () => [],
        getAssistantConfiguredProviderViews: () => [],
        getAssistantDefaultProvider: () => undefined,
        getAssistantProvider: () => undefined,
      },
    };
    const cache = {
      getCachedSnapshot: () => createAccountCatalog(),
    } as Pick<AccountAiCatalogCache, 'getCachedSnapshot'>;

    const provider = new ProviderManager(
      platform as never,
      cache as AccountAiCatalogCache,
    ).getProvider('neko-account-gateway');

    expect(provider).toEqual({
      id: 'neko-account-gateway',
      isConfigured: true,
      defaultModel: 'official-chat',
      modelIds: ['official-chat'],
      source: 'account-gateway',
      accountCatalogAvailable: true,
      entitledModelIds: ['official-chat'],
      modelCapabilities: {
        'official-chat': ['chat', 'vision'],
        'official-denied': ['chat'],
      },
    });
  });

  it('exposes only entitled account models and identifies their credential source', () => {
    const platform = {
      config: {
        getModel: () => undefined,
      },
    };
    const cache = {
      getCachedSnapshot: () => createAccountCatalog(),
    } as Pick<AccountAiCatalogCache, 'getCachedSnapshot'>;
    const manager = new ProviderManager(platform as never, cache as AccountAiCatalogCache);

    expect(manager.getProviderSource('neko-account-gateway')).toBe('account-gateway');
    expect(manager.getProviderSource('explicit-provider')).toBe('explicit-config');
    expect(manager.getModel('official-chat')?.name).toBe('gpt-4o-mini');
    expect(manager.getModel('official-denied')).toBeUndefined();
  });
});
