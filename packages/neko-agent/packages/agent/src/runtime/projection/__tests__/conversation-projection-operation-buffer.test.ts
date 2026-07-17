import { describe, expect, it } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineOperation,
  AgentTurnTimelineStructuralItem,
} from '@neko-agent/types';
import { createConversationProjectionOperationBuffer } from '../conversation-projection-operation-buffer';

const identity = {
  conversationId: 'conversation-a',
  turnId: 'turn-message-a',
  messageId: 'message-a',
} as const;

function append(content: string, itemRevision: number): AgentTurnTimelineOperation {
  const item = {
    ...identity,
    itemId: 'text-1',
    sequence: 1,
    itemRevision,
    kind: 'assistant_text',
    status: 'streaming',
    payload: { content, format: 'markdown', sourceGeneration: 1 },
    createdAt: 1,
    updatedAt: itemRevision,
  } satisfies AgentTurnTimelineAssistantTextItem;
  return { operation: 'append', item };
}

function progress(itemRevision: number, value: number): AgentTurnTimelineOperation {
  const item = {
    ...identity,
    itemId: 'media-1',
    sequence: 2,
    itemRevision,
    kind: 'media',
    status: 'pending',
    parentAnchor: 'turn',
    payload: { workItem: { id: 'task-1', progress: value } },
    createdAt: 1,
    updatedAt: itemRevision,
  } satisfies AgentTurnTimelineStructuralItem;
  return { operation: 'upsert', item };
}

describe('ConversationProjectionOperationBuffer', () => {
  it('coalesces adjacent append chunks without constructing projection snapshots', () => {
    const buffer = createConversationProjectionOperationBuffer();

    for (let index = 1; index <= 4_000; index += 1) {
      buffer.push(append(String(index % 10), index));
    }

    expect({
      operationCount: buffer.operationCount,
      textBytes: buffer.textBytes,
      operationCountHighWaterMark: buffer.operationCountHighWaterMark,
      textBytesHighWaterMark: buffer.textBytesHighWaterMark,
    }).toEqual({
      operationCount: 1,
      textBytes: 4_000,
      operationCountHighWaterMark: 1,
      textBytesHighWaterMark: 4_000,
    });
    const operations = buffer.drain();
    expect(operations).toHaveLength(1);
    const operation = operations[0];
    if (operation?.operation !== 'append' || operation.item.kind !== 'assistant_text') {
      throw new Error('Expected coalesced assistant text append.');
    }
    expect(operation.item.itemRevision).toBe(4_000);
    expect(operation.item.payload.content).toHaveLength(4_000);
    expect(buffer.operationCount).toBe(0);
    expect(buffer.textBytes).toBe(0);
  });

  it('retains only the latest pending task or media progress for each item', () => {
    const buffer = createConversationProjectionOperationBuffer();

    buffer.push(progress(1, 10));
    buffer.push(progress(2, 40));
    buffer.push(progress(3, 90));

    expect(buffer.operationCount).toBe(1);
    const operation = buffer.drain()[0];
    if (operation?.operation !== 'upsert' || operation.item.kind !== 'media') {
      throw new Error('Expected latest media progress.');
    }
    expect(operation.item.itemRevision).toBe(3);
    expect(operation.item.payload.workItem.progress).toBe(90);
  });

  it('preserves semantic boundaries between different text generations', () => {
    const buffer = createConversationProjectionOperationBuffer();
    buffer.push(append('before', 1));
    const nextGeneration = append('after', 2);
    if (nextGeneration.operation !== 'append' || nextGeneration.item.kind !== 'assistant_text') {
      throw new Error('Expected assistant text append.');
    }
    buffer.push({
      ...nextGeneration,
      item: {
        ...nextGeneration.item,
        payload: { ...nextGeneration.item.payload, sourceGeneration: 2 },
      },
    });

    expect(buffer.drain()).toHaveLength(2);
  });
});
