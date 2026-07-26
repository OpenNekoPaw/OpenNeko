import type { PiProductAgentEvent, PiProductEventPayload } from '@neko/agent/pi';
import { describe, expect, it } from 'vitest';

import { createAgentStore } from '../stores/agent-store';
import { createConfigStore } from '../stores/config-store';
import { createConversationStore } from '../stores/conversation-store';
import { createUIStore } from '../stores/ui-store';
import { DEFAULT_CLI_CONFIG } from '../core/types';
import { createTestAgentTerminalPresentation } from '../presentation/testing';
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
    const adapter = createTuiPiEventAdapter(state, {
      conversationId: identity.conversationId,
      presentation: createTestAgentTerminalPresentation(),
    });

    adapter.emit(event({ type: 'turn.started' }));
    adapter.emit(event({ type: 'assistant.text.delta', delta: 'hel', sourceIndex: 0 }));
    adapter.emit(event({ type: 'assistant.text.delta', delta: 'lo', sourceIndex: 0 }));
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

    expect(state.conversation.getState().messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'hello',
      timelineRows: [
        expect.objectContaining({
          kind: 'assistant_text',
          status: 'complete',
          content: 'hello',
        }),
      ],
    });
    expect(state.agent.getState()).toMatchObject({
      status: 'idle',
      usage: { input: 2, output: 3, total: 5 },
      turnPersistence: { turnId: 'turn-1', state: 'durable' },
    });
    expect(adapter.readProjectionEvidence()).toMatchObject({
      implementation: 'shared-pi-timeline-projector',
      store: 'conversation-projection-store',
      presenter: 'terminal-timeline-presenter',
      path: [
        'pi-product-event',
        'shared-pi-timeline-projector',
        'conversation-projection-store',
        'terminal-timeline-presenter',
      ],
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      messageId: 'assistant-turn-1',
      projectionVersion: 3,
      terminalProjectionVersion: 3,
      completionStatus: 'completed',
      droppedPatchCount: 0,
      acceptedPostTerminalPatchCount: 0,
      patches: [
        { baseProjectionVersion: 0, projectionVersion: 1 },
        { baseProjectionVersion: 1, projectionVersion: 2 },
        { baseProjectionVersion: 2, projectionVersion: 3 },
      ],
      items: [
        expect.objectContaining({
          itemId: 'text-1-0',
          kind: 'assistant_text',
          itemRevision: 3,
        }),
      ],
    });
  });

  it('projects tool identity and failure without legacy AgentEvent translation', () => {
    const state = stores();
    const adapter = createTuiPiEventAdapter(state, {
      conversationId: identity.conversationId,
      presentation: createTestAgentTerminalPresentation(),
    });

    adapter.emit(event({ type: 'turn.started' }));
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
    adapter.emit(event({ type: 'turn.completed' }));

    expect(state.conversation.getState().messages.at(-1)?.timelineRows).toEqual([
      expect.objectContaining({
        toolCallId: 'call-1',
        toolName: 'InspectAsset',
        status: 'error',
      }),
    ]);
    expect(adapter.readTerminalToolResults()).toEqual([
      {
        name: 'InspectAsset',
        success: false,
        data: undefined,
      },
    ]);
    expect(adapter.readProjectionEvidence()?.items).toEqual([
      expect.objectContaining({
        itemId: 'tool-call-1',
        kind: 'tool_call',
        itemRevision: 2,
        toolCallId: 'call-1',
        toolName: 'InspectAsset',
      }),
    ]);
  });
});
