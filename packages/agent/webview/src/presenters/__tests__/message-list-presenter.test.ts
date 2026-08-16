import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@neko/agent-contracts';
import { projectMessageList, projectMessageListItems } from '../message-list-presenter';

describe('message-list-presenter', () => {
  it('projects one transcript activity while a run has no canonical live record', () => {
    const state = { phase: 'thinking' as const, startedAt: 1_000 };
    const projection = projectMessageList({
      messages: [],
      agentState: state,
      streamingMessageId: null,
    });

    expect(projection.showExecutionActivity).toBe(true);
    expect(projection.items).toEqual([
      {
        kind: 'execution_activity',
        agentState: state,
        ownerMessageId: null,
        estimatedHeight: 34,
      },
    ]);
  });

  it('binds execution activity to only the latest non-queued user message', () => {
    const state = { phase: 'thinking' as const, startedAt: 2_000 };
    const projection = projectMessageList({
      messages: [
        { id: 'user-old', role: 'user', content: 'Earlier', timestamp: 1_000 },
        { id: 'assistant-old', role: 'assistant', content: 'Done', timestamp: 1_500 },
        { id: 'user-current', role: 'user', content: 'Continue', timestamp: 2_000 },
        {
          id: 'user-queued',
          role: 'user',
          content: 'Wait behind it',
          timestamp: 2_100,
          isQueued: true,
        },
      ],
      agentState: state,
      streamingMessageId: null,
    });

    expect(projection.items).toHaveLength(3);
    expect(projection.items[0]).not.toHaveProperty('agentState');
    expect(projection.items[2]).toEqual(
      expect.objectContaining({
        kind: 'message',
        ownerMessageId: 'user-current',
        agentState: state,
        isCurrentRunMessage: true,
      }),
    );
    expect(projection.items.some((item) => item.kind === 'execution_activity')).toBe(false);
  });

  it('keeps the current user time visible when canonical records suppress generic activity', () => {
    const projection = projectMessageList({
      messages: [
        { id: 'user-current', role: 'user', content: 'Continue', timestamp: 2_000 },
        {
          id: 'assistant-stream',
          role: 'assistant',
          content: 'Streaming response',
          timestamp: 2_100,
          isStreaming: true,
        },
      ],
      agentState: { phase: 'streaming', startedAt: 2_000 },
      streamingMessageId: 'assistant-stream',
    });

    expect(projection.showExecutionActivity).toBe(false);
    expect(projection.items[0]).toEqual(
      expect.objectContaining({
        ownerMessageId: 'user-current',
        isCurrentRunMessage: true,
      }),
    );
    expect(projection.items[0]).not.toHaveProperty('agentState');
  });

  it('lets canonical streaming and pending tool records replace generic activity', () => {
    const state = { phase: 'acting' as const, toolName: 'ReadDocument', startedAt: 1_000 };
    const pendingToolMessage = {
      id: 'assistant-tool',
      role: 'assistant' as const,
      content: '',
      timestamp: 1_100,
      contentBlocks: [
        {
          id: 'tool-block',
          type: 'tool_call' as const,
          timestamp: 1_100,
          toolCall: { id: 'tool-1', name: 'ReadDocument', arguments: {} },
        },
      ],
    };

    expect(
      projectMessageList({
        messages: [pendingToolMessage],
        agentState: state,
        streamingMessageId: null,
      }).showExecutionActivity,
    ).toBe(false);
    expect(
      projectMessageList({
        messages: [
          {
            id: 'assistant-stream',
            role: 'assistant',
            content: 'Visible response',
            timestamp: 1_100,
            isStreaming: true,
          },
        ],
        agentState: state,
        streamingMessageId: 'assistant-stream',
      }).showExecutionActivity,
    ).toBe(false);
  });

  it('lets a canonical running Turn with failed Tools replace generic activity', () => {
    const projection = projectMessageList({
      messages: [
        {
          id: 'assistant-failed-tool',
          role: 'assistant',
          content: '',
          timestamp: 1_100,
          isStreaming: true,
          turnTiming: { startedAt: 1_000 },
          contentBlocks: [
            {
              id: 'failed-tool-block',
              type: 'tool_call',
              timestamp: 1_100,
              toolCall: {
                id: 'failed-tool',
                name: 'ReadDocument',
                arguments: { cursor_ref: 'cursor_12b95yb' },
                result: {
                  success: false,
                  data: null,
                  error: 'Document content could not be read.',
                },
              },
            },
          ],
        },
      ],
      agentState: { phase: 'acting', toolName: 'ReadDocument', startedAt: 1_000 },
      streamingMessageId: 'assistant-failed-tool',
    });

    expect(projection.showExecutionActivity).toBe(false);
    expect(projection.items).toHaveLength(1);
  });

  it('keeps activity visible for an empty streaming message shell', () => {
    const projection = projectMessageList({
      messages: [
        {
          id: 'assistant-stream',
          role: 'assistant',
          content: '',
          timestamp: 1_100,
          isStreaming: true,
        },
      ],
      agentState: { phase: 'thinking', startedAt: 1_000 },
      streamingMessageId: 'assistant-stream',
    });

    expect(projection.showExecutionActivity).toBe(true);
    expect(projection.items.at(-1)?.kind).toBe('execution_activity');
  });

  it('lets a terminal assistant response override stale execution activity', () => {
    const state = { phase: 'thinking' as const, startedAt: 1_000 };
    const completedText = projectMessageList({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Summarize this file',
          timestamp: 1_000,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Completed summary',
          timestamp: 1_100,
          isStreaming: false,
        },
      ],
      agentState: state,
      streamingMessageId: null,
    });
    const completedTextBlock = projectMessageList({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Summarize this file',
          timestamp: 1_000,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          timestamp: 1_100,
          contentBlocks: [
            {
              id: 'text-1',
              type: 'text',
              timestamp: 1_100,
              content: 'Completed block summary',
              isStreaming: false,
            },
          ],
        },
      ],
      agentState: state,
      streamingMessageId: null,
    });

    expect(completedText.showExecutionActivity).toBe(false);
    expect(completedTextBlock.showExecutionActivity).toBe(false);
  });

  it('does not treat an empty assistant response as terminal', () => {
    const projection = projectMessageList({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Summarize this file',
          timestamp: 1_000,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '   ',
          timestamp: 1_100,
          isStreaming: false,
        },
      ],
      agentState: { phase: 'thinking', startedAt: 1_000 },
      streamingMessageId: null,
    });

    expect(projection.showExecutionActivity).toBe(true);
  });

  it('does not let a historical terminal response suppress a later turn activity', () => {
    const projection = projectMessageList({
      messages: [
        {
          id: 'historical-assistant',
          role: 'assistant',
          content: 'Earlier completed response',
          timestamp: 1_000,
          isStreaming: false,
        },
        {
          id: 'current-user',
          role: 'user',
          content: 'Start another turn',
          timestamp: 2_000,
        },
      ],
      agentState: { phase: 'thinking', startedAt: 2_000 },
      streamingMessageId: null,
    });

    expect(projection.showExecutionActivity).toBe(true);
  });

  it('does not let a historical pending tool suppress a later turn activity', () => {
    const projection = projectMessageList({
      messages: [
        {
          id: 'historical-tool',
          role: 'assistant',
          content: '',
          timestamp: 1_000,
          contentBlocks: [
            {
              id: 'historical-tool-block',
              type: 'tool_call',
              timestamp: 1_000,
              toolCall: { id: 'tool-old', name: 'ReadDocument', arguments: {} },
            },
          ],
        },
        {
          id: 'current-user',
          role: 'user',
          content: 'Start another turn',
          timestamp: 2_000,
        },
      ],
      agentState: { phase: 'thinking', startedAt: 2_000 },
      streamingMessageId: null,
    });

    expect(projection.showExecutionActivity).toBe(true);
  });

  it('requires AgentState before projecting execution activity', () => {
    const projection = projectMessageList({
      messages: [],
      agentState: null,
      streamingMessageId: null,
    });

    expect(projection.showExecutionActivity).toBe(false);
    expect(projection.items).toEqual([]);
  });

  it('does not project activation progress as a standalone conversation-level list item', () => {
    const projection = projectMessageList({
      messages: [],
      streamingMessageId: null,
      activationProgress: [
        {
          conversationId: 'conv-1',
          activationId: 'activation-1',
          target: 'skill',
          action: 'activate',
          name: 'quality-review',
          source: 'agent-tool',
          requestedBy: 'agent',
          reason: 'Agent selected review',
          status: 'succeeded',
          events: [
            {
              id: 'event-1',
              activationId: 'activation-1',
              conversationId: 'conv-1',
              target: 'skill',
              action: 'activate',
              name: 'quality-review',
              step: 'requested',
              status: 'succeeded',
              source: 'agent-tool',
              requestedBy: 'agent',
              reason: 'Agent selected review',
              at: 1,
            },
          ],
        },
      ],
    });

    expect(projection.items).toEqual([]);
  });

  it('projects one durable message row for repeated assistant tool blocks', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            toolBlock('tool-2', 'ReadDocument', '/books/a.epub', 14),
            toolBlock('tool-3', 'ReadDocument', '/books/a.epub', 18),
          ],
        },
      ],
      false,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'message',
      message: { id: 'msg-1' },
      ambientToolCalls: [
        expect.objectContaining({ id: 'tool-1' }),
        expect.objectContaining({ id: 'tool-2' }),
        expect.objectContaining({ id: 'tool-3' }),
      ],
    });
  });

  it('keeps queued notices out of the transcript projection', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'queued-1',
          role: 'system',
          content: 'Message queued (1 pending)',
          timestamp: 1,
          isQueued: true,
        },
        {
          id: 'msg-1',
          role: 'user',
          content: 'Generate a shot list',
          timestamp: 2,
          isQueued: true,
        },
        {
          id: 'msg-2',
          role: 'user',
          content: 'Visible user message',
          timestamp: 3,
        },
      ],
      false,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'message',
      message: {
        id: 'msg-2',
        role: 'user',
      },
    });
  });

  it('keeps one message projection for answer and process activity in the same turn', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'thinking-1',
              type: 'thinking',
              timestamp: 8,
              thinking: 'Analyze the source pages.',
              isThinkingComplete: true,
            },
            toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            {
              id: 'text-1',
              type: 'text',
              timestamp: 20,
              content: 'Final storyboard summary.',
            },
          ],
        },
      ],
      false,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'message',
      message: { id: 'msg-1' },
      ambientToolCalls: [expect.objectContaining({ id: 'tool-1' })],
    });
  });

  it('carries prior assistant tool results into later markdown projections', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-read-image',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'read-image-block',
              type: 'tool_call',
              timestamp: 10,
              toolCall: {
                id: 'read-image-1',
                name: 'ReadImage',
                arguments: {},
                result: {
                  success: true,
                  data: {
                    imageInfo: [
                      {
                        alias: 'P1',
                        label: 'Page 1',
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
        {
          id: 'msg-storyboard',
          role: 'assistant',
          content: '',
          timestamp: 2,
          contentBlocks: [
            {
              id: 'storyboard-text',
              type: 'text',
              timestamp: 20,
              content:
                '| scene | shot | source | visual |\n| --- | --- | --- | --- |\n| Opening | 1 | P1 | Frame |',
            },
          ],
        },
      ],
      false,
    );

    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      kind: 'message',
      message: { id: 'msg-storyboard' },
      ambientToolCalls: [expect.objectContaining({ id: 'read-image-1', name: 'ReadImage' })],
    });
  });

  it('does not fragment a message when process records occur between text blocks', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'text-1',
              type: 'text',
              timestamp: 8,
              content: 'I will inspect the source.',
            },
            toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            {
              id: 'text-2',
              type: 'text',
              timestamp: 20,
              content: 'Here is the summary.',
            },
          ],
        },
      ],
      false,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'message', message: { id: 'msg-1' } });
  });

  it('keeps failed tools visible instead of hiding them in process records', () => {
    const items = projectMessageListItems(
      [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            failedToolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
            {
              id: 'text-1',
              type: 'text',
              timestamp: 20,
              content: 'Final answer.',
            },
          ],
        },
      ],
      false,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'message', message: { id: 'msg-1' } });
  });
});

function toolBlock(id: string, name: string, filePath: string, duration: number): ContentBlock {
  return {
    id: `block-${id}`,
    type: 'tool_call',
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success: true,
        data: { file_path: filePath },
        duration,
      },
    },
  };
}

function failedToolBlock(
  id: string,
  name: string,
  filePath: string,
  duration: number,
): ContentBlock {
  return {
    id: `block-${id}`,
    type: 'tool_call',
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success: false,
        data: { file_path: filePath },
        error: 'read failed',
        duration,
      },
    },
  };
}
