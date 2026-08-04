import {
  buildAgentStateSnapshotMessage,
  type AgentPhase,
  type AgentStateSnapshotMessage,
} from '@neko/agent-contracts';

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
  subscribe(listener: (snapshot: readonly AgentStateRuntimeEntry[]) => void): () => void;
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
  private readonly listeners = new Set<(snapshot: readonly AgentStateRuntimeEntry[]) => void>();

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
    this.publish();
  }

  clear(conversationId: string): void {
    if (!this.states.delete(conversationId)) return;
    this.publish();
  }

  snapshot(): AgentStateRuntimeEntry[] {
    return Array.from(this.states.entries()).map(([conversationId, state]) => ({
      conversationId,
      phase: state.phase,
      ...(state.toolName !== undefined ? { toolName: state.toolName } : {}),
      startedAt: state.startedAt,
    }));
  }

  subscribe(listener: (snapshot: readonly AgentStateRuntimeEntry[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
