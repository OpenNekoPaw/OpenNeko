import { describe, expect, it } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineOperation,
} from '@neko-agent/contracts';
import { createConversationProjectionOperationBuffer } from '../conversation-projection-operation-buffer';

const identity = {
  conversationId: 'conversation-a',
  turnId: 'turn-message-a',
  runId: 'run-a',
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

  it('preserves discrete Tool updates without creating a second progress authority', () => {
    const buffer = createConversationProjectionOperationBuffer();

    buffer.push(toolProgress(1, 10));
    buffer.push(toolProgress(2, 40));
    buffer.push(toolProgress(3, 90));

    expect(buffer.operationCount).toBe(3);
    expect(
      buffer
        .drain()
        .map((operation) =>
          operation.operation === 'upsert' && operation.item.kind === 'tool_call'
            ? operation.item.payload.progress?.data
            : undefined,
        ),
    ).toEqual([{ percent: 10 }, { percent: 40 }, { percent: 90 }]);
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

function toolProgress(itemRevision: number, percent: number): AgentTurnTimelineOperation {
  return {
    operation: 'upsert',
    item: {
      ...identity,
      itemId: 'tool-1',
      sequence: 2,
      itemRevision,
      kind: 'tool_call',
      status: 'pending',
      parentAnchor: 'turn',
      payload: {
        toolCall: {
          id: 'call-1',
          name: 'GenerateImage',
          arguments: {},
        },
        progress: { summary: `${percent}%`, data: { percent } },
      },
      createdAt: 1,
      updatedAt: itemRevision,
    },
  };
}
