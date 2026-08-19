import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko/agent-contracts';
import { createIdleConversationStreamingSnapshot } from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';

describe('ConversationRenderCoordinator', () => {
  it('serializes mutations within one conversation owner', () => {
    const coordinator = new ConversationRenderCoordinator();

    const first = coordinator.ingest(hostSnapshot('conv-a', [message('a-1')]));
    const second = coordinator.ingest(hostSnapshot('conv-a', [message('a-2')]));

    expect(first.messages).toEqual([expect.objectContaining({ id: 'a-1' })]);
    expect(second.messages).toEqual([expect.objectContaining({ id: 'a-2' })]);
    expect(second).not.toBe(first);
  });

  it('publishes snapshot changes only to the owning conversation subscribers', () => {
    const coordinator = new ConversationRenderCoordinator();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubscribeA = coordinator.subscribe('conv-a', listenerA);
    coordinator.subscribe('conv-b', listenerB);

    coordinator.ingest(hostSnapshot('conv-a', [message('a-1')]));

    const selection = coordinator.readMany(['conv-a', 'conv-b']);
    expect(selection).toEqual([expect.objectContaining({ conversationId: 'conv-a' })]);
    expect(coordinator.readMany(['conv-a', 'conv-b'])).toBe(selection);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();

    unsubscribeA();
    coordinator.ingest(hostSnapshot('conv-a', [message('a-2')]));
    expect(listenerA).toHaveBeenCalledTimes(1);
  });

  it('rejects mutations after disposal', () => {
    const coordinator = new ConversationRenderCoordinator();
    coordinator.ingest(hostSnapshot('conv-a', []));
    coordinator.dispose({
      kind: 'disposal',
      conversationId: 'conv-a',
      reason: 'conversation-delete',
    });

    expect(() => coordinator.ingest(hostSnapshot('conv-a', []))).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'conversation-disposed' }),
      }),
    );
  });

  it('clears only the disposed conversation snapshot', () => {
    const coordinator = new ConversationRenderCoordinator();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    coordinator.ingest(hostSnapshot('conv-a', [message('a')]));
    coordinator.ingest(hostSnapshot('conv-b', [message('b')]));
    coordinator.subscribe('conv-a', listenerA);
    coordinator.subscribe('conv-b', listenerB);

    const disposed = coordinator.dispose({
      kind: 'disposal',
      conversationId: 'conv-a',
      reason: 'conversation-delete',
    });

    expect(disposed).toMatchObject({ retention: 'disposed' });
    expect(coordinator.read('conv-a')).toBeUndefined();
    expect(coordinator.isDisposed('conv-a')).toBe(true);
    expect(coordinator.readMany(['conv-a'])).toEqual([]);
    expect(coordinator.read('conv-b')).toMatchObject({
      messages: [expect.objectContaining({ id: 'b' })],
    });
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).not.toHaveBeenCalled();
    expect(() =>
      coordinator.dispose({
        kind: 'disposal',
        conversationId: 'conv-a',
        reason: 'conversation-delete',
      }),
    ).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'conversation-disposed' }),
      }),
    );
  });
});

function hostSnapshot(conversationId: string, messages: readonly Message[]) {
  return {
    kind: 'host-snapshot' as const,
    conversationId,
    messages,
    streaming: createIdleConversationStreamingSnapshot(),
  };
}

function message(id: string): Message {
  return { id, role: 'assistant', content: id, timestamp: 1 };
}
