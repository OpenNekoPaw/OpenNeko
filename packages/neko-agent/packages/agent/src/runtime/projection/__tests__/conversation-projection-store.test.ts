import { describe, expect, it, vi } from 'vitest';
import type { AgentTurnTimelineCompletion, AgentTurnTimelineOperation } from '@neko-agent/types';
import { createConversationProjectionStore } from '../conversation-projection-store';

function appendText(input: {
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly messageId?: string;
  readonly itemId?: string;
  readonly content: string;
  readonly itemRevision: number;
  readonly sequence?: number;
  readonly updatedAt?: number;
}): AgentTurnTimelineOperation {
  const updatedAt = input.updatedAt ?? input.itemRevision;
  return {
    operation: 'append',
    item: {
      conversationId: input.conversationId ?? 'conversation-a',
      turnId: input.turnId ?? 'turn-a',
      messageId: input.messageId ?? 'message-a',
      itemId: input.itemId ?? 'text-1',
      sequence: input.sequence ?? 1,
      itemRevision: input.itemRevision,
      kind: 'assistant_text',
      status: 'streaming',
      createdAt: 1,
      updatedAt,
      payload: {
        content: input.content,
        sourceGeneration: 1,
      },
    },
  };
}

function completion(): AgentTurnTimelineCompletion {
  return {
    status: 'completed',
    completedAt: 10,
    finalContentBlocks: [
      {
        id: 'final-text',
        type: 'text',
        timestamp: 10,
        content: 'final',
        isStreaming: false,
      },
    ],
  };
}

describe('ConversationProjectionStore', () => {
  it('keeps authoritative projections isolated by conversation ownership', () => {
    const conversationA = createConversationProjectionStore('conversation-a');
    const conversationB = createConversationProjectionStore('conversation-b');

    conversationA.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [appendText({ content: 'A', itemRevision: 1 })],
    });
    conversationB.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-b',
      turnId: 'turn-b',
      messageId: 'message-b',
      operations: [
        appendText({
          conversationId: 'conversation-b',
          turnId: 'turn-b',
          messageId: 'message-b',
          content: 'B',
          itemRevision: 1,
        }),
      ],
    });

    expect(conversationA.snapshot()).toMatchObject({
      conversationId: 'conversation-a',
      projectionVersion: 1,
      turns: [{ turnId: 'turn-a', messageId: 'message-a' }],
    });
    expect(conversationB.snapshot()).toMatchObject({
      conversationId: 'conversation-b',
      projectionVersion: 1,
      turns: [{ turnId: 'turn-b', messageId: 'message-b' }],
    });
    expect(readText(conversationA.snapshot())).toBe('A');
    expect(readText(conversationB.snapshot())).toBe('B');
  });

  it('accumulates thousands of ordered chunks without creating snapshots during mutation', () => {
    const store = createConversationProjectionStore('conversation-a');
    const patches = vi.fn();
    store.subscribe(patches);
    const chunks = Array.from({ length: 2_000 }, (_, index) => `${index},`);

    for (const [index, content] of chunks.entries()) {
      const patch = store.apply({
        type: 'agentTurnTimelineUpdate',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
        messageId: 'message-a',
        operations: [appendText({ content, itemRevision: index + 1 })],
      });
      expect(patch.baseProjectionVersion).toBe(index);
      expect(patch.projectionVersion).toBe(index + 1);
      expect(patch.operations).toHaveLength(1);
      expect(patch).not.toHaveProperty('turns');
    }

    expect(patches).toHaveBeenCalledTimes(chunks.length);
    expect(readText(store.snapshot())).toBe(chunks.join(''));
  });

  it('returns detached immutable snapshots that do not change after later patches', () => {
    const store = createConversationProjectionStore('conversation-a');
    store.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [appendText({ content: 'first', itemRevision: 1 })],
    });
    const firstSnapshot = store.snapshot();

    store.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [appendText({ content: '-second', itemRevision: 2 })],
    });

    expect(readText(firstSnapshot)).toBe('first');
    expect(readText(store.snapshot())).toBe('first-second');
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.turns)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.turns[0]?.items)).toBe(true);
  });

  it('publishes ordered structural and completion patches with monotonic versions', () => {
    const store = createConversationProjectionStore('conversation-a');
    const patches: unknown[] = [];
    store.subscribe((patch) => patches.push(patch));

    const first = store.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [appendText({ content: 'answer', itemRevision: 1 })],
    });
    const second = store.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [
        {
          operation: 'complete',
          itemId: 'text-1',
          itemRevision: 2,
          kind: 'assistant_text',
          sourceGeneration: 1,
          status: 'complete',
          updatedAt: 9,
        },
      ],
      completion: completion(),
    });

    expect(first).toMatchObject({ baseProjectionVersion: 0, projectionVersion: 1 });
    expect(second).toMatchObject({ baseProjectionVersion: 1, projectionVersion: 2 });
    expect(patches).toEqual([first, second]);
    expect(store.snapshot().turns[0]).toMatchObject({
      completion: { status: 'completed' },
      items: [{ itemRevision: 2, status: 'complete' }],
    });
  });

  it('rejects an invalid patch atomically without advancing authoritative state', () => {
    const store = createConversationProjectionStore('conversation-a');
    store.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [appendText({ content: 'first', itemRevision: 1 })],
    });

    expect(() =>
      store.apply({
        type: 'agentTurnTimelineUpdate',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
        messageId: 'message-a',
        operations: [
          appendText({ content: '-partial', itemRevision: 2 }),
          {
            operation: 'complete',
            itemId: 'missing',
            itemRevision: 1,
            kind: 'assistant_text',
            sourceGeneration: 1,
            status: 'failed',
            updatedAt: 2,
          },
        ],
      }),
    ).toThrow(/unknown text item/i);

    expect(store.snapshot()).toMatchObject({ projectionVersion: 1 });
    expect(readText(store.snapshot())).toBe('first');
  });

  it('fails visibly for owner mismatch, completed-turn mutation, and disposed mutation', () => {
    const store = createConversationProjectionStore('conversation-a');

    expect(() =>
      store.apply({
        type: 'agentTurnTimelineUpdate',
        conversationId: 'conversation-b',
        turnId: 'turn-a',
        messageId: 'message-a',
        operations: [appendText({ content: 'wrong owner', itemRevision: 1 })],
      }),
    ).toThrow(/projection owner mismatch/i);

    store.apply({
      type: 'agentTurnTimelineUpdate',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      messageId: 'message-a',
      operations: [appendText({ content: 'done', itemRevision: 1 })],
      completion: completion(),
    });
    expect(() =>
      store.apply({
        type: 'agentTurnTimelineUpdate',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
        messageId: 'message-a',
        operations: [appendText({ content: 'late', itemRevision: 2 })],
      }),
    ).toThrow(/completed turn/i);

    store.dispose();
    expect(() => store.snapshot()).toThrow(/disposed/i);
    expect(() =>
      store.apply({
        type: 'agentTurnTimelineUpdate',
        conversationId: 'conversation-a',
        turnId: 'turn-b',
        messageId: 'message-b',
        operations: [appendText({ content: 'late', itemRevision: 1 })],
      }),
    ).toThrow(/disposed/i);
  });
});

function readText(
  snapshot: ReturnType<ReturnType<typeof createConversationProjectionStore>['snapshot']>,
): string {
  return snapshot.turns
    .flatMap((turn) => turn.items)
    .filter((item) => item.kind === 'assistant_text')
    .map((item) => (item.kind === 'assistant_text' ? item.payload.content : ''))
    .join('');
}
