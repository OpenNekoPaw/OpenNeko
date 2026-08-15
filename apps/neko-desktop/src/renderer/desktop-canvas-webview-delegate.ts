import { type CanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import { isContentLocator, type ContentLocator } from '@neko/content';

interface DesktopCanvasWebviewDelegate {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
  supportsMessage(messageType: string): boolean;
  subscribe(listener: (message: unknown) => void): () => void;
}

export function createDesktopCanvasWebviewDelegate(
  identity: CanvasHostRuntimeIdentity,
): DesktopCanvasWebviewDelegate {
  let state: unknown;
  const listeners = new Set<(message: unknown) => void>();
  const emit = (message: unknown): void => {
    for (const listener of listeners) listener(message);
  };
  return {
    supportsMessage: (messageType) =>
      messageType === 'preview:resolveVariant' ||
      messageType === 'preview:resolveResource' ||
      messageType === 'preview:releaseResource',
    postMessage(message) {
      if (isRecord(message) && message['type'] === 'preview:resolveResource') {
        const request = parsePreviewResourceMessage(message);
        void window.openNekoDesktop.canvas.resolvePreviewResource({ identity, ...request }).then(
          (result) =>
            emit({
              type: 'preview:resourceResolved',
              requestId: result.requestId,
              descriptor: result.descriptor,
            }),
          (error: unknown) =>
            emit({
              type: 'preview:resourceResolved',
              requestId: request.requestId,
              error: describeError(error),
            }),
        );
        return;
      }
      if (isRecord(message) && message['type'] === 'preview:releaseResource') {
        const descriptorId = requireString(message['descriptorId'], 'preview resource descriptor');
        void window.openNekoDesktop.canvas.releasePreviewResource({ identity, descriptorId });
        return;
      }
      const request = parsePreviewVariantMessage(message);
      void window.openNekoDesktop.canvas
        .resolvePreviewVariant({
          identity,
          requestId: request.requestId,
          sourceId: request.sourceId,
          locator: request.contentLocator,
          role: request.role,
          ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
        })
        .then(
          (result) => {
            emit({
              type: 'preview:variantResolved',
              requestId: result.requestId,
              url: result.url,
            });
          },
          (error: unknown) => {
            emit({
              type: 'preview:variantResolved',
              requestId: request.requestId,
              error: describeError(error),
            });
          },
        );
    },
    getState: () => state,
    setState(nextState) {
      state = nextState;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function parsePreviewResourceMessage(message: Record<string, unknown>) {
  const requestId = requireString(message['requestId'], 'preview resource request');
  const nodeId = requireString(message['nodeId'], 'preview resource node');
  const outputId = requireString(message['outputId'], 'preview resource output');
  const locator = readPreviewContentLocator(message);
  if (!locator) throw new Error('Desktop Canvas preview resource source is invalid.');
  const contentKind = message['contentKind'];
  if (
    contentKind !== 'image' &&
    contentKind !== 'video' &&
    contentKind !== 'audio' &&
    contentKind !== 'text'
  ) {
    throw new Error('Desktop Canvas preview resource kind is invalid.');
  }
  return {
    requestId,
    nodeId,
    outputId,
    locator,
    contentKind,
    mediaType: requireString(message['mediaType'], 'preview resource media type'),
    displayName: requireString(message['displayName'], 'preview resource display name'),
  } as const;
}

function parsePreviewVariantMessage(message: unknown): {
  readonly requestId: string;
  readonly sourceId: string;
  readonly contentLocator: ContentLocator;
  readonly role: 'source' | 'thumbnail' | 'proxy' | 'fov-crop';
  readonly mediaType?: string;
} {
  if (!isRecord(message) || message['type'] !== 'preview:resolveVariant') {
    throw new Error('Desktop Canvas delegate received an unsupported message.');
  }
  const requestId = message['requestId'];
  const sourceId = message['sourceId'];
  const contentLocator = readPreviewContentLocator(message);
  const role = message['role'];
  const mediaType = message['mediaType'];
  if (
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    typeof sourceId !== 'string' ||
    sourceId.length === 0 ||
    !contentLocator
  ) {
    throw new Error('Desktop Canvas preview message is invalid.');
  }
  if (role !== 'source' && role !== 'thumbnail' && role !== 'proxy' && role !== 'fov-crop') {
    throw new Error('Desktop Canvas preview role is invalid.');
  }
  if (mediaType !== undefined && (typeof mediaType !== 'string' || mediaType.length === 0)) {
    throw new Error('Desktop Canvas preview media type is invalid.');
  }
  return {
    requestId,
    sourceId,
    contentLocator,
    role,
    ...(mediaType === undefined ? {} : { mediaType }),
  };
}

function readPreviewContentLocator(message: Record<string, unknown>): ContentLocator | undefined {
  return isContentLocator(message['contentLocator']) ? message['contentLocator'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Desktop Canvas ${label} is invalid.`);
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
