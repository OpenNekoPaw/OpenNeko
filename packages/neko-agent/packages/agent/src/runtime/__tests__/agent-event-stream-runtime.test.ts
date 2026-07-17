import { describe, expect, it, vi } from 'vitest';
import type { TaskRunScope } from '@neko/shared';
import { createTableHeavyStreamFixture } from '../../../../../test-utils/src/fixtures';
import type { AgentEvent } from '../../session/types';
import type {
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
  AgentTurnTimelineToolCallItem,
} from '@neko-agent/types';
import {
  AgentEventStreamRuntimeProcessor,
  type ObserveAgentStreamBackgroundTaskProgressInput,
  type ProcessAgentEventStreamRuntimeInput,
  type AgentTurnTimelineAccumulatorUpdate,
} from '../index';

interface SourceTask {
  readonly id: string;
}

function taskScope(
  conversationId = 'conv-1',
  runId = 'run-1',
  childRunId = 'task-1',
): TaskRunScope {
  return {
    conversationId,
    runId,
    parentRunId: runId,
    childRunId,
    childKind: 'task',
  };
}

async function* toAsyncIterable<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

function createBackgroundToolResultEvent(conversationId = 'conv-1', runId = 'run-1'): AgentEvent {
  return {
    type: 'tool_result',
    toolResult: {
      toolCallId: 'tool-1',
      success: true,
      data: {
        backgroundMode: true,
        conversationId,
        runId,
        taskId: 'task-1',
        taskScope: taskScope(conversationId, runId),
        type: 'image',
        message: 'Generate a cat',
        routedTo: { provider: 'openai' },
      },
    },
  };
}

