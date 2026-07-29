import { describe, expect, it } from 'vitest';
import { ProviderManager } from '../providerManager';

describe('ProviderManager', () => {
  it('exposes only locally configured providers and models', () => {
    const provider = {
      id: 'local-openai',
      isConfigured: true,
      defaultModel: 'gpt-local',
      modelIds: ['gpt-local'],
    };
    const model = { id: 'gpt-local', name: 'gpt-local', providerId: 'local-openai' };
    const platform = {
      config: {
        getAssistantDefaultProvider: () => provider,
        getAssistantProvider: (providerId: string) =>
          providerId === provider.id ? provider : undefined,
        getModel: (modelId: string) => (modelId === model.id ? model : undefined),
      },
    };
    const manager = new ProviderManager(platform as never);

    expect(manager.getProvider('local-openai')).toEqual(provider);
    expect(manager.getModel('gpt-local')).toEqual(model);
    expect(manager.getProviderSource('local-openai')).toBe('explicit-config');
    expect(manager.getProvider('unconfigured-provider')).toBeUndefined();
  });
});
