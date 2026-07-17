import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ProjectionAttachRequest,
  ProjectionAttachmentHostFrame,
  ProjectionAttachmentKey,
  ProjectionAttachmentProtocolDiagnosticCode,
  ProjectionDetachMessage,
  ProjectionSnapshotAcknowledgement,
} from '@neko-agent/types';
import { isSameProjectionAttachment } from '@neko-agent/types';
import type { ConversationProjectionReplica } from './conversation-projection-replica';

export type ConversationProjectionAttachmentFrame = ProjectionAttachmentHostFrame<
  ConversationProjectionSnapshot,
  ConversationProjectionPatch
>;

export type ProjectionAttachmentClientMessage =
  ProjectionAttachRequest | ProjectionSnapshotAcknowledgement | ProjectionDetachMessage;

export type ProjectionAttachmentClientPhase =
  'detached' | 'awaiting-snapshot' | 'live' | 'fatal' | 'disposed';

export interface ProjectionAttachmentClientSnapshot {
  readonly phase: ProjectionAttachmentClientPhase;
  readonly key: ProjectionAttachmentKey | null;
  readonly lastSequence: number;
  readonly projectionVersion: number | null;
}

export interface ProjectionAttachmentClientOptions {
  readonly tabId: string;
  readonly conversationId: string;
  readonly replica: Pick<ConversationProjectionReplica, 'installSnapshot' | 'applyPatch'>;
  readonly send: (message: ProjectionAttachmentClientMessage) => void;
  readonly reportError: (error: Error, key: ProjectionAttachmentKey) => void;
}

export class ProjectionAttachmentClientProtocolError extends Error {
  constructor(
    readonly code: ProjectionAttachmentProtocolDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectionAttachmentClientProtocolError';
  }
}

export interface ProjectionAttachmentClient {
  getSnapshot(): ProjectionAttachmentClientSnapshot;
  attach(identity: Pick<ProjectionAttachmentKey, 'endpointEpoch' | 'attachmentId'>): void;
  accept(frame: ConversationProjectionAttachmentFrame): void;
  detach(reason: ProjectionDetachMessage['reason']): void;
  abandon(): void;
  dispose(): void;
}

export function createProjectionAttachmentClient(
  options: ProjectionAttachmentClientOptions,
): ProjectionAttachmentClient {
  return new DefaultProjectionAttachmentClient(options);
}

class DefaultProjectionAttachmentClient implements ProjectionAttachmentClient {
  private snapshot: ProjectionAttachmentClientSnapshot = Object.freeze({
    phase: 'detached',
    key: null,
    lastSequence: -1,
    projectionVersion: null,
  });

  constructor(private readonly options: ProjectionAttachmentClientOptions) {
    assertRequiredIdentity('tabId', options.tabId);
    assertRequiredIdentity('conversationId', options.conversationId);
  }

  getSnapshot(): ProjectionAttachmentClientSnapshot {
    return this.snapshot;
  }

  attach(identity: Pick<ProjectionAttachmentKey, 'endpointEpoch' | 'attachmentId'>): void {
    this.assertNotDisposed();
    if (this.snapshot.phase !== 'detached') {
      throw new Error(
        `Projection attachment for Tab ${this.options.tabId} cannot attach from ${this.snapshot.phase}.`,
      );
    }
    assertRequiredIdentity('endpointEpoch', identity.endpointEpoch);
    assertRequiredIdentity('attachmentId', identity.attachmentId);
    const key: ProjectionAttachmentKey = Object.freeze({
      ...identity,
      tabId: this.options.tabId,
      conversationId: this.options.conversationId,
    });
    this.snapshot = Object.freeze({
      phase: 'awaiting-snapshot',
      key,
      lastSequence: -1,
      projectionVersion: null,
    });
    try {
      this.options.send({ type: 'projectionAttach', key });
    } catch (error: unknown) {
      this.fail(toError(error), key);
    }
  }

  accept(frame: ConversationProjectionAttachmentFrame): void {
    this.assertNotDisposed();
    const key = this.requireKey();
    if (!isSameProjectionAttachment(key, frame.key)) {
      throw new Error(
        `Projection attachment identity mismatch for Tab ${this.options.tabId}: expected ${formatKey(key)}, received ${formatKey(frame.key)}.`,
      );
    }

    if (frame.type === 'projectionSnapshot') {
      this.acceptSnapshot(frame);
      return;
    }
    if (frame.type === 'projectionPatch') {
      this.acceptPatch(frame);
      return;
    }
    if (frame.type === 'projectionDetach') {
      this.snapshot = Object.freeze({
        phase: 'detached',
        key: null,
        lastSequence: -1,
        projectionVersion: null,
      });
      return;
    }

    this.fail(new ProjectionAttachmentClientProtocolError(frame.code, frame.message), key);
  }

