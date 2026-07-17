/**
 * Agent Phase Types — Execution state for UI status indicators
 */

/**
 * Agent execution phase
 * - idle: Agent is not running
 * - thinking: Agent is processing/thinking (Claude extended thinking)
 * - acting: Agent is executing a tool
 * - streaming: Agent is streaming text response
 */
export type AgentPhase = 'idle' | 'thinking' | 'acting' | 'streaming';

/**
 * Agent state for UI display
 */
export interface AgentState {
  phase: AgentPhase;
  /** Current tool being executed (when phase is 'acting') */
  toolName?: string;
  /** Timestamp when phase started */
  startedAt: number;
}
