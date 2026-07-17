/**
 * Platform Interface - Abstraction for platform capabilities
 *
 * This interface defines the contract between agent and platform packages.
 * Agent can optionally depend on platform for advanced features like
 * media generation, workflow execution, and LLM routing.
 */

// Note: Tool type is in ./tool.ts for simpler tool definitions
// ToolDefinition is used for function calling with full schema

import type { AgentTraceContext } from './agent-trace';
import type { CreativeDomainMetadata } from './domain-routing';
import type { ToolPlanningMetadata } from './tool-planning';
import type { TaskRunScope } from './task';

/**
 * Chat message format
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  /** Provider reasoning content that must be replayed with assistant messages. */
  reasoningContent?: string;
  /** Tool call ID (for tool result messages) */
  toolCallId?: string;
  /** Tool calls from assistant (for function calling) */
  toolCalls?: ToolCall[];
}

/**
 * Content part for multimodal messages
 */
export type ContentPart = TextPart | ImagePart | AudioPart | VideoPart;

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  imageUrl: string;
  detail?: 'auto' | 'low' | 'high';
}

export interface AudioPart {
  type: 'audio';
  /** Base64 data URI or URL to audio content */
  audioUrl: string;
  /** MIME type (e.g., 'audio/wav', 'audio/mpeg') */
  mimeType?: string;
}

export interface VideoPart {
  type: 'video';
  /** Base64 data URI or URL to video content */
  videoUrl: string;
  /** MIME type (e.g., 'video/mp4', 'video/webm') */
  mimeType?: string;
}

/**
 * Tool call from assistant
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  type: 'function';
  /**
   * Serializable creative-domain metadata for orchestration policy. Provider
   * adapters must not merge this into function.parameters.
   */
  domain?: CreativeDomainMetadata;
  /**
   * Serializable planner metadata for safety and target preflight. Provider
   * adapters must not merge this into function.parameters.
   */
  planning?: ToolPlanningMetadata;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Service options for chat requests
 */
export interface ServiceOptions {
  /** Provider ID to use. Chat requests require this together with modelId. */
  providerId?: string;
  /** Model ID to use. Chat requests require this together with providerId. */
  modelId?: string;
  /** Capabilities declared by the explicitly selected model. */
  modelCapabilities?: readonly string[];
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Top P sampling */
  topP?: number;
  /** Frequency penalty */
  frequencyPenalty?: number;
  /** Presence penalty */
  presencePenalty?: number;
  /** Response format */
  responseFormat?: { type: 'text' | 'json_object' };
  /** Tools for function calling */
  tools?: ToolDefinition[];
  /** Tool choice behavior */
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  /** Runtime prompt locale used by model-facing projection wrappers. */
  locale?: string;
  /** Enable extended thinking (Claude only) */
  thinkingBudget?: number;
  /**
   * Provider-specific AI SDK request options projected by the platform layer
   * after model capability validation.
   */
  providerOptions?: Record<string, unknown>;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Timeout in milliseconds */
  timeout?: number;

  /**
   * Structured system prompt sections with cache control markers.
   * When provided, Anthropic adapter uses these to apply prompt caching.
   * Other adapters ignore this field.
   */
  systemPromptSections?: Array<{
    content: string;
    cacheControl?: 'ephemeral';
  }>;

  /**
   * Optional async message projection hook used by platform adapters to enrich
   * generic chat history with provider-ready multimodal content at send time.
   */
  messageProjector?: (input: {
    messages: readonly ChatMessage[];
    providerId?: string;
    modelId?: string;
    modelCapabilities?: readonly string[];
    locale?: string;
  }) => Promise<readonly ChatMessage[]> | readonly ChatMessage[];
}

/**
 * Runtime-only call context for service invocations.
 *
 * This is intentionally separate from ServiceOptions because ServiceOptions is
 * projected into provider chat options. Trace data must stay in runtime logs
 * and must not leak into provider payloads.
 */
export interface ServiceCallContext {
  readonly trace?: AgentTraceContext;
}

/**
 * Service response
 */
export interface ServiceResponse {
  /** Response ID */
  id: string;
  /** Model used */
  model: string;
  /** Response message */
  message: ChatMessage;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Token usage */
  usage: TokenUsage;
  /** Extended thinking content for UI presentation */
  thinking?: string;
  /** Provider reasoning content for protocol replay */
  reasoningContent?: string;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Stream chunk
 */
export interface StreamChunk {
  type: 'content' | 'thinking' | 'tool_call' | 'usage' | 'done';
  content?: string;
  reasoningContent?: string;
  toolCall?: Partial<ToolCall>;
  usage?: ServiceResponse['usage'];
  finishReason?: ServiceResponse['finishReason'];
}

/**
 * Service interface - abstraction for AI service operations
 */
export interface IService {
  /**
   * Send a chat request and get a complete response
   */
  chat(
    messages: ChatMessage[],
    options?: ServiceOptions,
    context?: ServiceCallContext,
  ): Promise<ServiceResponse>;

  /**
   * Send a chat request and get a streaming response
   */
  chatStream(
    messages: ChatMessage[],
    options?: ServiceOptions,
    context?: ServiceCallContext,
  ): AsyncIterable<StreamChunk>;

