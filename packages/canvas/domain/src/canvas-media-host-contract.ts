import { validateContentLocator } from '@neko/content';
import {
  isMediaResourceUrl,
  type HtmlAudioDescriptor,
  type HtmlVideoDescriptor,
  type HtmlVideoPreparationProfile,
} from '@neko/media';
import {
  parseCanvasHostRuntimeIdentity,
  type CanvasHostRuntimeIdentity,
} from './canvas-host-runtime-contract';

export const CANVAS_MEDIA_HOST_REQUEST_TYPES = [
  'media:probe',
  'media:play',
  'media:seek',
  'media:pause',
  'media:resume',
  'media:stop',
  'media:captureFrame',
] as const;

export type CanvasMediaHostRequestType = (typeof CANVAS_MEDIA_HOST_REQUEST_TYPES)[number];

export function isCanvasMediaHostRequestType(value: unknown): value is CanvasMediaHostRequestType {
  return CANVAS_MEDIA_HOST_REQUEST_TYPES.some((type) => type === value);
}

export interface CanvasMediaHostInfo {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: string;
  readonly format: string;
  readonly hasAudio: boolean;
  readonly bitrate?: number;
  readonly audioCodec?: string;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
}

interface CanvasMediaHostRequestBase {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly nodeId: string;
}

interface CanvasMediaHostSourceRequest extends CanvasMediaHostRequestBase {
  readonly locator: {
    readonly kind: 'workspace-file';
    readonly path: string;
  };
}

export type CanvasMediaHostRequest =
  | (CanvasMediaHostSourceRequest & {
      readonly type: 'media:probe';
      readonly mediaType: 'video' | 'audio';
    })
  | (CanvasMediaHostSourceRequest & {
      readonly type: 'media:play';
      readonly mediaType: 'video' | 'audio';
      readonly mediaInfo: CanvasMediaHostInfo;
      readonly startTime: number;
      readonly speed: number;
    })
  | (CanvasMediaHostSourceRequest & {
      readonly type: 'media:captureFrame';
      readonly time: number;
    })
  | (CanvasMediaHostRequestBase & {
      readonly type: 'media:seek';
      readonly time: number;
    })
  | (CanvasMediaHostRequestBase & {
      readonly type: 'media:pause' | 'media:resume' | 'media:stop';
    });

type WithoutCanvasMediaHostIdentity<T> = T extends CanvasMediaHostRequest
  ? Omit<T, 'identity'>
  : never;

export type CanvasMediaHostMessage = WithoutCanvasMediaHostIdentity<CanvasMediaHostRequest>;

export type CanvasMediaHostResponse =
  | {
      readonly type: 'media:probeResult';
      readonly nodeId: string;
      readonly mediaInfo?: CanvasMediaHostInfo;
      readonly error?: string;
    }
  | {
      readonly type: 'media:streamReady';
      readonly nodeId: string;
      readonly mediaInfo?: CanvasMediaHostInfo;
      readonly contentLocator?: {
        readonly kind: 'workspace-file';
        readonly path: string;
      };
      readonly video?: HtmlVideoDescriptor;
      readonly audio?: HtmlAudioDescriptor;
      readonly startTime?: number;
      readonly playbackRate?: number;
      readonly error?: string;
    }
  | {
      readonly type: 'media:captureFrameResult';
      readonly nodeId: string;
      readonly dataUrl?: string;
      readonly error?: string;
    };

export function parseCanvasMediaHostRequest(value: unknown): CanvasMediaHostRequest {
  const record = requireRecord(value, 'Canvas media Host request must be an object.');
  const identity = parseCanvasHostRuntimeIdentity(record['identity']);
  return attachCanvasMediaHostIdentity(identity, parseCanvasMediaHostMessage(record));
}

export function createCanvasMediaHostRequest(
  identity: CanvasHostRuntimeIdentity,
  value: unknown,
): CanvasMediaHostRequest {
  return attachCanvasMediaHostIdentity(identity, parseCanvasMediaHostMessage(value));
}

