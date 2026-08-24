import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConfigManager } from './settings/config-manager';
import { readConfigFileResult } from './settings/config-reader';
import type { ProviderCredentialAuthority } from './settings/provider-credential-authority';
import { FileUserConfigManager } from './settings/user-config';
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
      getModel: vi.fn((id: string) => (id === model.id ? model : undefined)),
      getModelsByProvider: vi.fn((id: string) => (id === provider.id ? [model] : [])),
      getDefaultModelRef: vi.fn((type: string) =>
        type === 'llm' ? { providerId: provider.id, modelId: model.id } : undefined,
      ),
      setProvider: vi.fn(async () => undefined),
      setModel: vi.fn(async () => undefined),
      removeProvider: vi.fn(async () => undefined),
      removeModel: vi.fn(async () => undefined),
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
      expect.objectContaining({
        id: 'provider-a',
        credentialStatus: 'configured',
        supportedModelFamilies: ['dialogue'],
      }),
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
        supportedModelFamilies: ['dialogue'],
        enabled: true,
      },
      apiKey: 'secret-value',
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'provider-a',
        protocolProfile: 'openai-chat',
        supportedModelFamilies: ['dialogue'],
      }),
    );
    expect(credentials.replaceApiKey).toHaveBeenCalledWith('provider-a', 'secret-value');
    expect(result.executionConfigurationChanged).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('preserves protocol metadata without projecting config-only preset metadata', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, {
      type: 'newapi',
      protocolProfile: 'newapi',
      builtin: true,
      connectionKind: 'direct',
      supportLevel: 'verified',
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
        supportedModelFamilies: ['dialogue'],
        enabled: true,
      },
    });

    const saved = vi.mocked(config.setProvider).mock.calls[0]?.[0];
    expect(saved).toEqual(
      expect.objectContaining({
        id: provider.id,
        type: 'newapi',
        protocolProfile: 'newapi',
        supportLevel: 'verified',
      }),
    );
    expect(saved).not.toHaveProperty('builtin');
  });

  it('does not treat config-only preset metadata as protocol authority', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { builtin: true });
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await new DesktopAiModelSettingsService(config, credentials).execute({
      requestId: 'request-config-provider-protocol',
      operation: 'save-provider',
      provider: {
        id: provider.id,
        displayName: provider.displayName,
        apiUrl: provider.apiUrl,
        protocol: 'ollama',
        supportedModelFamilies: ['dialogue'],
        enabled: true,
      },
    });

    const saved = vi.mocked(config.setProvider).mock.calls[0]?.[0];
    expect(saved).toEqual(
      expect.objectContaining({
        id: provider.id,
        type: 'ollama',
        protocolProfile: 'ollama',
        connectionKind: 'local',
      }),
    );
    expect(saved).not.toHaveProperty('builtin');
  });

  it('recomputes custom Provider metadata when switching to local Ollama', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, {
      requiresApiKey: true,
      useBearerAuth: true,
      supportsBeta: true,
      connectionKind: 'direct',
    });
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await new DesktopAiModelSettingsService(config, credentials).execute({
      requestId: 'request-custom-ollama',
      operation: 'save-provider',
      provider: {
        id: provider.id,
        displayName: 'Local Ollama',
        apiUrl: 'http://localhost:11434/api',
        protocol: 'ollama',
        supportedModelFamilies: ['dialogue'],
        enabled: true,
      },
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: provider.id,
        type: 'ollama',
        protocolProfile: 'ollama',
        connectionKind: 'local',
        requiresApiKey: false,
        supportsBeta: false,
        useBearerAuth: false,
      }),
    );
  });

  it('rejects credentials for local Ollama providers', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      new DesktopAiModelSettingsService(config, credentials).execute({
        requestId: 'request-ollama-key',
        operation: 'save-provider',
        provider: {
          id: 'local-ollama',
          displayName: 'Local Ollama',
          apiUrl: 'http://localhost:11434/api',
          protocol: 'ollama',
          supportedModelFamilies: ['dialogue'],
          enabled: true,
        },
        apiKey: 'must-not-store',
      }),
    ).rejects.toThrow(/does not accept an API key/u);

    expect(config.setProvider).not.toHaveBeenCalled();
    expect(credentials.replaceApiKey).not.toHaveBeenCalled();
  });

  it('delegates exact generation defaults without provider fallback', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const service = new DesktopAiModelSettingsService(config, credentials);

    const result = await service.execute({
      requestId: 'request-2',
      operation: 'set-default',
      modelType: 'image',
      ref: { providerId: 'provider-a', modelId: 'image-a' },
    });

    expect(config.setDefaultModelRef).toHaveBeenCalledWith('image', {
      providerId: 'provider-a',
      modelId: 'image-a',
    });
    expect(result.executionConfigurationChanged).toBe(true);
  });

  it('rejects models outside an explicitly configured Provider family', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { supportedModelFamilies: ['generation'] });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      new DesktopAiModelSettingsService(config, credentials).execute({
        requestId: 'request-family-mismatch',
        operation: 'save-model',
        model: {
          id: 'chat-mismatch',
          providerId: provider.id,
          apiName: 'chat-mismatch',
          displayName: 'Chat mismatch',
          type: 'llm',
          enabled: true,
        },
      }),
    ).rejects.toThrow(/does not support dialogue models/u);

    expect(config.setModel).not.toHaveBeenCalled();
  });

  it('projects local Ollama without requiring credentials and classifies its model as dialogue', async () => {
    const { config, provider, model } = createConfig();
    Object.assign(provider, {
      type: 'ollama',
      protocolProfile: 'ollama',
      connectionKind: 'local',
      requiresApiKey: false,
      builtin: true,
      apiUrl: 'http://localhost:11434/api',
    });
    Object.assign(model, { providerId: provider.id, type: 'llm' });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    const projection = await new DesktopAiModelSettingsService(config, credentials).project();

    expect(projection.providers).toEqual([
      expect.objectContaining({
        id: provider.id,
        protocol: 'ollama',
        connectionKind: 'local',
        supportedModelFamilies: ['dialogue'],
        credentialStatus: 'not-required',
      }),
    ]);
    expect(projection.models).toEqual([
      expect.objectContaining({ providerId: provider.id, type: 'llm' }),
    ]);
    expect(credentials.read).not.toHaveBeenCalled();
  });

  it('rejects deleting defaults and providers that still own models', async () => {
    const { config, model, provider } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const service = new DesktopAiModelSettingsService(config, credentials);

    await expect(
      service.execute({
        requestId: 'delete-default',
        operation: 'delete-model',
        modelId: model.id,
      }),
    ).rejects.toThrow(/default llm model/u);
    await expect(
      service.execute({
        requestId: 'delete-provider-with-models',
        operation: 'delete-provider',
        providerId: provider.id,
      }),
    ).rejects.toThrow(/still owns 1 configured model/u);
    expect(config.removeModel).not.toHaveBeenCalled();
    expect(config.removeProvider).not.toHaveBeenCalled();
  });

  it('deletes exact non-default models and empty config-backed providers without fallback', async () => {
    const { config, model, provider } = createConfig();
    Object.assign(provider, { builtin: true });
    config.getDefaultModelRef = vi.fn(() => undefined);
    config.getModelsByProvider = vi.fn(() => []);
    const credentials = {
      read: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const service = new DesktopAiModelSettingsService(config, credentials);

    await service.execute({
      requestId: 'delete-model',
      operation: 'delete-model',
      modelId: model.id,
    });
    await service.execute({
      requestId: 'delete-provider',
      operation: 'delete-provider',
      providerId: provider.id,
    });

    expect(config.removeModel).toHaveBeenCalledWith(model.id);
    expect(config.removeProvider).toHaveBeenCalledWith(provider.id);
    expect(credentials.delete).toHaveBeenCalledWith(provider.id);
  });

  it('persists Provider edits and deletion through the canonical config.toml owner', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'openneko-ai-model-settings-'));
    const filePath = path.join(root, 'config.toml');
    try {
      const userConfig = new FileUserConfigManager({ filePath });
      await userConfig.save({
        providers: [
          {
            id: 'config-provider',
            name: 'config-provider',
            displayName: 'Config Provider',
            type: 'generic',
            apiUrl: 'https://config.example/v1',
            enabled: true,
            protocolProfile: 'openai-chat',
            supportedModelFamilies: ['dialogue'],
            builtin: true,
          },
        ],
        models: [],
      });
      const config = new ConfigManager({ userConfigManager: userConfig });
      const credentials = {
        read: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      } as unknown as ProviderCredentialAuthority;
      const service = new DesktopAiModelSettingsService(config, credentials);

      await service.execute({
        requestId: 'persist-provider-edit',
        operation: 'save-provider',
        provider: {
          id: 'config-provider',
          displayName: 'Renamed Provider',
          apiUrl: 'https://config.example/v2',
          protocol: 'openai-chat',
          supportedModelFamilies: ['generation'],
          enabled: true,
        },
      });

      const updated = readConfigFileResult(filePath);
      expect(updated.status).toBe('ok');
      if (updated.status !== 'ok') {
        throw new Error(`Expected updated config, received ${updated.status}.`);
      }
      expect(updated.config.providers).toEqual([
        expect.objectContaining({
          id: 'config-provider',
          displayName: 'Renamed Provider',
          apiUrl: 'https://config.example/v2',
          supportedModelFamilies: ['generation'],
        }),
      ]);
      expect(updated.config.providers?.[0]).not.toHaveProperty('builtin');

      await service.execute({
        requestId: 'persist-provider-delete',
        operation: 'delete-provider',
        providerId: 'config-provider',
      });

      const deleted = readConfigFileResult(filePath);
      expect(deleted.status).toBe('ok');
      if (deleted.status !== 'ok') {
        throw new Error(`Expected deleted config, received ${deleted.status}.`);
      }
      expect(deleted.config.providers).toEqual([]);
      expect(credentials.delete).toHaveBeenCalledWith('config-provider');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('restores Provider configuration when credential cleanup fails', async () => {
    const { config, provider } = createConfig();
    config.getModelsByProvider = vi.fn(() => []);
    const credentials = {
      read: vi.fn(async () => undefined),
      delete: vi.fn(async () => {
        throw new Error('keychain unavailable');
      }),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      new DesktopAiModelSettingsService(config, credentials).execute({
        requestId: 'delete-provider-rollback',
        operation: 'delete-provider',
        providerId: provider.id,
      }),
    ).rejects.toThrow(/configuration was restored/u);

    expect(config.removeProvider).toHaveBeenCalledWith(provider.id);
    expect(config.setProvider).toHaveBeenCalledWith(provider);
  });
});
