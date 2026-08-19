import type {
  AgentContinuationMetadata,
  AgentMessageQueueSnapshot,
  AgentQueuedMessageDisplayKind,
  AgentQueuedMessageDraft,
  AgentQueuedMessageItem,
  AgentQueuedMessageSource,
} from '@neko/agent-contracts';

export type AgentMessageQueueOperationErrorCode =
  'stale-item' | 'invalid-queue-operation' | 'not-queueable';

export class AgentMessageQueueOperationError extends Error {
  constructor(
    readonly code: AgentMessageQueueOperationErrorCode,
    message: string,
    readonly queueItemId?: string,
  ) {
    super(message);
    this.name = 'AgentMessageQueueOperationError';
  }
}

export interface EnqueueAgentMessageInput {
  readonly content: string;
  readonly source?: AgentQueuedMessageSource;
  readonly displayKind?: AgentQueuedMessageDisplayKind;
  readonly metadata?: AgentContinuationMetadata;
  readonly draft?: AgentQueuedMessageDraft;
  readonly now?: number;
}

export interface AgentConversationMessageQueue {
  readonly conversationId: string;
  enqueue(input: EnqueueAgentMessageInput): AgentQueuedMessageItem;
  snapshot(): AgentMessageQueueSnapshot;
  promote(queueItemId: string): AgentQueuedMessageItem;
  edit(queueItemId: string, content: string, now?: number): AgentQueuedMessageItem;
  remove(queueItemId: string): AgentQueuedMessageItem;
  discardContinuation(queueItemId: string, now?: number): AgentQueuedMessageItem;
  releaseNext(): AgentQueuedMessageItem | null;
  drain(release: (item: AgentQueuedMessageItem) => Promise<void>): Promise<void>;
  pauseAfterActiveTurnCancel(): void;
  resume(): void;
  isPausedAfterActiveTurnCancel(): boolean;
  clear(): void;
}

export interface CreateAgentConversationMessageQueueOptions {
  readonly conversationId: string;
  readonly createId?: () => string;
  readonly now?: () => number;
}

/** Runtime-owned binding between one Agent session and its active conversation queue. */
export interface AgentRuntimeSessionMessageQueuePort {
  current(): AgentConversationMessageQueue | null;
  require(): AgentConversationMessageQueue;
  bindConversation(conversationId: string): AgentConversationMessageQueue;
  clear(): void;
}

export function createAgentRuntimeSessionMessageQueuePort(
  conversationId?: string,
): AgentRuntimeSessionMessageQueuePort {
  let queue = conversationId ? createAgentConversationMessageQueue({ conversationId }) : null;

  return {
    current: () => queue,
    require: () => {
      if (!queue) {
        throw new AgentMessageQueueOperationError(
          'invalid-queue-operation',
          'Agent runtime message queue requires an explicit conversation id.',
        );
      }
      return queue;
    },
    bindConversation: (nextConversationId) => {
      if (queue?.conversationId === nextConversationId) {
        return queue;
      }
      if (queue && queue.snapshot().pendingCount > 0) {
        throw new AgentMessageQueueOperationError(
          'invalid-queue-operation',
          `Cannot switch Agent runtime message queue from ${queue.conversationId} to ${nextConversationId} while pending messages exist.`,
        );
      }
      queue?.clear();
      queue = createAgentConversationMessageQueue({ conversationId: nextConversationId });
      return queue;
    },
    clear: () => {
      queue?.clear();
      queue = null;
    },
  };
}

export function createAgentConversationMessageQueue(
  options: CreateAgentConversationMessageQueueOptions,
): AgentConversationMessageQueue {
  return new DefaultAgentConversationMessageQueue(options);
}

class DefaultAgentConversationMessageQueue implements AgentConversationMessageQueue {
  readonly conversationId: string;
  private readonly items: AgentQueuedMessageItem[] = [];
  private eventSequence = 0;
  private idSequence = 0;
  private pausedAfterActiveTurnCancel = false;
  private sendNowItemId: string | null = null;
  private draining = false;

