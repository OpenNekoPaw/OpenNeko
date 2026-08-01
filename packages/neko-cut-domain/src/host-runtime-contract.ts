import type {
  CutClipRepresentationResult,
  CutExportSettings,
  CutHtmlVideoDescriptor,
  CutMediaFailureScope,
  CutPcmStreamDescriptor,
  CutRepresentationFailureScope,
  CutThumbnailDensity,
} from './media-ports';
import type { CutExportTaskSnapshot } from './export-tasks';

export const CUT_HOST_RUNTIME_VERSION = 1 as const;

export const CUT_HOST_RUNTIME_ROUTES = {
  snapshotGet: 'snapshot.get',
  commandExecute: 'command.execute',
  commandBatch: 'command.batch',
  undo: 'history.undo',
  redo: 'history.redo',
  mediaSelect: 'media.select',
  mediaDrop: 'media.drop',
  agentSend: 'agent.send',
  previewStart: 'preview.start',
  previewPrepare: 'preview.prepare',
  previewActivate: 'preview.activate',
  previewPause: 'preview.pause',
  previewStop: 'preview.stop',
  representationResolve: 'representation.resolve',
  exportGet: 'export.get',
  exportStart: 'export.start',
  exportCancel: 'export.cancel',
  save: 'document.save',
  presentationUpdate: 'presentation.update',
} as const;

export type CutHostRuntimeRoute =
  (typeof CUT_HOST_RUNTIME_ROUTES)[keyof typeof CUT_HOST_RUNTIME_ROUTES];

export interface CutHostRuntimeIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly documentId: string;
  readonly sessionId: string;
  readonly endpointEpoch: string;
}

export interface CutHostPresentationState {
  readonly previewVolume: number;
  readonly previewMuted: boolean;
  readonly pixelsPerSecond: number;
  readonly snappingEnabled: boolean;
  readonly overviewVisible: boolean;
}

export const DEFAULT_CUT_HOST_PRESENTATION: CutHostPresentationState = Object.freeze({
  previewVolume: 1,
  previewMuted: false,
  pixelsPerSecond: 80,
  snappingEnabled: true,
  overviewVisible: true,
});

export interface CutHostExportState {
  readonly tasks: readonly CutExportTaskSnapshot[];
}

export interface CutHostRuntimeSnapshot {
  readonly schemaVersion: typeof CUT_HOST_RUNTIME_VERSION;
  readonly identity: CutHostRuntimeIdentity;
  readonly revision: number;
  readonly dirty: boolean;
  readonly document: unknown;
  readonly playback: unknown;
  readonly export: CutHostExportState;
  readonly presentation: CutHostPresentationState;
}

export interface CutHostRuntimeRequest {
  readonly schemaVersion: typeof CUT_HOST_RUNTIME_VERSION;
  readonly requestId: string;
  readonly commandId: string;
  readonly route: CutHostRuntimeRoute;
  readonly identity: CutHostRuntimeIdentity;
  readonly expectedRevision: number;
  readonly payload?: unknown;
}

export interface CutHostRuntimeProjectionEvent {
  readonly schemaVersion: typeof CUT_HOST_RUNTIME_VERSION;
  readonly sequence: number;
  readonly snapshot: CutHostRuntimeSnapshot;
}

export interface CutHostRuntimeResult {
  readonly schemaVersion: typeof CUT_HOST_RUNTIME_VERSION;
  readonly snapshot: CutHostRuntimeSnapshot;
  readonly output?:
    | {
        readonly type: 'representations';
        readonly revision: number;
        readonly results: readonly CutClipRepresentationResult[];
      }
    | {
        readonly type: 'preview';
        readonly message: CutHostPreviewMessage;
      };
}

export interface CutHostPreviewAudioPlayback {
  readonly mediaOriginSeconds: number;
  readonly playbackRate: number;
  readonly positionSeconds: number;
  readonly clipDurationSeconds: number;
  readonly fadeInSeconds: number;
  readonly fadeOutSeconds: number;
}

