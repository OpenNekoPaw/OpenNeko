import { parseCanvasHostRuntimeIdentity } from '@neko/canvas-domain';
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
  previewVariantResolve: 'open-neko:canvas:preview-variant-resolve',
  previewResourceResolve: 'open-neko:canvas:preview-resource-resolve',
  previewResourceRelease: 'open-neko:canvas:preview-resource-release',
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
    resolvePreviewVariant(
      request: DesktopCanvasPreviewVariantRequest,
    ): Promise<DesktopCanvasPreviewVariantResult>;
    resolvePreviewResource(
      request: DesktopCanvasPreviewResourceRequest,
    ): Promise<DesktopCanvasPreviewResourceResult>;
    releasePreviewResource(request: DesktopCanvasPreviewResourceReleaseRequest): Promise<void>;
    subscribe(
      identity: CanvasHostRuntimeIdentity,
      listener: (event: CanvasHostProjectionEvent) => void,
    ): () => void;
  };
}

export interface DesktopCanvasPreviewVariantRequest {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly requestId: string;
  readonly sourceId: string;
  readonly locator: ContentLocator;
  readonly role: 'source' | 'thumbnail' | 'proxy' | 'fov-crop';
  readonly mediaType?: string;
}

export interface DesktopCanvasPreviewVariantResult {
  readonly requestId: string;
  readonly url: string;
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

export function parseDesktopCanvasPreviewVariantRequest(
  value: unknown,
): DesktopCanvasPreviewVariantRequest {
  if (!isRecord(value)) {
    throw new Error('Desktop Canvas preview request must be an object.');
  }
  const locator = validateContentLocator(value['locator']);
  if (!locator.ok) throw new Error('Desktop Canvas preview requires a valid ContentLocator.');
  const role = value['role'];
  if (role !== 'source' && role !== 'thumbnail' && role !== 'proxy' && role !== 'fov-crop') {
    throw new Error('Desktop Canvas preview role is invalid.');
  }
  const mediaType = value['mediaType'];
  if (mediaType !== undefined && (typeof mediaType !== 'string' || mediaType.trim().length === 0)) {
    throw new Error('Desktop Canvas preview media type is invalid.');
  }
  return {
    identity: parseCanvasHostRuntimeIdentity(value['identity']),
    requestId: requireIdentity(value['requestId'], 'preview request'),
    sourceId: requireIdentity(value['sourceId'], 'preview source'),
    locator: locator.locator,
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
    !value['url'].startsWith('openneko://resource/')
  ) {
    throw new Error('Desktop Canvas preview result is invalid.');
  }
  return { requestId, url: value['url'] };
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
