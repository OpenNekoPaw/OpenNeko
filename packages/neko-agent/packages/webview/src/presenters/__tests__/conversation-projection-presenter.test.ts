import { describe, expect, it } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineTaskItem,
  ConversationProjectionSnapshot,
  Message,
  TaskWorkItem,
} from '@neko-agent/types';
import { projectConversationProjectionRenderState } from '../conversation-projection-presenter';

describe('conversation projection presenter', () => {
  it('uses the Tab projection as authority for matching messages while retaining history', () => {
    const history: Message[] = [
      { id: 'user-1', role: 'user', content: 'question', timestamp: 1 },
      { id: 'message-1', role: 'assistant', content: 'stale timeline', timestamp: 2 },
    ];

    const result = projectConversationProjectionRenderState({
      messages: history,
      workItems: [],
      isThinking: false,
      streamingMessageId: null,
      projection: projection('canonical answer'),
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBe(history[0]);
    expect(result.messages[1]).toMatchObject({
      id: 'message-1',
      content: 'canonical answer',
      isStreaming: true,
    });
    expect(result).toMatchObject({ isThinking: true, streamingMessageId: 'message-1' });
  });

  it('inserts a late-arriving assistant turn at its chronological position', () => {
    const history: Message[] = [
      { id: 'user-1', role: 'user', content: 'first prompt', timestamp: 1 },
      { id: 'user-2', role: 'user', content: 'second prompt', timestamp: 3 },
    ];

    const result = projectConversationProjectionRenderState({
      messages: history,
      workItems: [],
      isThinking: false,
      streamingMessageId: null,
      projection: projection('first response', { createdAt: 2 }),
    });

    expect(result.messages.map((message) => message.id)).toEqual(['user-1', 'message-1', 'user-2']);
  });

  it('replaces matching work items with the projection-owned value', () => {
    const stale = workItem('work-1', 10, 'queued');
    const canonical = workItem('work-1', 75, 'processing');
    const snapshot = projection('answer', {
      extraItems: [taskItem(canonical)],
    });

    const result = projectConversationProjectionRenderState({
      messages: [],
      workItems: [stale],
      isThinking: false,
      streamingMessageId: null,
      projection: snapshot,
    });

    expect(result.workItems).toEqual([canonical]);
    expect(result.messages[0]?.workItemIds).toEqual(['work-1']);
  });

  it('projects exact final content and clears streaming state after completion', () => {
    const result = projectConversationProjectionRenderState({
      messages: [],
      workItems: [],
      isThinking: true,
      streamingMessageId: 'legacy-message',
      projection: projection('exact final content', { completed: true }),
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      content: 'exact final content',
      isStreaming: false,
    });
    expect(result).toMatchObject({ isThinking: false, streamingMessageId: null });
  });

  it('withholds an active shared message through an authoritative empty snapshot', () => {
    const activeMessage: Message = {
      id: 'legacy-message',
      role: 'assistant',
      content: 'non-Timeline partial',
      timestamp: 1,
      isStreaming: true,
      contentBlocks: [
        {
          id: 'block-shared',
          type: 'text',
          timestamp: 1,
          content: 'non-Timeline partial',
          isStreaming: true,
        },
      ],
    };
    const result = projectConversationProjectionRenderState({
      messages: [activeMessage],
      workItems: [],
      isThinking: true,
      streamingMessageId: 'legacy-message',
      projection: { conversationId: 'conv-1', projectionVersion: 0, turns: [] },
    });

    expect(result).toMatchObject({ messages: [], isThinking: true, streamingMessageId: null });
  });

  it('keeps an unowned active message withheld while retaining projected history', () => {
    const result = projectConversationProjectionRenderState({
      messages: [
        {
          id: 'message-2',
          role: 'assistant',
          content: 'non-Timeline partial',
          timestamp: 2,
          isStreaming: true,
        },
      ],
      workItems: [],
      isThinking: true,
      streamingMessageId: 'message-2',
      projection: projection('completed history', { completed: true }),
    });

    expect(result.messages).toEqual([
      expect.objectContaining({
        id: 'message-1',
        content: 'completed history',
        isStreaming: false,
      }),
    ]);
    expect(result).toMatchObject({ isThinking: true, streamingMessageId: null });
  });

  it('lets a completed Timeline turn replace stale shared streaming content', () => {
    const result = projectConversationProjectionRenderState({
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          content: 'stale partial',
          timestamp: 1,
          isStreaming: true,
        },
      ],
      workItems: [],
      isThinking: true,
      streamingMessageId: 'message-1',
      projection: projection('canonical final', { completed: true }),
    });

    expect(result.messages).toEqual([
      expect.objectContaining({
        id: 'message-1',
        content: 'canonical final',
        isStreaming: false,
      }),
    ]);
    expect(result).toMatchObject({ isThinking: false, streamingMessageId: null });
  });

  it('keeps render results isolated for independent replicas of the same conversation', () => {
    const base = {
      messages: [] as Message[],
      workItems: [] as TaskWorkItem[],
      isThinking: false,
      streamingMessageId: null,
    };

    const resultA = projectConversationProjectionRenderState({
      ...base,
      projection: projection('tab A'),
    });
    const resultB = projectConversationProjectionRenderState({
      ...base,
      projection: projection('tab B'),
    });

    expect(resultA.messages[0]?.content).toBe('tab A');
    expect(resultB.messages[0]?.content).toBe('tab B');
  });
});

function projection(
  content: string,
  options: {
    readonly completed?: boolean;
    readonly createdAt?: number;
    readonly extraItems?: readonly AgentTurnTimelineTaskItem[];
  } = {},
): ConversationProjectionSnapshot {
  const text = textItem(
    content,
    options.completed ? 'complete' : 'streaming',
    options.createdAt ?? 1,
  );
  return {
    conversationId: 'conv-1',
    projectionVersion: 1,
    turns: [
      {
        turnId: 'turn-1',
        messageId: 'message-1',
        items: [text, ...(options.extraItems ?? [])],
        ...(options.completed
          ? { completion: { status: 'completed' as const, completedAt: 2 } }
          : {}),
      },
    ],
  };
}

function textItem(
  content: string,
  status: AgentTurnTimelineAssistantTextItem['status'],
  createdAt = 1,
): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'message-1',
    itemId: 'text-1',
    sequence: 1,
    itemRevision: 1,
    kind: 'assistant_text',
    status,
    payload: { content, format: 'markdown', sourceGeneration: 1 },
    createdAt,
    updatedAt: createdAt,
  };
}

function taskItem(item: TaskWorkItem): AgentTurnTimelineTaskItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'message-1',
    itemId: 'task-1',
    sequence: 2,
    itemRevision: 1,
    kind: 'task',
    status: 'pending',
    parentAnchor: 'turn',
    payload: { workItem: item },
    createdAt: 1,
    updatedAt: 1,
  };
}

function workItem(id: string, progress: number, status: TaskWorkItem['status']): TaskWorkItem {
  return {
    id,
    conversationId: 'conv-1',
    kind: 'tool-background-task',
    parentMessageId: 'message-1',
    parentToolCallId: null,
    title: id,
    status,
    progress,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:01.000Z',
    task: {
      scope: {
        conversationId: 'conv-1',
        runId: 'run-1',
        parentRunId: 'run-1',
        childRunId: id,
        childKind: 'task',
      },
      id,
      type: 'image',
      name: id,
      prompt: id,
      providerId: 'local',
      providerName: 'Neko',
      status,
      progress,
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:01.000Z',
    },
  };
}
