import type { ContentFingerprint, WorkspaceFileContentLocator } from '@neko/content';
import type { FountainDocument } from '@neko/screenplay-domain';

export const TEXT_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;

export type TextDocumentMode = 'markdown' | 'json' | 'fountain' | 'plain-text';

export interface TextDocumentSessionOwner {
  readonly kind: 'window';
  readonly windowId: string;
  readonly projectId: string;
}

export interface TextDocumentIdentity {
  readonly owner: TextDocumentSessionOwner;
  readonly workspaceId: string;
  readonly documentId: string;
  readonly locator: WorkspaceFileContentLocator;
}

export interface TextDocumentChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export type TextDocumentDiagnosticCode =
  | 'text-document-unsupported-extension'
  | 'text-document-too-large'
  | 'text-document-invalid-utf8'
  | 'text-document-mixed-line-endings'
  | 'text-document-read-failed'
  | 'text-document-session-missing'
  | 'text-document-identity-mismatch'
  | 'text-document-stale-edit-sequence'
  | 'text-document-request-reused'
  | 'text-document-invalid-change'
  | 'text-document-invalid-json'
  | 'text-document-save-conflict'
  | 'text-document-save-failed'
  | 'text-document-external-change-unavailable'
  | 'text-document-reload-confirmation-required';

export function isTextDocumentDiagnosticCode(value: unknown): value is TextDocumentDiagnosticCode {
  switch (value) {
    case 'text-document-unsupported-extension':
    case 'text-document-too-large':
    case 'text-document-invalid-utf8':
    case 'text-document-mixed-line-endings':
    case 'text-document-read-failed':
    case 'text-document-session-missing':
    case 'text-document-identity-mismatch':
    case 'text-document-stale-edit-sequence':
    case 'text-document-request-reused':
    case 'text-document-invalid-change':
    case 'text-document-invalid-json':
    case 'text-document-save-conflict':
    case 'text-document-save-failed':
    case 'text-document-external-change-unavailable':
    case 'text-document-reload-confirmation-required':
      return true;
    default:
      return false;
  }
}

export interface TextDocumentDiagnostic {
  readonly code: TextDocumentDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly from?: number;
  readonly to?: number;
}

export interface TextDocumentProjection {
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly editSequence: number;
  readonly mode: TextDocumentMode;
  readonly source: string;
  readonly dirty: boolean;
  readonly conflict: boolean;
  readonly diagnostics: readonly TextDocumentDiagnostic[];
  readonly screenplay?: FountainDocument;
}

export interface ApplyTextDocumentEditsCommand {
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedEditSequence: number;
  readonly changes: readonly TextDocumentChange[];
}

export type TextDocumentCloseDecision = 'save' | 'discard' | 'cancel';

export interface TextDocumentSessionState {
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly editSequence: number;
  readonly baseFingerprint: ContentFingerprint;
}

export class TextDocumentError extends Error {
  constructor(readonly diagnostic: TextDocumentDiagnostic) {
    super(diagnostic.code);
    this.name = 'TextDocumentError';
  }
}