export type CutHostPreviewMessage =
  | {
      readonly type: 'cut:preview-ready' | 'cut:preview-prepared';
      readonly generation: number;
      readonly videoClipId?: string;
      readonly timelineTimeSeconds: number;
      readonly segmentEndSeconds: number;
      readonly playbackEndSeconds: number;
      readonly mediaSourceTimeSeconds?: number;
      readonly mediaPlaybackRate?: number;
      readonly width: number;
      readonly height: number;
      readonly framesPerSecond: number;
      readonly video?: CutHtmlVideoDescriptor;
      readonly videoPlaybackRate?: number;
      readonly audioStreams: readonly CutPcmStreamDescriptor[];
      readonly audioGainsDb: readonly number[];
      readonly audioPlayback: readonly CutHostPreviewAudioPlayback[];
    }
  | {
      readonly type: 'cut:preview-activated';
      readonly generation: number;
    };

export interface CutHostRuntime {
  readonly identity: CutHostRuntimeIdentity;
  getSnapshot(): Promise<CutHostRuntimeSnapshot>;
  execute(request: CutHostRuntimeRequest): Promise<CutHostRuntimeResult>;
  subscribe(listener: (event: CutHostRuntimeProjectionEvent) => void): () => void;
}

export class CutHostRuntimeContractError extends Error {
  readonly code:
    | 'invalid-cut-host-runtime-payload'
    | 'unsupported-cut-host-runtime-version'
    | 'cut-host-runtime-stale-identity';

  constructor(code: CutHostRuntimeContractError['code'], message: string) {
    super(message);
    this.name = 'CutHostRuntimeContractError';
    this.code = code;
  }
}

export function parseCutHostRuntimeIdentity(value: unknown): CutHostRuntimeIdentity {
  const record = requireRecord(value, 'Cut Host runtime identity must be an object.');
  return {
    projectId: requireIdentity(record['projectId'], 'Cut Project identity is required.'),
    workspaceId: requireIdentity(record['workspaceId'], 'Cut Workspace identity is required.'),
    windowId: requireIdentity(record['windowId'], 'Cut Window identity is required.'),
    viewId: requireIdentity(record['viewId'], 'Cut View identity is required.'),
    viewEpoch: requireNonNegativeInteger(
      record['viewEpoch'],
      'Cut View epoch must be a non-negative integer.',
    ),
    documentId: requireIdentity(record['documentId'], 'Cut document identity is required.'),
    sessionId: requireIdentity(record['sessionId'], 'Cut session identity is required.'),
    endpointEpoch: requireIdentity(record['endpointEpoch'], 'Cut endpoint epoch is required.'),
  };
}

export function parseCutHostRuntimeRequest(value: unknown): CutHostRuntimeRequest {
  const record = requireRecord(value, 'Cut Host runtime request must be an object.');
  requireVersion(record['schemaVersion']);
  const route = Object.values(CUT_HOST_RUNTIME_ROUTES).find(
    (candidate) => candidate === record['route'],
  );
  if (!route) throw invalidPayload('Cut Host runtime route is invalid.');
  return {
    schemaVersion: CUT_HOST_RUNTIME_VERSION,
    requestId: requireIdentity(record['requestId'], 'Cut request identity is required.'),
    commandId: requireIdentity(record['commandId'], 'Cut command identity is required.'),
    route,
    identity: parseCutHostRuntimeIdentity(record['identity']),
    expectedRevision: requireNonNegativeInteger(
      record['expectedRevision'],
      'Cut expected revision must be a non-negative integer.',
    ),
    ...(record['payload'] === undefined ? {} : { payload: record['payload'] }),
  };
}

export function parseCutHostRuntimeSnapshot(value: unknown): CutHostRuntimeSnapshot {
  const record = requireRecord(value, 'Cut Host runtime snapshot must be an object.');
  requireVersion(record['schemaVersion']);
  if (!('document' in record)) {
    throw invalidPayload('Cut Host runtime snapshot document projection is required.');
  }
  return {
    schemaVersion: CUT_HOST_RUNTIME_VERSION,
    identity: parseCutHostRuntimeIdentity(record['identity']),
    revision: requireNonNegativeInteger(
      record['revision'],
      'Cut Host runtime revision must be a non-negative integer.',
    ),
    dirty: requireBoolean(record['dirty'], 'Cut Host runtime dirty state is required.'),
    document: record['document'],
    playback: record['playback'],
    export: parseCutHostExportState(record['export']),
    presentation: parseCutHostPresentationState(record['presentation']),
  };
}

