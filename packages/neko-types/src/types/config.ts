// =============================================================================
// Configuration Types (Shared between Extension and WebView)
// =============================================================================

// =============================================================================
// Provider Configuration
// =============================================================================

// =============================================================================
// Protocol Variant Configuration (for OpenAI-compatible APIs)
// =============================================================================

/**
 * Authentication type for API requests
 */
export type AuthType = 'bearer' | 'api-key' | 'custom-header';

export const AUTH_TYPES = [
  'bearer',
  'api-key',
  'custom-header',
] as const satisfies readonly AuthType[];

/**
 * Stream format for streaming responses
 */
export type StreamFormat = 'sse' | 'ndjson';

export const STREAM_FORMATS = ['sse', 'ndjson'] as const satisfies readonly StreamFormat[];

/**
 * Protocol variant configuration for OpenAI-compatible APIs.
 * Used by GenericAdapter to handle different API implementations.
 */
export interface ProtocolVariant {
  /**
   * Base path prefix for API endpoints.
   * Default: '/v1'
   * Set to '' if the apiUrl already includes the path (e.g., https://api.example.com/v1)
   */
  basePath?: string;

  /**
   * Authentication type.
   * Default: 'bearer'
   * - 'bearer': Authorization: Bearer <token>
   * - 'api-key': x-api-key: <token>
   * - 'custom-header': Uses authHeader field
   */
  authType?: AuthType;

  /**
   * Custom authentication header name.
   * Only used when authType is 'custom-header'.
   */
  authHeader?: string;

  /**
   * Stream format for streaming responses.
   * Default: 'sse'
   * - 'sse': Server-Sent Events (data: ...)
   * - 'ndjson': Newline Delimited JSON
   */
  streamFormat?: StreamFormat;

  /**
   * Stream end marker.
   * Default: '[DONE]'
   * Some APIs use different markers like '[END]' or empty line.
   */
  streamDoneMarker?: string;

  /**
   * Extra headers to include in requests.
   * Useful for APIs requiring custom headers.
   */
  extraHeaders?: Record<string, string>;

  /**
   * Custom media generation endpoint paths.
   * Override default OpenAI-compatible paths for proxy services.
   *
   * Defaults:
   * - imageGenerations: '/v1/images/generations'
   * - videoGenerations: '/v1/videos/generations'
   * - videoStatus: '/v1/videos/{taskId}'
   * - videoCancel: '/v1/videos/{taskId}/cancel'
   */
  mediaEndpoints?: {
    imageGenerations?: string;
    videoGenerations?: string;
    videoStatus?: string;
    videoCancel?: string;
  };
}

// =============================================================================
// Provider Configuration
// =============================================================================

/**
 * Supported provider types
 */
export type ProviderType =
  // LLM providers
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'generic'
  | 'newapi'
  | 'oneapi'
  // Media generation providers
  | 'xai'
  | 'kling'
  | 'runway'
  | 'luma'
  | 'minimax'
  | 'jimeng'
  | 'liblib'
  | 'suno'
  | 'vidu'
  | 'midjourney'
  | 'fal'
  | 'dashscope';

export const PROVIDER_TYPES = [
  'openai',
  'anthropic',
  'google',
  'azure',
  'ollama',
  'generic',
  'newapi',
  'oneapi',
  'xai',
  'kling',
  'runway',
  'luma',
  'minimax',
  'jimeng',
  'liblib',
  'suno',
  'vidu',
  'midjourney',
  'fal',
  'dashscope',
] as const satisfies readonly ProviderType[];

/**
 * Provider connection mode.
 *
 * Adapter routing still uses ProviderConfig.type. This field describes how the
 * user reaches the provider so settings can group gateway, local, and future
 * direct official API paths without inferring that from vendor IDs.
 */
export type ProviderConnectionKind = 'gateway' | 'local' | 'direct';

export const PROVIDER_CONNECTION_KINDS = [
  'gateway',
  'local',
  'direct',
] as const satisfies readonly ProviderConnectionKind[];

