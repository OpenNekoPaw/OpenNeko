/**
 * Tool Types - Tool definition and execution (shared)
 */

import type { ToolDefinition } from './platform';
import { UNKNOWN_AGENT_TRACE_ID, type AgentTraceContext } from './agent-trace';
import type { ConversationRunScope } from './agent-runtime-scope';
import type { CreativeDomainMetadata } from './domain-routing';
import type {
  ToolQueryBeforeMutateGuidance,
  ToolSafetyKind,
  ToolTargetRequirements,
} from './tool-planning';
import type {
  ArtifactExecutionSummary,
  CompositeArtifactBlock,
  CompositeArtifact,
} from './composite-artifact';

export type {
  ToolPlanningMetadata,
  ToolQueryBeforeMutateGuidance,
  ToolSafetyKind,
  ToolTargetRequirements,
} from './tool-planning';

/**
 * Tool category
 */
export type ToolCategory =
  | 'timeline'
  | 'media'
  | 'audio'
  | 'project'
  | 'file'
  | 'mcp'
  | 'workflow'
  | 'system'
  | 'generation'
  | 'analysis'
  | 'document';

/**
 * Tool filter options for toToolDefinitions()
 */
export interface ToolFilterOptions {
  /** Include only these tool names */
  include?: string[];

  /** Exclude these tool names */
  exclude?: string[];

  /** Include only tools from these categories */
  categories?: ToolCategory[];
}

/**
 * Options for projecting runtime tool definitions into model-visible schemas.
 */
export interface ToolDefinitionProjectionOptions {
  /** Runtime prompt locale used for model-facing descriptions. */
  locale?: string;
}

/**
 * Validation error detail for schema validation failures.
 * Structured so LLM can self-correct on retry.
 */
export interface ToolValidationError {
  /** JSON path to the invalid field (e.g. "duration") */
  field: string;
  /** Expected constraint description */
  expected: string;
  /** Actual value that was provided */
  actual: unknown;
  /** Human-readable error message */
  message: string;
}

/**
 * Multimodal attachment returned by a tool (e.g. generated image preview).
 */
export interface ToolResultAttachment {
  type: 'image' | 'audio' | 'video';
  /**
   * Backward-compatible path/URI reference to the generated asset.
   * New persisted results should use stable relative paths or ${VAR}/path
   * values. Host-specific absolute paths are adapter-only compatibility data.
   */
  path: string;
  /** Optional MIME type hint */
  mimeType?: string;
  /** Stable asset reference for generated or perceptual assets. */
  assetRef?: import('./perception-card').PerceptualAssetRef;
}

export interface ToolResultArtifactSnapshot {
  readonly type: 'artifactSnapshot';
  readonly artifact: CompositeArtifact;
  readonly complete?: boolean;
  readonly blockCursor?: string;
}

export interface ToolResultArtifactBlockPage {
  readonly type: 'artifactBlockPage';
  readonly artifactId: string;
  readonly blocks: readonly CompositeArtifactBlock[];
  readonly cursor?: string;
  readonly complete: boolean;
}

export interface ToolResultArtifactBackfill {
  readonly type: 'artifactBackfill';
  readonly artifact: CompositeArtifact;
  readonly mergeMode?: 'append' | 'replace';
}

export interface ToolResultArtifactExecutionSummary {
  readonly type: 'artifactExecutionSummary';
  readonly summary: ArtifactExecutionSummary;
}

export type ToolResultArtifactTransfer =
  | ToolResultArtifactSnapshot
  | ToolResultArtifactBlockPage
  | ToolResultArtifactBackfill
  | ToolResultArtifactExecutionSummary;

/**
 * Progress update emitted during long-running tool execution.
 */
export interface ToolProgress {
  /** Completion percentage (0-100) */
  percent: number;
  /** Current processing stage description */
  stage: string;
  /** Optional preview path or data URI */
  preview?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  duration?: number;
  /** Schema validation errors (present when input fails validation) */
  validationErrors?: ToolValidationError[];
  /** Multimodal attachments (e.g. generated image/audio/video previews) */
  attachments?: ToolResultAttachment[];
  /** Structured media perception generated after tool completion. */
  perceptionCards?: import('./perception-card').PerceptionCard[];
  /** Diagnostics captured while merging delayed tool result backfill data. */
  backfillDiagnostics?: import('./perception-card').ToolResultBackfillDiagnostic[];
  /** Structured composite artifact transfer payloads. */
  artifacts?: ToolResultArtifactTransfer[];
}

/**
 * JSON Schema property definition for tool parameters
 */
export interface ToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  items?: Record<string, unknown>;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  [key: string]: unknown;
}

