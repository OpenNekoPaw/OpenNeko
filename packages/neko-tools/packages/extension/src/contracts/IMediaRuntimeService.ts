import type { EngineDiffResult } from '@neko/shared';
import type {
  HtmlVideoDescriptor,
  MediaProbe,
  PcmStreamDescriptor,
  WaveformResult,
} from '@neko/media';

export interface MediaProbeResult {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: string;
  readonly format: string;
  readonly bitrate?: number;
  readonly hasAudio: boolean;
  readonly audioCodec?: string;
  readonly audioSampleRate?: number;
  readonly audioChannels?: number;
}

export interface SilenceRegion {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface SilenceAnalysis {
  readonly totalDuration: number;
  readonly silenceDuration: number;
  readonly silenceRatio: number;
  readonly regionCount: number;
  readonly regions: readonly SilenceRegion[];
  readonly thresholdDbfs: number;
  readonly minDuration: number;
}

export interface PreparedVideo {
  readonly sessionId: string;
  readonly video: HtmlVideoDescriptor;
}

export interface PreparedAudio {
  readonly sessionId: string;
  readonly stream: PcmStreamDescriptor;
}

export interface IToolsMediaRuntime {
  probe(sourcePath: string, signal?: AbortSignal): Promise<MediaProbe>;
  captureFrame(
    sourcePath: string,
    timeSeconds: number,
    options?: { readonly width?: number; readonly height?: number; readonly quality?: number },
    signal?: AbortSignal,
  ): Promise<string>;
  generateWaveform(
    sourcePath: string,
    options?: { readonly peaksPerSecond?: number },
    signal?: AbortSignal,
  ): Promise<WaveformResult>;
  prepareVideo(sourcePath: string, signal?: AbortSignal): Promise<PreparedVideo>;
  startPcm(
    sourcePath: string,
    options: {
      readonly startTimeSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
    },
    signal?: AbortSignal,
  ): Promise<PreparedAudio>;
  stop(sessionId: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface IMediaRuntimeService {
  readonly runtime: IToolsMediaRuntime;
  diff(
    group: string,
    sourceA: string,
    sourceB: string,
    options?: Record<string, unknown>,
  ): Promise<EngineDiffResult>;
  detectSilence(
    source: string,
    thresholdDbfs?: number,
    minDuration?: number,
  ): Promise<SilenceAnalysis>;
  probe(group: 'videos' | 'audios', source: string): Promise<MediaProbeResult>;
}
