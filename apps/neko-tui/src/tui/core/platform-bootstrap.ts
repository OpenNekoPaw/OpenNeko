/**
 * Platform Bootstrap for CLI
 *
 * Creates a Platform instance configured for CLI/TUI use.
 * Handles env var API key injection since Platform's ConfigManager
 * only reads from config files.
 */

import {
  createPlatform,
  FileUserConfigManager,
  type Platform,
} from '@neko/platform';
import { TaskManager, type IRuntimeTaskManager } from '@neko/agent';
import type {
  ITaskRecoveryStorage,
  ITaskStorage,
  IToolRegistry,
} from '@neko/shared';
import { getEnvKeyMap } from '@neko/shared';

// Shared env var mapping from @neko/shared/config/credential-resolver
const ENV_KEY_MAP = getEnvKeyMap();

export interface CLIPlatformOptions {
  workspacePath?: string;
  toolRegistry: IToolRegistry;
  taskManager: IRuntimeTaskManager;
}

export interface CLIPlatformResult {
  platform: Platform;
  taskManager: IRuntimeTaskManager;
}

export interface CLITaskManagerOptions {
  readonly taskStorage: ITaskStorage;
  readonly taskRecoveryStorage: ITaskRecoveryStorage;
}

export function createCLITaskManager(options: CLITaskManagerOptions): IRuntimeTaskManager {
  return new TaskManager({
    storage: options.taskStorage,
    recoveryStorage: options.taskRecoveryStorage,
  });
}

/**
 * Collect API keys from environment variables for known providers.
 */
function collectEnvApiKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [providerId, envKey] of Object.entries(ENV_KEY_MAP)) {
    const value = process.env[envKey];
    if (value) {
      keys[providerId] = value;
    }
  }
  // Generic fallback keys
  const generic = process.env['NEKO_API_KEY'] ?? process.env['LLM_API_KEY'];
  if (generic) {
    keys['_generic'] = generic;
  }
  return keys;
}

/**
 * Create a Platform instance for CLI use.
 *
 * - Initializes FileUserConfigManager for ~/.neko/config.toml
 * - Injects env var API keys at runtime (not persisted to disk)
 * - Keeps media/config ownership outside the Pi Agent runtime
 */
export function createCLIPlatform(options: CLIPlatformOptions): CLIPlatformResult {
  const userConfigManager = new FileUserConfigManager();

  const taskManager = options.taskManager;

  const platform = createPlatform({
    userConfigManager,
    workspacePath: options.workspacePath,
    toolRegistry: options.toolRegistry,
    taskManager,
  });

  // Inject env var API keys at runtime (not persisted)
  const envKeys = collectEnvApiKeys();
  for (const [providerId, apiKey] of Object.entries(envKeys)) {
    if (providerId === '_generic') continue;
    const provider = platform.config.getProvider(providerId);
    if (provider && !provider.apiKey) {
      platform.config.setRuntimeProviderOverride(providerId, { apiKey });
    }
  }

  // Apply generic key to any provider still missing an API key
  const genericKey = envKeys['_generic'];
  if (genericKey) {
    for (const provider of platform.config.getEnabledProviders()) {
      if (!provider.apiKey) {
        platform.config.setRuntimeProviderOverride(provider.id, {
          apiKey: genericKey,
        });
      }
    }
  }

  return {
    platform,
    taskManager,
  };
}
