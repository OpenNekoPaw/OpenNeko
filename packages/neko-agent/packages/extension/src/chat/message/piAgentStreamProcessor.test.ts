import { describe, expect, it, vi } from 'vitest';

import type { PiProductAgentEvent } from '@neko/agent/pi';

import { createPiAgentStreamSession } from './piAgentStreamProcessor';

describe('Pi Agent Webview stream projection', () => {
  it('projects Pi identity, text, tool result, confirmation, and terminal state directly', async () => {
    const projectionUpdates: unknown[] = [];
    const webviewMessages: unknown[] = [];
    const assistantMessages: unknown[] = [];
    const phases: unknown[] = [];
    const session = createPiAgentStreamSession({
      webview: { postMessage: async (message: unknown) => webviewMessages.push(message) } as never,
      conversationId: 'conversation-1',
      messageId: 'message-1',
      projection: {
        conversationId: 'conversation-1',
        apply: (update: unknown) => projectionUpdates.push(update),
      } as never,
      conversations: {
        upsertMessageToConversation: (_conversationId: string, message: unknown) =>
          assistantMessages.push(message),
      } as never,
      onPhaseChange: (phase, toolName) => phases.push({ phase, toolName }),
      projectMessage: async (message) => message,
      isActive: () => true,
    });

    await emit(session.events, { type: 'turn.started' });
    await emit(session.events, { type: 'assistant.thinking.delta', delta: 'reason' });
    await emit(session.events, { type: 'assistant.text.delta', delta: 'hello ' });
    await emit(session.events, {
      type: 'tool.started',
      toolCallId: 'tool-1',
      toolName: 'ReadProject',
      args: { path: 'notes.md' },
    });
    await emit(session.events, {
      type: 'confirmation.required',
      confirmationId: 'confirmation:tool-1',
      toolCallId: 'tool-1',
      toolName: 'ReadProject',
      summary: 'Read notes.md',
    });
    await emit(session.events, {
      type: 'tool.completed',
      toolCallId: 'tool-1',
      toolName: 'ReadProject',
      result: { details: { success: true, data: 'notes' } },
      isError: false,
    });
    await emit(session.events, { type: 'assistant.text.delta', delta: 'done' });
    await emit(session.events, { type: 'turn.completed' });

    const result = session.result();
    expect(result).toMatchObject({
      accumulatedResponse: 'hello done',
      accumulatedThinking: 'reason',
      terminalStatus: 'completed',
      collectedToolCalls: [
        { id: 'tool-1', name: 'ReadProject', result: { success: true, data: 'notes' } },
      ],
    });
    expect(result.contentBlocks).toContainEqual(
      expect.objectContaining({ type: 'thinking', isThinkingComplete: true }),
    );
    expect(projectionUpdates).toContainEqual(
      expect.objectContaining({
        type: 'agentTurnTimelineUpdate',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
      }),
    );
    expect(webviewMessages).toContainEqual(
      expect.objectContaining({
        type: 'toolConfirmation',
        toolCallId: 'tool-1',
        details: { confirmationId: 'confirmation:tool-1' },
      }),
    );
    expect(webviewMessages.at(-1)).toEqual(
      expect.objectContaining({ type: 'streamComplete', conversationId: 'conversation-1' }),
    );
    expect(assistantMessages.at(-1)).toEqual(
      expect.objectContaining({ role: 'assistant', isStreaming: false }),
    );
    expect(phases).toContainEqual({ phase: 'acting', toolName: 'ReadProject' });
  });
});

async function emit(
  sink: { emit(event: PiProductAgentEvent): void | Promise<void> },
  payload: Omit<PiProductAgentEvent, 'identity' | 'timestamp'>,
): Promise<void> {
  await sink.emit({
    ...payload,
    identity: {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      branchId: 'main',
      turnId: 'turn-1',
      runId: 'run-1',
    },
    timestamp: Date.now(),
  } as PiProductAgentEvent);
}
