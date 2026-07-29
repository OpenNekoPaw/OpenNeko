import type { CanvasHostRuntimeIdentity } from '@neko-canvas/domain';

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
    supportsMessage: (messageType) => messageType === 'preview:resolveVariant',
    postMessage(message) {
      const request = parsePreviewVariantMessage(message);
      void window.openNekoDesktop.canvas
        .resolvePreviewVariant({
          identity,
          requestId: request.requestId,
          locator: { kind: 'workspace-file', path: request.assetPath },
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

function parsePreviewVariantMessage(message: unknown): {
  readonly requestId: string;
  readonly assetPath: string;
  readonly role: 'source' | 'thumbnail' | 'proxy' | 'fov-crop';
  readonly mediaType?: string;
} {
  if (!isRecord(message) || message['type'] !== 'preview:resolveVariant') {
    throw new Error('Desktop Canvas delegate received an unsupported message.');
  }
  const requestId = message['requestId'];
  const assetPath = message['assetPath'];
  const role = message['role'];
  const mediaType = message['mediaType'];
  if (
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    typeof assetPath !== 'string' ||
    !isPortableRelativePath(assetPath)
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
    assetPath,
    role,
    ...(mediaType === undefined ? {} : { mediaType }),
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
