/**
 * Unified Agent Message Types
 *
 * Defines all message types for communication between:
 * - Extension Host and Webview (assistant)
 * - Agent session events
 * - CLI output events
 *
 * This is the Single Source of Truth for agent-related message types.
 */

import type { TokenUsage } from './platform';

// =============================================================================
// Message Type Enumeration
// =============================================================================

/**
 * All possible agent message types
 */
export type AgentMessageType =
  // Streaming text
  | 'text'
  | 'streamText'
  | 'streamComplete'
  // Thinking (extended thinking / reasoning)
  | 'thinking'
  | 'streamThinking'
  | 'thinkingComplete'
  // Tool execution
  | 'toolCall'
  | 'toolResult'
  | 'toolConfirmation'
  // Plan mode
  | 'planStepStatusUpdate'
  | 'planStatusUpdate'
  // Agent state
  | 'agentPhase'
  | 'agentStateSnapshot'
  // Message lifecycle
  | 'response'
  | 'messageQueued'
  | 'messageCancelled'
  // Conversation management
  | 'conversationList'
  | 'activeConversation'
  | 'historyCleared'
  // Errors
  | 'error'
  // Commands
  | 'slashCommandResult'
  // Configuration
  | 'configState'
  | 'configChanged'
  | 'settingsData'
  | 'projectFiles'
  // Tasks
  | 'tasksUpdated'
  | 'taskCreated'
  | 'taskUpdated'
  | 'taskRemoved'
  // Tabs
  | 'tabState'
  // External
  | 'externalMessage'
  | 'prefillInput'
  // Model presets
  | 'modelPresetsData'
  | 'modelPresetConfigured'
  | 'modelPresetToggled'
  | 'modelPresetConfigRemoved'
  // MCP & Workflow
  | 'mcpServerTestResult'
  | 'workflowTestResult'
  // Skills & Hooks
  | 'skillsData'
  | 'skillsChanged'
  | 'hooksData'
  | 'hooksChanged';

// =============================================================================
// Base Message Interface
// =============================================================================

/**
 * Base interface for all agent messages
 */
export interface AgentMessageBase {
  /** Message type discriminator */
  type: AgentMessageType;
  /** Conversation ID (optional, for multi-conversation support) */
  conversationId?: string;
  /** Message ID (optional, for streaming updates) */
  messageId?: string;
  /** Timestamp (optional) */
  timestamp?: number;
}

// =============================================================================
// Streaming Messages
// =============================================================================

/**
 * Text content message (final or streaming)
 */
export interface TextMessage extends AgentMessageBase {
  type: 'text' | 'streamText';
  /** Text content */
  content: string;
  /** Message ID for streaming updates */
  messageId?: string;
}

/**
 * Stream complete notification
 */
export interface StreamCompleteMessage extends AgentMessageBase {
  type: 'streamComplete';
  /** Final message ID */
  messageId?: string;
  /** Token usage info */
  usage?: TokenUsage;
}

/**
 * Agent response message (initial response creation)
 */
export interface AgentResponseMessage extends AgentMessageBase {
  type: 'response';
  /** Initial content */
  content?: string;
  /** Message ID */
  messageId: string;
}

// =============================================================================
// Thinking Messages (Extended Thinking / Reasoning)
// =============================================================================

/**
 * Thinking content message
 */
export interface ThinkingMessage extends AgentMessageBase {
  type: 'thinking' | 'streamThinking';
  /** Thinking content */
  content: string;
  /** Message ID for streaming updates */
  messageId?: string;
}

/**
 * Thinking complete notification
 */
export interface ThinkingCompleteMessage extends AgentMessageBase {
  type: 'thinkingComplete';
  /** Message ID */
  messageId?: string;
}

// =============================================================================
// Tool Messages
// =============================================================================

/**
 * Tool call message
 */
export interface ToolCallMessage extends AgentMessageBase {
  type: 'toolCall';
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Server name (for MCP tools) */
  serverName?: string;
  /** Message ID */
  messageId?: string;
}

/**
 * Tool result message
 */
