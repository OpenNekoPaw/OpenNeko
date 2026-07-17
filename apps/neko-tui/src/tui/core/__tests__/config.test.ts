import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedConfig } from '@neko/shared';

interface MockProvider {
  id: string;
  name: string;
  displayName?: string;
  type: string;
  apiUrl: string;
  apiKey?: string;
  requiresApiKey?: boolean;
  protocolProfile?: 'newapi' | 'ollama';
  useBearerAuth?: boolean;
}

interface MockModel {
  id: string;
  name?: string;
  providerId: string;
  type?: string;
  capabilities?: readonly string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  enabled?: boolean;
}

interface MockMcpServer {
  id: string;
  name: string;
  enabled?: boolean;
}

const state = vi.hoisted(() => ({
  userConfig: {} as UnifiedConfig,
  workspaceConfig: {} as UnifiedConfig,
  providers: [] as MockProvider[],
  models: [] as MockModel[],
  mcpServers: [] as MockMcpServer[],
}));

vi.mock('@neko/platform', () => ({
  FileUserConfigManager: class FileUserConfigManager {},
  modelSupportsPurpose: (model: MockModel, purpose: string): boolean => {
    const aliases: Record<string, readonly string[]> = {
      'image.generate': ['image.generate', 'text_to_image', 'image_generation'],
      'image.edit': ['image.edit', 'image_edit'],
      'image.understand': ['vision', 'image.understand'],
      'video.generate': ['video.generate', 'text_to_video', 'video_generation'],
      'video.understand': ['vision_video', 'video.understand'],
      'audio.generate': ['audio.generate', 'text_to_audio', 'audio'],
      'audio.tts': ['audio.tts', 'text_to_audio', 'audio'],
      'audio.understand': ['audio', 'audio.understand'],
      'audio.music.generate': ['audio.music.generate', 'text_to_music'],
    };
    return (aliases[purpose] ?? [purpose]).some((capability) =>
      model.capabilities?.includes(capability),
    );
  },
  ConfigManager: class ConfigManager {
    private providerOverrides = new Map<string, Partial<MockProvider>>();

    getEffectiveAgentWorkspaceConfigSnapshot(
      runtimeOverrides: {
        selectedProviderId?: string;
        selectedModelId?: string;
        temperature?: number;
        maxTokens?: number;
      } = {},
    ) {
      const providerId =
        runtimeOverrides.selectedProviderId ??
        state.workspaceConfig.defaultModels?.llm?.providerId ??
        state.userConfig.defaultModels?.llm?.providerId ??
        state.workspaceConfig.defaultProvider ??
        state.userConfig.defaultProvider ??
        null;
      const provider = providerId ? this.getProvider(providerId) : undefined;
      const modelId =
        runtimeOverrides.selectedModelId ??
        (state.workspaceConfig.defaultModels?.llm?.providerId === providerId
          ? state.workspaceConfig.defaultModels.llm.modelId
          : undefined) ??
        (state.userConfig.defaultModels?.llm?.providerId === providerId
          ? state.userConfig.defaultModels.llm.modelId
          : undefined) ??
        state.workspaceConfig.defaultModel ??
        state.userConfig.defaultModel ??
        null;
      const model = modelId ? this.getModel(modelId) : undefined;
      return {
        providerId,
        modelId,
        provider,
        model,
        modelCapabilities: model?.capabilities,
        temperature:
          runtimeOverrides.temperature ??
          state.workspaceConfig.temperature ??
          state.userConfig.temperature ??
          0.7,
        maxTokens:
          runtimeOverrides.maxTokens ??
          state.workspaceConfig.maxTokens ??
          state.userConfig.maxTokens ??
          8192,
        thinkingBudget:
          state.workspaceConfig.thinkingBudget ?? state.userConfig.thinkingBudget ?? 10000,
        executionMode:
          state.workspaceConfig.executionMode ?? state.userConfig.executionMode ?? 'ask',
        defaultMediaModels: {
          image: toOptionId(state.workspaceConfig.defaultModels?.image),
          video: toOptionId(state.workspaceConfig.defaultModels?.video),
          audio: toOptionId(state.workspaceConfig.defaultModels?.audio),
        },
        mcpServers: this.getEnabledMCPServers(),
        diagnostics: [],
        sources: {
          temperature: 'workspace',
          maxTokens: 'workspace',
          thinkingBudget:
            state.workspaceConfig.thinkingBudget !== undefined
              ? 'workspace'
              : state.userConfig.thinkingBudget !== undefined
                ? 'user'
                : 'default',
          executionMode: 'workspace',
          mediaDefaults: {},
        },
      };
    }

    setRuntimeProviderOverride(providerId: string, override: Partial<MockProvider>): void {
      this.providerOverrides.set(providerId, {
        ...this.providerOverrides.get(providerId),
        ...override,
      });
    }

    getProviders(): MockProvider[] {
      return state.providers.map((provider) => ({
        ...provider,
        ...this.providerOverrides.get(provider.id),
      }));
    }

    getProvider(providerId: string): MockProvider | undefined {
      const provider = state.providers.find((candidate) => candidate.id === providerId);
      return provider ? { ...provider, ...this.providerOverrides.get(provider.id) } : undefined;
    }

    getModel(modelId: string): MockModel | undefined {
      return state.models.find((model) => model.id === modelId);
    }

    getModelsByProvider(providerId: string): MockModel[] {
      return state.models.filter((model) => model.providerId === providerId);
    }

    getEnabledModels(): MockModel[] {
      return state.models.filter((model) => model.enabled !== false);
    }

    getEnabledMCPServers(): MockMcpServer[] {
      return state.mcpServers.filter((server) => server.enabled !== false);
    }

    getDefaultModelPurposeRef(
      purpose: string,
    ): { providerId: string; modelId: string } | undefined {
      return (
        state.workspaceConfig.defaultModelPurposes?.[purpose] ??
        state.userConfig.defaultModelPurposes?.[purpose]
      );
    }

    dispose(): void {}
  },
}));

