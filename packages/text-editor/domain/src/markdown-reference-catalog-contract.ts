import { validateContentLocator } from '@neko/content';
import type { TextDocumentIdentity } from './contracts';

export type TextEditorMarkdownReferenceQueryKind = 'mention' | 'resource-link' | 'resource-embed';

export type TextEditorMarkdownReferenceSource = 'workspace-file' | 'entity' | 'asset';

export interface TextEditorMarkdownReferenceIdentity {
  readonly kind: string;
  readonly id: string;
  readonly namespace?: string;
}

interface TextEditorMarkdownReferenceCandidateBase {
  readonly source: TextEditorMarkdownReferenceSource;
  readonly ref: TextEditorMarkdownReferenceIdentity;
  readonly label: string;
  readonly detail?: string;
}

export interface TextEditorMarkdownMentionCandidate extends TextEditorMarkdownReferenceCandidateBase {
  readonly kind: 'mention';
}

export interface TextEditorMarkdownResourceCandidate extends TextEditorMarkdownReferenceCandidateBase {
  readonly kind: 'resource';
  readonly target: string;
  readonly embeddable: boolean;
}

export type TextEditorMarkdownReferenceCandidate =
  TextEditorMarkdownMentionCandidate | TextEditorMarkdownResourceCandidate;

export interface TextEditorMarkdownReferenceSearchRequest {
  readonly requestId: string;
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly editSequence: number;
  readonly kind: TextEditorMarkdownReferenceQueryKind;
  readonly query: string;
  readonly limit: number;
}

export type TextEditorMarkdownReferenceDiagnosticCode =
  | 'text-editor-markdown-reference-contributor-failed'
  | 'text-editor-markdown-reference-invalid-candidate'
  | 'text-editor-markdown-reference-duplicate-candidate';

export interface TextEditorMarkdownReferenceDiagnostic {
  readonly code: TextEditorMarkdownReferenceDiagnosticCode;
  readonly source: TextEditorMarkdownReferenceSource;
  readonly candidateRef?: TextEditorMarkdownReferenceIdentity;
}

export interface TextEditorMarkdownReferenceSearchProjection {
  readonly requestId: string;
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly editSequence: number;
  readonly kind: TextEditorMarkdownReferenceQueryKind;
  readonly query: string;
  readonly candidates: readonly TextEditorMarkdownReferenceCandidate[];
  readonly diagnostics: readonly TextEditorMarkdownReferenceDiagnostic[];
}

export class TextEditorMarkdownReferenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextEditorMarkdownReferenceContractError';
  }
}

export function assertTextEditorMarkdownReferenceSearchRequest(
  request: TextEditorMarkdownReferenceSearchRequest,
): void {
  requireIdentity(request.requestId, 'request');
  requireIdentity(request.sessionId, 'session');
  if (!Number.isSafeInteger(request.editSequence) || request.editSequence < 0) {
    throw new TextEditorMarkdownReferenceContractError(
      'Text Editor Markdown reference edit sequence must be a non-negative safe integer.',
    );
  }
  if (!isQueryKind(request.kind)) {
    throw new TextEditorMarkdownReferenceContractError(
      'Text Editor Markdown reference query kind is invalid.',
    );
  }
  if (typeof request.query !== 'string' || request.query.length > 200) {
    throw new TextEditorMarkdownReferenceContractError(
      'Text Editor Markdown reference query must contain at most 200 UTF-16 code units.',
    );
  }
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 50) {
    throw new TextEditorMarkdownReferenceContractError(
      'Text Editor Markdown reference limit must be between 1 and 50.',
    );
  }
  assertTextDocumentIdentity(request.identity);
}

export function isTextEditorMarkdownReferenceCandidate(
  value: unknown,
): value is TextEditorMarkdownReferenceCandidate {
  if (!isRecord(value)) return false;
  if (!isReferenceSource(value['source']) || !isReferenceIdentity(value['ref'])) return false;
  if (typeof value['label'] !== 'string' || value['label'].trim().length === 0) return false;
  if (value['detail'] !== undefined && typeof value['detail'] !== 'string') return false;
  if (value['kind'] === 'mention') {
    return hasOnlyKeys(value, ['kind', 'source', 'ref', 'label', 'detail']);
  }
  if (value['kind'] !== 'resource') return false;
  if (
    !hasOnlyKeys(value, ['kind', 'source', 'ref', 'label', 'detail', 'target', 'embeddable']) ||
    typeof value['target'] !== 'string' ||
    typeof value['embeddable'] !== 'boolean'
  ) {
    return false;
  }
  const path = value['target'].split('#', 1)[0];
  if (!path) return false;
  const locator = validateContentLocator({ kind: 'workspace-file', path });
  return locator.ok && locator.locator.kind === 'workspace-file';
}

export function textEditorMarkdownReferenceIdentityKey(
  source: TextEditorMarkdownReferenceSource,
  ref: TextEditorMarkdownReferenceIdentity,
): string {
  return JSON.stringify([source, ref.namespace ?? '', ref.kind, ref.id]);
}

function assertTextDocumentIdentity(identity: TextDocumentIdentity): void {
  if (!isRecord(identity)) {
    throw new TextEditorMarkdownReferenceContractError(
      'Text Editor Markdown reference document identity is invalid.',
    );
  }
  requireIdentity(identity.workspaceId, 'Workspace');
  requireIdentity(identity.documentId, 'document');
  if (!isRecord(identity.owner) || identity.owner.kind !== 'window') {
    throw new TextEditorMarkdownReferenceContractError(
      'Text Editor Markdown reference owner must be a Window.',
    );
  }
  requireIdentity(identity.owner.windowId, 'Window');
  requireIdentity(identity.owner.projectId, 'Project');
  const locator = validateContentLocator(identity.locator);
  if (
    !locator.ok ||
    locator.locator.kind !== 'workspace-file' ||
    locator.locator.path !== identity.documentId
  ) {
    throw new TextEditorMarkdownReferenceContractError(
      'Text Editor Markdown reference document locator does not match its identity.',
    );
  }
}

function isReferenceIdentity(value: unknown): value is TextEditorMarkdownReferenceIdentity {
  if (!isRecord(value) || !hasOnlyKeys(value, ['kind', 'id', 'namespace'])) return false;
  return (
    isNonEmptyString(value['kind']) &&
    isNonEmptyString(value['id']) &&
    (value['namespace'] === undefined || isNonEmptyString(value['namespace']))
  );
}

function isQueryKind(value: unknown): value is TextEditorMarkdownReferenceQueryKind {
  return value === 'mention' || value === 'resource-link' || value === 'resource-embed';
}

function isReferenceSource(value: unknown): value is TextEditorMarkdownReferenceSource {
  return value === 'workspace-file' || value === 'entity' || value === 'asset';
}

function requireIdentity(value: unknown, label: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new TextEditorMarkdownReferenceContractError(
      `Text Editor Markdown reference ${label} identity is required.`,
    );
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}
