/**
 * Configuration Module Tests
 *
 * Tests for the unified configuration format shared between
 * agent-cli and platform packages.
 */

import { describe, it, expect } from 'vitest';
import { normalizeConfig } from './config-normalizer';
import { DEFAULT_CONFIG, CONFIG_DIR_NAME, CONFIG_FILE_NAME, type UnifiedConfig } from './types';

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
