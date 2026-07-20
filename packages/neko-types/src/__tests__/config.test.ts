/**
 * Configuration Module Tests
 *
 * Tests for the unified configuration format shared between
 * agent-cli and platform packages.
 */

import { describe, it, expect } from 'vitest';
import {
  mergeConfigs,
  normalizeConfig,
  processConfig,
  type UnifiedConfig,
} from '../config/config-normalizer';
import { DEFAULT_CONFIG, CONFIG_DIR_NAME, CONFIG_FILE_NAME } from '../config/types';

// =============================================================================
// Config Merging Tests
// =============================================================================

describe('mergeConfigs', () => {
  it('should merge scalar fields with override taking precedence', () => {
    const base: UnifiedConfig = {
      defaultProvider: 'anthropic',
      maxTokens: 4096,
      temperature: 0.5,
    };

    const override: UnifiedConfig = {
      maxTokens: 8192,
      verbose: true,
    };

    const merged = mergeConfigs(base, override);

    expect(merged.defaultProvider).toBe('anthropic');
    expect(merged.maxTokens).toBe(8192);
    expect(merged.temperature).toBe(0.5);
    expect(merged.verbose).toBe(true);
  });

  it('should merge providers arrays by ID', () => {
    const base: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
    };

    const override: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic Updated',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          apiKey: 'sk-ant-xxx',
          enabled: true,
        },
        {
          id: 'openai',
          name: 'openai',
          displayName: 'OpenAI',
          type: 'openai',
          apiUrl: 'https://api.openai.com/v1',
          enabled: true,
        },
      ],
    };

    const merged = mergeConfigs(base, override);

    expect(merged.providers).toHaveLength(2);

    const anthropic = merged.providers?.find((p) => p.id === 'anthropic');
    expect(anthropic?.displayName).toBe('Anthropic Updated');
    expect(anthropic?.apiKey).toBe('sk-ant-xxx');

    const openai = merged.providers?.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
  });

  it('should merge override objects', () => {
    const base: UnifiedConfig = {
      providerOverrides: {
        anthropic: { apiKey: 'old-key' },
      },
    };

    const override: UnifiedConfig = {
      providerOverrides: {
        anthropic: { enabled: false },
        openai: { apiKey: 'openai-key' },
      },
    };

    const merged = mergeConfigs(base, override);

    expect(merged.providerOverrides?.anthropic?.apiKey).toBe('old-key');
    expect(merged.providerOverrides?.anthropic?.enabled).toBe(false);
    expect(merged.providerOverrides?.openai?.apiKey).toBe('openai-key');
  });
});

// =============================================================================
// Config Normalization Tests
// =============================================================================

describe('normalizeConfig', () => {
  it('should apply default values for missing fields', () => {
    const config: UnifiedConfig = {};

    const normalized = normalizeConfig(config);

    expect(normalized.defaultProvider).toBe(DEFAULT_CONFIG.defaultProvider);
    expect(normalized.defaultModel).toBe(DEFAULT_CONFIG.defaultModel);
    expect(normalized.maxTokens).toBe(DEFAULT_CONFIG.maxTokens);
    expect(normalized.temperature).toBe(DEFAULT_CONFIG.temperature);
    expect(normalized.verbose).toBe(DEFAULT_CONFIG.verbose);
    expect(normalized.outputFormat).toBe(DEFAULT_CONFIG.outputFormat);
  });

  it('should convert arrays to Maps', () => {
    const config: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
      models: [
        {
          id: 'claude-sonnet-4',
          name: 'claude-sonnet-4-20250514',
          providerId: 'anthropic',
          capabilities: ['chat'],
          enabled: true,
        },
      ],
    };

    const normalized = normalizeConfig(config);

    expect(normalized.providers instanceof Map).toBe(true);
    expect(normalized.providers.size).toBe(1);
    expect(normalized.providers.get('anthropic')?.displayName).toBe('Anthropic');

    expect(normalized.models instanceof Map).toBe(true);
    expect(normalized.models.size).toBe(1);
    expect(normalized.models.get('claude-sonnet-4')?.name).toBe('claude-sonnet-4-20250514');
  });

  it('should apply overrides to items', () => {
    const config: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
      providerOverrides: {
        anthropic: {
          apiKey: 'sk-ant-xxx',
          enabled: false,
        },
      },
    };

    const normalized = normalizeConfig(config);

    const anthropic = normalized.providers.get('anthropic');
    expect(anthropic?.apiKey).toBe('sk-ant-xxx');
    expect(anthropic?.enabled).toBe(false);
  });
});

