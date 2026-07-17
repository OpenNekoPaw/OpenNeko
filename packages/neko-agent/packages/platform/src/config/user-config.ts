/**
 * User Configuration Storage
 *
 * File-based storage (~/.neko/config.toml) shared with CLI.
 * Uses shared configuration module from @neko/shared for unified format.
 */

import type { Provider, Model } from '../types/provider';
import type { MCPServerPreset } from '../types/config';
import type { UnifiedConfig } from '@neko/shared';
// Node.js config reader - direct import
import {
  readConfigFileResult,
  readUserConfigResult,
  writeConfigFile,
  writeUserConfig as writeUserConfigFile,
  getUserConfigPath,
  type ConfigReadResult,
} from '@neko/shared/config/config-reader';

/**
 * User configuration structure
 */
export interface UserConfig {
  /** Custom providers */
  providers: Provider[];
  /** Custom models */
  models: Model[];
  /** Custom MCP servers */
  mcpServers: MCPServerPreset[];
  /** Provider overrides (e.g., API keys) */
  providerOverrides: Record<string, Partial<Provider>>;
  /** Model overrides */
  modelOverrides: Record<string, Partial<Model>>;
  /** MCP server overrides */
  mcpServerOverrides: Record<string, Partial<MCPServerPreset>>;
}

const DEFAULT_USER_CONFIG: UserConfig = {
  providers: [],
  models: [],
  mcpServers: [],
  providerOverrides: {},
  modelOverrides: {},
  mcpServerOverrides: {},
};

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert unified config to user config
 */
function unifiedToUserConfig(unified: UnifiedConfig | null): UserConfig {
  if (!unified) {
    return { ...DEFAULT_USER_CONFIG };
  }

  return {
    providers: (unified.providers as Provider[]) ?? [],
    models: (unified.models as Model[]) ?? [],
    mcpServers: (unified.mcpServers as MCPServerPreset[]) ?? [],
    providerOverrides: (unified.providerOverrides as Record<string, Partial<Provider>>) ?? {},
    modelOverrides: (unified.modelOverrides as Record<string, Partial<Model>>) ?? {},
    mcpServerOverrides:
      (unified.mcpServerOverrides as Record<string, Partial<MCPServerPreset>>) ?? {},
  };
}

/**
 * Convert user config to unified config for saving.
 * Preserves scalar fields (defaultProvider, maxTokens, etc.) from the existing file.
 */
function userToUnifiedConfig(user: UserConfig, configPath?: string): UnifiedConfig {
  // Read existing file to preserve scalar fields not managed by UserConfig
  const existingResult = configPath ? readConfigFileResult(configPath) : readUserConfigResult();
  const existing = existingResult.status === 'ok' ? existingResult.config : {};
  if (existingResult.status !== 'ok' && existingResult.status !== 'missing') {
    throw new Error(existingResult.diagnostic.message);
  }

  return {
    ...existing,
    providers: user.providers,
    models: user.models,
    mcpServers: user.mcpServers,
    providerOverrides: user.providerOverrides,
    modelOverrides: user.modelOverrides,
    mcpServerOverrides: user.mcpServerOverrides,
  };
}

// =============================================================================
// User Config Manager Interface
// =============================================================================

/**
 * Interface for user config managers
 */
export interface IUserConfigManager {
  load(): UserConfig;
  loadResult?(): UserConfigReadResult;
  save(config: UserConfig): Promise<void>;
  updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void>;
  addProvider(provider: Provider): Promise<void>;
  removeProvider(providerId: string): Promise<void>;
  addModel(model: Model): Promise<void>;
  removeModel(modelId: string): Promise<void>;
  updateMCPServerOverride(serverId: string, override: Partial<MCPServerPreset>): Promise<void>;
  addMCPServer(server: MCPServerPreset): Promise<void>;
  removeMCPServer(serverId: string): Promise<void>;
  clear(): Promise<void>;

  /** Load raw UnifiedConfig (includes scalar fields like temperature, maxTokens, etc.) */
  loadRaw(): UnifiedConfig;
  loadRawResult?(): ConfigReadResult;
  /** Update a single scalar field in the config file */
  updateScalar<K extends keyof UnifiedConfig>(key: K, value: UnifiedConfig[K]): Promise<void>;
  /** Update multiple scalar fields in the config file */
  updateScalars(updates: Partial<UnifiedConfig>): Promise<void>;
  /** Explicitly refresh any cached file snapshot */
  reload?(): void;
}

export type UserConfigReadResult =
  | {
      readonly status: 'ok';
      readonly filePath: string;
      readonly config: UserConfig;
      readonly raw: UnifiedConfig;
    }
  | Exclude<ConfigReadResult, { readonly status: 'ok' }>;

// =============================================================================
// File-based User Config Manager
// =============================================================================

export interface FileUserConfigManagerOptions {
  /**
   * Explicit config file path.
   *
   * Omit to use the canonical user config at ~/.neko/config.toml.
   */
  readonly filePath?: string;
}

/**
 * User config manager using file storage (~/.neko/config.toml)
 *
 * This implementation reads from and writes to the unified config file,
 * allowing configuration to be shared with cli.
 *
 * Construction is side-effect free; callers own any explicit file writes.
 */
