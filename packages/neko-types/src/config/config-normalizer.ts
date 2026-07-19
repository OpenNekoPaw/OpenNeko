/**
 * Configuration Normalizer
 *
 * Normalizes and merges configuration from different sources.
 */

import type { UnifiedConfig, NormalizedConfig } from './types';
import { DEFAULT_CONFIG } from './types';
import {
  normalizeExternalResearchConfig,
  type ExternalResearchConfigInput,
  type ExternalResearchMcpProviderConfig,
} from '../types/external-research';

// =============================================================================
// Configuration Merging
// =============================================================================

/**
 * Merge two configurations (later config takes precedence)
 *
 * @param base - Base configuration
 * @param override - Override configuration (takes precedence)
 * @returns Merged configuration
 */
export function mergeConfigs(base: UnifiedConfig, override: UnifiedConfig): UnifiedConfig {
  const merged: UnifiedConfig = { ...base };

  // Merge scalar fields (override takes precedence)
  if (override.defaultProvider !== undefined) {
    merged.defaultProvider = override.defaultProvider;
  }
  if (override.defaultModel !== undefined) {
    merged.defaultModel = override.defaultModel;
  }
  if (base.defaultModels || override.defaultModels) {
    merged.defaultModels = {
      ...base.defaultModels,
      ...override.defaultModels,
    };
  }
  if (base.defaultModelPurposes || override.defaultModelPurposes) {
    merged.defaultModelPurposes = {
      ...base.defaultModelPurposes,
      ...override.defaultModelPurposes,
    };
  }
  if (override.maxTokens !== undefined) {
    merged.maxTokens = override.maxTokens;
  }
  if (override.temperature !== undefined) {
    merged.temperature = override.temperature;
  }
  if (override.skillsDir !== undefined) {
    merged.skillsDir = override.skillsDir;
  }
  if (override.verbose !== undefined) {
    merged.verbose = override.verbose;
  }
  if (override.outputFormat !== undefined) {
    merged.outputFormat = override.outputFormat;
  }

  // Merge array fields (combine and dedupe by ID)
  merged.providers = mergeArrayById(base.providers, override.providers);
  merged.models = mergeArrayById(base.models, override.models);
  merged.mcpServers = mergeArrayById(base.mcpServers, override.mcpServers);

  merged.externalResearch = mergeExternalResearchConfig(
    base.externalResearch,
    override.externalResearch,
  );

  // Merge override objects
  merged.providerOverrides = mergeOverrides(base.providerOverrides, override.providerOverrides);
  merged.modelOverrides = mergeOverrides(base.modelOverrides, override.modelOverrides);
  merged.mcpServerOverrides = mergeOverrides(base.mcpServerOverrides, override.mcpServerOverrides);

  // Preserve removed Auth product settings until an explicit user-data migration exists.
  if (base.auth || override.auth) {
    merged.auth = {
      ...base.auth,
      ...override.auth,
    };
  }

  // Merge credentials (deep-merge apiKeys)
  if (base.credentials || override.credentials) {
    merged.credentials = {
      apiKeys: {
        ...base.credentials?.apiKeys,
        ...override.credentials?.apiKeys,
      },
    };
  }

  // Preserve removed Market product settings until an explicit user-data migration exists.
  if (base.market || override.market) {
    merged.market = {
      ...base.market,
      ...override.market,
    };
  }

  return merged;
}

function mergeExternalResearchConfig(
  base?: ExternalResearchConfigInput,
  override?: ExternalResearchConfigInput,
): ExternalResearchConfigInput | undefined {
  if (!base && !override) {
    return undefined;
  }

  return removeUndefined({
    ...base,
    ...override,
    mcp: mergeExternalResearchMcpConfig(base?.mcp, override?.mcp),
  });
}

