export const MEDIA_DIFF_SCHEMA_VERSION = 1 as const;

export type MediaType = 'image' | 'audio' | 'video';
export type DiffViewMode = 'side-by-side' | 'overlay' | 'slider' | 'onion-skin';
export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export const MEDIA_EXTENSIONS: Readonly<Record<string, MediaType>> = Object.freeze({
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.svg': 'image',
  '.mp4': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.webm': 'video',
  '.m4v': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.m4a': 'audio',
});

export const DEFAULT_DIFF_TIMEOUT = 30_000;
export const DEFAULT_VIDEO_DIFF_TIMEOUT = 120_000;

export interface MediaFileChange {
  readonly uri: string;
  readonly mediaType: MediaType;
  readonly status: GitChangeStatus;
  readonly oldUri?: string;
}

export interface GitCommitInfo {
  readonly hash: string;
  readonly shortHash: string;
  readonly subject: string;
  readonly authorName: string;
  readonly date: string;
}

export interface FileVersionPair {
  readonly current: ArrayBuffer;
  readonly previous: ArrayBuffer;
  readonly currentPath: string;
  readonly previousPath: string;
  readonly mediaType: MediaType;
  readonly isNewFile?: boolean;
}

export interface DiffOptions {
  readonly precision?: number;
  readonly timeout?: number;
  readonly fileExtension?: string;
  readonly currentPath?: string;
  readonly previousPath?: string;
  readonly startTime?: number;
  readonly endTime?: number;
}

export interface ImageDiffDetails {
  readonly dimensions: {
    readonly current: { readonly width: number; readonly height: number };
    readonly previous: { readonly width: number; readonly height: number };
  };
  readonly pixelDifference: number;
  readonly structuralSimilarity: number;
}

export interface KeyframeDiff {
  readonly time: number;
  readonly similarity: number;
}

export interface VideoDiffDetails {
  readonly duration: { readonly current: number; readonly previous: number };
  readonly resolution: {
    readonly current: { readonly width: number; readonly height: number };
    readonly previous: { readonly width: number; readonly height: number };
  };
  readonly fps: { readonly current: number; readonly previous: number };
  readonly codec: { readonly current: string; readonly previous: string };
  readonly keyframeDiffs: readonly KeyframeDiff[];
  readonly audioTrackChanged: boolean;
  readonly diffRegions?: readonly {
    readonly start: number;
    readonly end: number;
    readonly avgSsim: number;
  }[];
}

export interface TimeRange {
  readonly start: number;
  readonly end: number;
}

export interface AudioDiffDetails {
  readonly duration: { readonly current: number; readonly previous: number };
  readonly sampleRate: { readonly current: number; readonly previous: number };
  readonly channels: { readonly current: number; readonly previous: number };
  readonly waveformSimilarity: number;
  readonly spectralDifference: number;
  readonly silenceRegions?: {
    readonly current: readonly TimeRange[];
    readonly previous: readonly TimeRange[];
  };
  readonly diffRegions?: readonly {
    readonly start: number;
    readonly end: number;
    readonly snr: number;
  }[];
}

export interface DiffVisualization {
  readonly currentWaveform?: readonly number[];
  readonly previousWaveform?: readonly number[];
  readonly currentKeyframes?: readonly ArrayBuffer[];
  readonly previousKeyframes?: readonly ArrayBuffer[];
}

export interface NewFileDiffDetails {
  readonly isNewFile: true;
}

export interface IdenticalDiffDetails {
  readonly identical: true;
}

export type DiffResult =
  | {
      readonly mediaType: 'image';
      readonly similarity: number;
      readonly details: ImageDiffDetails | NewFileDiffDetails | IdenticalDiffDetails;
      readonly visualization?: DiffVisualization;
    }
  | {
      readonly mediaType: 'audio';
      readonly similarity: number;
      readonly details: AudioDiffDetails | NewFileDiffDetails | IdenticalDiffDetails;
      readonly visualization?: DiffVisualization;
    }
  | {
      readonly mediaType: 'video';
      readonly similarity: number;
      readonly details: VideoDiffDetails | NewFileDiffDetails | IdenticalDiffDetails;
      readonly visualization?: DiffVisualization;
    };

