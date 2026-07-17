import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from '@neko-agent/types';
import {
  applyConversationProjectionPatch,
  cloneConversationProjectionSnapshot,
} from '@neko-agent/types';

export interface ConversationProjectionReplicaSnapshot {
  readonly conversationId: string;
  readonly projection: ConversationProjectionSnapshot | null;
  readonly revision: number;
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

export function createConversationProjectionReplica(
  conversationId: string,
): ConversationProjectionReplica {
  return new DefaultConversationProjectionReplica(conversationId);
}

class DefaultConversationProjectionReplica implements ConversationProjectionReplica {
  private snapshot: ConversationProjectionReplicaSnapshot;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(private readonly conversationId: string) {
    assertRequiredIdentity('conversationId', conversationId);
    this.snapshot = Object.freeze({
      conversationId,
      projection: null,
      revision: 0,
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
    assertProjectionVersion(snapshot.projectionVersion);
    return this.prepareCommit(cloneConversationProjectionSnapshot(snapshot));
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
    return this.prepareCommit(applyConversationProjectionPatch(projection, patch));
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
    this.listeners.clear();
  }

  private prepareCommit(
    projection: ConversationProjectionSnapshot,
  ): ConversationProjectionReplicaPublication {
    const expectedRevision = this.snapshot.revision;
    let published = false;
    return {
      publish: (): void => {
        this.assertActive();
        if (published) {
          throw new Error(
            'Conversation projection replica publication may only be published once.',
          );
        }
        if (this.snapshot.revision !== expectedRevision) {
          throw new Error(
            `Conversation projection replica ${this.conversationId} prepared revision ${expectedRevision} is stale; current revision is ${this.snapshot.revision}.`,
          );
        }
        published = true;
        this.commit(projection);
      },
    };
  }

  private commit(projection: ConversationProjectionSnapshot): void {
    this.snapshot = Object.freeze({
      conversationId: this.conversationId,
      projection,
      revision: this.snapshot.revision + 1,
    });
    for (const listener of this.listeners) listener();
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

function assertProjectionVersion(version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Conversation projection snapshot has invalid version ${version}.`);
  }
}

function assertRequiredIdentity(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Projection replica ${name} is required.`);
  }
}
