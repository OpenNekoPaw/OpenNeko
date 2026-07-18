/**
 * ConfigManager Unit Tests
 *
 * Tests two-layer merge (User + Workspace) with no builtin presets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../config-manager';
import type { IUserConfigManager, UserConfig } from '../user-config';
import type { Provider, Model } from '../../types/provider';
import type { MCPServerPreset } from '../../types/config';
import type { UnifiedConfig } from '@neko/shared';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';
import { RETRY_TIMEOUT_PRESETS } from '../retry-timeout-presets';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockUserConfigManager(
  initial?: Partial<UserConfig>,
  rawScalars: Omit<
    UnifiedConfig,
    | 'providers'
    | 'models'
    | 'mcpServers'
    | 'providerOverrides'
    | 'modelOverrides'
    | 'mcpServerOverrides'
  > = {},
): IUserConfigManager {
  let config: UserConfig = {
    providers: [],
    models: [],
    mcpServers: [],
    providerOverrides: {},
    modelOverrides: {},
    mcpServerOverrides: {},
    ...initial,
  };

  return {
    load: () => ({
      ...config,
      providers: [...config.providers],
      models: [...config.models],
      mcpServers: [...config.mcpServers],
    }),
    save: async (c: UserConfig) => {
      config = { ...c };
    },
    updateProviderOverride: async (id, override) => {
      config.providerOverrides[id] = { ...config.providerOverrides[id], ...override };
    },
    addProvider: async (p: Provider) => {
      const i = config.providers.findIndex((x) => x.id === p.id);
      if (i >= 0) config.providers[i] = p;
      else config.providers.push(p);
    },
    removeProvider: async (id: string) => {
      config.providers = config.providers.filter((p) => p.id !== id);
      delete config.providerOverrides[id];
    },
    addModel: async (m: Model) => {
      const i = config.models.findIndex((x) => x.id === m.id);
      if (i >= 0) config.models[i] = m;
      else config.models.push(m);
    },
    removeModel: async (id: string) => {
      config.models = config.models.filter((m) => m.id !== id);
      delete config.modelOverrides[id];
    },
    updateMCPServerOverride: async (id, override) => {
      config.mcpServerOverrides[id] = { ...config.mcpServerOverrides[id], ...override };
    },
    addMCPServer: async (s: MCPServerPreset) => {
      const i = config.mcpServers.findIndex((x) => x.id === s.id);
      if (i >= 0) config.mcpServers[i] = s;
      else config.mcpServers.push(s);
    },
    removeMCPServer: async (id: string) => {
      config.mcpServers = config.mcpServers.filter((s) => s.id !== id);
      delete config.mcpServerOverrides[id];
    },
    clear: async () => {
      config = {
        providers: [],
        models: [],
        mcpServers: [],
        providerOverrides: {},
        modelOverrides: {},
        mcpServerOverrides: {},
      };
    },
    loadRaw: () => ({
      ...rawScalars,
      providers: config.providers,
      models: config.models,
      mcpServers: config.mcpServers,
      providerOverrides: config.providerOverrides,
      modelOverrides: config.modelOverrides,
      mcpServerOverrides: config.mcpServerOverrides,
    }),
    loadRawResult: () => ({
      status: 'ok',
      filePath: '<test-config>',
      config: {
        ...rawScalars,
        providers: config.providers,
        models: config.models,
        mcpServers: config.mcpServers,
        providerOverrides: config.providerOverrides,
        modelOverrides: config.modelOverrides,
        mcpServerOverrides: config.mcpServerOverrides,
      } satisfies UnifiedConfig,
    }),
    updateScalar: async () => {},
    updateScalars: async () => {},
    reload: () => {},
  };
}

function createEmptyConfigManager(): ConfigManager {
  return new ConfigManager({ userConfigManager: createMockUserConfigManager() });
}

function createReadResultUserConfigManager(
  result: ConfigReadResult | (() => ConfigReadResult),
): IUserConfigManager {
  const readResult = () => (typeof result === 'function' ? result() : result);
  return {
    load: () => {
      throw new Error('legacy load fallback should not be used');
    },
    loadRaw: () => {
      throw new Error('legacy raw fallback should not be used');
    },
    loadRawResult: readResult,
    save: async () => {
      throw new Error('write path should not be used');
    },
    updateProviderOverride: async () => {
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
    updateMCPServerOverride: async () => {
      throw new Error('write path should not be used');
    },
    addMCPServer: async () => {
      throw new Error('write path should not be used');
    },
    removeMCPServer: async () => {
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
      expect(config.mcpServers.size).toBe(0);
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

    it('should apply provider overrides', () => {
      const ucm = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
        providerOverrides: { anthropic: { apiKey: 'sk-test-123' } },
      });
      const manager = new ConfigManager({ userConfigManager: ucm });
      const provider = manager.getProvider('anthropic');

      expect(provider?.apiKey).toBe('sk-test-123');
    });

    it('should apply model overrides', () => {
      const ucm = createMockUserConfigManager({
        models: [SAMPLE_MODEL],
        modelOverrides: { 'anthropic-claude-sonnet-4': { enabled: false } },
      });
      const manager = new ConfigManager({ userConfigManager: ucm });
      const model = manager.getModel('anthropic-claude-sonnet-4');

      expect(model?.enabled).toBe(false);
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

    it('should set provider API key', async () => {
      await manager.setProviderApiKey('anthropic', 'sk-new-key');
      const provider = manager.getProvider('anthropic');
      expect(provider?.apiKey).toBe('sk-new-key');
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

    it('should import provider credentials from unified config files with later configs winning', async () => {
      const result = await manager.importProviderCredentialsFromUnifiedConfigs([
        {
          providers: [
            {
              ...SAMPLE_PROVIDER,
              apiKey: 'sk-user',
            },
            {
              id: 'openai',
              name: 'openai',
              displayName: 'OpenAI',
              type: 'openai',
              apiUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-openai',
              enabled: true,
            },
          ],
        },
        {
          providers: [
            {
              ...SAMPLE_PROVIDER,
              apiKey: 'sk-workspace',
            },
          ],
        },
      ]);

      expect(manager.getProvider('anthropic')?.apiKey).toBe('sk-workspace');
      expect(manager.getProvider('openai')?.apiKey).toBe('sk-openai');
      expect(result.imported.map((item) => item.id)).toEqual(['anthropic', 'openai']);
      expect(result.failed).toEqual([]);
    });

    it('should project provider credentials in memory without writing config files', async () => {
      const ucm = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
      });
      ucm.updateProviderOverride = async () => {
        throw new Error('write path should not be used');
      };
      ucm.addProvider = async () => {
        throw new Error('write path should not be used');
      };
      const failingManager = new ConfigManager({ userConfigManager: ucm });

      const result = await failingManager.importProviderCredentialsFromUnifiedConfigs([
        {
          providers: [
            { ...SAMPLE_PROVIDER, apiKey: 'sk-user' },
            {
              id: 'openai',
              name: 'openai',
              displayName: 'OpenAI',
              type: 'openai',
              apiUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-openai',
              enabled: true,
            },
          ],
        },
      ]);

      expect(result.imported.map((item) => item.id)).toEqual(['anthropic', 'openai']);
      expect(result.failed).toEqual([]);
      expect(failingManager.getProvider('anthropic')?.apiKey).toBe('sk-user');
      expect(failingManager.getProvider('openai')?.apiKey).toBe('sk-openai');
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

    it('surfaces unsupported provider protocol profile diagnostics', () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'unsupportedProviderProtocolProfile',
          filePath: '/tmp/neko/config.toml',
          diagnostic: {
            code: 'unsupportedProviderProtocolProfile',
            filePath: '/tmp/neko/config.toml',
            message: 'unsupported protocol_profile detail',
            detail: 'Unsupported provider protocol_profile "deepseek"',
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'unsupportedProviderProtocolProfile',
        filePath: '/tmp/neko/config.toml',
        message:
          'Configuration file contains an unsupported provider protocol_profile: /tmp/neko/config.toml. Use newapi, openai-chat, openai-responses, anthropic, google, or ollama, then open a new Agent session or tab.',
      });
      expect(manager.getConfig().providers.size).toBe(0);
      expect(() => manager.assertConfigAvailable()).toThrow(
        'unsupported provider protocol_profile',
      );
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
          'Agent configuration file is missing: /tmp/neko/config.toml. Create the config file with at least one enabled provider, chat model, and required provider credentials, then open a new Agent session or tab.',
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
          'Agent configuration has no enabled providers: /tmp/neko/config.toml. Add at least one enabled provider with its required endpoint and credentials, then open a new Agent session or tab.',
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

    it('reports missing API keys for enabled chat models before model resolution', () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [SAMPLE_PROVIDER],
            models: [SAMPLE_MODEL],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'missingApiKey',
        filePath: '/tmp/neko/config.toml',
        message:
          'Agent configuration has no configured enabled chat provider: /tmp/neko/config.toml. Add the required provider endpoint and credentials, then open a new Agent session or tab.',
      });
      expect(manager.getAssistantSettingsData().selectedProviderId).toBeNull();
      expect(manager.getAssistantSettingsData().selectedModelId).toBeNull();
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Agent configuration has no configured enabled chat provider',
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

    it('lets valid type default llm binding supersede invalid legacy chat scalars', () => {
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
            defaultProvider: 'missing-provider',
            defaultModel: 'missing-model',
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
      expect(() => manager.assertConfigAvailable()).not.toThrow();
      expect(manager.getAssistantSettingsData()).toEqual(
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

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'invalidDefaultModelBinding',
        filePath: '/tmp/neko/config.toml',
        message:
          'Configuration file contains a default model binding that references an unavailable provider/model or mismatched capability: /tmp/neko/config.toml. Fix the default binding, then open a new Agent session or tab.',
      });
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Configuration file contains a default model binding',
      );
    });

    it('resolves purpose-specific model bindings before capability fallback', () => {
      const googleProvider: Provider = {
        id: 'google',
        name: 'google',
        displayName: 'Google Gemini',
        type: 'google',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        enabled: true,
        connectionKind: 'direct',
        protocolProfile: 'google',
        requiresApiKey: true,
        apiKey: 'test-key',
      };
      const fastModel: Model = {
        id: 'gemini-flash',
        name: 'gemini-2.5-flash',
        providerId: 'google',
        type: 'llm',
        capabilities: ['chat', 'vision', 'vision_video'],
        enabled: true,
      };
      const proModel: Model = {
        ...fastModel,
        id: 'gemini-pro',
        name: 'gemini-2.5-pro',
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [googleProvider],
            models: [fastModel, proModel],
            defaultModelPurposes: {
              'video.understand': {
                providerId: 'google',
                modelId: 'gemini-pro',
              },
            },
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toBeUndefined();
      expect(manager.getDefaultModelPurposeRef('video.understand')).toEqual({
        providerId: 'google',
        modelId: 'gemini-pro',
      });
      expect(manager.resolveModelRefForPurpose('video.understand')).toEqual({
        providerId: 'google',
        modelId: 'gemini-pro',
      });
    });

    it('projects media understanding model routing for frontend confirmation', () => {
      const googleProvider: Provider = {
        id: 'google',
        name: 'google',
        displayName: 'Google Gemini',
        type: 'google',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        enabled: true,
        connectionKind: 'direct',
        protocolProfile: 'google',
        requiresApiKey: true,
        apiKey: 'test-key',
      };
      const flashModel: Model = {
        id: 'gemini-flash',
        name: 'gemini-2.5-flash',
        displayName: 'Gemini Flash',
        providerId: 'google',
        type: 'llm',
        capabilities: [
          'chat',
          'vision',
          'image.understand',
          'audio.understand',
          'video.understand',
        ],
        enabled: true,
      };
      const proModel: Model = {
        ...flashModel,
        id: 'gemini-pro',
        name: 'gemini-2.5-pro',
        displayName: 'Gemini Pro',
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [googleProvider],
            models: [flashModel, proModel],
            defaultModelPurposes: {
              'video.understand': {
                providerId: 'google',
                modelId: 'gemini-pro',
              },
            },
          },
        }),
      });

      expect(manager.getAssistantSettingsData().mediaUnderstandingModels).toEqual({
        image: {
          category: 'image',
          purpose: 'image.understand',
          status: 'missing',
        },
        audio: {
          category: 'audio',
          purpose: 'audio.understand',
          status: 'missing',
        },
        video: {
          category: 'video',
          purpose: 'video.understand',
          status: 'configured',
          providerId: 'google',
          modelId: 'gemini-pro',
          optionId: 'google:gemini-pro',
          label: 'Google Gemini / Gemini Pro',
          providerLabel: 'Google Gemini',
          source: 'explicit-config',
        },
      });
      expect(manager.getAssistantConfigState().mediaUnderstandingModels?.video.status).toBe(
        'configured',
      );
    });

    it('projects missing media understanding models when no enabled model supports the purpose', () => {
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
        id: 'llama-text',
        name: 'llama3.2',
        displayName: 'Llama Text',
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
          },
        }),
      });

      expect(manager.getAssistantSettingsData().mediaUnderstandingModels).toEqual({
        image: { category: 'image', purpose: 'image.understand', status: 'missing' },
        audio: { category: 'audio', purpose: 'audio.understand', status: 'missing' },
        video: { category: 'video', purpose: 'video.understand', status: 'missing' },
      });
    });

    it('does not infer a purpose binding from the first compatible model', () => {
      const googleProvider: Provider = {
        id: 'google',
        name: 'google',
        displayName: 'Google Gemini',
        type: 'google',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        enabled: true,
        connectionKind: 'direct',
        protocolProfile: 'google',
        requiresApiKey: true,
        apiKey: 'test-key',
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [googleProvider],
            models: [
              {
                id: 'text-only',
                name: 'gemini-text',
                providerId: 'google',
                type: 'llm',
                capabilities: ['chat'],
                enabled: true,
              },
              {
                id: 'gemini-flash',
                name: 'gemini-2.5-flash',
                providerId: 'google',
                type: 'llm',
                capabilities: ['chat', 'vision', 'vision_video'],
                enabled: true,
              },
            ],
          },
        }),
      });

      expect(manager.resolveModelRefForPurpose('video.understand')).toBeUndefined();
    });

    it('clears availability diagnostics after runtime credential projection', async () => {
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [SAMPLE_PROVIDER],
            models: [SAMPLE_MODEL],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()?.code).toBe('missingApiKey');

      await manager.importProviderCredentialsFromUnifiedConfigs([
        {
          providers: [{ ...SAMPLE_PROVIDER, apiKey: 'sk-runtime' }],
        },
      ]);

      expect(manager.getConfigDiagnostic()).toBeUndefined();
      expect(manager.getAssistantDefaultProvider()).toEqual(
        expect.objectContaining({
          id: 'anthropic',
          defaultModel: 'anthropic-claude-sonnet-4',
          modelIds: ['anthropic-claude-sonnet-4'],
        }),
      );
      expect(manager.getAssistantSettingsData()).toEqual(
        expect.objectContaining({
          selectedProviderId: null,
          selectedModelId: null,
        }),
      );
      expect(() => manager.assertConfigAvailable()).not.toThrow();
    });

    it('refreshes only through explicit reloadConfig snapshots', () => {
      let current: ConfigReadResult = {
        status: 'ok',
        filePath: '<test-config>',
        config: { providers: [SAMPLE_PROVIDER], models: [SAMPLE_MODEL] },
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

    it('drops runtime provider/model selection on config reload so file defaults route agent turns', async () => {
      const deepseekProvider: Provider = {
        id: 'deepseek-chat',
        name: 'deepseek',
        displayName: 'DeepSeek',
        type: 'generic',
        apiUrl: 'https://api.deepseek.com/v1',
        enabled: true,
        connectionKind: 'direct',
        protocolProfile: 'openai-chat',
        requiresApiKey: false,
      };
      const deepseekModel: Model = {
        id: 'deepseek-v4-pro',
        name: 'deepseek-chat',
        displayName: 'DeepSeek V4 Pro',
        providerId: 'deepseek-chat',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [deepseekProvider],
            models: [deepseekModel],
            defaultModels: {
              llm: {
                providerId: 'deepseek-chat',
                modelId: 'deepseek-v4-pro',
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
          selectedProviderId: 'nekoapi-chat',
          selectedModelId: 'gateway-chat',
          executionMode: 'auto',
        }),
      );

      manager.reloadConfig();

      expect(manager.getAssistantRuntimeSettingsSnapshot()).toEqual(
        expect.objectContaining({
          selectedProviderId: 'deepseek-chat',
          selectedModelId: 'deepseek-v4-pro',
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
        apiUrl: 'https://api.deepseek.com/v1',
        enabled: true,
        connectionKind: 'direct',
        protocolProfile: 'openai-chat',
        requiresApiKey: false,
      };
      const deepseekModel: Model = {
        id: 'deepseek-v4-pro',
        name: 'deepseek-chat',
        displayName: 'DeepSeek V4 Pro',
        providerId: 'deepseek-chat',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            providers: [deepseekProvider],
            models: [deepseekModel],
            defaultModels: {
              llm: {
                providerId: 'deepseek-chat',
                modelId: 'deepseek-v4-pro',
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
          selectedModelId: 'deepseek-v4-pro',
        }),
      );
    });

    it('blocks conversation when selected default provider is unavailable', () => {
      const validProvider: Provider = {
        ...SAMPLE_PROVIDER,
        apiKey: 'sk-valid',
      };
      const manager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/tmp/neko/config.toml',
          config: {
            defaultProvider: 'missing-provider',
            defaultModel: SAMPLE_MODEL.id,
            providers: [validProvider],
            models: [SAMPLE_MODEL],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'invalidDefaultProvider',
        filePath: '/tmp/neko/config.toml',
        message:
          'Agent configuration selects an unavailable default provider: /tmp/neko/config.toml. Fix default_provider, then open a new Agent session or tab.',
      });
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Agent configuration selects an unavailable default provider',
      );
    });

    it('blocks conversation when selected default model is not a chat model for the selected provider', () => {
      const validProvider: Provider = {
        ...SAMPLE_PROVIDER,
        apiKey: 'sk-valid',
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
            defaultProvider: 'anthropic',
            defaultModel: imageModel.id,
            providers: [validProvider],
            models: [SAMPLE_MODEL, imageModel],
          },
        }),
      });

      expect(manager.getConfigDiagnostic()).toEqual({
        code: 'invalidDefaultModel',
        filePath: '/tmp/neko/config.toml',
        message:
          'Agent configuration selects an unavailable default chat model: /tmp/neko/config.toml. Fix default_model, then open a new Agent session or tab.',
      });
      expect(() => manager.assertConfigAvailable()).toThrow(
        'Agent configuration selects an unavailable default chat model',
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
            defaultProvider: localProvider.id,
            defaultModel: localModel.id,
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
              apiUrl: 'https://api.openai.com/v1',
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
      await manager.setProviderApiKey('anthropic', 'new-key');
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2);
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