export interface MediaDiffPcmDescriptor {
  readonly version: 1;
  readonly protocol: 'neko-pcm-f32le-v1';
  readonly streamUrl: string;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface MediaDiffVideoDescriptor {
  readonly version: 1;
  readonly url: string;
  readonly mimeType: string;
  readonly preparationProfile:
    | 'h264-mp4-direct'
    | 'av1-mp4-direct'
    | 'vp8-webm-direct'
    | 'h264-mp4-remux'
    | 'vp9-mp4-remux'
    | 'h264-sdr-transcode';
  readonly durationSeconds: number;
}

export interface AudioStreamConfig {
  readonly currentAudio: MediaDiffPcmDescriptor;
  readonly previousAudio: MediaDiffPcmDescriptor;
  readonly duration: number;
  readonly startTime: number;
  readonly playbackRate: number;
}

export interface StreamConfig {
  readonly currentVideo: MediaDiffVideoDescriptor;
  readonly previousVideo: MediaDiffVideoDescriptor;
  readonly currentAudio?: MediaDiffPcmDescriptor;
  readonly previousAudio?: MediaDiffPcmDescriptor;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly startTime: number;
  readonly playbackRate: number;
}

interface RequestIdentity {
  readonly schemaVersion: typeof MEDIA_DIFF_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly requestId: string;
  readonly timestamp: number;
}

export type MediaDiffRequest = RequestIdentity &
  (
    | { readonly type: 'mediaDiff:init'; readonly payload: { readonly ref?: string } }
    | { readonly type: 'mediaDiff:initLocal'; readonly payload: Record<string, never> }
    | { readonly type: 'mediaDiff:seek'; readonly payload: { readonly time: number } }
    | {
        readonly type: 'mediaDiff:getFrame';
        readonly payload: { readonly time: number; readonly version: 'current' | 'previous' };
      }
    | { readonly type: 'mediaDiff:cancel' }
    | {
        readonly type: 'mediaDiff:getFileHistory';
        readonly payload: { readonly maxCount?: number };
      }
    | { readonly type: 'mediaDiff:changeRef'; readonly payload: { readonly ref: string } }
    | {
        readonly type: 'mediaDiff:setTimeRange';
        readonly payload: { readonly startTime?: number; readonly endTime?: number };
      }
    | { readonly type: 'mediaDiff:startStreaming'; readonly payload: Record<string, never> }
    | { readonly type: 'mediaDiff:stopStreaming'; readonly payload: Record<string, never> }
    | {
        readonly type: 'mediaDiff:streamControl';
        readonly payload: {
          readonly action: 'play' | 'pause' | 'seek';
          readonly time?: number;
          readonly speed?: number;
        };
      }
    | { readonly type: 'mediaDiff:startAudioStreaming'; readonly payload: Record<string, never> }
    | { readonly type: 'mediaDiff:stopAudioStreaming'; readonly payload: Record<string, never> }
    | {
        readonly type: 'mediaDiff:audioStreamControl';
        readonly payload: {
          readonly action: 'play' | 'pause' | 'seek';
          readonly time?: number;
        };
      }
  );

interface ResponseIdentity {
  readonly schemaVersion: typeof MEDIA_DIFF_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly requestId: string;
}

export type MediaDiffResponseBody =
  | {
      readonly type: 'mediaDiff:progress';
      readonly payload: { readonly progress: number; readonly stage: string };
    }
  | { readonly type: 'mediaDiff:result'; readonly payload: DiffResult }
  | { readonly type: 'mediaDiff:error'; readonly error: string }
  | { readonly type: 'mediaDiff:cancelled' }
  | {
      readonly type: 'mediaDiff:frameData';
      readonly payload: {
        readonly time: number;
        readonly version: 'current' | 'previous';
        readonly imageBuffer: ArrayBuffer;
      };
    }
  | {
      readonly type: 'mediaDiff:imageData';
      readonly payload: {
        readonly currentImage: ArrayBuffer;
        readonly previousImage?: ArrayBuffer;
        readonly mimeType: string;
      };
    }
  | {
      readonly type: 'mediaDiff:waveformData';
      readonly payload: {
        readonly currentWaveform: readonly number[];
        readonly previousWaveform: readonly number[];
      };
    }
  | {
      readonly type: 'mediaDiff:fileHistory';
      readonly payload: { readonly commits: readonly GitCommitInfo[] };
    }
  | { readonly type: 'mediaDiff:fetchState'; readonly state: 'fetching' | 'ready' }
  | { readonly type: 'mediaDiff:streamConfig'; readonly payload: StreamConfig | null }
  | {
      readonly type: 'mediaDiff:audioStreamConfig';
      readonly payload: AudioStreamConfig | null;
    }
  | { readonly type: 'mediaDiff:streamError'; readonly error: string };

export type MediaDiffResponse = ResponseIdentity & MediaDiffResponseBody;
export type MediaDiffResponseDraft = MediaDiffResponseBody & { readonly requestId?: string };

export function getMediaType(filePath: string): MediaType | null {
  const extension = filePath.toLowerCase().match(/\.[^.]+$/u)?.[0];
  return extension ? (MEDIA_EXTENSIONS[extension] ?? null) : null;
}

export function isSupportedMediaFile(filePath: string): boolean {
  return getMediaType(filePath) !== null;
}

export function formatSimilarity(similarity: number): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

export function getSimilarityLevel(
  similarity: number,
): 'identical' | 'similar' | 'different' | 'significantly-different' {
  if (similarity >= 0.99) return 'identical';
  if (similarity >= 0.9) return 'similar';
  if (similarity >= 0.5) return 'different';
  return 'significantly-different';
}

export function parseMediaDiffRequest(value: unknown, expectedSessionId: string): MediaDiffRequest {
  const message = requireBaseMessage(value, expectedSessionId);
  if (!REQUEST_TYPES.has(message.type)) {
    throw new Error(`Unknown media diff request: ${message.type}`);
  }
  requireFiniteNumber(message['timestamp'], 'timestamp');
  validateRequestPayload(message);
  return value as MediaDiffRequest;
}

export function parseMediaDiffResponse(
  value: unknown,
  expectedSessionId: string,
): MediaDiffResponse {
  const message = requireBaseMessage(value, expectedSessionId);
  if (!RESPONSE_TYPES.has(message.type)) {
    throw new Error(`Unknown media diff response: ${message.type}`);
  }
  if (message.type === 'mediaDiff:result') {
    const result = requireRecord(message.payload, 'mediaDiff result payload');
    validateDiffResult(result);
  }
  return value as MediaDiffResponse;
}

const REQUEST_TYPES = new Set([
  'mediaDiff:init',
  'mediaDiff:initLocal',
  'mediaDiff:seek',
  'mediaDiff:getFrame',
  'mediaDiff:cancel',
  'mediaDiff:getFileHistory',
  'mediaDiff:changeRef',
  'mediaDiff:setTimeRange',
  'mediaDiff:startStreaming',
  'mediaDiff:stopStreaming',
  'mediaDiff:streamControl',
  'mediaDiff:startAudioStreaming',
  'mediaDiff:stopAudioStreaming',
  'mediaDiff:audioStreamControl',
]);

const RESPONSE_TYPES = new Set([
  'mediaDiff:progress',
  'mediaDiff:result',
  'mediaDiff:error',
  'mediaDiff:cancelled',
  'mediaDiff:frameData',
  'mediaDiff:imageData',
  'mediaDiff:waveformData',
  'mediaDiff:fileHistory',
  'mediaDiff:fetchState',
  'mediaDiff:streamConfig',
  'mediaDiff:audioStreamConfig',
  'mediaDiff:streamError',
]);

function requireBaseMessage(
  value: unknown,
  expectedSessionId: string,
): Record<string, unknown> & { readonly type: string } {
  const message = requireRecord(value, 'media diff message');
  if (message['schemaVersion'] !== MEDIA_DIFF_SCHEMA_VERSION) {
    throw new Error(`Unsupported media diff schema version: ${String(message['schemaVersion'])}`);
  }
  if (message['sessionId'] !== expectedSessionId) {
    throw new Error('Media diff session identity mismatch.');
  }
  requireNonEmptyString(message['requestId'], 'requestId');
  requireNonEmptyString(message['type'], 'type');
  return message as Record<string, unknown> & { readonly type: string };
}

function validateRequestPayload(
  message: Record<string, unknown> & { readonly type: string },
): void {
  if (message.type === 'mediaDiff:cancel') return;
  const payload = requireRecord(message['payload'], `${message.type} payload`);
  if (message.type === 'mediaDiff:seek' || message.type === 'mediaDiff:getFrame') {
    requireFiniteNumber(payload['time'], 'time');
  }
  if (message.type === 'mediaDiff:changeRef') {
    requireNonEmptyString(payload['ref'], 'ref');
  }
  if (message.type === 'mediaDiff:setTimeRange') {
    if (payload['startTime'] !== undefined) requireFiniteNumber(payload['startTime'], 'startTime');
    if (payload['endTime'] !== undefined) requireFiniteNumber(payload['endTime'], 'endTime');
    if (
      typeof payload['startTime'] === 'number' &&
      typeof payload['endTime'] === 'number' &&
      payload['startTime'] > payload['endTime']
    ) {
      throw new Error('startTime must not exceed endTime.');
    }
  }
  if (
    message.type === 'mediaDiff:streamControl' ||
    message.type === 'mediaDiff:audioStreamControl'
  ) {
    if (
      payload['action'] !== 'play' &&
      payload['action'] !== 'pause' &&
      payload['action'] !== 'seek'
    ) {
      throw new Error(`Unsupported media stream action: ${String(payload['action'])}`);
    }
    if (payload['time'] !== undefined) requireFiniteNumber(payload['time'], 'time');
    if (payload['speed'] !== undefined) {
      const speed = requireFiniteNumber(payload['speed'], 'speed');
      if (speed <= 0) throw new Error('speed must be greater than zero.');
    }
  }
}

function validateMediaType(value: unknown): asserts value is MediaType {
  if (value !== 'image' && value !== 'audio' && value !== 'video') {
    throw new Error(`Unsupported media diff result kind: ${String(value)}`);
  }
}

function validateDiffResult(result: Record<string, unknown>): void {
  validateMediaType(result['mediaType']);
  validateRatio(result['similarity'], 'similarity');
  const details = requireRecord(result['details'], 'mediaDiff result details');
  if (details['isNewFile'] === true || details['identical'] === true) return;

  switch (result['mediaType']) {
    case 'image':
      validateRatio(details['pixelDifference'], 'pixelDifference');
      validateRatio(details['structuralSimilarity'], 'structuralSimilarity');
      break;
    case 'audio':
      validateRatio(details['waveformSimilarity'], 'waveformSimilarity');
      validateRatio(details['spectralDifference'], 'spectralDifference');
      break;
    case 'video': {
      const keyframes = details['keyframeDiffs'];
      if (!Array.isArray(keyframes)) throw new Error('keyframeDiffs must be an array.');
      keyframes.forEach((value, index) => {
        const keyframe = requireRecord(value, `keyframeDiffs[${index}]`);
        requireFiniteNumber(keyframe['time'], `keyframeDiffs[${index}].time`);
        validateRatio(keyframe['similarity'], `keyframeDiffs[${index}].similarity`);
      });
      break;
    }
  }
}

function validateRatio(value: unknown, name: string): void {
  const ratio = requireFiniteNumber(value, name);
  if (ratio < 0 || ratio > 1) {
    throw new Error(`${name} must be within 0..1.`);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return value;
}
