import { describe, expect, it } from 'vitest';
import {
  projectBackgroundTaskToWorkItem,
  type AgentWorkItemTaskStatus,
} from '@neko-agent/types';
import { createEventAdapter } from './event-adapter';
import { testAgentStore as useAgentStore } from '../__tests__/test-runtime';
import { testConversationStore as useConversationStore } from '../__tests__/test-runtime';
import { testUIStore as useUIStore } from '../__tests__/test-runtime';
import { createTestAgentTerminalPresentation } from '../presentation/testing';

describe('createEventAdapter queue projection', () => {
  it('projects user queue snapshots without adding pending items to the transcript', () => {
    resetStores();
    const adapter = createEventAdapter({
      agentStore: useAgentStore.getState,
      conversationStore: useConversationStore.getState,
      uiStore: useUIStore.getState,
      presentation: createTestAgentTerminalPresentation(),
    });

    adapter.handleEvent({
      type: 'messageQueued',
      pendingCount: 1,
      queuedMessageItem: {
        id: 'queue-1',
        conversationId: 'conv-1',
        content: 'next prompt',
        createdAt: 1000,
        source: 'composer',
      },
      messageQueueSnapshot: {
        conversationId: 'conv-1',
        items: [
          {
            id: 'queue-1',
            conversationId: 'conv-1',
            content: 'next prompt',
            createdAt: 1000,
            source: 'composer',
          },
        ],
        pendingCount: 1,
        version: 1,
      },
    });
    adapter.handleEvent({
      type: 'messageQueued',
      pendingCount: 0,
      releasedQueuedMessageItem: {
        id: 'queue-1',
        conversationId: 'conv-1',
        content: 'next prompt',
        createdAt: 1000,
        source: 'composer',
      },
      messageQueueSnapshot: {
        conversationId: 'conv-1',
        items: [],
        pendingCount: 0,
        version: 2,
      },
    });

    expect(useAgentStore.getState().messageQueue.snapshot).toMatchObject({
      pendingCount: 0,
      version: 2,
    });
    expect(
      useConversationStore.getState().messages.filter((message) => message.role === 'user'),
    ).toHaveLength(0);
    expect(useConversationStore.getState().messages).toHaveLength(0);
  });

  it('keeps source-aware internal continuation activity as a system note', () => {
    resetStores();
    const adapter = createEventAdapter({
      agentStore: useAgentStore.getState,
      conversationStore: useConversationStore.getState,
      uiStore: useUIStore.getState,
      presentation: createTestAgentTerminalPresentation('zh-cn'),
    });

    adapter.handleEvent({
      type: 'messageQueued',
      pendingCount: 1,
      queuedMessageItem: {
        id: 'continuation-1',
        conversationId: 'conv-1',
        content: 'Continue after task completion',
        createdAt: 1000,
        source: 'task-result-continuation',
        metadata: { taskId: 'task-123' },
      },
      messageQueueSnapshot: {
        conversationId: 'conv-1',
        items: [
          {
            id: 'continuation-1',
            conversationId: 'conv-1',
            content: 'Continue after task completion',
            createdAt: 1000,
            source: 'task-result-continuation',
            metadata: { taskId: 'task-123' },
          },
        ],
        pendingCount: 1,
        version: 1,
      },
    });

    expect(useConversationStore.getState().messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: '任务续跑已入队：task-123（1 条待处理）',
      }),
    ]);
    expect(
      useConversationStore.getState().messages.some((message) => message.role === 'user'),
    ).toBe(false);
  });
});

