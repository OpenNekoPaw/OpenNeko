/**
 * Unified Configuration Types
 *
 * Shared configuration format for agent-cli and platform.
 * File locations:
 * - User config: ~/.neko/config.toml
 * - Workspace config: .neko/config.toml
 */

import { DEFAULT_EXTERNAL_RESEARCH_CONFIG } from '../types/external-research';
import type {
  ExternalResearchConfig,
  ExternalResearchConfigInput,
} from '../types/external-research';
import type {
  ProviderConfig,
  ModelConfig,
  PurposeDefaultModels,
  MCPServerConfig,
  TypeDefaultModels,
} from '../types/config';

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

  /** Default provider ID */
  defaultProvider?: string;

  /** Default model ID */
  defaultModel?: string;

  /** Default models by broad model type */
  defaultModels?: TypeDefaultModels;

  /** Default models by product purpose, e.g. image.understand or video.understand */
  defaultModelPurposes?: PurposeDefaultModels;

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
  providers?: ProviderConfig[];

  /** Model configurations */
  models?: ModelConfig[];

  /** MCP server configurations */
  mcpServers?: MCPServerConfig[];

  /** Opt-in external research configuration. */
  externalResearch?: ExternalResearchConfigInput;

  // ==========================================================================
  // Override Configuration
  // ==========================================================================

  /** Provider overrides (keyed by provider ID) */
  providerOverrides?: Record<string, Partial<ProviderConfig>>;

  /** Model overrides (keyed by model ID) */
  modelOverrides?: Record<string, Partial<ModelConfig>>;

  /** MCP server overrides (keyed by server ID) */
  mcpServerOverrides?: Record<string, Partial<MCPServerConfig>>;

  // ==========================================================================
  // Auth & Credentials
  // ==========================================================================

  /**
   * OAuth 2.0 configuration.
   * Fallback for neko-auth when VSCode settings (`neko.auth.*`) are empty.
   * Also used by CLI where VSCode settings are unavailable.
   */
  auth?: AuthConfigJson;

  /**
   * API key credentials.
   *
   * WARNING: Stored in PLAINTEXT in config.toml.
   * Prefer environment variables for sensitive keys.
   *
   * Priority: env vars > credentials.apiKeys > providers[].apiKey
   */
  credentials?: CredentialsConfig;

  /**
   * Marketplace configuration.
   * Registry URL override for private deployments.
   */
  market?: MarketConfig;
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
  /** Default provider ID */
  defaultProvider: string;

  /** Default model ID */
  defaultModel: string;

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
  providers: Map<string, ProviderConfig>;

  /** Model configurations (keyed by ID) */
  models: Map<string, ModelConfig>;

  /** MCP server configurations (keyed by ID) */
  mcpServers: Map<string, MCPServerConfig>;

  /** Normalized external research configuration. */
  externalResearch: ExternalResearchConfig;
}

// =============================================================================
// Configuration Defaults
// =============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<NormalizedConfig, 'providers' | 'models' | 'mcpServers'> = {
  defaultProvider: 'ollama-local',
  defaultModel: 'ollama-local-default-chat',
  maxTokens: 8192,
  temperature: 0.7,
  verbose: false,
  outputFormat: 'text',
  externalResearch: DEFAULT_EXTERNAL_RESEARCH_CONFIG,
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

// =============================================================================
// Auth & Credentials Types
// =============================================================================

/**
 * OAuth 2.0 configuration stored in config.toml.
 * Mirrors AuthConfig from types/auth.ts but all fields optional for partial config.
 */
export interface AuthConfigJson {
  clientId?: string;
  /** Authorization endpoint. Empty string = not configured. */
  authUrl?: string;
  /** Token endpoint. */
  tokenUrl?: string;
  /** Neko official account AI catalog endpoint. */
  aiCatalogUrl?: string;
  scopes?: string[];
  /** Localhost redirect port for OAuth callback. Default: 6419 */
  redirectPort?: number;
}

/**
 * API key credentials section.
 * Maps provider ID to API key string.
 */
export interface CredentialsConfig {
  /** Provider ID -> API key mapping (e.g. { "anthropic": "sk-ant-xxx" }) */
  apiKeys?: Record<string, string>;
}

/**
 * Marketplace configuration.
 */
export interface MarketConfig {
  /** Registry API base URL (default: https://market.neko.dev/api/v1) */
  registryUrl?: string;
}
