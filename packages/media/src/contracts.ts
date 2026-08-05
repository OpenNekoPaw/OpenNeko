export interface MediaSource {
  readonly path: string;
}

export type MediaFailureScope = 'source' | 'stream' | 'interval' | 'operation';

export function isMediaResourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'openneko:' &&
      url.hostname === 'resource' &&
      /^\/[A-Za-z0-9_-]{32}(?:\/.*)?$/u.test(url.pathname) &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

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

export interface PcmStreamDescriptor {
  readonly streamUrl: string;
  readonly sampleRate: number;
  readonly channels: number;
}

export interface HtmlAudioDescriptor {
  readonly url: string;
  readonly mimeType: string;
  readonly durationSeconds: number;
}

export type HtmlVideoPreparationProfile =
  | 'h264-mp4-direct'
  | 'av1-mp4-direct'
  | 'vp8-webm-direct'
  | 'h264-mp4-remux'
  | 'vp9-mp4-remux'
  | 'h264-sdr-transcode';

export interface HtmlVideoNativeCapabilities {
  readonly av1Mp4: boolean;
  readonly vp9Mp4: boolean;
}

export interface HtmlVideoPreparationOptions {
  readonly nativeCapabilities?: HtmlVideoNativeCapabilities;
}

export interface HtmlVideoDescriptor {
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
  readonly hardwareAccelerators: {
    readonly videoToolbox: boolean;
  };
  readonly decoders: {
    readonly h264: boolean;
    readonly hevc: boolean;
    readonly av1: boolean;
    readonly vp8: boolean;
    readonly vp9: boolean;
    readonly aac: boolean;
    readonly mp3: boolean;
    readonly flac: boolean;
    readonly dts: boolean;
  };
  readonly encoders: {
    readonly h264: boolean;
    readonly h264VideoToolbox: boolean;
    readonly aac: boolean;
  };
  readonly filters: {
    readonly zscale: boolean;
    readonly tonemap: boolean;
    readonly sidedata: boolean;
    readonly alimiter: boolean;
    readonly loudnorm: boolean;
    readonly ebur128: boolean;
    readonly scaleVt: boolean;
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
