import type { AgentState } from '@neko-agent/types';
import type {
  AgentStateStoreProjection,
  ProjectAgentPhaseInput,
  ProjectAgentStateSnapshotInput,
} from '@neko-agent/types';

export function projectAgentPhaseToStateStore(
  input: ProjectAgentPhaseInput,
): AgentStateStoreProjection {
  const next = new Map(input.states);

  if (input.phase === 'idle') {
    next.delete(input.conversationId);
  } else {
    next.set(input.conversationId, {
      phase: input.phase,
      ...(input.toolName ? { toolName: input.toolName } : {}),
      startedAt: input.timestamp ?? input.now?.() ?? Date.now(),
    });
  }

  return {
    states: next,
    activeAgentState: getActiveAgentState(next, input.activeConversationId),
  };
}

export function projectAgentStateSnapshot(
  input: ProjectAgentStateSnapshotInput,
): AgentStateStoreProjection {
  const next = new Map<string, AgentState>();

  for (const entry of input.agentStates) {
    if (!entry || typeof entry.conversationId !== 'string') continue;
    const conversationId = entry.conversationId;
    const phase = entry.phase;
    if (!conversationId || !phase || phase === 'idle') continue;

    next.set(conversationId, {
      phase,
      ...(typeof entry.toolName === 'string' ? { toolName: entry.toolName } : {}),
      startedAt:
        typeof entry.startedAt === 'number' ? entry.startedAt : (input.now?.() ?? Date.now()),
    });
  }

  return {
    states: next,
    activeAgentState: getActiveAgentState(next, input.activeConversationId),
  };
}

function getActiveAgentState(
  states: ReadonlyMap<string, AgentState>,
  activeConversationId: string | null,
): AgentState | null {
  if (!activeConversationId) return null;
  return states.get(activeConversationId) ?? null;
}
