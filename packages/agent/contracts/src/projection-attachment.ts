/** Identity of one render replica attached to one conversation projection. */
export interface ProjectionAttachmentKey {
  readonly endpointEpoch: string;
  readonly attachmentId: string;
  readonly tabId: string;
  readonly conversationId: string;
}

export interface ProjectionAttachRequest {
  readonly type: 'projectionAttach';
  readonly key: ProjectionAttachmentKey;
}

export interface ProjectionSnapshotFrame<TProjection> {
  readonly type: 'projectionSnapshot';
  readonly key: ProjectionAttachmentKey;
  readonly sequence: 0;
  readonly projectionVersion: number;
  readonly projection: Readonly<TProjection>;
}

export interface ProjectionSnapshotAcknowledgement {
  readonly type: 'projectionSnapshotAck';
  readonly key: ProjectionAttachmentKey;
  readonly sequence: 0;
  readonly projectionVersion: number;
}

export interface ProjectionPatchFrame<TPatch> {
  readonly type: 'projectionPatch';
  readonly key: ProjectionAttachmentKey;
  readonly sequence: number;
  readonly baseProjectionVersion: number;
  readonly projectionVersion: number;
  readonly patch: Readonly<TPatch>;
}

export interface ProjectionDetachMessage {
  readonly type: 'projectionDetach';
  readonly key: ProjectionAttachmentKey;
  readonly reason: 'tab-closed' | 'endpoint-replaced' | 'conversation-disposed' | 'protocol-fatal';
}

export type ProjectionAttachmentProtocolDiagnosticCode =
  | 'attachment-identity-mismatch'
  | 'attachment-snapshot-required'
  | 'attachment-stale-ack'
  | 'attachment-frame-gap'
  | 'attachment-patch-base-mismatch';

export interface ProjectionAttachmentProtocolDiagnostic {
  readonly type: 'projectionProtocolDiagnostic';
  readonly key: ProjectionAttachmentKey;
  readonly code: ProjectionAttachmentProtocolDiagnosticCode;
  readonly severity: 'error';
  readonly fatal: true;
  readonly message: string;
}

export type ProjectionAttachmentHostFrame<TProjection, TPatch> =
  | ProjectionSnapshotFrame<TProjection>
  | ProjectionPatchFrame<TPatch>
  | ProjectionDetachMessage
  | ProjectionAttachmentProtocolDiagnostic;

export function isSameProjectionAttachment(
  left: ProjectionAttachmentKey,
  right: ProjectionAttachmentKey,
): boolean {
  return (
    left.endpointEpoch === right.endpointEpoch &&
    left.attachmentId === right.attachmentId &&
    left.tabId === right.tabId &&
    left.conversationId === right.conversationId
  );
}