export interface ToolResultMessage extends AgentMessageBase {
  type: 'toolResult';
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName?: string;
  /** Whether execution was successful */
  success: boolean;
  /** Result data */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Message ID */
  messageId?: string;
}

/**
 * Tool confirmation request
 */
export interface ToolConfirmationMessage extends AgentMessageBase {
  type: 'toolConfirmation';
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Server name (for MCP tools) */
  serverName?: string;
  /** Message ID */
  messageId?: string;
}

// =============================================================================
// Plan Mode Messages
// =============================================================================

/**
 * Plan step status values
 */
export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Plan status values
 */
export type PlanStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';

/**
 * Plan step status update
 */
export interface PlanStepStatusUpdateMessage extends AgentMessageBase {
  type: 'planStepStatusUpdate';
  /** Plan ID */
  planId: string;
  /** Step ID */
  stepId: string;
  /** New status */
  status: PlanStepStatus;
  /** Error message if failed */
  error?: string;
  /** Output preview */
  outputPreview?: string;
}

/**
 * Plan status update
 */
export interface PlanStatusUpdateMessage extends AgentMessageBase {
  type: 'planStatusUpdate';
  /** Plan ID */
  planId: string;
  /** New status */
  status: PlanStatus;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Agent State Messages
// =============================================================================

/**
 * Agent execution phase
 */
export type AgentPhase =
  | 'idle'
  | 'thinking'
  | 'generating'
  | 'tool_calling'
  | 'tool_executing'
  | 'streaming'
  | 'waiting_confirmation'
  | 'error';

/**
 * Agent phase change notification
 */
export interface AgentPhaseMessage extends AgentMessageBase {
  type: 'agentPhase';
  /** Current phase */
  phase: AgentPhase;
  /** Additional details */
  details?: string;
}

/**
 * Agent state snapshot
 */
export interface AgentStateSnapshotMessage extends AgentMessageBase {
  type: 'agentStateSnapshot';
  /** Snapshot data */
  state: AgentStateData;
}

/**
 * Agent state data structure
 */
export interface AgentStateData {
  phase: AgentPhase;
  isThinking: boolean;
  isStreaming: boolean;
  pendingToolCalls: number;
  tokenCount?: number;
  turnCount?: number;
}

// =============================================================================
// Message Lifecycle Messages
// =============================================================================

/**
 * Message queued notification
 */
export interface MessageQueuedMessage extends AgentMessageBase {
  type: 'messageQueued';
  /** Queue position */
  position?: number;
}

/**
 * Message cancelled notification
 */
export interface MessageCancelledMessage extends AgentMessageBase {
  type: 'messageCancelled';
  /** Reason for cancellation */
  reason?: string;
}

// =============================================================================
// Conversation Messages
// =============================================================================

/**
 * Conversation summary
 */
export interface ConversationSummaryData {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt?: number;
  tokenCount?: number;
}

/**
 * Conversation list message
 */
export interface ConversationListMessage extends AgentMessageBase {
  type: 'conversationList';
  /** List of conversations */
  conversations: ConversationSummaryData[];
}

/**
 * Active conversation notification
 */
export interface ActiveConversationMessage extends AgentMessageBase {
  type: 'activeConversation';
  /** Active conversation ID */
  conversationId: string;
}

/**
 * History cleared notification
 */
export interface HistoryClearedMessage extends AgentMessageBase {
  type: 'historyCleared';
}

// =============================================================================
// Error Messages
// =============================================================================

/**
 * Error message
 */
export interface ErrorMessage extends AgentMessageBase {
  type: 'error';
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Stack trace (development only) */
  stack?: string;
}

// =============================================================================
// Command Messages
// =============================================================================

/**
 * Slash command result
 */
export interface SlashCommandResultMessage extends AgentMessageBase {
  type: 'slashCommandResult';
  /** Whether command was successful */
  success: boolean;
  /** Command action to perform */
  action?: CommandAction;
  /** Output message */
  message?: string;
  /** Error message if failed */
  error?: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Command actions
 */
export type CommandAction =
  | 'exit'
  | 'showHelp'
  | 'showStatus'
  | 'showSettings'
  | 'showModelSelector'
  | 'showMCPServers'
  | 'showPermissions'
  | 'showTasks'
  | 'togglePlanMode'
  | 'initProject'
  | 'resumeConversation'
  | 'newConversation'
  | 'clearHistory'
  | 'compressContext';

// =============================================================================
// Union Type
// =============================================================================

/**
 * Union of all agent message types
 *
 * Use type narrowing with the `type` discriminator:
 * ```typescript
 * function handleMessage(msg: AgentMessage) {
 *   switch (msg.type) {
 *     case 'text':
 *     case 'streamText':
 *       console.log(msg.content);
 *       break;
 *     case 'toolCall':
 *       console.log(msg.toolName, msg.arguments);
 *       break;
 *   }
 * }
 * ```
 */
export type AgentMessage =
  // Streaming
  | TextMessage
  | StreamCompleteMessage
  | AgentResponseMessage
  // Thinking
  | ThinkingMessage
  | ThinkingCompleteMessage
  // Tools
  | ToolCallMessage
  | ToolResultMessage
  | ToolConfirmationMessage
  // Plan
  | PlanStepStatusUpdateMessage
  | PlanStatusUpdateMessage
  // Agent state
  | AgentPhaseMessage
  | AgentStateSnapshotMessage
  // Message lifecycle
  | MessageQueuedMessage
  | MessageCancelledMessage
  // Conversation
  | ConversationListMessage
  | ActiveConversationMessage
  | HistoryClearedMessage
  // Error
  | ErrorMessage
  // Command
  | SlashCommandResultMessage;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if message is a text message
 */
export function isTextMessage(msg: AgentMessage): msg is TextMessage {
  return msg.type === 'text' || msg.type === 'streamText';
}

/**
 * Check if message is a thinking message
 */
export function isThinkingMessage(msg: AgentMessage): msg is ThinkingMessage {
  return msg.type === 'thinking' || msg.type === 'streamThinking';
}

/**
 * Check if message is a tool-related message
 */
export function isToolMessage(
  msg: AgentMessage,
): msg is ToolCallMessage | ToolResultMessage | ToolConfirmationMessage {
  return msg.type === 'toolCall' || msg.type === 'toolResult' || msg.type === 'toolConfirmation';
}

/**
 * Check if message is a plan-related message
 */
export function isPlanMessage(
  msg: AgentMessage,
): msg is PlanStepStatusUpdateMessage | PlanStatusUpdateMessage {
  return msg.type === 'planStepStatusUpdate' || msg.type === 'planStatusUpdate';
}

/**
 * Check if message is an error message
 */
export function isErrorMessage(msg: AgentMessage): msg is ErrorMessage {
  return msg.type === 'error';
}

// =============================================================================
// Message Factory
// =============================================================================

/**
 * Factory for creating agent messages with proper typing
 */
export const AgentMessageFactory = {
  text(content: string, messageId?: string, conversationId?: string): TextMessage {
    return { type: 'text', content, messageId, conversationId };
  },

  streamText(content: string, messageId?: string, conversationId?: string): TextMessage {
    return { type: 'streamText', content, messageId, conversationId };
  },

  thinking(content: string, messageId?: string, conversationId?: string): ThinkingMessage {
    return { type: 'thinking', content, messageId, conversationId };
  },

  toolCall(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: { serverName?: string; messageId?: string; conversationId?: string },
  ): ToolCallMessage {
    return {
      type: 'toolCall',
      toolCallId,
      toolName,
      arguments: args,
      ...options,
    };
  },

  toolResult(
    toolCallId: string,
    success: boolean,
    result?: unknown,
    error?: string,
    options?: { toolName?: string; messageId?: string; conversationId?: string },
  ): ToolResultMessage {
    return {
      type: 'toolResult',
      toolCallId,
      success,
      result,
      error,
      ...options,
    };
  },

  error(message: string, code?: string, conversationId?: string): ErrorMessage {
    return { type: 'error', message, code, conversationId };
  },

  agentPhase(phase: AgentPhase, details?: string, conversationId?: string): AgentPhaseMessage {
    return { type: 'agentPhase', phase, details, conversationId };
  },
};
