import { describe, expect, it } from 'vitest';
import type {
  AccountAiCatalogSnapshot,
  AiProviderSourceResolution,
  SecretSafeProviderProjection,
} from '../agent-ai-source';

describe('agent AI source contracts', () => {
  it('keeps account catalog snapshots separate from webview-safe projections', () => {
    const snapshot: AccountAiCatalogSnapshot = {
      source: 'account-gateway',
      provider: {
        id: 'neko-account-gateway',
        name: 'neko-account-gateway',
        displayName: 'Neko Official',
        type: 'newapi',
        apiUrl: 'https://internal.neko.example/v1',
        enabled: true,
        connectionKind: 'gateway',
        protocolProfile: 'newapi',
        supportLevel: 'verified',
        requiresApiKey: false,
      },
      models: [
        {
          id: 'neko-chat',
          name: 'auto',
          providerId: 'neko-account-gateway',
          type: 'llm',
          capabilities: ['chat', 'streaming'],
          enabled: true,
        },
      ],
      entitlement: {
        plan: 'Pro',
        allowedModelIds: ['neko-chat'],
      },
      status: 'available',
      expiresAt: Date.now() + 60_000,
    };

    const projection: SecretSafeProviderProjection = {
      id: snapshot.provider.id,
      name: snapshot.provider.name,
      displayName: snapshot.provider.displayName,
      type: snapshot.provider.type,
      enabled: snapshot.provider.enabled,
      connectionKind: snapshot.provider.connectionKind,
      protocolProfile: snapshot.provider.protocolProfile,
      supportLevel: snapshot.provider.supportLevel,
      requiresApiKey: snapshot.provider.requiresApiKey,
      source: 'account-gateway',
    };

    expect(projection).toMatchObject({
      id: 'neko-account-gateway',
      source: 'account-gateway',
      requiresApiKey: false,
    });
    expect(Object.keys(projection)).not.toContain('apiKey');
    expect(Object.keys(projection)).not.toContain('apiUrl');
    expect(Object.keys(projection)).not.toContain('authorization');
    expect(Object.keys(projection)).not.toContain('refreshToken');
  });

  it('groups webview models by provider source and model type without credentials', () => {
    const resolution: AiProviderSourceResolution = {
      source: 'account-gateway',
      providers: [
        {
          id: 'neko-account-gateway',
          name: 'neko-account-gateway',
          displayName: 'Neko Official',
          type: 'newapi',
          enabled: true,
          connectionKind: 'gateway',
          protocolProfile: 'newapi',
          supportLevel: 'verified',
          requiresApiKey: false,
          source: 'account-gateway',
        },
      ],
      models: [
        {
          id: 'neko-chat',
          name: 'auto',
          providerId: 'neko-account-gateway',
          type: 'llm',
          capabilities: ['chat'],
          enabled: true,
          source: 'account-gateway',
        },
      ],
      selectedProviderId: 'neko-account-gateway',
      selectedModelId: 'neko-chat',
      modelGroups: [
        {
          source: 'account-gateway',
          providerId: 'neko-account-gateway',
          providerLabel: 'Neko Official',
          connectionKind: 'gateway',
          priority: 0,
          modelsByType: {
            llm: [
              {
                id: 'neko-account-gateway:neko-chat',
                label: 'Neko Official / Auto',
                providerId: 'neko-account-gateway',
                modelId: 'neko-chat',
                category: 'llm',
              },
            ],
          },
        },
      ],
    };

    expect(resolution.modelGroups[0]?.modelsByType.llm).toHaveLength(1);
    expect(JSON.stringify(resolution)).not.toContain('apiKey');
    expect(JSON.stringify(resolution)).not.toContain('refreshToken');
    expect(JSON.stringify(resolution)).not.toContain('Authorization');
  });
});
