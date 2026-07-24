import type { PiProductAgentEvent } from '@neko/agent/pi';
import { createConversationProjectionStore } from '@neko/agent/runtime';
import { describe, expect, it, vi } from 'vitest';

import { createPiAgentStreamSession } from './piAgentStreamProcessor';

type AssistantMessage = Extract<
  PiProductAgentEvent,
  { readonly type: 'assistant.message.completed' }
>['message'];

describe('Pi Agent projection-only stream session', () => {
  it('keeps confirmation and result on one canonical Tool Timeline item', async () => {
    const projection = createConversationProjectionStore('conversation-1');
    const session = createPiAgentStreamSession({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      projection,
      onPhaseChange: vi.fn(),
    });

    await emit(session.events, { type: 'turn.started' });
    await emit(session.events, {
      type: 'tool.started',
      toolCallId: 'tool-1',
      toolName: 'GenerateImage',
      args: { prompt: 'cat' },
    });
    await emit(session.events, {
      type: 'confirmation.required',
      confirmationId: 'confirmation:tool-1',
      toolCallId: 'tool-1',
      toolName: 'GenerateImage',
      summary: 'Run GenerateImage with prompt',
    });
    await emit(session.events, {
      type: 'tool.completed',
      toolCallId: 'tool-1',
      toolName: 'GenerateImage',
      result: { details: { success: true, data: { imageId: 'image-1' } } },
      isError: false,
    });
    await emit(session.events, { type: 'turn.completed' });

    expect(projection.snapshot().turns[0]?.items).toHaveLength(1);
    expect(projection.snapshot().turns[0]?.items[0]).toMatchObject({
      kind: 'tool_call',
      status: 'succeeded',
      payload: {
        toolCall: {
          id: 'tool-1',
          pendingConfirmation: false,
          confirmation: {
            details: { confirmationId: 'confirmation:tool-1' },
          },
          result: { success: true, data: { imageId: 'image-1' } },
        },
      },
    });
  });

  it('derives terminal history and artifact inputs from the frozen Timeline', async () => {
    const projection = createConversationProjectionStore('conversation-1');
    const phases: unknown[] = [];
    const session = createPiAgentStreamSession({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      projection,
      onPhaseChange: (phase, toolName) => phases.push({ phase, toolName }),
    });

    await emit(session.events, { type: 'turn.started' });
    await emit(session.events, {
      type: 'assistant.thinking.delta',
      delta: 'reason',
      sourceIndex: 0,
    });
    await emit(session.events, {
      type: 'assistant.text.delta',
      delta: 'hello ',
      sourceIndex: 1,
    });
    await emit(session.events, {
      type: 'assistant.message.completed',
      message: assistantMessage([
        { type: 'thinking', thinking: 'reason' },
        { type: 'text', text: 'hello ' },
        { type: 'toolCall', id: 'tool-1', name: 'ReadProject', arguments: { path: 'notes.md' } },
      ]),
    });
    await emit(session.events, {
      type: 'tool.started',
      toolCallId: 'tool-1',
      toolName: 'ReadProject',
      args: { path: 'notes.md' },
    });
    await emit(session.events, {
      type: 'tool.completed',
      toolCallId: 'tool-1',
      toolName: 'ReadProject',
      result: { details: { success: true, data: 'notes' } },
      isError: false,
    });
    await emit(session.events, {
      type: 'assistant.text.delta',
      delta: 'done',
      sourceIndex: 0,
    });
    await emit(session.events, {
      type: 'assistant.message.completed',
      message: assistantMessage([{ type: 'text', text: 'done' }]),
    });
    await emit(session.events, { type: 'turn.completed' });

    expect(session.result()).toMatchObject({
      identity: { turnId: 'turn-1', runId: 'run-1' },
      accumulatedResponse: 'hello done',
      accumulatedThinking: 'reason',
      terminalStatus: 'completed',
      collectedToolCalls: [
        { id: 'tool-1', name: 'ReadProject', result: { success: true, data: 'notes' } },
      ],
    });
    expect(session.result().contentBlocks.map((block) => block.type)).toEqual([
      'thinking',
      'text',
      'tool_call',
      'text',
    ]);
    expect(phases).toContainEqual({ phase: 'acting', toolName: 'ReadProject' });
    expect(phases.at(-1)).toEqual({ phase: 'idle', toolName: undefined });
  });

  it('preserves a specific failed Tool diagnostic and rejects late mutation', async () => {
    const projection = createConversationProjectionStore('conversation-1');
    const session = createPiAgentStreamSession({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      projection,
      onPhaseChange: vi.fn(),
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
    await expect(
      emit(session.events, {
        type: 'assistant.text.delta',
        delta: 'late',
        sourceIndex: 0,
      }),
    ).rejects.toThrow(/after terminal/i);
  });
});

function assistantMessage(content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test-model',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 10,
  };
}

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
