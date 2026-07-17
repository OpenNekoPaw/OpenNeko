import type {
  AgentTurnTimelineCompletion,
  AgentTurnTimelineItem,
  AgentTurnTimelineOperation,
} from './agent-turn-timeline';

export interface ConversationTurnProjection {
  readonly turnId: string;
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export interface ConversationProjectionSnapshot {
  readonly conversationId: string;
  readonly projectionVersion: number;
  readonly turns: readonly ConversationTurnProjection[];
}

export interface ConversationProjectionUpdate {
  readonly type: 'agentTurnTimelineUpdate';
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly operations: readonly AgentTurnTimelineOperation[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export interface ConversationProjectionPatch {
  readonly type: 'conversationProjectionPatch';
  readonly conversationId: string;
  readonly baseProjectionVersion: number;
  readonly projectionVersion: number;
  readonly turnId: string;
  readonly messageId: string;
  readonly operations: readonly AgentTurnTimelineOperation[];
  readonly completion?: AgentTurnTimelineCompletion;
}

export function applyAgentTurnProjectionOperations(
  items: Map<string, AgentTurnTimelineItem>,
  operations: readonly AgentTurnTimelineOperation[],
): void {
  for (const operation of operations) {
    if (operation.operation === 'complete') {
      applyCompletion(items, operation);
      continue;
    }

    const item = operation.item;
    assertPositiveRevision(item.itemId, item.itemRevision);
    const current = items.get(item.itemId);
    if (!current) {
      assertSequenceAvailable(items, item);
      items.set(item.itemId, cloneAgentTurnProjectionItem(item));
      continue;
    }

    assertStableItemIdentity(current, item);
    assertIncreasingRevision(current, item.itemRevision);
    if (operation.operation === 'append') {
      items.set(item.itemId, appendTextItem(current, item));
      continue;
    }
    items.set(item.itemId, cloneAgentTurnProjectionItem(item));
  }
}

export function cloneAgentTurnProjectionItem(item: AgentTurnTimelineItem): AgentTurnTimelineItem {
  return structuredClone(item);
}

export function applyConversationProjectionPatch(
  snapshot: ConversationProjectionSnapshot,
  patch: ConversationProjectionPatch,
): ConversationProjectionSnapshot {
  if (patch.conversationId !== snapshot.conversationId) {
    throw new Error(
      `Conversation projection patch owner mismatch: expected ${snapshot.conversationId}, received ${patch.conversationId}.`,
    );
  }
  if (patch.baseProjectionVersion !== snapshot.projectionVersion) {
    throw new Error(
      `Conversation projection patch base mismatch: expected ${snapshot.projectionVersion}, received ${patch.baseProjectionVersion}.`,
    );
  }
  if (patch.projectionVersion <= patch.baseProjectionVersion) {
    throw new Error(
      `Conversation projection patch version must increase from ${patch.baseProjectionVersion}, received ${patch.projectionVersion}.`,
    );
  }
  if (patch.operations.length === 0 && !patch.completion) {
    throw new Error('Conversation projection patch must contain operations or completion.');
  }

  const turns = snapshot.turns.map(cloneConversationTurnProjection);
  const turnIndex = turns.findIndex((turn) => turn.turnId === patch.turnId);
  const current = turnIndex >= 0 ? turns[turnIndex] : undefined;
  if (current && current.messageId !== patch.messageId) {
    throw new Error(
      `Conversation projection turn ${patch.turnId} is owned by message ${current.messageId}, received ${patch.messageId}.`,
    );
  }
  if (current?.completion) {
    throw new Error(`Conversation projection rejects mutation for completed turn ${patch.turnId}.`);
  }
  assertProjectionOperationOwners(patch);

  const items = new Map(
    (current?.items ?? []).map((item) => [item.itemId, cloneAgentTurnProjectionItem(item)]),
  );
  applyAgentTurnProjectionOperations(items, patch.operations);
  const nextTurn: ConversationTurnProjection = {
    turnId: patch.turnId,
    messageId: patch.messageId,
    items: Array.from(items.values()).sort((left, right) => left.sequence - right.sequence),
    ...(patch.completion ? { completion: structuredClone(patch.completion) } : {}),
  };
  if (turnIndex >= 0) {
    turns[turnIndex] = nextTurn;
  } else {
    turns.push(nextTurn);
  }

  return freezeProjectionSnapshot({
    conversationId: snapshot.conversationId,
    projectionVersion: patch.projectionVersion,
    turns,
  });
}

export function cloneConversationProjectionSnapshot(
  snapshot: ConversationProjectionSnapshot,
): ConversationProjectionSnapshot {
  return freezeProjectionSnapshot(structuredClone(snapshot));
}

function cloneConversationTurnProjection(
  turn: ConversationTurnProjection,
): ConversationTurnProjection {
  return {
    turnId: turn.turnId,
    messageId: turn.messageId,
    items: turn.items.map(cloneAgentTurnProjectionItem),
    ...(turn.completion ? { completion: structuredClone(turn.completion) } : {}),
  };
}

function assertProjectionOperationOwners(patch: ConversationProjectionPatch): void {
  for (const operation of patch.operations) {
    if (operation.operation === 'complete') continue;
    const item = operation.item;
    if (
      item.conversationId !== patch.conversationId ||
      item.turnId !== patch.turnId ||
      item.messageId !== patch.messageId
    ) {
      throw new Error(
        `Conversation projection operation ${item.itemId} does not belong to ${patch.conversationId}/${patch.turnId}/${patch.messageId}.`,
      );
    }
  }
}

function freezeProjectionSnapshot(
  snapshot: ConversationProjectionSnapshot,
): ConversationProjectionSnapshot {
  freezeValue(snapshot);
  return snapshot;
}

function freezeValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) freezeValue(item);
    Object.freeze(value);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const item of Object.values(value)) freezeValue(item);
  Object.freeze(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function applyCompletion(
  items: Map<string, AgentTurnTimelineItem>,
  operation: Extract<AgentTurnTimelineOperation, { readonly operation: 'complete' }>,
): void {
  const current = items.get(operation.itemId);
  if (!current || (current.kind !== 'assistant_text' && current.kind !== 'thinking')) {
    throw new Error(
      `Turn projection completion references unknown text item: ${operation.itemId}.`,
    );
  }
  if (current.kind !== operation.kind) {
    throw new Error(`Turn projection completion changed item kind: ${operation.itemId}.`);
  }
  if (current.payload.sourceGeneration !== operation.sourceGeneration) {
    throw new Error(`Turn projection completion changed source generation: ${operation.itemId}.`);
  }
  assertIncreasingRevision(current, operation.itemRevision);
  items.set(operation.itemId, {
    ...current,
    itemRevision: operation.itemRevision,
    status: operation.status,
    updatedAt: operation.updatedAt,
  });
}

function appendTextItem(
  current: AgentTurnTimelineItem,
  item: AgentTurnTimelineItem,
): AgentTurnTimelineItem {
  if (current.kind === 'assistant_text' && item.kind === 'assistant_text') {
    assertSourceGeneration(current, item);
    return structuredClone({
      ...item,
      createdAt: current.createdAt,
      sequence: current.sequence,
      payload: {
        ...item.payload,
        content: current.payload.content + item.payload.content,
      },
    });
  }
  if (current.kind === 'thinking' && item.kind === 'thinking') {
    assertSourceGeneration(current, item);
    return structuredClone({
      ...item,
      createdAt: current.createdAt,
      sequence: current.sequence,
      payload: {
        ...item.payload,
        content: current.payload.content + item.payload.content,
      },
    });
  }
  throw new Error(`Turn projection append requires a text item: ${item.itemId}.`);
}

function assertStableItemIdentity(
  current: AgentTurnTimelineItem,
  next: AgentTurnTimelineItem,
): void {
  if (
    current.kind !== next.kind ||
    current.conversationId !== next.conversationId ||
    current.turnId !== next.turnId ||
    current.messageId !== next.messageId ||
    current.sequence !== next.sequence
  ) {
    throw new Error(`Turn projection operation changed item identity: ${next.itemId}.`);
  }
}

function assertSourceGeneration(
  current:
    | Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }>
    | Extract<AgentTurnTimelineItem, { readonly kind: 'thinking' }>,
  next:
    | Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }>
    | Extract<AgentTurnTimelineItem, { readonly kind: 'thinking' }>,
): void {
  if (current.payload.sourceGeneration !== next.payload.sourceGeneration) {
    throw new Error(`Turn projection append changed source generation: ${next.itemId}.`);
  }
}

function assertPositiveRevision(itemId: string, revision: number): void {
  if (!Number.isInteger(revision) || revision <= 0) {
    throw new Error(`Turn projection item ${itemId} has invalid revision ${revision}.`);
  }
}

function assertIncreasingRevision(current: AgentTurnTimelineItem, nextRevision: number): void {
  assertPositiveRevision(current.itemId, nextRevision);
  if (nextRevision <= current.itemRevision) {
    throw new Error(
      `Turn projection item ${current.itemId} revision must increase from ${current.itemRevision}, received ${nextRevision}.`,
    );
  }
}

function assertSequenceAvailable(
  items: ReadonlyMap<string, AgentTurnTimelineItem>,
  item: AgentTurnTimelineItem,
): void {
  for (const existing of items.values()) {
    if (existing.sequence === item.sequence) {
      throw new Error(
        `Turn projection sequence ${item.sequence} is already owned by ${existing.itemId}.`,
      );
    }
  }
}
