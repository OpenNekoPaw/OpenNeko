import { describe, expect, it } from 'vitest';
import type { AgentState } from '@neko-agent/types';
import { projectAgentPhaseToStateStore, projectAgentStateSnapshot } from '../agent-state-presenter';

describe('agent state presenter', () => {
  it('projects phase updates by conversation and returns active state', () => {
    const states = new Map<string, AgentState>();

    const projected = projectAgentPhaseToStateStore({
      states,
      activeConversationId: 'conv-1',
      conversationId: 'conv-1',
      phase: 'acting',
      toolName: 'write_file',
      timestamp: 1000,
    });

    expect(projected.states.get('conv-1')).toEqual({
      phase: 'acting',
      toolName: 'write_file',
      startedAt: 1000,
    });
    expect(projected.activeAgentState).toEqual({
      phase: 'acting',
      toolName: 'write_file',
      startedAt: 1000,
    });
    expect(states.size).toBe(0);
  });

  it('removes idle conversations without affecting other states', () => {
    const states = new Map<string, AgentState>([
      ['conv-1', { phase: 'thinking', startedAt: 1000 }],
      ['conv-2', { phase: 'streaming', startedAt: 2000 }],
    ]);

    const idle = projectAgentPhaseToStateStore({
      states,
      activeConversationId: 'conv-1',
      conversationId: 'conv-1',
      phase: 'idle',
    });

    expect(idle.states.has('conv-1')).toBe(false);
    expect(idle.states.get('conv-2')).toEqual({ phase: 'streaming', startedAt: 2000 });
    expect(idle.activeAgentState).toBeNull();
  });

  it('projects snapshots defensively and ignores idle or malformed entries', () => {
    const projected = projectAgentStateSnapshot({
      agentStates: [
        { conversationId: 'conv-1', phase: 'thinking', startedAt: 1000 },
        { conversationId: 'conv-2', phase: 'idle', startedAt: 2000 },
        { conversationId: '', phase: 'acting', startedAt: 3000 },
        null,
      ],
      activeConversationId: 'conv-3',
      now: () => 4000,
    });

    expect(projected.states).toEqual(
      new Map<string, AgentState>([['conv-1', { phase: 'thinking', startedAt: 1000 }]]),
    );
    expect(projected.activeAgentState).toBeNull();
  });
});
