/**
 * Unified Configuration Module
 *
 * Host-owned configuration parsing and normalization.
 *
 * File locations:
 * - User config: ~/.neko/config.toml
 * - Workspace config: .neko/config.toml
 *
 * Node configuration reading is owned by @neko/host/settings.
 * @example
 * ```typescript
 * // In browser/webview - use types and normalizer only
 * import {
 *   type UnifiedConfig,
 *   processConfig,
 * } from '@neko/host/settings';
 *
 * // In Node.js (extension, agent-cli) - import reader directly
 * import {
 *   readUserConfigResult,
 *   readWorkspaceConfigResult,
 * } from '@neko/host/settings';
 * ```
 */

// Types (browser-safe)
export type {
  UnifiedConfig,
  NormalizedConfig,
  AuthConfigJson,
  CredentialsConfig,
  MarketConfig,
} from './types';

export type { ExternalResearchConfig, ExternalResearchConfigInput } from '@neko/agent-contracts';

export {
  DEFAULT_CONFIG,
  DEFAULT_EXTENSION_CONFIG,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
} from './types';

// Normalizer (browser-safe - pure functions, no Node.js dependencies)
export { mergeConfigs, normalizeConfig, processConfig } from './config-normalizer';

export type {
  NekoTomlConfig,
  TomlDefaultsConfig,
  TomlProviderConfig,
  TomlProtocolVariant,
  TomlMediaEndpoints,
  TomlModelConfig,
  TomlMcpServerConfig,
  TomlExternalResearchConfig,
  TomlExternalResearchMcpProviderConfig,
  TomlExternalResearchMcpSearchToolBinding,
  TomlExternalResearchMcpFetchToolBinding,
  TomlConfigValidationIssue,
} from './toml-config';

export {
  TomlConfigValidationError,
  parseTomlConfigText,
  serializeUnifiedConfigToToml,
  tomlToUnifiedConfig,
  unifiedConfigToToml,
  validateTomlConfig,
} from './toml-config';

// Config adapter interface (browser-safe)
export type {
  ValidationError,
  ValidationResult,
  IConfigAdapter,
  ConfigChangeType,
  ConfigChangeEvent,
  ConfigChangeListener,
  Disposable,
  IUnifiedConfigManager,
} from './config-adapter';

export { BaseConfigAdapter } from './config-adapter';

// Credential resolver (browser-safe — pure functions)
export { resolveApiKey, getEnvKeyName, getEnvKeyMap } from './credential-resolver';
export type { EnvGetter } from './credential-resolver';

// NOTE: config-reader.ts is NOT exported here because it uses Node.js APIs.
// Import directly from '@neko/host/settings' in Node.js environments.

// NOTE: auth-config-loader.ts is NOT exported here because it uses Node.js APIs.
