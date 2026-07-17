/**
 * TUI State Types
 *
 * Core state types for Zustand stores.
 * Aligned with AgentEvent from @neko/agent session types.
 */

import type { AgentResult } from '@neko/agent';
import type {
  AgentContinuationMetadata,
  AgentMessageQueueSnapshot,
  AgentQueuedMessageDisplayKind,
  AgentTurnSource,
} from '@neko-agent/types';

import type { Task } from '@neko/shared';

export type TerminalTimelineRowKind =
  'assistant_text' | 'thinking' | 'tool' | 'task' | 'media' | 'error' | 'diagnostic';

export type TerminalTimelineRowStatus =
  | 'streaming'
  | 'pending'
  | 'running'
  | 'waiting'
  | 'success'
  | 'error'
  | 'complete'
  | 'queued'
  | 'processing'
  | 'cancelled';

export interface TerminalTimelineParentAnchor {
  readonly kind: 'turn' | 'tool' | 'item';
  readonly id?: string;
}

export interface TerminalTimelineRow {
  readonly id: string;
  readonly sequence: number;
  readonly kind: TerminalTimelineRowKind;
  readonly status: TerminalTimelineRowStatus;
  readonly parent?: TerminalTimelineParentAnchor;
  readonly content?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  /** Structured tool input retained for debug automation without restoring Message.toolCalls projection. */
  readonly toolArguments?: Readonly<Record<string, unknown>>;
  /** Structured tool result retained for deterministic debug automation assertions. */
  readonly toolResult?: unknown;
  /** Structured tool failure retained separately from the user-facing result summary. */
  readonly toolError?: string;
  readonly argsSummary?: string;
  readonly resultSummary?: string;
  readonly backfillSummary?: string;
  readonly confirmationSummary?: string;
  readonly taskId?: string;
  readonly taskTitle?: string;
  readonly taskKind?: string;
  readonly progress?: number;
  readonly details?: string;
  readonly diagnosticCode?: string;
  readonly artifactFacts?: readonly TerminalArtifactFact[];
  readonly timestamp: number;
}

export interface TerminalArtifactFact {
  readonly ref: string;
  readonly kind:
    'file' | 'resource-ref' | 'generated-asset' | 'project-revision' | 'composite-artifact';
  readonly relativePath?: string;
  readonly digest?: string;
  readonly revision?: string;
  readonly provenance: {
    readonly source: string;
    readonly skillId?: string;
    readonly toolCallId?: string;
    readonly taskId?: string;
    readonly providerId?: string;
  };
  readonly deliveryStatus: 'delivered' | 'failed' | 'partial' | 'cancelled' | 'unavailable';
  readonly validator: {
    readonly id: string;
    readonly status: 'valid' | 'invalid' | 'unavailable';
  };
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: 'info' | 'warning' | 'error' | 'suggestion';
    readonly message: string;
  }[];
}

/**
 * Message in conversation history
 */
export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly source?: AgentTurnSource;
  readonly displayKind?: AgentQueuedMessageDisplayKind | 'assistant-message' | 'system-note';
  readonly metadata?: AgentContinuationMetadata;
  content: string;
  thinking?: string;
  toolCalls: ToolCallState[];
  todos: TodoItem[];
  timelineRows?: TerminalTimelineRow[];
  readonly timestamp: number;
  /** True for error messages, false for informational system messages */
  readonly isError?: boolean;
}

/**
 * Tool call lifecycle state
 */
export interface ToolCallState {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
}

/**
 * Todo item rendered in assistant messages
 */
export interface TodoItem {
  readonly content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
}

/**
 * Agent execution status
 */
export type AgentStatus = 'idle' | 'running' | 'waiting_confirmation' | 'error';

/**
 * Execution mode (aligned with @neko/agent ExecutionMode)
 */
export type ExecutionMode = 'plan' | 'ask' | 'auto';

/**
 * Session mode (aligned with @neko-agent/types SessionMode)
 */
export type SessionMode = 'agent' | 'image' | 'video' | 'audio';

/**
 * Token usage stats
 */
export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly total: number;
}

export interface ContextTokenState {
  readonly count: number | null;
}

/**
 * Iteration progress
 */
export interface IterationProgress {
  readonly current: number;
  readonly max: number;
}

export interface MessageQueueState {
  readonly snapshot: AgentMessageQueueSnapshot | null;
  readonly diagnostic: string | null;
  readonly pausedAfterCancel: boolean;
}

export interface TaskStatusState {
  readonly running: readonly Task[];
}

/**
 * Terminal dimensions
 */
export interface TerminalSize {
  readonly rows: number;
  readonly columns: number;
}

/**
 * TUI run result (extends CLIResult pattern)
 */
export interface TUIResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly agentResult?: AgentResult;
  readonly duration: number;
}
