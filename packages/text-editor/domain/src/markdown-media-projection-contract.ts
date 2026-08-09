import { isHostProjectedRuntimeValue, validateContentLocator } from '@neko/content';
import type { TextDocumentIdentity } from './contracts';

export type TextEditorMarkdownMediaKind = 'image' | 'audio' | 'video';
export type TextEditorMarkdownMediaTokenKind = 'commonmark-image' | 'resource-embed';

export interface TextEditorMarkdownMediaToken {
  readonly kind: TextEditorMarkdownMediaTokenKind;
  readonly from: number;
  readonly to: number;
  readonly target: string;
  readonly altText?: string;
}

export interface PrepareTextEditorMarkdownMediaRequest {
  readonly requestId: string;
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly editSequence: number;
  readonly surfaceId: string;
  readonly token: TextEditorMarkdownMediaToken;
}

export interface ReleaseTextEditorMarkdownMediaRequest {
  readonly requestId: string;
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly surfaceId: string;
  readonly leaseId: string;
}

export interface TextEditorMarkdownMediaDescriptor {
  readonly leaseId: string;
  readonly kind: TextEditorMarkdownMediaKind;
  readonly renderUri: string;
  readonly contentType: string;
  readonly displayName: string;
  readonly byteLength?: number;
}

export type TextEditorMarkdownMediaDiagnosticCode =
  | 'text-editor-markdown-media-missing'
  | 'text-editor-markdown-media-ambiguous'
  | 'text-editor-markdown-media-unauthorized'
  | 'text-editor-markdown-media-unsupported'
  | 'text-editor-markdown-media-projection-failed'
  | 'text-editor-markdown-media-stale-surface';

interface TextEditorMarkdownMediaProjectionBase {
  readonly requestId: string;
  readonly identity: TextDocumentIdentity;
  readonly sessionId: string;
  readonly editSequence: number;
  readonly surfaceId: string;
  readonly token: TextEditorMarkdownMediaToken;
}

export type TextEditorMarkdownMediaProjection =
  | (TextEditorMarkdownMediaProjectionBase & {
      readonly status: 'ready';
      readonly descriptor: TextEditorMarkdownMediaDescriptor;
    })
  | (TextEditorMarkdownMediaProjectionBase & {
      readonly status: 'unavailable';
      readonly diagnostic: {
        readonly code: TextEditorMarkdownMediaDiagnosticCode;
      };
    });

export class TextEditorMarkdownMediaContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextEditorMarkdownMediaContractError';
  }
}

export function assertPrepareTextEditorMarkdownMediaRequest(
  request: PrepareTextEditorMarkdownMediaRequest,
): void {
  requireIdentity(request.requestId, 'request');
  assertDocumentAssociation(request.identity, request.sessionId);
  requireIdentity(request.surfaceId, 'surface');
  requireEditSequence(request.editSequence);
  assertToken(request.token);
}

export function assertReleaseTextEditorMarkdownMediaRequest(
  request: ReleaseTextEditorMarkdownMediaRequest,
): void {
  requireIdentity(request.requestId, 'request');
  assertDocumentAssociation(request.identity, request.sessionId);
  requireIdentity(request.surfaceId, 'surface');
  requireIdentity(request.leaseId, 'lease');
}

export function assertTextEditorMarkdownMediaProjection(
  request: PrepareTextEditorMarkdownMediaRequest,
  projection: TextEditorMarkdownMediaProjection,
): void {
  assertPrepareTextEditorMarkdownMediaRequest(request);
  if (
    projection.requestId !== request.requestId ||
    projection.sessionId !== request.sessionId ||
    projection.editSequence !== request.editSequence ||
    projection.surfaceId !== request.surfaceId ||
    !sameDocumentIdentity(projection.identity, request.identity) ||
    !sameToken(projection.token, request.token)
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media projection does not match its request.',
    );
  }
  if (projection.status === 'unavailable') {
    if (!isDiagnosticCode(projection.diagnostic.code)) {
      throw new TextEditorMarkdownMediaContractError(
        'Text Editor Markdown media diagnostic code is invalid.',
      );
    }
    return;
  }
  assertDescriptor(projection.descriptor);
}

function assertDescriptor(descriptor: TextEditorMarkdownMediaDescriptor): void {
  requireIdentity(descriptor.leaseId, 'lease');
  if (descriptor.kind !== 'image' && descriptor.kind !== 'audio' && descriptor.kind !== 'video') {
    throw new TextEditorMarkdownMediaContractError('Text Editor Markdown media kind is invalid.');
  }
  if (!isHostProjectedRuntimeValue(descriptor.renderUri)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media requires a Host-projected runtime URI.',
    );
  }
  if (!isNonEmptyString(descriptor.contentType) || !isNonEmptyString(descriptor.displayName)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media presentation metadata is invalid.',
    );
  }
  if (
    descriptor.byteLength !== undefined &&
    (!Number.isSafeInteger(descriptor.byteLength) || descriptor.byteLength < 0)
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media byte length is invalid.',
    );
  }
}

function assertToken(token: TextEditorMarkdownMediaToken): void {
  if (token.kind !== 'commonmark-image' && token.kind !== 'resource-embed') {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media token kind is invalid.',
    );
  }
  if (
    !Number.isSafeInteger(token.from) ||
    !Number.isSafeInteger(token.to) ||
    token.from < 0 ||
    token.to <= token.from
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media token range is invalid.',
    );
  }
  if (!isNonEmptyString(token.target)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media target is required.',
    );
  }
  if (token.altText !== undefined && typeof token.altText !== 'string') {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media alt text is invalid.',
    );
  }
}

function assertDocumentAssociation(identity: TextDocumentIdentity, sessionId: string): void {
  requireIdentity(sessionId, 'session');
  requireIdentity(identity.workspaceId, 'Workspace');
  requireIdentity(identity.documentId, 'document');
  if (identity.owner.kind !== 'window') {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media owner must be a Window.',
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
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media document locator does not match its identity.',
    );
  }
}

function sameDocumentIdentity(left: TextDocumentIdentity, right: TextDocumentIdentity): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.documentId === right.documentId &&
    left.locator.path === right.locator.path &&
    left.owner.windowId === right.owner.windowId &&
    left.owner.projectId === right.owner.projectId
  );
}

function sameToken(
  left: TextEditorMarkdownMediaToken,
  right: TextEditorMarkdownMediaToken,
): boolean {
  return (
    left.kind === right.kind &&
    left.from === right.from &&
    left.to === right.to &&
    left.target === right.target &&
    left.altText === right.altText
  );
}

function isDiagnosticCode(value: unknown): value is TextEditorMarkdownMediaDiagnosticCode {
  return (
    value === 'text-editor-markdown-media-missing' ||
    value === 'text-editor-markdown-media-ambiguous' ||
    value === 'text-editor-markdown-media-unauthorized' ||
    value === 'text-editor-markdown-media-unsupported' ||
    value === 'text-editor-markdown-media-projection-failed' ||
    value === 'text-editor-markdown-media-stale-surface'
  );
}

function requireEditSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media edit sequence must be a non-negative safe integer.',
    );
  }
}

function requireIdentity(value: unknown, label: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new TextEditorMarkdownMediaContractError(
      `Text Editor Markdown media ${label} identity is required.`,
    );
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
