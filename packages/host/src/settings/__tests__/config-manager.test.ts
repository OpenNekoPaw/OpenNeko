/**
 * ConfigManager Unit Tests
 *
 * Tests two-layer merge (User + Workspace) with no builtin presets.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager } from '../config-manager';
import type { IUserConfigManager, UserConfig } from '../user-config';
import type { Provider, Model } from '../types/provider';
import type { UnifiedConfig } from '../config-core/index';
import type { ConfigReadResult } from '../config-reader';
import type { AssistantRuntimeSettingsPort } from '../assistant-runtime-settings-port';
import { RETRY_TIMEOUT_PRESETS } from '../retry-timeout-presets';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockUserConfigManager(
  initial?: Partial<UserConfig>,
  rawScalars: Omit<UnifiedConfig, 'providers' | 'models'> = {},
): IUserConfigManager {
  let scalars = { ...rawScalars };
  let config: UserConfig = {
    providers: [],
    models: [],
    ...initial,
  };

  return {
    load: () => ({
      ...config,
      providers: [...config.providers],
      models: [...config.models],
    }),
    save: async (c: UserConfig) => {
      config = { ...c };
    },
    addProvider: async (p: Provider) => {
      const i = config.providers.findIndex((x) => x.id === p.id);
      if (i >= 0) config.providers[i] = p;
      else config.providers.push(p);
    },
    removeProvider: async (id: string) => {
      config.providers = config.providers.filter((p) => p.id !== id);
    },
    addModel: async (m: Model) => {
      const i = config.models.findIndex((x) => x.id === m.id);
      if (i >= 0) config.models[i] = m;
      else config.models.push(m);
    },
    removeModel: async (id: string) => {
      config.models = config.models.filter((m) => m.id !== id);
    },
    clear: async () => {
      config = {
        providers: [],
        models: [],
      };
    },
    loadRaw: () => ({
      ...scalars,
      providers: config.providers,
      models: config.models,
    }),
    loadRawResult: () => ({
      status: 'ok',
      filePath: '<test-config>',
      config: {
        ...scalars,
        providers: config.providers,
        models: config.models,
      } satisfies UnifiedConfig,
      diagnostics: [],
      providerCredentials: {},
    }),
    updateScalar: async (key, value) => {
      scalars = { ...scalars, [key]: value };
    },
    updateScalars: async (updates) => {
      scalars = { ...scalars, ...updates };
    },
    reload: () => {},
  };
}

function createEmptyConfigManager(): ConfigManager {
  return new ConfigManager({ userConfigManager: createMockUserConfigManager() });
}

function createMemoryAssistantRuntimeSettings(): AssistantRuntimeSettingsPort {
  let state: ReturnType<AssistantRuntimeSettingsPort['snapshot']> = {};
  return {
    snapshot: () => state,
    commit: async (next) => {
      state = { ...next };
    },
    reset: async () => {
      state = {};
    },
    diagnostic: () => undefined,
  };
}

type TestConfigReadResult =
  | ConfigReadResult
  | {
      readonly status: 'ok';
      readonly filePath: string;
      readonly config: UnifiedConfig;
      readonly diagnostics?: Extract<ConfigReadResult, { readonly status: 'ok' }>['diagnostics'];
      readonly providerCredentials?: Extract<
        ConfigReadResult,
        { readonly status: 'ok' }
      >['providerCredentials'];
    };

function createReadResultUserConfigManager(
  result: TestConfigReadResult | (() => TestConfigReadResult),
): IUserConfigManager {
  const readResult = (): ConfigReadResult => {
    const current = typeof result === 'function' ? result() : result;
    return current.status === 'ok'
      ? {
          ...current,
          diagnostics: current.diagnostics ?? [],
          providerCredentials: current.providerCredentials ?? {},
        }
      : current;
  };
  return {
    load: () => ({
      providers: [],
      models: [],
    }),
    loadRaw: () => {
      const current = readResult();
      return current.status === 'ok' ? current.config : {};
    },
    loadRawResult: readResult,
    save: async () => {
      throw new Error('write path should not be used');
    },
    addProvider: async () => {
      throw new Error('write path should not be used');
    },
    removeProvider: async () => {
      throw new Error('write path should not be used');
    },
    addModel: async () => {
      throw new Error('write path should not be used');
    },
    removeModel: async () => {
      throw new Error('write path should not be used');
    },
    clear: async () => {
      throw new Error('write path should not be used');
    },
    updateScalar: async () => {
      throw new Error('write path should not be used');
    },
    updateScalars: async () => {
      throw new Error('write path should not be used');
    },
    reload: () => {},
  };
}

const SAMPLE_PROVIDER: Provider = {
  id: 'anthropic',
  name: 'anthropic',
  displayName: 'Anthropic',
  type: 'anthropic',
  apiUrl: 'https://api.anthropic.com',
  enabled: true,
};

const SAMPLE_MODEL: Model = {
  id: 'anthropic-claude-sonnet-4',
  name: 'claude-sonnet-4-20250514',
  displayName: 'Claude Sonnet 4',
  providerId: 'anthropic',
  capabilities: ['chat'],
  contextWindow: 200000,
  enabled: true,
};

// =============================================================================
// Tests
// =============================================================================

describe('ConfigManager', () => {
  describe('initialization without user config', () => {
    it('should initialize with empty config', () => {
      const manager = createEmptyConfigManager();
      const config = manager.getConfig();

      expect(config.providers.size).toBe(0);
      expect(config.models.size).toBe(0);
    });

    it('should return retry/timeout presets', () => {
      const manager = createEmptyConfigManager();
      const preset = manager.getRetryTimeoutPreset('modelCall');

      expect(preset).toBeDefined();
      expect(preset?.retry.maxRetries).toBe(4);
      expect(preset?.timeout.totalTimeout).toBeGreaterThan(5 * 60 * 1000);
      expect(preset?.timeout.streamTimeout).toBeGreaterThan(5 * 60 * 1000);
    });
  });

  describe('user config merge', () => {
    it('should load providers from user config', () => {
      const ucm = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
        models: [SAMPLE_MODEL],
      });
      const manager = new ConfigManager({ userConfigManager: ucm });

      expect(manager.getProvider('anthropic')).toBeDefined();
      expect(manager.getProvider('anthropic')?.displayName).toBe('Anthropic');
      expect(manager.getModel('anthropic-claude-sonnet-4')).toBeDefined();
    });
  });

  describe('CRUD operations', () => {
    let manager: ConfigManager;

    beforeEach(() => {
      manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({
          providers: [SAMPLE_PROVIDER],
          models: [SAMPLE_MODEL],
        }),
      });
    });

    it('should add custom provider', async () => {
      const custom: Provider = {
        id: 'custom',
        name: 'custom',
        displayName: 'Custom',
        type: 'generic',
        apiUrl: 'https://custom.api.com',
        enabled: true,
      };
      await manager.setProvider(custom);
      expect(manager.getProvider('custom')).toBeDefined();
      expect(manager.getProvider('custom')?.displayName).toBe('Custom');
    });

    it('should remove provider', async () => {
      expect(manager.getProvider('anthropic')).toBeDefined();
      await manager.removeProvider('anthropic');
      expect(manager.getProvider('anthropic')).toBeUndefined();
    });

    it('should add custom model', async () => {
      const model: Model = {
        id: 'custom-model',
        name: 'custom-model',
        displayName: 'Custom Model',
        providerId: 'anthropic',
        capabilities: ['chat'],
        enabled: true,
      };
      await manager.setModel(model);
      expect(manager.getModel('custom-model')).toBeDefined();
    });

    it('should remove model', async () => {
      expect(manager.getModel('anthropic-claude-sonnet-4')).toBeDefined();
      await manager.removeModel('anthropic-claude-sonnet-4');
      expect(manager.getModel('anthropic-claude-sonnet-4')).toBeUndefined();
    });
  });

  describe('snapshot diagnostics', () => {
    it('surfaces invalid config diagnostics and does not fall back to default providers', () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'invalidToml',
          filePath: '/tmp/neko/config.toml',
          diagnostic: {
            code: 'invalidToml',
            filePath: '/tmp/neko/config.toml',
            message: 'invalid toml detail',
            detail: 'Invalid TOML',
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'invalidToml',
        filePath: '/tmp/neko/config.toml',
        message:
          'Configuration file contains invalid TOML: /tmp/neko/config.toml. Fix the file, then open a new Agent session or tab.',
      });
      expect(manager.getConfig().providers.size).toBe(0);
      expect(manager.getAssistantSettingsData()).toEqual(
        expect.objectContaining({
          selectedProviderId: null,
          selectedModelId: null,
          configDiagnostic: expect.objectContaining({ code: 'invalidToml' }),
        }),
      );
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Configuration file contains invalid TOML',
      );
    });

    it('surfaces a local provider diagnostic without blocking valid siblings', () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [SAMPLE_PROVIDER],
            models: [SAMPLE_MODEL],
          },
          diagnostics: [
            {
              code: 'invalidConfigField',
              filePath: '/tmp/neko/config.toml',
              path: 'providers.invalid.protocol_profile',
              message: 'invalid provider protocol profile',
            },
          ],
          providerCredentials: {},
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual(
        expect.objectContaining({
          code: 'invalidConfigField',
          path: 'providers.invalid.protocol_profile',
        }),
      );
      expect(manager.getConfig().providers.has('anthropic')).toBe(true);
      expect(() => manager.assertConfigAvailable()).not.toThrow();
    });

    it('keeps missing config out of settings data until account-aware projection runs', () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'missing',
          filePath: '/tmp/neko/config.toml',
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'missingConfig',
        filePath: '/tmp/neko/config.toml',
        message:
          'Agent configuration file is missing: /tmp/neko/config.toml. Create the config file with at least one enabled provider and chat model, then open a new Agent session or tab.',
      });
      expect(manager.getConfig().providers.size).toBe(0);
      expect(manager.getAssistantSettingsData().selectedProviderId).toBeNull();
      expect(manager.getAssistantSettingsData().selectedModelId).toBeNull();
      expect(manager.getAssistantSettingsData().configDiagnostic).toBeUndefined();
      expect(() => manager.assertConfigAvailable()).toThrow('Agent configuration file is missing');
    });

    it('reports missing config from local config state', () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'missing',
          filePath: '/tmp/neko/config.toml',
        }),
      });

      expect(manager.getAssistantConfigState().configDiagnostic).toEqual(
        expect.objectContaining({
          code: 'missingConfig',
          filePath: '/tmp/neko/config.toml',
        }),
      );
    });

    it('keeps non-AI empty config out of settings data', () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {},
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'missingProvider',
        filePath: '/tmp/neko/config.toml',
        message:
          'Agent configuration has no enabled providers: /tmp/neko/config.toml. Add at least one enabled provider with its endpoint, then open a new Agent session or tab.',
      });
      expect(manager.getAssistantSettingsData()).toEqual(
        expect.objectContaining({
          selectedProviderId: null,
          selectedModelId: null,
        }),
      );
      expect(manager.getAssistantSettingsData().configDiagnostic).toBeUndefined();
      expect(manager.getAssistantConfigState().configDiagnostic).toEqual(
        expect.objectContaining({ code: 'missingProvider' }),
      );
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Agent configuration has no enabled providers',
      );
    });

    it('projects global model defaults for the tabless Agent composer', () => {
      const provider: Provider = {
        ...SAMPLE_PROVIDER,
        id: 'local-provider',
        type: 'ollama',
        connectionKind: 'local',
        requiresApiKey: false,
      };
      const chatModel: Model = {
        ...SAMPLE_MODEL,
        id: 'chat-model',
        providerId: provider.id,
      };
      const imageModel: Model = {
        ...SAMPLE_MODEL,
        id: 'image-model',
        providerId: provider.id,
        type: 'image',
        capabilities: ['text_to_image'],
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [provider],
            models: [chatModel, imageModel],
            defaultModels: {
              llm: { providerId: provider.id, modelId: chatModel.id },
              image: { providerId: provider.id, modelId: imageModel.id },
            },
          },
        }),
      });

      expect(manager.getAssistantConfigState()).toEqual(
        expect.objectContaining({
          selectedProviderId: provider.id,
          selectedModelId: chatModel.id,
          chatModelOptions: expect.arrayContaining([
            expect.objectContaining({
              id: `${provider.id}:${chatModel.id}`,
              providerId: provider.id,
              modelId: chatModel.id,
            }),
          ]),
          defaultMediaModels: {
            image: `${provider.id}:${imageModel.id}`,
          },
        }),
      );
    });

    it('does not require API keys for local no-key providers', () => {
      const localProvider: Provider = {
        id: 'ollama-local',
        name: 'ollama',
        displayName: 'Ollama Local',
        type: 'ollama',
        apiUrl: 'http://localhost:11434/api',
        enabled: true,
        connectionKind: 'local',
        protocolProfile: 'ollama',
        requiresApiKey: false,
      };
      const localModel: Model = {
        id: 'ollama-local-llama3.2',
        name: 'llama3.2',
        displayName: 'Llama 3.2',
        providerId: 'ollama-local',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [localProvider],
            models: [localModel],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toBeUndefined();
      expect(manager.getAssistantDefaultProvider()).toEqual(
        expect.objectContaining({
          id: 'ollama-local',
          defaultModel: 'ollama-local-llama3.2',
          modelIds: ['ollama-local-llama3.2'],
        }),
      );
      expect(manager.getAssistantSettingsData()).toEqual(
        expect.objectContaining({
          selectedProviderId: null,
          selectedModelId: null,
        }),
      );
    });

    it('accepts llm.chat metadata as a chat model capability', () => {
      const localProvider: Provider = {
        id: 'ollama-local',
        name: 'ollama',
        displayName: 'Ollama Local',
        type: 'ollama',
        apiUrl: 'http://localhost:11434/api',
        enabled: true,
        connectionKind: 'local',
        protocolProfile: 'ollama',
        requiresApiKey: false,
      };
      const localModel: Model = {
        id: 'ollama-local-chat',
        name: 'llama3.2',
        displayName: 'Llama 3.2',
        providerId: 'ollama-local',
        capabilities: ['llm.chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [localProvider],
            models: [localModel],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toBeUndefined();
    });

    it('uses type default llm binding for assistant settings selection', () => {
      const localProvider: Provider = {
        id: 'ollama-local',
        name: 'ollama',
        displayName: 'Ollama Local',
        type: 'ollama',
        apiUrl: 'http://localhost:11434/api',
        enabled: true,
        connectionKind: 'local',
        protocolProfile: 'ollama',
        requiresApiKey: false,
      };
      const localModel: Model = {
        id: 'ollama-local-chat',
        name: 'llama3.2',
        providerId: 'ollama-local',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [localProvider],
            models: [localModel],
            defaultModels: {
              llm: {
                providerId: 'ollama-local',
                modelId: 'ollama-local-chat',
              },
            },
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toBeUndefined();
      expect(manager.getAssistantSettingsData()).toEqual(
        expect.objectContaining({
          selectedProviderId: 'ollama-local',
          selectedModelId: 'ollama-local-chat',
        }),
      );
      expect(manager.getAssistantRuntimeSettingsSnapshot()).toEqual(
        expect.objectContaining({
          selectedProviderId: 'ollama-local',
          selectedModelId: 'ollama-local-chat',
        }),
      );
    });

    it('reports type default models that do not match the configured model type', () => {
      const localProvider: Provider = {
        id: 'ollama-local',
        name: 'ollama',
        displayName: 'Ollama Local',
        type: 'ollama',
        apiUrl: 'http://localhost:11434/api',
        enabled: true,
        connectionKind: 'local',
        protocolProfile: 'ollama',
        requiresApiKey: false,
      };
      const textOnlyModel: Model = {
        id: 'text-only',
        name: 'llama3.2',
        providerId: 'ollama-local',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [localProvider],
            models: [textOnlyModel],
            defaultModels: {
              video: {
                providerId: 'ollama-local',
                modelId: 'text-only',
              },
            },
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual(
        expect.objectContaining({
          code: 'invalidDefaultModelBinding',
          path: 'default_models.video',
        }),
      );
      expect(() => manager.assertConfigAvailable()).not.toThrow();
    });

    it('resolves LLM purposes through the single typed default', async () => {
      const userConfigManager = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
        models: [SAMPLE_MODEL],
      });
      const updateScalars = vi.spyOn(userConfigManager, 'updateScalars');
      const manager = new ConfigManager({ userConfigManager });

      await manager.setDefaultModelRef('llm', {
        providerId: SAMPLE_PROVIDER.id,
        modelId: SAMPLE_MODEL.id,
      });

      expect(updateScalars).toHaveBeenCalledTimes(1);
      expect(updateScalars).toHaveBeenCalledWith({
        defaultModels: {
          llm: {
            providerId: SAMPLE_PROVIDER.id,
            modelId: SAMPLE_MODEL.id,
          },
        },
      });
      expect(manager.resolveModelRefForPurpose('character.dialogue')).toEqual({
        providerId: SAMPLE_PROVIDER.id,
        modelId: SAMPLE_MODEL.id,
      });
      expect(manager.resolveModelRefForPurpose('character.profile')).toEqual({
        providerId: SAMPLE_PROVIDER.id,
        modelId: SAMPLE_MODEL.id,
      });
      expect(manager.resolveModelRefForPurpose('media.analysis')).toBeUndefined();
    });

    it('maps audio generation while leaving unknown purposes unavailable', async () => {
      const capabilityOnlyModel: Model = {
        ...SAMPLE_MODEL,
        id: 'capability-only-audio',
        type: 'llm',
        capabilities: ['audio'],
      };
      const typedAudioModel: Model = {
        ...SAMPLE_MODEL,
        id: 'typed-audio',
        type: 'audio',
        capabilities: ['audio.generate'],
      };
      const userConfigManager = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
        models: [capabilityOnlyModel, typedAudioModel],
      });
      const updateScalars = vi.spyOn(userConfigManager, 'updateScalars');
      const manager = new ConfigManager({ userConfigManager });

      await expect(
        manager.setDefaultModelRef('audio', {
          providerId: SAMPLE_PROVIDER.id,
          modelId: capabilityOnlyModel.id,
        }),
      ).rejects.toThrow(`is not a audio model`);
      expect(updateScalars).not.toHaveBeenCalled();

      await manager.setDefaultModelRef('audio', {
        providerId: SAMPLE_PROVIDER.id,
        modelId: typedAudioModel.id,
      });
      expect(manager.resolveModelRefForPurpose('audio.generate')).toEqual({
        providerId: SAMPLE_PROVIDER.id,
        modelId: typedAudioModel.id,
      });
      expect(manager.resolveModelRefForPurpose('audio.music.generate')).toBeUndefined();
    });

    it('persists one typed default model without replacing sibling defaults', async () => {
      const imageModel: Model = {
        ...SAMPLE_MODEL,
        id: 'image-model',
        name: 'image-model',
        type: 'image',
        capabilities: ['image.generate'],
      };
      const userConfigManager = createMockUserConfigManager(
        {
          providers: [SAMPLE_PROVIDER],
          models: [SAMPLE_MODEL, imageModel],
        },
        {
          defaultModels: {
            llm: {
              providerId: SAMPLE_PROVIDER.id,
              modelId: SAMPLE_MODEL.id,
            },
          },
        },
      );
      const updateScalars = vi.spyOn(userConfigManager, 'updateScalars');
      const manager = new ConfigManager({ userConfigManager });

      await manager.setDefaultModelRef('image', {
        providerId: SAMPLE_PROVIDER.id,
        modelId: imageModel.id,
      });

      expect(updateScalars).toHaveBeenCalledWith({
        defaultModels: {
          llm: {
            providerId: SAMPLE_PROVIDER.id,
            modelId: SAMPLE_MODEL.id,
          },
          image: {
            providerId: SAMPLE_PROVIDER.id,
            modelId: imageModel.id,
          },
        },
      });
      expect(manager.getDefaultModelRef('llm')).toEqual({
        providerId: SAMPLE_PROVIDER.id,
        modelId: SAMPLE_MODEL.id,
      });
      expect(manager.getDefaultModelRef('image')).toEqual({
        providerId: SAMPLE_PROVIDER.id,
        modelId: imageModel.id,
      });
      await expect(
        manager.setDefaultModelRef('video', {
          providerId: SAMPLE_PROVIDER.id,
          modelId: imageModel.id,
        }),
      ).rejects.toThrow('is not a video model');
    });

    it('refreshes only through explicit reloadConfig snapshots', () => {
      let current: ConfigReadResult = {
        status: 'ok',
        filePath: '<test-config>',
        config: { providers: [SAMPLE_PROVIDER], models: [SAMPLE_MODEL] },
        diagnostics: [],
        providerCredentials: {},
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager(() => current),
      });

      expect(manager.getProvider('anthropic')).toBeDefined();

      current = {
        status: 'invalidToml',
        filePath: '/tmp/neko/config.toml',
        diagnostic: {
          code: 'invalidToml',
          filePath: '/tmp/neko/config.toml',
          message: 'invalid toml detail',
        },
      };

      expect(manager.getProvider('anthropic')).toBeDefined();
      manager.reloadConfig();
      expect(manager.getProvider('anthropic')).toBeUndefined();
      expect(manager.getConfigDiagnostic()?.code).toBe('invalidToml');
    });

    it('retains runtime provider/model selection across config reload', async () => {
      const deepseekProvider: Provider = {
        id: 'deepseek-chat',
        name: 'deepseek',
        displayName: 'DeepSeek',
        type: 'generic',
        apiUrl: 'https://api.deepseek.com/api',
        enabled: true,
        connectionKind: 'direct',
        protocolProfile: 'openai-chat',
        requiresApiKey: false,
      };
      const deepseekModel: Model = {
        id: 'deepseek-pro',
        name: 'deepseek-chat',
        displayName: 'DeepSeek Pro',
        providerId: 'deepseek-chat',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        assistantRuntimeSettings: createMemoryAssistantRuntimeSettings(),
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [deepseekProvider],
            models: [deepseekModel],
            defaultModels: {
              llm: {
                providerId: 'deepseek-chat',
                modelId: 'deepseek-pro',
              },
            },
          },
        }),
      });

      await manager.applyRuntimeAssistantSettingsFromWebview({
        providerId: 'nekoapi-chat',
        modelId: 'gateway-chat',
        executionMode: 'auto',
      });
      expect(manager.getAssistantRuntimeSettingsSnapshot()).toEqual(
        expect.objectContaining({
          selectedProviderId: null,
          selectedModelId: null,
          executionMode: 'auto',
        }),
      );

      manager.reloadConfig();

      expect(manager.getAssistantRuntimeSettingsSnapshot()).toEqual(
        expect.objectContaining({
          selectedProviderId: null,
          selectedModelId: null,
          executionMode: 'auto',
        }),
      );
    });

    it('clears runtime provider/model selection back to file defaults for an explicit clear request', async () => {
      const deepseekProvider: Provider = {
        id: 'deepseek-chat',
        name: 'deepseek',
        displayName: 'DeepSeek',
        type: 'generic',
        apiUrl: 'https://api.deepseek.com/api',
        enabled: true,
        connectionKind: 'direct',
        protocolProfile: 'openai-chat',
        requiresApiKey: false,
      };
      const deepseekModel: Model = {
        id: 'deepseek-pro',
        name: 'deepseek-chat',
        displayName: 'DeepSeek Pro',
        providerId: 'deepseek-chat',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        assistantRuntimeSettings: createMemoryAssistantRuntimeSettings(),
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [deepseekProvider],
            models: [deepseekModel],
            defaultModels: {
              llm: {
                providerId: 'deepseek-chat',
                modelId: 'deepseek-pro',
              },
            },
          },
        }),
      });

      await manager.applyRuntimeAssistantSettingsFromWebview({
        providerId: 'nekoapi-chat',
        modelId: 'gateway-chat',
      });
      await manager.applyRuntimeAssistantSettingsFromWebview({
        providerId: null,
        modelId: null,
      });

      expect(manager.getAssistantRuntimeSettingsSnapshot()).toEqual(
        expect.objectContaining({
          selectedProviderId: 'deepseek-chat',
          selectedModelId: 'deepseek-pro',
        }),
      );
    });

    it('projects missing transient selections as unselected without changing other settings', async () => {
      const runtimeSettings = createMemoryAssistantRuntimeSettings();
      const manager = new ConfigManager({
        assistantRuntimeSettings: runtimeSettings,
        userConfigManager: createMockUserConfigManager(),
      });
      await manager.setAssistantSettings({
        selectedProviderId: 'provider-a',
        selectedModelId: 'model-a',
        executionMode: 'plan',
      });

      expect(manager.getAssistantSettingsSnapshot()).toMatchObject({
        selectedProviderId: null,
        selectedModelId: null,
        executionMode: 'plan',
      });
      expect(manager.getEffectiveAgentWorkspaceConfigSnapshot().blockingDiagnostic).toBeDefined();
      expect(runtimeSettings.snapshot().executionMode).toBe('plan');
    });

    it('allows explicit reset when the runtime settings authority rejected its stored record', async () => {
      let rejected = true;
      const reset = vi.fn(async () => {
        rejected = false;
      });
      const runtimeSettings: AssistantRuntimeSettingsPort = {
        snapshot: () => ({}),
        commit: async () => {
          throw new Error('commit must remain unavailable while the stored record is invalid');
        },
        reset,
        diagnostic: () =>
          rejected
            ? {
                authority: 'neko.db#agent.runtime-settings:assistant-space:local-user',
                message: 'Stored Agent runtime settings are invalid.',
              }
            : undefined,
      };
      const manager = new ConfigManager({
        assistantRuntimeSettings: runtimeSettings,
        userConfigManager: createMockUserConfigManager(),
      });

      await expect(manager.setAssistantSettings({ executionMode: 'plan' })).rejects.toThrow(
        'Stored Agent runtime settings are invalid.',
      );
      await manager.resetAssistantSettings();

      expect(reset).toHaveBeenCalledOnce();
      expect(runtimeSettings.diagnostic()).toBeUndefined();
    });

    it('blocks conversation when the default chat binding provider is unavailable', () => {
      const validProvider: Provider = {
        ...SAMPLE_PROVIDER,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            defaultModels: {
              llm: { providerId: 'missing-provider', modelId: SAMPLE_MODEL.id },
            },
            providers: [validProvider],
            models: [SAMPLE_MODEL],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual(
        expect.objectContaining({
          code: 'invalidDefaultModelBinding',
          path: 'default_models.llm',
        }),
      );
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Agent configuration selects an unavailable default provider',
      );
    });

    it('blocks conversation when the default chat binding references a non-chat model', () => {
      const validProvider: Provider = {
        ...SAMPLE_PROVIDER,
      };
      const imageModel: Model = {
        id: 'anthropic-image',
        name: 'image-model',
        displayName: 'Image Model',
        providerId: 'anthropic',
        type: 'image',
        capabilities: ['text_to_image'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            defaultModels: {
              llm: { providerId: 'anthropic', modelId: imageModel.id },
            },
            providers: [validProvider],
            models: [SAMPLE_MODEL, imageModel],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual(
        expect.objectContaining({
          code: 'invalidDefaultModelBinding',
          path: 'default_models.llm',
        }),
      );
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Configuration file contains a default model binding',
      );
    });

    it('keeps unselected invalid providers scoped when a selected local provider and model are valid', () => {
      const localProvider: Provider = {
        id: 'ollama-local',
        name: 'ollama',
        displayName: 'Ollama Local',
        type: 'ollama',
        apiUrl: 'http://localhost:11434/api',
        enabled: true,
        connectionKind: 'local',
        protocolProfile: 'ollama',
        requiresApiKey: false,
      };
      const invalidProvider: Provider = {
        id: 'broken-gateway',
        name: 'broken',
        displayName: 'Broken Gateway',
        type: 'newapi',
        apiUrl: '',
        enabled: true,
        connectionKind: 'gateway',
        requiresApiKey: true,
      };
      const localModel: Model = {
        id: 'ollama-local-chat',
        name: 'llama3.2',
        providerId: 'ollama-local',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const brokenModel: Model = {
        id: 'broken-chat',
        name: 'broken-chat',
        providerId: 'broken-gateway',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            defaultModels: {
              llm: { providerId: localProvider.id, modelId: localModel.id },
            },
            providers: [localProvider, invalidProvider],
            models: [localModel, brokenModel],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toBeUndefined();
      expect(manager.getAssistantDefaultProvider()).toEqual(
        expect.objectContaining({
          id: 'ollama-local',
          defaultModel: 'ollama-local-chat',
        }),
      );
      expect(() => manager.assertConfigAvailable()).not.toThrow();
      expect(manager.getAssistantConfigState().modelGroups).toEqual([
        expect.objectContaining({
          source: 'explicit-config',
          providerId: 'ollama-local',
        }),
      ]);
    });
  });

  describe('helper methods', () => {
    let manager: ConfigManager;

    beforeEach(() => {
      manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({
          providers: [
            SAMPLE_PROVIDER,
            {
              ...SAMPLE_PROVIDER,
              id: 'openai',
              name: 'openai',
              displayName: 'OpenAI',
              type: 'openai',
              apiUrl: 'https://api.openai.com/api',
              enabled: false,
            },
          ],
          models: [
            SAMPLE_MODEL,
            {
              ...SAMPLE_MODEL,
              id: 'openai-gpt-4o',
              name: 'gpt-4o',
              providerId: 'openai',
              enabled: false,
            },
          ],
        }),
      });
    });

    it('should get all providers', () => {
      expect(manager.getProviders()).toHaveLength(2);
    });

    it('should get enabled providers only', () => {
      const enabled = manager.getEnabledProviders();
      expect(enabled).toHaveLength(1);
      expect(enabled[0]?.id).toBe('anthropic');
    });

    it('should get all models', () => {
      expect(manager.getModels()).toHaveLength(2);
    });

    it('should get enabled models only', () => {
      const enabled = manager.getEnabledModels();
      expect(enabled).toHaveLength(1);
      expect(enabled[0]?.id).toBe('anthropic-claude-sonnet-4');
    });

    it('should get models by provider', () => {
      const models = manager.getModelsByProvider('anthropic');
      expect(models).toHaveLength(1);
      expect(models[0]?.providerId).toBe('anthropic');
    });

    it('should return undefined for non-existent items', () => {
      expect(manager.getProvider('nonexistent')).toBeUndefined();
      expect(manager.getModel('nonexistent')).toBeUndefined();
    });
  });

  describe('retry/timeout presets', () => {
    it('should return all built-in presets', () => {
      const manager = createEmptyConfigManager();
      const config = manager.getConfig();

      expect(config.retryTimeoutPresets.size).toBe(4);
      expect(config.retryTimeoutPresets.get('modelCall')).toBeDefined();
      expect(config.retryTimeoutPresets.get('toolExecution')).toBeDefined();
      expect(config.retryTimeoutPresets.get('mcpRequest')).toBeDefined();
      expect(config.retryTimeoutPresets.get('workflowExecution')).toBeDefined();
    });

    it('should return correct preset values', () => {
      const manager = createEmptyConfigManager();
      const preset = manager.getRetryTimeoutPreset('modelCall');

      expect(preset).toEqual(RETRY_TIMEOUT_PRESETS.modelCall);
    });

    it('should return undefined for non-existent preset', () => {
      const manager = createEmptyConfigManager();
      const preset = manager.getRetryTimeoutPreset('nonexistent' as any);

      expect(preset).toBeUndefined();
    });
  });

  describe('caching', () => {
    it('should cache config and return same reference', () => {
      const manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({ providers: [SAMPLE_PROVIDER] }),
      });
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).toBe(config2);
    });

    it('should invalidate cache on write operation', async () => {
      const manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({ providers: [SAMPLE_PROVIDER] }),
      });
      const config1 = manager.getConfig();
      await manager.setProvider({ ...SAMPLE_PROVIDER, enabled: false });
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2);
      expect(config2.providers.get('anthropic')?.enabled).toBe(false);
    });
  });

  describe('disposal', () => {
    it('should dispose without error', () => {
      const manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager(),
      });
      manager.dispose();

      // After dispose, getConfig should still work (creates new cache)
      expect(manager.getConfig()).toBeDefined();
    });
  });
});
