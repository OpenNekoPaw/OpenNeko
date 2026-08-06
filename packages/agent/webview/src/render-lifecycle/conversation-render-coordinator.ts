import type {
  ConversationRenderMutation,
  ConversationRenderSnapshot,
  ConversationStreamingSnapshot,
} from './conversation-render-contract';
import { ConversationRenderLifecycleError } from './conversation-render-contract';

type UpdateMutation = Exclude<ConversationRenderMutation, { readonly kind: 'disposal' }>;
type DisposalMutation = Extract<ConversationRenderMutation, { readonly kind: 'disposal' }>;

export class ConversationRenderCoordinator {
  private readonly snapshots = new Map<string, ConversationRenderSnapshot>();
  private readonly disposedConversationIds = new Set<string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly selections = new Map<
    string,
    { readonly ids: readonly string[]; readonly snapshots: readonly ConversationRenderSnapshot[] }
  >();

  read(conversationId: string): ConversationRenderSnapshot | undefined {
    return this.snapshots.get(conversationId);
  }

  readMany(conversationIds: readonly string[]): readonly ConversationRenderSnapshot[] {
    const key = JSON.stringify(conversationIds);
    const cached = this.selections.get(key);
    const snapshots = conversationIds.flatMap((conversationId) => {
      const snapshot = this.snapshots.get(conversationId);
      return snapshot ? [snapshot] : [];
    });
    if (
      cached &&
      cached.ids.length === conversationIds.length &&
      cached.ids.every((id, index) => id === conversationIds[index]) &&
      cached.snapshots.length === snapshots.length &&
      cached.snapshots.every((snapshot, index) => snapshot === snapshots[index])
    ) {
      return cached.snapshots;
    }
    const selection = { ids: [...conversationIds], snapshots };
    this.selections.set(key, selection);
    return selection.snapshots;
  }

  isDisposed(conversationId: string): boolean {
    return this.disposedConversationIds.has(conversationId);
  }

  subscribe(conversationId: string, listener: () => void): () => void {
    const listeners = this.listeners.get(conversationId) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(conversationId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(conversationId);
    };
  }

  ingest(mutation: UpdateMutation): ConversationRenderSnapshot {
    const current = this.snapshots.get(mutation.conversationId);
    if (this.disposedConversationIds.has(mutation.conversationId)) {
      throw lifecycleError({
        code: 'conversation-disposed',
        message: `Conversation ${mutation.conversationId} cannot accept ${mutation.kind} after disposal.`,
        conversationId: mutation.conversationId,
      });
    }

    const next = createNextSnapshot(current, mutation);
    if (next === current) return current;
    this.snapshots.set(mutation.conversationId, next);
    this.publish([mutation.conversationId]);
    return next;
  }

  dispose(mutation: DisposalMutation): ConversationRenderSnapshot {
    if (this.disposedConversationIds.has(mutation.conversationId)) {
      throw lifecycleError({
        code: 'conversation-disposed',
        message: `Conversation ${mutation.conversationId} is already disposed.`,
        conversationId: mutation.conversationId,
      });
    }
    const current = this.snapshots.get(mutation.conversationId);
    if (!current) {
      throw lifecycleError({
        code: 'conversation-snapshot-unavailable',
        message: `Conversation ${mutation.conversationId} has no render snapshot to dispose.`,
        conversationId: mutation.conversationId,
      });
    }

    const disposed: ConversationRenderSnapshot = {
      ...current,
      retention: 'disposed',
    };
    this.snapshots.delete(mutation.conversationId);
    this.disposedConversationIds.add(mutation.conversationId);
    this.publish([mutation.conversationId]);
    this.listeners.delete(mutation.conversationId);
    return disposed;
  }

  private publish(conversationIds: readonly string[]): void {
    for (const conversationId of new Set(conversationIds)) {
      const listeners = this.listeners.get(conversationId);
      if (!listeners) continue;
      for (const listener of [...listeners]) listener();
    }
  }
}

function createNextSnapshot(
  current: ConversationRenderSnapshot | undefined,
  mutation: UpdateMutation,
): ConversationRenderSnapshot {
  const base: ConversationRenderSnapshot =
    current ??
    ({
      conversationId: mutation.conversationId,
      messages: [],
      streaming: emptyStreamingForMutation(mutation),
      retention: 'retained',
    } satisfies ConversationRenderSnapshot);

  switch (mutation.kind) {
    case 'host-snapshot':
      return {
        ...base,
        messages: [...mutation.messages],
        streaming: copyStreaming(mutation.streaming),
      };
    case 'queue-status':
      return {
        ...base,
        streaming: {
          ...base.streaming,
          queuedMessageCount: mutation.queuedMessageCount,
          queuedMessages: [...mutation.queuedMessages],
          ...(mutation.messageQueueSequence !== undefined
            ? { messageQueueSequence: mutation.messageQueueSequence }
            : {}),
          ...(mutation.isThinking !== undefined ? { isThinking: mutation.isThinking } : {}),
        },
      };
    case 'completion':
      return {
        ...base,
        messages: [...mutation.messages],
        streaming: {
          ...base.streaming,
          streamingMessageId: null,
          isThinking: false,
        },
      };
  }
}

function emptyStreamingForMutation(mutation: UpdateMutation): ConversationStreamingSnapshot {
  if (mutation.kind === 'host-snapshot') {
    return copyStreaming(mutation.streaming);
  }
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}

function copyStreaming(streaming: ConversationStreamingSnapshot): ConversationStreamingSnapshot {
  return {
    ...streaming,
    queuedMessages: [...streaming.queuedMessages],
  };
}

function lifecycleError(
  diagnostic: ConstructorParameters<typeof ConversationRenderLifecycleError>[0],
): ConversationRenderLifecycleError {
  return new ConversationRenderLifecycleError(diagnostic);
}
