/**
 * SubAgent UI Types
 *
 * Types for SubAgent display in agent control panels.
 * These are simplified UI-facing types, separate from platform's SubAgent types.
 */

// =============================================================================
// SubAgent Status
// =============================================================================

/**
 * SubAgent status for UI display
 */
export type SubAgentUIStatus =
  | 'pending' // Waiting to start
  | 'running' // Currently executing
  | 'completed' // Finished successfully
  | 'failed' // Finished with error
  | 'cancelled'; // Cancelled by user/timeout

/**
 * SubAgent type (specialized or general)
 */
export type SubAgentUIType =
  | 'code-search'
  | 'file-explorer'
  | 'test-runner'
  | 'document-writer'
  | 'general';

// =============================================================================
// SubAgent Info (for UI display)
// =============================================================================

/**
 * SubAgent information for UI display
 */
export interface SubAgentInfo {
  /** SubAgent ID */
  id: string;
  /** SubAgent type */
  type: SubAgentUIType;
  /** Short description */
  description: string;
  /** Current status */
  status: SubAgentUIStatus;
  /** Progress percentage (0-100, optional) */
  progress?: number;
  /** Start time */
  startedAt?: number;
  /** Duration in ms (when completed) */
  duration?: number;
  /** Error message (when failed) */
  error?: string;
  /** Current iteration */
  iteration?: number;
  /** Max iterations */
  maxIterations?: number;
}

// =============================================================================
// Message Types (Extension <-> WebView)
// =============================================================================

/**
 * SubAgent event sent from Extension to WebView
 */
export interface SubAgentEventMessage {
  type: 'subAgentEvent';
  /** Parent conversation ID */
  conversationId: string;
  /** Event type */
  eventType: 'spawned' | 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  /** SubAgent info */
  subAgent: SubAgentInfo;
}

/**
 * Request SubAgent list for a conversation
 */
export interface SubAgentListRequest {
  type: 'getSubAgents';
  /** Conversation ID */
  conversationId: string;
}

/**
 * SubAgent list response
 */
export interface SubAgentListResponse {
  type: 'subAgentList';
  /** Conversation ID */
  conversationId: string;
  /** List of SubAgents */
  subAgents: SubAgentInfo[];
}

/**
 * Cancel a SubAgent
 */
export interface SubAgentCancelRequest {
  type: 'cancelSubAgent';
  /** SubAgent ID */
  subAgentId: string;
  /** Parent conversation ID */
  conversationId: string;
}
