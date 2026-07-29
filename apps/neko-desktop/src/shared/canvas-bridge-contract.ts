import type {
  CanvasHostIntentRequest,
  CanvasHostIntentResult,
  CanvasHostProjectionEvent,
  CanvasHostRuntimeIdentity,
  CanvasHostSnapshot,
} from '@neko-canvas/domain';

export const DESKTOP_CANVAS_CHANNELS = {
  snapshotGet: 'open-neko:canvas:snapshot-get',
  intentExecute: 'open-neko:canvas:intent-execute',
  previewVariantResolve: 'open-neko:canvas:preview-variant-resolve',
  projectionEvent: 'open-neko:canvas:projection-event',
} as const;

export const DESKTOP_DEFAULT_CANVAS_DOCUMENT_ID = 'neko/boards/workspace.nkc';

export function createDesktopCanvasSessionId(viewId: string, viewEpoch: number): string {
  return `canvas-session:${viewId}:${viewEpoch}`;
}

export function parseDesktopCanvasHostIdentity(value: unknown): CanvasHostRuntimeIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Desktop Canvas identity must be an object.');
  }
  const record = isRecord(value) ? value : undefined;
  if (!record) throw new Error('Desktop Canvas identity must be an object.');
  return {
    projectId: requireIdentity(record['projectId'], 'Project'),
    workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
    windowId: requireIdentity(record['windowId'], 'Window'),
    viewId: requireIdentity(record['viewId'], 'View'),
    viewEpoch: requirePositiveInteger(record['viewEpoch'], 'View epoch'),
    documentId: requireIdentity(record['documentId'], 'document'),
    sessionId: requireIdentity(record['sessionId'], 'session'),
    endpointEpoch: requireIdentity(record['endpointEpoch'], 'endpoint epoch'),
  };
}

export interface OpenNekoDesktopCanvasBridge {
  readonly canvas: {
    getSnapshot(identity: CanvasHostRuntimeIdentity): Promise<CanvasHostSnapshot>;
    executeIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult>;
    resolvePreviewVariant(
      request: DesktopCanvasPreviewVariantRequest,
    ): Promise<DesktopCanvasPreviewVariantResult>;
    subscribe(
      identity: CanvasHostRuntimeIdentity,
      listener: (event: CanvasHostProjectionEvent) => void,
    ): () => void;
  };
}

export interface DesktopCanvasPreviewVariantRequest {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly requestId: string;
  readonly locator: {
    readonly kind: 'workspace-file';
    readonly path: string;
  };
  readonly role: 'source' | 'thumbnail' | 'proxy' | 'fov-crop';
  readonly mediaType?: string;
}

export interface DesktopCanvasPreviewVariantResult {
  readonly requestId: string;
  readonly url: string;
}

export function parseDesktopCanvasPreviewVariantRequest(
  value: unknown,
): DesktopCanvasPreviewVariantRequest {
  if (!isRecord(value)) {
    throw new Error('Desktop Canvas preview request must be an object.');
  }
  const locator = value['locator'];
  if (
    !isRecord(locator) ||
    locator['kind'] !== 'workspace-file' ||
    typeof locator['path'] !== 'string' ||
    !isPortableRelativePath(locator['path'])
  ) {
    throw new Error('Desktop Canvas preview requires a portable workspace-file ContentLocator.');
  }
  const role = value['role'];
  if (role !== 'source' && role !== 'thumbnail' && role !== 'proxy' && role !== 'fov-crop') {
    throw new Error('Desktop Canvas preview role is invalid.');
  }
  const mediaType = value['mediaType'];
  if (mediaType !== undefined && (typeof mediaType !== 'string' || mediaType.trim().length === 0)) {
    throw new Error('Desktop Canvas preview media type is invalid.');
  }
  return {
    identity: parseDesktopCanvasHostIdentity(value['identity']),
    requestId: requireIdentity(value['requestId'], 'preview request'),
    locator: { kind: 'workspace-file', path: locator['path'] },
    role,
    ...(mediaType === undefined ? {} : { mediaType }),
  };
}

export function parseDesktopCanvasPreviewVariantResult(
  value: unknown,
  requestId: string,
): DesktopCanvasPreviewVariantResult {
  if (
    !isRecord(value) ||
    value['requestId'] !== requestId ||
    typeof value['url'] !== 'string' ||
    !value['url'].startsWith('data:image/')
  ) {
    throw new Error('Desktop Canvas preview result is invalid.');
  }
  return { requestId, url: value['url'] };
}

export function isSameCanvasHostIdentity(
  left: CanvasHostRuntimeIdentity,
  right: CanvasHostRuntimeIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewEpoch === right.viewEpoch &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.endpointEpoch === right.endpointEpoch
  );
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Desktop Canvas ${label} identity is required.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 1) {
    throw new Error(`Desktop Canvas ${label} must be a positive integer.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPortableRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.startsWith('\\') &&
    !value.includes('\\') &&
    !value.includes('://') &&
    value !== '..' &&
    !value.startsWith('../') &&
    !value.includes('/../')
  );
}
