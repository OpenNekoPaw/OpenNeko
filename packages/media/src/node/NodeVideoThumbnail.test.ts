import { describe, expect, it, vi } from 'vitest';
import type { FfmpegProcessPort } from './NodeFfmpegProcess';
import { NodeVideoThumbnail, VideoThumbnailError } from './NodeVideoThumbnail';

describe('NodeVideoThumbnail', () => {
  it('extracts one deterministic bounded PNG frame', async () => {
    const process = createProcess();
    process.run.mockResolvedValue({
      stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      stderr: '',
    });
    const thumbnail = new NodeVideoThumbnail(process);

    await expect(
      thumbnail.createPng({
        sourcePath: '/private/video.mp4',
        width: 160,
        height: 100,
      }),
    ).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(process.run).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining([
        '-ss',
        '0.25',
        '-frames:v',
        '1',
        'scale=160:100:force_original_aspect_ratio=decrease',
        'pipe:1',
      ]),
      undefined,
    );
  });

  it('forwards cancellation and sanitizes process failures', async () => {
    const process = createProcess();
    process.run.mockRejectedValue(new Error('ffmpeg /private/video.mp4 failed'));
    const thumbnail = new NodeVideoThumbnail(process);

    const failure = thumbnail.createPng({
      sourcePath: '/private/video.mp4',
      width: 640,
      height: 400,
    });
    await expect(failure).rejects.toBeInstanceOf(VideoThumbnailError);
    await expect(failure).rejects.not.toThrow('/private/video.mp4');

    const controller = new AbortController();
    controller.abort(new Error('cancelled by owner'));
    await expect(
      thumbnail.createPng({
        sourcePath: '/private/video.mp4',
        width: 640,
        height: 400,
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled by owner');
  });

  it('rejects empty output and invalid dimensions', async () => {
    const process = createProcess();
    process.run.mockResolvedValue({ stdout: Buffer.alloc(0), stderr: '' });
    const thumbnail = new NodeVideoThumbnail(process);

    await expect(
      thumbnail.createPng({
        sourcePath: '/private/video.mp4',
        width: 160,
        height: 100,
      }),
    ).rejects.toThrow('generation failed');
    await expect(
      thumbnail.createPng({
        sourcePath: '/private/video.mp4',
        width: 0,
        height: 100,
      }),
    ).rejects.toThrow('width');
  });
});

function createProcess() {
  return {
    run: vi.fn<FfmpegProcessPort['run']>(),
    streamFfmpeg: vi.fn<FfmpegProcessPort['streamFfmpeg']>(),
  };
}
