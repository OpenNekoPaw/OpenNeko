import type { TimelineView } from './projection';

export interface CutRuntimeMediaSource {
  readonly workspaceRelativePath: string;
}

export interface CutMediaColorMetadata {
  readonly colorPrimaries?: string;
  readonly colorTransfer?: string;
  readonly colorSpace?: string;
  readonly colorRange?: string;
}

export interface CutMediaVideoStream {
  readonly streamIndex: number;
  readonly codecName: string;
  readonly profile?: string;
  readonly level?: number;
  readonly pixelFormat?: string;
  readonly bitDepth?: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly color?: CutMediaColorMetadata;
}

export interface CutMediaAudioStream {
  readonly streamIndex: number;
  readonly codecName: string;
  readonly profile?: string;
  readonly channels: number;
  readonly channelLayout?: string;
  readonly sampleRate: number;
}

export interface CutMediaProbe {
  readonly durationSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly audioChannels?: number;
  readonly audioSampleRate?: number;
  readonly video?: CutMediaVideoStream;
  readonly audioStreams: readonly CutMediaAudioStream[];
}

export interface MediaProbePort {
  probe(source: CutRuntimeMediaSource, signal?: AbortSignal): Promise<CutMediaProbe>;
}

export interface FrameCapturePort {
  captureFrame(
    source: CutRuntimeMediaSource,
    timeSeconds: number,
    options: { readonly width: number; readonly height: number },
    signal?: AbortSignal,
  ): Promise<{ readonly dataUrl: string }>;
}

export interface CutWaveform {
  readonly peaks: readonly number[];
  readonly durationSeconds: number;
  readonly peaksPerSecond: number;
  readonly partial?: {
    readonly availableDurationSeconds: number;
    readonly failureScope: CutMediaFailureScope;
    readonly message: string;
  };
}

export type CutMediaFailureScope = 'source' | 'stream' | 'interval';
export type CutRepresentationFailureScope = CutMediaFailureScope | 'operation';

export interface AudioWaveformPort {
  generateWaveform(
    source: CutRuntimeMediaSource,
    options: { readonly peaksPerSecond: number },
    signal?: AbortSignal,
  ): Promise<CutWaveform>;
}

export type CutClipRepresentationRequest =
  | {
      readonly clipId: string;
      readonly kind: 'thumbnail';
      readonly sampleCount: number;
    }
  | {
      readonly clipId: string;
      readonly kind: 'waveform';
      readonly peaksPerSecond: number;
    };

export type CutClipRepresentationResult =
  | {
      readonly clipId: string;
      readonly kind: 'thumbnail';
      readonly status: 'ready';
      readonly thumbnails: readonly {
        readonly sourceTimeSeconds: number;
        readonly dataUrl: string;
      }[];
    }
  | {
      readonly clipId: string;
      readonly kind: 'thumbnail';
      readonly status: 'partial';
      readonly thumbnails: readonly {
        readonly sourceTimeSeconds: number;
        readonly dataUrl: string;
      }[];
      readonly failures: readonly {
        readonly sourceTimeSeconds: number;
        readonly failureScope: CutRepresentationFailureScope;
        readonly message: string;
      }[];
    }
  | {
      readonly clipId: string;
      readonly kind: 'waveform';
      readonly status: 'ready';
      readonly waveform: CutWaveform;
    }
  | {
      readonly clipId: string;
      readonly kind: 'waveform';
      readonly status: 'partial';
      readonly waveform: CutWaveform & { readonly partial: NonNullable<CutWaveform['partial']> };
    }
  | {
      readonly clipId: string;
      readonly kind: 'thumbnail' | 'waveform';
      readonly status: 'unavailable';
      readonly message: string;
      readonly failureScope?: CutRepresentationFailureScope;
    };

export type CutPreviewPreparationProfile =
  | 'h264-fragmented-mp4-copy'
  | 'h264-fragmented-mp4-remux'
  | 'vp8-webm-direct'
  | 'h264-sdr-transcode';

export interface CutMseSegmentDescriptor {
  readonly index: number;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
  readonly url: string;
}

export interface CutMseVideoDescriptor {
  readonly version: 1;
  readonly transport: 'http-mse';
  readonly mimeType: string;
  readonly preparationProfile: CutPreviewPreparationProfile;
  readonly mediaTimeOriginSeconds: number;
  readonly durationSeconds: number;
  readonly initSegmentUrl?: string;
  readonly segments: readonly CutMseSegmentDescriptor[];
}

export interface CutPcmStreamDescriptor {
  readonly version: 1;
  readonly transport: 'http';
  readonly protocol: 'neko-pcm-f32le-v1';
  readonly streamUrl: string;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface CutPreviewSession {
  readonly sessionId: string;
  readonly video: CutMseVideoDescriptor;
}

export interface CutPcmSession {
  readonly sessionId: string;
  readonly stream: CutPcmStreamDescriptor;
}

export interface VideoPreviewPort {
  startPreview(
    source: CutRuntimeMediaSource,
    options: {
      readonly startTimeSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
      readonly startPaused: boolean;
    },
    signal?: AbortSignal,
  ): Promise<CutPreviewSession>;
  resumePreview(sessionId: string): Promise<void>;
  stopPreview(sessionId: string): Promise<void>;
}

export interface AudioPcmStreamPort {
  startPcm(
    source: CutRuntimeMediaSource,
    options: {
      readonly startTimeSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
      readonly startPaused: boolean;
      readonly audioStreamIndex?: number;
    },
    signal?: AbortSignal,
  ): Promise<CutPcmSession>;
  resumePcm(sessionId: string): Promise<void>;
  stopPcm(sessionId: string): Promise<void>;
}

export interface ExportJobPort {
  export(
    request: CutExportRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly outputWorkspaceRelativePath: string }>;
}

export interface CutMediaRuntimeAdapter
  extends
    MediaProbePort,
    FrameCapturePort,
    AudioWaveformPort,
    VideoPreviewPort,
    AudioPcmStreamPort,
    ExportJobPort {
  dispose(): Promise<void>;
}

export interface CutExportSettings {
  readonly outputName: string;
  readonly container: 'mp4' | 'mov';
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly videoBitrate: number;
  readonly includeAudio: boolean;
  readonly audioBitrate: number;
  readonly audioSampleRate: 44_100 | 48_000;
}

export interface CutExportRequest {
  readonly timeline: TimelineView;
  readonly outputWorkspaceRelativePath: string;
  readonly settings: CutExportSettings;
}

export class CutMediaRuntimeUnavailableError extends Error {
  readonly code = 'media-runtime-unavailable';

  constructor(readonly capability: string) {
    super(`Cut media runtime is unavailable for ${capability}.`);
    this.name = 'CutMediaRuntimeUnavailableError';
  }
}

export class CutMediaCorruptionError extends Error {
  constructor(
    readonly scope: CutMediaFailureScope,
    readonly operation: string,
    detail: string,
  ) {
    super(`Media corruption in ${scope} while attempting ${operation}. ${detail}`);
    this.name = 'CutMediaCorruptionError';
  }
}
