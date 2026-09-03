import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ConfigManager } from './settings/config-manager';
import { readConfigFileResult } from './settings/config-reader';
import type { ProviderCredentialAuthority } from './settings/provider-credential-authority';
import { FileUserConfigManager } from './settings/user-config';
import {
  DesktopAiModelSettingsService,
  type DesktopAiDialogueCapabilityReader,
  type DesktopAiGenerationCapabilityReader,
} from './ai-model-settings-service';
import type { DesktopAiGenerationProviderCapability } from './ai-model-settings-contract';

const dialogueCapabilities: DesktopAiDialogueCapabilityReader = {
  read: vi.fn(async () => ({
    status: 'available' as const,
    providers: [
      {
        providerId: 'provider-a',
        displayName: 'Provider A',
        source: 'catalog' as const,
        settingsNamespace: 'llm-pi-ai',
        settingsPath: ['providers', 'provider-a'],
        providerType: 'generic' as const,
        defaultApiUrl: '',
        connectionKind: 'direct' as const,
        requiresApiKey: true,
      },
    ],
    protocols: [
      'openai-completions',
      'openai-responses',
      'anthropic-messages',
      'openai-chat',
      'anthropic',
      'ollama',
    ],
    diagnostics: [],
  })),
};

const generationCapabilityValues = [
  {
    id: 'generation-minimax-h3',
    displayName: 'MiniMax H3',
    suggestedProviderId: 'minimax-media',
    providerType: 'minimax',
    defaultApiUrl: 'https://api.minimaxi.com/v2',
    requiresApiUrl: true,
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    allowCustomModels: false,
    supportedModelTypes: ['video'],
    modelTemplates: [
      {
        id: 'minimax-h3',
        providerType: 'minimax',
        apiName: 'MiniMax-H3',
        displayName: 'MiniMax H3',
        type: 'video',
        capabilities: ['text_to_video', 'video.generate', 'image_to_video', 'video_to_video'],
      },
    ],
  },
  {
    id: 'generation-bytedance-seedance',
    displayName: 'ByteDance Ark / Seedance',
    suggestedProviderId: 'bytedance-media',
    providerType: 'bytedance',
    defaultApiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    requiresApiUrl: true,
    connectionKind: 'direct',
    supportLevel: 'verified',
    requiresApiKey: true,
    allowCustomModels: false,
    supportedModelTypes: ['image', 'video'],
    modelTemplates: [
      {
        id: 'bytedance-seedance-2',
        providerType: 'bytedance',
        apiName: 'doubao-seedance-2-0-260128',
        displayName: 'Seedance 2.0',
        type: 'video',
        capabilities: ['text_to_video', 'video.generate', 'image_to_video'],
      },
    ],
  },
  {
    id: 'generation-newapi',
    displayName: 'NewAPI Media',
    suggestedProviderId: 'newapi-media',
    providerType: 'newapi',
    defaultApiUrl: '',
    requiresApiUrl: true,
    connectionKind: 'gateway',
    supportLevel: 'custom',
    requiresApiKey: true,
    allowCustomModels: true,
    supportedModelTypes: ['image', 'video', 'audio', 'music'],
    modelTemplates: [],
  },
] as const satisfies readonly DesktopAiGenerationProviderCapability[];

const generationCapabilities: DesktopAiGenerationCapabilityReader = {
  read: () => generationCapabilityValues,
};

function createService(
  config: ConfigManager,
  credentials: ProviderCredentialAuthority,
  capabilities: DesktopAiDialogueCapabilityReader = dialogueCapabilities,
) {
  return new DesktopAiModelSettingsService(
    config,
    credentials,
    capabilities,
    generationCapabilities,
  );
}

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
      getAssistantSettingsSnapshot: vi.fn(() => ({
        selectedProviderId: provider.id,
        selectedModelId: model.id,
      })),
      clearAssistantModelSelection: vi.fn(async () => undefined),
    } as unknown as ConfigManager,
  };
}

