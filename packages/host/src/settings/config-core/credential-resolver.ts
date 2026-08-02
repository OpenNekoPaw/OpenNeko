/**
 * Credential Resolver
 *
 * Pure function for resolving API keys with layered priority.
 * Layer 0 — browser-safe, no Node.js dependencies.
 *
 * Priority chain:
 *   1. Environment variable   (ANTHROPIC_API_KEY, etc.)
 *   2. credentials.apiKeys    (config.toml "credentials" section)
 *   3. providers[].apiKey     (config.toml "providers" section)
 *   4. Generic fallback env   (NEKO_API_KEY / LLM_API_KEY)
 */

import type { UnifiedConfig } from './types';

// =============================================================================
// Environment Variable Mapping
// =============================================================================

/**
 * Known provider ID → environment variable name mapping.
 */
const ENV_KEY_MAP: Record<string, string> = {
  'neko-gateway': 'NEKO_GATEWAY_API_KEY',
  'custom-newapi': 'NEWAPI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
  newapi: 'NEWAPI_API_KEY',
};

/** Generic fallback environment variables (checked in order) */
const GENERIC_ENV_KEYS = ['NEKO_API_KEY', 'LLM_API_KEY'] as const;

// =============================================================================
// Public API
// =============================================================================

/**
 * Environment variable getter function signature.
 * Allows injection for testing and non-Node.js environments.
 */
export type EnvGetter = (key: string) => string | undefined;

/**
 * Resolve API key for a given provider.
 *
 * @param providerId - Provider identifier (e.g. "anthropic", "openai")
 * @param config - Unified config (may be partial)
 * @param envGetter - Environment variable getter (defaults to no-op in browser)
 * @returns Resolved API key or null if not found
 */
export function resolveApiKey(
  providerId: string,
  config: Pick<UnifiedConfig, 'credentials' | 'providers'>,
  envGetter: EnvGetter = () => undefined,
): string | null {
  // Priority 1: Provider-specific environment variable
  const envVar = ENV_KEY_MAP[providerId];
  if (envVar) {
    const envValue = envGetter(envVar);
    if (envValue) return envValue;
  }

  // Priority 2: credentials.apiKeys[providerId]
  const credKey = config.credentials?.apiKeys?.[providerId];
  if (credKey) return credKey;

  // Priority 3: providers[].apiKey where provider.id matches
  const provider = config.providers?.find((p) => p.id === providerId);
  if (provider?.apiKey) return provider.apiKey;

  // Priority 4: Generic fallback environment variables
  for (const key of GENERIC_ENV_KEYS) {
    const value = envGetter(key);
    if (value) return value;
  }

  return null;
}

/**
 * Get the environment variable name for a provider.
 * Useful for error messages telling users which env var to set.
 */
export function getEnvKeyName(providerId: string): string | undefined {
  return ENV_KEY_MAP[providerId];
}

/**
 * Get all known provider-to-env-var mappings.
 */
export function getEnvKeyMap(): Readonly<Record<string, string>> {
  return ENV_KEY_MAP;
}
