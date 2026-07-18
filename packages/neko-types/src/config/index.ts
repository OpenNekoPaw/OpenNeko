/**
 * Unified Configuration Module
 *
 * Shared configuration format for agent-cli and platform.
 *
 * File locations:
 * - User config: ~/.neko/config.toml
 * - Workspace config: .neko/config.toml
 *
 * NOTE: config-reader.ts uses Node.js APIs (fs, path, os) and is NOT exported
 * from the main entry point. Import it directly from '@neko/shared/config/config-reader'
 * in Node.js environments only.
 *
 * @example
 * ```typescript
 * // In browser/webview - use types and normalizer only
 * import {
 *   type UnifiedConfig,
 *   processConfig,
 * } from '@neko/shared';
 *
 * // In Node.js (extension, agent-cli) - import reader directly
 * import {
 *   readUserConfigResult,
 *   readWorkspaceConfigResult,
 * } from '@neko/shared/config/config-reader';
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

export type {
  ExternalResearchConfig,
  ExternalResearchConfigInput,
} from '../types/external-research';

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
  SUPPORTED_TOML_CONFIG_VERSION,
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
// Import directly from '@neko/shared/config/config-reader' in Node.js environments.

// NOTE: auth-config-loader.ts is NOT exported here because it uses Node.js APIs.