  detach(reason: ProjectionDetachMessage['reason']): void {
    this.assertNotDisposed();
    const key = this.snapshot.key;
    if (!key) return;
    this.options.send({ type: 'projectionDetach', key, reason });
    this.snapshot = Object.freeze({
      phase: 'detached',
      key: null,
      lastSequence: -1,
      projectionVersion: null,
    });
  }

  abandon(): void {
    this.assertNotDisposed();
    this.snapshot = Object.freeze({
      phase: 'detached',
      key: null,
      lastSequence: -1,
      projectionVersion: null,
    });
  }

  dispose(): void {
    if (this.snapshot.phase === 'disposed') return;
    const key = this.snapshot.key;
    if (key && this.snapshot.phase !== 'fatal') {
      this.options.send({ type: 'projectionDetach', key, reason: 'tab-closed' });
    }
    this.snapshot = Object.freeze({
      phase: 'disposed',
      key: null,
      lastSequence: -1,
      projectionVersion: null,
    });
  }

  private acceptSnapshot(
    frame: Extract<ConversationProjectionAttachmentFrame, { readonly type: 'projectionSnapshot' }>,
  ): void {
    const key = this.requireKey();
    if (this.snapshot.phase !== 'awaiting-snapshot') {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-snapshot-required',
          `Projection attachment ${key.attachmentId} received snapshot from ${this.snapshot.phase}.`,
        ),
        key,
      );
    }
    if (frame.sequence !== 0) {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-snapshot-required',
          `Projection attachment ${key.attachmentId} snapshot sequence must be 0.`,
        ),
        key,
      );
    }
    if (
      frame.projection.conversationId !== key.conversationId ||
      frame.projectionVersion !== frame.projection.projectionVersion
    ) {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-identity-mismatch',
          `Projection attachment ${key.attachmentId} snapshot identity/version mismatch.`,
        ),
        key,
      );
    }

    try {
      this.options.replica.installSnapshot(frame.projection);
    } catch (error: unknown) {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-identity-mismatch',
          `Projection attachment ${key.attachmentId} rejected its authoritative snapshot: ${toError(error).message}`,
        ),
        key,
      );
    }
    this.options.send({
      type: 'projectionSnapshotAck',
      key,
      sequence: 0,
      projectionVersion: frame.projectionVersion,
    });
    this.snapshot = Object.freeze({
      phase: 'live',
      key,
      lastSequence: 0,
      projectionVersion: frame.projectionVersion,
    });
  }

  private acceptPatch(
    frame: Extract<ConversationProjectionAttachmentFrame, { readonly type: 'projectionPatch' }>,
  ): void {
    const key = this.requireKey();
    if (this.snapshot.phase !== 'live') {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-snapshot-required',
          `Projection attachment ${key.attachmentId} requires a snapshot before live patches.`,
        ),
        key,
      );
    }
    const expectedSequence = this.snapshot.lastSequence + 1;
    if (frame.sequence !== expectedSequence) {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-frame-gap',
          `Projection attachment ${key.attachmentId} frame gap: expected ${expectedSequence}, received ${frame.sequence}.`,
        ),
        key,
      );
    }
    if (
      frame.baseProjectionVersion !== this.snapshot.projectionVersion ||
      frame.baseProjectionVersion !== frame.patch.baseProjectionVersion ||
      frame.projectionVersion !== frame.patch.projectionVersion ||
      frame.patch.conversationId !== key.conversationId
    ) {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-patch-base-mismatch',
          `Projection attachment ${key.attachmentId} patch base/version mismatch.`,
        ),
        key,
      );
    }

    try {
      this.options.replica.applyPatch(frame.patch);
    } catch (error: unknown) {
      this.fail(
        new ProjectionAttachmentClientProtocolError(
          'attachment-patch-base-mismatch',
          `Projection attachment ${key.attachmentId} rejected its live patch: ${toError(error).message}`,
        ),
        key,
      );
    }
    this.snapshot = Object.freeze({
      phase: 'live',
      key,
      lastSequence: frame.sequence,
      projectionVersion: frame.projectionVersion,
    });
  }

  private fail(error: Error, key: ProjectionAttachmentKey): never {
    this.snapshot = Object.freeze({
      phase: 'fatal',
      key,
      lastSequence: this.snapshot.lastSequence,
      projectionVersion: this.snapshot.projectionVersion,
    });
    this.options.reportError(error, key);
    throw error;
  }

  private requireKey(): ProjectionAttachmentKey {
    const key = this.snapshot.key;
    if (!key) {
      throw new Error(`Projection attachment for Tab ${this.options.tabId} is not attached.`);
    }
    return key;
  }

  private assertNotDisposed(): void {
    if (this.snapshot.phase === 'disposed') {
      throw new Error(`Projection attachment for Tab ${this.options.tabId} is disposed.`);
    }
  }
}

function assertRequiredIdentity(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Projection attachment ${name} is required.`);
  }
}

function formatKey(key: ProjectionAttachmentKey): string {
  return `${key.endpointEpoch}/${key.attachmentId}/${key.tabId}/${key.conversationId}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