describe('agent event stream runtime processor', () => {
  it('processes agent events, posts projected messages, and returns a persistence snapshot', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const onPhaseChange = vi.fn();

    const result = await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'thinking_content', thinking: 'Think' },
        { type: 'text', content: 'Answer' },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-1', success: true, data: 'content' },
        },
        { type: 'done', usage: { inputTokens: 20, outputTokens: 22, totalTokens: 42 } },
      ]),
      postMessage,
      onPhaseChange,
      now: () => 100,
    });

    expect(result).toMatchObject({
      accumulatedThinking: 'Think',
      accumulatedResponse: 'Answer',
      hasError: false,
    });
    expect(result.collectedToolCalls).toEqual([
      {
        id: 'tool-1',
        name: 'read_file',
        arguments: { path: 'a.ts' },
        result: { success: true, data: 'content', error: undefined },
      },
    ]);
    expect(result.contentBlocks.at(0)).toMatchObject({
      type: 'thinking',
      isThinkingComplete: true,
    });
    expect(result.contentBlocks.at(1)).toMatchObject({ type: 'text', isStreaming: false });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'streamComplete',
        conversationId: 'conv-1',
        messageId: 'msg-stream',
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'thinking' }),
          expect.objectContaining({ type: 'text' }),
        ]),
      }),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contextTokenCount',
      }),
    );
    expect(onPhaseChange).toHaveBeenCalledWith('thinking', undefined);
    expect(onPhaseChange).toHaveBeenCalledWith('streaming', undefined);
    expect(onPhaseChange).toHaveBeenCalledWith('acting', 'read_file');
    expect(onPhaseChange).toHaveBeenCalledWith('idle', undefined);
  });

  it('emits ordered turn timeline items for interleaved text and tools', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'text_delta', content: 'Before.' },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-1', success: true, data: 'content' },
        },
        { type: 'text_delta', content: ' After.' },
      ]),
      postMessage,
      now: () => 100,
    });

    const timelineMessages = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineUpdate);
    const timelineItems = extractTimelineItems(timelineMessages);

    expect(timelineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'text-1',
          sequence: 1,
          kind: 'assistant_text',
          payload: expect.objectContaining({
            content: 'Before.',
            format: 'markdown',
            sourceGeneration: 1,
          }),
        }),
        expect.objectContaining({
          itemId: 'tool-tool-1',
          sequence: 2,
          kind: 'tool_call',
          payload: expect.objectContaining({
            toolCall: expect.objectContaining({ id: 'tool-1', name: 'read_file' }),
          }),
        }),
        expect.objectContaining({
          itemId: 'text-3',
          sequence: 3,
          kind: 'assistant_text',
          payload: expect.objectContaining({
            content: ' After.',
            format: 'markdown',
            sourceGeneration: 1,
          }),
        }),
      ]),
    );
    expect(
      timelineItems.filter((item) => item.itemId === 'tool-tool-1').map((item) => item.sequence),
    ).toEqual([2, 2]);
  });

  it('does not create timeline tool items from tool results without a prior tool call', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-1', success: false, error: 'missing call' },
        },
      ]),
      postMessage,
      now: () => 100,
    });

    const timelineItems = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineUpdate)
      .flatMap(extractTimelineItemsFromMessage);

    expect(timelineItems).toEqual([]);
  });

  it('emits linear append bytes for the table-heavy regression stream', async () => {
    const fixture = createTableHeavyStreamFixture();
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();

    await processor.process({
      conversationId: 'conv-linear',
      messageId: 'msg-linear',
      events: toAsyncIterable<AgentEvent>(
        fixture.chunks.map((content) => ({ type: 'text_delta' as const, content })),
      ),
      postMessage,
      now: () => 100,
    });

    const operations = extractTimelineOperations(
      postMessage.mock.calls.map(([message]) => message).filter(isAgentTurnTimelineUpdate),
    );
    const appendSources = operations.flatMap((operation) =>
      operation.operation === 'append' && operation.item.kind === 'assistant_text'
        ? [operation.item.payload.content]
        : [],
    );
    const outboundTextBytes = appendSources.reduce(
      (total, source) => total + new TextEncoder().encode(source).byteLength,
      0,
    );

    expect(appendSources.join('')).toBe(fixture.source);
    expect(outboundTextBytes).toBe(new TextEncoder().encode(fixture.source).byteLength);
    expect(operations.some((operation) => operation.operation === 'snapshot')).toBe(false);
    expect(
      appendSources.some(
        (source, index) => index > 0 && source === fixture.chunks.slice(0, index + 1).join(''),
      ),
    ).toBe(false);
  });

  it('projects tool confirmations and backfills onto the original timeline tool item', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const times = [10, 20, 30, 40, 50];
    const now = vi.fn(() => times.shift() ?? 50);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'write_file', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_confirmation',
          toolConfirmation: {
            toolCall: { id: 'tool-1', name: 'write_file', arguments: { path: 'a.ts' }, index: 0 },
            action: 'write',
            description: 'Write a.ts',
            details: { path: 'a.ts' },
            confirmationToken: 'confirm-1',
          },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tool-1',
            success: true,
            data: { status: 'queued', taskId: 'task-1' },
          },
        },
        {
          type: 'tool_result_backfill',
          toolResultBackfill: {
            toolCallId: 'tool-1',
            timestamp: 2,
            dataPatch: { status: 'completed', resultUrl: '/tmp/out.png' },
          },
        },
      ]),
      postMessage,
      now,
    });

    const toolTimelineItems = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineUpdate)
      .flatMap(extractTimelineItemsFromMessage)
      .filter((item) => item.itemId === 'tool-tool-1');

    expect(toolTimelineItems.map((item) => item.sequence)).toEqual([1, 1, 1, 1]);
    expect(toolTimelineItems.map((item) => item.createdAt)).toEqual([10, 10, 10, 10]);
    expect(toolTimelineItems.map((item) => item.updatedAt)).toEqual([10, 20, 30, 40]);
    expect(toolTimelineItems[1]).toMatchObject({
      status: 'pending',
      payload: {
        toolCall: {
          id: 'tool-1',
          pendingConfirmation: true,
          confirmation: {
            action: 'write',
            description: 'Write a.ts',
            details: { path: 'a.ts' },
          },
        },
      },
    });
    expect(toolTimelineItems.at(-1)).toMatchObject({
      status: 'succeeded',
      payload: {
        toolCall: {
          id: 'tool-1',
          result: {
            success: true,
            data: {
              status: 'completed',
              taskId: 'task-1',
              resultUrl: '/tmp/out.png',
            },
          },
        },
      },
    });
  });

  it('keeps concurrent tool results anchored when results arrive out of call order', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const times = [10, 20, 30, 40, 50, 60];
    const now = vi.fn(() => times.shift() ?? 60);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'tool_call',
          toolCall: { id: 'tool-a', name: 'read_a', arguments: { path: 'a.ts' } },
        },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-b', name: 'read_b', arguments: { path: 'b.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-b', success: true, data: 'B' },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tool-a', success: false, error: 'A failed' },
        },
      ]),
      postMessage,
      now,
    });

    const toolTimelineItems = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineUpdate)
      .flatMap(extractTimelineItemsFromMessage)
      .filter(isTimelineToolCallItem);
    const latestByToolCallId = new Map(
      toolTimelineItems.map((item) => [item.payload.toolCall.id, item]),
    );

    expect(toolTimelineItems.map((item) => item.itemId)).toEqual([
      'tool-tool-a',
      'tool-tool-b',
      'tool-tool-b',
      'tool-tool-a',
    ]);
    expect(latestByToolCallId.get('tool-a')).toMatchObject({
      sequence: 1,
      status: 'failed',
      createdAt: 10,
      updatedAt: 40,
      payload: {
        toolCall: {
          id: 'tool-a',
          result: { success: false, error: 'A failed' },
        },
      },
    });
    expect(latestByToolCallId.get('tool-b')).toMatchObject({
      sequence: 2,
      status: 'succeeded',
      createdAt: 20,
      updatedAt: 30,
      payload: {
        toolCall: {
          id: 'tool-b',
          result: { success: true, data: 'B' },
        },
      },
    });
  });

  it('emits resumable partial assistant snapshots with the stream message id', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const onPartialAssistantMessage = vi.fn();
    const now = vi.fn(() => 100);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'assistant-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'thinking_content', thinking: 'Think' },
        { type: 'text', content: 'Hello' },
      ]),
      postMessage: vi.fn(),
      onPartialAssistantMessage,
      partialAssistantSnapshotIntervalMs: 0,
      now,
    });

    expect(onPartialAssistantMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'assistant-stream',
        role: 'assistant',
        content: 'Hello',
        isStreaming: true,
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'text', isStreaming: true }),
        ]),
      }),
    );
  });

  it('keeps invalid streamed storyboard tables visible after validation errors', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const streamedTable = '| 镜号 | 画面内容 |\n| --- | --- |\n| 1 | bad |';

    const result = await processor.process({
      conversationId: 'conv-1',
      messageId: 'assistant-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'text_delta',
          content: streamedTable,
        },
        {
          type: 'error',
          error: Object.assign(new Error('Storyboard creative table uses forbidden header.'), {
            name: 'AgentError',
            code: 'storyboard-table-forbidden-header',
          }),
        },
      ]),
      postMessage,
      now: () => 100,
    });

    const completeMessage = postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'streamComplete');

    expect(result.accumulatedResponse).toBe(streamedTable);
    expect(result.contentBlocks).toEqual([
      expect.objectContaining({
        type: 'text',
        content: streamedTable,
        isStreaming: false,
      }),
    ]);
    expect(completeMessage).toEqual(
      expect.objectContaining({
        type: 'streamComplete',
      }),
    );
    expect(completeMessage?.contentBlocks ?? []).toEqual([
      expect.objectContaining({
        type: 'text',
        content: streamedTable,
      }),
    ]);
    expect(
      postMessage.mock.calls
        .map(([message]) => message)
        .filter(isAgentTurnTimelineUpdate)
        .flatMap(extractTimelineItemsFromMessage),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'error',
          payload: expect.objectContaining({
            code: 'storyboard-table-forbidden-header',
          }),
        }),
      ]),
    );
  });

  it('replaces streamed assistant text when validation retry repairs internally', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();

    const result = await processor.process({
      conversationId: 'conv-1',
      messageId: 'assistant-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'text_delta', content: 'invalid table' },
        {
          type: 'assistant_text_replacement',
          replacement: { reason: 'output-validation-retry', attempt: 1 },
        },
        { type: 'text_delta', content: 'fixed table' },
      ]),
      postMessage,
      now: () => 100,
    });

    const completeMessage = postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'streamComplete');
    const timelineMessages = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineUpdate);

    expect(result.accumulatedResponse).toBe('fixed table');
    expect(result.contentBlocks).toEqual([
      expect.objectContaining({
        type: 'text',
        content: 'fixed table',
        isStreaming: false,
      }),
    ]);
    expect(completeMessage?.contentBlocks).toEqual([
      expect.objectContaining({
        type: 'text',
        content: 'fixed table',
      }),
    ]);
    expect(extractTimelineOperations(timelineMessages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'replace',
          item: expect.objectContaining({
            kind: 'assistant_text',
            payload: expect.objectContaining({ content: '', sourceGeneration: 2 }),
          }),
        }),
        expect.objectContaining({
          operation: 'append',
          item: expect.objectContaining({
            kind: 'assistant_text',
            payload: expect.objectContaining({ content: 'fixed table', sourceGeneration: 2 }),
          }),
        }),
      ]),
    );
  });

  it('preserves ReadImage resource context when validation retry repairs storyboard markdown', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const postMessage = vi.fn();
    const repairedMarkdown = [
      '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 开场 | S01 | P1 | 整页 | keep | 3s | 主角出现 | 缓慢推近 | 低风声 | 主角 |  | 黑白工业巨构前的孤独主角 | needs-review | use-as-reference | story | 建立空间与人物 | false |  |',
    ].join('\n');

    const result = await processor.process({
      conversationId: 'conv-1',
      messageId: 'assistant-stream',
      events: toAsyncIterable<AgentEvent>([
        {
          type: 'tool_call',
          toolCall: { id: 'read-image', name: 'ReadImage', arguments: {} },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'read-image',
            success: true,
            data: {
              imageInfo: [
                {
                  alias: 'P1',
                  label: 'Page 1',
                  entryPath: 'OPS/page-1.jpg',
                  mimeType: 'image/jpeg',
                  renderUri: 'vscode-webview://page-1',
                  resourceRef: {
                    kind: 'document-entry',
                    source: { filePath: '${BOOKS}/story.epub', format: 'epub' },
                    entryPath: 'OPS/page-1.jpg',
                    versionPolicy: 'versioned-export',
                  },
                },
              ],
            },
            attachments: [
              { type: 'image', path: 'vscode-webview://page-1', mimeType: 'image/jpeg' },
            ],
          },
        },
        { type: 'text_delta', content: '| 镜号 | 画面内容 |\n| --- | --- |\n| 1 | bad |' },
        {
          type: 'assistant_text_replacement',
          replacement: { reason: 'output-validation-retry', attempt: 1 },
        },
        { type: 'text_delta', content: repairedMarkdown },
      ]),
      postMessage,
      now: () => 100,
    });

    const completeMessage = postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === 'streamComplete');

    expect(result.accumulatedResponse).toBe(repairedMarkdown);
    expect(result.contentBlocks.map((block) => block.type)).toEqual(['tool_call', 'text']);
    expect(result.contentBlocks[0]).toMatchObject({
      type: 'tool_call',
      toolCall: {
        id: 'read-image',
        name: 'ReadImage',
        result: {
          success: true,
          data: {
            imageInfo: [
              expect.objectContaining({
                alias: 'P1',
                renderUri: 'vscode-webview://page-1',
              }),
            ],
          },
        },
      },
    });
    expect(result.contentBlocks[1]).toMatchObject({
      type: 'text',
      content: repairedMarkdown,
      isStreaming: false,
    });
    expect(JSON.stringify(result.contentBlocks)).not.toContain('镜号');
    expect(completeMessage?.contentBlocks?.map((block) => block.type)).toEqual([
      'tool_call',
      'text',
    ]);
  });

  it('throttles text partial snapshots while always persisting structural events', async () => {
    const processor = new AgentEventStreamRuntimeProcessor();
    const onPartialAssistantMessage = vi.fn();
    const times = [100, 120, 140, 160];
    const now = vi.fn(() => times.shift() ?? 160);

    await processor.process({
      conversationId: 'conv-1',
      messageId: 'assistant-stream',
      events: toAsyncIterable<AgentEvent>([
        { type: 'text_delta', content: 'A' },
        { type: 'text_delta', content: 'B' },
        {
          type: 'tool_call',
          toolCall: { id: 'tool-1', name: 'read_file', arguments: {} },
        },
        { type: 'text_delta', content: 'C' },
      ]),
      postMessage: vi.fn(),
      onPartialAssistantMessage,
      partialAssistantSnapshotIntervalMs: 250,
      now,
    });

    expect(onPartialAssistantMessage).toHaveBeenCalledTimes(2);
    expect(onPartialAssistantMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ content: 'A' }),
    );
    expect(onPartialAssistantMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contentBlocks: expect.arrayContaining([
          expect.objectContaining({ type: 'text', content: 'AB', isStreaming: false }),
          expect.objectContaining({ type: 'tool_call' }),
        ]),
      }),
    );
  });

  it('starts background task observers and clears subscriptions by conversation', async () => {
    const processor = new AgentEventStreamRuntimeProcessor<
      SourceTask,
      { readonly done: boolean }
    >();
    const postMessage = vi.fn();
    const unsubscribe = vi.fn();
    let observerInput:
      | ObserveAgentStreamBackgroundTaskProgressInput<SourceTask, { readonly done: boolean }>
      | undefined;

    const processing = processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable([createBackgroundToolResultEvent()]),
      postMessage,
      backgroundTasks: {
        observeProgress: (input) => {
          observerInput = input;
          return unsubscribe;
        },
        createRecoveryProgress: (task) => ({
          id: task.id,
          status: 'processing',
          progress: 1,
          updatedAt: '2026-01-01T00:00:01.000Z',
        }),
        createProgressDelivery: (task) => ({
          progress: {
            id: task.id,
            status: 'completed',
            progress: 100,
            updatedAt: '2026-01-01T00:00:02.000Z',
          },
          deliveryPlan: { done: true },
          persistResultUrls: ['/tmp/cat.png'],
        }),
        persistResultUrls: vi.fn(),
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(observerInput).toMatchObject({
      lease: {
        conversationId: 'conv-1',
        runId: 'run-1',
      },
      taskId: 'task-1',
      conversationId: 'conv-1',
    });
    expect(
      postMessage.mock.calls
        .map(([message]) => message)
        .filter(isAgentTurnTimelineUpdate)
        .flatMap(extractTimelineItemsFromMessage),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'tool-background-task-task-1',
          kind: 'task',
          parentAnchor: 'tool_call',
          parentToolCallId: 'tool-1',
          payload: {
            workItem: expect.objectContaining({
              id: 'task-1',
              parentMessageId: 'msg-stream',
              parentToolCallId: 'tool-1',
            }),
          },
        }),
      ]),
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'taskCreated', conversationId: 'conv-1' }),
    );

    await observerInput!.onTaskProgress({
      lease: {
        conversationId: 'conv-1',
        runId: 'run-1',
      },
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'processing',
          progress: 50,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });

    const taskTimelineEvents = postMessage.mock.calls
      .map(([message]) => message)
      .filter(isAgentTurnTimelineUpdate)
      .flatMap(extractTimelineItemsFromMessage)
      .filter((item) => item.itemId === 'tool-background-task-task-1');

    expect(taskTimelineEvents.map((item) => item.sequence)).toEqual([
      taskTimelineEvents[0]?.sequence,
      taskTimelineEvents[0]?.sequence,
    ]);
    expect(taskTimelineEvents.at(-1)).toMatchObject({
      status: 'pending',
      payload: {
        workItem: {
          id: 'task-1',
          progress: 50,
          parentMessageId: 'msg-stream',
          parentToolCallId: 'tool-1',
        },
      },
    });
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'taskUpdated', conversationId: 'conv-1' }),
    );

    await observerInput!.onTaskProgress({
      lease: {
        conversationId: 'conv-1',
        runId: 'run-1',
      },
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:03.000Z',
        },
      },
    });

    await processing;

    processor.clearConversation('conv-1');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('waits for submitted background tasks before completing the agent turn', async () => {
    const processor = new AgentEventStreamRuntimeProcessor<SourceTask>();
    const postMessage = vi.fn();
    let observerInput: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;

    const processing = processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable([createBackgroundToolResultEvent()]),
      postMessage,
      backgroundTasks: {
        observeProgress: (input) => {
          observerInput = input;
          return vi.fn();
        },
        createRecoveryProgress: (task) => ({
          id: task.id,
          status: 'failed',
          progress: 100,
          error: 'Progress delivery failed',
          updatedAt: '2026-01-01T00:00:01.000Z',
        }),
        createProgressDelivery: (task) => ({
          progress: {
            id: task.id,
            status: 'completed',
            progress: 100,
            updatedAt: '2026-01-01T00:00:02.000Z',
          },
        }),
      },
    });

    const stateBeforeTerminalProgress = await Promise.race([
      processing.then(() => 'resolved' as const),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 0);
      }),
    ]);

    expect(observerInput).toBeDefined();
    expect(stateBeforeTerminalProgress).toBe('pending');

    await observerInput!.onTaskProgress({
      lease: {
        conversationId: 'conv-1',
        runId: 'run-1',
      },
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });

    await processing;

    const streamCompleteCallIndex = postMessage.mock.calls.findIndex(
      ([message]) => message.type === 'streamComplete',
    );
    const completedTaskCallIndex = postMessage.mock.calls.findIndex(
      ([message]) =>
        isAgentTurnTimelineUpdate(message) &&
        extractTimelineItemsFromMessage(message).some(
          (item) => item.itemId === 'tool-background-task-task-1' && item.status === 'succeeded',
        ),
    );

    expect(completedTaskCallIndex).toBeGreaterThanOrEqual(0);
    expect(streamCompleteCallIndex).toBeGreaterThan(completedTaskCallIndex);
  });

  it('uses the background task wait port to complete turns when progress events are absent', async () => {
    const processor = new AgentEventStreamRuntimeProcessor<SourceTask>();
    const postMessage = vi.fn();
    let resolveWait!: (task: SourceTask) => void;

    const processing = processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: toAsyncIterable([createBackgroundToolResultEvent()]),
      postMessage,
      backgroundTasks: {
        observeProgress: () => vi.fn(),
        waitForCompletion: vi.fn(
          () =>
            new Promise<SourceTask>((resolve) => {
              resolveWait = resolve;
            }),
        ),
        createRecoveryProgress: (task) => ({
          id: task.id,
          status: 'failed',
          progress: 100,
          error: 'Progress delivery failed',
          updatedAt: '2026-01-01T00:00:01.000Z',
        }),
        createProgressDelivery: (task) => ({
          progress: {
            id: task.id,
            status: 'completed',
            progress: 100,
            updatedAt: '2026-01-01T00:00:02.000Z',
          },
        }),
      },
    });

    const stateBeforeCompletion = await Promise.race([
      processing.then(() => 'resolved' as const),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 0);
      }),
    ]);

    expect(stateBeforeCompletion).toBe('pending');

    resolveWait({ id: 'task-1' });
    await processing;

    const streamCompleteCallIndex = postMessage.mock.calls.findIndex(
      ([message]) => message.type === 'streamComplete',
    );
    const completedTaskCallIndex = postMessage.mock.calls.findIndex(
      ([message]) =>
        isAgentTurnTimelineUpdate(message) &&
        extractTimelineItemsFromMessage(message).some(
          (item) => item.itemId === 'tool-background-task-task-1' && item.status === 'succeeded',
        ),
    );

    expect(completedTaskCallIndex).toBeGreaterThanOrEqual(0);
    expect(streamCompleteCallIndex).toBeGreaterThan(completedTaskCallIndex);
  });

  it('keeps the source stream suspended at done until background tasks settle', async () => {
    const processor = new AgentEventStreamRuntimeProcessor<SourceTask>();
    const postMessage = vi.fn();
    let observerInput: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask> | undefined;
    let sourceFinished = false;

    async function* sourceEvents(): AsyncIterable<AgentEvent> {
      try {
        yield createBackgroundToolResultEvent();
        yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      } finally {
        sourceFinished = true;
      }
    }

    const processing = processor.process({
      conversationId: 'conv-1',
      messageId: 'msg-stream',
      events: sourceEvents(),
      postMessage,
      backgroundTasks: {
        observeProgress: (input) => {
          observerInput = input;
          return vi.fn();
        },
        createRecoveryProgress: (task) => ({
          id: task.id,
          status: 'failed',
          progress: 100,
          error: 'Progress delivery failed',
          updatedAt: '2026-01-01T00:00:01.000Z',
        }),
        createProgressDelivery: (task) => ({
          progress: {
            id: task.id,
            status: 'completed',
            progress: 100,
            updatedAt: '2026-01-01T00:00:02.000Z',
          },
        }),
      },
    });

    const stateBeforeTerminalProgress = await Promise.race([
      processing.then(() => 'resolved' as const),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 0);
      }),
    ]);

    expect(observerInput).toBeDefined();
    expect(stateBeforeTerminalProgress).toBe('pending');
    expect(sourceFinished).toBe(false);

    await observerInput!.onTaskProgress({
      lease: {
        conversationId: 'conv-1',
        runId: 'run-1',
      },
      taskScope: taskScope(),
      conversationId: 'conv-1',
      sourceTask: { id: 'task-1' },
      task: {
        progress: {
          id: 'task-1',
          status: 'completed',
          progress: 100,
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
      },
    });
    await processing;

    expect(sourceFinished).toBe(true);
  });

  it('disposes all tracked background task subscriptions', async () => {
    const processor = new AgentEventStreamRuntimeProcessor<SourceTask>();
    const unsubscribeA = vi.fn();
    const unsubscribeB = vi.fn();
    let observeCallCount = 0;
    const observerInputs: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask>[] = [];
    const observeProgress = (input: ObserveAgentStreamBackgroundTaskProgressInput<SourceTask>) => {
      observerInputs.push(input);
      observeCallCount += 1;
      return observeCallCount === 1 ? unsubscribeA : unsubscribeB;
    };

    const createInput = (
      conversationId: string,
    ): ProcessAgentEventStreamRuntimeInput<SourceTask> => ({
      conversationId,
      messageId: 'msg-stream',
      events: toAsyncIterable([
        createBackgroundToolResultEvent(conversationId, `run-${conversationId}`),
      ]),
      postMessage: () => undefined,
      backgroundTasks: {
        observeProgress,
        createRecoveryProgress: (task: SourceTask) => ({
          id: task.id,
          status: 'processing',
          progress: 1,
          updatedAt: '2026-01-01T00:00:01.000Z',
        }),
        createProgressDelivery: (task: SourceTask) => ({
          progress: {
            id: task.id,
            status: 'processing',
            progress: 50,
            updatedAt: '2026-01-01T00:00:02.000Z',
          },
        }),
      },
    });

    const first = processor.process(createInput('conv-a'));
    await Promise.resolve();
    await Promise.resolve();
    const second = processor.process(createInput('conv-b'));
    await Promise.resolve();
    await Promise.resolve();

    processor.dispose();
    await Promise.all([first, second]);

    expect(unsubscribeA).toHaveBeenCalledTimes(1);
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    expect(observerInputs).toHaveLength(2);
  });
});

function isAgentTurnTimelineUpdate(
  message: unknown,
): message is AgentTurnTimelineAccumulatorUpdate {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'agentTurnTimelineUpdate'
  );
}

function extractTimelineItems(
  messages: readonly AgentTurnTimelineAccumulatorUpdate[],
): AgentTurnTimelineItem[] {
  return messages.flatMap(extractTimelineItemsFromMessage);
}

function extractTimelineItemsFromMessage(
  message: AgentTurnTimelineAccumulatorUpdate,
): AgentTurnTimelineItem[] {
  return message.operations.flatMap((operation) => ('item' in operation ? [operation.item] : []));
}

function extractTimelineOperations(
  messages: readonly AgentTurnTimelineAccumulatorUpdate[],
): AgentTurnTimelineOperation[] {
  return messages.flatMap((message) => message.operations);
}

function isTimelineToolCallItem(
  item: AgentTurnTimelineItem,
): item is AgentTurnTimelineToolCallItem {
  return item.kind === 'tool_call';
}