function mergeExternalResearchMcpConfig(
  base?: ExternalResearchMcpProviderConfig,
  override?: ExternalResearchMcpProviderConfig,
): ExternalResearchMcpProviderConfig | undefined {
  if (!base && !override) {
    return undefined;
  }

  const serverId = override?.serverId ?? base?.serverId;
  const searchTool =
    base?.searchTool || override?.searchTool
      ? {
          ...base?.searchTool,
          ...override?.searchTool,
        }
      : undefined;

  if (!serverId || !searchTool?.name || !searchTool.queryArg || !searchTool.outputSchema) {
    return undefined;
  }

  const fetchTool =
    base?.fetchTool || override?.fetchTool
      ? {
          ...base?.fetchTool,
          ...override?.fetchTool,
        }
      : undefined;
  const completeFetchTool =
    fetchTool?.name && fetchTool.urlArg && fetchTool.outputSchema
      ? {
          name: fetchTool.name,
          urlArg: fetchTool.urlArg,
          outputSchema: fetchTool.outputSchema,
          ...(fetchTool.maxContentTokensArg !== undefined
            ? { maxContentTokensArg: fetchTool.maxContentTokensArg }
            : {}),
          ...(fetchTool.allowedDomainsArg !== undefined
            ? { allowedDomainsArg: fetchTool.allowedDomainsArg }
            : {}),
          ...(fetchTool.blockedDomainsArg !== undefined
            ? { blockedDomainsArg: fetchTool.blockedDomainsArg }
            : {}),
        }
      : undefined;

  return {
    serverId,
    searchTool: {
      name: searchTool.name,
      queryArg: searchTool.queryArg,
      outputSchema: searchTool.outputSchema,
      ...(searchTool.maxResultsArg !== undefined
        ? { maxResultsArg: searchTool.maxResultsArg }
        : {}),
      ...(searchTool.allowedDomainsArg !== undefined
        ? { allowedDomainsArg: searchTool.allowedDomainsArg }
        : {}),
      ...(searchTool.blockedDomainsArg !== undefined
        ? { blockedDomainsArg: searchTool.blockedDomainsArg }
        : {}),
    },
    ...(completeFetchTool ? { fetchTool: completeFetchTool } : {}),
    ...((override?.exposeBoundToolsAsRawMcp ?? base?.exposeBoundToolsAsRawMcp) !== undefined
      ? {
          exposeBoundToolsAsRawMcp:
            override?.exposeBoundToolsAsRawMcp ?? base?.exposeBoundToolsAsRawMcp,
        }
      : {}),
  };
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

/**
 * Merge arrays by ID (later items override earlier ones with same ID)
 */
function mergeArrayById<T extends { id: string }>(base?: T[], override?: T[]): T[] | undefined {
  if (!base && !override) {
    return undefined;
  }

  const map = new Map<string, T>();

  // Add base items
  if (base) {
    for (const item of base) {
      map.set(item.id, item);
    }
  }

  // Override with later items
  if (override) {
    for (const item of override) {
      const existing = map.get(item.id);
      if (existing) {
        // Merge item properties
        map.set(item.id, { ...existing, ...item });
      } else {
        map.set(item.id, item);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Merge override objects
 */
function mergeOverrides<T>(
  base?: Record<string, Partial<T>>,
  override?: Record<string, Partial<T>>,
): Record<string, Partial<T>> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: Record<string, Partial<T>> = { ...base };

  if (override) {
    for (const [key, value] of Object.entries(override)) {
      merged[key] = { ...merged[key], ...value };
    }
  }

  return merged;
}

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
    defaultProvider: config.defaultProvider ?? DEFAULT_CONFIG.defaultProvider,
    defaultModel: config.defaultModel ?? DEFAULT_CONFIG.defaultModel,
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

// =============================================================================
// Full Configuration Processing Pipeline
// =============================================================================

/**
 * Process configuration through the full pipeline
 *
 * 1. Merge user and workspace configs
 * 2. Normalize to internal format
 *
 * @param userConfig - User configuration (~/.neko/config.toml)
 * @param workspaceConfig - Workspace configuration (.neko/config.toml)
 * @returns Normalized configuration
 */
export function processConfig(
  userConfig: UnifiedConfig | null,
  workspaceConfig: UnifiedConfig | null,
): NormalizedConfig {
  // Start with empty config
  let config: UnifiedConfig = {};

  // Merge user config (if exists)
  if (userConfig) {
    config = mergeConfigs(config, userConfig);
  }

  // Merge workspace config (takes precedence)
  if (workspaceConfig) {
    config = mergeConfigs(config, workspaceConfig);
  }

  // Normalize to internal format
  return normalizeConfig(config);
}