/**
 * Tool parameter schema — must be a valid JSON Schema object type.
 * This ensures the schema is accepted by OpenAI/Claude function-calling APIs.
 */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  anyOf?: Array<{ required: string[] }>;
  additionalProperties?: boolean;
}

/**
 * Tool behavioral traits for creative permission decisions.
 *
 * Used by PermissionRuleMatcher to conditionally allow/ask in auto mode:
 * - Reversible OR local tools → auto-allow
 * - Network + within budget → auto-allow
 * - Over budget or irreversible + network → ask user
 */
export interface ToolTraits {
  /** Estimated cost tier for a single invocation */
  cost: 'free' | 'cheap' | 'moderate' | 'expensive';
  /** Whether the operation can be undone */
  reversible: boolean;
  /** Where computation happens */
  locality: 'local' | 'network' | 'hybrid';
  /** Severity of impact if something goes wrong */
  impactLevel: 'none' | 'low' | 'high' | 'critical';
}

export interface ToolRuntimeRequirements {
  readonly vscode?: boolean;
  readonly activeEditor?: boolean;
  readonly mediaService?: boolean;
  readonly engineBridge?: boolean;
  readonly contentAccess?: boolean;
  readonly writableProject?: boolean;
}

/**
 * Default traits for tools without explicit declaration.
 * Assumes safe, local, free, reversible — the most permissive defaults.
 */
export const DEFAULT_TOOL_TRAITS: ToolTraits = {
  cost: 'free',
  reversible: true,
  locality: 'local',
  impactLevel: 'none',
};

/**
 * Options passed to Tool.execute() at call time.
 */
export interface ToolExecuteOptions {
  /** Progress callback for long-running tools */
  onProgress?: (progress: ToolProgress) => void;
  /** Cancellation owned by the active Agent tool call. */
  signal?: AbortSignal;
  /**
   * Turn-scoped, purpose-bound model runtime supplied by the Agent host.
   *
   * The Tool cannot select or fall back to another model. The runtime closes
   * over the immutable turn policy and exposes only a bounded completion call.
   */
  purposeModel?: ToolPurposeModelRuntime;
  /** Host/runtime metadata that should not be exposed as model-authored tool arguments */
  metadata?: Record<string, unknown>;
  /** Runtime trace context for structured debug logging */
  trace?: AgentTraceContext;
}

export type ToolPurposeModelPurpose =
  | 'image.understand'
  | 'audio.understand'
  | 'video.understand';

export interface ToolPurposeModelImage {
  readonly data: string;
  readonly mimeType: string;
}

