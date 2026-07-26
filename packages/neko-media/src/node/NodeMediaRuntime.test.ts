import { PassThrough, Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FfmpegProcessPort, FfmpegRunResult, RunningProcess } from './NodeFfmpegProcess';
import { FfmpegCommandError } from './NodeFfmpegProcess';
import { NodeMediaRuntime } from './NodeMediaRuntime';

const AUDIO_PROBE = Buffer.from(
  JSON.stringify({
    streams: [
      {
        index: 0,
        codec_type: 'audio',
        codec_name: 'aac',
        sample_rate: '48000',
        channels: 2,
      },
    ],
    format: { duration: '6' },
  }),
);
const VIDEO_PROBE = Buffer.from(
  JSON.stringify({
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'h264',
        pix_fmt: 'yuv420p',
        width: 1920,
        height: 1080,
        avg_frame_rate: '30/1',
      },
    ],
    format: { duration: '180' },
  }),
);

describe('NodeMediaRuntime', () => {
  const runtimes: NodeMediaRuntime[] = [];

  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  });

  it('stops an active PCM stream without leaking the FFmpeg abort error', async () => {
    const process = new AbortablePcmProcess();
    const runtime = new NodeMediaRuntime({ process });
    runtimes.push(runtime);
    const session = await runtime.startPcm('/fixture/audio.aac', {
      startTimeSeconds: 0,
      durationSeconds: 6,
      playbackRate: 1,
    });

    const response = await fetch(session.stream.streamUrl);
    await vi.waitFor(() => expect(process.streamStarted).toBe(true));
    await runtime.stop(session.sessionId);

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    await expect(process.completion).rejects.toThrow('Media PCM session was stopped.');
  });

  it('reports executable codec, encoder, and HDR filter qualification explicitly', async () => {
    const runtime = new NodeMediaRuntime({ process: new QualificationProcess() });
    runtimes.push(runtime);

    await expect(runtime.qualify()).resolves.toEqual({
      ffmpegVersion: 'ffmpeg version qualified',
      ffprobeVersion: 'ffprobe version qualified',
      decoders: { h264: true, hevc: true, av1: true, vp8: true },
      encoders: { h264: true, aac: true },
      filters: { zscale: false, tonemap: true, sidedata: false, alimiter: false },
    });
  });

  it('preserves valid captures when one bounded frame is corrupt', async () => {
    const runtime = new NodeMediaRuntime({ process: new PartialFrameProcess() });
    runtimes.push(runtime);

    await expect(runtime.captureFrames('/fixture/damaged.mp4', [0, 1, 2])).resolves.toEqual([
      expect.objectContaining({ status: 'ok', timeSeconds: 0 }),
      {
        status: 'corrupt',
        timeSeconds: 1,
        scope: 'interval',
        message: 'Invalid NAL unit size',
      },
      expect.objectContaining({ status: 'ok', timeSeconds: 2 }),
    ]);
  });

  it('classifies a bounded early-EOF frame as interval corruption', async () => {
    const runtime = new NodeMediaRuntime({ process: new EmptyFrameProcess() });
    runtimes.push(runtime);

    await expect(runtime.captureFrame('/fixture/truncated.mp4', 150)).rejects.toMatchObject({
      name: 'MediaCorruptionError',
      scope: 'interval',
      operation: 'capture frame',
    });
  });

  it('aggregates waveform peaks from streaming PCM without buffered FFmpeg output', async () => {
    const runtime = new NodeMediaRuntime({ process: new StreamingWaveformProcess() });
    runtimes.push(runtime);

    await expect(
      runtime.generateWaveform('/fixture/long-audio.aac', { peaksPerSecond: 24_000 }),
    ).resolves.toEqual({
      peaks: [0.5, 1, 0.10000000149011612],
      durationSeconds: 6,
      sampleRate: 48_000,
    });
  });

  it('returns completed waveform peaks when streaming decode fails after valid PCM', async () => {
    const runtime = new NodeMediaRuntime({ process: new PartialStreamingWaveformProcess() });
    runtimes.push(runtime);

    await expect(
      runtime.generateWaveform('/fixture/damaged-audio.aac', { peaksPerSecond: 24_000 }),
    ).resolves.toEqual({
      peaks: [0.6000000238418579, 0.4000000059604645],
      durationSeconds: 6,
      sampleRate: 48_000,
      partial: {
        availableDurationSeconds: 3 / 48_000,
        failureScope: 'stream',
        message: 'Invalid data found when processing input',
      },
    });
  });

  it('propagates waveform cancellation instead of returning a partial result', async () => {
    const process = new CancelledStreamingWaveformProcess();
    const runtime = new NodeMediaRuntime({ process });
    runtimes.push(runtime);
    const controller = new AbortController();
    const waveform = runtime.generateWaveform(
      '/fixture/long-audio.aac',
      { peaksPerSecond: 24_000 },
      controller.signal,
    );
    await process.started;

    const cancellation = new Error('Waveform generation was cancelled.');
    controller.abort(cancellation);

    await expect(waveform).rejects.toBe(cancellation);
  });
});

class AbortablePcmProcess implements FfmpegProcessPort {
  streamStarted = false;
  completion: Promise<void> = Promise.resolve();

  async run(executable: 'ffmpeg' | 'ffprobe', _args: readonly string[]): Promise<FfmpegRunResult> {
    if (executable !== 'ffprobe') throw new Error('Unexpected FFmpeg run in PCM test.');
    return { stdout: AUDIO_PROBE, stderr: '' };
  }

