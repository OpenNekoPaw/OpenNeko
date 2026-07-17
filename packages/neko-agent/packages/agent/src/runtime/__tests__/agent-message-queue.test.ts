import { describe, expect, it, vi } from 'vitest';
import {
  AgentMessageQueueOperationError,
  createAgentConversationMessageQueue,
  createAgentRuntimeSessionMessageQueuePort,
} from '../session/agent-message-queue';

describe('AgentConversationMessageQueue', () => {
  it('owns conversation identity and monotonic snapshots', () => {
    const queue = createAgentConversationMessageQueue({
      conversationId: 'conv-1',
      createId: vi.fn().mockReturnValueOnce('queue-1').mockReturnValueOnce('queue-2'),
      now: () => 1000,
    });

    expect(queue.snapshot()).toEqual({
      conversationId: 'conv-1',
      items: [],
      pendingCount: 0,
      version: 0,
    });

    queue.enqueue({ content: ' first ', source: 'user', now: 10 });
    queue.enqueue({
      content: 'continue task',
      source: 'task-result-continuation',
      metadata: { taskId: 'task-1', status: 'queued' },
      now: 11,
    });

    expect(queue.snapshot()).toEqual({
      conversationId: 'conv-1',
      pendingCount: 2,
      version: 2,
      items: [
        expect.objectContaining({
          id: 'queue-1',
          content: 'first',
          source: 'user',
          displayKind: 'user-message',
        }),
        expect.objectContaining({
          id: 'queue-2',
          source: 'task-result-continuation',
          displayKind: 'task-continuation',
          metadata: { taskId: 'task-1', status: 'queued' },
        }),
      ],
    });
  });

  it('releases internal continuations before promoted user follow-ups', () => {
    const ids = ['user-1', 'continuation-1', 'user-2'];
    const queue = createAgentConversationMessageQueue({
      conversationId: 'conv-1',
      createId: () => ids.shift()!,
      now: () => 1000,
    });
    queue.enqueue({ content: 'first user', source: 'user' });
    queue.enqueue({ content: 'continue', source: 'task-result-continuation' });
    queue.enqueue({ content: 'promoted user', source: 'user' });
    queue.promote('user-2');

    expect(queue.snapshot().items.map((item) => item.id)).toEqual([
      'user-2',
      'user-1',
      'continuation-1',
    ]);
    expect(queue.releaseNext()?.id).toBe('continuation-1');
    expect(queue.releaseNext()?.id).toBe('user-2');
    expect(queue.releaseNext()?.id).toBe('user-1');
  });

  it('pauses after active-turn cancellation and resumes only explicitly', async () => {
    const queue = createAgentConversationMessageQueue({
      conversationId: 'conv-1',
      createId: () => 'queue-1',
    });
    queue.enqueue({ content: 'later', source: 'user' });
    queue.pauseAfterActiveTurnCancel();
    const release = vi.fn(async () => undefined);

    await queue.drain(release);
    expect(release).not.toHaveBeenCalled();
    expect(queue.snapshot().pendingCount).toBe(1);
    expect(queue.isPausedAfterActiveTurnCancel()).toBe(true);

    queue.resume();
    await queue.drain(release);
    expect(release).toHaveBeenCalledWith(expect.objectContaining({ id: 'queue-1' }));
    expect(queue.snapshot().pendingCount).toBe(0);
  });

  it('serializes concurrent drain requests through the runtime-owned release lock', async () => {
    const ids = ['queue-1', 'queue-2'];
    const queue = createAgentConversationMessageQueue({
      conversationId: 'conv-1',
      createId: () => ids.shift()!,
    });
    queue.enqueue({ content: 'one' });
    queue.enqueue({ content: 'two' });
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const released: string[] = [];
    const firstDrain = queue.drain(async (item) => {
      released.push(item.id);
      if (item.id === 'queue-1') await gate;
    });

    await Promise.resolve();
    await queue.drain(async (item) => {
      released.push(`duplicate:${item.id}`);
    });
    releaseFirst();
    await firstDrain;

    expect(released).toEqual(['queue-1', 'queue-2']);
  });

  it('restricts editing to user messages and discard to continuations', () => {
    const ids = ['user-1', 'continuation-1'];
    const queue = createAgentConversationMessageQueue({
      conversationId: 'conv-1',
      createId: () => ids.shift()!,
      now: () => 100,
    });
    queue.enqueue({ content: 'user', source: 'composer' });
    queue.enqueue({ content: 'continue', source: 'system-continuation' });

    expect(queue.edit('user-1', 'updated', 101)).toEqual(
      expect.objectContaining({ content: 'updated', updatedAt: 101 }),
    );
    expect(() => queue.edit('continuation-1', 'invalid')).toThrow(AgentMessageQueueOperationError);
    expect(() => queue.discardContinuation('user-1')).toThrow(AgentMessageQueueOperationError);
    expect(queue.discardContinuation('continuation-1', 102)).toEqual(
      expect.objectContaining({
        updatedAt: 102,
        metadata: expect.objectContaining({ status: 'discarded' }),
      }),
    );
  });
});

describe('AgentRuntimeSessionMessageQueuePort', () => {
  it('requires explicit conversation binding and preserves the same conversation queue', () => {
    const port = createAgentRuntimeSessionMessageQueuePort();

    expect(port.current()).toBeNull();
    expect(() => port.require()).toThrow(
      'Agent runtime message queue requires an explicit conversation id.',
    );

    const first = port.bindConversation('conv-1');
    first.enqueue({ content: 'pending', source: 'user' });

    expect(port.bindConversation('conv-1')).toBe(first);
    expect(port.require().snapshot().pendingCount).toBe(1);
  });

  it('fails visibly instead of dropping pending messages when switching conversations', () => {
    const port = createAgentRuntimeSessionMessageQueuePort('conv-1');
    const first = port.require();
    first.enqueue({ content: 'pending', source: 'user' });

    expect(() => port.bindConversation('conv-2')).toThrow(
      'Cannot switch Agent runtime message queue from conv-1 to conv-2 while pending messages exist.',
    );
    expect(port.require()).toBe(first);
    expect(first.snapshot().pendingCount).toBe(1);

    first.clear();
    const second = port.bindConversation('conv-2');
    expect(port.require()).toBe(second);
    expect(second.snapshot()).toEqual(
      expect.objectContaining({ conversationId: 'conv-2', pendingCount: 0 }),
    );
  });
});
