import {
  validateContentLocator,
  type ContentIoDiagnosticCode,
  type ContentLocator,
} from '@neko/content-domain';
import type { CanvasHostRuntimeIdentity } from './canvas-host-runtime-contract';

export const CANVAS_TEXT_FILE_PREVIEW_MAX_BYTES = 64 * 1024;
export const CANVAS_TEXT_FILE_PREVIEW_MAX_CHARACTERS = 8_000;

export type CanvasTextFilePreviewKind = 'json' | 'markdown' | 'plain';

export type CanvasTextFilePreviewDiagnosticCode =
  | 'canvas-text-preview-invalid-json'
  | 'canvas-text-preview-invalid-utf8'
  | 'canvas-text-preview-missing'
  | 'canvas-text-preview-read-failed'
  | 'canvas-text-preview-stale-node'
  | 'canvas-text-preview-too-large'
  | 'canvas-text-preview-unauthorized'
  | 'canvas-text-preview-unavailable';

export interface CanvasTextFilePreviewRequest {
  readonly requestId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly nodeId: string;
  readonly locator: ContentLocator;
}

export type CanvasTextFilePreviewResult =
  | {
      readonly requestId: string;
      readonly nodeId: string;
      readonly status: 'ready';
      readonly kind: CanvasTextFilePreviewKind;
      readonly text: string;
      readonly truncated: boolean;
      readonly empty: boolean;
    }
  | {
      readonly requestId: string;
      readonly nodeId: string;
      readonly status: 'unsupported';
    }
  | {
      readonly requestId: string;
      readonly nodeId: string;
      readonly status: 'unavailable';
      readonly diagnostic: { readonly code: CanvasTextFilePreviewDiagnosticCode };
    };

export function createCanvasTextFilePreviewRequest(
  input: CanvasTextFilePreviewRequest,
): CanvasTextFilePreviewRequest {
  return parseCanvasTextFilePreviewRequest(input);
}

export function parseCanvasTextFilePreviewRequest(value: unknown): CanvasTextFilePreviewRequest {
  const record = requireRecord(value, 'Canvas text-file preview request must be an object.');
  requireExactKeys(record, ['requestId', 'identity', 'nodeId', 'locator']);
  const locator = validateContentLocator(record['locator']);
  if (!locator.ok) throw new Error('Canvas text-file preview locator is invalid.');
  return {
    requestId: requireIdentity(record['requestId'], 'request'),
    identity: parseIdentity(record['identity']),
    nodeId: requireIdentity(record['nodeId'], 'node'),
    locator: locator.locator,
  };
}

export function parseCanvasTextFilePreviewResult(
  value: unknown,
  expectedRequestId: string,
  expectedNodeId: string,
): CanvasTextFilePreviewResult {
  const record = requireRecord(value, 'Canvas text-file preview result must be an object.');
  const requestId = requireMatchingIdentity(record['requestId'], expectedRequestId, 'request');
  const nodeId = requireMatchingIdentity(record['nodeId'], expectedNodeId, 'node');
  if (record['status'] === 'ready') {
    requireExactKeys(record, [
      'requestId',
      'nodeId',
      'status',
      'kind',
      'text',
      'truncated',
      'empty',
    ]);
    const kind = record['kind'];
    if (kind !== 'json' && kind !== 'markdown' && kind !== 'plain') {
      throw new Error('Canvas text-file preview kind is invalid.');
    }
    if (typeof record['text'] !== 'string') {
      throw new Error('Canvas text-file preview text is invalid.');
    }
    if (typeof record['truncated'] !== 'boolean' || typeof record['empty'] !== 'boolean') {
      throw new Error('Canvas text-file preview state is invalid.');
    }
    if (record['empty'] !== (record['text'].length === 0)) {
      throw new Error('Canvas text-file preview empty state does not match its text.');
    }
    if (record['text'].length > CANVAS_TEXT_FILE_PREVIEW_MAX_CHARACTERS) {
      throw new Error('Canvas text-file preview text exceeds the presentation limit.');
    }
    return {
      requestId,
      nodeId,
      status: 'ready',
      kind,
      text: record['text'],
      truncated: record['truncated'],
      empty: record['empty'],
    };
  }
  if (record['status'] === 'unsupported') {
    requireExactKeys(record, ['requestId', 'nodeId', 'status']);
    return { requestId, nodeId, status: 'unsupported' };
  }
  if (record['status'] !== 'unavailable') {
    throw new Error('Canvas text-file preview status is invalid.');
  }
  requireExactKeys(record, ['requestId', 'nodeId', 'status', 'diagnostic']);
  const diagnostic = requireRecord(
    record['diagnostic'],
    'Canvas text-file preview diagnostic must be an object.',
  );
  requireExactKeys(diagnostic, ['code']);
  return {
    requestId,
    nodeId,
    status: 'unavailable',
    diagnostic: { code: requireDiagnosticCode(diagnostic['code']) },
  };
}

