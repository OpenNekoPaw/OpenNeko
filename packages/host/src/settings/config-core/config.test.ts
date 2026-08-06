/**
 * Configuration Module Tests
 *
 * Tests for the unified configuration format shared between
 * agent-cli and platform packages.
 */

import { describe, it, expect } from 'vitest';
import { mergeConfigs, normalizeConfig, processConfig } from './config-normalizer';
import { DEFAULT_CONFIG, CONFIG_DIR_NAME, CONFIG_FILE_NAME, type UnifiedConfig } from './types';

// =============================================================================
// Config Merging Tests
// =============================================================================

describe('mergeConfigs', () => {
  it('should merge scalar fields with override taking precedence', () => {
    const base: UnifiedConfig = {
      maxTokens: 4096,
      temperature: 0.5,
    };

    const override: UnifiedConfig = {
      maxTokens: 8192,
      verbose: true,
    };

    const merged = mergeConfigs(base, override);

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
          supportLevel: 'verified',
          enabled: true,
        },
        {
          id: 'openai',
          name: 'openai',
          displayName: 'OpenAI',
          type: 'openai',
          apiUrl: 'https://api.openai.com/api',
          enabled: true,
        },
      ],
    };

    const merged = mergeConfigs(base, override);

    expect(merged.providers).toHaveLength(2);

    const anthropic = merged.providers?.find((p) => p.id === 'anthropic');
    expect(anthropic?.displayName).toBe('Anthropic Updated');
    expect(anthropic?.supportLevel).toBe('verified');

    const openai = merged.providers?.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
  });

  it('should merge override objects', () => {
    const base: UnifiedConfig = {
      providerOverrides: {
        anthropic: { supportLevel: 'compatible' },
      },
    };

    const override: UnifiedConfig = {
      providerOverrides: {
        anthropic: { enabled: false },
        openai: { connectionKind: 'direct' },
      },
    };

    const merged = mergeConfigs(base, override);

    expect(merged.providerOverrides?.anthropic?.supportLevel).toBe('compatible');
    expect(merged.providerOverrides?.anthropic?.enabled).toBe(false);
    expect(merged.providerOverrides?.openai?.connectionKind).toBe('direct');
  });
});

// =============================================================================
// Config Normalization Tests
// =============================================================================

describe('normalizeConfig', () => {
  it('should apply default values for missing fields', () => {
    const config: UnifiedConfig = {};

    const normalized = normalizeConfig(config);

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
          enabled: false,
        },
      },
    };

    const normalized = normalizeConfig(config);

    const anthropic = normalized.providers.get('anthropic');
    expect(anthropic?.enabled).toBe(false);
  });
});

// =============================================================================
// Full Pipeline Tests
// =============================================================================

describe('processConfig', () => {
  it('should process null configs', () => {
    const normalized = processConfig(null, null);

    expect(normalized.providers.size).toBe(0);
  });

  it('should merge user and workspace configuration values', () => {
    const userConfig: UnifiedConfig = {
      maxTokens: 4096,
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

    const workspaceConfig: UnifiedConfig = {
      maxTokens: 8192,
    };

    const normalized = processConfig(userConfig, workspaceConfig);

    expect(normalized.maxTokens).toBe(8192);
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
    expect(DEFAULT_CONFIG.maxTokens).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.temperature).toBeLessThanOrEqual(2);
  });
});