export function parseCutHostExportState(value: unknown): CutHostExportState {
  const record = requireRecord(value, 'Cut Host export state must be an object.');
  const tasks = requireArray(record['tasks'], 'Cut Host export tasks must be an array.').map(
    parseCutExportTaskSnapshot,
  );
  return { tasks };
}

export function parseCutHostPresentationState(value: unknown): CutHostPresentationState {
  const record = requireRecord(value, 'Cut Host presentation state must be an object.');
  const previewVolume = requireFinite(
    record['previewVolume'],
    'Cut preview volume must be finite.',
  );
  if (previewVolume < 0 || previewVolume > 1) {
    throw invalidPayload('Cut preview volume must be between 0 and 1.');
  }
  const pixelsPerSecond = requireFinite(
    record['pixelsPerSecond'],
    'Cut Timeline scale must be finite.',
  );
  if (pixelsPerSecond < 8 || pixelsPerSecond > 480) {
    throw invalidPayload('Cut Timeline scale must be between 8 and 480 pixels per second.');
  }
  return {
    previewVolume,
    previewMuted: requireBoolean(record['previewMuted'], 'Cut preview mute state is required.'),
    pixelsPerSecond,
    snappingEnabled: requireBoolean(
      record['snappingEnabled'],
      'Cut Timeline snapping state is required.',
    ),
    overviewVisible: requireBoolean(
      record['overviewVisible'],
      'Cut Timeline overview state is required.',
    ),
  };
}

function parseCutExportTaskSnapshot(value: unknown): CutExportTaskSnapshot {
  const record = requireRecord(value, 'Cut export task must be an object.');
  const status = record['status'];
  if (
    status !== 'running' &&
    status !== 'completed' &&
    status !== 'failed' &&
    status !== 'cancelled'
  ) {
    throw invalidPayload('Cut export task status is invalid.');
  }
  const outputWorkspaceRelativePath = requireIdentity(
    record['outputWorkspaceRelativePath'],
    'Cut export output path is required.',
  );
  if (
    outputWorkspaceRelativePath.startsWith('/') ||
    outputWorkspaceRelativePath.includes('\\') ||
    outputWorkspaceRelativePath.split('/').includes('..')
  ) {
    throw invalidPayload('Cut export output path must be workspace-relative.');
  }
  const settings = parseCutExportSettings(record['settings']);
  const diagnostic = record['diagnostic'];
  if (
    diagnostic !== undefined &&
    (!isRecord(diagnostic) || diagnostic['code'] !== 'export-failed')
  ) {
    throw invalidPayload('Cut export diagnostic is invalid.');
  }
  return {
    jobId: requireIdentity(record['jobId'], 'Cut export Job identity is required.'),
    documentUri: requireIdentity(record['documentUri'], 'Cut export document is required.'),
    sessionId: requireIdentity(record['sessionId'], 'Cut export session is required.'),
    sourceRevision: requireNonNegativeInteger(
      record['sourceRevision'],
      'Cut export source revision is invalid.',
    ),
    settings,
    outputWorkspaceRelativePath,
    status,
    startedAt: requireNonNegativeInteger(
      record['startedAt'],
      'Cut export start timestamp is invalid.',
    ),
    ...(record['finishedAt'] === undefined
      ? {}
      : {
          finishedAt: requireNonNegativeInteger(
            record['finishedAt'],
            'Cut export finish timestamp is invalid.',
          ),
        }),
    ...(diagnostic === undefined ? {} : { diagnostic: { code: 'export-failed' } }),
  };
}