/**
 * Protocol profile used by the provider endpoint.
 */
export type ProviderProtocolProfile =
  'newapi' | 'openai-chat' | 'openai-responses' | 'anthropic' | 'google' | 'ollama';

export const PROVIDER_PROTOCOL_PROFILES = [
  'newapi',
  'openai-chat',
  'openai-responses',
  'anthropic',
  'google',
  'ollama',
] as const satisfies readonly ProviderProtocolProfile[];

/**
 * Support confidence for built-in and user-configured providers.
 */
export type ProviderSupportLevel = 'verified' | 'compatible' | 'experimental' | 'custom';

export const PROVIDER_SUPPORT_LEVELS = [
  'verified',
  'compatible',
  'experimental',
  'custom',
] as const satisfies readonly ProviderSupportLevel[];

/**
 * AI service provider configuration
 */
export interface ProviderConfig {
  /** Unique provider identifier */
  id: string;
  /** API identifier used when calling the API */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Provider type for adapter selection */
  type: ProviderType;
  /** API endpoint URL */
  apiUrl: string;
  /** API key (optional, can be set via environment) */
  apiKey?: string;
  /** Whether provider is enabled */
  enabled: boolean;
  /** Connection path for grouping gateway, local, and future direct providers */
  connectionKind?: ProviderConnectionKind;
  /** Protocol profile implemented by the provider endpoint */
  protocolProfile?: ProviderProtocolProfile;
  /** Product support confidence for this provider profile */
  supportLevel?: ProviderSupportLevel;
  /** Whether this provider requires an API key to be considered configured */
  requiresApiKey?: boolean;
  /** Whether this is a builtin provider */
  builtin?: boolean;
  /**
   * Whether provider supports beta/experimental features (e.g., extended thinking).
   * Set to false for proxy services like nekoapi that may not support beta headers.
   * Defaults to true for official API endpoints.
   */
  supportsBeta?: boolean;
  /**
   * Use Authorization: Bearer instead of x-api-key header.
   * Set to true for proxy services like newapi/one-api that expect Bearer auth.
   * Defaults to false (use native x-api-key for Anthropic).
   */
  useBearerAuth?: boolean;
  /** Provider-specific options */
  options?: Record<string, unknown>;
  /**
   * Protocol variant configuration for OpenAI-compatible APIs.
   * Only used when type is 'generic'.
   * Allows customizing URL paths, authentication, and streaming behavior.
   */
  protocolVariant?: ProtocolVariant;
}

/**
 * Model capabilities
 */
export type ModelCapability =
  // LLM capabilities
  | 'chat'
  | 'llm.chat'
  | 'llm.plan'
  | 'llm.judge'
  | 'llm.vision'
  | 'completion'
  | 'vision'
  | 'function_calling'
  | 'json_mode'
  | 'streaming'
  | 'embedding'
  | 'code'
  | 'audio'
  | 'vision_video'
  | 'reasoning'
  // Media generation capabilities
  | 'text_to_image'
  | 'image.generate'
  | 'image.edit'
  | 'image.understand'
  | 'image_to_image'
  | 'text_to_video'
  | 'video.generate'
  | 'video.understand'
  | 'video.safety'
  | 'image_to_video'
  | 'video_to_video'
  | 'text_to_audio'
  | 'audio.generate'
  | 'audio.tts'
  | 'audio.asr'
  | 'audio.understand'
  | 'audio.music.generate'
  | 'content.safety.moderate'
  | 'local.video.probe'
  | 'text_to_music'
  | 'workflow'
  | 'image_edit'
  | 'video_edit'
  | 'controlnet'
  | 'ip_adapter'
  // Legacy aliases (for backwards compatibility)
  | 'image_generation'
  | 'video_generation';