// =============================================================================
// Full Pipeline Tests
// =============================================================================

describe('processConfig', () => {
  it('should process null configs', () => {
    const normalized = processConfig(null, null);

    expect(normalized.defaultProvider).toBe(DEFAULT_CONFIG.defaultProvider);
    expect(normalized.providers.size).toBe(0);
  });

  it('should merge user and workspace configs with workspace taking precedence', () => {
    const userConfig: UnifiedConfig = {
      defaultProvider: 'anthropic',
      maxTokens: 4096,
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          apiKey: 'user-key',
          enabled: true,
        },
      ],
    };

    const workspaceConfig: UnifiedConfig = {
      maxTokens: 8192,
      providerOverrides: {
        anthropic: {
          apiKey: 'workspace-key',
        },
      },
    };

    const normalized = processConfig(userConfig, workspaceConfig);

    expect(normalized.defaultProvider).toBe('anthropic');
    expect(normalized.maxTokens).toBe(8192);

    const anthropic = normalized.providers.get('anthropic');
    expect(anthropic?.apiKey).toBe('workspace-key');
  });

  it('should merge canonical provider and model selections before normalizing', () => {
    const userConfig: UnifiedConfig = {
      defaultProvider: 'openai',
      providers: [
        {
          id: 'openai',
          name: 'openai',
          displayName: 'OpenAI',
          type: 'openai',
          apiUrl: 'https://api.openai.com/v1',
          apiKey: 'user-api-key',
          enabled: true,
        },
      ],
    };

    const workspaceConfig: UnifiedConfig = {
      defaultModel: 'gpt-4o',
      models: [
        {
          id: 'gpt-4o',
          name: 'gpt-4o',
          providerId: 'openai',
          capabilities: ['chat'],
          enabled: true,
        },
      ],
    };

    const normalized = processConfig(userConfig, workspaceConfig);

    expect(normalized.defaultProvider).toBe('openai');
    expect(normalized.defaultModel).toBe('gpt-4o');
    expect(normalized.providers.get('openai')?.apiKey).toBe('user-api-key');
    expect(normalized.models.get('gpt-4o')?.providerId).toBe('openai');
  });
});

// =============================================================================
// Auth & Credentials Merge Tests
// =============================================================================

describe('mergeConfigs — auth & credentials', () => {
  it('should merge auth config field-by-field', () => {
    const base: UnifiedConfig = {
      auth: {
        clientId: 'neko',
        authUrl: 'https://auth.example.com/authorize',
      },
    };

    const override: UnifiedConfig = {
      auth: {
        tokenUrl: 'https://auth.example.com/token',
        redirectPort: 7000,
      },
    };

    const merged = mergeConfigs(base, override);

    expect(merged.auth?.clientId).toBe('neko');
    expect(merged.auth?.authUrl).toBe('https://auth.example.com/authorize');
    expect(merged.auth?.tokenUrl).toBe('https://auth.example.com/token');
    expect(merged.auth?.redirectPort).toBe(7000);
  });

  it('should override auth fields when workspace provides them', () => {
    const base: UnifiedConfig = {
      auth: {
        clientId: 'neko-user',
        authUrl: 'https://user.example.com/authorize',
      },
    };

    const override: UnifiedConfig = {
      auth: {
        clientId: 'neko-workspace',
      },
    };

    const merged = mergeConfigs(base, override);

    expect(merged.auth?.clientId).toBe('neko-workspace');
    expect(merged.auth?.authUrl).toBe('https://user.example.com/authorize');
  });

  it('should deep-merge credentials.apiKeys', () => {
    const base: UnifiedConfig = {
      credentials: {
        apiKeys: {
          anthropic: 'sk-ant-user',
          openai: 'sk-openai-user',
        },
      },
    };

    const override: UnifiedConfig = {
      credentials: {
        apiKeys: {
          anthropic: 'sk-ant-workspace',
          google: 'google-key',
        },
      },
    };

    const merged = mergeConfigs(base, override);

    expect(merged.credentials?.apiKeys?.anthropic).toBe('sk-ant-workspace');
    expect(merged.credentials?.apiKeys?.openai).toBe('sk-openai-user');
    expect(merged.credentials?.apiKeys?.google).toBe('google-key');
  });

  it('should merge market config', () => {
    const base: UnifiedConfig = {
      market: {
        registryUrl: 'https://market.example.com/api/v1',
      },
    };

    const override: UnifiedConfig = {};

    const merged = mergeConfigs(base, override);

    expect(merged.market?.registryUrl).toBe('https://market.example.com/api/v1');
  });

  it('should handle missing auth/credentials gracefully', () => {
    const merged = mergeConfigs({}, {});

    expect(merged.auth).toBeUndefined();
    expect(merged.credentials).toBeUndefined();
    expect(merged.market).toBeUndefined();
  });
});

