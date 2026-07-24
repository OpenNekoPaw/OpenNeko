import type { TimelineView } from './projection';

export interface CutRuntimeMediaSource {
  readonly workspaceRelativePath: string;
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
}

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
      readonly kind: 'waveform';
      readonly status: 'ready';
      readonly waveform: CutWaveform;
    }
  | {
      readonly clipId: string;
      readonly kind: 'thumbnail' | 'waveform';
      readonly status: 'unavailable';
      readonly message: string;
    };

export interface CutPreviewSession {
  readonly sessionId: string;
  readonly videoStreamUrl?: string;
  readonly audioStreamUrl?: string;
}

export interface VideoPreviewPort {
  startPreview(
    source: CutRuntimeMediaSource,
    options: {
      readonly startTimeSeconds: number;
      readonly includeAudio: boolean;
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
      readonly playbackRate: number;
      readonly startPaused: boolean;
    },
    signal?: AbortSignal,
  ): Promise<{ readonly sessionId: string; readonly streamUrl: string }>;
  resumePcm(sessionId: string): Promise<void>;
  stopPcm(sessionId: string): Promise<void>;
}

export interface ExportJobPort {
  export(
    request: CutExportRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly outputWorkspaceRelativePath: string }>;
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

  constructor(capability: string) {
    super(`Cut media runtime is unavailable for ${capability}.`);
    this.name = 'CutMediaRuntimeUnavailableError';
  }
}
