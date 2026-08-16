import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from '@neko/agent-contracts';
import {
  applyConversationProjectionPatch,
  cloneConversationProjectionSnapshot,
} from '@neko/agent-contracts';

export interface ConversationProjectionReplicaSnapshot {
  readonly conversationId: string;
  readonly projection: ConversationProjectionSnapshot | null;
}

export interface ConversationProjectionReplicaPublication {
  /** Commit the prepared projection and notify subscribers exactly once. */
  publish(): void;
}

export interface ConversationProjectionReplica {
  getSnapshot(): ConversationProjectionReplicaSnapshot;
  subscribe(listener: () => void): () => void;
  prepareSnapshot(
    snapshot: ConversationProjectionSnapshot,
  ): ConversationProjectionReplicaPublication;
  preparePatch(patch: ConversationProjectionPatch): ConversationProjectionReplicaPublication;
  installSnapshot(snapshot: ConversationProjectionSnapshot): void;
  applyPatch(patch: ConversationProjectionPatch): void;
  dispose(): void;
}

/** Coalescing presentation scheduler: schedules `callback`, returns a cancel function. */
export type ConversationProjectionPublicationScheduler = (callback: () => void) => () => void;

export interface ConversationProjectionReplicaOptions {
  /**
   * When provided, streaming text/thinking append commits coalesce their render-subscriber
   * notification through this scheduler. The authoritative snapshot is always committed
   * synchronously; only the React-facing notification is coalesced. Completion and non-append
   * patches still notify immediately.
   */
  readonly scheduleStreamingPublication?: ConversationProjectionPublicationScheduler;
}

export function createConversationProjectionReplica(
  conversationId: string,
  options: ConversationProjectionReplicaOptions = {},
): ConversationProjectionReplica {
  return new DefaultConversationProjectionReplica(conversationId, options);
}

class DefaultConversationProjectionReplica implements ConversationProjectionReplica {
  private snapshot: ConversationProjectionReplicaSnapshot;
  private readonly listeners = new Set<() => void>();
  private pendingPublication: (() => void) | undefined;
  private disposed = false;

  constructor(
    private readonly conversationId: string,
    private readonly options: ConversationProjectionReplicaOptions = {},
  ) {
    assertRequiredIdentity('conversationId', conversationId);
    this.snapshot = Object.freeze({
      conversationId,
      projection: null,
    });
  }

  getSnapshot(): ConversationProjectionReplicaSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prepareSnapshot(
    snapshot: ConversationProjectionSnapshot,
  ): ConversationProjectionReplicaPublication {
    this.assertActive();
    this.assertOwner(snapshot.conversationId);
    return this.prepareCommit(cloneConversationProjectionSnapshot(snapshot), false);
  }

  preparePatch(patch: ConversationProjectionPatch): ConversationProjectionReplicaPublication {
    this.assertActive();
    this.assertOwner(patch.conversationId);
    const projection = this.snapshot.projection;
    if (!projection) {
      throw new Error(
        `Conversation projection replica ${this.conversationId} requires a snapshot before patches.`,
      );
    }
    return this.prepareCommit(
      applyConversationProjectionPatch(projection, patch),
      shouldCoalescePatch(patch),
    );
  }

  installSnapshot(snapshot: ConversationProjectionSnapshot): void {
    this.prepareSnapshot(snapshot).publish();
  }

  applyPatch(patch: ConversationProjectionPatch): void {
    this.preparePatch(patch).publish();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPendingPublication();
    this.listeners.clear();
  }

  private prepareCommit(
    projection: ConversationProjectionSnapshot,
    coalesce: boolean,
  ): ConversationProjectionReplicaPublication {
    const expectedSnapshot = this.snapshot;
    let published = false;
    return {
      publish: (): void => {
        this.assertActive();
        if (published) {
          throw new Error(
            'Conversation projection replica publication may only be published once.',
          );
        }
        if (this.snapshot !== expectedSnapshot) {
          throw new Error(
            `Conversation projection replica ${this.conversationId} rejected a stale prepared publication.`,
          );
        }
        published = true;
        this.commit(projection, coalesce);
      },
    };
  }

  private commit(projection: ConversationProjectionSnapshot, coalesce: boolean): void {
    this.snapshot = Object.freeze({
      conversationId: this.conversationId,
      projection,
    });
    if (coalesce && this.options.scheduleStreamingPublication) {
      this.pendingPublication ??= this.options.scheduleStreamingPublication(() => {
        this.pendingPublication = undefined;
        this.publishNow();
      });
      return;
    }
    this.cancelPendingPublication();
    this.publishNow();
  }

  private cancelPendingPublication(): void {
    this.pendingPublication?.();
    this.pendingPublication = undefined;
  }

  private publishNow(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private assertOwner(conversationId: string): void {
    if (conversationId !== this.conversationId) {
      throw new Error(
        `Conversation projection replica owner mismatch: expected ${this.conversationId}, received ${conversationId}.`,
      );
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`Conversation projection replica ${this.conversationId} is disposed.`);
    }
  }
}

function shouldCoalescePatch(patch: ConversationProjectionPatch): boolean {
  if (patch.completion !== undefined) return false;
  return (
    patch.operations.length > 0 &&
    patch.operations.every((operation) => operation.operation === 'append')
  );
}

function assertRequiredIdentity(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Projection replica ${name} is required.`);
  }
}
