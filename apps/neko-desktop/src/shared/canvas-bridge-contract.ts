import {
  parseCanvasHostRuntimeIdentity,
  parseCanvasWorkspaceContextCatalog,
  type CanvasWorkspaceContextCatalog,
} from '@neko/canvas-domain';
import type {
  CanvasHostIntentRequest,
  CanvasHostIntentResult,
  CanvasHostProjectionEvent,
  CanvasHostRuntimeIdentity,
  CanvasHostSnapshot,
  CanvasMaterialActionResolution,
  CanvasMaterialActionResolutionRequest,
  CanvasTextFilePreviewRequest,
  CanvasTextFilePreviewResult,
} from '@neko/canvas-domain';
import { validateContentLocator, type ContentLocator } from '@neko/content';
import {
  parsePreviewMediaDescriptor,
  type PreviewContentKind,
  type PreviewMediaDescriptor,
} from '@neko/preview-domain';

export const DESKTOP_CANVAS_CHANNELS = {
  snapshotGet: 'open-neko:canvas:snapshot-get',
  materialActionsResolve: 'open-neko:canvas:material-actions-resolve',
  textFilePreviewRead: 'open-neko:canvas:text-file-preview-read',
  intentExecute: 'open-neko:canvas:intent-execute',
  previewResourceResolve: 'open-neko:canvas:preview-resource-resolve',
  previewResourceRelease: 'open-neko:canvas:preview-resource-release',
  workspaceIndexCatalogRead: 'open-neko:canvas:workspace-index-catalog-read',
  workspaceDocumentOpen: 'open-neko:canvas:workspace-document-open',
  projectionEvent: 'open-neko:canvas:projection-event',
} as const;

export interface OpenNekoDesktopCanvasBridge {
  readonly canvas: {
    getSnapshot(identity: CanvasHostRuntimeIdentity): Promise<CanvasHostSnapshot>;
    resolveMaterialActions(
      request: CanvasMaterialActionResolutionRequest,
    ): Promise<CanvasMaterialActionResolution>;
    executeIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult>;
    readTextFilePreview(
      request: CanvasTextFilePreviewRequest,
    ): Promise<CanvasTextFilePreviewResult>;
    resolvePreviewResource(
      request: DesktopCanvasPreviewResourceRequest,
    ): Promise<DesktopCanvasPreviewResourceResult>;
    releasePreviewResource(request: DesktopCanvasPreviewResourceReleaseRequest): Promise<void>;
    readWorkspaceIndexCatalog(
      request: DesktopCanvasWorkspaceIndexCatalogRequest,
    ): Promise<DesktopCanvasWorkspaceIndexCatalogResult>;
    openWorkspaceDocument(
      request: DesktopCanvasWorkspaceDocumentOpenRequest,
    ): Promise<DesktopCanvasWorkspaceDocumentOpenResult>;
    subscribe(
      identity: CanvasHostRuntimeIdentity,
      listener: (event: CanvasHostProjectionEvent) => void,
    ): () => void;
  };
}

export interface DesktopCanvasWorkspaceIndexCatalogRequest {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
}

export interface DesktopCanvasWorkspaceIndexCatalogResult {
  readonly requestId: string;
  readonly catalog: CanvasWorkspaceContextCatalog;
}

export interface DesktopCanvasWorkspaceDocumentOpenRequest {
  readonly requestId: string;
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly canvasId: string;
}

export interface DesktopCanvasWorkspaceDocumentOpenResult {
  readonly requestId: string;
  readonly status: 'opened';
}

export function parseDesktopCanvasWorkspaceDocumentOpenRequest(
  value: unknown,
): DesktopCanvasWorkspaceDocumentOpenRequest {
  if (isRecord(value) === false) {
    throw new Error('Desktop Canvas workspace document open request must be an object.');
  }
  requireExactKeys(
    value,
    ['requestId', 'workspaceId', 'workspaceGrantId', 'canvasId'],
    'Desktop Canvas workspace document open request',
  );
  const canvasId = requireString(value['canvasId'], 'canvasId');
  const locator = validateContentLocator({ kind: 'workspace-file', path: canvasId });
  if (!locator.ok || !canvasId.toLocaleLowerCase('en-US').endsWith('.nkc')) {
    throw new Error(
      'Desktop Canvas workspace document open requires a Workspace-file NKC identity.',
    );
  }
  return {
    requestId: requireString(value['requestId'], 'requestId'),
    workspaceId: requireString(value['workspaceId'], 'workspaceId'),
    workspaceGrantId: requireString(value['workspaceGrantId'], 'workspaceGrantId'),
    canvasId,
  };
}

export function parseDesktopCanvasWorkspaceDocumentOpenResult(
  value: unknown,
  requestId: string,
): DesktopCanvasWorkspaceDocumentOpenResult {
  if (isRecord(value) === false) {
    throw new Error('Desktop Canvas workspace document open result must be an object.');
  }
  requireExactKeys(value, ['requestId', 'status'], 'Desktop Canvas workspace document open result');
  if (value['requestId'] !== requestId || value['status'] !== 'opened') {
    throw new Error('Desktop Canvas workspace document open result is invalid.');
  }
  return { requestId, status: 'opened' };
}