  constructor(private readonly options: CreateAgentConversationMessageQueueOptions) {
    const conversationId = options.conversationId.trim();
    if (!conversationId) {
      throw new AgentMessageQueueOperationError(
        'invalid-queue-operation',
        'Message queue conversation id cannot be empty.',
      );
    }
    this.conversationId = conversationId;
  }

  enqueue(input: EnqueueAgentMessageInput): AgentQueuedMessageItem {
    const source = input.source ?? 'composer';
    const content = normalizeContent(input.content);
    const item: AgentQueuedMessageItem = {
      id: this.nextId(),
      conversationId: this.conversationId,
      content,
      createdAt: input.now ?? this.readNow(),
      source,
      displayKind: input.displayKind ?? defaultDisplayKindForSource(source),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
      ...(input.draft ? { draft: cloneDraft(input.draft) } : {}),
    };
    this.items.push(item);
    this.advanceEventSequence();
    return cloneItem(item);
  }

  snapshot(): AgentMessageQueueSnapshot {
    return {
      conversationId: this.conversationId,
      items: this.items.map(cloneItem),
      pendingCount: this.items.length,
      paused: this.pausedAfterActiveTurnCancel,
      sequence: this.eventSequence,
    };
  }

  promote(queueItemId: string): AgentQueuedMessageItem {
    const item = this.takeUserItem(queueItemId, 'sent immediately');
    this.items.unshift(item);
    this.sendNowItemId = item.id;
    this.advanceEventSequence();
    return cloneItem(item);
  }

  edit(queueItemId: string, content: string, now = this.readNow()): AgentQueuedMessageItem {
    const index = this.findIndex(queueItemId);
    const current = this.requireItem(index, queueItemId);
    if (!isUserQueueSource(current.source)) {
      throw new AgentMessageQueueOperationError(
        'invalid-queue-operation',
        `Queued continuation cannot be edited as a user message: ${queueItemId}`,
        queueItemId,
      );
    }
    const updated: AgentQueuedMessageItem = {
      ...current,
      content: normalizeContent(content, queueItemId),
      updatedAt: now,
    };
    this.items[index] = updated;
    this.advanceEventSequence();
    return cloneItem(updated);
  }

  remove(queueItemId: string): AgentQueuedMessageItem {
    const item = this.takeUserItem(queueItemId, 'removed');
    this.advanceEventSequence();
    if (this.items.length === 0) {
      this.pausedAfterActiveTurnCancel = false;
    }
    return cloneItem(item);
  }

  discardContinuation(queueItemId: string, now = this.readNow()): AgentQueuedMessageItem {
    const index = this.findIndex(queueItemId);
    const current = this.requireItem(index, queueItemId);
    if (isUserQueueSource(current.source)) {
      throw new AgentMessageQueueOperationError(
        'invalid-queue-operation',
        `Queued user message cannot be discarded as a continuation: ${queueItemId}`,
        queueItemId,
      );
    }
    this.items.splice(index, 1);
    const discarded: AgentQueuedMessageItem = {
      ...current,
      updatedAt: now,
      metadata: { ...current.metadata, status: 'discarded' },
    };
    this.advanceEventSequence();
    if (this.items.length === 0) {
      this.pausedAfterActiveTurnCancel = false;
    }
    return cloneItem(discarded);
  }

  releaseNext(): AgentQueuedMessageItem | null {
    if (this.pausedAfterActiveTurnCancel) {
      return null;
    }
    const sendNowIndex =
      this.sendNowItemId === null
        ? -1
        : this.items.findIndex((item) => item.id === this.sendNowItemId);
    if (this.sendNowItemId !== null && sendNowIndex < 0) {
      throw new Error(`Send-now queue item invariant violated: ${this.sendNowItemId}`);
    }
    const continuationIndex = this.items.findIndex((item) => !isUserQueueSource(item.source));
    const index = sendNowIndex >= 0 ? sendNowIndex : continuationIndex >= 0 ? continuationIndex : 0;
    const item = this.items.splice(index, 1)[0];
    if (!item) {
      return null;
    }
    if (item.id === this.sendNowItemId) {
      this.sendNowItemId = null;
    }
    this.advanceEventSequence();
    return cloneItem(item);
  }

