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
  update(input: UpdateAgentStateRuntimeInput): Promise<void>;
  clear(conversationId: string): Promise<void>;
  snapshot(): AgentStateRuntimeEntry[];
  subscribe(
    listener: (snapshot: readonly AgentStateRuntimeEntry[]) => void | Promise<void>,
  ): () => void;
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
  private readonly listeners = new Set<
    (snapshot: readonly AgentStateRuntimeEntry[]) => void | Promise<void>
  >();
  private publicationTail = Promise.resolve();

  async update(input: UpdateAgentStateRuntimeInput): Promise<void> {
    if (input.phase === 'idle') {
      await this.clear(input.conversationId);
      return;
    }

    this.states.set(input.conversationId, {
      phase: input.phase,
      ...(input.toolName !== undefined ? { toolName: input.toolName } : {}),
      startedAt: input.startedAt,
    });
    await this.publish();
  }

  async clear(conversationId: string): Promise<void> {
    if (!this.states.delete(conversationId)) return;
    await this.publish();
  }

  snapshot(): AgentStateRuntimeEntry[] {
    return Array.from(this.states.entries()).map(([conversationId, state]) => ({
      conversationId,
      phase: state.phase,
      ...(state.toolName !== undefined ? { toolName: state.toolName } : {}),
      startedAt: state.startedAt,
    }));
  }

  subscribe(
    listener: (snapshot: readonly AgentStateRuntimeEntry[]) => void | Promise<void>,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(): Promise<void> {
    const snapshot = this.snapshot();
    const publication = this.publicationTail.then(async () => {
      await Promise.all(Array.from(this.listeners, (listener) => listener(snapshot)));
    });
    this.publicationTail = publication.then(
      () => undefined,
      () => undefined,
    );
    return publication;
  }
}
