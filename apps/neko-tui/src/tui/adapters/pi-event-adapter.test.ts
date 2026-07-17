import type { PiProductAgentEvent, PiProductEventPayload } from '@neko/agent/pi';
import { describe, expect, it } from 'vitest';

import { createAgentStore } from '../stores/agent-store';
import { createConfigStore } from '../stores/config-store';
import { createConversationStore } from '../stores/conversation-store';
import { createUIStore } from '../stores/ui-store';
import { DEFAULT_CLI_CONFIG } from '../core/types';
import { createTuiPiEventAdapter } from './pi-event-adapter';

const identity = {
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  branchId: 'main',
  turnId: 'turn-1',
  runId: 'run-1',
};

function event(payload: PiProductEventPayload): PiProductAgentEvent {
  return { ...payload, identity, timestamp: 1 };
}

function stores() {
  return {
    agent: createAgentStore(),
    config: createConfigStore(DEFAULT_CLI_CONFIG),
    conversation: createConversationStore(),
    ui: createUIStore(),
  };
}

describe('TUI Pi event adapter', () => {
  it('projects Pi streaming, usage, and terminal state directly to TUI stores', () => {
    const state = stores();
    const adapter = createTuiPiEventAdapter(state);

    adapter.emit(event({ type: 'turn.started' }));
    adapter.emit(event({ type: 'assistant.text.delta', delta: 'hel' }));
    adapter.emit(event({ type: 'assistant.text.delta', delta: 'lo' }));
    adapter.emit(
      event({
        type: 'usage',
        provider: 'provider-1',
        model: 'model-1',
        usage: {
          input: 2,
          output: 3,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 5,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }),
    );
    adapter.emit(event({ type: 'turn.completed' }));
    adapter.emit(event({ type: 'turn.persistence', state: 'durable' }));

    expect(state.conversation.getState().currentDelta).toBe('hello');
    expect(state.agent.getState()).toMatchObject({
      status: 'idle',
      usage: { input: 2, output: 3, total: 5 },
      turnPersistence: { turnId: 'turn-1', state: 'durable' },
    });
  });

  it('projects tool identity and failure without legacy AgentEvent translation', () => {
    const state = stores();
    const adapter = createTuiPiEventAdapter(state);

    adapter.emit(
      event({
        type: 'tool.started',
        toolCallId: 'call-1',
        toolName: 'InspectAsset',
        args: { assetId: 'asset-1' },
      }),
    );
    adapter.emit(
      event({
        type: 'tool.completed',
        toolCallId: 'call-1',
        toolName: 'InspectAsset',
        result: { details: { success: false, error: 'denied' } },
        isError: true,
      }),
    );

    expect(state.conversation.getState().messages.at(-1)?.toolCalls).toEqual([
      expect.objectContaining({
        id: 'call-1',
        name: 'InspectAsset',
        status: 'error',
        error: 'denied',
      }),
    ]);
  });
});
