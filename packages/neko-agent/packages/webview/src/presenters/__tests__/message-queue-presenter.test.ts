import { describe, expect, it } from 'vitest';
import type { Message } from '@neko-agent/types';
import {
  hasQueuedUserMessages,
  isOptimisticQueuedMessageItem,
  projectAuthoritativeQueuedMessagesIntoTranscript,
  projectOptimisticQueuedMessageItem,
  projectReleasedQueuedMessageIntoTranscript,
  projectQueuedMessagesCleared,
  projectQueuedMessagesForPendingCount,
} from '../message-queue-presenter';

describe('message queue presenter', () => {
  it('detects optimistic queued user messages without projecting composer state', () => {
    expect(
      hasQueuedUserMessages([
        message({ id: 'assistant-1', role: 'assistant', content: 'Working' }),
        message({ id: 'queued-1', role: 'user', content: '继续优化', isQueued: true }),
        message({ id: 'system-1', role: 'system', content: 'Message queued', isQueued: true }),
      ]),
    ).toBe(true);

    expect(
      hasQueuedUserMessages([
        message({ id: 'assistant-1', role: 'assistant', content: 'Working' }),
        message({ id: 'system-1', role: 'system', content: 'Message queued', isQueued: true }),
      ]),
    ).toBe(false);
  });

  it('releases queued user messages in FIFO order when the pending count drops', () => {
    const messages = [
      message({ id: 'user-1', role: 'user', content: '生成分镜表' }),
      message({ id: 'queued-1', role: 'user', content: '要求后续变更', isQueued: true }),
      message({ id: 'assistant-1', role: 'assistant', content: '初稿完成' }),
      message({ id: 'queued-2', role: 'user', content: '再补充镜头', isQueued: true }),
    ];

    expect(
      projectQueuedMessagesForPendingCount({
        messages,
        previousQueuedMessageCount: 2,
        nextQueuedMessageCount: 1,
      }),
    ).toEqual([
      message({ id: 'user-1', role: 'user', content: '生成分镜表' }),
      message({ id: 'assistant-1', role: 'assistant', content: '初稿完成' }),
      message({ id: 'queued-2', role: 'user', content: '再补充镜头', isQueued: true }),
      message({ id: 'queued-1', role: 'user', content: '要求后续变更' }),
    ]);
  });

  it('keeps queued messages hidden when the pending count does not drop', () => {
    const messages = [message({ id: 'queued-1', role: 'user', content: '继续', isQueued: true })];

    expect(
      projectQueuedMessagesForPendingCount({
        messages,
        previousQueuedMessageCount: 1,
        nextQueuedMessageCount: 1,
      }),
    ).toEqual(messages);
  });

  it('clears queued user messages without removing normal transcript messages', () => {
    expect(
      projectQueuedMessagesCleared([
        message({ id: 'user-1', role: 'user', content: '原始请求' }),
        message({ id: 'queued-1', role: 'user', content: '继续', isQueued: true }),
        message({ id: 'assistant-1', role: 'assistant', content: '处理中' }),
      ]),
    ).toEqual([
      message({ id: 'user-1', role: 'user', content: '原始请求' }),
      message({ id: 'assistant-1', role: 'assistant', content: '处理中' }),
    ]);
  });

  it('removes trailing local composer mirrors once authoritative queued items arrive', () => {
    expect(
      projectAuthoritativeQueuedMessagesIntoTranscript({
        messages: [
          message({ id: 'user-1', role: 'user', content: '生成图片', timestamp: 100 }),
          message({ id: 'assistant-1', role: 'assistant', content: '处理中', timestamp: 200 }),
          message({ id: 'local-hi', role: 'user', content: 'hi', timestamp: 1_000 }),
        ],
        items: [
          {
            id: 'runtime-hi',
            conversationId: 'conv-1',
            content: 'hi',
            createdAt: 1_005,
            source: 'composer',
          },
        ],
      }),
    ).toEqual([
      message({ id: 'user-1', role: 'user', content: '生成图片', timestamp: 100 }),
      message({ id: 'assistant-1', role: 'assistant', content: '处理中', timestamp: 200 }),
    ]);
  });

  it('projects a released runtime queue item as a normal transcript user message', () => {
    expect(
      projectReleasedQueuedMessageIntoTranscript({
        messages: [
          message({ id: 'user-1', role: 'user', content: '原始请求' }),
          message({ id: 'queued-1', role: 'user', content: '继续', isQueued: true }),
          message({ id: 'assistant-1', role: 'assistant', content: '处理中' }),
        ],
        item: {
          id: 'runtime-1',
          conversationId: 'conv-1',
          content: '继续',
          createdAt: 123,
          source: 'composer',
        },
      }),
    ).toEqual([
      message({ id: 'user-1', role: 'user', content: '原始请求' }),
      message({ id: 'assistant-1', role: 'assistant', content: '处理中' }),
      message({ id: 'released:runtime-1', role: 'user', content: '继续', timestamp: 123 }),
    ]);
  });

  it('does not duplicate an already released runtime queue item', () => {
    const releasedMessage = message({
      id: 'released:runtime-1',
      role: 'user',
      content: '继续',
      timestamp: 123,
    });

    expect(
      projectReleasedQueuedMessageIntoTranscript({
        messages: [releasedMessage],
        item: {
          id: 'runtime-1',
          conversationId: 'conv-1',
          content: '继续',
          createdAt: 123,
          source: 'composer',
        },
      }),
    ).toEqual([releasedMessage]);
  });

  it('does not project released task-result observations into the visible transcript', () => {
    const messages = [
      message({ id: 'user-1', role: 'user', content: '生成图片' }),
      message({ id: 'assistant-1', role: 'assistant', content: '图片已生成' }),
    ];

    expect(
      projectReleasedQueuedMessageIntoTranscript({
        messages,
        item: {
          id: 'task-observation-1',
          conversationId: 'conv-1',
          content: 'Continue from the completed async task result.',
          createdAt: 123,
          source: 'task-result-continuation',
        },
      }),
    ).toEqual(messages);
  });

  it('projects optimistic queued messages as non-authoritative composer items', () => {
    const item = projectOptimisticQueuedMessageItem({
      conversationId: 'conv-1',
      message: message({
        id: 'queued-local',
        role: 'user',
        content: '先展示在输入框上方',
        timestamp: 123,
        isQueued: true,
      }),
    });

    expect(item).not.toBeNull();
    if (!item) return;
    expect(item).toEqual({
      id: 'optimistic:queued-local',
      conversationId: 'conv-1',
      content: '先展示在输入框上方',
      createdAt: 123,
      source: 'composer',
    });
    expect(isOptimisticQueuedMessageItem(item)).toBe(true);
  });
});

function message(input: Partial<Message> & Pick<Message, 'id' | 'role' | 'content'>): Message {
  return {
    timestamp: 1,
    ...input,
  };
}