function parseCutExportSettings(value: unknown): CutExportSettings {
  const record = requireRecord(value, 'Cut export settings must be an object.');
  const container = record['container'];
  const audioSampleRate = record['audioSampleRate'];
  if (container !== 'mp4' && container !== 'mov') {
    throw invalidPayload('Cut export container is invalid.');
  }
  if (audioSampleRate !== 44_100 && audioSampleRate !== 48_000) {
    throw invalidPayload('Cut export audio sample rate is invalid.');
  }
  return {
    outputName: requireIdentity(record['outputName'], 'Cut export output name is required.'),
    container,
    width: requirePositiveInteger(record['width'], 'Cut export width is invalid.'),
    height: requirePositiveInteger(record['height'], 'Cut export height is invalid.'),
    framesPerSecond: requirePositiveFinite(
      record['framesPerSecond'],
      'Cut export frame rate is invalid.',
    ),
    videoBitrate: requirePositiveInteger(
      record['videoBitrate'],
      'Cut export video bitrate is invalid.',
    ),
    includeAudio: requireBoolean(record['includeAudio'], 'Cut export audio inclusion is required.'),
    audioBitrate: requirePositiveInteger(
      record['audioBitrate'],
      'Cut export audio bitrate is invalid.',
    ),
    audioSampleRate,
  };
}

export function parseCutHostRuntimeResult(value: unknown): CutHostRuntimeResult {
  const record = requireRecord(value, 'Cut Host runtime result must be an object.');
  requireVersion(record['schemaVersion']);
  const snapshot = parseCutHostRuntimeSnapshot(record['snapshot']);
  const outputValue = record['output'];
  if (outputValue === undefined) {
    return { schemaVersion: CUT_HOST_RUNTIME_VERSION, snapshot };
  }
  const output = requireRecord(outputValue, 'Cut Host runtime output must be an object.');
  if (output['type'] === 'preview') {
    return {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      snapshot,
      output: {
        type: 'preview',
        message: parseCutHostPreviewMessage(output['message']),
      },
    };
  }
  if (output['type'] !== 'representations') {
    throw invalidPayload('Cut Host runtime output type is invalid.');
  }
  const revision = requireNonNegativeInteger(
    output['revision'],
    'Cut representation output revision must be a non-negative integer.',
  );
  if (revision !== snapshot.revision) {
    throw invalidPayload('Cut representation output revision does not match its snapshot.');
  }
  if (!Array.isArray(output['results'])) {
    throw invalidPayload('Cut representation output results must be an array.');
  }
  return {
    schemaVersion: CUT_HOST_RUNTIME_VERSION,
    snapshot,
    output: {
      type: 'representations',
      revision,
      results: output['results'].map(parseCutClipRepresentationResult),
    },
  };
}

