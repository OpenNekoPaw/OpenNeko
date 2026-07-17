import { describe, expect, it } from 'vitest';
import type { AgentQueuedMessageItem, AgentState, AgentWorkItem, Message } from '@neko-agent/types';
import type { ActivationProgressTimeline } from '../activation-progress-presenter';
import {
  projectActiveConversation,
  projectConversationError,
  projectHistoryClearedConversation,
} from '../conversation-ui-presenter';
import { projectConversationSessionState } from '../conversation-session-state-presenter';

describe('conversation UI presenter', () => {
  it('appends an error message and resets streaming state', () => {
    const projected = projectConversationError({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'hello',
          timestamp: 1,
        },
      ],
      errorMessage: 'failed',
      now: () => 1000,
    });

    expect(projected).toEqual({
      messages: [
        { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
        {
          id: '1000',
          role: 'assistant',
          content: 'failed',
          timestamp: 1000,
          isError: true,
        },
      ],
      streaming: {
        streamingMessageId: null,
        isThinking: false,
        queuedMessageCount: 0,
        queuedMessages: [],
      },
    });
  });

  it('projects history cleared into empty messages and idle streaming', () => {
    expect(projectHistoryClearedConversation()).toEqual({
      messages: [],
      streaming: {
        streamingMessageId: null,
        isThinking: false,
        queuedMessageCount: 0,
        queuedMessages: [],
      },
    });
  });

  it('loads active conversation, creates a tab, and rehydrates work items', () => {
    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Generated assets',
        messages: [createCompletedBackgroundTaskMessage()],
      },
      openTabs: [],
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });

    expect(projected.activeConversationId).toBe('conv-1');
    expect(projected.openTabs).toEqual([
      { id: 'tab-1767225600000', title: 'Generated assets', conversationId: 'conv-1' },
    ]);
    expect(projected.activeTabId).toBe('tab-1767225600000');
    expect(projected.streaming).toEqual({
      streamingMessageId: null,
      isThinking: false,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(projected.workItems).toMatchObject([
      {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'assistant-1',
        parentToolCallId: 'tool-1',
        status: 'completed',
        result: { urls: ['webview://asset.png'] },
      },
    ]);
  });

  it('updates an existing default tab title from active conversation metadata', () => {
    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Generated assets',
        messages: [],
      },
      openTabs: [{ id: 'tab-1', title: 'New Chat', conversationId: 'conv-1' }],
    });

    expect(projected.openTabs).toEqual([
      { id: 'tab-1', title: 'Generated assets', conversationId: 'conv-1' },
    ]);
    expect(projected.activeTabId).toBe('tab-1');
  });

  it('restores streaming state from a persisted partial assistant message', () => {
    const projected = projectActiveConversation({
      conversation: {
        id: 'conv-1',
        title: 'Draft',
        messages: [
          { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
          {
            id: 'assistant-stream',
            role: 'assistant',
            content: 'partial',
            timestamp: 2,
            isStreaming: true,
          },
        ],
      },
      openTabs: [],
      generateTabId: () => 'tab-1',
    });

    expect(projected.messages.at(-1)).toMatchObject({
      id: 'assistant-stream',
      isStreaming: true,
    });
    expect(projected.streaming).toEqual({
      streamingMessageId: 'assistant-stream',
      isThinking: true,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
  });

  it('projects empty active conversation into a cleared UI state', () => {
    const projected = projectActiveConversation({
      openTabs: [{ id: 'tab-1', title: 'Old chat', conversationId: 'conv-old' }],
    });

    expect(projected).toMatchObject({
      activeConversationId: null,
      messages: [],
      streaming: { streamingMessageId: null, isThinking: false, queuedMessageCount: 0 },
      activeTabId: null,
      activeTab: 'chat',
      workItems: [],
    });
    expect(projected.openTabs).toEqual([
      { id: 'tab-1', title: 'Old chat', conversationId: 'conv-old' },
    ]);
  });

  it('projects the visible session from one conversation partition only', () => {
    const messageA: Message = { id: 'message-a', role: 'assistant', content: 'A', timestamp: 1 };
    const messageB: Message = { id: 'message-b', role: 'assistant', content: 'B', timestamp: 2 };
    const queuedA = queuedMessage('queue-a', 'conv-a');
    const queuedB = queuedMessage('queue-b', 'conv-b');
    const activationA = activationProgress('conv-a', 'activation-a');
    const activationB = activationProgress('conv-b', 'activation-b');
    const agentStateB: AgentState = { phase: 'acting', toolName: 'ReadFile', startedAt: 20 };
    const workItemB = workItem('work-b', 'conv-b');

    const projected = projectConversationSessionState({
      conversationId: 'conv-b',
      messagesByConversation: new Map([
        ['conv-a', [messageA]],
        ['conv-b', [messageB]],
      ]),
      streamingByConversation: new Map([
        [
          'conv-a',
          { streamingMessageId: 'message-a', isThinking: true, queuedMessages: [queuedA] },
        ],
        [
          'conv-b',
          {
            streamingMessageId: 'message-b',
            isThinking: true,
            queuedMessageCount: 1,
            queuedMessages: [queuedB],
          },
        ],
      ]),
      activationProgressByConversation: new Map([
        ['conv-a', [activationA]],
        ['conv-b', [activationB]],
      ]),
      ambientNodesByConversation: new Map([
        ['conv-a', [{ nodeId: 'node-a', type: 'scene', summary: 'A scene' }]],
        ['conv-b', [{ nodeId: 'node-b', type: 'shot', summary: 'B shot' }]],
      ]),
      tokenCountByConversation: new Map([
        ['conv-a', 100],
        ['conv-b', 200],
      ]),
      compressingByConversation: new Map([
        ['conv-a', true],
        ['conv-b', false],
      ]),
      agentStateByConversation: new Map([
        ['conv-a', { phase: 'thinking', startedAt: 10 }],
        ['conv-b', agentStateB],
      ]),
      workItemsByConversation: new Map([
        ['conv-a', new Map([['work-a', workItem('work-a', 'conv-a')]])],
        ['conv-b', new Map([['work-b', workItemB]])],
      ]),
    });

    expect(projected).toEqual({
      conversationId: 'conv-b',
      messages: [messageB],
      streaming: {
        streamingMessageId: 'message-b',
        isThinking: true,
        queuedMessageCount: 1,
        queuedMessages: [queuedB],
      },
      skill: {
        activationProgress: [activationB],
      },
      context: {
        ambientNodes: [{ nodeId: 'node-b', type: 'shot', summary: 'B shot' }],
        tokenCount: 200,
        isCompressing: false,
      },
      agentState: agentStateB,
      workItems: [workItemB],
    });
  });
});

function taskScope(childRunId: string) {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task' as const,
  };
}

