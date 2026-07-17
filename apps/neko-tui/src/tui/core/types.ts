/**
 * Agent CLI Types
 */

import type { ExternalResearchConfig, MCPServerConfig } from '@neko/shared';
import type { AgentLlmConfig } from '@neko-agent/types';
import type {
  AgentModelPurpose,
  CredentialProvenance,
  OpenNekoPiProtocolProfile,
} from '@neko/agent/pi';

export type TuiMediaCategory = 'image' | 'video' | 'audio';
export type ExecutionMode = 'plan' | 'ask' | 'auto';
export type TuiPerceptionModels = Partial<Record<TuiMediaCategory, string>>;
export type TuiToolModelPurpose = Exclude<AgentModelPurpose, 'agent.main'>;

export interface TuiPurposeModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export interface TuiPurposeModelConfig {
  readonly purpose: TuiToolModelPurpose;
  readonly providerId: string;
  /** Config/catalog model identity consumed by OpenNeko domain runtimes. */
  readonly modelId: string;
  /** Provider wire identity used only when Pi executes bounded understanding. */
  readonly apiModelId: string;
  readonly category: 'llm' | 'image' | 'video' | 'audio';
  readonly capabilities: readonly string[];
  readonly baseUrl: string;
  readonly protocolProfile?: OpenNekoPiProtocolProfile;
  readonly providerRequiresApiKey: boolean;
  readonly providerAuth?: CLIConfig['providerAuth'];
  readonly apiKey?: string;
  readonly credentialProvenance?: CredentialProvenance;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
}

/**
 * CLI configuration
 */
export interface CLIConfig {
  /** Provider ID (e.g., 'anthropic', 'cpass', 'my-openai') */
  provider: string;
  /** Provider protocol type for API routing (e.g., 'anthropic', 'openai') */
  providerType: string;
  /** Explicit wire protocol projected to Pi; runtime execution never infers this from provider type. */
  protocolProfile?: OpenNekoPiProtocolProfile;
  /** Whether the selected provider requires an API key before execution */
  providerRequiresApiKey: boolean;
  /** Exact credential projection used by Pi for this provider. */
  providerAuth?:
    | { readonly type: 'provider-default' }
    | { readonly type: 'bearer' }
    | { readonly type: 'api-key' }
    | { readonly type: 'custom-header'; readonly header: string };
  /** Chat model ID */
  model: string;
  /** Explicit provider/model identity for the selected chat model. */
  chatModel?: {
    providerId: string;
    modelId: string;
    /** Provider wire-level model id/name used by Pi requests. */
    apiModelId?: string;
    providerExpressionProfileId?: string;
    capabilities?: readonly string[];
    contextWindow?: number;
    maxOutputTokens?: number;
  };
  /** Media model IDs (for image/video/audio generation, empty if none) */
  mediaModels: string[];
  /** Default media models by type */
  defaultMediaModels?: {
    image?: string;
    video?: string;
    audio?: string;
  };
  /** Session-only perception model overrides for media understanding. */
  perceptionModels?: TuiPerceptionModels;
  /** Flat, fully resolved purpose entries frozen by the Pi runtime at turn start. */
  purposeModels?: Partial<Record<TuiToolModelPurpose, TuiPurposeModelConfig>>;
  /** API key (from env or config) */
  apiKey?: string;
  /** Credential origin retained separately from the secret value. */
  credentialProvenance?: CredentialProvenance;
  /** API base URL (optional) */
  baseUrl?: string;
  /** Max output tokens for response generation */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
  /** Enable verbose output */
  verbose: boolean;
  /** Working directory */
  workDir: string;
  /** MCP server configurations */
  mcpServers: MCPServerConfig[];
  /** Opt-in external research configuration. */
  externalResearch?: ExternalResearchConfig;
  /** Output format */
  outputFormat: 'text' | 'json' | 'markdown';
  /** Session execution and confirmation behavior. */
  executionMode: ExecutionMode;
  /** Extended thinking budget in tokens (0 = disabled, Anthropic/DeepSeek only) */
  thinkingBudget: number;
  /** Runtime LLM parameter presets and advanced values for Agent turns. */
  llmConfig?: AgentLlmConfig;
  /** Session-only context compaction/settings forwarded through shared runtime assembly. */
  contextSettings?: {
    readonly maxTokens?: number;
    readonly reservedTokens?: number;
  };
}

/**
 * Default CLI configuration
 */
export const DEFAULT_CLI_CONFIG: CLIConfig = {
  provider: 'anthropic',
  providerType: 'anthropic',
  protocolProfile: 'anthropic',
  providerRequiresApiKey: true,
  providerAuth: { type: 'provider-default' },
  model: 'claude-sonnet-4-20250514',
  chatModel: {
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    apiModelId: 'claude-sonnet-4-20250514',
    capabilities: ['llm.chat', 'reasoning'],
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
  },
  baseUrl: 'https://api.anthropic.com',
  mediaModels: [],
  maxTokens: 8192,
  temperature: 0.7,
  verbose: false,
  workDir: process.cwd(),
  mcpServers: [],
  externalResearch: undefined,
  outputFormat: 'text',
  executionMode: 'ask',
  thinkingBudget: 0,
};
