import { validateContentLocator } from '@neko/content';
import { parseFountainDocument } from '@neko/screenplay-domain';
import { isTextDocumentDiagnosticCode } from './contracts';
import {
  assertTextEditorMarkdownReferenceSearchProjection,
  assertTextEditorMarkdownReferenceSearchRequest,
  type TextEditorMarkdownReferenceSearchProjection,
  type TextEditorMarkdownReferenceSearchRequest,
} from './markdown-reference-catalog-contract';
import type {
  ApplyTextDocumentEditsCommand,
  TextDocumentCloseDecision,
  TextDocumentDiagnostic,
  TextDocumentIdentity,
  TextDocumentProjection,
} from './contracts';

export const TEXT_EDITOR_HOST_ROUTES = {
  projectionGet: 'projection.get',
  editsApply: 'edits.apply',
  jsonFormat: 'json.format',
  save: 'save',
  reload: 'reload',
  referencesSearch: 'references.search',
  close: 'close',
} as const;

export const TEXT_EDITOR_HOST_CHANNELS = {
  execute: 'openneko:text-editor:execute',
  projectionEvent: 'openneko:text-editor:projection:event',
} as const;

export interface OpenNekoDesktopTextEditorBridge {
  readonly textEditor: {
    execute(request: TextEditorHostRequest): Promise<TextEditorHostResult>;
    subscribe(
      identity: TextEditorRuntimeIdentity,
      listener: (event: TextEditorProjectionEvent) => void,
    ): () => void;
  };
}

export type TextEditorHostRoute =
  (typeof TEXT_EDITOR_HOST_ROUTES)[keyof typeof TEXT_EDITOR_HOST_ROUTES];

export interface TextEditorRuntimeIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly documentId: string;
  readonly sessionId: string;
  readonly rendererSessionId: string;
}

interface TextEditorHostRequestBase {
  readonly route: TextEditorHostRoute;
  readonly requestId: string;
  readonly identity: TextEditorRuntimeIdentity;
}

export type TextEditorHostRequest =
  | (TextEditorHostRequestBase & {
      readonly route: typeof TEXT_EDITOR_HOST_ROUTES.projectionGet;
    })
  | (TextEditorHostRequestBase & {
      readonly route: typeof TEXT_EDITOR_HOST_ROUTES.editsApply;
      readonly expectedEditSequence: number;
      readonly changes: ApplyTextDocumentEditsCommand['changes'];
    })
  | (TextEditorHostRequestBase & {
      readonly route: typeof TEXT_EDITOR_HOST_ROUTES.jsonFormat;
      readonly expectedEditSequence: number;
    })
  | (TextEditorHostRequestBase & {
      readonly route: typeof TEXT_EDITOR_HOST_ROUTES.save;
      readonly expectedEditSequence: number;
    })
  | (TextEditorHostRequestBase & {
      readonly route: typeof TEXT_EDITOR_HOST_ROUTES.reload;
      readonly confirmDirty: boolean;
    })
  | (TextEditorHostRequestBase & {
      readonly route: typeof TEXT_EDITOR_HOST_ROUTES.referencesSearch;
      readonly search: TextEditorMarkdownReferenceSearchRequest;
    })
  | (TextEditorHostRequestBase & {
      readonly route: typeof TEXT_EDITOR_HOST_ROUTES.close;
      readonly decision: TextDocumentCloseDecision;
    });

export type TextEditorHostResult =
  | {
      readonly requestId: string;
      readonly identity: TextEditorRuntimeIdentity;
      readonly status: 'ready';
      readonly projection: TextDocumentProjection;
    }
  | {
      readonly requestId: string;
      readonly identity: TextEditorRuntimeIdentity;
      readonly status: 'closed' | 'cancelled';
    }
  | {
      readonly requestId: string;
      readonly identity: TextEditorRuntimeIdentity;
      readonly status: 'references-ready';
      readonly projection: TextEditorMarkdownReferenceSearchProjection;
    }
  | {
      readonly requestId: string;
      readonly identity: TextEditorRuntimeIdentity;
      readonly status: 'references-discarded';
      readonly reason: 'cancelled' | 'stale';
    }
  | {
      readonly requestId: string;
      readonly identity: TextEditorRuntimeIdentity;
      readonly status: 'rejected';
      readonly diagnostic: TextDocumentDiagnostic;
    };

export interface TextEditorProjectionEvent {
  readonly sequence: number;
  readonly identity: TextEditorRuntimeIdentity;
  readonly projection: TextDocumentProjection;
}

export class TextEditorBridgeContractError extends Error {
  readonly code = 'invalid-text-editor-host-payload';

