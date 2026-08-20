/**
 * User Configuration Storage
 *
 * File-based storage (~/.neko/config.toml) shared with CLI.
 * Uses shared configuration module from @neko/shared for unified format.
 */

import type { Model } from './types/provider';
import type { ProviderDefinition, UnifiedConfig } from './config-core/index';
import type { ProviderCredentialDeclaration } from './config-core/index';
// Node.js config reader - direct import
import {
  readConfigFileResult,
  readUserConfigResult,
  writeConfigFile,
  writeUserConfig as writeUserConfigFile,
  getUserConfigPath,
  type ConfigReadResult,
} from './config-reader';

/**
 * User configuration structure
 */
export interface UserConfig {
  /** Custom providers */
  providers: ProviderDefinition[];
  /** Custom models */
  models: Model[];
}

const DEFAULT_USER_CONFIG: UserConfig = {
  providers: [],
  models: [],
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
    providers: unified.providers ?? [],
    models: unified.models ?? [],
  };
}

/**
 * Convert user config to unified config for saving.
 * Preserves settings fields not managed by UserConfig from the existing file.
 */
interface WritableUserConfigDocument {
  readonly config: UnifiedConfig;
  readonly providerCredentials: Readonly<Record<string, ProviderCredentialDeclaration>>;
}

function userToUnifiedConfig(user: UserConfig, configPath?: string): WritableUserConfigDocument {
  // Read existing file to preserve scalar fields not managed by UserConfig
  const existingResult = configPath ? readConfigFileResult(configPath) : readUserConfigResult();
  const existing = existingResult.status === 'ok' ? existingResult.config : {};
  if (existingResult.status !== 'ok' && existingResult.status !== 'missing') {
    throw new Error(existingResult.diagnostic.message);
  }

  return {
    config: {
      ...existing,
      providers: user.providers,
      models: user.models,
    },
    providerCredentials: existingResult.status === 'ok' ? existingResult.providerCredentials : {},
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
  addProvider(provider: ProviderDefinition): Promise<void>;
  removeProvider(providerId: string): Promise<void>;
  addModel(model: Model): Promise<void>;
  removeModel(modelId: string): Promise<void>;
  clear(): Promise<void>;

  /** Load raw UnifiedConfig (includes scalar fields like temperature, maxTokens, etc.) */
  loadRaw(): UnifiedConfig;
  loadRawResult(): ConfigReadResult;
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
    const document = userToUnifiedConfig(config, this.filePath);
    this.writeRawConfig(document);
    this.cachedConfig = config;
    this.cachedReadResult = {
      status: 'ok',
      filePath: this.filePath,
      config: document.config,
      diagnostics: [],
      providerCredentials: document.providerCredentials,
    };
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  async addProvider(provider: ProviderDefinition): Promise<void> {
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
    const document = this.loadRawForWrite();
    this.writeRawConfig({
      ...document,
      config: { ...document.config, [key]: value },
    });
    this.reload();
  }

  async updateScalars(updates: Partial<UnifiedConfig>): Promise<void> {
    const document = this.loadRawForWrite();
    Object.assign(document.config, updates);
    this.writeRawConfig(document);
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

  private loadRawForWrite(): WritableUserConfigDocument {
    const result = this.loadRawResult();
    if (result.status === 'ok') {
      return {
        config: { ...result.config },
        providerCredentials: result.providerCredentials,
      };
    }
    if (result.status === 'missing') {
      return { config: {}, providerCredentials: {} };
    }
    throw new Error(result.diagnostic.message);
  }

  private writeRawConfig(document: WritableUserConfigDocument): void {
    if (this.filePath === getUserConfigPath()) {
      writeUserConfigFile(document.config, document.providerCredentials);
      return;
    }
    writeConfigFile(this.filePath, document.config, document.providerCredentials);
  }
}

// Re-export path utility for convenience
export { getUserConfigPath };
