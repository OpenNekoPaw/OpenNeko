import { FfmpegCommandError } from './NodeFfmpegProcess';

export type HardwareVideoBackend = 'videotoolbox' | 'vaapi' | 'unavailable';
export type QualifiedHardwareVideoBackend = Exclude<HardwareVideoBackend, 'unavailable'>;

export interface HardwareVideoFailure {
  readonly capability: string;
}

export interface HardwareVideoPipeline {
  readonly backend: QualifiedHardwareVideoBackend;
  readonly displayName: string;
  readonly acceleratorCapability: 'videoToolbox' | 'vaapi';
  readonly encoderCapability: 'h264VideoToolbox' | 'h264Vaapi';
  readonly filterCapability: 'scaleVt' | 'scaleVaapi';
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

const VAAPI_PIPELINE: HardwareVideoPipeline = Object.freeze({
  backend: 'vaapi',
  displayName: 'VAAPI',
  acceleratorCapability: 'vaapi',
  encoderCapability: 'h264Vaapi',
  filterCapability: 'scaleVaapi',
  decodeInputArgs: Object.freeze([
    '-init_hw_device',
    'vaapi=neko',
    '-filter_hw_device',
    'neko',
    '-hwaccel',
    'vaapi',
    '-hwaccel_device',
    'neko',
    '-hwaccel_output_format',
    'vaapi',
  ]),
  h264EncoderArgs: Object.freeze(['-c:v', 'h264_vaapi']),
  buildSdrFilter: (width: number, height: number, sourceIsHdr: boolean) =>
    [
      ...(sourceIsHdr
        ? [
            ['tonemap_vaapi=format=nv12', 'matrix=bt709', 'primaries=bt709', 'transfer=bt709'].join(
              ':',
            ),
          ]
        : []),
      buildVaapiScaleFilter(width, height),
    ].join(','),
  buildFrameCaptureFilter: (width: number, height: number) =>
    [buildVaapiScaleFilter(width, height), 'hwdownload', 'format=nv12', 'format=yuvj420p'].join(
      ',',
    ),
  classifyFailure: (error: unknown, codecName: string) => classifyVaapiFailure(error, codecName),
});

function buildVaapiScaleFilter(width: number, height: number): string {
  return [
    `scale_vaapi=w=${width}:h=${height}`,
    'format=nv12',
    'out_color_matrix=bt709',
    'out_color_primaries=bt709',
    'out_color_transfer=bt709',
    'out_range=limited',
  ].join(':');
}

export function resolveHardwareVideoBackend(
  platform = process.platform,
  arch = process.arch,
): HardwareVideoBackend {
  if (platform === 'darwin' && arch === 'arm64') return 'videotoolbox';
  if (platform === 'linux' && arch === 'x64') return 'vaapi';
  return 'unavailable';
}

export function getHardwareVideoPipeline(
  backend: HardwareVideoBackend,
): HardwareVideoPipeline | undefined {
  if (backend === 'videotoolbox') return VIDEO_TOOLBOX_PIPELINE;
  if (backend === 'vaapi') return VAAPI_PIPELINE;
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

function classifyVaapiFailure(error: unknown, codecName: string): HardwareVideoFailure | undefined {
  if (!(error instanceof FfmpegCommandError)) return undefined;
  if (
    /(?:no va display found|failed to open .*render|failed to initialise vaapi|device creation failed|no vaapi device|cannot open a va display)/iu.test(
      error.stderr,
    )
  ) {
    return { capability: 'VAAPI device' };
  }
  if (
    /(?:failed setup for format vaapi|no device available for decoder|failed to get hw surface|hardware accelerator failed to decode)/iu.test(
      error.stderr,
    )
  ) {
    return { capability: `${codecName.toUpperCase()} VAAPI decoder` };
  }
  if (/(?:unknown encoder|encoder .* not found).*h264_vaapi/iu.test(error.stderr)) {
    return { capability: 'H.264 VAAPI encoder' };
  }
  if (/(?:no such filter|filter not found).*scale_vaapi/iu.test(error.stderr)) {
    return { capability: 'VAAPI scale_vaapi filter' };
  }
  if (/(?:no such filter|filter not found).*tonemap_vaapi/iu.test(error.stderr)) {
    return { capability: 'VAAPI tonemap_vaapi filter' };
  }
  if (
    /(?:vaapi driver doesn't support hdr|failed to query hdr caps|no mastering display data|only support hdr10 as input)/iu.test(
      error.stderr,
    )
  ) {
    return { capability: 'VAAPI HDR tone-map pipeline' };
  }
  if (
    /(?:a hardware device reference is required|no usable encoding entrypoint|failed to create processing pipeline|error reinitializing filters|\[vf[^\]]*\][^\n]*function not implemented)/iu.test(
      error.stderr,
    )
  ) {
    return { capability: 'VAAPI video processing pipeline' };
  }
  return undefined;
}
