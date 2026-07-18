import { createAgentMarkdownSessionRegistry } from '@/markdown/agent-markdown-session-registry';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentBackgroundTask,
  AgentMediaTaskView,
  AgentQueuedMessageItem,
  ExtensionToWebviewMessage,
  Message,
  SubAgentWorkItemEvent,
} from '@neko-agent/types';
import type { ChildRunScope, TaskRunScope } from '@neko/shared';
import {
  projectBackgroundTaskToWorkItem,
  projectMediaTaskToWorkItem,
  projectSubAgentEventToWorkItem,
} from '@/presenters/work-item-projection-presenter';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { MentionItem } from '@/components/ChatView/InputArea/types';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import { configHandlers } from '../config-handlers';
import { mediaHandlers } from '../media-handlers';
import { subAgentHandlers } from '../subagent-handlers';
import { streamingHandlers } from '../streaming-handlers';
import { taskHandlers } from '../task-handlers';
import type { HandlerRegistration, MessageHandlerContext, StreamingState } from '../types';
import { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import {
  commitConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';

describe('work item message handlers', () => {
  it('stores plugin availability for TaskCard send-to menus', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      configHandlers,
      {
        type: 'pluginsAvailable',
        plugins: { canvas: true, cut: false },
      },
      harness.context,
    );

    expect(harness.pluginsAvailable()).toEqual({ canvas: true, cut: false });
  });

  it('ignores stale project file mention results for older @ filters', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      mentionSearchFilter: 'png',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        conversationId: 'conv-a',
        filter: 'p',
        files: [{ path: 'assets/old-preview.png', name: 'old-preview.png', type: 'file' }],
      },
      harness.context,
    );
    expect(harness.mentionItems()).toEqual([]);

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        conversationId: 'conv-a',
        filter: 'png',
        files: [{ path: 'assets/current.png', name: 'current.png', type: 'file' }],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([
      expect.objectContaining({
        id: 'file:assets/current.png',
        filePath: 'assets/current.png',
      }),
    ]);
  });

  it('accepts entry roleplay search results without an active conversation scope', () => {
    const harness = createContextHarness({
      activeConversationId: null,
      mentionSearchFilter: '',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        filter: '',
        purpose: 'roleplay',
        mentionExtras: [
          {
            type: 'entity',
            id: 'char-xiaoju',
            label: '小橘',
            summary: 'Character: 小橘',
            entityType: 'character',
          },
        ],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([
      expect.objectContaining({
        id: 'entity:char-xiaoju',
        label: '小橘',
        entityType: 'character',
      }),
    ]);
  });

  it('accepts entry mention search results without opening a conversation scope', () => {
    const harness = createContextHarness({
      activeConversationId: null,
      mentionSearchFilter: 'hero',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        filter: 'hero',
        purpose: 'entry',
        files: [{ path: 'assets/hero.png', name: 'hero.png', type: 'file', mediaType: 'image' }],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([
      expect.objectContaining({
        id: 'file:assets/hero.png',
        label: 'hero.png',
        filePath: 'assets/hero.png',
      }),
    ]);
    expect(harness.context.activeConversationIdRef.current).toBeNull();
  });

  it('rejects ordinary project file results without an active conversation scope', () => {
    const harness = createContextHarness({
      activeConversationId: null,
      mentionSearchFilter: '',
    });

    dispatch(
      configHandlers,
      {
        type: 'projectFiles',
        filter: '',
        files: [{ path: 'assets/current.png', name: 'current.png', type: 'file' }],
      },
      harness.context,
    );

    expect(harness.mentionItems()).toEqual([]);
  });

  it('merges task updates by conversation instead of replacing the global store', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-a',
        workItems: [createTaskWorkItem('conv-a', createBackgroundTask('task-a', 'Generate A'))],
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-b',
        workItems: [
          createTaskWorkItem('conv-b', createBackgroundTask('task-b', 'Generate B', 'conv-b')),
        ],
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'taskUpdated',
        conversationId: 'conv-a',
        workItem: createTaskWorkItem('conv-a', {
          ...createBackgroundTask('task-a', 'Generate A'),
          status: 'completed',
          progress: 100,
        }),
      },
      harness.context,
    );

    expect(findWorkItem(harness.workItems(), 'conv-a', 'task-a')).toMatchObject({
      conversationId: 'conv-a',
      status: 'completed',
      progress: 100,
    });
    expect(findWorkItem(harness.workItems(), 'conv-b', 'task-b')).toMatchObject({
      conversationId: 'conv-b',
      status: 'queued',
    });
  });

  it('preserves task parent links when progress updates omit linkage fields', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      taskHandlers,
      {
        type: 'taskCreated',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        toolCallId: 'tool-a',
        workItem: createTaskWorkItem('conv-a', createBackgroundTask('task-a', 'Generate A'), {
          parentMessageId: 'msg-a',
          parentToolCallId: 'tool-a',
        }),
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'taskUpdated',
        conversationId: 'conv-a',
        workItem: createTaskWorkItem('conv-a', {
          ...createBackgroundTask('task-a', 'Generate A'),
          status: 'processing',
          progress: 50,
        }),
      },
      harness.context,
    );

    expect(findWorkItem(harness.workItems(), 'conv-a', 'task-a')).toMatchObject({
      status: 'processing',
      progress: 50,
      parentMessageId: 'msg-a',
      parentToolCallId: 'tool-a',
    });
  });

  it('reconciles task snapshots without removing media, subagent, or linked work items', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-a',
        workItems: [
          createTaskWorkItem('conv-a', createBackgroundTask('stale-task', 'Stale snapshot task')),
          createTaskWorkItem('conv-a', createBackgroundTask('live-task', 'Live snapshot task')),
        ],
      },
      harness.context,
    );
    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        workItem: createMediaWorkItem('conv-a', 'media-task'),
      },
      harness.context,
    );
    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-a', 'parent-a', 'subagent-task'),
      subAgentId: 'subagent-task',
      parentAgentId: 'parent-a',
      conversationId: 'conv-a',
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-a',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'taskCreated',
        conversationId: 'conv-a',
        messageId: 'msg-a',
        toolCallId: 'tool-a',
        workItem: createTaskWorkItem(
          'conv-a',
          createBackgroundTask('linked-task', 'Linked tool task'),
          { parentMessageId: 'msg-a', parentToolCallId: 'tool-a' },
        ),
      },
      harness.context,
    );
    dispatch(
      taskHandlers,
      {
        type: 'tasksUpdated',
        conversationId: 'conv-a',
        workItems: [
          createTaskWorkItem('conv-a', {
            ...createBackgroundTask('live-task', 'Live snapshot task'),
            status: 'processing',
            progress: 50,
          }),
        ],
      },
      harness.context,
    );

    expect(findWorkItem(harness.workItems(), 'conv-a', 'stale-task')).toBeUndefined();
    expect(findWorkItem(harness.workItems(), 'conv-a', 'live-task')).toMatchObject({
      kind: 'tool-background-task',
      status: 'processing',
      progress: 50,
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'media-task')).toMatchObject({
      kind: 'media-task',
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'subagent-task')).toMatchObject({
      kind: 'subagent',
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'linked-task')).toMatchObject({
      kind: 'tool-background-task',
      parentMessageId: 'msg-a',
      parentToolCallId: 'tool-a',
    });
  });

  it('routes media task creation to the owning non-current conversation', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      nonCurrentMessages: new Map([['conv-b', []]]),
      currentStreaming: { isThinking: true, streamingMessageId: 'stream-a', queuedMessageCount: 0 },
      nonCurrentStreaming: new Map([
        ['conv-b', { isThinking: true, streamingMessageId: 'stream-b', queuedMessageCount: 0 }],
      ]),
    });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-b',
        workItem: createMediaWorkItem('conv-b', 'media-b'),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.conversationMessages().get('conv-b')).toMatchObject([
      {
        id: 'media-task-media-b',
        workItemIds: ['media-b'],
      },
    ]);
    expect(harness.streaming().isThinking).toBe(true);
    expect(harness.conversationStreaming().get('conv-b')).toEqual({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
      queuedMessages: [],
    });
    expect(findWorkItem(harness.workItems(), 'conv-b', 'media-b')).toMatchObject({
      kind: 'media-task',
      conversationId: 'conv-b',
    });
    expect(harness.workItems().get('conv-a')).toBeUndefined();
  });

  it('keeps direct media turns running until the terminal streamComplete arrives', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'thinking',
        conversationId: 'conv-a',
      },
      harness.context,
    );
    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        parentScope: 'turn',
        workItem: createMediaWorkItem('conv-a', 'media-a'),
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: true,
      streamingMessageId: null,
    });
    expect(harness.messages()).toEqual([expect.objectContaining({ workItemIds: ['media-a'] })]);

    dispatch(
      streamingHandlers,
      {
        type: 'streamComplete',
        conversationId: 'conv-a',
        messageId: 'media-turn:media-a',
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
    });
  });

  it('clears direct media turn running state from terminal progress events', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      currentStreaming: { isThinking: false, streamingMessageId: null, queuedMessageCount: 0 },
    });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        parentScope: 'turn',
        workItem: createMediaWorkItem('conv-a', 'media-a'),
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: true,
      streamingMessageId: null,
    });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskProgress',
        conversationId: 'conv-a',
        parentScope: 'turn',
        workItem: createMediaWorkItem('conv-a', 'media-a', { status: 'completed' }),
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
    });
  });

  it('stores queued message count from streaming events', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        content: 'Message queued (2 pending)',
        pendingCount: 2,
      },
      harness.context,
    );

    expect(harness.streaming()).toMatchObject({
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 2,
    });
    expect(harness.messages()).toEqual([]);

    dispatch(
      streamingHandlers,
      {
        type: 'streamThinking',
        conversationId: 'conv-a',
        messageId: 'stream-a',
        content: 'Working',
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(2);

    dispatch(
      streamingHandlers,
      {
        type: 'streamComplete',
        conversationId: 'conv-a',
        messageId: 'stream-a',
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(0);
  });

  it('replaces hidden optimistic queued messages with authoritative queue snapshots', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '生成分镜表',
          timestamp: 1,
        },
        {
          id: 'queued-1',
          role: 'user',
          content: '要求后续变更',
          timestamp: 2,
          isQueued: true,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '初稿完成',
          timestamp: 3,
        },
        {
          id: 'queued-2',
          role: 'user',
          content: '再补充镜头',
          timestamp: 4,
          isQueued: true,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 2,
        queuedMessages: [],
        messageQueueVersion: 0,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 2,
          version: 1,
          items: [
            {
              id: 'runtime-1',
              conversationId: 'conv-a',
              content: '要求后续变更',
              createdAt: 10,
              source: 'composer',
            },
            {
              id: 'runtime-2',
              conversationId: 'conv-a',
              content: '再补充镜头',
              createdAt: 11,
              source: 'composer',
            },
          ],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(2);
    expect(harness.streaming().queuedMessages?.map((item) => item.id)).toEqual([
      'runtime-1',
      'runtime-2',
    ]);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ id: 'assistant-1' }),
    ]);
  });

  it('removes a stale visible user message when the runtime confirms it is queued', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '生成图片',
          timestamp: 100,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '正在生成...',
          timestamp: 200,
        },
        {
          id: 'local-hi',
          role: 'user',
          content: 'hi',
          timestamp: 1_000,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 0,
        queuedMessages: [],
        messageQueueVersion: 0,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 1,
          version: 1,
          items: [
            {
              id: 'runtime-hi',
              conversationId: 'conv-a',
              content: 'hi',
              createdAt: 1_005,
              source: 'composer',
            },
          ],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(1);
    expect(harness.streaming().queuedMessages?.map((item) => item.id)).toEqual(['runtime-hi']);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1' }),
      expect.objectContaining({ id: 'assistant-1' }),
    ]);
  });

  it('ignores stale queue snapshots by conversation-local version', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'runtime-current',
            conversationId: 'conv-a',
            content: '当前排队消息',
            createdAt: 10,
            source: 'composer',
          },
        ],
        messageQueueVersion: 3,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(1);
    expect(harness.streaming().queuedMessages?.map((item) => item.id)).toEqual(['runtime-current']);
  });

  it('applies queued edit requests and asks the composer layer to restore content', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'queued-optimistic',
          role: 'user',
          content: '重新编辑我',
          timestamp: 2,
          isQueued: true,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'runtime-1',
            conversationId: 'conv-a',
            content: '重新编辑我',
            createdAt: 10,
            source: 'composer',
          },
        ],
        messageQueueVersion: 1,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'queuedMessageEditRequested',
        tabId: 'tab-a',
        conversationId: 'conv-a',
        item: {
          id: 'runtime-1',
          conversationId: 'conv-a',
          content: '重新编辑我',
          createdAt: 10,
          source: 'composer',
        },
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(0);
    expect(harness.streaming().queuedMessages).toEqual([]);
    expect(harness.messages()).toEqual([]);
    expect(harness.queuedEditRequest()).toEqual({
      tabId: 'tab-a',
      conversationId: 'conv-a',
      item: expect.objectContaining({ id: 'runtime-1', content: '重新编辑我' }),
    });
  });

  it('projects a released queued item into the transcript when execution starts', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '原始请求',
          timestamp: 1,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'runtime-1',
            conversationId: 'conv-a',
            content: '继续补充分镜',
            createdAt: 10,
            source: 'composer',
          },
        ],
        messageQueueVersion: 1,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        pendingCount: 0,
        releasedItem: {
          id: 'runtime-1',
          conversationId: 'conv-a',
          content: '继续补充分镜',
          createdAt: 10,
          source: 'composer',
        },
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(0);
    expect(harness.streaming().queuedMessages).toEqual([]);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1', role: 'user', content: '原始请求' }),
      {
        id: 'released:runtime-1',
        role: 'user',
        content: '继续补充分镜',
        timestamp: 10,
      },
    ]);
  });

  it('keeps released task-result observations on the control plane instead of adding user messages', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'user-1',
          role: 'user',
          content: '生成图片',
          timestamp: 1,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '图片已生成',
          timestamp: 2,
        },
      ],
      currentStreaming: {
        isThinking: false,
        streamingMessageId: null,
        queuedMessageCount: 1,
        queuedMessages: [
          {
            id: 'task-observation-1',
            conversationId: 'conv-a',
            content: 'Continue from the completed async task result.',
            createdAt: 10,
            source: 'task-result-continuation',
          },
        ],
        messageQueueVersion: 1,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        pendingCount: 0,
        releasedItem: {
          id: 'task-observation-1',
          conversationId: 'conv-a',
          content: 'Continue from the completed async task result.',
          createdAt: 10,
          source: 'task-result-continuation',
        },
        snapshot: {
          conversationId: 'conv-a',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      },
      harness.context,
    );

    expect(harness.streaming().isThinking).toBe(true);
    expect(harness.streaming().queuedMessageCount).toBe(0);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'user-1', role: 'user', content: '生成图片' }),
      expect.objectContaining({ id: 'assistant-1', role: 'assistant', content: '图片已生成' }),
    ]);
  });

  it('does not release local queue items on queue acknowledgement events', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'queued-1',
          role: 'user',
          content: '第一条后续消息',
          timestamp: 1,
          isQueued: true,
        },
        {
          id: 'queued-2',
          role: 'user',
          content: '第二条后续消息',
          timestamp: 2,
          isQueued: true,
        },
      ],
      currentStreaming: {
        isThinking: true,
        streamingMessageId: 'assistant-1',
        queuedMessageCount: 0,
      },
    });

    dispatch(
      streamingHandlers,
      {
        type: 'messageQueued',
        conversationId: 'conv-a',
        content: 'Message queued (1 pending)',
        pendingCount: 1,
      },
      harness.context,
    );

    expect(harness.streaming().queuedMessageCount).toBe(1);
    expect(harness.messages()).toEqual([
      expect.objectContaining({ id: 'queued-1', isQueued: true }),
      expect.objectContaining({ id: 'queued-2', isQueued: true }),
    ]);
  });

  it('drops media task events when the route conversation does not match the work item', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    dispatch(
      mediaHandlers,
      {
        type: 'mediaTaskCreated',
        conversationId: 'conv-a',
        workItem: createMediaWorkItem('conv-b', 'media-b'),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.workItems().size).toBe(0);
  });

  it('attaches subagent events to the parent tool call in the target conversation only', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [],
      nonCurrentMessages: new Map([
        [
          'conv-b',
          [
            {
              id: 'msg-b',
              role: 'assistant',
              content: '',
              timestamp: 1,
              contentBlocks: [
                {
                  id: 'block-b',
                  type: 'tool_call',
                  timestamp: 1,
                  toolCall: {
                    id: 'tool-b',
                    name: 'subagent',
                    arguments: {},
                  },
                },
              ],
            },
          ],
        ],
      ]),
    });

    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-b', 'parent-b', 'sub-b'),
      subAgentId: 'sub-b',
      parentAgentId: 'parent-b',
      conversationId: 'conv-b',
      data: {
        description: 'Review target conversation',
        parentToolCallId: 'tool-b',
        runMode: 'background',
        modelTier: 'fast',
      },
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-b',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.conversationMessages().get('conv-b')?.[0]).toMatchObject({
      id: 'msg-b',
      workItemIds: ['sub-b'],
    });
    expect(findWorkItem(harness.workItems(), 'conv-b', 'sub-b')).toMatchObject({
      kind: 'subagent',
      conversationId: 'conv-b',
      parentToolCallId: 'tool-b',
      subAgent: {
        parentAgentId: 'parent-b',
        runMode: 'background',
        modelTier: 'fast',
      },
    });
    expect(harness.workItems().get('conv-a')).toBeUndefined();
  });

  it('attaches subagent events to the parent tool call in the current conversation', () => {
    const harness = createContextHarness({
      activeConversationId: 'conv-a',
      currentMessages: [
        {
          id: 'msg-a',
          role: 'assistant',
          content: '',
          timestamp: 1,
          contentBlocks: [
            {
              id: 'block-a',
              type: 'tool_call',
              timestamp: 1,
              toolCall: {
                id: 'tool-a',
                name: 'subagent',
                arguments: {},
              },
            },
          ],
        },
      ],
    });

    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-a', 'parent-a', 'sub-a'),
      subAgentId: 'sub-a',
      parentAgentId: 'parent-a',
      conversationId: 'conv-a',
      data: {
        description: 'Review current conversation',
        parentToolCallId: 'tool-a',
        runMode: 'background',
        modelTier: 'fast',
      },
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-a',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );

    expect(harness.messages()).toHaveLength(1);
    expect(harness.messages()[0]).toMatchObject({
      id: 'msg-a',
      workItemIds: ['sub-a'],
    });
    expect(findWorkItem(harness.workItems(), 'conv-a', 'sub-a')).toMatchObject({
      kind: 'subagent',
      conversationId: 'conv-a',
      parentToolCallId: 'tool-a',
    });
  });

  it('drops subagent events when the route conversation does not match the event', () => {
    const harness = createContextHarness({ activeConversationId: 'conv-a' });

    const subAgentEvent = {
      type: 'started',
      scope: subAgentScope('conv-b', 'parent-b', 'sub-b'),
      subAgentId: 'sub-b',
      parentAgentId: 'parent-b',
      conversationId: 'conv-b',
      timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    } satisfies SubAgentWorkItemEvent;

    dispatch(
      subAgentHandlers,
      {
        type: 'subagentEvent',
        conversationId: 'conv-a',
        event: subAgentEvent,
        workItem: projectSubAgentEventToWorkItem(subAgentEvent),
      },
      harness.context,
    );

    expect(harness.messages()).toEqual([]);
    expect(harness.workItems().size).toBe(0);
  });
});