// =============================================================================
// Credential Resolver Tests
// =============================================================================

import { resolveApiKey, getEnvKeyName, getEnvKeyMap } from '../config/credential-resolver';

describe('resolveApiKey', () => {
  it('should return env var as highest priority', () => {
    const config: UnifiedConfig = {
      credentials: { apiKeys: { anthropic: 'cred-key' } },
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: '',
          apiKey: 'provider-key',
          enabled: true,
        },
      ],
    };

    const envGetter = (key: string) => (key === 'ANTHROPIC_API_KEY' ? 'env-key' : undefined);

    expect(resolveApiKey('anthropic', config, envGetter)).toBe('env-key');
  });

  it('should fall back to credentials.apiKeys', () => {
    const config: UnifiedConfig = {
      credentials: { apiKeys: { anthropic: 'cred-key' } },
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: '',
          apiKey: 'provider-key',
          enabled: true,
        },
      ],
    };

    expect(resolveApiKey('anthropic', config)).toBe('cred-key');
  });

  it('should fall back to providers[].apiKey', () => {
    const config: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: '',
          apiKey: 'provider-key',
          enabled: true,
        },
      ],
    };

    expect(resolveApiKey('anthropic', config)).toBe('provider-key');
  });

  it('should use generic fallback env vars', () => {
    const envGetter = (key: string) => (key === 'NEKO_API_KEY' ? 'neko-key' : undefined);

    expect(resolveApiKey('unknown-provider', {}, envGetter)).toBe('neko-key');
  });

  it('should return null when nothing is configured', () => {
    expect(resolveApiKey('anthropic', {})).toBeNull();
  });
});

describe('getEnvKeyName', () => {
  it('should return known provider env var name', () => {
    expect(getEnvKeyName('neko-gateway')).toBe('NEKO_GATEWAY_API_KEY');
    expect(getEnvKeyName('custom-newapi')).toBe('NEWAPI_API_KEY');
    expect(getEnvKeyName('anthropic')).toBe('ANTHROPIC_API_KEY');
    expect(getEnvKeyName('openai')).toBe('OPENAI_API_KEY');
  });

  it('should return undefined for unknown provider', () => {
    expect(getEnvKeyName('unknown')).toBeUndefined();
  });
});

describe('getEnvKeyMap', () => {
  it('should return all known mappings', () => {
    const map = getEnvKeyMap();
    expect(map['neko-gateway']).toBe('NEKO_GATEWAY_API_KEY');
    expect(map['custom-newapi']).toBe('NEWAPI_API_KEY');
    expect(map.anthropic).toBe('ANTHROPIC_API_KEY');
    expect(map.openai).toBe('OPENAI_API_KEY');
    expect(map.google).toBe('GOOGLE_API_KEY');
    expect(map.deepseek).toBe('DEEPSEEK_API_KEY');
    expect(map.azure).toBe('AZURE_OPENAI_API_KEY');
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('config constants', () => {
  it('should have correct config directory name', () => {
    expect(CONFIG_DIR_NAME).toBe('.neko');
  });

  it('should have correct config file name', () => {
    expect(CONFIG_FILE_NAME).toBe('config.toml');
  });

  it('should have sensible default values', () => {
    expect(DEFAULT_CONFIG.defaultProvider).toBe('ollama-local');
    expect(DEFAULT_CONFIG.maxTokens).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.temperature).toBeLessThanOrEqual(2);
  });
});