export function parseCutHostPreviewMessage(value: unknown): CutHostPreviewMessage {
  const record = requireRecord(value, 'Cut preview output must be an object.');
  const generation = requirePositiveInteger(
    record['generation'],
    'Cut preview generation must be positive.',
  );
  if (record['type'] === 'cut:preview-activated') {
    return { type: 'cut:preview-activated', generation };
  }
  if (record['type'] !== 'cut:preview-ready' && record['type'] !== 'cut:preview-prepared') {
    throw invalidPayload('Cut preview output type is invalid.');
  }
  const audioStreams = requireArray(
    record['audioStreams'],
    'Cut preview audio streams must be an array.',
  ).map(parseCutPcmStreamDescriptor);
  const audioGainsDb = requireArray(
    record['audioGainsDb'],
    'Cut preview audio gains must be an array.',
  ).map((gain) => requireFinite(gain, 'Cut preview audio gain must be finite.'));
  const audioPlayback = requireArray(
    record['audioPlayback'],
    'Cut preview audio playback must be an array.',
  ).map(parseCutHostPreviewAudioPlayback);
  if (audioStreams.length !== audioGainsDb.length || audioStreams.length !== audioPlayback.length) {
    throw invalidPayload('Cut preview audio projections must have matching lengths.');
  }
  return {
    type: record['type'],
    generation,
    ...(record['videoClipId'] === undefined
      ? {}
      : {
          videoClipId: requireIdentity(
            record['videoClipId'],
            'Cut preview Video Clip identity is invalid.',
          ),
        }),
    timelineTimeSeconds: requireNonNegativeFinite(
      record['timelineTimeSeconds'],
      'Cut preview timeline time must be non-negative.',
    ),
    segmentEndSeconds: requirePositiveFinite(
      record['segmentEndSeconds'],
      'Cut preview segment end must be positive.',
    ),
    playbackEndSeconds: requirePositiveFinite(
      record['playbackEndSeconds'],
      'Cut preview playback end must be positive.',
    ),
    ...(record['mediaSourceTimeSeconds'] === undefined
      ? {}
      : {
          mediaSourceTimeSeconds: requireNonNegativeFinite(
            record['mediaSourceTimeSeconds'],
            'Cut preview media source time must be non-negative.',
          ),
        }),
    ...(record['mediaPlaybackRate'] === undefined
      ? {}
      : {
          mediaPlaybackRate: requirePositiveFinite(
            record['mediaPlaybackRate'],
            'Cut preview media playback rate must be positive.',
          ),
        }),
    width: requireNonNegativeFinite(record['width'], 'Cut preview width must be non-negative.'),
    height: requireNonNegativeFinite(record['height'], 'Cut preview height must be non-negative.'),
    framesPerSecond: requireNonNegativeFinite(
      record['framesPerSecond'],
      'Cut preview frame rate must be non-negative.',
    ),
    ...(record['video'] === undefined
      ? {}
      : { video: parseCutHtmlVideoDescriptor(record['video']) }),
    ...(record['videoPlaybackRate'] === undefined
      ? {}
      : {
          videoPlaybackRate: requirePositiveFinite(
            record['videoPlaybackRate'],
            'Cut preview Video playback rate must be positive.',
          ),
        }),
    audioStreams,
    audioGainsDb,
    audioPlayback,
  };
}

export function parseCutHostRuntimeProjectionEvent(value: unknown): CutHostRuntimeProjectionEvent {
  const record = requireRecord(value, 'Cut Host runtime event must be an object.');
  requireVersion(record['schemaVersion']);
  return {
    schemaVersion: CUT_HOST_RUNTIME_VERSION,
    sequence: requirePositiveInteger(
      record['sequence'],
      'Cut Host runtime event sequence must be a positive integer.',
    ),
    snapshot: parseCutHostRuntimeSnapshot(record['snapshot']),
  };
}

export function assertCutHostRuntimeIdentity(
  expected: CutHostRuntimeIdentity,
  actual: CutHostRuntimeIdentity,
): void {
  for (const key of [
    'projectId',
    'workspaceId',
    'windowId',
    'viewId',
    'viewEpoch',
    'documentId',
    'sessionId',
    'endpointEpoch',
  ] as const) {
    if (expected[key] !== actual[key]) {
      throw new CutHostRuntimeContractError(
        'cut-host-runtime-stale-identity',
        `Cut ${key} does not match its owning runtime.`,
      );
    }
  }
}

function requireVersion(value: unknown): void {
  if (value !== CUT_HOST_RUNTIME_VERSION) {
    throw new CutHostRuntimeContractError(
      'unsupported-cut-host-runtime-version',
      `Unsupported Cut Host runtime version '${String(value)}'.`,
    );
  }
}

function requireIdentity(value: unknown, message: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('://')
  ) {
    throw invalidPayload(message);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw invalidPayload(message);
  return value as number;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw invalidPayload(message);
  return value as number;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw invalidPayload(message);
  return value;
}

