/**
 * Platform Integration Tests — Real Config
 *
 * Tests config.ts against the real ~/.neko/config.toml.
 * Validates that loadConfig, listProviders, getProviderModels,
 * validateConfig, and createConfigManager work end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readUserConfigResult } from '@neko/shared/config/config-reader';

import {
  loadConfig,
  validateConfig,
  getApiKeyFromEnv,
  listProviders,
  getProviderModels,
  listConfiguredProviders,
  createConfigManager,
} from '../core/config';
import { DEFAULT_CLI_CONFIG } from '../core/types';

// Skip the entire suite if ~/.neko/config.toml does not exist
const configPath = path.join(os.homedir(), '.neko', 'config.toml');
const hasRealConfig = fs.existsSync(configPath);
let rawConfig: Record<string, unknown> = {};
if (hasRealConfig) {
  const result = readUserConfigResult();
  if (result.status !== 'ok') {
    throw new Error(
      result.status === 'missing'
        ? `Expected existing real config at ${configPath}`
        : result.diagnostic.message,
    );
  }
  rawConfig = result.config as Record<string, unknown>;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe.skipIf(!hasRealConfig)('config.ts — Real ~/.neko/config.toml', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    // Clean env vars that affect config — let config file be the sole source
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['AZURE_OPENAI_API_KEY'];
    delete process.env['NEKO_API_KEY'];
    delete process.env['LLM_API_KEY'];
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  // ═════════════════════════════════════════════════════════════════
  // 1. loadConfig — reads real config
  // ═════════════════════════════════════════════════════════════════

  describe('loadConfig', () => {
    it('loads provider from real config', () => {
      const config = loadConfig('/tmp/test');
      const configProviders =
        (rawConfig.providers as Array<{ id: string; enabled?: boolean }>)?.filter(
          (provider) => provider.enabled !== false,
        ) ?? [];
      const explicitDefaultProvider = rawConfig.defaultProvider as string | undefined;

      if (explicitDefaultProvider) {
        expect(config.provider).toBe(explicitDefaultProvider);
      } else {
        expect(configProviders.map((provider) => provider.id)).toContain(config.provider);
      }
    });

    it('loads model from real config', () => {
      const config = loadConfig('/tmp/test');
      // defaultModel from config or first model for the provider
      const expectedDefault = rawConfig.defaultModel as string | undefined;
      if (expectedDefault) {
        expect(config.model).toBe(expectedDefault);
      } else {
        expect(config.model).toBeTruthy();
      }
    });

    it('loads API key from real config', () => {
      const config = loadConfig('/tmp/test');
      if (config.providerRequiresApiKey) {
        expect(config.apiKey).toBeTruthy();
      } else {
        expect(config.apiKey).toBeUndefined();
      }
    });

    it('applies CLI arg overrides over config', () => {
      const config = loadConfig('/tmp/test', {
        maxTokens: 4096,
        temperature: 0.1,
        verbose: true,
      });

      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.1);
      expect(config.verbose).toBe(true);
    });

    it('detects reasoning models in config', () => {
      const cm = createConfigManager();
      try {
        const models = cm.getEnabledModels();
        const reasoningModels = models.filter((m) => m.capabilities?.includes('reasoning'));

        console.log(
          'Reasoning models:',
          reasoningModels.map((m) => m.id),
        );

        // If config has reasoning models, they should be detected
        const configModels = (rawConfig.models as Array<{ capabilities?: string[] }>) ?? [];
        const expectedReasoningCount = configModels.filter((m) =>
          m.capabilities?.includes('reasoning'),
        ).length;

        expect(reasoningModels.length).toBe(expectedReasoningCount);
      } finally {
        cm.dispose();
      }
    });

    it('reads scalar fields from config', () => {
      const config = loadConfig('/tmp/test');
      // maxTokens and temperature come from config or defaults
      expect(config.maxTokens).toBeGreaterThan(0);
      expect(config.temperature).toBeGreaterThanOrEqual(0);
      expect(config.temperature).toBeLessThanOrEqual(2);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // 2. getApiKeyFromEnv
  // ═════════════════════════════════════════════════════════════════

  describe('getApiKeyFromEnv', () => {
    it('returns provider-specific env var', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
      expect(getApiKeyFromEnv('anthropic')).toBe('sk-ant-test');
    });

    it('returns undefined when no env var set', () => {
      expect(getApiKeyFromEnv('anthropic')).toBeUndefined();
    });

    it('falls back to NEKO_API_KEY', () => {
      process.env['NEKO_API_KEY'] = 'neko-generic';
      expect(getApiKeyFromEnv('unknown-provider')).toBe('neko-generic');
    });

    it('falls back to LLM_API_KEY', () => {
      process.env['LLM_API_KEY'] = 'llm-generic';
      expect(getApiKeyFromEnv('unknown-provider')).toBe('llm-generic');
    });

    it('prefers provider-specific over generic', () => {
      process.env['OPENAI_API_KEY'] = 'sk-specific';
      process.env['NEKO_API_KEY'] = 'neko-generic';
      expect(getApiKeyFromEnv('openai')).toBe('sk-specific');
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // 3. validateConfig
  // ═════════════════════════════════════════════════════════════════

  describe('validateConfig', () => {
    it('passes for real config with API key', () => {
      const config = loadConfig('/tmp/test');
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('fails when apiKey is missing', () => {
      const config = { ...DEFAULT_CLI_CONFIG, providerRequiresApiKey: true, apiKey: undefined };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]).toEqual({
        code: 'missing-api-key',
        providerId: config.provider,
      });
    });

    it('allows local providers without an API key', () => {
      const config = {
        ...DEFAULT_CLI_CONFIG,
        provider: 'ollama-local',
        providerType: 'ollama',
        providerRequiresApiKey: false,
        apiKey: undefined,
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('fails for invalid temperature', () => {
      const config = { ...DEFAULT_CLI_CONFIG, apiKey: 'k', temperature: 3 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]).toEqual({ code: 'invalid-temperature', value: 3 });
    });

    it('fails for invalid maxTokens', () => {
      const config = { ...DEFAULT_CLI_CONFIG, apiKey: 'k', maxTokens: -1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]).toEqual({ code: 'invalid-max-tokens', value: -1 });
    });

    it('fails for invalid outputFormat', () => {
      const config = {
        ...DEFAULT_CLI_CONFIG,
        apiKey: 'k',
        outputFormat: 'xml' as 'text',
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]).toEqual({ code: 'invalid-output-format', value: 'xml' });
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // 4. listProviders / getProviderModels
  // ═════════════════════════════════════════════════════════════════

  describe('listProviders', () => {
    it('returns providers from real config', () => {
      const providers = listProviders();
      const configProviders =
        (rawConfig.providers as Array<{ id: string; enabled?: boolean }>)?.filter(
          (provider) => provider.enabled !== false,
        ) ?? [];

      expect(providers.length).toBeGreaterThanOrEqual(configProviders.length);

      // Each provider should have required fields
      for (const p of providers) {
        expect(p.id).toBeTruthy();
        expect(p.type).toBeTruthy();
        expect(Array.isArray(p.models)).toBe(true);
      }

      console.log(
        'Providers:',
        providers.map(
          (p) => `${p.id} (${p.type}, ${p.models.length} models, apiKey: ${p.hasApiKey})`,
        ),
      );
    });
  });

  describe('getProviderModels', () => {
    it('returns models for configured provider', () => {
      const configProviders = (rawConfig.providers as Array<{ id: string }>) ?? [];
      if (configProviders.length === 0) return;

      const providerId = configProviders[0]!.id;
      const models = getProviderModels(providerId);
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      console.log(`Models for ${providerId}:`, models);
    });

    it('returns empty array for unknown provider', () => {
      expect(getProviderModels('nonexistent-provider-xyz')).toEqual([]);
    });
  });

  describe('listConfiguredProviders', () => {
    it('returns provider IDs', () => {
      const ids = listConfiguredProviders();
      expect(ids.length).toBeGreaterThan(0);

      // Should include providers from config
      const configProviders = (rawConfig.providers as Array<{ id: string }>) ?? [];
      for (const cp of configProviders) {
        expect(ids).toContain(cp.id);
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════
  // 5. createConfigManager
  // ═════════════════════════════════════════════════════════════════

  describe('createConfigManager', () => {
    it('creates a working ConfigManager', () => {
      const cm = createConfigManager();
      try {
        expect(cm).toBeDefined();
        expect(cm.getEnabledProviders().length).toBeGreaterThan(0);
        expect(cm.getEnabledModels().length).toBeGreaterThan(0);
      } finally {
        cm.dispose();
      }
    });

    it('models have correct capability types', () => {
      const cm = createConfigManager();
      try {
        const models = cm.getEnabledModels();
        for (const model of models) {
          expect(Array.isArray(model.capabilities)).toBe(true);
          // Each capability should be a string
          for (const cap of model.capabilities ?? []) {
            expect(typeof cap).toBe('string');
          }
        }
      } finally {
        cm.dispose();
      }
    });
  });
});
