import { describe, expect, it } from 'vitest';
import { FfmpegCommandError } from './NodeFfmpegProcess';
import { getHardwareVideoPipeline, resolveHardwareVideoBackend } from './HardwareVideoPipeline';

describe('HardwareVideoPipeline', () => {
  it('selects the backend from supported release targets', () => {
    expect(resolveHardwareVideoBackend('darwin', 'arm64')).toBe('videotoolbox');
    expect(resolveHardwareVideoBackend('linux', 'x64')).toBe('unavailable');
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

  it('classifies VideoToolbox decoder failures without a software retry', () => {
    const videoToolbox = getHardwareVideoPipeline('videotoolbox');
    if (!videoToolbox) throw new Error('Expected the VideoToolbox pipeline.');
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
