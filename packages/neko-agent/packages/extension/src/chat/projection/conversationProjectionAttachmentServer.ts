import type {
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ProjectionAttachmentHostFrame,
  ProjectionAttachmentKey,
  ProjectionAttachmentProtocolDiagnosticCode,
  ProjectionAttachRequest,
  ProjectionDetachMessage,
  ProjectionPatchFrame,
  ProjectionSnapshotAcknowledgement,
  ProjectionSnapshotFrame,
} from '@neko-agent/types';
import { isSameProjectionAttachment } from '@neko-agent/types';
import type { ConversationProjectionStore } from '@neko/agent/runtime';

export type ConversationProjectionAttachmentHostFrame = ProjectionAttachmentHostFrame<
  ConversationProjectionSnapshot,
  ConversationProjectionPatch
>;

export interface ConversationProjectionAttachmentServerOptions {
  readonly endpointEpoch: string;
  readonly resolveProjection: (conversationId: string) => ConversationProjectionStore;
  readonly postMessage: (frame: ConversationProjectionAttachmentHostFrame) => Promise<boolean>;
  readonly reportError: (error: Error, key: ProjectionAttachmentKey) => void;
}

export class ProjectionAttachmentProtocolError extends Error {
  constructor(
    readonly code: ProjectionAttachmentProtocolDiagnosticCode,
    readonly key: ProjectionAttachmentKey,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectionAttachmentProtocolError';
  }
}

export interface ConversationProjectionAttachmentServer {
  attach(request: ProjectionAttachRequest): Promise<void>;
  acknowledge(acknowledgement: ProjectionSnapshotAcknowledgement): Promise<void>;
  detach(message: ProjectionDetachMessage): Promise<void>;
  abandon(): Promise<void>;
  dispose(): Promise<void>;
}

export function createConversationProjectionAttachmentServer(
  options: ConversationProjectionAttachmentServerOptions,
): ConversationProjectionAttachmentServer {
  return new DefaultConversationProjectionAttachmentServer(options);
}

type AttachmentPhase = 'attaching' | 'awaiting-snapshot-ack' | 'live' | 'closing' | 'failed';

class DefaultConversationProjectionAttachmentServer implements ConversationProjectionAttachmentServer {
  private readonly attachmentsById = new Map<string, ProjectionAttachment>();
  private readonly attachmentIdByTabId = new Map<string, string>();
  private disposed = false;

  constructor(private readonly options: ConversationProjectionAttachmentServerOptions) {
    assertRequiredIdentity('endpointEpoch', options.endpointEpoch);
  }

  async attach(request: ProjectionAttachRequest): Promise<void> {
    this.assertActive();
    this.assertEndpoint(request.key);
    assertRequiredIdentity('attachmentId', request.key.attachmentId);
    assertRequiredIdentity('tabId', request.key.tabId);
    assertRequiredIdentity('conversationId', request.key.conversationId);
    if (this.attachmentsById.has(request.key.attachmentId)) {
      throw protocolError(
        'attachment-snapshot-required',
        request.key,
        `Projection attachment ${request.key.attachmentId} is already registered for this endpoint.`,
      );
    }
    const existingAttachmentId = this.attachmentIdByTabId.get(request.key.tabId);
    if (existingAttachmentId) {
      throw protocolError(
        'attachment-snapshot-required',
        request.key,
        `Projection Tab ${request.key.tabId} is already attached as ${existingAttachmentId}.`,
      );
    }

    const projection = this.options.resolveProjection(request.key.conversationId);
    if (projection.conversationId !== request.key.conversationId) {
      throw protocolError(
        'attachment-identity-mismatch',
        request.key,
        `Projection resolver returned conversation ${projection.conversationId} for ${request.key.conversationId}.`,
      );
    }
    const attachment = new ProjectionAttachment({
      key: request.key,
      projection,
      postMessage: this.options.postMessage,
      reportError: this.options.reportError,
    });
    this.attachmentsById.set(request.key.attachmentId, attachment);
    this.attachmentIdByTabId.set(request.key.tabId, request.key.attachmentId);
    try {
      await attachment.start();
    } catch (error: unknown) {
      this.removeAttachment(attachment);
      throw error;
    }
  }

  async acknowledge(acknowledgement: ProjectionSnapshotAcknowledgement): Promise<void> {
    this.assertActive();
    const attachment = this.requireAttachment(acknowledgement.key);
    await attachment.acknowledge(acknowledgement);
  }

