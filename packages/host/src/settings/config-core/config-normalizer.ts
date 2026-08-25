/**
 * Configuration Normalizer
 *
 * Normalizes and merges configuration from different sources.
 */

import type { UnifiedConfig, NormalizedConfig } from './types';
import { DEFAULT_CONFIG } from './types';

// =============================================================================
// Configuration Normalization
// =============================================================================

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
  return {
    maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    skillsDir: config.skillsDir,
    verbose: config.verbose ?? DEFAULT_CONFIG.verbose,
    outputFormat: config.outputFormat ?? DEFAULT_CONFIG.outputFormat,
    providers: arrayToMap(config.providers),
    models: arrayToMap(config.models),
  };
}
