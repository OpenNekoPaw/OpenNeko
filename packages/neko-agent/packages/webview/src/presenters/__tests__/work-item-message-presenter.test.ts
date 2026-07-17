import { describe, expect, it } from 'vitest';
import type {
  AgentBackgroundTask,
  AgentWorkItem,
  Message,
  SubAgentWorkItem,
} from '@neko-agent/types';
import { projectBackgroundTaskToWorkItem } from '../work-item-projection-presenter';
import {
  appendMediaTaskMessageToMessages,
  appendSubAgentMessageToMessages,
  attachWorkItemToMessageByToolCall,
  deriveInlineWorkLinksFromMessages,
  extractSubAgentWorkItemIds,
  projectConversationWorkItemsFromMessages,
  projectSubAgentToolResultToWorkItem,
  rehydrateBackgroundTasksFromMessages,
  rehydrateSubAgentWorkItemsFromMessages,
  selectMessageLevelSubAgentWorkItems,
  selectMessageTaskWorkItems,
  selectRelatedSubAgentWorkItems,
} from '../work-item-message-presenter';

describe('work-item-message-presenter', () => {
  it('projects subagent tool results to unified work items', () => {
    expect(
      projectSubAgentToolResultToWorkItem({
        id: 'sub-2',
        conversationId: 'conv-1',
        parentMessageId: 'msg-2',
        parentToolCallId: 'tool-2',
        data: {
          scope: {
            conversationId: 'conv-1',
            runId: 'run-1',
            parentRunId: 'parent-2',
            childRunId: 'sub-2',
            childKind: 'subagent',
          },
          status: 'completed',
          response: 'Looks good',
          description: 'Reviewer',
          parentAgentId: 'parent-2',
          subagentType: 'code-search',
          runMode: 'foreground',
          modelTier: 'fast',
        },
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'sub-2',
      title: 'Reviewer',
      status: 'completed',
      progress: 100,
      subAgent: {
        parentAgentId: 'parent-2',
        type: 'code-search',
        runMode: 'foreground',
        modelTier: 'fast',
        response: 'Looks good',
      },
    });
  });

  it('rejects subagent results without complete runtime ownership', () => {
    expect(() =>
      projectSubAgentToolResultToWorkItem({
        id: 'sub-2',
        conversationId: 'conv-1',
        parentMessageId: 'msg-2',
        parentToolCallId: 'tool-2',
        data: { status: 'completed' },
      }),
    ).toThrow(/requires matching scope/);
  });

  it('rejects subagent scope from another conversation', () => {
    expect(() =>
      projectSubAgentToolResultToWorkItem({
        id: 'sub-2',
        conversationId: 'conv-1',
        parentMessageId: 'msg-2',
        parentToolCallId: 'tool-2',
        data: {
          scope: {
            conversationId: 'conv-2',
            runId: 'run-1',
            parentRunId: 'parent-2',
            childRunId: 'sub-2',
            childKind: 'subagent',
          },
          status: 'completed',
        },
      }),
    ).toThrow(/requires matching scope/);
  });

  it('extracts subagent ids from tool result payloads', () => {
    expect(
      extractSubAgentWorkItemIds({
        subAgentId: 'sub-1',
        subAgentIds: ['sub-2', 'sub-1'],
        taskId: 'sub-3',
        status: 'running',
      }),
    ).toEqual(['sub-1', 'sub-2', 'sub-3']);
  });

  it('selects subagent work items owned by a tool call', () => {
    const items: AgentWorkItem[] = [
      createSubAgentWorkItem('sub-a', 'tool-a'),
      createSubAgentWorkItem('sub-b', 'tool-b'),
    ];

    const related = selectRelatedSubAgentWorkItems({
      toolCallId: 'tool-a',
      workItems: items,
      workItemIds: ['sub-a', 'sub-b'],
    });

    expect(related.map((item) => item.id)).toEqual(['sub-a']);
  });

  it('selects message-level work items without duplicating tool-call subagents', () => {
    const task = projectBackgroundTaskToWorkItem({
      conversationId: 'conv-1',
      task: createBackgroundTask('task-1', 'Generate cat'),
    });
    const subAgent = createSubAgentWorkItem('sub-1', null);
    const workItems: AgentWorkItem[] = [task, subAgent];

    expect(
      selectMessageTaskWorkItems({
        message: { workItemIds: ['task-1', 'sub-1'] },
        workItems,
      }).map((item) => item.id),
    ).toEqual(['task-1']);

    expect(
      selectMessageLevelSubAgentWorkItems({
        message: { workItemIds: ['task-1', 'sub-1'] },
        workItems,
      }).map((item) => item.id),
    ).toEqual(['sub-1']);

    expect(
      selectMessageLevelSubAgentWorkItems({
        message: {
          workItemIds: ['sub-1'],
          contentBlocks: [{ id: 'block-1', type: 'tool_call', timestamp: 1 }],
        },
        workItems,
      }),
    ).toEqual([]);
  });

  it('uses tool result ids when a subagent work item has no parent tool id', () => {
    const items: AgentWorkItem[] = [
      createSubAgentWorkItem('sub-a', null),
      createSubAgentWorkItem('sub-b', null),
    ];

    const related = selectRelatedSubAgentWorkItems({
      toolCallId: 'tool-a',
      toolResultData: { subAgentId: 'sub-a' },
      workItems: items,
      workItemIds: ['sub-a', 'sub-b'],
    });

    expect(related.map((item) => item.id)).toEqual(['sub-a']);
  });

  it('does not guess ownership for parentless subagents without tool result ids', () => {
    const items: AgentWorkItem[] = [createSubAgentWorkItem('sub-a', null)];

    expect(
      selectRelatedSubAgentWorkItems({
        toolCallId: 'tool-a',
        workItems: items,
        workItemIds: ['sub-a'],
      }),
    ).toEqual([]);
  });

  it('attaches work item ids to the message that owns the parent tool call', () => {
    const result = attachWorkItemToMessageByToolCall(
      [
        {
          id: 'msg-1',
          contentBlocks: [{ type: 'tool_call', toolCall: { id: 'tool-1' } }],
        },
        {
          id: 'msg-2',
          contentBlocks: [{ type: 'tool_call', toolCall: { id: 'tool-2' } }],
          workItemIds: ['sub-existing'],
        },
      ],
      { toolCallId: 'tool-2', workItemId: 'sub-1' },
    );

    expect(result.attached).toBe(true);
    expect(result.messages).toEqual([
      {
        id: 'msg-1',
        contentBlocks: [{ type: 'tool_call', toolCall: { id: 'tool-1' } }],
      },
      {
        id: 'msg-2',
        contentBlocks: [{ type: 'tool_call', toolCall: { id: 'tool-2' } }],
        workItemIds: ['sub-existing', 'sub-1'],
      },
    ]);
  });

  it('does not attach work item ids when the parent tool call is absent', () => {
    const messages = [
      { id: 'msg-1', contentBlocks: [{ type: 'tool_call', toolCall: { id: 'tool-1' } }] },
    ];

    expect(
      attachWorkItemToMessageByToolCall(messages, {
        toolCallId: 'tool-missing',
        workItemId: 'sub-1',
      }),
    ).toEqual({ messages, attached: false });
  });

  it('derives inline background task and subagent links from persisted tool results', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        workItemIds: ['task-existing'],
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-1',
              name: 'GenerateImage',
              arguments: {},
              result: {
                success: true,
                data: {
                  backgroundMode: true,
                  taskId: 'task-1',
                  taskIds: ['task-2', 'task-1'],
                },
              },
            },
          },
          {
            id: 'block-2',
            type: 'tool_call',
            timestamp: 2,
            toolCall: {
              id: 'tool-2',
              name: 'run_subagent',
              arguments: {},
              result: {
                success: true,
                data: {
                  subAgentId: 'sub-1',
                  subAgentIds: ['sub-2', 'sub-1'],
                  status: 'completed',
                },
              },
            },
          },
        ],
      },
    ];

    expect(deriveInlineWorkLinksFromMessages(messages)[0]).toMatchObject({
      workItemIds: ['task-existing', 'task-2', 'task-1', 'sub-1', 'sub-2'],
    });
  });

  it('rehydrates completed background tasks from persisted tool results', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-1',
              name: 'GenerateVideo',
              arguments: { prompt: 'Fallback prompt' },
              result: {
                success: true,
                data: {
                  backgroundMode: true,
                  taskId: 'task-1',
                  taskScope: {
                    conversationId: 'conv-1',
                    runId: 'run-1',
                    parentRunId: 'run-1',
                    childRunId: 'task-1',
                    childKind: 'task',
                  },
                  type: 'video',
                  status: 'completed',
                  message: 'A cinematic cat',
                  routedTo: { provider: 'openai', model: 'sora' },
                  urls: ['webview://video.mp4'],
                  localPaths: ['/tmp/video.mp4'],
                },
              },
            },
          },
        ],
      },
    ];

    expect(
      rehydrateBackgroundTasksFromMessages(messages, {
        now: () => Date.parse('2026-01-01T00:00:00.000Z'),
      }),
    ).toEqual([
      {
        scope: {
          conversationId: 'conv-1',
          runId: 'run-1',
          parentRunId: 'run-1',
          childRunId: 'task-1',
          childKind: 'task',
        },
        id: 'task-1',
        type: 'video',
        name: 'A cinematic cat',
        prompt: 'A cinematic cat',
        providerId: 'openai',
        providerName: 'sora',
        status: 'completed',
        progress: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        result: {
          urls: ['webview://video.mp4'],
          thumbnailUrl: 'webview://video.mp4',
        },
      },
    ]);
    expect(
      rehydrateBackgroundTasksFromMessages(messages, {
        now: () => Date.parse('2026-01-01T00:00:00.000Z'),
      })[0]?.result,
    ).not.toHaveProperty('localPaths');
  });

  it('rehydrates subagent work items with parent message and tool call links', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: 1,
        contentBlocks: [
          {
            id: 'block-1',
            type: 'tool_call',
            timestamp: 1,
            toolCall: {
              id: 'tool-1',
              name: 'run_subagent',
              arguments: {},
              result: {
                success: true,
                data: {
                  scope: {
                    conversationId: 'conv-1',
                    runId: 'run-1',
                    parentRunId: 'parent-1',
                    childRunId: 'sub-1',
                    childKind: 'subagent',
                  },
                  subAgentId: 'sub-1',
                  status: 'completed',
                  description: 'Review implementation',
                  response: 'Looks good',
                },
              },
            },
          },
        ],
      },
    ];

    expect(
      rehydrateSubAgentWorkItemsFromMessages(messages, 'conv-1', {
        now: () => Date.parse('2026-01-01T00:00:00.000Z'),
      }),
    ).toMatchObject([
      {
        id: 'sub-1',
        conversationId: 'conv-1',
        kind: 'subagent',
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
        title: 'Review implementation',
        status: 'completed',
        progress: 100,
        subAgent: {
          response: 'Looks good',
        },
      },
    ]);
  });

  it('projects conversation messages and rehydrated work items together', () => {
    const projection = projectConversationWorkItemsFromMessages({
      conversationId: 'conv-1',
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'block-1',
              type: 'tool_call',
              timestamp: 1,
              toolCall: {
                id: 'tool-1',
                name: 'GenerateTTS',
                arguments: { text: 'Hello' },
                result: {
                  success: true,
                  data: {
                    backgroundMode: true,
                    taskId: 'task-1',
                    taskScope: {
                      conversationId: 'conv-1',
                      runId: 'run-1',
                      parentRunId: 'run-1',
                      childRunId: 'task-1',
                      childKind: 'task',
                    },
                    status: 'completed',
                    url: 'webview://audio.mp3',
                  },
                },
              },
            },
          ],
        },
      ],
    });

    expect(projection.messages[0]).toMatchObject({
      workItemIds: ['task-1'],
    });
    expect(projection.workItems).toMatchObject([
      {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'msg-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
        progress: 100,
        task: {
          type: 'audio',
          prompt: 'Hello',
        },
      },
    ]);
  });

  it('appends synthetic media task and subagent placeholder messages once', () => {
    const messages = appendMediaTaskMessageToMessages([], 'task-1', {
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });
    const withDuplicate = appendMediaTaskMessageToMessages(messages, 'task-1', {
      now: () => Date.parse('2026-01-01T00:00:01.000Z'),
    });
    const withSubAgent = appendSubAgentMessageToMessages(withDuplicate, 'sub-1', {
      now: () => Date.parse('2026-01-01T00:00:02.000Z'),
    });

    expect(withSubAgent).toMatchObject([
      {
        id: 'media-task-task-1',
        role: 'assistant',
        content: '',
        timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
        workItemIds: ['task-1'],
      },
      {
        id: 'subagent-sub-1',
        role: 'assistant',
        content: '',
        timestamp: Date.parse('2026-01-01T00:00:02.000Z'),
        workItemIds: ['sub-1'],
      },
    ]);
  });
});

function createSubAgentWorkItem(id: string, parentToolCallId: string | null): SubAgentWorkItem {
  return {
    id,
    conversationId: 'conv-a',
    kind: 'subagent',
    scope: {
      conversationId: 'conv-a',
      runId: 'run-a',
      parentRunId: 'parent-a',
      childRunId: id,
      childKind: 'subagent',
    },
    parentMessageId: 'msg-a',
    parentToolCallId,
    title: id,
    status: 'processing',
    progress: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subAgent: {
      parentAgentId: 'parent-a',
    },
  };
}

function createBackgroundTask(id: string, prompt: string): AgentBackgroundTask {
  return {
    scope: {
      conversationId: 'conv-1',
      runId: 'run-1',
      parentRunId: 'run-1',
      childRunId: id,
      childKind: 'task',
    },
    id,
    type: 'image',
    name: prompt,
    prompt,
    providerId: 'provider-1',
    providerName: 'model-1',
    status: 'completed',
    progress: 100,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
