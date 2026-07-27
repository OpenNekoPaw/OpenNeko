import { access, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { MediaProbe } from '@neko/media';
import type { FfmpegProcessPort } from '@neko/media/node';
import type { IToolsMediaRuntime } from '../contracts/IMediaRuntimeService';
import { NodeMediaRuntimeService } from './NodeMediaRuntimeService';

const visualVideo: NonNullable<MediaProbe['video']> = {
  streamIndex: 0,
  codecName: 'png',
  width: 16,
  height: 9,
  framesPerSecond: 1,
  color: {},
};

const visualProbe: MediaProbe = {
  durationSeconds: 1,
  formatName: 'image2',
  video: visualVideo,
  audioStreams: [],
};

const audioProbe: MediaProbe = {
  durationSeconds: 2,
  formatName: 'wav',
  bitRate: 1_536_000,
  audioStreams: [
    {
      streamIndex: 0,
      codecName: 'pcm_s16le',
      sampleRate: 48_000,
      channels: 2,
    },
  ],
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

function createAudioProcess(): FfmpegProcessPort & { readonly pcmOutputs: string[] } {
  const pcmOutputs: string[] = [];
  return {
    pcmOutputs,
    run: vi.fn(async (_command: string, args: readonly string[]) => {
      const output = args.at(-1);
      if (output?.endsWith('.f32le')) {
        pcmOutputs.push(output);
        const samples = Buffer.alloc(2 * Float32Array.BYTES_PER_ELEMENT);
        samples.writeFloatLE(output.includes('current') ? 0.5 : 0.25, 0);
        samples.writeFloatLE(0, Float32Array.BYTES_PER_ELEMENT);
        await writeFile(output, samples);
        return { stdout: Buffer.alloc(0), stderr: '' };
      }
      const source = args[args.indexOf('-i') + 1];
      return {
        stdout: Buffer.alloc(0),
        stderr:
          source === '/workspace/current.wav'
            ? 'silence_start: 0.5'
            : 'silence_start: 0.25\nsilence_end: 0.75',
      };
    }),
    streamFfmpeg: vi.fn(),
  };
}

describe('NodeMediaRuntimeService', () => {
  it('projects canonical media probe fields for host consumers', async () => {
    const service = new NodeMediaRuntimeService(createRuntime(audioProbe), createProcess(''));

    await expect(service.probe('/workspace/audio.wav')).resolves.toEqual({
      duration: 2,
      width: 0,
      height: 0,
      fps: 0,
      codec: 'pcm_s16le',
      format: 'wav',
      bitrate: 1_536_000,
      hasAudio: true,
      audioCodec: 'pcm_s16le',
      audioSampleRate: 48_000,
      audioChannels: 2,
    });
  });

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

  it('compares video through sampled SSIM metrics and reports changed tracks', async () => {
    const currentProbe: MediaProbe = {
      ...visualProbe,
      durationSeconds: 4,
      formatName: 'mov,mp4',
      bitRate: 8_000_000,
      video: {
        ...visualVideo,
        codecName: 'h264',
        width: 1920,
        height: 1080,
        framesPerSecond: 30,
      },
      audioStreams: [
        {
          streamIndex: 1,
          codecName: 'aac',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
    };
    const previousProbe: MediaProbe = {
      ...currentProbe,
      durationSeconds: 3,
      video: {
        ...visualVideo,
        codecName: 'h264',
        width: 1280,
        height: 720,
        framesPerSecond: 30,
      },
      audioStreams: [],
    };
    const runtime = createRuntime();
    vi.mocked(runtime.probe)
      .mockResolvedValueOnce(currentProbe)
      .mockResolvedValueOnce(previousProbe);
    const process: FfmpegProcessPort = {
      run: vi.fn(async () => ({
        stdout: Buffer.from('n: 1 Y:0.95 All:0.95\nn: 2 Y:0.97 All:0.97\nn: 3 Y:1.0 All:1.0'),
        stderr: '[Parsed_ssim_0] SSIM Y:0.96 All:0.96 (13.9794)',
      })),
      streamFfmpeg: vi.fn(),
    };
    const service = new NodeMediaRuntimeService(runtime, process);

    await expect(
      service.compare(
        'video',
        '/workspace/current.mp4',
        '/workspace/previous.mp4',
        { startTime: 1, endTime: 3, precision: 2 },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      mediaType: 'video',
      similarity: 0.648,
      details: {
        duration: { current: 4, previous: 3 },
        resolution: {
          current: { width: 1920, height: 1080 },
          previous: { width: 1280, height: 720 },
        },
        audioTrackChanged: true,
        keyframeDiffs: [
          { time: 1, similarity: 0.95 },
          { time: 1.5, similarity: 0.97 },
          { time: 2, similarity: 1 },
        ],
        diffRegions: [{ start: 1, end: 2, avgSsim: 0.96 }],
      },
    });
    expect(process.run).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-ss', '1', '-t', '2']),
      expect.any(AbortSignal),
    );
  });

  it('compares decoded PCM and always removes its temporary files', async () => {
    const runtime = createRuntime(audioProbe);
    const process = createAudioProcess();
    const service = new NodeMediaRuntimeService(runtime, process);

    await expect(
      service.compare(
        'audio',
        '/workspace/current.wav',
        '/workspace/previous.wav',
        { startTime: 0, endTime: 1 },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      mediaType: 'audio',
      details: {
        duration: { current: 2, previous: 2 },
        sampleRate: { current: 48_000, previous: 48_000 },
        channels: { current: 2, previous: 2 },
        diffRegions: [
          {
            start: 0,
            end: 2 / 48_000,
          },
        ],
        silenceRegions: {
          current: [{ start: 0.5, end: 2 }],
          previous: [{ start: 0.25, end: 0.75 }],
        },
      },
      visualization: {
        currentWaveform: [0.5],
        previousWaveform: [0.25],
      },
    });
    expect(process.run).toHaveBeenCalledTimes(4);
    expect(process.pcmOutputs).toHaveLength(2);
    await Promise.all(
      process.pcmOutputs.map(async (output) => {
        await expect(access(output)).rejects.toThrow();
      }),
    );
  });

  it('fails visibly when the requested comparison interval does not overlap', async () => {
    const service = new NodeMediaRuntimeService(createRuntime(), createProcess(''));

    await expect(
      service.compare(
        'video',
        '/workspace/current.mp4',
        '/workspace/previous.mp4',
        { startTime: 2 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('has no overlapping interval');
  });
});