describe('createEventAdapter timeline projection', () => {
  it('projects text, tools, failures, and later text as ordered timeline rows', () => {
    resetStores();
    const adapter = createEventAdapter({
      agentStore: useAgentStore.getState,
      conversationStore: useConversationStore.getState,
      uiStore: useUIStore.getState,
      presentation: createTestAgentTerminalPresentation(),
    });

    adapter.handleEvent({ type: 'text_delta', content: 'Before tool. ' });
    adapter.handleEvent({
      type: 'tool_call',
      toolCall: { id: 'call-1', name: 'ReadFile', arguments: { path: 'brief.md' } },
    });
    adapter.handleEvent({
      type: 'tool_result',
      toolResult: {
        toolCallId: 'call-1',
        success: false,
        data: null,
        error: 'File missing',
      },
    });
    adapter.handleEvent({ type: 'text_delta', content: 'After tool.' });
    adapter.handleEvent({ type: 'done' });

    const assistant = useConversationStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(assistant?.toolCalls).toEqual([]);
    expect(
      assistant?.timelineRows?.map((row) => [row.kind, row.status, row.content ?? row.toolCallId]),
    ).toEqual([
      ['assistant_text', 'complete', 'Before tool. '],
      ['tool', 'error', 'call-1'],
      ['assistant_text', 'complete', 'After tool.'],
    ]);
  });

  it('keeps tool confirmation anchored while still showing approval UI', () => {
    resetStores();
    const adapter = createEventAdapter({
      agentStore: useAgentStore.getState,
      conversationStore: useConversationStore.getState,
      uiStore: useUIStore.getState,
      presentation: createTestAgentTerminalPresentation(),
    });

    adapter.handleEvent({
      type: 'tool_call',
      toolCall: { id: 'call-2', name: 'WriteFile', arguments: { path: 'out.txt' } },
    });
    adapter.handleEvent({
      type: 'tool_confirmation',
      toolConfirmation: {
        toolCall: {
          id: 'call-2',
          index: 0,
          name: 'WriteFile',
          arguments: { path: 'out.txt' },
        },
        action: 'write file',
        description: 'Write out.txt',
        details: {},
        confirmationToken: 'confirm-2',
      },
    });

    const assistant = useConversationStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(assistant?.timelineRows?.find((row) => row.toolCallId === 'call-2')).toMatchObject({
      kind: 'tool',
      status: 'waiting',
      confirmationSummary: 'write file - Write out.txt',
      parent: { kind: 'tool', id: 'call-2' },
    });
    expect(useUIStore.getState().pendingApproval).toMatchObject({
      toolCallId: 'call-2',
      toolName: 'WriteFile',
    });
  });

  it('projects Task work items from the production timeline update into conversation TODO state', () => {
    resetStores();
    const adapter = createEventAdapter({
      agentStore: useAgentStore.getState,
      conversationStore: useConversationStore.getState,
      uiStore: useUIStore.getState,
      presentation: createTestAgentTerminalPresentation(),
    });

    adapter.handleMessage(
      createTaskTimelineUpdate(
        createTaskWorkItem('task-1', 'Generate keyframe', 'processing', 1),
        1,
      ),
    );
    adapter.handleMessage(
      createTaskTimelineUpdate(
        createTaskWorkItem('task-2', 'Generate motion pass', 'processing', 2),
        1,
      ),
    );

    let assistant = useConversationStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(assistant?.todos).toEqual([
      { content: 'Generate motion pass', status: 'in_progress' },
      { content: 'Generate keyframe', status: 'pending' },
    ]);

    adapter.handleMessage(
      createTaskTimelineUpdate(
        createTaskWorkItem('task-1', 'Generate keyframe', 'completed', 3),
        2,
      ),
    );

    assistant = useConversationStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(assistant?.todos).toEqual([
      { content: 'Generate motion pass', status: 'in_progress' },
      { content: 'Generate keyframe', status: 'completed' },
    ]);

    adapter.reset();
    adapter.handleMessage(
      createTaskTimelineUpdate(
        createTaskWorkItem('task-3', 'Validate output', 'failed', 4),
        1,
      ),
    );
    assistant = useConversationStore.getState().messages.at(-1);
    expect(assistant?.todos).toEqual([{ content: 'Validate output', status: 'blocked' }]);
  });
});

function resetStores(): void {
  useAgentStore.getState().reset();
  useConversationStore.getState().clearMessages();
  useUIStore.setState({
    pendingApproval: null,
    pendingSelection: null,
    scrollOffset: 0,
    inputFocused: true,
    slashMenuOpen: false,
  });
}

function createTaskWorkItem(
  taskId: string,
  title: string,
  status: AgentWorkItemTaskStatus,
  updatedSecond: number,
) {
  return projectBackgroundTaskToWorkItem({
    conversationId: 'conv-1',
    task: {
      scope: {
        conversationId: 'conv-1',
        runId: 'run-1',
        parentRunId: 'run-1',
        childRunId: taskId,
        childKind: 'task',
      },
      id: taskId,
      type: 'image',
      name: title,
      prompt: title,
      providerId: 'provider-1',
      providerName: 'model-1',
      status,
      progress: status === 'completed' ? 100 : 50,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: `2026-01-01T00:00:0${updatedSecond}.000Z`,
    },
  });
}

function createTaskTimelineUpdate(
  workItem: ReturnType<typeof createTaskWorkItem>,
  itemRevision: number,
) {
  const timestamp = Date.parse(workItem.updatedAt);
  return {
    type: 'agentTurnTimelineUpdate' as const,
    conversationId: workItem.conversationId,
    turnId: 'turn-1',
    messageId: 'message-1',
    operations: [
      {
        operation: 'upsert' as const,
        item: {
          conversationId: workItem.conversationId,
          turnId: 'turn-1',
          messageId: 'message-1',
          itemId: `${workItem.kind}-${workItem.id}`,
          sequence: 1,
          itemRevision,
          kind: 'task' as const,
          status:
            workItem.status === 'completed'
              ? ('succeeded' as const)
              : workItem.status === 'failed' || workItem.status === 'cancelled'
                ? ('failed' as const)
                : ('pending' as const),
          parentAnchor: 'turn' as const,
          payload: { workItem },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ],
  };
}