  streamFfmpeg(_args: readonly string[], signal?: AbortSignal): RunningProcess {
    this.streamStarted = true;
    const stdout = new PassThrough();
    this.completion = new Promise<void>((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => {
          const reason =
            signal.reason instanceof Error
              ? signal.reason
              : new Error('Media PCM session was stopped.');
          stdout.destroy(reason);
          reject(reason);
        },
        { once: true },
      );
    });
    return {
      stdout,
      completion: this.completion,
      terminate: () => undefined,
    };
  }
}

class QualificationProcess implements FfmpegProcessPort {
  async run(executable: 'ffmpeg' | 'ffprobe', args: readonly string[]): Promise<FfmpegRunResult> {
    const command = args.at(-1);
    if (command === '-version') {
      return { stdout: Buffer.from(`${executable} version qualified\n`), stderr: '' };
    }
    if (command === '-decoders') {
      return { stdout: Buffer.from(' V h264\n V hevc\n V av1\n V vp8\n'), stderr: '' };
    }
    if (command === '-encoders') {
      return { stdout: Buffer.from(' V libx264\n A aac\n'), stderr: '' };
    }
    if (command === '-filters') {
      return { stdout: Buffer.from(' T tonemap\n'), stderr: '' };
    }
    throw new Error(`Unexpected qualification command: ${args.join(' ')}`);
  }

  streamFfmpeg(): RunningProcess {
    throw new Error('Unexpected streaming command.');
  }
}

class PartialFrameProcess implements FfmpegProcessPort {
  async run(executable: 'ffmpeg' | 'ffprobe', args: readonly string[]): Promise<FfmpegRunResult> {
    if (executable === 'ffprobe') return { stdout: VIDEO_PROBE, stderr: '' };
    const seekIndex = args.indexOf('-ss');
    const timestamp = args[seekIndex + 1];
    if (timestamp === '1') {
      throw new FfmpegCommandError('ffmpeg', args, 1, null, 'Invalid NAL unit size');
    }
    return { stdout: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), stderr: '' };
  }

  streamFfmpeg(): RunningProcess {
    throw new Error('Unexpected streaming command.');
  }
}

class EmptyFrameProcess implements FfmpegProcessPort {
  async run(executable: 'ffmpeg' | 'ffprobe', args: readonly string[]): Promise<FfmpegRunResult> {
    if (executable === 'ffprobe') return { stdout: VIDEO_PROBE, stderr: '' };
    throw new FfmpegCommandError(
      'ffmpeg',
      args,
      1,
      null,
      'Output file is empty, nothing was encoded (check -ss / -t / -frames parameters if used)',
    );
  }

  streamFfmpeg(): RunningProcess {
    throw new Error('Unexpected streaming command.');
  }
}

class StreamingWaveformProcess implements FfmpegProcessPort {
  async run(executable: 'ffmpeg' | 'ffprobe', _args: readonly string[]): Promise<FfmpegRunResult> {
    if (executable !== 'ffprobe') {
      throw new Error('Waveform must not use buffered FFmpeg execution.');
    }
    return { stdout: AUDIO_PROBE, stderr: '' };
  }

  streamFfmpeg(): RunningProcess {
    const pcm = float32Buffer([0.25, -0.5, 0.75, -1, 0.1]);
    return {
      stdout: Readable.from([pcm.subarray(0, 3), pcm.subarray(3, 11), pcm.subarray(11)]),
      completion: Promise.resolve(),
      terminate: () => undefined,
    };
  }
}

class PartialStreamingWaveformProcess implements FfmpegProcessPort {
  async run(executable: 'ffmpeg' | 'ffprobe', _args: readonly string[]): Promise<FfmpegRunResult> {
    if (executable !== 'ffprobe') {
      throw new Error('Waveform must not use buffered FFmpeg execution.');
    }
    return { stdout: AUDIO_PROBE, stderr: '' };
  }

  streamFfmpeg(args: readonly string[]): RunningProcess {
    const error = new FfmpegCommandError(
      'ffmpeg',
      args,
      1,
      null,
      'Invalid data found when processing input',
    );
    const stdout = new PassThrough();
    const completion = new Promise<void>((_resolve, reject) => {
      queueMicrotask(() => {
        stdout.end(float32Buffer([0.2, -0.6, 0.4]));
        setImmediate(() => reject(error));
      });
    });
    void completion.catch(() => undefined);
    return { stdout, completion, terminate: () => stdout.destroy() };
  }
}

class CancelledStreamingWaveformProcess implements FfmpegProcessPort {
  private resolveStarted: (() => void) | undefined;
  readonly started = new Promise<void>((resolve) => {
    this.resolveStarted = resolve;
  });

  async run(
    executable: 'ffmpeg' | 'ffprobe',
    _args: readonly string[],
    signal?: AbortSignal,
  ): Promise<FfmpegRunResult> {
    if (executable === 'ffprobe') return { stdout: AUDIO_PROBE, stderr: '' };
    this.resolveStarted?.();
    return new Promise<FfmpegRunResult>((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () =>
          reject(
            signal.reason instanceof Error ? signal.reason : new Error('Waveform was cancelled.'),
          ),
        { once: true },
      );
    });
  }

  streamFfmpeg(_args: readonly string[], signal?: AbortSignal): RunningProcess {
    const stdout = new PassThrough();
    const completion = new Promise<void>((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => {
          const reason =
            signal.reason instanceof Error ? signal.reason : new Error('Waveform was cancelled.');
          stdout.destroy(reason);
          reject(reason);
        },
        { once: true },
      );
      queueMicrotask(() => {
        stdout.write(float32Buffer([0.25, -0.5]));
        this.resolveStarted?.();
      });
    });
    void completion.catch(() => undefined);
    return { stdout, completion, terminate: () => stdout.destroy() };
  }
}

function float32Buffer(samples: readonly number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * Float32Array.BYTES_PER_ELEMENT);
  samples.forEach((sample, index) => buffer.writeFloatLE(sample, index * 4));
  return buffer;
}
