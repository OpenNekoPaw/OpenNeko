/**
 * Configuration Normalizer
 *
 * Normalizes and merges configuration from different sources.
 */

import type { UnifiedConfig, NormalizedConfig } from './types';
import { DEFAULT_CONFIG } from './types';
import { normalizeExternalResearchConfig } from '@neko/agent-contracts';

// =============================================================================
// Configuration Normalization
// =============================================================================

/**
 * Apply overrides to items
 */
function applyOverrides<T extends { id: string }>(
  items: T[],
  overrides?: Record<string, Partial<T>>,
): T[] {
  if (!overrides) {
    return items;
  }

  return items.map((item) => {
    const override = overrides[item.id];
    if (override) {
      return { ...item, ...override };
    }
    return item;
  });
}

/**
 * Convert array to Map by ID
 */
function arrayToMap<T extends { id: string }>(items?: T[]): Map<string, T> {
  const map = new Map<string, T>();
  if (items) {
    for (const item of items) {
      map.set(item.id, item);
    }
  }
  return map;
}

/**
 * Normalize unified configuration to internal format
 *
 * @param config - Unified configuration after merging
 * @returns Normalized configuration
 */
export function normalizeConfig(config: UnifiedConfig): NormalizedConfig {
  // Apply overrides to items
  const providers = applyOverrides(config.providers ?? [], config.providerOverrides);
  const models = applyOverrides(config.models ?? [], config.modelOverrides);
  const mcpServers = applyOverrides(config.mcpServers ?? [], config.mcpServerOverrides);

  return {
    maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    skillsDir: config.skillsDir,
    verbose: config.verbose ?? DEFAULT_CONFIG.verbose,
    outputFormat: config.outputFormat ?? DEFAULT_CONFIG.outputFormat,
    providers: arrayToMap(providers),
    models: arrayToMap(models),
    mcpServers: arrayToMap(mcpServers),
    externalResearch: normalizeExternalResearchConfig(config.externalResearch),
  };
}
