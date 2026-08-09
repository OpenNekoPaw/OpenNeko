import type {
  CanvasHostIntentRequest,
  CanvasHostIntentResult,
  CanvasHostProjectionEvent,
  CanvasHostRuntimeIdentity,
  CanvasHostSnapshot,
  CanvasMaterialActionResolution,
  CanvasMaterialActionResolutionRequest,
} from '@neko/canvas-domain';
import type {
  HtmlAudioDescriptor,
  HtmlVideoDescriptor,
  HtmlVideoPreparationProfile,
} from '@neko/media';
import { isMediaResourceUrl } from '@neko/media';
import { validateContentLocator, type ContentLocator } from '@neko/content';

export const DESKTOP_CANVAS_CHANNELS = {
  snapshotGet: 'open-neko:canvas:snapshot-get',
  materialActionsResolve: 'open-neko:canvas:material-actions-resolve',
  intentExecute: 'open-neko:canvas:intent-execute',
  previewVariantResolve: 'open-neko:canvas:preview-variant-resolve',
  mediaRequestExecute: 'open-neko:canvas:media-request-execute',
  projectionEvent: 'open-neko:canvas:projection-event',
} as const;

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
    viewInstanceId: requireIdentity(record['viewInstanceId'], 'View instance'),
    documentId: requireIdentity(record['documentId'], 'document'),
    sessionId: requireIdentity(record['sessionId'], 'session'),
    rendererSessionId: requireIdentity(record['rendererSessionId'], 'renderer session identity'),
  };
}