export function parseCanvasMediaHostMessage(value: unknown): CanvasMediaHostMessage {
  const record = requireRecord(value, 'Canvas media Host message must be an object.');
  const nodeId = requireIdentity(record['nodeId'], 'Canvas media node identity is required.');
  const type = record['type'];
  if (type === 'media:pause' || type === 'media:resume' || type === 'media:stop') {
    return { nodeId, type };
  }
  if (type === 'media:seek') {
    return {
      nodeId,
      type,
      time: requireNonNegativeNumber(record['time'], 'Canvas media seek time'),
    };
  }
  const locator = parseWorkspaceFileLocator(record['locator']);
  if (type === 'media:captureFrame') {
    return {
      nodeId,
      type,
      locator,
      time: requireNonNegativeNumber(record['time'], 'Canvas media capture time'),
    };
  }
  const mediaType = record['mediaType'];
  if (mediaType !== 'video' && mediaType !== 'audio') {
    throw new Error('Canvas media type must be video or audio.');
  }
  if (type === 'media:probe') return { nodeId, type, locator, mediaType };
  if (type === 'media:play') {
    return {
      nodeId,
      type,
      locator,
      mediaType,
      mediaInfo: parseCanvasMediaHostInfo(record['mediaInfo']),
      startTime: requireNonNegativeNumber(record['startTime'], 'Canvas media playback start'),
      speed: requirePositiveNumber(record['speed'], 'Canvas media playback speed'),
    };
  }
  throw new Error('Canvas media Host request type is unsupported.');
}

function attachCanvasMediaHostIdentity(
  identity: CanvasHostRuntimeIdentity,
  message: CanvasMediaHostMessage,
): CanvasMediaHostRequest {
  switch (message.type) {
    case 'media:probe':
    case 'media:play':
    case 'media:captureFrame':
    case 'media:seek':
    case 'media:pause':
    case 'media:resume':
    case 'media:stop':
      return { ...message, identity };
  }
}

