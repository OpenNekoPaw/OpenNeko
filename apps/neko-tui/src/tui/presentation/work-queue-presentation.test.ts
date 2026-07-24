import { describe, expect, it } from 'vitest';
import type { AgentMessageQueueSnapshot, AgentQueuedMessageItem } from '@neko-agent/types';
import { createTestAgentTerminalPresentation } from './testing';
import { presentQueueCommand } from './work-queue-presentation';

const ITEM: AgentQueuedMessageItem = {
  id: 'queue-1',
  conversationId: 'conversation-1',
  content: 'Keep provider text unchanged',
  createdAt: 1,
  source: 'user',
  displayKind: 'user-message',
};

function snapshot(items: readonly AgentQueuedMessageItem[] = []): AgentMessageQueueSnapshot {
  return {
    conversationId: 'conversation-1',
    items,
    pendingCount: items.length,
    version: 7,
  };
}

describe('work and queue terminal presentation', () => {
  it('localizes queue status while preserving item identity, source, and content', () => {
    const en = presentQueueCommand(
      { kind: 'status', snapshot: snapshot([ITEM]) },
      createTestAgentTerminalPresentation('en'),
    );
    const zh = presentQueueCommand(
      { kind: 'status', snapshot: snapshot([ITEM]) },
      createTestAgentTerminalPresentation('zh-cn'),
    );

    expect(en).toEqual({
      kind: 'output',
      output: 'Queue: 1 pending (version 7)\n1. queue-1 [user] Keep provider text unchanged',
    });
    expect(zh).toEqual({
      kind: 'output',
      output: '队列：1 条待处理（版本 7）\n1. queue-1 [user] Keep provider text unchanged',
    });
  });

  it('keeps queue operation codes and external details stable under localized wrappers', () => {
    const result = {
      kind: 'diagnostic' as const,
      code: 'operation-failed' as const,
      operationCode: 'stale-item',
      detail: 'Provider detail remains unchanged',
    };

    expect(presentQueueCommand(result, createTestAgentTerminalPresentation('en'))).toEqual({
      kind: 'error',
      diagnosticCode: 'queue.operation-failed.stale-item',
      error: 'Queue operation failed (stale-item): Provider detail remains unchanged',
    });
    expect(presentQueueCommand(result, createTestAgentTerminalPresentation('zh-cn'))).toEqual({
      kind: 'error',
      diagnosticCode: 'queue.operation-failed.stale-item',
      error: '队列操作失败（stale-item）：Provider detail remains unchanged',
    });
  });

  it('projects queue successes from semantic identities', () => {
    const context = createTestAgentTerminalPresentation('zh-cn');
    expect(
      presentQueueCommand({ kind: 'promoted', item: ITEM, target: 'user-message' }, context),
    ).toEqual({ kind: 'output', output: '排队消息已安排为下一条可执行用户消息：queue-1' });
    expect(presentQueueCommand({ kind: 'cancelled', itemId: ITEM.id }, context)).toEqual({
      kind: 'output',
      output: '排队消息已取消：queue-1',
    });
  });

});