export interface ToolPurposeModelCompletionInput {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly images?: readonly ToolPurposeModelImage[];
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface ToolPurposeModelCompletionResult {
  readonly text: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

export interface ToolPurposeModelRuntime {
  readonly purpose: ToolPurposeModelPurpose;
  readonly providerId: string;
  readonly modelId: string;
  complete(
    input: ToolPurposeModelCompletionInput,
  ): Promise<ToolPurposeModelCompletionResult>;
}

/**
 * Require the immutable conversation/run owner attached by the Agent executor.
 * Runtime-owned work must never infer ownership from active UI state or local child ids.
 */
export function requireToolExecutionRunScope(
  options: ToolExecuteOptions | undefined,
): ConversationRunScope {
  const metadataConversationId = readToolExecutionOwnerId(
    options?.metadata?.conversationId,
    'metadata.conversationId',
  );
  const traceConversationId = ignoreUnknownTraceOwner(
    readToolExecutionOwnerId(options?.trace?.conversationId, 'trace.conversationId'),
  );
  const conversationId = requireMatchingToolExecutionOwnerId(
    'conversationId',
    metadataConversationId,
    traceConversationId,
  );
  if (conversationId === UNKNOWN_AGENT_TRACE_ID) {
    throw new Error('Tool execution requires a concrete conversationId owner.');
  }

  const runId = requireMatchingToolExecutionOwnerId(
    'runId',
    readToolExecutionOwnerId(options?.metadata?.runId, 'metadata.runId'),
    readToolExecutionOwnerId(options?.trace?.runId, 'trace.runId'),
  );
  return { conversationId, runId };
}

/** Attach canonical Agent execution ownership to an internal async-work request. */
export function withToolExecutionRunMetadata(
  options: ToolExecuteOptions | undefined,
  metadata: Record<string, unknown> | undefined = undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    ...requireToolExecutionRunScope(options),
  };
}

function ignoreUnknownTraceOwner(value: string | undefined): string | undefined {
  return value === UNKNOWN_AGENT_TRACE_ID ? undefined : value;
}

function readToolExecutionOwnerId(value: unknown, source: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Tool execution requires non-empty ${source}.`);
  }
  return value.trim();
}

function requireMatchingToolExecutionOwnerId(
  field: 'conversationId' | 'runId',
  metadataValue: string | undefined,
  traceValue: string | undefined,
): string {
  if (metadataValue && traceValue && metadataValue !== traceValue) {
    throw new Error(
      `Tool execution ${field} owner mismatch: metadata=${metadataValue}, trace=${traceValue}.`,
    );
  }
  const value = metadataValue ?? traceValue;
  if (!value) {
    throw new Error(`Tool execution requires ${field} ownership.`);
  }
  return value;
}

/**
 * Tool definition
 */
export type ToolKind = 'standard' | 'perception' | 'operation';

export interface ToolLocalization {
  /** Localized tool description for model-facing tool definitions. */
  readonly description?: string;
  /** Localized model-facing parameter descriptions, keyed by property name or dotted path. */
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface Tool {
  /** Discriminant for capability-specific tool metadata. */
  kind?: ToolKind;
  /** Tool name (unique identifier) */
  name: string;
  /** Tool description for LLM */
  description: string;
  /** Optional localized model-facing descriptions, keyed by locale such as en, zh, or zh-cn. */
  localization?: Readonly<Record<string, ToolLocalization>>;
  /** Parameter schema (JSON Schema object) */
  parameters: ToolParameters;
  /** Tool category */
  category: ToolCategory;
  /** Whether tool requires confirmation */
  requiresConfirmation?: boolean;
  /** Declarative safety class used by Agent planning and permission policy. */
  safetyKind?: ToolSafetyKind;
  /** Target data needed before executing stateful mutation tools. */
  targetRequirements?: ToolTargetRequirements;
  /** Runtime ports or host affordances required before this tool can be used. */
  requirements?: ToolRuntimeRequirements;
  /** Query-before-mutate hints for planners and capability introspection. */
  queryBeforeMutate?: ToolQueryBeforeMutateGuidance;
  /** Behavioral traits for creative permission system */
  traits?: ToolTraits;
  /** Serializable creative-domain metadata for orchestration routing. */
  domain?: CreativeDomainMetadata;

  // --- Concurrency & safety metadata (Fail-Closed: all default false) ---

  /**
   * Whether this tool is safe to run concurrently with other tool calls.
   * Default false (Fail-Closed). Mark true for stateless generation tools
   * (e.g. GenerateImage, GenerateTTS) that don't mutate shared state.
   */
  isConcurrencySafe?: boolean;

  /**
   * Whether this tool only reads state and never modifies it.
   * Default false (Fail-Closed). Mark true for query tools
   * (e.g. GetTimelineInfo, ListTimelineElements).
   */
  isReadOnly?: boolean;

  /**
   * Whether this tool performs irreversible destructive operations.
   * Default false. Mark true for deletion tools
   * (e.g. DeleteTimelineElement, DeleteTrack).
   * Destructive tools may require additional user confirmation.
   */
  isDestructive?: boolean;

  /** Tool execution handler */
  execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult>;
}

/**
 * Tool execution configuration
 */
export interface ToolExecutionConfig {
  /** Timeout in milliseconds */
  timeout: number;
  /** Retry policy */
  retry: {
    maxRetries: number;
    retryableErrors: string[];
  };
}

/**
 * Tool call from model
 */
export interface ToolCallRequest {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Call ID for tracking */
  callId: string;
}

/**
 * Tool registry interface
 */
export interface IToolRegistry {
  /** Register a tool */
  register(tool: Tool): void;

  /** Unregister a tool */
  unregister(name: string): void;

  /** Get tool by name */
  get(name: string): Tool | undefined;

  /** Check if a tool exists */
  has?(name: string): boolean;

  /** List all tools */
  list(): Tool[];

  /** List tools by category */
  listByCategory(category: ToolCategory): Tool[];

  /** Execute a tool */
  execute(
    name: string,
    args: Record<string, unknown>,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult>;

  /**
   * Convert tools to LLM tool definitions
   * @param filter Optional filter to limit which tools are included
   * @param options Optional projection options for model-facing metadata
   */
  toToolDefinitions(
    filter?: ToolFilterOptions,
    options?: ToolDefinitionProjectionOptions,
  ): ToolDefinition[];

  /** Get tool count (optional) */
  readonly size?: number;

  /** Clear all tools (optional) */
  clear?(): void;

  /** Register multiple tools at once (optional) */
  registerMany?(tools: Tool[]): void;
}