export const KNOWN_MODEL_CAPABILITIES = [
  'chat',
  'llm.chat',
  'llm.plan',
  'llm.judge',
  'llm.vision',
  'completion',
  'vision',
  'function_calling',
  'json_mode',
  'streaming',
  'embedding',
  'code',
  'audio',
  'vision_video',
  'reasoning',
  'text_to_image',
  'image.generate',
  'image.edit',
  'image.understand',
  'image_to_image',
  'text_to_video',
  'video.generate',
  'video.understand',
  'video.safety',
  'image_to_video',
  'video_to_video',
  'text_to_audio',
  'audio.generate',
  'audio.tts',
  'audio.asr',
  'audio.understand',
  'audio.music.generate',
  'content.safety.moderate',
  'local.video.probe',
  'text_to_music',
  'workflow',
  'image_edit',
  'video_edit',
  'controlnet',
  'ip_adapter',
  'image_generation',
  'video_generation',
] as const satisfies readonly ModelCapability[];

/**
 * Model configuration
 */
export interface ModelConfig {
  /** Unique model identifier */
  id: string;
  /** API model name used when calling the API */
  name: string;
  /** Display name for UI */
  displayName?: string;
  /** Provider this model belongs to */
  providerId: string;
  /**
   * Request protocol profile for this model.
   * Overrides the provider's protocolProfile only when a multiplex gateway exposes
   * models that require different wire protocols.
   */
  protocolProfile?: ProviderProtocolProfile;
  /**
   * Adapter type override for older config files.
   * Prefer protocolProfile for request protocol differences.
   */
  protocol?: ProviderType;
  /**
   * Use Authorization: Bearer instead of x-api-key header.
   * Overrides provider's useBearerAuth if specified.
   * Set to true for proxy services like newapi/one-api that expect Bearer auth.
   */
  useBearerAuth?: boolean;
  /**
   * Whether this model supports beta/experimental features (e.g., extended thinking).
   * Overrides provider's supportsBeta if specified.
   * Set to false for proxy services that don't support beta headers.
   */
  supportsBeta?: boolean;
  /**
   * Model type for classification and routing.
   * Optional — when omitted, inferred from capabilities for backward compatibility.
   */
  type?: ModelType;
  /** Model capabilities */
  capabilities: ModelCapability[] | string[];
  /** Optional contributed provider/model expression profile id for this model. */
  providerExpressionProfileId?: string;
  /** Total context window size in tokens */
  contextWindow?: number;
  /** Maximum output generation tokens supported by the model */
  maxOutputTokens?: number;
  /** Cost per 1K input tokens (USD) */
  inputCostPer1k?: number;
  /** Cost per 1K output tokens (USD) */
  outputCostPer1k?: number;
  /** Whether model is enabled */
  enabled: boolean;
  /** Model-specific options */
  options?: Record<string, unknown>;
}

// =============================================================================
// MCP Server Configuration
// =============================================================================

export type MCPServerCategory =
  'filesystem' | 'database' | 'api' | 'development' | 'productivity' | 'ai' | 'other';

export interface MCPToolInfo {
  name: string;
  description: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  category: MCPServerCategory;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
  builtin?: boolean;
  homepage?: string;
  tools?: MCPToolInfo[];
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number;
}

// =============================================================================
// Prompt Preset Configuration
// =============================================================================

export type PromptPresetType =
  | 'chat'
  | 'coder'
  | 'screenwriter'
  | 'storyboard'
  | 'image'
  | 'video'
  | 'audio'
  | 'plan'
  | 'custom';

/**
 * Prompt source - where the prompt configuration comes from
 */
export type PromptSource = 'builtin' | 'personal' | 'project';

export interface PromptPresetConfig {
  id: string;
  name: string;
  nameKey?: string;
  type: PromptPresetType;
  description: string;
  descriptionKey?: string;
  systemPrompt: string;
  icon?: string;
  autoExecuteTools?: boolean;
  streamResponses?: boolean;
  showToolCalls?: boolean;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: string;
  preferredModel?: string;
  enabled: boolean;
  builtin?: boolean;
  /** Source of the prompt configuration */
  source?: PromptSource;
  /** File path for user/project prompts (used for "Open in VSCode" feature) */
  filePath?: string;
  /** Internal prompts are not shown in the UI */
  internal?: boolean;
}

