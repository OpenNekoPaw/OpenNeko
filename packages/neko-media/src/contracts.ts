export interface MediaSource {
  readonly path: string;
}

export type MediaFailureScope = 'source' | 'stream' | 'interval' | 'operation';

export interface MediaColorMetadata {
  readonly primaries?: string;
  readonly transfer?: string;
  readonly space?: string;
  readonly range?: string;
}

export interface MediaVideoStream {
  readonly streamIndex: number;
  readonly codecName: string;
  readonly codecProfile?: string;
  readonly codecLevel?: number;
  readonly pixelFormat?: string;
  readonly bitDepth?: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly color: MediaColorMetadata;
}

export interface MediaAudioStream {
  readonly streamIndex: number;
  readonly codecName: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly channelLayout?: string;
}

export interface MediaProbe {
  readonly durationSeconds: number;
  readonly formatName?: string;
  readonly bitRate?: number;
  readonly video?: MediaVideoStream;
  readonly audioStreams: readonly MediaAudioStream[];
}

export interface MseVideoSegment {
  readonly index: number;
  readonly url: string;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
}

export interface MseVideoDescriptor {
  readonly version: 1;
  readonly transport: 'http-mse';
  readonly mimeType: string;
  readonly preparationProfile:
    | 'h264-fragmented-mp4-copy'
    | 'h264-fragmented-mp4-remux'
    | 'vp8-webm-direct'
    | 'h264-sdr-transcode';
  readonly mediaTimeOriginSeconds: number;
  readonly durationSeconds: number;
  readonly initSegmentUrl?: string;
  readonly segments: readonly MseVideoSegment[];
}

export interface PcmStreamDescriptor {
  readonly version: 1;
  readonly transport: 'http';
  readonly protocol: 'neko-pcm-f32le-v1';
  readonly streamUrl: string;
  readonly sampleRate: number;
  readonly channels: number;
}

export type HtmlVideoPreparationProfile =
  'h264-mp4-direct' | 'vp8-webm-direct' | 'h264-mp4-remux' | 'h264-sdr-transcode';

export interface HtmlVideoDescriptor {
  readonly version: 1;
  readonly transport: 'http';
  readonly url: string;
  readonly mimeType: string;
  readonly preparationProfile: HtmlVideoPreparationProfile;
  readonly durationSeconds: number;
}

export interface WaveformResult {
  readonly peaks: readonly number[];
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly partial?: {
    readonly availableDurationSeconds: number;
    readonly failureScope: MediaFailureScope;
    readonly message: string;
  };
}

export interface MediaRuntimeQualification {
  readonly ffmpegVersion: string;
  readonly ffprobeVersion: string;
  readonly decoders: {
    readonly h264: boolean;
    readonly hevc: boolean;
    readonly av1: boolean;
    readonly vp8: boolean;
  };
  readonly encoders: {
    readonly h264: boolean;
    readonly aac: boolean;
  };
  readonly filters: {
    readonly zscale: boolean;
    readonly tonemap: boolean;
  };
}

export type FrameCaptureResult =
  | {
      readonly status: 'ok';
      readonly timeSeconds: number;
      readonly dataUrl: string;
    }
  | {
      readonly status: 'corrupt';
      readonly timeSeconds: number;
      readonly scope: 'interval';
      readonly message: string;
    };