function parseCutClipRepresentationResult(value: unknown): CutClipRepresentationResult {
  const record = requireRecord(value, 'Cut representation result must be an object.');
  const clipId = requireIdentity(
    record['clipId'],
    'Cut representation result Clip identity is required.',
  );
  if (record['kind'] === 'thumbnail') {
    const density = requireThumbnailDensity(record['density']);
    const tileIndex = requireNonNegativeInteger(
      record['tileIndex'],
      'Cut thumbnail tile index must be a non-negative integer.',
    );
    if (record['status'] === 'ready') {
      const sourceTimeSeconds = requireNonNegativeFinite(
        record['sourceTimeSeconds'],
        'Cut thumbnail source time must be non-negative.',
      );
      const dataUrl = record['dataUrl'];
      if (
        typeof dataUrl !== 'string' ||
        !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(dataUrl)
      ) {
        throw invalidPayload('Cut thumbnail result must contain a bounded image data URL.');
      }
      return {
        clipId,
        kind: 'thumbnail',
        status: 'ready',
        density,
        tileIndex,
        sourceTimeSeconds,
        dataUrl,
      };
    }
    if (record['status'] === 'unavailable') {
      return {
        clipId,
        kind: 'thumbnail',
        status: 'unavailable',
        density,
        tileIndex,
        message: requireMessage(record['message']),
        ...(record['failureScope'] === undefined
          ? {}
          : { failureScope: requireFailureScope(record['failureScope']) }),
      };
    }
  }
  if (record['kind'] === 'waveform') {
    const peaksPerSecond = requirePositiveInteger(
      record['peaksPerSecond'],
      'Cut waveform peaks per second must be positive.',
    );
    if (record['status'] === 'unavailable') {
      return {
        clipId,
        kind: 'waveform',
        status: 'unavailable',
        peaksPerSecond,
        message: requireMessage(record['message']),
        ...(record['failureScope'] === undefined
          ? {}
          : { failureScope: requireFailureScope(record['failureScope']) }),
      };
    }
    if (record['status'] === 'ready' || record['status'] === 'partial') {
      const waveform = requireRecord(record['waveform'], 'Cut waveform result is required.');
      if (
        !Array.isArray(waveform['peaks']) ||
        !waveform['peaks'].every((peak) => typeof peak === 'number' && Number.isFinite(peak))
      ) {
        throw invalidPayload('Cut waveform peaks are invalid.');
      }
      const projected = {
        peaks: waveform['peaks'],
        durationSeconds: requireNonNegativeFinite(
          waveform['durationSeconds'],
          'Cut waveform duration must be non-negative.',
        ),
        peaksPerSecond: requirePositiveInteger(
          waveform['peaksPerSecond'],
          'Cut waveform density must be positive.',
        ),
      };
      if (record['status'] === 'ready') {
        return { clipId, kind: 'waveform', status: 'ready', peaksPerSecond, waveform: projected };
      }
      const partial = requireRecord(
        waveform['partial'],
        'Partial Cut waveform metadata is required.',
      );
      return {
        clipId,
        kind: 'waveform',
        status: 'partial',
        peaksPerSecond,
        waveform: {
          ...projected,
          partial: {
            availableDurationSeconds: requireNonNegativeFinite(
              partial['availableDurationSeconds'],
              'Available Cut waveform duration must be non-negative.',
            ),
            failureScope: requireMediaFailureScope(partial['failureScope']),
            message: requireMessage(partial['message']),
          },
        },
      };
    }
  }
  throw invalidPayload('Cut representation result kind or status is invalid.');
}

function requireThumbnailDensity(value: unknown): CutThumbnailDensity {
  if (
    value !== 8 &&
    value !== 16 &&
    value !== 32 &&
    value !== 64 &&
    value !== 128 &&
    value !== 256 &&
    value !== 512
  ) {
    throw invalidPayload('Cut thumbnail density is invalid.');
  }
  return value;
}

function requireFailureScope(value: unknown): CutRepresentationFailureScope {
  if (value !== 'source' && value !== 'stream' && value !== 'interval' && value !== 'operation') {
    throw invalidPayload('Cut representation failure scope is invalid.');
  }
  return value;
}

function requireMediaFailureScope(value: unknown): CutMediaFailureScope {
  if (value !== 'source' && value !== 'stream' && value !== 'interval') {
    throw invalidPayload('Cut media failure scope is invalid.');
  }
  return value;
}

