import type { CanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import {
  isContentLocator,
  type ContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import type { DesktopCanvasMediaRequest } from '../shared/canvas-bridge-contract';

const DESKTOP_CANVAS_MEDIA_MESSAGE_TYPES = new Set([
  'media:probe',
  'media:play',
  'media:seek',
  'media:pause',
  'media:resume',
  'media:stop',
  'media:captureFrame',
]);

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
      DESKTOP_CANVAS_MEDIA_MESSAGE_TYPES.has(messageType),
    postMessage(message) {
      if (isRecord(message) && DESKTOP_CANVAS_MEDIA_MESSAGE_TYPES.has(String(message['type']))) {
        const request = parseMediaMessage(identity, message);
        void window.openNekoDesktop.canvas.executeMediaRequest(request).then(
          (result) => {
            if (result) emit(result);
          },
          (error: unknown) => {
            emit(createMediaErrorResponse(request, error));
          },
        );
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

function parseMediaMessage(
  identity: CanvasHostRuntimeIdentity,
  message: Record<string, unknown>,
): DesktopCanvasMediaRequest {
  const type = message['type'];
  const nodeId = message['nodeId'];
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw new Error('Desktop Canvas media node identity is invalid.');
  }
  if (type === 'media:pause' || type === 'media:resume' || type === 'media:stop') {
    return { identity, nodeId, type };
  }
  if (type === 'media:seek') {
    return {
      identity,
      nodeId,
      type,
      time: requireNonNegativeNumber(message['time'], 'seek time'),
    };
  }
  const contentLocator = readCanvasContentLocator(message);
  if (!contentLocator) {
    throw new Error('Desktop Canvas media source is invalid.');
  }
  const locator = contentLocator;
  if (type === 'media:captureFrame') {
    return {
      identity,
      nodeId,
      type,
      locator,
      time: requireNonNegativeNumber(message['time'], 'capture time'),
    };
  }
  const mediaType = message['mediaType'];
  if (mediaType !== 'video' && mediaType !== 'audio') {
    throw new Error('Desktop Canvas media type is invalid.');
  }
  if (type === 'media:probe') {
    return { identity, nodeId, type, locator, mediaType };
  }
  if (type === 'media:play') {
    if (!isRecord(message['mediaInfo'])) {
      throw new Error('Desktop Canvas playback mediaInfo is invalid.');
    }
    return {
      identity,
      nodeId,
      type,
      locator,
      mediaType,
      mediaInfo: {
        duration: requireNonNegativeNumber(message['mediaInfo']['duration'], 'media duration'),
        width: requireNonNegativeNumber(message['mediaInfo']['width'], 'media width'),
        height: requireNonNegativeNumber(message['mediaInfo']['height'], 'media height'),
        fps: requireNonNegativeNumber(message['mediaInfo']['fps'], 'media fps'),
        codec: requireString(message['mediaInfo']['codec'], 'media codec'),
        format: requireString(message['mediaInfo']['format'], 'media format'),
        hasAudio: requireBoolean(message['mediaInfo']['hasAudio'], 'media audio flag'),
        ...(typeof message['mediaInfo']['bitrate'] === 'number'
          ? { bitrate: message['mediaInfo']['bitrate'] }
          : {}),
        ...(typeof message['mediaInfo']['audioCodec'] === 'string'
          ? { audioCodec: message['mediaInfo']['audioCodec'] }
          : {}),
        ...(typeof message['mediaInfo']['audioSampleRate'] === 'number'
          ? { audioSampleRate: message['mediaInfo']['audioSampleRate'] }
          : {}),
        ...(typeof message['mediaInfo']['audioChannels'] === 'number'
          ? { audioChannels: message['mediaInfo']['audioChannels'] }
          : {}),
      },
      startTime: requireNonNegativeNumber(message['startTime'], 'playback start'),
      speed: requirePositiveNumber(message['speed'], 'playback speed'),
    };
  }
  throw new Error('Desktop Canvas delegate received an unsupported media message.');
}

function createMediaErrorResponse(
  request: DesktopCanvasMediaRequest,
  error: unknown,
): Record<string, unknown> {
  const responseType =
    request.type === 'media:probe'
      ? 'media:probeResult'
      : request.type === 'media:captureFrame'
        ? 'media:captureFrameResult'
        : 'media:streamReady';
  return {
    type: responseType,
    nodeId: request.nodeId,
    error: describeError(error),
  };
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

function readCanvasContentLocator(
  message: Record<string, unknown>,
): WorkspaceFileContentLocator | undefined {
  return isContentLocator(message['contentLocator']) &&
    message['contentLocator'].kind === 'workspace-file'
    ? message['contentLocator']
    : undefined;
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

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Desktop Canvas ${label} is invalid.`);
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Desktop Canvas ${label} is invalid.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Desktop Canvas ${label} is invalid.`);
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