function createCompletedBackgroundTaskMessage(): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    contentBlocks: [
      {
        id: 'block-tool-1',
        type: 'tool_call',
        timestamp: 1,
        toolCall: {
          id: 'tool-1',
          name: 'generate_image',
          arguments: { prompt: 'cat' },
          result: {
            success: true,
            data: {
              backgroundMode: true,
              status: 'completed',
              taskId: 'task-1',
              taskScope: taskScope('task-1'),
              urls: ['webview://asset.png'],
            },
          },
        },
      },
    ],
  };
}

function queuedMessage(id: string, conversationId: string): AgentQueuedMessageItem {
  return {
    id,
    conversationId,
    content: id,
    createdAt: 1,
    source: 'composer',
  };
}

function activationProgress(
  conversationId: string,
  activationId: string,
): ActivationProgressTimeline {
  return {
    conversationId,
    activationId,
    target: 'skill',
    action: 'activate',
    name: activationId,
    source: 'agent-tool',
    requestedBy: 'agent',
    status: 'succeeded',
    events: [],
  };
}

function workItem(id: string, conversationId: string): AgentWorkItem {
  return {
    id,
    conversationId,
    kind: 'tool-background-task',
    parentMessageId: null,
    parentToolCallId: null,
    title: id,
    status: 'processing',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    task: {
      scope: {
        conversationId,
        runId: `run:${conversationId}`,
        parentRunId: `run:${conversationId}`,
        childRunId: id,
        childKind: 'task',
      },
      id,
      type: 'image',
      name: id,
      prompt: id,
      providerId: 'provider',
      providerName: 'Provider',
      status: 'processing',
      progress: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}
