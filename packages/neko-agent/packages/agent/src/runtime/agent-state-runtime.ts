import {
  buildAgentStateSnapshotMessage,
  type AgentPhase,
  type AgentStateSnapshotMessage,
} from '@neko-agent/types';

export interface AgentStateRuntimeEntry {
  readonly conversationId: string;
  readonly phase: AgentPhase;
  readonly toolName?: string;
  readonly startedAt: number;
}

export interface UpdateAgentStateRuntimeInput {
  readonly conversationId: string;
  readonly phase: AgentPhase;
  readonly toolName?: string;
  readonly startedAt: number;
}

export interface AgentStateRuntime {
  update(input: UpdateAgentStateRuntimeInput): void;
  clear(conversationId: string): void;
  snapshot(): AgentStateRuntimeEntry[];
}

export function buildAgentRuntimeStateSnapshotMessage(
  agentStates: readonly AgentStateRuntimeEntry[],
): AgentStateSnapshotMessage {
  return buildAgentStateSnapshotMessage(agentStates.map((state) => ({ ...state })));
}

export function createAgentStateRuntime(): AgentStateRuntime {
  return new DefaultAgentStateRuntime();
}

class DefaultAgentStateRuntime implements AgentStateRuntime {
  private readonly states = new Map<string, Omit<AgentStateRuntimeEntry, 'conversationId'>>();

  update(input: UpdateAgentStateRuntimeInput): void {
    if (input.phase === 'idle') {
      this.clear(input.conversationId);
      return;
    }

    this.states.set(input.conversationId, {
      phase: input.phase,
      ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
      startedAt: input.startedAt,
    });
  }

  clear(conversationId: string): void {
    this.states.delete(conversationId);
  }

  snapshot(): AgentStateRuntimeEntry[] {
    return Array.from(this.states.entries()).map(([conversationId, state]) => ({
      conversationId,
      phase: state.phase,
      ...(state.toolName !== undefined ? { toolName: state.toolName } : {}),
      startedAt: state.startedAt,
    }));
  }
}
