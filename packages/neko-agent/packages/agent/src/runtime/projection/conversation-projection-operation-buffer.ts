import type { AgentTurnTimelineOperation } from '@neko-agent/types';

export interface ConversationProjectionOperationBuffer {
  readonly operationCount: number;
  readonly textBytes: number;
  readonly operationCountHighWaterMark: number;
  readonly textBytesHighWaterMark: number;
  push(operation: AgentTurnTimelineOperation): void;
  drain(): readonly AgentTurnTimelineOperation[];
}

export function createConversationProjectionOperationBuffer(): ConversationProjectionOperationBuffer {
  return new DefaultConversationProjectionOperationBuffer();
}

export function isCoalescibleConversationProjectionOperation(
  operation: AgentTurnTimelineOperation,
): boolean {
  return operation.operation === 'append' || isLatestValueProgress(operation);
}

interface BufferedAppendOperation {
  readonly kind: 'append';
  operation: Extract<AgentTurnTimelineOperation, { readonly operation: 'append' }>;
  readonly createdAt: number;
  readonly sequence: number;
  readonly chunks: string[];
}

interface BufferedDiscreteOperation {
  readonly kind: 'discrete';
  operation: AgentTurnTimelineOperation;
}

type BufferedOperation = BufferedAppendOperation | BufferedDiscreteOperation;

class DefaultConversationProjectionOperationBuffer implements ConversationProjectionOperationBuffer {
  private operations: BufferedOperation[] = [];
  private _textBytes = 0;
  private _operationCountHighWaterMark = 0;
  private _textBytesHighWaterMark = 0;

  get operationCount(): number {
    return this.operations.length;
  }

  get textBytes(): number {
    return this._textBytes;
  }

  get operationCountHighWaterMark(): number {
    return this._operationCountHighWaterMark;
  }

  get textBytesHighWaterMark(): number {
    return this._textBytesHighWaterMark;
  }

  push(operation: AgentTurnTimelineOperation): void {
    if (isLatestValueProgress(operation)) {
      const index = this.operations.findIndex(
        (candidate) =>
          candidate.kind === 'discrete' &&
          isLatestValueProgress(candidate.operation) &&
          candidate.operation.item.itemId === operation.item.itemId,
      );
      if (index >= 0) {
        const existing = this.operations[index];
        if (!existing || existing.kind !== 'discrete') {
          throw new Error('Conversation projection operation buffer lost progress identity.');
        }
        existing.operation = operation;
      } else {
        this.operations.push({ kind: 'discrete', operation });
      }
    } else if (operation.operation === 'append') {
      const previous = this.operations.at(-1);
      if (previous?.kind === 'append' && areCompatibleAppends(previous.operation, operation)) {
        previous.operation = operation;
        previous.chunks.push(operation.item.payload.content);
      } else {
        this.operations.push({
          kind: 'append',
          operation,
          createdAt: operation.item.createdAt,
          sequence: operation.item.sequence,
          chunks: [operation.item.payload.content],
        });
      }
      this._textBytes += byteLength(operation.item.payload.content);
    } else {
      this.operations.push({ kind: 'discrete', operation });
    }

    this._operationCountHighWaterMark = Math.max(
      this._operationCountHighWaterMark,
      this.operations.length,
    );
    this._textBytesHighWaterMark = Math.max(this._textBytesHighWaterMark, this._textBytes);
  }

  drain(): readonly AgentTurnTimelineOperation[] {
    const operations = this.operations.map(materializeOperation);
    this.operations = [];
    this._textBytes = 0;
    return operations;
  }
}

function materializeOperation(buffered: BufferedOperation): AgentTurnTimelineOperation {
  if (buffered.kind === 'discrete') return buffered.operation;
  const operation = buffered.operation;
  if (operation.item.kind === 'assistant_text') {
    return {
      operation: 'append',
      item: {
        ...operation.item,
        createdAt: buffered.createdAt,
        sequence: buffered.sequence,
        payload: {
          ...operation.item.payload,
          content: buffered.chunks.join(''),
        },
      },
    };
  }
  if (operation.item.kind === 'thinking') {
    return {
      operation: 'append',
      item: {
        ...operation.item,
        createdAt: buffered.createdAt,
        sequence: buffered.sequence,
        payload: {
          ...operation.item.payload,
          content: buffered.chunks.join(''),
        },
      },
    };
  }
  throw new Error('Conversation projection append has an unsupported item kind.');
}

function isLatestValueProgress(
  operation: AgentTurnTimelineOperation,
): operation is Extract<AgentTurnTimelineOperation, { readonly operation: 'upsert' }> {
  return (
    operation.operation === 'upsert' &&
    (operation.item.kind === 'task' || operation.item.kind === 'media') &&
    operation.item.status === 'pending'
  );
}

function areCompatibleAppends(
  previous: Extract<AgentTurnTimelineOperation, { readonly operation: 'append' }>,
  operation: Extract<AgentTurnTimelineOperation, { readonly operation: 'append' }>,
): boolean {
  return (
    previous.item.itemId === operation.item.itemId &&
    previous.item.kind === operation.item.kind &&
    previous.item.payload.sourceGeneration === operation.item.payload.sourceGeneration
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
