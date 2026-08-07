export interface HostProjectionAttachmentIdentity {
  readonly rendererSessionId: string;
  readonly attachmentId: string;
}

export interface HostProjectionAttachRequest<
  TKey extends HostProjectionAttachmentIdentity = HostProjectionAttachmentIdentity,
> {
  readonly type: 'projectionAttach';
  readonly key: TKey;
}

export interface HostProjectionSnapshotFrame<
  TKey extends HostProjectionAttachmentIdentity,
  TProjection,
> {
  readonly type: 'projectionSnapshot';
  readonly key: TKey;
  readonly sequence: 0;
  readonly projection: Readonly<TProjection>;
}

export interface HostProjectionSnapshotAcknowledgement<
  TKey extends HostProjectionAttachmentIdentity = HostProjectionAttachmentIdentity,
> {
  readonly type: 'projectionSnapshotAck';
  readonly key: TKey;
  readonly sequence: 0;
}

export interface HostProjectionPatchFrame<TKey extends HostProjectionAttachmentIdentity, TPatch> {
  readonly type: 'projectionPatch';
  readonly key: TKey;
  readonly sequence: number;
  readonly patch: Readonly<TPatch>;
}

export interface HostProjectionDetachMessage<
  TKey extends HostProjectionAttachmentIdentity = HostProjectionAttachmentIdentity,
  TReason extends string = string,
> {
  readonly type: 'projectionDetach';
  readonly key: TKey;
  readonly reason: TReason;
}

export type HostProjectionAttachmentProtocolDiagnosticCode =
  | 'attachment-identity-mismatch'
  | 'attachment-snapshot-required'
  | 'attachment-stale-ack'
  | 'attachment-frame-gap'
  | 'attachment-patch-rejected';

export interface HostProjectionAttachmentProtocolDiagnostic<
  TKey extends HostProjectionAttachmentIdentity = HostProjectionAttachmentIdentity,
  TCode extends string = HostProjectionAttachmentProtocolDiagnosticCode,
> {
  readonly type: 'projectionProtocolDiagnostic';
  readonly key: TKey;
  readonly code: TCode;
  readonly severity: 'error';
  readonly fatal: true;
  readonly message: string;
}

export type HostProjectionAttachmentFrame<
  TKey extends HostProjectionAttachmentIdentity,
  TProjection,
  TPatch,
  TDetachReason extends string = string,
  TDiagnosticCode extends string = HostProjectionAttachmentProtocolDiagnosticCode,
> =
  | HostProjectionSnapshotFrame<TKey, TProjection>
  | HostProjectionPatchFrame<TKey, TPatch>
  | HostProjectionDetachMessage<TKey, TDetachReason>
  | HostProjectionAttachmentProtocolDiagnostic<TKey, TDiagnosticCode>;

export function isSameHostProjectionAttachment(
  left: HostProjectionAttachmentIdentity,
  right: HostProjectionAttachmentIdentity,
): boolean {
  return (
    left.rendererSessionId === right.rendererSessionId && left.attachmentId === right.attachmentId
  );
}