  constructor(message: string) {
    super(message);
    this.name = 'TextEditorBridgeContractError';
  }
}

export function parseTextEditorHostRequest(value: unknown): TextEditorHostRequest {
  const record = requireRecord(value, 'Text Editor Host request must be an object.');
  const route = requireRoute(record['route']);
  const base = {
    requestId: requireIdentity(record['requestId'], 'Text Editor request identity'),
    identity: parseTextEditorRuntimeIdentity(record['identity']),
  };
  switch (route) {
    case TEXT_EDITOR_HOST_ROUTES.projectionGet:
      requireExactKeys(record, ['route', 'requestId', 'identity']);
      return { ...base, route };
    case TEXT_EDITOR_HOST_ROUTES.editsApply:
      requireExactKeys(record, [
        'route',
        'requestId',
        'identity',
        'expectedEditSequence',
        'changes',
      ]);
      return {
        ...base,
        route,
        expectedEditSequence: requireEditSequence(record['expectedEditSequence']),
        changes: requireChanges(record['changes']),
      };
    case TEXT_EDITOR_HOST_ROUTES.jsonFormat:
    case TEXT_EDITOR_HOST_ROUTES.save:
      requireExactKeys(record, ['route', 'requestId', 'identity', 'expectedEditSequence']);
      return {
        ...base,
        route,
        expectedEditSequence: requireEditSequence(record['expectedEditSequence']),
      };
    case TEXT_EDITOR_HOST_ROUTES.reload:
      requireExactKeys(record, ['route', 'requestId', 'identity', 'confirmDirty']);
      if (typeof record['confirmDirty'] !== 'boolean')
        throw invalid('Reload confirmation is invalid.');
      return { ...base, route, confirmDirty: record['confirmDirty'] };
    case TEXT_EDITOR_HOST_ROUTES.referencesSearch: {
      requireExactKeys(record, ['route', 'requestId', 'identity', 'search']);
      const search = record['search'] as TextEditorMarkdownReferenceSearchRequest;
      assertTextEditorMarkdownReferenceSearchRequest(search);
      requireReferenceSearchOwner(base.requestId, base.identity, search);
      return { ...base, route, search };
    }
    case TEXT_EDITOR_HOST_ROUTES.close: {
      requireExactKeys(record, ['route', 'requestId', 'identity', 'decision']);
      const decision = record['decision'];
      if (decision !== 'save' && decision !== 'discard' && decision !== 'cancel') {
        throw invalid('Text Editor close decision is invalid.');
      }
      return { ...base, route, decision };
    }
  }
}

export function parseTextEditorHostResult(value: unknown): TextEditorHostResult {
  const record = requireRecord(value, 'Text Editor Host result must be an object.');
  const status = record['status'];
  if (status === 'ready') {
    requireExactKeys(record, ['requestId', 'identity', 'status', 'projection']);
    return {
      requestId: requireIdentity(record['requestId'], 'Text Editor request identity'),
      identity: parseTextEditorRuntimeIdentity(record['identity']),
      status,
      projection: parseTextDocumentProjection(record['projection']),
    };
  }
  if (status === 'closed' || status === 'cancelled') {
    requireExactKeys(record, ['requestId', 'identity', 'status']);
    return {
      requestId: requireIdentity(record['requestId'], 'Text Editor request identity'),
      identity: parseTextEditorRuntimeIdentity(record['identity']),
      status,
    };
  }
  if (status === 'references-ready') {
    requireExactKeys(record, ['requestId', 'identity', 'status', 'projection']);
    const identity = parseTextEditorRuntimeIdentity(record['identity']);
    const projection = record['projection'];
    assertTextEditorMarkdownReferenceSearchProjection(projection);
    requireReferenceProjectionOwner(identity, projection);
    return {
      requestId: requireIdentity(record['requestId'], 'Text Editor request identity'),
      identity,
      status,
      projection,
    };
  }
  if (status === 'references-discarded') {
    requireExactKeys(record, ['requestId', 'identity', 'status', 'reason']);
    if (record['reason'] !== 'cancelled' && record['reason'] !== 'stale') {
      throw invalid('Text Editor Markdown reference discard reason is invalid.');
    }
    return {
      requestId: requireIdentity(record['requestId'], 'Text Editor request identity'),
      identity: parseTextEditorRuntimeIdentity(record['identity']),
      status,
      reason: record['reason'],
    };
  }
  if (status === 'rejected') {
    requireExactKeys(record, ['requestId', 'identity', 'status', 'diagnostic']);
    if (!isTextDocumentDiagnostic(record['diagnostic'])) {
      throw invalid('Text Editor Host rejection diagnostic is invalid.');
    }
    return {
      requestId: requireIdentity(record['requestId'], 'Text Editor request identity'),
      identity: parseTextEditorRuntimeIdentity(record['identity']),
      status,
      diagnostic: record['diagnostic'],
    };
  }
  throw invalid('Text Editor Host result status is invalid.');
}