describe('DesktopAiModelSettingsService', () => {
  it('projects credential status without exposing secret material', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => ({ type: 'api_key' as const, key: 'must-not-project' })),
    } as unknown as ProviderCredentialAuthority;
    const projection = await createService(config, credentials).project();

    expect(projection.providers).toEqual([
      expect.objectContaining({
        id: 'provider-a',
        credentialStatus: 'configured',
        supportedModelFamilies: ['dialogue'],
      }),
    ]);
    expect(JSON.stringify(projection)).not.toContain('must-not-project');
  });

  it('projects and persists a configured protocol through the canonical DSH protocol', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const capabilities: DesktopAiDialogueCapabilityReader = {
      read: vi.fn(async () => ({
        status: 'available' as const,
        providers: [],
        protocols: ['openai-completions'],
        diagnostics: [],
      })),
    };

    const projection = await createService(config, credentials, capabilities).project();

    expect(projection.providers).toEqual([
      expect.objectContaining({
        id: 'provider-a',
        protocol: 'openai-completions',
      }),
    ]);

    const projected = projection.providers[0];
    if (!projected?.protocol) throw new Error('Projected DSH protocol is missing.');
    await createService(config, credentials, capabilities).execute({
      requestId: 'persist-canonical-dsh-protocol',
      operation: 'save-provider',
      provider: {
        id: projected.id,
        displayName: projected.displayName,
        type: projected.type,
        apiUrl: projected.apiUrl,
        connectionKind: projected.connectionKind,
        protocol: projected.protocol,
        supportedModelFamilies: projected.supportedModelFamilies,
        requiresApiKey: true,
        enabled: projected.enabled,
      },
    });
    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({ protocolProfile: 'openai-completions' }),
    );
  });

  it('writes providers and credentials through their canonical authorities', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const service = createService(config, credentials);

    const result = await service.execute({
      requestId: 'request-1',
      operation: 'save-provider',
      provider: {
        id: 'provider-a',
        displayName: 'Provider A',
        type: 'generic',
        apiUrl: 'https://example.test/v1',
        connectionKind: 'direct',
        protocol: 'openai-chat',
        supportedModelFamilies: ['dialogue'],
        requiresApiKey: true,
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

  it('creates an explicit local keyless custom DSH Provider without touching credentials', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const capabilities: DesktopAiDialogueCapabilityReader = {
      read: vi.fn(async () => ({
        status: 'available' as const,
        providers: [],
        protocols: ['openai-completions'],
        diagnostics: [],
      })),
    };

    await createService(config, credentials, capabilities).execute({
      requestId: 'request-local-keyless',
      operation: 'save-provider',
      provider: {
        id: 'local-oneapi',
        displayName: 'Local OneAPI',
        type: 'oneapi',
        apiUrl: 'http://127.0.0.1:8000/v1',
        connectionKind: 'local',
        protocol: 'openai-completions',
        supportedModelFamilies: ['dialogue'],
        requiresApiKey: false,
        enabled: true,
      },
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'local-oneapi',
        type: 'oneapi',
        connectionKind: 'local',
        protocolProfile: 'openai-completions',
        requiresApiKey: false,
      }),
    );
    expect(credentials.replaceApiKey).not.toHaveBeenCalled();
  });

  it('creates an unknown DSH catalog Provider without a local preset or endpoint override', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const capabilities: DesktopAiDialogueCapabilityReader = {
      read: vi.fn(async () => ({
        status: 'available' as const,
        providers: [
          {
            providerId: 'future-provider',
            displayName: 'Future Provider',
            source: 'catalog' as const,
            settingsNamespace: 'llm-pi-ai',
            settingsPath: ['providers', 'future-provider'],
            providerType: 'generic' as const,
            defaultApiUrl: '',
            connectionKind: 'direct' as const,
            requiresApiKey: true,
          },
        ],
        protocols: ['future-protocol'],
        diagnostics: [],
      })),
    };

    await createService(config, credentials, capabilities).execute({
      requestId: 'request-future-provider',
      operation: 'save-provider',
      provider: {
        id: 'future-provider',
        displayName: 'Future Provider',
        type: 'generic',
        apiUrl: '',
        connectionKind: 'direct',
        supportedModelFamilies: ['dialogue'],
        requiresApiKey: true,
        enabled: true,
      },
      apiKey: 'future-secret',
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'future-provider',
        apiUrl: '',
        supportedModelFamilies: ['dialogue'],
      }),
    );
    expect(vi.mocked(config.setProvider).mock.calls[0]?.[0]).not.toHaveProperty('protocolProfile');
  });

  it('rejects a stale protocol before mutating OpenNeko configuration', async () => {
    const { config, provider } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const capabilities: DesktopAiDialogueCapabilityReader = {
      read: vi.fn(async () => ({
        status: 'available' as const,
        providers: [],
        protocols: ['openai-completions'],
        diagnostics: [],
      })),
    };

    await expect(
      createService(config, credentials, capabilities).execute({
        requestId: 'request-stale-protocol',
        operation: 'save-provider',
        provider: {
          id: provider.id,
          displayName: provider.displayName,
          type: provider.type,
          apiUrl: provider.apiUrl,
          connectionKind: 'direct',
          protocol: 'removed-by-dsh',
          supportedModelFamilies: ['dialogue'],
          requiresApiKey: true,
          enabled: true,
        },
      }),
    ).rejects.toThrow(/not advertised by the current DSH runtime/u);
    expect(config.setProvider).not.toHaveBeenCalled();
  });

  it('keeps configured Providers visible when DSH capability discovery is unavailable', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const projection = await createService(config, credentials, {
      read: vi.fn(async () => {
        throw new Error('DSH subprocess stopped');
      }),
    }).project();

    expect(projection.dialogueCapabilities).toEqual({
      status: 'unavailable',
      providers: [],
      protocols: [],
      diagnostics: ['DSH Provider capabilities are unavailable: DSH subprocess stopped'],
    });
    expect(projection.providers).toEqual([
      expect.objectContaining({ id: 'provider-a', diagnostic: expect.stringContaining('DSH') }),
    ]);
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

    await createService(config, credentials).execute({
      requestId: 'request-existing-provider',
      operation: 'save-provider',
      provider: {
        id: provider.id,
        displayName: 'Provider A renamed',
        type: 'newapi',
        apiUrl: provider.apiUrl,
        connectionKind: 'direct',
        protocol: 'openai-chat',
        supportedModelFamilies: ['dialogue'],
        requiresApiKey: true,
        enabled: true,
      },
    });

    const saved = vi.mocked(config.setProvider).mock.calls[0]?.[0];
    expect(saved).toEqual(
      expect.objectContaining({
        id: provider.id,
        type: 'newapi',
        protocolProfile: 'openai-chat',
        supportLevel: 'verified',
      }),
    );
    expect(saved).not.toHaveProperty('builtin');
  });

  it('does not infer the Provider type from protocol metadata', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { builtin: true });
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: 'request-config-provider-protocol',
      operation: 'save-provider',
      provider: {
        id: provider.id,
        displayName: provider.displayName,
        type: 'generic',
        apiUrl: provider.apiUrl,
        connectionKind: 'direct',
        protocol: 'ollama',
        supportedModelFamilies: ['dialogue'],
        requiresApiKey: true,
        enabled: true,
      },
    });

    const saved = vi.mocked(config.setProvider).mock.calls[0]?.[0];
    expect(saved).toEqual(
      expect.objectContaining({
        id: provider.id,
        type: 'generic',
        protocolProfile: 'ollama',
        connectionKind: 'direct',
      }),
    );
    expect(saved).not.toHaveProperty('builtin');
  });

  it('changes the local Provider type only for an explicit custom DSH route', async () => {
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

    const capabilities: DesktopAiDialogueCapabilityReader = {
      read: vi.fn(async () => ({
        status: 'available' as const,
        providers: [],
        protocols: ['openai-completions'],
        diagnostics: [],
      })),
    };

    await createService(config, credentials, capabilities).execute({
      requestId: 'request-custom-oneapi',
      operation: 'save-provider',
      provider: {
        id: provider.id,
        displayName: 'OneAPI Gateway',
        type: 'oneapi',
        apiUrl: 'https://oneapi.example/v1',
        connectionKind: 'gateway',
        protocol: 'openai-completions',
        supportedModelFamilies: ['dialogue'],
        requiresApiKey: true,
        enabled: true,
      },
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: provider.id,
        type: 'oneapi',
        connectionKind: 'gateway',
        protocolProfile: 'openai-completions',
      }),
    );
  });

  it('keeps a DSH catalog Provider type immutable', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { requiresApiKey: true, connectionKind: 'direct' });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-catalog-type-mutation',
        operation: 'save-provider',
        provider: {
          id: provider.id,
          displayName: provider.displayName,
          type: 'oneapi',
          apiUrl: provider.apiUrl,
          connectionKind: 'direct',
          protocol: 'openai-completions',
          supportedModelFamilies: ['dialogue'],
          requiresApiKey: true,
          enabled: true,
        },
      }),
    ).rejects.toThrow(/catalog Provider .* type is immutable/u);

    expect(config.setProvider).not.toHaveBeenCalled();
  });

  it('rejects a Provider mutation that merges dialogue and generation ownership', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-hybrid-provider',
        operation: 'save-provider',
        provider: {
          id: 'provider-a',
          displayName: 'Hybrid Provider',
          type: 'generic',
          apiUrl: 'https://example.test/v1',
          connectionKind: 'direct',
          protocol: 'openai-chat',
          supportedModelFamilies: ['dialogue', 'generation'],
          requiresApiKey: true,
          enabled: true,
        },
      }),
    ).rejects.toThrow(/exactly one dialogue or generation directory/u);

    expect(config.setProvider).not.toHaveBeenCalled();
  });

  it('rejects creation when a preset would overwrite an existing Provider identity', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { type: 'newapi', protocolProfile: 'newapi' });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-provider-collision',
        operation: 'save-provider',
        provider: {
          id: provider.id,
          displayName: 'Colliding Provider',
          type: 'newapi',
          apiUrl: 'https://example.test/v1',
          connectionKind: 'gateway',
          presetId: 'generation-newapi',
          supportedModelFamilies: ['generation'],
          requiresApiKey: true,
          enabled: true,
        },
      }),
    ).rejects.toThrow(/already exists/u);

    expect(config.setProvider).not.toHaveBeenCalled();
  });

  it('accepts any protocol advertised by DSH regardless of local Provider type', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { type: 'newapi', protocolProfile: 'newapi' });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: 'request-provider-protocol-mismatch',
      operation: 'save-provider',
      provider: {
        id: provider.id,
        displayName: provider.displayName,
        type: 'newapi',
        apiUrl: provider.apiUrl,
        connectionKind: 'direct',
        protocol: 'openai-responses',
        supportedModelFamilies: ['dialogue'],
        requiresApiKey: true,
        enabled: true,
      },
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({ protocolProfile: 'openai-responses' }),
    );
  });

  it('rejects credentials for local keyless dialogue Providers', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-local-key',
        operation: 'save-provider',
        provider: {
          id: 'local-oneapi',
          displayName: 'Local OneAPI',
          type: 'oneapi',
          apiUrl: 'http://localhost:8000/v1',
          connectionKind: 'local',
          protocol: 'openai-completions',
          supportedModelFamilies: ['dialogue'],
          requiresApiKey: false,
          enabled: true,
        },
        apiKey: 'must-not-store',
      }),
    ).rejects.toThrow(/does not accept an API key/u);

    expect(config.setProvider).not.toHaveBeenCalled();
    expect(credentials.replaceApiKey).not.toHaveBeenCalled();
  });

  it.each([
    {
      presetId: 'generation-minimax-h3',
      id: 'minimax-media',
      displayName: 'MiniMax H3',
      type: 'minimax' as const,
      apiUrl: 'https://api.minimaxi.com/v2',
    },
    {
      presetId: 'generation-bytedance-seedance',
      id: 'bytedance-media',
      displayName: 'ByteDance Ark / Seedance',
      type: 'bytedance' as const,
      apiUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    },
  ])('persists the exact native generation adapter for $type', async (preset) => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: `request-${preset.type}`,
      operation: 'save-provider',
      provider: {
        id: preset.id,
        displayName: preset.displayName,
        type: preset.type,
        apiUrl: preset.apiUrl,
        connectionKind: 'direct',
        presetId: preset.presetId,
        supportedModelFamilies: ['generation'],
        requiresApiKey: true,
        enabled: true,
      },
      apiKey: 'generation-secret',
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: preset.id,
        type: preset.type,
        apiUrl: preset.apiUrl,
        supportLevel: 'verified',
        supportedModelFamilies: ['generation'],
      }),
    );
    expect(vi.mocked(config.setProvider).mock.calls[0]?.[0]).not.toHaveProperty('protocolProfile');
  });

  it('keeps the MiniMax adapter type when the preset endpoint is replaced', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
      replaceApiKey: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: 'request-minimax-custom-url',
      operation: 'save-provider',
      provider: {
        id: 'minimax-proxy',
        displayName: 'MiniMax Proxy',
        type: 'minimax',
        apiUrl: 'https://minimax-proxy.example/v2',
        connectionKind: 'direct',
        presetId: 'generation-minimax-h3',
        supportedModelFamilies: ['generation'],
        requiresApiKey: true,
        enabled: true,
      },
      apiKey: 'generation-secret',
    });

    expect(config.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'minimax-proxy',
        type: 'minimax',
        apiUrl: 'https://minimax-proxy.example/v2',
        supportLevel: 'custom',
      }),
    );
  });

  it('projects a native generation Provider without registering a DSH protocol', async () => {
    const { config, provider, model } = createConfig();
    Object.assign(provider, {
      type: 'minimax',
      protocolProfile: undefined,
      supportedModelFamilies: ['generation'],
    });
    Object.assign(model, { type: 'video' });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    const projection = await createService(config, credentials).project();

    expect(projection.providers).toEqual([
      expect.objectContaining({
        id: provider.id,
        type: 'minimax',
        supportedModelFamilies: ['generation'],
      }),
    ]);
    expect(projection.providers[0]).not.toHaveProperty('protocol');
    expect(projection.models).toEqual([
      expect.objectContaining({ providerId: provider.id, type: 'video' }),
    ]);
  });

  it.each([
    {
      type: 'minimax' as const,
      templateId: 'minimax-h3',
      apiName: 'MiniMax-H3',
      capabilities: ['text_to_video', 'video.generate', 'image_to_video', 'video_to_video'],
    },
    {
      type: 'bytedance' as const,
      templateId: 'bytedance-seedance-2',
      apiName: 'doubao-seedance-2-0-260128',
      capabilities: ['text_to_video', 'video.generate', 'image_to_video'],
    },
  ])('persists the canonical generation model template for $type', async (template) => {
    const { config, provider } = createConfig();
    Object.assign(provider, {
      type: template.type,
      protocolProfile: undefined,
      supportedModelFamilies: ['generation'],
    });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: `request-model-${template.type}`,
      operation: 'save-model',
      model: {
        providerId: provider.id,
        apiName: template.apiName,
        displayName: template.apiName,
        type: 'video',
        capabilities: template.capabilities,
        enabled: true,
        templateId: template.templateId,
      },
    });

    expect(config.setModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `${provider.id}-${template.templateId}`,
        providerId: provider.id,
        name: template.apiName,
        type: 'video',
        capabilities: template.capabilities,
      }),
    );
  });

  it('rejects capability overrides for a builtin model template', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, {
      type: 'minimax',
      protocolProfile: undefined,
      supportedModelFamilies: ['generation'],
    });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-template-capability-override',
        operation: 'save-model',
        model: {
          providerId: provider.id,
          apiName: 'MiniMax-H3',
          displayName: 'MiniMax H3',
          type: 'video',
          capabilities: ['video.generate'],
          enabled: true,
          templateId: 'minimax-h3',
        },
      }),
    ).rejects.toThrow(/owns its capability declaration/u);

    expect(config.setModel).not.toHaveBeenCalled();
  });

  it('persists explicitly selected capabilities for a custom dialogue model', async () => {
    const { config, provider } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: 'request-custom-dialogue-capabilities',
      operation: 'save-model',
      model: {
        providerId: provider.id,
        apiName: 'custom-agent-model',
        displayName: 'Custom Agent Model',
        type: 'llm',
        capabilities: ['chat', 'llm.chat', 'vision', 'function_calling', 'streaming'],
        enabled: true,
      },
    });

    expect(config.setModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `${provider.id}:custom-agent-model`,
        capabilities: ['chat', 'llm.chat', 'vision', 'function_calling', 'streaming'],
      }),
    );
  });

  it('preserves the Host-owned identity when editing an existing model', async () => {
    const { config, provider, model } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: 'request-edit-dialogue-model',
      operation: 'save-model',
      model: {
        existingId: model.id,
        providerId: provider.id,
        apiName: 'renamed-api-model',
        displayName: 'Renamed Model',
        type: 'llm',
        capabilities: ['chat', 'llm.chat', 'streaming'],
        enabled: true,
      },
    });

    expect(config.setModel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: model.id,
        name: 'renamed-api-model',
        displayName: 'Renamed Model',
      }),
    );
  });

  it('rejects a custom model missing the capabilities required by its type', async () => {
    const { config, provider } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-incomplete-dialogue-capabilities',
        operation: 'save-model',
        model: {
          providerId: provider.id,
          apiName: 'incomplete-agent-model',
          displayName: 'Incomplete Agent Model',
          type: 'llm',
          capabilities: ['vision'],
          enabled: true,
        },
      }),
    ).rejects.toThrow(/requires capabilities: chat, llm.chat/u);

    expect(config.setModel).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'minimax' as const, apiName: 'unsupported-minimax' },
    { type: 'bytedance' as const, apiName: 'unsupported-seedance' },
  ])('rejects a custom model not owned by the $type catalog', async ({ type, apiName }) => {
    const { config, provider } = createConfig();
    Object.assign(provider, {
      type,
      protocolProfile: undefined,
      supportedModelFamilies: ['generation'],
    });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: `request-unsupported-${type}`,
        operation: 'save-model',
        model: {
          providerId: provider.id,
          apiName,
          displayName: apiName,
          type: 'video',
          capabilities: ['video.generate'],
          enabled: true,
        },
      }),
    ).rejects.toThrow(/supports only builtin model templates/u);

    expect(config.setModel).not.toHaveBeenCalled();
  });

  it('rejects editing a model through another Provider', async () => {
    const { config, provider, model } = createConfig();
    Object.assign(provider, {
      id: 'provider-b',
      type: 'minimax',
      protocolProfile: undefined,
      supportedModelFamilies: ['generation'],
    });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-model-collision',
        operation: 'save-model',
        model: {
          existingId: model.id,
          providerId: provider.id,
          apiName: 'MiniMax-H3',
          displayName: 'MiniMax H3',
          type: 'video',
          capabilities: ['video.generate'],
          enabled: true,
          templateId: 'minimax-h3',
        },
      }),
    ).rejects.toThrow(/belongs to Provider provider-a, not provider-b/u);

    expect(config.setModel).not.toHaveBeenCalled();
  });

  it('delegates exact generation defaults without provider fallback', async () => {
    const { config } = createConfig();
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;
    const service = createService(config, credentials);

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

    await service.execute({
      requestId: 'request-music-default',
      operation: 'set-default',
      modelType: 'music',
      ref: { providerId: 'provider-a', modelId: 'music-a' },
    });
    expect(config.setDefaultModelRef).toHaveBeenLastCalledWith('music', {
      providerId: 'provider-a',
      modelId: 'music-a',
    });
  });

  it('rejects models outside an explicitly configured Provider family', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { supportedModelFamilies: ['generation'] });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-family-mismatch',
        operation: 'save-model',
        model: {
          providerId: provider.id,
          apiName: 'chat-mismatch',
          displayName: 'Chat mismatch',
          type: 'llm',
          capabilities: ['chat', 'llm.chat'],
          enabled: true,
        },
      }),
    ).rejects.toThrow(/does not support dialogue models/u);

    expect(config.setModel).not.toHaveBeenCalled();
  });

  it('rejects generation models owned by a dialogue-only Provider', async () => {
    const { config, provider } = createConfig();
    Object.assign(provider, { supportedModelFamilies: ['dialogue'] });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'request-dialogue-video-mismatch',
        operation: 'save-model',
        model: {
          providerId: provider.id,
          apiName: 'video-mismatch',
          displayName: 'Video mismatch',
          type: 'video',
          capabilities: ['video.generate'],
          enabled: true,
        },
      }),
    ).rejects.toThrow(/does not support generation models/u);

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

    const projection = await createService(config, credentials).project();

    expect(projection.providers).toEqual([
      expect.objectContaining({
        id: provider.id,
        protocol: 'openai-completions',
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
    const service = createService(config, credentials);

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
    const service = createService(config, credentials);

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
    expect(config.clearAssistantModelSelection).toHaveBeenCalledOnce();
    expect(config.removeProvider).toHaveBeenCalledWith(provider.id);
    expect(credentials.delete).toHaveBeenCalledWith(provider.id);
  });

  it('restores a deleted model when its stale Composer selection cannot be cleared', async () => {
    const { config, model } = createConfig();
    config.getDefaultModelRef = vi.fn(() => undefined);
    config.clearAssistantModelSelection = vi.fn(async () => {
      throw new Error('runtime settings unavailable');
    });
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await expect(
      createService(config, credentials).execute({
        requestId: 'delete-selected-model',
        operation: 'delete-model',
        modelId: model.id,
      }),
    ).rejects.toThrow(/deletion was reverted/u);

    expect(config.removeModel).toHaveBeenCalledWith(model.id);
    expect(config.setModel).toHaveBeenCalledWith(model);
  });

  it('keeps an unrelated transient Composer selection when deleting another model', async () => {
    const { config, model } = createConfig();
    config.getDefaultModelRef = vi.fn(() => undefined);
    config.getAssistantSettingsSnapshot = vi.fn(() => ({
      selectedProviderId: 'another-provider',
      selectedModelId: 'another-model',
    }));
    const credentials = {
      read: vi.fn(async () => undefined),
    } as unknown as ProviderCredentialAuthority;

    await createService(config, credentials).execute({
      requestId: 'delete-unselected-model',
      operation: 'delete-model',
      modelId: model.id,
    });

    expect(config.removeModel).toHaveBeenCalledWith(model.id);
    expect(config.clearAssistantModelSelection).not.toHaveBeenCalled();
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
      const service = createService(config, credentials);

      await service.execute({
        requestId: 'persist-provider-edit',
        operation: 'save-provider',
        provider: {
          id: 'config-provider',
          displayName: 'Renamed Provider',
          type: 'generic',
          apiUrl: 'https://config.example/v2',
          connectionKind: 'direct',
          protocol: 'openai-chat',
          supportedModelFamilies: ['dialogue'],
          requiresApiKey: true,
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
          supportedModelFamilies: ['dialogue'],
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
      createService(config, credentials).execute({
        requestId: 'delete-provider-rollback',
        operation: 'delete-provider',
        providerId: provider.id,
      }),
    ).rejects.toThrow(/configuration was restored/u);

    expect(config.removeProvider).toHaveBeenCalledWith(provider.id);
    expect(config.setProvider).toHaveBeenCalledWith(provider);
  });
});