function toOptionId(ref: { providerId: string; modelId: string } | undefined): string | undefined {
  return ref ? `${ref.providerId}:${ref.modelId}` : undefined;
}

vi.mock('@neko/shared/config/config-reader.ts', () => ({
  getUserConfigDir: () => '/tmp/neko-user',
  getUserConfigPath: () => '/tmp/neko-user/config.toml',
  getWorkspaceConfigDir: () => '/tmp/neko-workspace/.neko',
  getWorkspaceConfigPath: () => '/tmp/neko-workspace/.neko/config.toml',
  getConfigLocations: () => ({
    user: '/tmp/neko-user/config.toml',
    workspace: '/tmp/neko-workspace/.neko/config.toml',
  }),
  readUserConfigResult: () => ({
    status: 'ok',
    filePath: '/tmp/neko-user/config.toml',
    config: state.userConfig,
  }),
  readWorkspaceConfigResult: () => ({
    status: 'ok',
    filePath: '/tmp/neko-workspace/.neko/config.toml',
    config: state.workspaceConfig,
  }),
  writeUserConfig: vi.fn(),
}));

import { CliConfigLoadError, loadConfig } from '../config';

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.NEKO_API_KEY;
    delete process.env.LLM_API_KEY;
    state.userConfig = {};
    state.workspaceConfig = {};
    state.providers = [
      {
        id: 'local',
        name: 'local',
        displayName: 'Local',
        type: 'ollama',
        apiUrl: 'http://localhost:11434/api',
        requiresApiKey: false,
        protocolProfile: 'ollama',
      },
      {
        id: 'gateway',
        name: 'gateway',
        displayName: 'Gateway',
        type: 'newapi',
        apiUrl: 'https://gateway.example/v1',
        apiKey: 'sk-gateway',
        protocolProfile: 'newapi',
        useBearerAuth: true,
      },
    ];
    state.models = [
      {
        id: 'local-chat',
        name: 'llama3.2',
        providerId: 'local',
        type: 'llm',
        capabilities: ['chat'],
      },
      {
        id: 'gateway-chat',
        name: 'gpt-4.1',
        providerId: 'gateway',
        type: 'llm',
        capabilities: ['chat'],
      },
    ];
    state.mcpServers = [];
  });

  afterEach(() => {
    delete process.env.NEKO_API_KEY;
    delete process.env.LLM_API_KEY;
  });

  it('uses [default_models.llm] before legacy default provider and model scalars', () => {
    state.userConfig = {
      defaultProvider: 'gateway',
      defaultModel: 'gateway-chat',
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
      },
    };

    const config = loadConfig('/tmp/project');

    expect(config.provider).toBe('local');
    expect(config.model).toBe('local-chat');
  });

  it('does not apply the legacy default numeric thinking budget to NewAPI', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
    };

    expect(loadConfig('/tmp/project').thinkingBudget).toBe(0);
  });

  it('preserves an explicit numeric thinking budget for fail-visible protocol validation', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
      thinkingBudget: 4096,
    };

    expect(loadConfig('/tmp/project').thinkingBudget).toBe(4096);
  });

  it('uses workspace [default_models.llm] before user [default_models.llm]', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
    };
    state.workspaceConfig = {
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
      },
    };

    const config = loadConfig('/tmp/project');

    expect(config.provider).toBe('local');
    expect(config.model).toBe('local-chat');
  });

  it('fails visibly when provider override conflicts with the only configured default model', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
      },
    };

    try {
      loadConfig('/tmp/project', { provider: 'gateway' });
      expect.fail('Expected configuration loading to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(CliConfigLoadError);
      expect((error as CliConfigLoadError).diagnostic).toEqual({
        code: 'missing-provider-model',
        providerId: 'gateway',
      });
    }
  });

  it('uses effective workspace scalar and media defaults from ConfigManager', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
        image: {
          providerId: 'gateway',
          modelId: 'gateway-image',
        },
      },
      temperature: 0.2,
      maxTokens: 4096,
      thinkingBudget: 2048,
    };
    state.workspaceConfig = {
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
        image: {
          providerId: 'local',
          modelId: 'local-image',
        },
      },
      defaultModelPurposes: {
        'image.understand': {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
      temperature: 0.55,
      maxTokens: 1024,
      thinkingBudget: 512,
      executionMode: 'plan',
    };
    state.models = state.models.map((model) =>
      model.id === 'gateway-chat'
        ? {
            ...model,
            capabilities: ['chat', 'vision'],
            contextWindow: 256000,
            maxOutputTokens: 128000,
          }
        : model,
    );

    const config = loadConfig('/tmp/project');

    expect(config.provider).toBe('local');
    expect(config.model).toBe('local-chat');
    expect(config.temperature).toBe(0.55);
    expect(config.maxTokens).toBe(1024);
    expect(config.thinkingBudget).toBe(512);
    expect(config.executionMode).toBe('plan');
    expect(config.defaultMediaModels).toEqual({
      image: 'local:local-image',
      video: undefined,
      audio: undefined,
    });
    expect(config.perceptionModels).toEqual({
      image: 'gateway:gateway-chat',
    });
    expect(config.purposeModels?.['image.understand']).toEqual({
      purpose: 'image.understand',
      providerId: 'gateway',
      modelId: 'gateway-chat',
      apiModelId: 'gpt-4.1',
      category: 'llm',
      capabilities: ['chat', 'vision'],
      baseUrl: 'https://gateway.example/v1',
      protocolProfile: 'newapi',
      providerRequiresApiKey: true,
      providerAuth: { type: 'bearer' },
      apiKey: 'sk-gateway',
      credentialProvenance: 'user-config-import',
      contextWindow: 256000,
      maxOutputTokens: 128000,
    });
  });

  it('projects a flat domain generation purpose without Pi token metadata', () => {
    state.userConfig = {
      defaultModels: {
        llm: { providerId: 'local', modelId: 'local-chat' },
      },
      defaultModelPurposes: {
        'image.generate': { providerId: 'gateway', modelId: 'gateway-image' },
      },
    };
    state.models.push({
      id: 'gateway-image',
      name: 'flux-pro',
      providerId: 'gateway',
      type: 'image',
      capabilities: ['image.generate'],
    });

    const config = loadConfig('/tmp/project');

    expect(config.purposeModels?.['image.generate']).toEqual({
      purpose: 'image.generate',
      providerId: 'gateway',
      modelId: 'gateway-image',
      apiModelId: 'flux-pro',
      category: 'image',
      capabilities: ['image.generate'],
      baseUrl: 'https://gateway.example/v1',
      protocolProfile: 'newapi',
      providerRequiresApiKey: true,
      providerAuth: { type: 'bearer' },
      apiKey: 'sk-gateway',
      credentialProvenance: 'user-config-import',
    });
  });

  it('resolves a flat session purpose override through the configured provider/model catalog', () => {
    state.userConfig = {
      defaultModels: {
        llm: { providerId: 'local', modelId: 'local-chat' },
      },
      defaultModelPurposes: {
        'image.generate': { providerId: 'gateway', modelId: 'gateway-image-old' },
      },
    };
    state.models.push({
      id: 'gateway-image',
      name: 'flux-pro',
      providerId: 'gateway',
      type: 'image',
      capabilities: ['image.generate'],
    });

    const config = loadConfig('/tmp/project', {
      defaultModelPurposes: {
        'image.generate': { providerId: 'gateway', modelId: 'gateway-image' },
      },
    });

    expect(config.purposeModels?.['image.generate']).toMatchObject({
      purpose: 'image.generate',
      providerId: 'gateway',
      modelId: 'gateway-image',
      apiModelId: 'flux-pro',
    });
  });

  it('fails visibly when a purpose model lacks the required capability', () => {
    state.userConfig = {
      defaultModels: {
        llm: { providerId: 'local', modelId: 'local-chat' },
      },
      defaultModelPurposes: {
        'image.understand': { providerId: 'gateway', modelId: 'gateway-chat' },
      },
    };

    expect(() => loadConfig('/tmp/project')).toThrow(
      'Purpose image.understand model gateway/gateway-chat lacks the required capability.',
    );
  });

  it('does not apply the main provider CLI credential to another purpose provider', () => {
    state.userConfig = {
      defaultModels: {
        llm: { providerId: 'gateway', modelId: 'gateway-chat' },
      },
      defaultModelPurposes: {
        'image.generate': { providerId: 'gateway', modelId: 'gateway-image' },
      },
    };
    state.workspaceConfig = {
      defaultModels: {
        llm: { providerId: 'local', modelId: 'local-chat' },
      },
    };
    state.providers = state.providers.map((provider) =>
      provider.id === 'gateway' ? { ...provider, apiKey: undefined } : provider,
    );
    state.models.push({
      id: 'gateway-image',
      name: 'flux-pro',
      providerId: 'gateway',
      type: 'image',
      capabilities: ['image.generate'],
    });

    const config = loadConfig('/tmp/project', { apiKey: 'local-only-key' });

    expect(config.apiKey).toBe('local-only-key');
    expect(config.purposeModels?.['image.generate']?.apiKey).toBeUndefined();
  });

  it('projects selected chat model token metadata into CLI config', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
    };
    state.models = state.models.map((model) =>
      model.id === 'gateway-chat'
        ? {
            ...model,
            capabilities: ['chat', 'vision'],
            contextWindow: 256000,
            maxOutputTokens: 128000,
          }
        : model,
    );

    const config = loadConfig('/tmp/project');

    expect(config.chatModel).toEqual({
      providerId: 'gateway',
      modelId: 'gateway-chat',
      apiModelId: 'gpt-4.1',
      capabilities: ['chat', 'vision'],
      contextWindow: 256000,
      maxOutputTokens: 128000,
    });
    expect(config.providerAuth).toEqual({ type: 'bearer' });
    expect(config.credentialProvenance).toBe('user-config-import');
  });

  it('records environment provenance separately from the credential value', () => {
    process.env.NEKO_API_KEY = 'env-gateway-key';
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
    };

    const config = loadConfig('/tmp/project');

    expect(config.apiKey).toBe('env-gateway-key');
    expect(config.credentialProvenance).toBe('environment');
  });
});