  async drain(release: (item: AgentQueuedMessageItem) => Promise<void>): Promise<void> {
    if (this.draining || this.pausedAfterActiveTurnCancel) {
      return;
    }
    this.draining = true;
    try {
      for (;;) {
        const item = this.releaseNext();
        if (!item) {
          return;
        }
        await release(item);
      }
    } finally {
      this.draining = false;
    }
  }

  pauseAfterActiveTurnCancel(): void {
    if (this.items.length === 0 || this.pausedAfterActiveTurnCancel) {
      return;
    }
    this.pausedAfterActiveTurnCancel = true;
    this.advanceEventSequence();
  }

  resume(): void {
    if (!this.pausedAfterActiveTurnCancel) {
      return;
    }
    this.pausedAfterActiveTurnCancel = false;
    this.advanceEventSequence();
  }

  isPausedAfterActiveTurnCancel(): boolean {
    return this.pausedAfterActiveTurnCancel;
  }

  clear(): void {
    if (this.items.length === 0 && !this.pausedAfterActiveTurnCancel) {
      return;
    }
    this.items.length = 0;
    this.pausedAfterActiveTurnCancel = false;
    this.sendNowItemId = null;
    this.advanceEventSequence();
  }

  private takeUserItem(queueItemId: string, operation: string): AgentQueuedMessageItem {
    const index = this.findIndex(queueItemId);
    const item = this.requireItem(index, queueItemId);
    if (!isUserQueueSource(item.source)) {
      throw new AgentMessageQueueOperationError(
        'invalid-queue-operation',
        `Queued continuation cannot be ${operation} as a user message: ${queueItemId}`,
        queueItemId,
      );
    }
    this.items.splice(index, 1);
    if (item.id === this.sendNowItemId) {
      this.sendNowItemId = null;
    }
    return item;
  }

  private findIndex(queueItemId: string): number {
    const index = this.items.findIndex((item) => item.id === queueItemId);
    if (index < 0) {
      throw new AgentMessageQueueOperationError(
        'stale-item',
        `Queued message is no longer pending: ${queueItemId}`,
        queueItemId,
      );
    }
    return index;
  }

  private requireItem(index: number, queueItemId: string): AgentQueuedMessageItem {
    return this.requireItemValue(this.items[index], queueItemId);
  }

  private requireItemValue(
    item: AgentQueuedMessageItem | undefined,
    queueItemId: string,
  ): AgentQueuedMessageItem {
    if (!item) {
      throw new Error(`Pending message queue index invariant violated: ${queueItemId}`);
    }
    return item;
  }

  private nextId(): string {
    if (this.options.createId) {
      return this.options.createId();
    }
    this.idSequence += 1;
    return `${this.conversationId}:queue:${this.readNow().toString(36)}:${this.idSequence.toString(36)}`;
  }

  private readNow(): number {
    return this.options.now?.() ?? Date.now();
  }

  private advanceEventSequence(): void {
    this.eventSequence += 1;
  }
}

function normalizeContent(content: string, queueItemId?: string): string {
  const normalized = content.trim();
  if (!normalized) {
    throw new AgentMessageQueueOperationError(
      'not-queueable',
      'Queued message content cannot be empty.',
      queueItemId,
    );
  }
  return normalized;
}

function isUserQueueSource(source: AgentQueuedMessageSource): boolean {
  return source === 'user' || source === 'composer';
}

function defaultDisplayKindForSource(
  source: AgentQueuedMessageSource,
): AgentQueuedMessageDisplayKind {
  switch (source) {
    case 'subagent-result-continuation':
      return 'subagent-continuation';
    case 'system-continuation':
      return 'system-continuation';
    case 'composer':
    case 'user':
      return 'user-message';
  }
}

function cloneItem(item: AgentQueuedMessageItem): AgentQueuedMessageItem {
  return {
    ...item,
    ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
    ...(item.draft ? { draft: cloneDraft(item.draft) } : {}),
  };
}

function cloneDraft(draft: AgentQueuedMessageDraft): AgentQueuedMessageDraft {
  return structuredClone(draft);
}
