import { describe, expect, it, vi } from 'vitest';
import type { AgentTurnTimelineAssistantTextItem } from '../agent-turn-timeline';
import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from '../conversation-projection';
import {
  applyAgentTurnProjectionOperations,
  applyConversationProjectionPatch,
  cloneAgentTurnProjectionItem,
} from '../conversation-projection';

function textItem(content: string, updatedAt: number): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId: 'conversation-a',
    turnId: 'turn-a',
    runId: 'run-a',
    messageId: 'message-a',
    itemId: 'text-a',
    sequence: 1,
    kind: 'assistant_text',
    status: 'streaming',
    createdAt: 1,
    updatedAt,
    payload: { content },
  };
}

describe('conversation projection contract', () => {
  it('applies append operations with the same canonical semantics for producers and replicas', () => {
    const items = new Map();

    applyAgentTurnProjectionOperations(items, [
      { operation: 'append', item: textItem('first', 1) },
      { operation: 'append', item: textItem('-second', 2) },
    ]);

    expect(items.get('text-a')).toMatchObject({ payload: { content: 'first-second' } });
    expect(items.get('text-a')).not.toHaveProperty('itemRevision');
  });

  it('applies serialized same-owner appends without an item CAS token', () => {
    const items = new Map([['text-a', textItem('first', 1)]]);

    applyAgentTurnProjectionOperations(items, [
      { operation: 'append', item: textItem('-second', 2) },
    ]);

    expect(items.get('text-a')).toMatchObject({ payload: { content: 'first-second' } });
  });

  it('returns detached item clones for immutable projection snapshots', () => {
    const item = textItem('source', 1);
    const clone = cloneAgentTurnProjectionItem(item);

    expect(clone).toEqual(item);
    expect(clone).not.toBe(item);
    expect(clone.payload).not.toBe(item.payload);
  });
});

describe('conversation projection patch application', () => {
  it('creates immutable replica snapshots without mutating the previous snapshot', () => {
    const snapshot = Object.freeze({
      conversationId: 'conversation-a',
      turns: Object.freeze([]),
    });
    const next = applyConversationProjectionPatch(snapshot, {
      type: 'conversationProjectionPatch',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      runId: 'run-a',
      messageId: 'message-a',
      operations: [{ operation: 'append', item: textItem('first', 1) }],
    });

    expect(snapshot.turns).toEqual([]);
    expect(next.turns[0]?.items[0]).toMatchObject({ payload: { content: 'first' } });
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.turns)).toBe(true);
    expect(Object.isFrozen(next.turns[0]?.items)).toBe(true);
  });

  it('rejects patches owned by another conversation before applying item operations', () => {
    expect(() =>
      applyConversationProjectionPatch(
        { conversationId: 'conversation-a', turns: [] },
        {
          type: 'conversationProjectionPatch',
          conversationId: 'conversation-b',
          turnId: 'turn-a',
          runId: 'run-a',
          messageId: 'message-a',
          operations: [{ operation: 'append', item: textItem('gap', 1) }],
        },
      ),
    ).toThrow(/owner mismatch/);
  });

  it('rejects an empty or changed run owner before applying item operations', () => {
    const snapshot = applyConversationProjectionPatch(
      { conversationId: 'conversation-a', turns: [] },
      {
        type: 'conversationProjectionPatch',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
        runId: 'run-a',
        messageId: 'message-a',
        operations: [{ operation: 'append', item: textItem('first', 1) }],
      },
    );

    expect(() =>
      applyConversationProjectionPatch(snapshot, {
        type: 'conversationProjectionPatch',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
        runId: '',
        messageId: 'message-a',
        operations: [],
        completion: { status: 'completed', completedAt: 2 },
      }),
    ).toThrow(/runId is required/);
    expect(() =>
      applyConversationProjectionPatch(snapshot, {
        type: 'conversationProjectionPatch',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
        runId: 'run-b',
        messageId: 'message-a',
        operations: [],
        completion: { status: 'completed', completedAt: 2 },
      }),
    ).toThrow(/owned by run-a\/message-a/);
  });

  it('shares frozen sibling turns by reference and rebuilds only the target turn', () => {
    const firstTurn = applyConversationProjectionPatch(
      { conversationId: 'conversation-a', turns: [] },
      patchFor('turn-a', 'message-a', 'text-a', 1, 'first', 1),
    );
    const twoTurns = applyConversationProjectionPatch(
      firstTurn,
      patchFor('turn-b', 'message-b', 'text-b', 2, 'other', 1),
    );

    expect(twoTurns.turns).toHaveLength(2);

    const frozenSibling = twoTurns.turns[1]!;
    const objectValuesSpy = vi.spyOn(Object, 'values');
    try {
      const next = applyConversationProjectionPatch(
        twoTurns,
        patchFor('turn-a', 'message-a', 'text-a', 1, '-second', 2),
      );

      expect(next.turns[1]).toBe(frozenSibling);
      expect(next.turns[0]).not.toBe(twoTurns.turns[0]);
      expect(twoTurns.turns[0]?.items[0]).toMatchObject({ payload: { content: 'first' } });
      expect(next.turns[0]?.items[0]).toMatchObject({ payload: { content: 'first-second' } });
      expect(Object.isFrozen(next)).toBe(true);
      expect(Object.isFrozen(next.turns)).toBe(true);
      expect(Object.isFrozen(next.turns[1])).toBe(true);
      expect(objectValuesSpy.mock.calls.some(([value]) => value === frozenSibling)).toBe(false);
    } finally {
      objectValuesSpy.mockRestore();
    }
  });

  it('deep-freezes shallow-frozen sibling input that did not come from the canonical freezer', () => {
    const firstTurn = applyConversationProjectionPatch(
      { conversationId: 'conversation-a', turns: [] },
      patchFor('turn-a', 'message-a', 'text-a', 1, 'first', 1),
    );
    const siblingItems: AgentTurnTimelineAssistantTextItem[] = [];
    const shallowFrozenSibling = Object.freeze({
      turnId: 'turn-b',
      runId: 'run-a',
      messageId: 'message-b',
      items: siblingItems,
    });
    const snapshot: ConversationProjectionSnapshot = {
      conversationId: 'conversation-a',
      turns: [firstTurn.turns[0]!, shallowFrozenSibling],
    };

    const next = applyConversationProjectionPatch(
      snapshot,
      patchFor('turn-a', 'message-a', 'text-a', 1, '-second', 2),
    );

    expect(next.turns[1]).toBe(shallowFrozenSibling);
    expect(Object.isFrozen(siblingItems)).toBe(true);
  });
});

function patchFor(
  turnId: string,
  messageId: string,
  itemId: string,
  sequence: number,
  content: string,
  updatedAt: number,
): ConversationProjectionPatch {
  return {
    type: 'conversationProjectionPatch',
    conversationId: 'conversation-a',
    turnId,
    runId: 'run-a',
    messageId,
    operations: [
      {
        operation: 'append',
        item: {
          conversationId: 'conversation-a',
          turnId,
          runId: 'run-a',
          messageId,
          itemId,
          sequence,
          kind: 'assistant_text',
          status: 'streaming',
          createdAt: 1,
          updatedAt,
          payload: { content },
        },
      },
    ],
  };
}
