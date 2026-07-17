import type {
  AgentTurnTimelineCompletion,
  AgentTurnTimelineItem,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ConversationProjectionUpdate,
} from '@neko-agent/types';
import {
  applyAgentTurnProjectionOperations,
  cloneAgentTurnProjectionItem,
} from '@neko-agent/types';

export type ConversationProjectionListener = (patch: ConversationProjectionPatch) => void;

export interface ConversationProjectionStore {
  readonly conversationId: string;
  readonly projectionVersion: number;
  apply(update: ConversationProjectionUpdate): ConversationProjectionPatch;
  snapshot(): ConversationProjectionSnapshot;
  subscribe(listener: ConversationProjectionListener): () => void;
  dispose(): void;
}

interface MutableTurnProjection {
  readonly turnId: string;
  readonly messageId: string;
  readonly items: Map<string, AgentTurnTimelineItem>;
  completion?: AgentTurnTimelineCompletion;
}

export function createConversationProjectionStore(
  conversationId: string,
): ConversationProjectionStore {
  return new DefaultConversationProjectionStore(conversationId);
}

class DefaultConversationProjectionStore implements ConversationProjectionStore {
  private readonly turns = new Map<string, MutableTurnProjection>();
  private readonly listeners = new Set<ConversationProjectionListener>();
  private _projectionVersion = 0;
  private disposed = false;

  constructor(readonly conversationId: string) {
    assertRequiredIdentity('conversationId', conversationId);
  }

  get projectionVersion(): number {
    return this._projectionVersion;
  }

  apply(update: ConversationProjectionUpdate): ConversationProjectionPatch {
    this.assertActive();
    this.assertOwner(update);
    if (update.operations.length === 0 && !update.completion) {
      throw new Error('Conversation projection update must contain operations or completion.');
    }

    const currentTurn = this.turns.get(update.turnId);
    const turn = this.prepareTurn(update, currentTurn);
    if (currentTurn?.completion) {
      throw new Error(
        `Conversation projection rejects mutation for completed turn ${turn.turnId}.`,
      );
    }
    assertOperationOwners(update);
    applyAgentTurnProjectionOperations(turn.items, update.operations);
    if (update.completion) {
      turn.completion = cloneValue(update.completion);
    }
    this.turns.set(turn.turnId, turn);

    const baseProjectionVersion = this._projectionVersion;
    this._projectionVersion += 1;
    const patch = freezeClone<ConversationProjectionPatch>({
      type: 'conversationProjectionPatch',
      conversationId: this.conversationId,
      baseProjectionVersion,
      projectionVersion: this._projectionVersion,
      turnId: turn.turnId,
      messageId: turn.messageId,
      operations: update.operations,
      ...(update.completion ? { completion: update.completion } : {}),
    });
    for (const listener of this.listeners) {
      listener(patch);
    }
    return patch;
  }

  snapshot(): ConversationProjectionSnapshot {
    this.assertActive();
    return freezeClone<ConversationProjectionSnapshot>({
      conversationId: this.conversationId,
      projectionVersion: this._projectionVersion,
      turns: Array.from(this.turns.values(), (turn) => ({
        turnId: turn.turnId,
        messageId: turn.messageId,
        items: Array.from(turn.items.values())
          .sort((left, right) => left.sequence - right.sequence)
          .map(cloneAgentTurnProjectionItem),
        ...(turn.completion ? { completion: cloneValue(turn.completion) } : {}),
      })),
    });
  }

  subscribe(listener: ConversationProjectionListener): () => void {
    this.assertActive();
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.turns.clear();
  }

  private prepareTurn(
    update: ConversationProjectionUpdate,
    existing: MutableTurnProjection | undefined,
  ): MutableTurnProjection {
    assertRequiredIdentity('turnId', update.turnId);
    assertRequiredIdentity('messageId', update.messageId);
    if (existing && existing.messageId !== update.messageId) {
      throw new Error(
        `Conversation projection turn ${update.turnId} is owned by message ${existing.messageId}, received ${update.messageId}.`,
      );
    }
    return {
      turnId: update.turnId,
      messageId: update.messageId,
      items: new Map(
        Array.from(existing?.items ?? [], ([itemId, item]) => [
          itemId,
          cloneAgentTurnProjectionItem(item),
        ]),
      ),
      ...(existing?.completion ? { completion: cloneValue(existing.completion) } : {}),
    };
  }

  private assertOwner(update: ConversationProjectionUpdate): void {
    if (update.conversationId !== this.conversationId) {
      throw new Error(
        `Conversation projection owner mismatch: expected ${this.conversationId}, received ${update.conversationId}.`,
      );
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`Conversation projection ${this.conversationId} is disposed.`);
    }
  }
}

function assertOperationOwners(update: ConversationProjectionUpdate): void {
  for (const operation of update.operations) {
    if (operation.operation === 'complete') continue;
    const item = operation.item;
    if (
      item.conversationId !== update.conversationId ||
      item.turnId !== update.turnId ||
      item.messageId !== update.messageId
    ) {
      throw new Error(
        `Conversation projection operation ${item.itemId} does not belong to ${update.conversationId}/${update.turnId}/${update.messageId}.`,
      );
    }
  }
}

function assertRequiredIdentity(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} is required for a conversation projection.`);
  }
}

function freezeClone<T>(value: T): T {
  return freezeValue(structuredClone(value));
}

function freezeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) freezeValue(item);
    return Object.freeze(value);
  }
  if (isPlainRecord(value)) {
    for (const item of Object.values(value)) freezeValue(item);
    return Object.freeze(value);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
