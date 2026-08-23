import { describe, expect, it, vi } from 'vitest';
import type { ConfigManager } from './settings/config-manager';
import type { ProviderCredentialAuthority } from './settings/provider-credential-authority';
import { DesktopAiModelSettingsService } from './ai-model-settings-service';

function createConfig() {
  const provider = {
    id: 'provider-a',
    name: 'provider-a',
    displayName: 'Provider A',
    type: 'generic' as const,
    apiUrl: 'https://example.test/v1',
    enabled: true,
    protocolProfile: 'openai-chat' as const,
  };
  const model = {
    id: 'chat-a',
    providerId: provider.id,
    name: 'chat-a-api',
    displayName: 'Chat A',
    type: 'llm' as const,
    capabilities: ['chat'],
    enabled: true,
  };
  return {
    provider,
    model,
    config: {
      getProviders: vi.fn(() => [provider]),
      getProvider: vi.fn((id: string) => (id === provider.id ? provider : undefined)),
      getModels: vi.fn(() => [model]),
      getDefaultModelRef: vi.fn((type: string) =>
        type === 'llm' ? { providerId: provider.id, modelId: model.id } : undefined,
      ),
      setProvider: vi.fn(async () => undefined),
      setModel: vi.fn(async () => undefined),
      setDefaultModelRef: vi.fn(async () => undefined),
    } as unknown as ConfigManager,
  };
}

describe('DesktopAiModelSettingsService', () => {
  it('projects credential status without exposing secret material', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => ({ type: 'api_key' as const, key: 'must-not-project' })),
    } as unknown as ProviderCredentialAuthority;
    const projection = await new DesktopAiModelSettingsService(config, credentials).project();

    expect(projection.providers).toEqual([
      expect.objectContaining({ id: 'provider-a', credentialStatus: 'configured' }),
    ]);
    expect(JSON.stringify(projection)).not.toContain('must-not-project');
  });

  it('writes providers and credentials through their canonical authorities', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const service = new DesktopAiModelSettingsService(config, credentials);

    const result = await service.execute({
      requestId: 'request-1',
      operation: 'save-provider',
      provider: {
        id: 'provider-a',
        displayName: 'Provider A',
        apiUrl: 'https://example.test/v1',
        protocol: 'openai-chat',
        enabled: true,
      },
      apiKey: 'secret-value',
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'provider-a', protocolProfile: 'openai-chat' }),
    );
    expect(credentials.replaceApiKey).toHaveBeenCalledWith('provider-a', 'secret-value');
    expect(result.restartRequired).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('preserves canonical Provider metadata when editing a DSH-compatible builtin', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, {
      type: 'newapi',
      protocolProfile: 'newapi',
      builtin: true,
      connectionKind: 'direct',
      supportLevel: 'builtin',
    });
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await new DesktopAiModelSettingsService(config, credentials).execute({
      requestId: 'request-existing-provider',
      operation: 'save-provider',
      provider: {
        id: provider.id,
        displayName: 'Provider A renamed',
        apiUrl: provider.apiUrl,
        protocol: 'openai-chat',
        enabled: true,
      },
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: provider.id,
        type: 'newapi',
        protocolProfile: 'newapi',
        builtin: true,
        supportLevel: 'builtin',
      }),
    );
  });

  it('delegates exact generation defaults without provider fallback', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const service = new DesktopAiModelSettingsService(config, credentials);

    await service.execute({
      requestId: 'request-2',
      operation: 'set-default',
      modelType: 'image',
      ref: { providerId: 'provider-a', modelId: 'image-a' },
    });

    expect(config.setDefaultModelRef).toHaveBeenCalledWith('image', {
      providerId: 'provider-a',
      modelId: 'image-a',
    });
  });
});