export interface OpenNekoDesktopCanvasBridge {
  readonly canvas: {
    getSnapshot(identity: CanvasHostRuntimeIdentity): Promise<CanvasHostSnapshot>;
    resolveMaterialActions(
      request: CanvasMaterialActionResolutionRequest,
    ): Promise<CanvasMaterialActionResolution>;
    executeIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult>;
    resolvePreviewVariant(
      request: DesktopCanvasPreviewVariantRequest,
    ): Promise<DesktopCanvasPreviewVariantResult>;
    executeMediaRequest(
      request: DesktopCanvasMediaRequest,
    ): Promise<DesktopCanvasMediaResponse | undefined>;
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

export interface DesktopCanvasMediaInfo {
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

interface DesktopCanvasMediaRequestBase {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly nodeId: string;
}

interface DesktopCanvasMediaSourceRequest extends DesktopCanvasMediaRequestBase {
  readonly locator: {
    readonly kind: 'workspace-file';
    readonly path: string;
  };
}

export type DesktopCanvasMediaRequest =
  | (DesktopCanvasMediaSourceRequest & {
      readonly type: 'media:probe';
      readonly mediaType: 'video' | 'audio';
    })
  | (DesktopCanvasMediaSourceRequest & {
      readonly type: 'media:play';
      readonly mediaType: 'video' | 'audio';
      readonly mediaInfo: DesktopCanvasMediaInfo;
      readonly startTime: number;
      readonly speed: number;
    })
  | (DesktopCanvasMediaSourceRequest & {
      readonly type: 'media:captureFrame';
      readonly time: number;
    })
  | (DesktopCanvasMediaRequestBase & {
      readonly type: 'media:seek';
      readonly time: number;
    })
  | (DesktopCanvasMediaRequestBase & {
      readonly type: 'media:pause' | 'media:resume' | 'media:stop';
    });

export type DesktopCanvasMediaResponse =
  | {
      readonly type: 'media:probeResult';
      readonly nodeId: string;
      readonly mediaInfo?: DesktopCanvasMediaInfo;
      readonly error?: string;
    }
  | {
      readonly type: 'media:streamReady';
      readonly nodeId: string;
      readonly mediaInfo?: DesktopCanvasMediaInfo;
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
    identity: parseDesktopCanvasHostIdentity(value['identity']),
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

export function parseDesktopCanvasMediaRequest(value: unknown): DesktopCanvasMediaRequest {
  if (!isRecord(value)) {
    throw new Error('Desktop Canvas media request must be an object.');
  }
  const identity = parseDesktopCanvasHostIdentity(value['identity']);
  const nodeId = requireIdentity(value['nodeId'], 'media node');
  const type = value['type'];
  if (type === 'media:pause' || type === 'media:resume' || type === 'media:stop') {
    return { identity, nodeId, type };
  }
  if (type === 'media:seek') {
    return { identity, nodeId, type, time: requireNonNegativeNumber(value['time'], 'seek time') };
  }
  const locator = parseWorkspaceFileLocator(value['locator']);
  if (type === 'media:captureFrame') {
    return {
      identity,
      nodeId,
      type,
      locator,
      time: requireNonNegativeNumber(value['time'], 'capture time'),
    };
  }
  const mediaType = value['mediaType'];
  if (mediaType !== 'video' && mediaType !== 'audio') {
    throw new Error('Desktop Canvas media type must be video or audio.');
  }
  if (type === 'media:probe') {
    return { identity, nodeId, type, locator, mediaType };
  }
  if (type === 'media:play') {
    return {
      identity,
      nodeId,
      type,
      locator,
      mediaType,
      mediaInfo: parseDesktopCanvasMediaInfo(value['mediaInfo']),
      startTime: requireNonNegativeNumber(value['startTime'], 'playback start'),
      speed: requirePositiveNumber(value['speed'], 'playback speed'),
    };
  }
  throw new Error('Desktop Canvas media request type is unsupported.');
}

export function parseDesktopCanvasMediaResponse(
  value: unknown,
  nodeId: string,
): DesktopCanvasMediaResponse | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || value['nodeId'] !== nodeId) {
    throw new Error('Desktop Canvas media response owner does not match.');
  }
  const error = value['error'];
  if (error !== undefined && (typeof error !== 'string' || error.length === 0)) {
    throw new Error('Desktop Canvas media response error is invalid.');
  }
  if (value['type'] === 'media:probeResult') {
    const mediaInfo =
      value['mediaInfo'] === undefined
        ? undefined
        : parseDesktopCanvasMediaInfo(value['mediaInfo']);
    if (!error && !mediaInfo) throw new Error('Desktop Canvas media probe response is incomplete.');
    return {
      type: 'media:probeResult',
      nodeId,
      ...(mediaInfo ? { mediaInfo } : {}),
      ...(error ? { error } : {}),
    };
  }
  if (value['type'] === 'media:streamReady') {
    const mediaInfo =
      value['mediaInfo'] === undefined
        ? undefined
        : parseDesktopCanvasMediaInfo(value['mediaInfo']);
    const video = parseOptionalVideoDescriptor(value['video']);
    const audio = parseOptionalAudioDescriptor(value['audio']);
    const contentLocator =
      value['contentLocator'] === undefined
        ? undefined
        : parseWorkspaceFileLocator(value['contentLocator']);
    if (!error && (!mediaInfo || !contentLocator || (!video && !audio))) {
      throw new Error('Desktop Canvas media stream response is incomplete.');
    }
    return {
      type: 'media:streamReady',
      nodeId,
      ...(mediaInfo ? { mediaInfo } : {}),
      ...(contentLocator ? { contentLocator } : {}),
      ...(video ? { video } : {}),
      ...(audio ? { audio } : {}),
      ...(typeof value['startTime'] === 'number' ? { startTime: value['startTime'] } : {}),
      ...(typeof value['playbackRate'] === 'number' ? { playbackRate: value['playbackRate'] } : {}),
      ...(error ? { error } : {}),
    };
  }
  if (value['type'] === 'media:captureFrameResult') {
    const dataUrl = value['dataUrl'];
    if (!error && (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/'))) {
      throw new Error('Desktop Canvas captured frame response is invalid.');
    }
    return {
      type: 'media:captureFrameResult',
      nodeId,
      ...(typeof dataUrl === 'string' ? { dataUrl } : {}),
      ...(error ? { error } : {}),
    };
  }
  throw new Error('Desktop Canvas media response type is unsupported.');
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

function parseWorkspaceFileLocator(value: unknown): {
  readonly kind: 'workspace-file';
  readonly path: string;
} {
  if (
    !isRecord(value) ||
    value['kind'] !== 'workspace-file' ||
    typeof value['path'] !== 'string' ||
    !isPortableRelativePath(value['path'])
  ) {
    throw new Error('Desktop Canvas media requires a portable workspace-file ContentLocator.');
  }
  return { kind: 'workspace-file', path: value['path'] };
}

function parseDesktopCanvasMediaInfo(value: unknown): DesktopCanvasMediaInfo {
  if (!isRecord(value)) throw new Error('Desktop Canvas mediaInfo must be an object.');
  const duration = requireNonNegativeNumber(value['duration'], 'media duration');
  const width = requireNonNegativeNumber(value['width'], 'media width');
  const height = requireNonNegativeNumber(value['height'], 'media height');
  const fps = requireNonNegativeNumber(value['fps'], 'media fps');
  if (
    typeof value['codec'] !== 'string' ||
    typeof value['format'] !== 'string' ||
    typeof value['hasAudio'] !== 'boolean'
  ) {
    throw new Error('Desktop Canvas mediaInfo is invalid.');
  }
  return {
    duration,
    width,
    height,
    fps,
    codec: value['codec'],
    format: value['format'],
    hasAudio: value['hasAudio'],
    ...(value['bitrate'] === undefined
      ? {}
      : { bitrate: requireNonNegativeNumber(value['bitrate'], 'media bitrate') }),
    ...(typeof value['audioCodec'] === 'string' ? { audioCodec: value['audioCodec'] } : {}),
    ...(value['audioSampleRate'] === undefined
      ? {}
      : {
          audioSampleRate: requirePositiveNumber(
            value['audioSampleRate'],
            'media audio sample rate',
          ),
        }),
    ...(value['audioChannels'] === undefined
      ? {}
      : {
          audioChannels: requirePositiveNumber(value['audioChannels'], 'media audio channel count'),
        }),
  };
}

function parseOptionalVideoDescriptor(value: unknown): HtmlVideoDescriptor | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value['url'] !== 'string' ||
    !isMediaResourceUrl(value['url']) ||
    typeof value['mimeType'] !== 'string' ||
    typeof value['durationSeconds'] !== 'number' ||
    !isHtmlVideoPreparationProfile(value['preparationProfile'])
  ) {
    throw new Error('Desktop Canvas video descriptor is invalid.');
  }
  return {
    url: value['url'],
    mimeType: value['mimeType'],
    preparationProfile: value['preparationProfile'],
    durationSeconds: requireNonNegativeNumber(
      value['durationSeconds'],
      'video descriptor duration',
    ),
  };
}

function parseOptionalAudioDescriptor(value: unknown): HtmlAudioDescriptor | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value['url'] !== 'string' ||
    !isMediaResourceUrl(value['url']) ||
    typeof value['mimeType'] !== 'string' ||
    typeof value['durationSeconds'] !== 'number'
  ) {
    throw new Error('Desktop Canvas audio descriptor is invalid.');
  }
  return {
    url: value['url'],
    mimeType: value['mimeType'],
    durationSeconds: requireNonNegativeNumber(
      value['durationSeconds'],
      'audio descriptor duration',
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

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Desktop Canvas ${label} must be a non-negative number.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Desktop Canvas ${label} must be a positive number.`);
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
