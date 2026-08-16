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
      throw new Error('Desktop Canvas delegate received an unsupported message.');
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