export function parseTextEditorProjectionEvent(value: unknown): TextEditorProjectionEvent {
  const record = requireRecord(value, 'Text Editor projection event must be an object.');
  requireExactKeys(record, ['sequence', 'identity', 'projection']);
  const sequence = requirePositiveSequence(record['sequence']);
  const identity = parseTextEditorRuntimeIdentity(record['identity']);
  const projection = parseTextDocumentProjection(record['projection']);
  if (
    projection.sessionId !== identity.sessionId ||
    projection.identity.workspaceId !== identity.workspaceId ||
    projection.identity.documentId !== identity.documentId ||
    projection.identity.owner.kind !== 'window' ||
    projection.identity.owner.windowId !== identity.windowId ||
    projection.identity.owner.projectId !== identity.projectId
  ) {
    throw invalid('Text Editor projection event owner identity does not match.');
  }
  return { sequence, identity, projection };
}

export function parseTextEditorRuntimeIdentity(value: unknown): TextEditorRuntimeIdentity {
  const record = requireRecord(value, 'Text Editor runtime identity must be an object.');
  requireExactKeys(record, [
    'projectId',
    'workspaceId',
    'windowId',
    'viewId',
    'viewInstanceId',
    'documentId',
    'sessionId',
    'rendererSessionId',
  ]);
  return {
    projectId: requireIdentity(record['projectId'], 'Text Editor Project identity'),
    workspaceId: requireIdentity(record['workspaceId'], 'Text Editor Workspace identity'),
    windowId: requireIdentity(record['windowId'], 'Text Editor Window identity'),
    viewId: requireIdentity(record['viewId'], 'Text Editor View identity'),
    viewInstanceId: requireIdentity(record['viewInstanceId'], 'Text Editor View instance identity'),
    documentId: requireIdentity(record['documentId'], 'Text Editor document identity', true),
    sessionId: requireIdentity(record['sessionId'], 'Text Editor session identity'),
    rendererSessionId: requireIdentity(
      record['rendererSessionId'],
      'Text Editor renderer identity',
    ),
  };
}

export function sameTextEditorRuntimeIdentity(
  left: TextEditorRuntimeIdentity,
  right: TextEditorRuntimeIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewInstanceId === right.viewInstanceId &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.rendererSessionId === right.rendererSessionId
  );
}

function parseTextDocumentProjection(value: unknown): TextDocumentProjection {
  const record = requireRecord(value, 'Text Document projection must be an object.');
  const identity = parseTextDocumentIdentity(record['identity']);
  const mode = record['mode'];
  if (mode !== 'markdown' && mode !== 'json' && mode !== 'fountain' && mode !== 'plain-text') {
    throw invalid('Text Document mode is invalid.');
  }
  if (
    typeof record['source'] !== 'string' ||
    typeof record['dirty'] !== 'boolean' ||
    typeof record['conflict'] !== 'boolean'
  ) {
    throw invalid('Text Document projection state is invalid.');
  }
  const diagnostics = Array.isArray(record['diagnostics']) ? record['diagnostics'] : undefined;
  if (!diagnostics || diagnostics.some((entry) => !isTextDocumentDiagnostic(entry))) {
    throw invalid('Text Document diagnostics are invalid.');
  }
  return {
    identity,
    sessionId: requireIdentity(record['sessionId'], 'Text Document session identity'),
    editSequence: requireEditSequence(record['editSequence']),
    mode,
    source: record['source'],
    dirty: record['dirty'],
    conflict: record['conflict'],
    diagnostics,
    ...('screenplay' in record
      ? { screenplay: requireScreenplayProjection(record['screenplay']) }
      : {}),
  };
}

function parseTextDocumentIdentity(value: unknown): TextDocumentIdentity {
  const record = requireRecord(value, 'Text Document identity must be an object.');
  requireExactKeys(record, ['owner', 'workspaceId', 'documentId', 'locator']);
  const owner = parseTextDocumentSessionOwner(record['owner']);
  const locator = validateContentLocator(record['locator']);
  if (!locator.ok || locator.locator.kind !== 'workspace-file') {
    throw invalid('Text Document locator must be an authorized Workspace file.');
  }
  return {
    owner,
    workspaceId: requireIdentity(record['workspaceId'], 'Text Document Workspace identity'),
    documentId: requireIdentity(record['documentId'], 'Text Document identity', true),
    locator: locator.locator,
  };
}