  async detach(message: ProjectionDetachMessage): Promise<void> {
    this.assertActive();
    const attachment = this.requireAttachment(message.key);
    this.removeAttachment(attachment);
    await attachment.close();
  }

  abandon(): Promise<void> {
    return this.shutdown(false);
  }

  dispose(): Promise<void> {
    return this.shutdown(true);
  }

  private async shutdown(notifyClient: boolean): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const attachments = Array.from(this.attachmentsById.values());
    await Promise.all(
      attachments.map(async (attachment) => {
        try {
          if (notifyClient) {
            await attachment.notifyDetach({
              type: 'projectionDetach',
              key: attachment.key,
              reason: 'endpoint-replaced',
            });
          } else {
            await attachment.close();
          }
        } finally {
          this.removeAttachment(attachment);
        }
      }),
    );
  }

  private requireAttachment(key: ProjectionAttachmentKey): ProjectionAttachment {
    this.assertEndpoint(key);
    const attachment = this.attachmentsById.get(key.attachmentId);
    if (!attachment) {
      throw protocolError(
        'attachment-identity-mismatch',
        key,
        `Projection attachment ${key.attachmentId} is not registered.`,
      );
    }
    if (!isSameProjectionAttachment(attachment.key, key)) {
      throw protocolError(
        'attachment-identity-mismatch',
        key,
        `Projection attachment identity mismatch for ${key.attachmentId}.`,
      );
    }
    return attachment;
  }

  private removeAttachment(attachment: ProjectionAttachment): void {
    if (this.attachmentsById.get(attachment.key.attachmentId) === attachment) {
      this.attachmentsById.delete(attachment.key.attachmentId);
    }
    if (this.attachmentIdByTabId.get(attachment.key.tabId) === attachment.key.attachmentId) {
      this.attachmentIdByTabId.delete(attachment.key.tabId);
    }
  }

  private assertEndpoint(key: ProjectionAttachmentKey): void {
    if (key.endpointEpoch !== this.options.endpointEpoch) {
      throw protocolError(
        'attachment-identity-mismatch',
        key,
        `Projection attachment endpoint mismatch: expected ${this.options.endpointEpoch}, received ${key.endpointEpoch}.`,
      );
    }
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('Projection attachment server is disposed.');
    }
  }
}

interface ProjectionAttachmentOptions {
  readonly key: ProjectionAttachmentKey;
  readonly projection: ConversationProjectionStore;
  readonly postMessage: (frame: ConversationProjectionAttachmentHostFrame) => Promise<boolean>;
  readonly reportError: (error: Error, key: ProjectionAttachmentKey) => void;
}

class ProjectionAttachment {
  readonly key: ProjectionAttachmentKey;
  private phase: AttachmentPhase = 'attaching';
  private snapshotVersion: number | undefined;
  private deliveredProjectionVersion: number | undefined;
  private nextPatchSequence = 1;
  private pendingPatches: ConversationProjectionPatch[] = [];
  private unsubscribe: (() => void) | undefined;
  private tail: Promise<void> = Promise.resolve();
  private fatalError: Error | undefined;

  constructor(private readonly options: ProjectionAttachmentOptions) {
    this.key = { ...options.key };
  }

  start(): Promise<void> {
    this.unsubscribe = this.options.projection.subscribe((patch) => this.acceptPatch(patch));
    const snapshot = this.options.projection.snapshot();
    this.snapshotVersion = snapshot.projectionVersion;
    this.deliveredProjectionVersion = snapshot.projectionVersion;
    const frame: ProjectionSnapshotFrame<ConversationProjectionSnapshot> = {
      type: 'projectionSnapshot',
      key: this.key,
      sequence: 0,
      projectionVersion: snapshot.projectionVersion,
      projection: snapshot,
    };
    return this.enqueue(async () => {
      await this.deliver(frame);
      if (this.phase === 'attaching') {
        this.phase = 'awaiting-snapshot-ack';
      }
    }).catch((error: unknown) => {
      const fatal = toError(error);
      this.fail(fatal);
      throw fatal;
    });
  }

