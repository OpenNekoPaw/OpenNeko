import { describe, expect, it, vi } from 'vitest';
import type { MediaProbe } from '@neko/media';
import type { FfmpegProcessPort } from '@neko/media/node';
import type { IToolsMediaRuntime } from '../contracts/IMediaRuntimeService';
import { NodeMediaRuntimeService } from './NodeMediaRuntimeService';

const visualProbe: MediaProbe = {
  durationSeconds: 1,
  formatName: 'image2',
  video: {
    streamIndex: 0,
    codecName: 'png',
    width: 16,
    height: 9,
    framesPerSecond: 1,
    color: {},
  },
  audioStreams: [],
};

function createRuntime(probe: MediaProbe = visualProbe): IToolsMediaRuntime {
  return {
    probe: vi.fn(async () => probe),
    captureFrame: vi.fn(),
    generateWaveform: vi.fn(),
    prepareVideo: vi.fn(),
    startPcm: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
}

function createProcess(stderr: string): FfmpegProcessPort {
  return {
    run: vi.fn(async () => ({ stdout: Buffer.alloc(0), stderr })),
    streamFfmpeg: vi.fn(),
  };
}

describe('NodeMediaRuntimeService', () => {
  it('keeps image SSIM and pixel difference in the 0..1 ratio scale', async () => {
    const service = new NodeMediaRuntimeService(
      createRuntime(),
      createProcess('[Parsed_ssim_0] SSIM Y:0.75 All:0.75 (6.020600)'),
    );

    await expect(
      service.compare(
        'image',
        '/workspace/current.png',
        '/workspace/previous.png',
        {},
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      mediaType: 'image',
      similarity: 0.75,
      details: {
        pixelDifference: 0.25,
        structuralSimilarity: 0.75,
      },
    });
  });

  it('fails visibly when FFmpeg produces no SSIM metric', async () => {
    const service = new NodeMediaRuntimeService(createRuntime(), createProcess('no metric'));

    await expect(
      service.compare(
        'image',
        '/workspace/current.png',
        '/workspace/previous.png',
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('did not produce an SSIM result');
  });

  it('fails visibly when a visual source has no visual stream', async () => {
    const service = new NodeMediaRuntimeService(
      createRuntime({ durationSeconds: 1, audioStreams: [] }),
      createProcess('All:1'),
    );

    await expect(
      service.compare(
        'image',
        '/workspace/current.png',
        '/workspace/previous.png',
        {},
        new AbortController().signal,
      ),
    ).rejects.toThrow('has no video stream');
  });
});
