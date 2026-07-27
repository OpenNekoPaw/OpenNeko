import { describe, expect, it } from 'vitest';
import { FfmpegCommandError } from './NodeFfmpegProcess';
import { getHardwareVideoPipeline, resolveHardwareVideoBackend } from './HardwareVideoPipeline';

describe('HardwareVideoPipeline', () => {
  it('selects the backend from supported release targets', () => {
    expect(resolveHardwareVideoBackend('darwin', 'arm64')).toBe('videotoolbox');
    expect(resolveHardwareVideoBackend('linux', 'x64')).toBe('vaapi');
    expect(resolveHardwareVideoBackend('win32', 'x64')).toBe('unavailable');
    expect(resolveHardwareVideoBackend('darwin', 'x64')).toBe('unavailable');
  });

  it('keeps the VideoToolbox transcode closure on hardware surfaces', () => {
    const pipeline = getHardwareVideoPipeline('videotoolbox');
    if (!pipeline) throw new Error('Expected the VideoToolbox pipeline.');

    expect(pipeline.decodeInputArgs).toEqual([
      '-hwaccel',
      'videotoolbox',
      '-hwaccel_output_format',
      'videotoolbox_vld',
    ]);
    expect(pipeline.acceleratorCapability).toBe('videoToolbox');
    expect(pipeline.buildSdrFilter(1280, 720, true)).toBe(
      'scale_vt=w=1280:h=720:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709',
    );
    expect(pipeline.h264EncoderArgs).toEqual([
      '-c:v',
      'h264_videotoolbox',
      '-allow_sw',
      '0',
      '-realtime',
      '1',
      '-prio_speed',
      '1',
    ]);
    expect(
      [
        ...pipeline.decodeInputArgs,
        pipeline.buildSdrFilter(1280, 720, true),
        ...pipeline.h264EncoderArgs,
      ].join(' '),
    ).not.toMatch(/(?:libx264|zscale|tonemap|scale=)/u);
  });

  it('keeps the VAAPI transcode closure on one named hardware device', () => {
    const pipeline = getHardwareVideoPipeline('vaapi');
    if (!pipeline) throw new Error('Expected the VAAPI pipeline.');

    expect(pipeline.decodeInputArgs).toEqual([
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
    ]);
    expect(pipeline.acceleratorCapability).toBe('vaapi');
    expect(pipeline.buildSdrFilter(1280, 720, false)).toBe(
      'scale_vaapi=w=1280:h=720:format=nv12:out_color_matrix=bt709:out_color_primaries=bt709:out_color_transfer=bt709:out_range=limited',
    );
    expect(pipeline.buildSdrFilter(1280, 720, true)).toBe(
      'tonemap_vaapi=format=nv12:matrix=bt709:primaries=bt709:transfer=bt709,scale_vaapi=w=1280:h=720:format=nv12:out_color_matrix=bt709:out_color_primaries=bt709:out_color_transfer=bt709:out_range=limited',
    );
    expect(pipeline.h264EncoderArgs).toEqual(['-c:v', 'h264_vaapi']);
    expect(pipeline.buildFrameCaptureFilter(320, 180)).toBe(
      'scale_vaapi=w=320:h=180:format=nv12:out_color_matrix=bt709:out_color_primaries=bt709:out_color_transfer=bt709:out_range=limited,hwdownload,format=nv12,format=yuvj420p',
    );
    expect(
      [
        ...pipeline.decodeInputArgs,
        pipeline.buildSdrFilter(1280, 720, false),
        ...pipeline.h264EncoderArgs,
      ].join(' '),
    ).not.toMatch(/(?:libx264|zscale|tonemap|scale=|hwdownload)/u);
  });

  it('classifies backend device and decoder failures without a software retry', () => {
    const vaapi = getHardwareVideoPipeline('vaapi');
    const videoToolbox = getHardwareVideoPipeline('videotoolbox');
    if (!vaapi || !videoToolbox) throw new Error('Expected qualified hardware pipelines.');

    expect(
      vaapi.classifyFailure(
        commandError('Device creation failed: -542398533. No VA display found.'),
        'av1',
      ),
    ).toEqual({ capability: 'VAAPI device' });
    expect(
      videoToolbox.classifyFailure(
        commandError('[dec:av1] Task finished with error code: -78 (Function not implemented)'),
        'av1',
      ),
    ).toEqual({ capability: 'AV1 VideoToolbox decoder' });
  });
});

function commandError(stderr: string): FfmpegCommandError {
  return new FfmpegCommandError('ffmpeg', [], 1, null, stderr);
}