// =============================================================================
// Aggregated Configuration State
// =============================================================================

export interface ConfigState {
  providers: ProviderConfig[];
  models: ModelConfig[];
  mcpServers: MCPServerConfig[];
  /** Configured skills (semantic discovery) */
  skills?: import('./skill').ConfiguredSkill[];
  /** Configured slash commands */
  commands?: import('./skill').ConfiguredSlashCommand[];
}

// =============================================================================
// User-configured items (with user overrides applied)
// =============================================================================

export interface ConfiguredMCPServer extends MCPServerConfig {
  /** Connection status */
  status?: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

export interface ConfiguredPrompt extends PromptPresetConfig {
  // Additional runtime state can be added here
}

// =============================================================================
// Chat Model Options (for UI model selector)
// =============================================================================

/**
 * Model type for classification and routing
 */
export type ModelType = 'llm' | 'image' | 'video' | 'audio';

export const MODEL_TYPES = [
  'llm',
  'image',
  'video',
  'audio',
] as const satisfies readonly ModelType[];

/**
 * Media model type (excludes LLM)
 */
export type MediaModelType = Exclude<ModelType, 'llm'>;

export const MEDIA_MODEL_TYPES = [
  'image',
  'video',
  'audio',
] as const satisfies readonly MediaModelType[];

/**
 * Default model binding.
 *
 * The config file keeps provider and model identity separate so user-authored
 * TOML does not depend on a packed `provider:model` string format.
 */
export interface ModelRefConfig {
  providerId: string;
  modelId: string;
  /** Optional contributed provider/model expression profile id for this model binding. */
  providerExpressionProfileId?: string;
}

export type TypeDefaultModels = Partial<Record<ModelType, ModelRefConfig>>;

/**
 * Default model bindings by product purpose.
 *
 * These bindings are intentionally separate from TypeDefaultModels: for
 * example `video.understand` is served by an LLM with native video input, while
 * `defaultModels.video` remains reserved for video generation models. The same
 * separation applies to `image.understand` and `audio.understand`.
 */
export type PurposeDefaultModels = Partial<Record<string, ModelRefConfig>>;

export interface LlmParameterControlAvailability {
  readonly reasoning: boolean;
  readonly verbosity: boolean;
  readonly creativity: boolean;
  readonly maxOutputTokens: boolean;
}

/**
 * Chat model option for UI model selector dropdown
 * Built by Platform layer from enabled providers and models
 */
export interface ChatModelOption {
  /** Unique identifier: 'providerId:modelId' */
  id: string;
  /** Display label: 'Provider Name / Model Name' */
  label: string;
  /** Provider ID */
  providerId: string;
  /** Model ID */
  modelId: string;
  /** Provider display label for source-grouped selectors */
  providerLabel?: string;
  /** Secret-free provider source used for grouping and trust badges */
  source?: 'explicit-config' | string;
  /** Connection path for grouping direct, gateway, and local providers */
  connectionKind?: ProviderConnectionKind;
  /** Protocol profile implemented by the provider endpoint */
  protocolProfile?: ProviderProtocolProfile;
  /** Product support confidence for this provider profile */
  supportLevel?: ProviderSupportLevel;
  /** Model capabilities (optional, for filtering) */
  capabilities?: readonly string[];
  /** Optional contributed provider/model expression profile id for this model. */
  providerExpressionProfileId?: string;
  /** Model type for UI grouping */
  category?: ModelType;
  /** Total context window size in tokens, when known */
  contextWindow?: number;
  /** Maximum output generation tokens supported by the model, when known */
  maxOutputTokens?: number;
  /** LLM parameter controls that are meaningful for this model/provider pair */
  llmParameterControls?: LlmParameterControlAvailability;
}