export function parseCanvasMediaHostResponse(
  value: unknown,
  nodeId: string,
): CanvasMediaHostResponse | undefined {
  if (value === undefined || value === null) return undefined;
  const record = requireRecord(value, 'Canvas media Host response must be an object.');
  if (record['nodeId'] !== nodeId) {
    throw new Error('Canvas media Host response owner does not match.');
  }
  const error = record['error'];
  if (error !== undefined && (typeof error !== 'string' || error.length === 0)) {
    throw new Error('Canvas media Host response error is invalid.');
  }
  if (record['type'] === 'media:probeResult') {
    const mediaInfo =
      record['mediaInfo'] === undefined ? undefined : parseCanvasMediaHostInfo(record['mediaInfo']);
    if (!error && !mediaInfo) throw new Error('Canvas media probe response is incomplete.');
    return {
      type: 'media:probeResult',
      nodeId,
      ...(mediaInfo ? { mediaInfo } : {}),
      ...(error ? { error } : {}),
    };
  }
  if (record['type'] === 'media:streamReady') {
    const mediaInfo =
      record['mediaInfo'] === undefined ? undefined : parseCanvasMediaHostInfo(record['mediaInfo']);
    const video = parseOptionalVideoDescriptor(record['video']);
    const audio = parseOptionalAudioDescriptor(record['audio']);
    const contentLocator =
      record['contentLocator'] === undefined
        ? undefined
        : parseWorkspaceFileLocator(record['contentLocator']);
    if (!error && (!mediaInfo || !contentLocator || (!video && !audio))) {
      throw new Error('Canvas media stream response is incomplete.');
    }
    return {
      type: 'media:streamReady',
      nodeId,
      ...(mediaInfo ? { mediaInfo } : {}),
      ...(contentLocator ? { contentLocator } : {}),
      ...(video ? { video } : {}),
      ...(audio ? { audio } : {}),
      ...(record['startTime'] === undefined
        ? {}
        : {
            startTime: requireNonNegativeNumber(
              record['startTime'],
              'Canvas media stream start time',
            ),
          }),
      ...(record['playbackRate'] === undefined
        ? {}
        : {
            playbackRate: requirePositiveNumber(
              record['playbackRate'],
              'Canvas media stream playback rate',
            ),
          }),
      ...(error ? { error } : {}),
    };
  }
  if (record['type'] === 'media:captureFrameResult') {
    const dataUrl = record['dataUrl'];
    if (!error && (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/'))) {
      throw new Error('Canvas captured frame response is invalid.');
    }
    return {
      type: 'media:captureFrameResult',
      nodeId,
      ...(typeof dataUrl === 'string' ? { dataUrl } : {}),
      ...(error ? { error } : {}),
    };
  }
  throw new Error('Canvas media Host response type is unsupported.');
}

function parseWorkspaceFileLocator(value: unknown): {
  readonly kind: 'workspace-file';
  readonly path: string;
} {
  const parsed = validateContentLocator(value);
  if (!parsed.ok || parsed.locator.kind !== 'workspace-file') {
    throw new Error('Canvas media requires a portable workspace-file ContentLocator.');
  }
  return parsed.locator;
}

function parseCanvasMediaHostInfo(value: unknown): CanvasMediaHostInfo {
  const record = requireRecord(value, 'Canvas media info must be an object.');
  const duration = requireNonNegativeNumber(record['duration'], 'Canvas media duration');
  const width = requireNonNegativeNumber(record['width'], 'Canvas media width');
  const height = requireNonNegativeNumber(record['height'], 'Canvas media height');
  const fps = requireNonNegativeNumber(record['fps'], 'Canvas media fps');
  if (
    typeof record['codec'] !== 'string' ||
    record['codec'].length === 0 ||
    typeof record['format'] !== 'string' ||
    record['format'].length === 0 ||
    typeof record['hasAudio'] !== 'boolean'
  ) {
    throw new Error('Canvas media info is invalid.');
  }
  return {
    duration,
    width,
    height,
    fps,
    codec: record['codec'],
    format: record['format'],
    hasAudio: record['hasAudio'],
    ...(record['bitrate'] === undefined
      ? {}
      : { bitrate: requireNonNegativeNumber(record['bitrate'], 'Canvas media bitrate') }),
    ...(record['audioCodec'] === undefined
      ? {}
      : {
          audioCodec: requireIdentity(record['audioCodec'], 'Canvas media audio codec is invalid.'),
        }),
    ...(record['audioSampleRate'] === undefined
      ? {}
      : {
          audioSampleRate: requirePositiveNumber(
            record['audioSampleRate'],
            'Canvas media audio sample rate',
          ),
        }),
    ...(record['audioChannels'] === undefined
      ? {}
      : {
          audioChannels: requirePositiveNumber(
            record['audioChannels'],
            'Canvas media audio channel count',
          ),
        }),
  };
}

function parseOptionalVideoDescriptor(value: unknown): HtmlVideoDescriptor | undefined {
  if (value === undefined) return undefined;
  const record = requireRecord(value, 'Canvas video descriptor is invalid.');
  if (
    typeof record['url'] !== 'string' ||
    !isMediaResourceUrl(record['url']) ||
    typeof record['mimeType'] !== 'string' ||
    typeof record['durationSeconds'] !== 'number' ||
    !isHtmlVideoPreparationProfile(record['preparationProfile'])
  ) {
    throw new Error('Canvas video descriptor is invalid.');
  }
  return {
    url: record['url'],
    mimeType: record['mimeType'],
    preparationProfile: record['preparationProfile'],
    durationSeconds: requireNonNegativeNumber(
      record['durationSeconds'],
      'Canvas video descriptor duration',
    ),
  };
}

function parseOptionalAudioDescriptor(value: unknown): HtmlAudioDescriptor | undefined {
  if (value === undefined) return undefined;
  const record = requireRecord(value, 'Canvas audio descriptor is invalid.');
  if (
    typeof record['url'] !== 'string' ||
    !isMediaResourceUrl(record['url']) ||
    typeof record['mimeType'] !== 'string' ||
    typeof record['durationSeconds'] !== 'number'
  ) {
    throw new Error('Canvas audio descriptor is invalid.');
  }
  return {
    url: record['url'],
    mimeType: record['mimeType'],
    durationSeconds: requireNonNegativeNumber(
      record['durationSeconds'],
      'Canvas audio descriptor duration',
    ),
  };
}

function isHtmlVideoPreparationProfile(value: unknown): value is HtmlVideoPreparationProfile {
  return (
    value === 'h264-mp4-direct' ||
    value === 'av1-mp4-direct' ||
    value === 'vp8-webm-direct' ||
    value === 'h264-mp4-remux' ||
    value === 'vp9-mp4-remux' ||
    value === 'h264-sdr-transcode'
  );
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireIdentity(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}
