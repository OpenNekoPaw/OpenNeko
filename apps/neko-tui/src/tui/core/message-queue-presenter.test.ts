import type { AgentMessageQueueSnapshot, AgentQueuedMessageItem } from '@neko-agent/types';
import { describe, expect, it } from 'vitest';
import { presentTuiMessageQueue } from './message-queue-presenter';

describe('presentTuiMessageQueue', () => {
  it('projects an empty snapshot without rows', () => {
    expect(presentTuiMessageQueue(snapshot([]))).toEqual({
      pendingCount: 0,
      rows: [],
      hiddenCount: 0,
      hasPriorityContinuation: false,
    });
  });

  it('projects user messages as editable and cancellable', () => {
    const presentation = presentTuiMessageQueue(
      snapshot([item({ id: 'queue-1', content: 'next prompt', source: 'composer' })]),
    );

    expect(presentation.rows).toEqual([
      {
        id: 'queue-1',
        ordinal: 1,
        preview: 'next prompt',
        kind: 'user-message',
        canEdit: true,
        canCancel: true,
        isPriorityContinuation: false,
      },
    ]);
  });

  it('keeps continuation kinds distinct and marks their priority', () => {
    const presentation = presentTuiMessageQueue(
      snapshot([
        item({ id: 'task-queue', content: 'continue task', source: 'task-result-continuation' }),
        item({
          id: 'subagent-queue',
          content: 'continue subagent',
          source: 'subagent-result-continuation',
        }),
        item({ id: 'system-queue', content: 'continue system', source: 'system-continuation' }),
      ]),
      { maxRows: 3 },
    );

    expect(presentation.hasPriorityContinuation).toBe(true);
    expect(presentation.rows.map((row) => [row.kind, row.canEdit, row.canCancel])).toEqual([
      ['task-continuation', false, false],
      ['subagent-continuation', false, false],
      ['system-continuation', false, false],
    ]);
  });

  it('collapses extra rows and normalizes long multiline content', () => {
    const presentation = presentTuiMessageQueue(
      snapshot([
        item({ id: 'queue-1', content: 'first\n  prompt with spacing', source: 'user' }),
        item({ id: 'queue-2', content: '第二条消息内容很长', source: 'user' }),
        item({ id: 'queue-3', content: 'third', source: 'user' }),
      ]),
      { maxRows: 2, maxPreviewCharacters: 8 },
    );

    expect(presentation.rows.map((row) => row.preview)).toEqual(['first p…', '第二条消息内容…']);
    expect(presentation.hiddenCount).toBe(1);
  });

  it('fails visibly for an inconsistent snapshot', () => {
    expect(() => presentTuiMessageQueue({ ...snapshot([]), pendingCount: 1 })).toThrow(
      'Message queue snapshot count mismatch',
    );
  });
});

function snapshot(items: readonly AgentQueuedMessageItem[]): AgentMessageQueueSnapshot {
  return {
    conversationId: 'conv-1',
    items,
    pendingCount: items.length,
    version: 1,
  };
}

function item(
  overrides: Pick<AgentQueuedMessageItem, 'id' | 'content' | 'source'>,
): AgentQueuedMessageItem {
  return {
    conversationId: 'conv-1',
    createdAt: 1,
    ...overrides,
  };
}
