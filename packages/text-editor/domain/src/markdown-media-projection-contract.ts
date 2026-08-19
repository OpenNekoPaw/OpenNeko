import {
  isHostProjectedRuntimeValue,
  isWorkspaceFileContentLocator,
  normalizeWorkspaceContentPath,
  validateContentLocator,
} from '@neko/content';
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
  request: unknown,
): asserts request is PrepareTextEditorMarkdownMediaRequest {
  if (
    !isRecord(request) ||
    !hasExactKeys(request, [
      'requestId',
      'identity',
      'sessionId',
      'editSequence',
      'surfaceId',
      'token',
    ])
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media preparation request is invalid.',
    );
  }
  validatePrepareFields(request as unknown as PrepareTextEditorMarkdownMediaRequest);
}

export function assertReleaseTextEditorMarkdownMediaRequest(
  request: unknown,
): asserts request is ReleaseTextEditorMarkdownMediaRequest {
  if (
    !isRecord(request) ||
    !hasExactKeys(request, ['requestId', 'identity', 'sessionId', 'surfaceId', 'leaseId'])
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media release request is invalid.',
    );
  }
  validateReleaseFields(request as unknown as ReleaseTextEditorMarkdownMediaRequest);
}

export function assertTextEditorMarkdownMediaProjection(
  request: PrepareTextEditorMarkdownMediaRequest,
  projection: unknown,
): asserts projection is TextEditorMarkdownMediaProjection {
  assertPrepareTextEditorMarkdownMediaRequest(request);
  if (!isRecord(projection)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media projection is invalid.',
    );
  }
  const status = projection['status'];
  const expectedKeys =
    status === 'ready'
      ? [
          'requestId',
          'identity',
          'sessionId',
          'editSequence',
          'surfaceId',
          'token',
          'status',
          'descriptor',
        ]
      : [
          'requestId',
          'identity',
          'sessionId',
          'editSequence',
          'surfaceId',
          'token',
          'status',
          'diagnostic',
        ];
  if ((status !== 'ready' && status !== 'unavailable') || !hasExactKeys(projection, expectedKeys)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media projection is invalid.',
    );
  }
  const value = projection as unknown as TextEditorMarkdownMediaProjection;
  validatePrepareFields(value);
  if (
    value.requestId !== request.requestId ||
    value.sessionId !== request.sessionId ||
    value.editSequence !== request.editSequence ||
    value.surfaceId !== request.surfaceId ||
    !sameDocumentIdentity(value.identity, request.identity) ||
    !sameToken(value.token, request.token)
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media projection does not match its request.',
    );
  }
  if (value.status === 'unavailable') {
    if (
      !isRecord(value.diagnostic) ||
      !hasExactKeys(value.diagnostic, ['code']) ||
      !isDiagnosticCode(value.diagnostic.code)
    ) {
      throw new TextEditorMarkdownMediaContractError(
        'Text Editor Markdown media diagnostic code is invalid.',
      );
    }
    return;
  }
  assertDescriptor(value.descriptor);
}

function assertDescriptor(
  descriptor: unknown,
): asserts descriptor is TextEditorMarkdownMediaDescriptor {
  if (
    !isRecord(descriptor) ||
    !hasExactKeys(descriptor, [
      'leaseId',
      'kind',
      'renderUri',
      'contentType',
      'displayName',
      'byteLength',
    ])
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media descriptor is invalid.',
    );
  }
  const value = descriptor as unknown as TextEditorMarkdownMediaDescriptor;
  requireIdentity(value.leaseId, 'lease');
  if (value.kind !== 'image' && value.kind !== 'audio' && value.kind !== 'video') {
    throw new TextEditorMarkdownMediaContractError('Text Editor Markdown media kind is invalid.');
  }
  if (!isHostProjectedRuntimeValue(value.renderUri) || value.renderUri.startsWith('data:')) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media requires a Host-projected runtime URI.',
    );
  }
  if (!isNonEmptyString(value.contentType) || !isNonEmptyString(value.displayName)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media presentation metadata is invalid.',
    );
  }
  if (
    value.byteLength !== undefined &&
    (!Number.isSafeInteger(value.byteLength) || value.byteLength < 0)
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media byte length is invalid.',
    );
  }
}

function assertToken(token: unknown): asserts token is TextEditorMarkdownMediaToken {
  if (!isRecord(token) || !hasExactKeys(token, ['kind', 'from', 'to', 'target', 'altText'])) {
    throw new TextEditorMarkdownMediaContractError('Text Editor Markdown media token is invalid.');
  }
  const value = token as unknown as TextEditorMarkdownMediaToken;
  if (value.kind !== 'commonmark-image' && value.kind !== 'resource-embed') {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media token kind is invalid.',
    );
  }
  if (
    !Number.isSafeInteger(value.from) ||
    !Number.isSafeInteger(value.to) ||
    value.from < 0 ||
    value.to <= value.from
  ) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media token range is invalid.',
    );
  }
  if (!isNonEmptyString(value.target)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media target is required.',
    );
  }
  if (normalizeWorkspaceContentPath(value.target) !== value.target) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media target must be normalized and Workspace-relative.',
    );
  }
  if (value.altText !== undefined && typeof value.altText !== 'string') {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media alt text is invalid.',
    );
  }
}

function validatePrepareFields(request: PrepareTextEditorMarkdownMediaRequest): void {
  requireIdentity(request.requestId, 'request');
  assertDocumentAssociation(request.identity, request.sessionId);
  requireIdentity(request.surfaceId, 'surface');
  requireEditSequence(request.editSequence);
  assertToken(request.token);
}

function validateReleaseFields(request: ReleaseTextEditorMarkdownMediaRequest): void {
  requireIdentity(request.requestId, 'request');
  assertDocumentAssociation(request.identity, request.sessionId);
  requireIdentity(request.surfaceId, 'surface');
  requireIdentity(request.leaseId, 'lease');
}

function assertDocumentAssociation(identity: unknown, sessionId: unknown): void {
  requireIdentity(sessionId, 'session');
  if (!isRecord(identity) || !isRecord(identity.owner)) {
    throw new TextEditorMarkdownMediaContractError(
      'Text Editor Markdown media document identity is invalid.',
    );
  }
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
    !isWorkspaceFileContentLocator(locator.locator) ||
    locator.locator.selector !== undefined ||
    locator.locator.file.path !== identity.documentId
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
    left.locator.file.path === right.locator.file.path &&
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(record);
  const allowed = keys.filter((key) => record[key] !== undefined);
  return actual.length === allowed.length && actual.every((key) => allowed.includes(key));
}