  /**
   * Generate embeddings for text
   */
  embed(texts: string[]): Promise<{ embeddings: number[][] }>;
}

/**
 * Media task status
 */
export type MediaTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Media task
 */
export interface MediaTask {
  scope: TaskRunScope;
  id: string;
  type: 'image' | 'video' | 'audio';
  status: MediaTaskStatus;
  progress?: number;
  result?: {
    url: string;
    width?: number;
    height?: number;
    duration?: number;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Media generation request base
 */
export interface MediaGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  provider?: string;
  model?: string;
}

/**
 * Image generation request
 */
export interface ImageGenerationRequest extends MediaGenerationRequest {
  width?: number;
  height?: number;
  style?: string;
  referenceImage?: string;
  /** Reference image URL for image-to-image workflows */
  referenceImageUrl?: string;
  /** Reference image as base64-encoded PNG */
  referenceImageBase64?: string;
  /** Reference image local URI/path for extension-host side media services */
  referenceImageUri?: string;
  /** Inpaint mask as base64-encoded grayscale PNG */
  maskBase64?: string;
  /** Inpaint mask local URI/path for extension-host side media services */
  maskUri?: string;
  /** ControlNet conditioning image as base64-encoded PNG */
  controlImageBase64?: string;
  /** ControlNet conditioning image local URI/path for extension-host side media services */
  controlImageUri?: string;
}

/**
 * Video generation request
 */
export interface VideoGenerationRequest extends MediaGenerationRequest {
  duration?: number;
  fps?: number;
  referenceImage?: string;
  referenceVideo?: string;
}

/**
 * Audio generation request
 */
export interface AudioGenerationRequest extends MediaGenerationRequest {
  duration?: number;
  voice?: string;
}

/**
 * Media generation service interface
 */
export interface IMediaGenerationService {
  /**
   * Generate an image
   */
  generateImage(request: ImageGenerationRequest): Promise<MediaTask>;

  /**
   * Generate a video
   */
  generateVideo(request: VideoGenerationRequest): Promise<MediaTask>;

  /**
   * Generate audio
   */
  generateAudio(request: AudioGenerationRequest): Promise<MediaTask>;

  /**
   * Wait for task completion
   */
  waitForTask(taskScope: TaskRunScope, timeoutMs?: number): Promise<MediaTask>;

  /**
   * Cancel a task
   */
  cancelTask(taskScope: TaskRunScope): Promise<boolean>;

  /**
   * Get task status
   */
  getTask(taskScope: TaskRunScope): Promise<MediaTask | undefined>;

  /**
   * Subscribe to task progress
   */
  onProgress(taskScope: TaskRunScope, callback: (task: MediaTask) => void): () => void;
}

/**
 * Media task manager interface (for async media generation tasks)
 * This is a simplified interface for UI/platform integration.
 * For the full TaskManager implementation, see @neko/agent.
 */
export interface IMediaTaskManager {
  /**
   * Get task by ID
   */
  get(scope: TaskRunScope): Promise<MediaTask | undefined>;

  /**
   * List tasks
   */
  list(filter?: { status?: MediaTaskStatus; type?: string }): Promise<MediaTask[]>;

  /**
   * Cancel a task
   */
  cancel(scope: TaskRunScope): Promise<boolean>;
}

/**
 * Config manager interface
 */
export interface IConfigManager {
  /**
   * Get configuration value
   */
  get<T>(key: string): T | undefined;

  /**
   * Set configuration value
   */
  set(key: string, value: unknown): void;

  /**
   * Check if provider is enabled
   */
  isProviderEnabled(providerId: string): boolean;

  /**
   * Get enabled providers
   */
  getEnabledProviders(): string[];
}

/**
 * Provider registry interface
 */
export interface IProviderRegistry {
  /**
   * Check if provider is available
   */
  isAvailable(providerId: string): boolean;

  /**
   * List available providers
   */
  list(): string[];

  /**
   * Get provider health status
   */
  getHealth(providerId: string): { healthy: boolean; lastError?: string };
}

/**
 * Platform interface - full platform capabilities
 *
 * This is the main interface that agent uses when integrated with platform.
 * All properties are readonly to ensure platform manages its own state.
 */
export interface IPlatform {
  /**
   * Configuration manager
   */
  readonly config: IConfigManager;

  /**
   * Provider registry
   */
  readonly providers: IProviderRegistry;

  /**
   * Media generation service
   */
  readonly media: IMediaGenerationService;

  /**
   * Task manager
   */
  readonly tasks: IMediaTaskManager;

  /**
   * Create a service instance for a specific group
   */
  createService(groupId?: string): IService;

  /**
   * Dispose platform resources
   */
  dispose(): void;
}

/**
 * Lightweight LLM provider config (for standalone agent)
 */
export interface LLMProviderConfig {
  /** API key */
  apiKey: string;
  /** Model ID */
  model: string;
  /** API base URL (optional) */
  baseUrl?: string;
  /** Provider type */
  provider?: 'openai' | 'anthropic' | 'azure' | 'ollama';
}