export function resolveCanvasTextFilePreviewKind(input: {
  readonly path: string;
  readonly mediaType?: string;
}): CanvasTextFilePreviewKind | undefined {
  const mediaType = normalizeMediaType(input.mediaType);
  if (mediaType === 'application/json' || mediaType?.endsWith('+json')) return 'json';
  if (mediaType === 'text/markdown' || mediaType === 'text/x-markdown') return 'markdown';
  if (mediaType?.startsWith('text/')) return 'plain';
  if (mediaType !== undefined) return undefined;

  const extension = fileExtension(input.path);
  if (extension === 'json') return 'json';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'txt' || extension === 'log' || extension === 'fountain') return 'plain';
  return undefined;
}

export function formatCanvasTextFilePreview(input: {
  readonly requestId: string;
  readonly nodeId: string;
  readonly kind: CanvasTextFilePreviewKind;
  readonly bytes: Uint8Array;
}): CanvasTextFilePreviewResult {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
  } catch {
    return unavailable(input, 'canvas-text-preview-invalid-utf8');
  }

  let text = source;
  if (input.kind === 'json') {
    try {
      text = JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      return unavailable(input, 'canvas-text-preview-invalid-json');
    }
  }
  const bounded = boundPreviewText(text);
  return {
    requestId: input.requestId,
    nodeId: input.nodeId,
    status: 'ready',
    kind: input.kind,
    text: bounded.text,
    truncated: bounded.truncated,
    empty: bounded.text.length === 0,
  };
}

export function mapContentDiagnosticToCanvasTextPreview(
  code: ContentIoDiagnosticCode,
): CanvasTextFilePreviewDiagnosticCode {
  switch (code) {
    case 'content-missing':
      return 'canvas-text-preview-missing';
    case 'content-too-large':
      return 'canvas-text-preview-too-large';
    case 'content-unauthorized':
      return 'canvas-text-preview-unauthorized';
    default:
      return 'canvas-text-preview-read-failed';
  }
}

export function createUnavailableCanvasTextFilePreview(input: {
  readonly requestId: string;
  readonly nodeId: string;
  readonly code: CanvasTextFilePreviewDiagnosticCode;
}): CanvasTextFilePreviewResult {
  return unavailable(input, input.code);
}

function boundPreviewText(text: string): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= CANVAS_TEXT_FILE_PREVIEW_MAX_CHARACTERS) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, CANVAS_TEXT_FILE_PREVIEW_MAX_CHARACTERS),
    truncated: true,
  };
}

function unavailable(
  input: { readonly requestId: string; readonly nodeId: string },
  code: CanvasTextFilePreviewDiagnosticCode,
): CanvasTextFilePreviewResult {
  return {
    requestId: input.requestId,
    nodeId: input.nodeId,
    status: 'unavailable',
    diagnostic: { code },
  };
}

function normalizeMediaType(value: string | undefined): string | undefined {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || undefined;
}

function fileExtension(path: string): string | undefined {
  const name = path.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  const separator = name?.lastIndexOf('.') ?? -1;
  return separator > 0 && name ? name.slice(separator + 1) : undefined;
}

function parseIdentity(value: unknown): CanvasHostRuntimeIdentity {
  const record = requireRecord(value, 'Canvas text-file preview identity must be an object.');
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
    projectId: requireIdentity(record['projectId'], 'Project'),
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    windowId: requireIdentity(record['windowId'], 'Window'),
    viewId: requireIdentity(record['viewId'], 'View'),
    viewInstanceId: requireIdentity(record['viewInstanceId'], 'View instance'),
    documentId: requireIdentity(record['documentId'], 'document'),
    sessionId: requireIdentity(record['sessionId'], 'session'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'renderer session'),
  };
}

function requireDiagnosticCode(value: unknown): CanvasTextFilePreviewDiagnosticCode {
  const codes: readonly CanvasTextFilePreviewDiagnosticCode[] = [
    'canvas-text-preview-invalid-json',
    'canvas-text-preview-invalid-utf8',
    'canvas-text-preview-missing',
    'canvas-text-preview-read-failed',
    'canvas-text-preview-stale-node',
    'canvas-text-preview-too-large',
    'canvas-text-preview-unauthorized',
    'canvas-text-preview-unavailable',
  ];
  const code = codes.find((candidate) => candidate === value);
  if (!code) throw new Error('Canvas text-file preview diagnostic code is invalid.');
  return code;
}

function requireMatchingIdentity(value: unknown, expected: string, label: string): string {
  const identity = requireIdentity(value, label);
  if (identity !== expected) {
    throw new Error(`Canvas text-file preview ${label} identity does not match.`);
  }
  return identity;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Canvas text-file preview ${label} identity is required.`);
  }
  return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Canvas text-file preview payload contains unsupported fields.');
  }
}
