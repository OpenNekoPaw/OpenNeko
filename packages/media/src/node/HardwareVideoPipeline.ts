import { FfmpegCommandError } from './NodeFfmpegProcess';

export type HardwareVideoBackend = 'videotoolbox' | 'unavailable';
export type QualifiedHardwareVideoBackend = Exclude<HardwareVideoBackend, 'unavailable'>;

export interface HardwareVideoFailure {
  readonly capability: string;
}

export interface HardwareVideoPipeline {
  readonly backend: QualifiedHardwareVideoBackend;
  readonly displayName: string;
  readonly acceleratorCapability: 'videoToolbox';
  readonly encoderCapability: 'h264VideoToolbox';
  readonly filterCapability: 'scaleVt';
  readonly decodeInputArgs: readonly string[];
  readonly h264EncoderArgs: readonly string[];
  buildSdrFilter(width: number, height: number, sourceIsHdr: boolean): string;
  buildFrameCaptureFilter(width: number, height: number): string;
  classifyFailure(error: unknown, codecName: string): HardwareVideoFailure | undefined;
}

const VIDEO_TOOLBOX_PIPELINE: HardwareVideoPipeline = Object.freeze({
  backend: 'videotoolbox',
  displayName: 'VideoToolbox',
  acceleratorCapability: 'videoToolbox',
  encoderCapability: 'h264VideoToolbox',
  filterCapability: 'scaleVt',
  decodeInputArgs: Object.freeze([
    '-hwaccel',
    'videotoolbox',
    '-hwaccel_output_format',
    'videotoolbox_vld',
  ]),
  h264EncoderArgs: Object.freeze([
    '-c:v',
    'h264_videotoolbox',
    '-allow_sw',
    '0',
    '-realtime',
    '1',
    '-prio_speed',
    '1',
  ]),
  buildSdrFilter: (width: number, height: number, _sourceIsHdr: boolean) =>
    [
      `scale_vt=w=${width}:h=${height}`,
      'color_matrix=bt709',
      'color_primaries=bt709',
      'color_transfer=bt709',
    ].join(':'),
  buildFrameCaptureFilter: (width: number, height: number) =>
    `scale_vt=w=${width}:h=${height},hwdownload,format=nv12,format=yuvj420p`,
  classifyFailure: (error: unknown, codecName: string) =>
    classifyVideoToolboxFailure(error, codecName),
});

export function resolveHardwareVideoBackend(
  platform = process.platform,
  arch = process.arch,
): HardwareVideoBackend {
  if (platform === 'darwin' && arch === 'arm64') return 'videotoolbox';
  return 'unavailable';
}

export function getHardwareVideoPipeline(
  backend: HardwareVideoBackend,
): HardwareVideoPipeline | undefined {
  if (backend === 'videotoolbox') return VIDEO_TOOLBOX_PIPELINE;
  return undefined;
}

function classifyVideoToolboxFailure(
  error: unknown,
  codecName: string,
): HardwareVideoFailure | undefined {
  if (!(error instanceof FfmpegCommandError)) return undefined;
  if (
    /(?:videotoolbox decoder .* not found|doesn't support hardware accelerated .* decoding|failed setup for format videotoolbox|no device available for decoder|\[dec:[^\]]+\][^\n]*function not implemented)/iu.test(
      error.stderr,
    )
  ) {
    return { capability: `${codecName.toUpperCase()} VideoToolbox decoder` };
  }
  if (/(?:unknown encoder|encoder .* not found).*h264_videotoolbox/iu.test(error.stderr)) {
    return { capability: 'H.264 VideoToolbox encoder' };
  }
  if (/(?:no such filter|filter not found).*scale_vt/iu.test(error.stderr)) {
    return { capability: 'VideoToolbox scale_vt filter' };
  }
  if (
    /(?:parsed_scale_vt|error reinitializing filters|\[vf[^\]]*\][^\n]*function not implemented)/iu.test(
      error.stderr,
    )
  ) {
    return { capability: 'VideoToolbox video processing pipeline' };
  }
  return undefined;
}