function parseTextDocumentSessionOwner(value: unknown): TextDocumentIdentity['owner'] {
  const record = requireRecord(value, 'Text Document session owner must be an object.');
  if (record['kind'] !== 'window') {
    throw invalid('Desktop Text Document session owner must be a Window.');
  }
  requireExactKeys(record, ['kind', 'windowId', 'projectId']);
  return {
    kind: 'window',
    windowId: requireIdentity(record['windowId'], 'Text Document Window identity'),
    projectId: requireIdentity(record['projectId'], 'Text Document Project identity'),
  };
}

function requireChanges(value: unknown): ApplyTextDocumentEditsCommand['changes'] {
  if (!Array.isArray(value) || value.length === 0)
    throw invalid('Text Document changes are invalid.');
  return value.map((entry) => {
    const record = requireRecord(entry, 'Text Document change must be an object.');
    requireExactKeys(record, ['from', 'to', 'insert']);
    if (
      !Number.isSafeInteger(record['from']) ||
      !Number.isSafeInteger(record['to']) ||
      typeof record['insert'] !== 'string'
    ) {
      throw invalid('Text Document change range is invalid.');
    }
    return { from: Number(record['from']), to: Number(record['to']), insert: record['insert'] };
  });
}

function isTextDocumentDiagnostic(
  value: unknown,
): value is TextDocumentProjection['diagnostics'][number] {
  if (!isRecord(value)) return false;
  return (
    isTextDocumentDiagnosticCode(value['code']) &&
    (value['severity'] === 'warning' || value['severity'] === 'error')
  );
}

function requireScreenplayProjection(
  value: unknown,
): NonNullable<TextDocumentProjection['screenplay']> {
  const record = requireRecord(value, 'Screenplay projection must be an object.');
  if (typeof record['sourceId'] !== 'string' || typeof record['source'] !== 'string') {
    throw invalid('Screenplay projection is invalid.');
  }
  const parsed = parseFountainDocument(record['source'], record['sourceId'], {
    maxSourceCodeUnits: Math.max(1, record['source'].length),
  });
  if (parsed.status !== 'ready' || JSON.stringify(parsed.document) !== JSON.stringify(record)) {
    throw invalid('Screenplay projection does not match its canonical source.');
  }
  return parsed.document;
}

function requireRoute(value: unknown): TextEditorHostRoute {
  switch (value) {
    case TEXT_EDITOR_HOST_ROUTES.projectionGet:
    case TEXT_EDITOR_HOST_ROUTES.editsApply:
    case TEXT_EDITOR_HOST_ROUTES.jsonFormat:
    case TEXT_EDITOR_HOST_ROUTES.save:
    case TEXT_EDITOR_HOST_ROUTES.reload:
    case TEXT_EDITOR_HOST_ROUTES.referencesSearch:
    case TEXT_EDITOR_HOST_ROUTES.close:
      return value;
  }
  throw invalid('Text Editor Host route is invalid.');
}

function requireReferenceSearchOwner(
  requestId: string,
  identity: TextEditorRuntimeIdentity,
  search: TextEditorMarkdownReferenceSearchRequest,
): void {
  if (
    search.requestId !== requestId ||
    search.sessionId !== identity.sessionId ||
    search.identity.workspaceId !== identity.workspaceId ||
    search.identity.documentId !== identity.documentId ||
    search.identity.owner.kind !== 'window' ||
    search.identity.owner.windowId !== identity.windowId ||
    search.identity.owner.projectId !== identity.projectId
  ) {
    throw invalid('Text Editor Markdown reference search owner identity does not match.');
  }
}

function requireReferenceProjectionOwner(
  identity: TextEditorRuntimeIdentity,
  projection: TextEditorMarkdownReferenceSearchProjection,
): void {
  requireReferenceSearchOwner(projection.requestId, identity, {
    requestId: projection.requestId,
    identity: projection.identity,
    sessionId: projection.sessionId,
    editSequence: projection.editSequence,
    kind: projection.kind,
    query: projection.query,
    limit: Math.max(1, Math.min(50, projection.candidates.length || 1)),
  });
}

function requireEditSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
    throw invalid('Text Document editSequence is invalid.');
  }
  return value;
}

function requirePositiveSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) {
    throw invalid('Text Editor projection event sequence is invalid.');
  }
  return value;
}

function requireIdentity(value: unknown, label: string, allowPath = false): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('://') ||
    (!allowPath && value.includes('/'))
  ) {
    throw invalid(`${label} is invalid.`);
  }
  return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalid(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw invalid('Text Editor Host payload contains unsupported fields.');
  }
}

function invalid(message: string): TextEditorBridgeContractError {
  return new TextEditorBridgeContractError(message);
}
