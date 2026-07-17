/**
 * Auth Config Loader
 *
 * Loads OAuth configuration from config.toml files.
 * Node.js only — uses config-reader (fs, path, os).
 *
 * Import via: '@neko/shared/config/auth-config-loader'
 */

import type { AuthConfig } from '../types/auth';
import type { AuthConfigJson, UnifiedConfig } from './types';
import {
  readUserConfigResult,
  readWorkspaceConfigResult,
  type ConfigReadResult,
} from './config-reader';

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_SCOPES = ['openid', 'profile', 'email'];
const DEFAULT_REDIRECT_PORT = 6419;

// =============================================================================
// Public API
// =============================================================================

/**
 * Load AuthConfig from config files (user + workspace merge).
 *
 * @param workspaceDir - Workspace directory for .neko/config.toml lookup
 * @returns AuthConfig with defaults applied. Empty authUrl/tokenUrl means not configured.
 */
export function loadAuthConfigFromFiles(workspaceDir?: string): AuthConfig {
  const userConfig = readConfigOrThrow(readUserConfigResult());
  const wsConfig = workspaceDir ? readConfigOrThrow(readWorkspaceConfigResult(workspaceDir)) : null;

  // Workspace auth overrides user auth (field-level merge)
  const userAuth = userConfig?.auth;
  const wsAuth = wsConfig?.auth;
  const merged = mergeAuthConfig(userAuth, wsAuth);

  return {
    clientId: merged.clientId ?? '',
    authUrl: merged.authUrl ?? '',
    tokenUrl: merged.tokenUrl ?? '',
    aiCatalogUrl: merged.aiCatalogUrl ?? '',
    scopes: merged.scopes ?? DEFAULT_SCOPES,
    redirectPort: merged.redirectPort ?? DEFAULT_REDIRECT_PORT,
  };
}

function readConfigOrThrow(result: ConfigReadResult): UnifiedConfig | null {
  if (result.status === 'missing') return null;
  if (result.status === 'ok') return result.config;
  throw new Error(result.diagnostic.message);
}

/**
 * Check whether the loaded auth config is actually configured
 * (i.e. has non-empty authUrl and tokenUrl).
 */
export function isAuthConfigured(config: AuthConfig): boolean {
  return !!config.authUrl && !!config.tokenUrl;
}

// =============================================================================
// Internal
// =============================================================================

/**
 * Merge two AuthConfigJson objects (later takes precedence per-field).
 */
function mergeAuthConfig(base?: AuthConfigJson, override?: AuthConfigJson): AuthConfigJson {
  if (!base && !override) return {};
  if (!base) return override ?? {};
  if (!override) return base;

  return {
    clientId: override.clientId ?? base.clientId,
    authUrl: override.authUrl ?? base.authUrl,
    tokenUrl: override.tokenUrl ?? base.tokenUrl,
    aiCatalogUrl: override.aiCatalogUrl ?? base.aiCatalogUrl,
    scopes: override.scopes ?? base.scopes,
    redirectPort: override.redirectPort ?? base.redirectPort,
  };
}
