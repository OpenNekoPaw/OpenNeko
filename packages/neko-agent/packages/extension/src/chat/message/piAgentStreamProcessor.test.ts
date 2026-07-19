import { describe, expect, it, vi } from 'vitest';

import type { PiProductAgentEvent } from '@neko/agent/pi';
import { createConversationProjectionStore } from '@neko/agent/runtime';

import { createPiAgentStreamSession } from './piAgentStreamProcessor';

describe('Pi Agent Webview stream projection', () => {
  it('keeps ask-mode confirmation on the Timeline when Webview ToolCall delivery is delayed', async () => {
    const projection = createConversationProjectionStore('conversation-1');
    const webviewMessages: unknown[] = [];
    let releaseToolCall: (() => void) | undefined;
    const toolCallDelivery = new Promise<void>((resolve) => {
      releaseToolCall = resolve;
    });
    const session = createPiAgentStreamSession({
      webview: { postMessage: async (message: unknown) => webviewMessages.push(message) } as never,
      conversationId: 'conversation-1',
      messageId: 'message-1',
      projection,
      onPhaseChange: vi.fn(),
      projectMessage: async (message) => {
        if (message.type === 'toolCall') await toolCallDelivery;
        return message;
      },
      isActive: () => true,
    });

    await emit(session.events, { type: 'turn.started' });
    const toolStarted = emit(session.events, {
      type: 'tool.started',
      toolCallId: 'tool-1',
      toolName: 'GenerateImage',
      args: { prompt: 'cat' },
    });
    await Promise.resolve();
    await emit(session.events, {
      type: 'confirmation.required',
      confirmationId: 'confirmation:tool-1',
      toolCallId: 'tool-1',
      toolName: 'GenerateImage',
      summary: 'Run GenerateImage with prompt',
    });

    const toolItem = projection
      .snapshot()
      .turns[0]?.items.find((item) => item.kind === 'tool_call');
    expect(toolItem?.payload.toolCall).toMatchObject({
      id: 'tool-1',
      pendingConfirmation: true,
      confirmation: {
        action: 'GenerateImage',
        description: 'Run GenerateImage with prompt',
        details: { confirmationId: 'confirmation:tool-1' },
      },
    });

    releaseToolCall?.();
    await toolStarted;
    expect(webviewMessages.map((message) => (message as { type?: string }).type)).toEqual([
      'toolCall',
    ]);
  });

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
      identity: { turnId: 'turn-1', runId: 'run-1' },
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
    expect(projectionUpdates).toContainEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            operation: 'upsert',
            item: expect.objectContaining({
              kind: 'tool_call',
              payload: {
                toolCall: expect.objectContaining({
                  id: 'tool-1',
                  pendingConfirmation: true,
                }),
              },
            }),
          }),
        ],
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

  it('projects a specific failed Tool diagnostic without empty data or a generic replacement', async () => {
    const webviewMessages: unknown[] = [];
    const session = createPiAgentStreamSession({
      webview: { postMessage: async (message: unknown) => webviewMessages.push(message) } as never,
      conversationId: 'conversation-1',
      messageId: 'message-1',
      projection: { conversationId: 'conversation-1', apply: vi.fn() } as never,
      onPhaseChange: vi.fn(),
      projectMessage: async (message) => message,
      isActive: () => true,
    });

    await emit(session.events, { type: 'turn.started' });
    await emit(session.events, {
      type: 'tool.started',
      toolCallId: 'tool-read-document',
      toolName: 'ReadDocument',
      args: { range: { locator: { kind: 'chapter', spineIndex: 304 } } },
    });
    await emit(session.events, {
      type: 'tool.completed',
      toolCallId: 'tool-read-document',
      toolName: 'ReadDocument',
      result: {
        content: [
          {
            type: 'text',
            text: 'ReadDocument range.locator: chapter locators require chapterHref.',
          },
        ],
        details: {
          success: false,
          error: 'ReadDocument range.locator: chapter locators require chapterHref.',
        },
      },
      isError: true,
    });
    await emit(session.events, { type: 'turn.completed' });

    expect(session.result().collectedToolCalls).toContainEqual(
      expect.objectContaining({
        id: 'tool-read-document',
        result: {
          success: false,
          data: undefined,
          error: 'ReadDocument range.locator: chapter locators require chapterHref.',
        },
      }),
    );
    expect(webviewMessages).toContainEqual({
      type: 'toolResult',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      toolCallId: 'tool-read-document',
      success: false,
      data: undefined,
    });
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