function dispatch(
  handlers: readonly HandlerRegistration[],
  message: ExtensionToWebviewMessage,
  context: MessageHandlerContext,
): void {
  const registration = handlers.find((handler) => handler.type === message.type);
  expect(registration).toBeDefined();
  registration?.handler(message, context);
}

function findWorkItem(store: AgentWorkItemStore, conversationId: string, localId: string) {
  return Array.from(store.get(conversationId)?.values() ?? []).find((item) => item.id === localId);
}

function taskScope(conversationId: string, childRunId: string): TaskRunScope {
  return {
    conversationId,
    runId: `run:${conversationId}`,
    parentRunId: `run:${conversationId}`,
    childRunId,
    childKind: 'task',
  };
}

function subAgentScope(
  conversationId: string,
  parentRunId: string,
  childRunId: string,
): ChildRunScope {
  return {
    conversationId,
    runId: `run:${conversationId}`,
    parentRunId,
    childRunId,
    childKind: 'subagent',
  };
}

function createBackgroundTask(
  id: string,
  prompt: string,
  conversationId = 'conv-a',
): AgentBackgroundTask {
  return {
    scope: taskScope(conversationId, id),
    id,
    type: 'image',
    name: prompt,
    prompt,
    providerId: 'provider-1',
    providerName: 'model-1',
    status: 'queued',
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createTaskWorkItem(
  conversationId: string,
  task: AgentBackgroundTask,
  links: { parentMessageId?: string; parentToolCallId?: string } = {},
) {
  return projectBackgroundTaskToWorkItem({
    conversationId,
    task,
    parentMessageId: links.parentMessageId,
    parentToolCallId: links.parentToolCallId,
  });
}

function createMediaTask(
  conversationId: string,
  id: string,
  overrides: Partial<Pick<AgentMediaTaskView, 'status' | 'progress'>> = {},
): AgentMediaTaskView {
  return {
    scope: taskScope(conversationId, id),
    id,
    type: 'image',
    status: overrides.status ?? 'processing',
    progress: overrides.progress ?? 25,
    providerId: 'provider-1',
    modelId: 'model-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
    request: { prompt: 'Generate image' },
  };
}

function createMediaWorkItem(
  conversationId: string,
  id: string,
  options: {
    parentMessageId?: string;
    parentToolCallId?: string;
    status?: AgentMediaTaskView['status'];
    progress?: number;
  } = {},
) {
  return projectMediaTaskToWorkItem({
    conversationId,
    task: createMediaTask(conversationId, id, {
      status: options.status,
      progress: options.progress,
    }),
    parentMessageId: options.parentMessageId,
    parentToolCallId: options.parentToolCallId,
  });
}

interface ContextHarnessOptions {
  activeConversationId: string | null;
  mentionSearchFilter?: string;
  currentMessages?: Message[];
  nonCurrentMessages?: Map<string, Message[]>;
  currentStreaming?: StreamingState;
  nonCurrentStreaming?: Map<string, StreamingState>;
  markdownSessionRegistry?: NonNullable<MessageHandlerContext['markdownSessionRegistry']>;
}

interface ContextHarness {
  context: MessageHandlerContext;
  messages(): Message[];
  streaming(): StreamingState;
  conversationMessages(): Map<string, Message[]>;
  conversationStreaming(): Map<string, StreamingState>;
  workItems(): AgentWorkItemStore;
  pluginsAvailable(): PluginsAvailable;
  projectFiles(): ProjectFileInfo[];
  mentionItems(): MentionItem[];
  queuedEditRequest(): {
    tabId: string;
    conversationId: string;
    item: AgentQueuedMessageItem;
  } | null;
  globalError(): string | null;
}

function createContextHarness(options: ContextHarnessOptions): ContextHarness {
  let messages = options.currentMessages ?? [];
  let queuedEditRequest: {
    tabId: string;
    conversationId: string;
    item: AgentQueuedMessageItem;
  } | null = null;
  let globalError: string | null = null;
  let streaming: StreamingState & { queuedMessageCount: number } = {
    isThinking: false,
    streamingMessageId: null,
    queuedMessageCount: 0,
    queuedMessages: [],
    ...options.currentStreaming,
  };
  let workItems: AgentWorkItemStore = new Map();
  let pluginsAvailable: PluginsAvailable = {};
  let projectFiles: ProjectFileInfo[] = [];
  let mentionItems: MentionItem[] = [];
  const activeConversationIdRef = ref<string | null>(options.activeConversationId);
  const streamingMessageIdRef = ref<string | null>(streaming.streamingMessageId);
  const isTablessConversationViewRef = ref(false);
  const conversationMessagesRef = ref(new Map<string, Message[]>(options.nonCurrentMessages ?? []));
  const conversationStreamingRef = ref(
    new Map<string, StreamingState>(options.nonCurrentStreaming ?? []),
  );
  if (options.activeConversationId) {
    conversationMessagesRef.current.set(options.activeConversationId, messages);
    conversationStreamingRef.current.set(options.activeConversationId, streaming);
  }

  const setWorkItemsByConversation = createSetter(
    () => workItems,
    (next) => {
      workItems = next;
    },
  );
  const setPluginsAvailable = createSetter(
    () => pluginsAvailable,
    (next) => {
      pluginsAvailable = next;
    },
  );
  const setProjectFiles = createSetter(
    () => projectFiles,
    (next) => {
      projectFiles = next;
    },
  );
  const setMentionItems = createSetter(
    () => mentionItems,
    (next) => {
      mentionItems = next;
    },
  );

  const context = {
    messages,
    isThinking: streaming.isThinking,
    streamingMessageId: streaming.streamingMessageId,
    queuedMessageCount: streaming.queuedMessageCount,
    queuedMessages: streaming.queuedMessages,
    streamingMessageIdRef,
    activeConversationId: options.activeConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs: [],
    activeTabId: null,
    isTablessConversationViewRef,
    setOpenTabs: noopDispatch(),
    setActiveTabId: noopDispatch(),
    setActiveTab: noopDispatch(),
    setSettings: noopDispatch(),
    hydrateConversationSettings: () => undefined,
    updateSettings: () => undefined,
    setAgentState: noopDispatch(),
    conversationAgentStateRef: ref(new Map()),
    forceAgentStateUpdate: () => undefined,
    setSkills: noopDispatch(),
    setActivationProgressByConversation: noopDispatch(),
    setGlobalError: createSetter(
      () => globalError,
      (next) => {
        globalError = next;
      },
    ),
    requestQueuedMessageEdit: (request) => {
      queuedEditRequest = request;
    },
    reportConversationDiagnostic: vi.fn(),
    conversationTokenCountRef: ref(new Map()),
    conversationCompressingRef: ref(new Map()),
    forceUpdate: () => undefined,
    isCurrentConversation: (conversationId?: string) =>
      conversationId === activeConversationIdRef.current,
    markdownSessionRegistry:
      options.markdownSessionRegistry ?? createAgentMarkdownSessionRegistry(),
    conversationRenderCoordinator: new ConversationRenderCoordinator(),
    updateConversationRenderState: (conversationId, updater) => {
      const existingMessages = conversationMessagesRef.current.get(conversationId) ?? [];
      const existingStreaming = conversationStreamingRef.current.get(conversationId) ?? {
        isThinking: false,
        streamingMessageId: null,
        queuedMessageCount: 0,
      };
      const result = updater(existingMessages, existingStreaming);
      const coordinator = context.conversationRenderCoordinator;
      if (!coordinator) {
        throw new Error(
          'Background conversation updates require the canonical render coordinator.',
        );
      }
      const snapshot = ingestConversationRenderSnapshot({
        coordinator,
        conversationId,
        messages: result.messages,
        streaming: result.streaming,
      });
      commitConversationSnapshotProjection({
        snapshot,
        conversationMessagesRef,
        conversationStreamingRef,
      });
      if (conversationId === activeConversationIdRef.current) {
        messages = [...snapshot.messages];
        streaming = {
          ...result.streaming,
          queuedMessageCount: result.streaming.queuedMessageCount ?? 0,
          queuedMessages: result.streaming.queuedMessages ?? [],
        };
        streamingMessageIdRef.current = result.streaming.streamingMessageId;
        context.messages = messages;
        context.isThinking = streaming.isThinking;
        context.streamingMessageId = streaming.streamingMessageId;
        context.queuedMessageCount = streaming.queuedMessageCount;
        context.queuedMessages = streaming.queuedMessages;
      }
    },
    setConversations: noopDispatch(),
    setActiveConversationId: noopDispatch(),
    setWorkItemsByConversation,
    setProjectFiles,
    mentionSearchFilter: options.mentionSearchFilter ?? '',
    setMentionItems,
    setPluginCommands: noopDispatch(),
    setPluginsAvailable,
    setShowOnboarding: noopDispatch(),
  } satisfies MessageHandlerContext;

  return {
    context,
    messages: () => messages,
    streaming: () => streaming,
    conversationMessages: () => conversationMessagesRef.current,
    conversationStreaming: () => conversationStreamingRef.current,
    workItems: () => workItems,
    pluginsAvailable: () => pluginsAvailable,
    projectFiles: () => projectFiles,
    mentionItems: () => mentionItems,
    queuedEditRequest: () => queuedEditRequest,
    globalError: () => globalError,
  };
}

function createSetter<T>(read: () => T, write: (next: T) => void): Dispatch<SetStateAction<T>> {
  return (action) => {
    write(typeof action === 'function' ? (action as (previous: T) => T)(read()) : action);
  };
}

function noopDispatch<T>(): Dispatch<SetStateAction<T>> {
  return () => undefined;
}

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}
