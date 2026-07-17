/** Host projection types consumed by the TUI and VS Code presentation adapters. */

import type {
  AgentTaskResultFollowUpRequest,
} from '@neko/shared';
import type { AgentMessageQueueSnapshot, AgentQueuedMessageItem } from '@neko-agent/types';

// Re-export validation types
export type { ValidationError, ValidationWarning } from '../validation/types';

// Re-export permission types
export type { ToolConfirmationRequest, PermissionMode } from '../permission/types';

// =============================================================================
// Execution Mode
// =============================================================================

/**
 * Execution mode for agent
 * - plan: Only generate plan, don't execute tools
 * - ask: Require user confirmation for each tool call
 * - auto: Auto execute all tools
 */
export type ExecutionMode = 'plan' | 'ask' | 'auto';

export interface AgentEventErrorRecord {
  readonly message: string;
  readonly name?: string;
}

// Session Events
// =============================================================================

/**
 * Agent event types
 */
export type AgentEventType =
  | 'user_message'
  | 'compaction'
  | 'compaction_failed'
  | 'memory_extraction' // Semantic memory extraction/write pipeline event
  | 'agent.observation.created' // Agent-first multimodal observation recorded
  | 'agent.evidence.attached' // Optional evidence attached to an observation/rationale
  | 'agent.rationale.created' // Agent decision rationale recorded
  | 'agent.task_result.followup_requested' // Async task result requested follow-up
  | 'thinking' // Agent is in thinking phase
  | 'thinking_content' // Extended thinking content (Claude)
  | 'text' // Text output (complete)
  | 'text_delta' // Streaming text chunk (incremental)
  | 'assistant_text_replacement' // Current assistant text is being internally repaired/replaced
  | 'tool_call' // Tool invocation
  | 'tool_result' // Tool execution result
  | 'tool_result_backfill' // Delayed tool result patch from background work
  | 'tool_progress' // Tool execution progress update
  | 'tool_confirmation' // Tool requires confirmation
  | 'version_recorded' // Creative version entry recorded
  | 'coordinator_event' // Coordinator orchestration event
  | 'iteration' // Iteration info
  | 'done' // Execution complete
  | 'error' // Error occurred
  | 'messageQueued'; // Message queued while agent is running

/**
 * Agent event
 */
export interface AgentEvent {
  /** Event type */
  type: AgentEventType;

  /** Text content */
  content?: string;

  /** Replacement reason for assistant_text_replacement events. */
  replacement?: {
    reason: 'output-validation-retry';
    attempt: number;
  };

  /** Number of user messages waiting behind the active run. */
  pendingCount?: number;

  /** Pending queue item accepted or affected by this event. */
  queuedMessageItem?: AgentQueuedMessageItem;

  /** Queue item removed from pending state because it began execution. */
  releasedQueuedMessageItem?: AgentQueuedMessageItem;

  /** Authoritative pending message queue snapshot. */
  messageQueueSnapshot?: AgentMessageQueueSnapshot;

  /** Extended thinking content */
  thinking?: string;

  /** Provider reasoning content that must be replayed with assistant messages. */
  reasoningContent?: string;

  /** Tool call info */
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };

  /** Tool result */
  toolResult?: {
    toolCallId: string;
    success: boolean;
    data: unknown;
    error?: string;
    /** Multimodal attachments from tool execution (e.g. generated images) */
    attachments?: import('@neko/shared').ToolResultAttachment[];
    /** Structured media perception generated after tool completion. */
    perceptionCards?: import('@neko/shared').PerceptionCard[];
    /** Diagnostics captured while merging delayed result payloads. */
    backfillDiagnostics?: import('@neko/shared').ToolResultBackfillDiagnostic[];
    /** Structured composite artifact transfer payloads. */
    artifacts?: import('@neko/shared').ToolResultArtifactTransfer[];
    /** Tool-level observability metadata projected to product consumers. */
    metadata?: Record<string, unknown>;
  };

  /** Delayed tool result backfill payload */
  toolResultBackfill?: import('@neko/shared').ToolResultBackfillPayload;

  /** Tool execution progress update */
  toolProgress?: {
    toolCallId: string;
    toolName: string;
    percent: number;
    stage: string;
    preview?: string;
  };

  /** Tool confirmation request */
  toolConfirmation?: import('../permission/types').ToolConfirmationRequest;

  /** Compaction summary event */
  compaction?: {
    timestamp: number;
    trigger: 'token_threshold' | 'turn_threshold' | 'manual';
    replacedEventIds: string[];
    summaryContent: string;
    summaryMessageRole: 'system' | 'user';
    tokenProfile: {
      before: number;
      after: number;
    };
    strategy: 'basic';
  };

  /** Compaction failure event */
  compactionFailed?: {
    trigger: 'token_threshold' | 'turn_threshold' | 'manual';
    reason: string;
    failureCount: number;
    circuitOpen: boolean;
  };

  /** Memory extraction pipeline event */
  memoryExtraction?: {
    timestamp: number;
    sourceEventIds: string[];
    facts: Array<{
      id: string;
      content: string;
      category: 'preference' | 'decision' | 'context' | 'action';
      confidence: number;
      destination: 'project';
    }>;
    writeStatus: 'pending' | 'written' | 'rejected-by-user' | 'dedup';
  };

  /** Agent-first multimodal observation event */
  agentObservation?: import('@neko/shared').AgentObservation;

  /** Optional evidence attached to the Agent-first observation/rationale graph */
  agentEvidence?: import('@neko/shared').PerceptionEvidence;

  /** Agent decision rationale event */
  agentRationale?: import('@neko/shared').DecisionRationale;

  /** Async task-result follow-up request event */
  taskResultFollowUp?: AgentTaskResultFollowUpRequest;

  /** Creative version entry (on version_recorded) */
  versionEntry?: import('@neko/shared').CreativeVersionEntry;

  /** Coordinator event (on coordinator_event) */
  coordinatorEvent?: import('@neko/shared').CoordinatorEvent;

  /** Iteration info */
  iteration?: {
    current: number;
    max: number;
  };

  /** Usage stats (on done) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };

  /** Error (on error). */
  error?: Error | AgentEventErrorRecord;
}

// Context Compression
// =============================================================================

/**
 * Context compression result
 */
export interface CompressionResult {
  /** Original token count */
  originalTokens: number;

  /** Compressed token count */
  compressedTokens: number;

  /** Compression ratio (0-1) */
  ratio: number;
}

// =============================================================================