function requireNonNegativeFinite(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requirePositiveFinite(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireFinite(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidPayload(message);
  return value;
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalidPayload(message);
  return value;
}

function parseCutHtmlVideoDescriptor(value: unknown): CutHtmlVideoDescriptor {
  const record = requireRecord(value, 'Cut preview Video descriptor must be an object.');
  const url = requireMediaUrl(record['url']);
  const preparationProfile = record['preparationProfile'];
  if (
    preparationProfile !== 'h264-mp4-direct' &&
    preparationProfile !== 'h264-mp4-remux' &&
    preparationProfile !== 'vp8-webm-direct' &&
    preparationProfile !== 'h264-sdr-transcode'
  ) {
    throw invalidPayload('Cut preview preparation profile is invalid.');
  }
  if (record['version'] !== 1 || typeof record['mimeType'] !== 'string') {
    throw invalidPayload('Cut preview Video descriptor is invalid.');
  }
  return {
    version: 1,
    url,
    mimeType: record['mimeType'],
    preparationProfile,
    mediaTimeOriginSeconds: requireNonNegativeFinite(
      record['mediaTimeOriginSeconds'],
      'Cut preview media origin must be non-negative.',
    ),
    durationSeconds: requirePositiveFinite(
      record['durationSeconds'],
      'Cut preview duration must be positive.',
    ),
  };
}

function parseCutPcmStreamDescriptor(value: unknown): CutPcmStreamDescriptor {
  const record = requireRecord(value, 'Cut preview PCM descriptor must be an object.');
  if (record['version'] !== 1 || record['protocol'] !== 'neko-pcm-f32le-v1') {
    throw invalidPayload('Cut preview PCM descriptor is invalid.');
  }
  return {
    version: 1,
    protocol: 'neko-pcm-f32le-v1',
    streamUrl: requireMediaUrl(record['streamUrl']),
    sampleRate: requirePositiveFinite(
      record['sampleRate'],
      'Cut preview PCM sample rate must be positive.',
    ),
    channels: requirePositiveInteger(
      record['channels'],
      'Cut preview PCM channel count must be positive.',
    ),
  };
}

function parseCutHostPreviewAudioPlayback(value: unknown): CutHostPreviewAudioPlayback {
  const record = requireRecord(value, 'Cut preview audio playback must be an object.');
  const clipDurationSeconds = requirePositiveFinite(
    record['clipDurationSeconds'],
    'Cut preview audio Clip duration must be positive.',
  );
  const positionSeconds = requireNonNegativeFinite(
    record['positionSeconds'],
    'Cut preview audio position must be non-negative.',
  );
  if (positionSeconds >= clipDurationSeconds) {
    throw invalidPayload('Cut preview audio position must be inside the Clip duration.');
  }
  const fadeInSeconds = requireNonNegativeFinite(
    record['fadeInSeconds'],
    'Cut preview audio fade-in must be non-negative.',
  );
  const fadeOutSeconds = requireNonNegativeFinite(
    record['fadeOutSeconds'],
    'Cut preview audio fade-out must be non-negative.',
  );
  if (fadeInSeconds > clipDurationSeconds || fadeOutSeconds > clipDurationSeconds) {
    throw invalidPayload('Cut preview audio fades must fit inside the Clip duration.');
  }
  return {
    mediaOriginSeconds: requireNonNegativeFinite(
      record['mediaOriginSeconds'],
      'Cut preview audio media origin must be non-negative.',
    ),
    playbackRate: requirePositiveFinite(
      record['playbackRate'],
      'Cut preview audio playback rate must be positive.',
    ),
    positionSeconds,
    clipDurationSeconds,
    fadeInSeconds,
    fadeOutSeconds,
  };
}

function requireMediaUrl(value: unknown): string {
  if (typeof value !== 'string') throw invalidPayload('Cut preview media URL is invalid.');
  const url = new URL(value);
  const valid =
    url.protocol === 'openneko:' &&
    url.hostname === 'resource' &&
    /^\/[A-Za-z0-9_-]{32}$/u.test(url.pathname);
  if (!valid || url.username || url.password || url.search || url.hash) {
    throw invalidPayload('Cut preview media resource URL is invalid.');
  }
  return value;
}

function requireMessage(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidPayload('Cut representation diagnostic message is required.');
  }
  return value;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPayload(message: string): CutHostRuntimeContractError {
  return new CutHostRuntimeContractError('invalid-cut-host-runtime-payload', message);
}
