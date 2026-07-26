import type { DiffOptions, DiffResult, MediaType } from '@neko-tools/contracts';
import type {
  HtmlVideoPreparationOptions,
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
  prepareVideo(
    sourcePath: string,
    options?: HtmlVideoPreparationOptions,
    signal?: AbortSignal,
  ): Promise<PreparedVideo>;
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
  compare(
    mediaType: MediaType,
    currentPath: string,
    previousPath: string,
    options: DiffOptions,
    signal: AbortSignal,
  ): Promise<DiffResult>;
  probe(source: string, signal?: AbortSignal): Promise<MediaProbeResult>;
}
