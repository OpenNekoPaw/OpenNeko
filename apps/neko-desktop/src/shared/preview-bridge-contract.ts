import {
  PreviewContractError,
  parsePreviewProjection,
  parsePreviewRuntimeRequest,
  type PreviewProjection,
  type PreviewRuntimeRequest,
} from '@neko/preview-domain';

export const DESKTOP_PREVIEW_CHANNELS = {
  snapshotGet: 'openneko:preview:snapshot:get',
  requestExecute: 'openneko:preview:request:execute',
} as const;

export interface DesktopPreviewBootstrapRequest {
  readonly requestId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly sessionId: string;
  readonly rendererSessionId: string;
}

export interface OpenNekoDesktopPreviewBridge {
  readonly preview: {
    getSnapshot(request: DesktopPreviewBootstrapRequest): Promise<PreviewProjection>;
    execute(request: PreviewRuntimeRequest): Promise<PreviewProjection>;
  };
}

export function createDesktopPreviewBootstrapRequest(input: {
  readonly requestId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly sessionId: string;
  readonly rendererSessionId: string;
}): DesktopPreviewBootstrapRequest {
  return parseDesktopPreviewBootstrapRequest(input);
}

export function parseDesktopPreviewBootstrapRequest(
  value: unknown,
): DesktopPreviewBootstrapRequest {
  const record = requireRecord(value);
  requireExactKeys(record, [
    'requestId',
    'projectId',
    'workspaceId',
    'viewId',
    'viewInstanceId',
    'sessionId',
    'rendererSessionId',
  ]);
  return {
    requestId: requireIdentity(record['requestId'], 'Desktop Preview request identity'),
    projectId: requireIdentity(record['projectId'], 'Desktop Preview Project identity'),
    workspaceId: requireIdentity(record['workspaceId'], 'Desktop Preview Workspace identity'),
    viewId: requireIdentity(record['viewId'], 'Desktop Preview View identity'),
    viewInstanceId: requireIdentity(
      record['viewInstanceId'],
      'Desktop Preview View instance identity',
    ),
    sessionId: requireIdentity(record['sessionId'], 'Desktop Preview session identity'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'Desktop Preview renderer session identity'),
  };
}

export function parseDesktopPreviewProjection(value: unknown): PreviewProjection {
  return parsePreviewProjection(value);
}

export function parseDesktopPreviewRuntimeRequest(value: unknown): PreviewRuntimeRequest {
  return parsePreviewRuntimeRequest(value);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload('Desktop Preview request must be an object.');
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw invalidPayload('Desktop Preview request contains unsupported fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('://')
  ) {
    throw invalidPayload(`${label} is invalid.`);
  }
  return value;
}

function invalidPayload(message: string): PreviewContractError {
  return new PreviewContractError('invalid-preview-payload', message);
}
