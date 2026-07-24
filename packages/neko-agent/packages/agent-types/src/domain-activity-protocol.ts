import type {
  DomainActivityCommandInput,
  DomainActivityItem,
  DomainActivityPatch,
  DomainActivitySnapshot,
} from '@neko/shared/domain-activity';

export interface DomainActivityAttachmentKey {
  readonly attachmentId: string;
}

export interface DomainActivityAttachRequest {
  readonly type: 'domainActivityAttach';
  readonly key: DomainActivityAttachmentKey;
}

export interface DomainActivityAcknowledgement {
  readonly type: 'domainActivityAck';
  readonly key: DomainActivityAttachmentKey;
  readonly sequence: number;
  readonly projectionVersion: number;
}

export interface DomainActivityDetachRequest {
  readonly type: 'domainActivityDetach';
  readonly key: DomainActivityAttachmentKey;
}

export interface DomainJobCommandRequest extends DomainActivityCommandInput {
  readonly type: 'domainJobCommand';
  readonly requestId: string;
}

export type DomainActivityWebviewMessage =
  | DomainActivityAttachRequest
  | DomainActivityAcknowledgement
  | DomainActivityDetachRequest
  | DomainJobCommandRequest;

export interface DomainActivitySnapshotFrame {
  readonly type: 'domainActivitySnapshot';
  readonly key: DomainActivityAttachmentKey;
  readonly sequence: 0;
  readonly snapshot: DomainActivitySnapshot;
}

export interface DomainActivityPatchFrame {
  readonly type: 'domainActivityPatch';
  readonly key: DomainActivityAttachmentKey;
  readonly sequence: number;
  readonly patch: DomainActivityPatch;
}

export interface DomainActivityDiagnosticFrame {
  readonly type: 'domainActivityDiagnostic';
  readonly key: DomainActivityAttachmentKey;
  readonly fatal: true;
  readonly message: string;
}

export interface DomainJobCommandResult {
  readonly type: 'domainJobCommandResult';
  readonly requestId: string;
  readonly success: boolean;
  readonly item?: DomainActivityItem;
  readonly error?: string;
}

export type DomainActivityHostMessage =
  | DomainActivitySnapshotFrame
  | DomainActivityPatchFrame
  | DomainActivityDiagnosticFrame
  | DomainJobCommandResult;
