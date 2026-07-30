import type {
  HostProjectionAttachmentFrame,
  HostProjectionAttachmentIdentity,
  HostProjectionAttachmentProtocolDiagnostic,
  HostProjectionAttachmentProtocolDiagnosticCode,
  HostProjectionAttachRequest,
  HostProjectionDetachMessage,
  HostProjectionPatchFrame,
  HostProjectionSnapshotAcknowledgement,
  HostProjectionSnapshotFrame,
} from '@neko/host/projection-attachment';

/** Identity of one render replica attached to one conversation projection. */
export interface ProjectionAttachmentKey extends HostProjectionAttachmentIdentity {
  readonly endpointEpoch: string;
  readonly attachmentId: string;
  readonly tabId: string;
  readonly conversationId: string;
}

export type ProjectionAttachRequest = HostProjectionAttachRequest<ProjectionAttachmentKey>;

export type ProjectionSnapshotFrame<TProjection> = HostProjectionSnapshotFrame<
  ProjectionAttachmentKey,
  TProjection
>;

export type ProjectionSnapshotAcknowledgement =
  HostProjectionSnapshotAcknowledgement<ProjectionAttachmentKey>;

export type ProjectionPatchFrame<TPatch> = HostProjectionPatchFrame<
  ProjectionAttachmentKey,
  TPatch
>;

export type ProjectionDetachMessage = HostProjectionDetachMessage<
  ProjectionAttachmentKey,
  'tab-closed' | 'endpoint-replaced' | 'conversation-disposed' | 'protocol-fatal'
>;

export type ProjectionAttachmentProtocolDiagnosticCode =
  HostProjectionAttachmentProtocolDiagnosticCode;

export type ProjectionAttachmentProtocolDiagnostic =
  HostProjectionAttachmentProtocolDiagnostic<ProjectionAttachmentKey>;

export type ProjectionAttachmentHostFrame<TProjection, TPatch> = HostProjectionAttachmentFrame<
  ProjectionAttachmentKey,
  TProjection,
  TPatch,
  ProjectionDetachMessage['reason']
>;

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