  acknowledge(acknowledgement: ProjectionSnapshotAcknowledgement): Promise<void> {
    if (!isSameProjectionAttachment(this.key, acknowledgement.key)) {
      throw protocolError(
        'attachment-identity-mismatch',
        acknowledgement.key,
        `Projection attachment identity mismatch for ${this.key.attachmentId}.`,
      );
    }
    return this.enqueue(async () => {
      this.assertHealthy();
      if (this.phase !== 'awaiting-snapshot-ack') {
        throw protocolError(
          'attachment-stale-ack',
          acknowledgement.key,
          `Projection attachment ${this.key.attachmentId} cannot acknowledge a snapshot while ${this.phase}.`,
        );
      }
      if (
        acknowledgement.sequence !== 0 ||
        acknowledgement.projectionVersion !== this.snapshotVersion
      ) {
        throw protocolError(
          'attachment-stale-ack',
          acknowledgement.key,
          `Projection attachment ${this.key.attachmentId} received a stale snapshot acknowledgement.`,
        );
      }

      this.phase = 'live';
      const patches = this.pendingPatches;
      this.pendingPatches = [];
      for (const patch of patches) {
        await this.deliverPatch(patch);
      }
    }).catch((error: unknown) => {
      const fatal = toError(error);
      this.fail(fatal);
      throw fatal;
    });
  }

  close(): Promise<void> {
    if (this.phase === 'closing') return this.tail;
    this.phase = 'closing';
    this.unsubscribeProjection();
    this.pendingPatches = [];
    return this.tail;
  }

  notifyDetach(message: ProjectionDetachMessage): Promise<void> {
    if (!isSameProjectionAttachment(this.key, message.key)) {
      throw protocolError(
        'attachment-identity-mismatch',
        message.key,
        `Projection attachment identity mismatch for ${this.key.attachmentId}.`,
      );
    }
    if (this.phase === 'closing') return this.tail;
    this.phase = 'closing';
    this.unsubscribeProjection();
    this.pendingPatches = [];
    return this.enqueue(() => this.deliver(message));
  }

  private acceptPatch(patch: ConversationProjectionPatch): void {
    if (patch.conversationId !== this.key.conversationId) {
      this.fail(
        protocolError(
          'attachment-identity-mismatch',
          this.key,
          `Projection attachment ${this.key.attachmentId} received patch for conversation ${patch.conversationId}.`,
        ),
      );
      return;
    }
    if (this.phase === 'attaching' || this.phase === 'awaiting-snapshot-ack') {
      this.pendingPatches.push(patch);
      return;
    }
    if (this.phase !== 'live') return;
    void this.enqueue(() => this.deliverPatch(patch)).catch((error: unknown) => {
      this.fail(toError(error));
    });
  }

  private async deliverPatch(patch: ConversationProjectionPatch): Promise<void> {
    this.assertHealthy();
    if (this.phase !== 'live') return;
    if (patch.baseProjectionVersion !== this.deliveredProjectionVersion) {
      throw protocolError(
        'attachment-patch-base-mismatch',
        this.key,
        `Projection attachment ${this.key.attachmentId} patch base mismatch: expected ${this.deliveredProjectionVersion}, received ${patch.baseProjectionVersion}.`,
      );
    }
    const frame: ProjectionPatchFrame<ConversationProjectionPatch> = {
      type: 'projectionPatch',
      key: this.key,
      sequence: this.nextPatchSequence,
      baseProjectionVersion: patch.baseProjectionVersion,
      projectionVersion: patch.projectionVersion,
      patch,
    };
    await this.deliver(frame);
    this.nextPatchSequence += 1;
    this.deliveredProjectionVersion = patch.projectionVersion;
  }

  private async deliver(frame: ConversationProjectionAttachmentHostFrame): Promise<void> {
    const delivered = await this.options.postMessage(frame);
    if (!delivered) {
      throw protocolError(
        'attachment-snapshot-required',
        this.key,
        `Projection attachment ${this.key.attachmentId} endpoint rejected ${frame.type}.`,
      );
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private fail(error: Error): void {
    if (this.fatalError) return;
    this.fatalError = error;
    this.phase = 'failed';
    this.unsubscribeProjection();
    this.pendingPatches = [];
    this.options.reportError(error, this.key);
  }

  private assertHealthy(): void {
    if (this.fatalError) throw this.fatalError;
  }

  private unsubscribeProjection(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}

function protocolError(
  code: ProjectionAttachmentProtocolDiagnosticCode,
  key: ProjectionAttachmentKey,
  message: string,
): ProjectionAttachmentProtocolError {
  return new ProjectionAttachmentProtocolError(code, key, message);
}

function assertRequiredIdentity(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Projection attachment ${name} is required.`);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
