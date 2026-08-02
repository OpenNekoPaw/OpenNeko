import {
  PREVIEW_HOST_RUNTIME_VERSION,
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
  readonly schemaVersion: typeof PREVIEW_HOST_RUNTIME_VERSION;
  readonly requestId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly sessionId: string;
  readonly endpointEpoch: string;
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
  readonly viewEpoch: number;
  readonly sessionId: string;
  readonly endpointEpoch: string;
}): DesktopPreviewBootstrapRequest {
  return parseDesktopPreviewBootstrapRequest({
    schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
    ...input,
  });
}

export function parseDesktopPreviewBootstrapRequest(
  value: unknown,
): DesktopPreviewBootstrapRequest {
  const record = requireRecord(value);
  if (record['schemaVersion'] !== PREVIEW_HOST_RUNTIME_VERSION) {
    throw new PreviewContractError(
      'unsupported-preview-version',
      `Unsupported Desktop Preview version '${String(record['schemaVersion'])}'.`,
    );
  }
  return {
    schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
    requestId: requireIdentity(record['requestId'], 'Desktop Preview request identity'),
    projectId: requireIdentity(record['projectId'], 'Desktop Preview Project identity'),
    workspaceId: requireIdentity(record['workspaceId'], 'Desktop Preview Workspace identity'),
    viewId: requireIdentity(record['viewId'], 'Desktop Preview View identity'),
    viewEpoch: requireNonNegativeInteger(record['viewEpoch'], 'Desktop Preview View epoch'),
    sessionId: requireIdentity(record['sessionId'], 'Desktop Preview session identity'),
    endpointEpoch: requireIdentity(record['endpointEpoch'], 'Desktop Preview endpoint epoch'),
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

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw invalidPayload(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function invalidPayload(message: string): PreviewContractError {
  return new PreviewContractError('invalid-preview-payload', message);
}
