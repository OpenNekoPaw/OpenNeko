/**
 * Unified Configuration Types
 *
 * Shared configuration format for agent-cli and platform.
 * File locations:
 * - User config: ~/.neko/config.toml
 */

import type { ProviderConfig, ModelConfig, TypeDefaultModels } from '@neko/ai-contracts';

export type ProviderDefinition = Omit<ProviderConfig, 'apiKey'>;

// =============================================================================
// Unified Configuration Format
// =============================================================================

/**
 * Unified configuration file format
 *
 * This format is shared between agent-cli and platform.
 * Both can read from the same config file.
 *
 * TOML is the user-authored syntax. Runtime code uses this object shape after
 * parsing and adaptation.
 */
export interface UnifiedConfig {
  // ==========================================================================
  // Basic Configuration
  // ==========================================================================

  /** Default models by broad model type */
  defaultModels?: TypeDefaultModels;

  /** Global default max output tokens */
  maxTokens?: number;

  /** Global default temperature */
  temperature?: number;

  /** Skills directory (agent-cli) */
  skillsDir?: string;

  /** Verbose output (agent-cli) */
  verbose?: boolean;

  /** Output format (agent-cli) */
  outputFormat?: 'text' | 'json' | 'markdown';

  /** Extended thinking budget in tokens (0 = disabled, Anthropic/DeepSeek only) */
  thinkingBudget?: number;

  // ==========================================================================
  // Extension-specific Settings
  // ==========================================================================

  /** Custom system prompt override */
  customSystemPrompt?: string;

  /** Auto execute tools without confirmation */
  autoExecuteTools?: boolean;

  /** Enable streaming responses */
  streamResponses?: boolean;

  /** Show tool call details in UI */
  showToolCalls?: boolean;

  /** Execution mode: plan (read-only), ask (confirm tools), auto (full auto) */
  executionMode?: 'plan' | 'ask' | 'auto';

  // ==========================================================================
  // Resource Configuration (Array Format)
  // ==========================================================================

  /** Provider configurations */
  providers?: ProviderDefinition[];

  /** Model configurations */
  models?: ModelConfig[];
}

// =============================================================================
// Normalized Configuration (Internal Use)
// =============================================================================

/**
 * Normalized configuration after processing
 *
 * This is the internal format used after merging and normalizing
 * user and workspace configurations.
 */
export interface NormalizedConfig {
  /** Global default max output tokens */
  maxTokens: number;

  /** Global default temperature */
  temperature: number;

  /** Skills directory */
  skillsDir?: string;

  /** Verbose output */
  verbose: boolean;

  /** Output format */
  outputFormat: 'text' | 'json' | 'markdown';

  /** Provider configurations (keyed by ID) */
  providers: Map<string, ProviderDefinition>;

  /** Model configurations (keyed by ID) */
  models: Map<string, ModelConfig>;
}

// =============================================================================
// Configuration Defaults
// =============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<NormalizedConfig, 'providers' | 'models'> = {
  maxTokens: 8192,
  temperature: 0.7,
  verbose: false,
  outputFormat: 'text',
};

/**
 * Default values for extension-specific settings and thinkingBudget.
 * Kept separate from NormalizedConfig to avoid polluting CLI-only types.
 */
export const DEFAULT_EXTENSION_CONFIG = {
  thinkingBudget: 10000,
  customSystemPrompt: '',
  autoExecuteTools: true,
  streamResponses: true,
  showToolCalls: true,
  executionMode: 'ask' as const,
} satisfies Partial<UnifiedConfig>;

// =============================================================================
// Configuration File Paths
// =============================================================================

/** Config directory name */
export const CONFIG_DIR_NAME = '.neko';

/** Config file name */
export const CONFIG_FILE_NAME = 'config.toml';