export class FileUserConfigManager implements IUserConfigManager {
  private cachedConfig: UserConfig | null = null;
  private cachedReadResult: ConfigReadResult | null = null;
  private readonly filePath: string;

  constructor(options: FileUserConfigManagerOptions = {}) {
    this.filePath = options.filePath ?? getUserConfigPath();
  }

  /**
   * Load user configuration from file
   */
  load(): UserConfig {
    const result = this.loadResult();
    return result.status === 'ok' ? result.config : { ...DEFAULT_USER_CONFIG };
  }

  loadResult(): UserConfigReadResult {
    const result = this.loadRawResult();
    if (result.status !== 'ok') {
      return result;
    }
    return {
      status: 'ok',
      filePath: result.filePath,
      config: unifiedToUserConfig(result.config),
      raw: result.config,
    };
  }

  /**
   * Save user configuration to file
   */
  async save(config: UserConfig): Promise<void> {
    const unified = userToUnifiedConfig(config, this.filePath);
    this.writeRawConfig(unified);
    this.cachedConfig = config;
    this.cachedReadResult = {
      status: 'ok',
      filePath: this.filePath,
      config: unified,
    };
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  async updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void> {
    const config = this.load();
    config.providerOverrides[providerId] = {
      ...config.providerOverrides[providerId],
      ...override,
    };
    await this.save(config);
  }

  async addProvider(provider: Provider): Promise<void> {
    const config = this.load();
    const existing = config.providers.findIndex((p) => p.id === provider.id);
    if (existing >= 0) {
      config.providers[existing] = provider;
    } else {
      config.providers.push(provider);
    }
    await this.save(config);
  }

  async removeProvider(providerId: string): Promise<void> {
    const config = this.load();
    config.providers = config.providers.filter((p) => p.id !== providerId);
    delete config.providerOverrides[providerId];
    await this.save(config);
  }

  // ==========================================================================
  // Model Methods
  // ==========================================================================

  async addModel(model: Model): Promise<void> {
    const config = this.load();
    const existing = config.models.findIndex((m) => m.id === model.id);
    if (existing >= 0) {
      config.models[existing] = model;
    } else {
      config.models.push(model);
    }
    await this.save(config);
  }

  async removeModel(modelId: string): Promise<void> {
    const config = this.load();
    config.models = config.models.filter((m) => m.id !== modelId);
    delete config.modelOverrides[modelId];
    await this.save(config);
  }

  // ==========================================================================
  // MCP Server Methods
  // ==========================================================================

  async updateMCPServerOverride(
    serverId: string,
    override: Partial<MCPServerPreset>,
  ): Promise<void> {
    const config = this.load();
    config.mcpServerOverrides[serverId] = {
      ...config.mcpServerOverrides[serverId],
      ...override,
    };
    await this.save(config);
  }

  async addMCPServer(server: MCPServerPreset): Promise<void> {
    const config = this.load();
    const existing = config.mcpServers.findIndex((s) => s.id === server.id);
    if (existing >= 0) {
      config.mcpServers[existing] = server;
    } else {
      config.mcpServers.push(server);
    }
    await this.save(config);
  }

  async removeMCPServer(serverId: string): Promise<void> {
    const config = this.load();
    config.mcpServers = config.mcpServers.filter((s) => s.id !== serverId);
    delete config.mcpServerOverrides[serverId];
    await this.save(config);
  }

  // ==========================================================================
  // Scalar Field Methods
  // ==========================================================================

  loadRaw(): UnifiedConfig {
    const result = this.loadRawResult();
    return result.status === 'ok' ? result.config : {};
  }

  loadRawResult(): ConfigReadResult {
    if (!this.cachedReadResult) {
      this.cachedReadResult =
        this.filePath === getUserConfigPath()
          ? readUserConfigResult()
          : readConfigFileResult(this.filePath);
      if (this.cachedReadResult.status === 'ok') {
        this.cachedConfig = unifiedToUserConfig(this.cachedReadResult.config);
      } else {
        this.cachedConfig = null;
      }
    }
    return this.cachedReadResult;
  }

  async updateScalar<K extends keyof UnifiedConfig>(
    key: K,
    value: UnifiedConfig[K],
  ): Promise<void> {
    const raw = this.loadRawForWrite();
    (raw as Record<string, unknown>)[key] = value;
    this.writeRawConfig(raw);
    this.reload();
  }

  async updateScalars(updates: Partial<UnifiedConfig>): Promise<void> {
    const raw = this.loadRawForWrite();
    Object.assign(raw, updates);
    this.writeRawConfig(raw);
    this.reload();
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async clear(): Promise<void> {
    await this.save({ ...DEFAULT_USER_CONFIG });
  }

  reload(): void {
    this.cachedConfig = null;
    this.cachedReadResult = null;
  }

  /**
   * Dispose resources
   */
  dispose(): void {}

  private loadRawForWrite(): UnifiedConfig {
    const result = this.loadRawResult();
    if (result.status === 'ok') {
      return { ...result.config };
    }
    if (result.status === 'missing') {
      return {};
    }
    throw new Error(result.diagnostic.message);
  }

  private writeRawConfig(config: UnifiedConfig): void {
    if (this.filePath === getUserConfigPath()) {
      writeUserConfigFile(config);
      return;
    }
    writeConfigFile(this.filePath, config);
  }
}

// Re-export path utility for convenience
export { getUserConfigPath };
