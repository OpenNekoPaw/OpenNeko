import type { AgentPhase, AgentState } from './phase';

export interface AgentStateEntry {
  conversationId?: string;
  phase?: AgentPhase;
  toolName?: string;
  startedAt?: number;
}

export interface AgentStateStoreProjection {
  states: Map<string, AgentState>;
  activeAgentState: AgentState | null;
}

export interface ProjectAgentPhaseInput {
  states: ReadonlyMap<string, AgentState>;
  activeConversationId: string | null;
  conversationId: string;
  phase: AgentPhase;
  toolName?: string;
  timestamp?: number;
  now?: () => number;
}

export interface ProjectAgentStateSnapshotInput {
  agentStates: readonly (AgentStateEntry | null | undefined)[];
  activeConversationId: string | null;
  now?: () => number;
}