export function parseDesktopCanvasWorkspaceIndexCatalogRequest(
  value: unknown,
): DesktopCanvasWorkspaceIndexCatalogRequest {
  if (isRecord(value) === false) {
    throw new Error('Desktop Canvas workspace index catalog request must be an object.');
  }
  requireExactKeys(
    value,
    ['requestId', 'workspaceId', 'workspaceGrantId'],
    'Desktop Canvas workspace index catalog request',
  );
  return {
    requestId: requireString(value['requestId'], 'requestId'),
    workspaceId: requireString(value['workspaceId'], 'workspaceId'),
    workspaceGrantId: requireString(value['workspaceGrantId'], 'workspaceGrantId'),
  };
}

export function parseDesktopCanvasWorkspaceIndexCatalogResult(
  value: unknown,
  requestId: string,
  expectedWorkspaceId: string,
): DesktopCanvasWorkspaceIndexCatalogResult {
  if (isRecord(value) === false) {
    throw new Error('Desktop Canvas workspace index catalog result must be an object.');
  }
  requireExactKeys(
    value,
    ['requestId', 'catalog'],
    'Desktop Canvas workspace index catalog result',
  );
  if (value['requestId'] !== requestId) {
    throw new Error('Desktop Canvas workspace index catalog requestId mismatch.');
  }
  const catalog = parseCanvasWorkspaceContextCatalog(value['catalog']);
  if (catalog.workspaceId !== expectedWorkspaceId) {
    throw new Error('Desktop Canvas workspace index catalog workspace mismatch.');
  }
  return { requestId, catalog };
}

export interface DesktopCanvasPreviewResourceRequest {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly requestId: string;
  readonly nodeId: string;
  readonly outputId: string;
  readonly locator: ContentLocator;
  readonly contentKind: PreviewContentKind;
  readonly mediaType: string;
  readonly displayName: string;
}

export interface DesktopCanvasPreviewResourceResult {
  readonly requestId: string;
  readonly descriptor: PreviewMediaDescriptor;
}

export interface DesktopCanvasPreviewResourceReleaseRequest {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly descriptorId: string;
}

export function parseDesktopCanvasPreviewResourceRequest(
  value: unknown,
): DesktopCanvasPreviewResourceRequest {
  if (!isRecord(value))
    throw new Error('Desktop Canvas preview resource request must be an object.');
  const locator = validateContentLocator(value['locator']);
  if (!locator.ok)
    throw new Error('Desktop Canvas preview resource requires a valid ContentLocator.');
  const contentKind = value['contentKind'];
  if (
    contentKind !== 'image' &&
    contentKind !== 'video' &&
    contentKind !== 'audio' &&
    contentKind !== 'document' &&
    contentKind !== 'model' &&
    contentKind !== 'text'
  ) {
    throw new Error('Desktop Canvas preview resource content kind is invalid.');
  }
  return {
    identity: parseCanvasHostRuntimeIdentity(value['identity']),
    requestId: requireIdentity(value['requestId'], 'preview resource request'),
    nodeId: requireIdentity(value['nodeId'], 'preview resource node'),
    outputId: requireIdentity(value['outputId'], 'preview resource output'),
    locator: locator.locator,
    contentKind,
    mediaType: requireIdentity(value['mediaType'], 'preview resource media type'),
    displayName: requireIdentity(value['displayName'], 'preview resource display name'),
  };
}

export function parseDesktopCanvasPreviewResourceResult(
  value: unknown,
  requestId: string,
): DesktopCanvasPreviewResourceResult {
  if (!isRecord(value) || value['requestId'] !== requestId) {
    throw new Error('Desktop Canvas preview resource result is invalid.');
  }
  return { requestId, descriptor: parsePreviewMediaDescriptor(value['descriptor']) };
}

export function parseDesktopCanvasPreviewResourceReleaseRequest(
  value: unknown,
): DesktopCanvasPreviewResourceReleaseRequest {
  if (!isRecord(value))
    throw new Error('Desktop Canvas preview resource release must be an object.');
  return {
    identity: parseCanvasHostRuntimeIdentity(value['identity']),
    descriptorId: requireIdentity(value['descriptorId'], 'preview resource descriptor'),
  };
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
    left.viewInstanceId === right.viewInstanceId &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.rendererSessionId === right.rendererSessionId
  );
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Desktop Canvas ${label} identity is required.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(record).find((key) => keys.includes(key) === false);
  if (unknown !== undefined) throw new Error(`${label} contains unsupported field '${unknown}'.`);
  const missing = keys.find((key) => key in record === false);
  if (missing !== undefined) throw new Error(`${label} is missing field '${missing}'.`);
}
