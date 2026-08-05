import { PassThrough, Readable } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FfmpegProcessPort, FfmpegRunResult, RunningProcess } from './NodeFfmpegProcess';
import { FfmpegCommandError } from './NodeFfmpegProcess';
import type { NodeMediaPublisher } from './NodeMediaPublisher';
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
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
    );
  });

  it('stops an active PCM stream without leaking the FFmpeg abort error', async () => {
    const process = new AbortablePcmProcess();
    const runtime = new NodeMediaRuntime({
      process,
      publisher: new TestMediaPublisher({ consumePcmOnPrime: true }),
    });
    runtimes.push(runtime);
    const session = await runtime.startPcm('/fixture/audio.aac', {
      startTimeSeconds: 0,
      durationSeconds: 6,
      playbackRate: 1,
    });

    await vi.waitFor(() => expect(process.streamStarted).toBe(true));
    await runtime.stop(session.sessionId);

    await expect(process.completion).rejects.toThrow('Media PCM session was stopped.');
  });

  it('reports executable codec, encoder, and HDR filter qualification explicitly', async () => {
    const runtime = new NodeMediaRuntime({ process: new QualificationProcess() });
    runtimes.push(runtime);

    await expect(runtime.qualify()).resolves.toEqual({
      ffmpegVersion: 'ffmpeg version qualified',
      ffprobeVersion: 'ffprobe version qualified',
      hardwareAccelerators: {
        videoToolbox: true,
      },
      decoders: {
        h264: true,
        hevc: true,
        av1: true,
        vp8: true,
        vp9: true,
        aac: true,
        mp3: true,
        flac: true,
        dts: true,
      },
      encoders: {
        h264: true,
        h264VideoToolbox: true,
        aac: true,
      },
      filters: {
        zscale: false,
        tonemap: true,
        sidedata: false,
        alimiter: false,
        loudnorm: true,
        ebur128: true,
        scaleVt: true,
      },
    });
  });

  it('publishes qualified AV1 MP4 without invoking an HDR proxy', async () => {
    const fixture = await createVideoFixture('av1', '.mp4', temporaryDirectories);
    const process = new ProfilePreparationProcess(AV1_HDR_PROBE);
    const runtime = new NodeMediaRuntime({ process, publisher: new TestMediaPublisher() });
    runtimes.push(runtime);

    const prepared = await runtime.prepareVideo(fixture, {
      nativeCapabilities: { av1Mp4: true, vp9Mp4: false },
    });

    expect(prepared.video.preparationProfile).toBe('av1-mp4-direct');
    expect(prepared.video.mimeType).toBe('video/mp4');
    expect(process.ffmpegRuns).toEqual([]);
  });

  it('plans a hardware-required AV1 route without decoding or capturing HDR frames', async () => {
    const fixture = await createVideoFixture('av1', '.mp4', temporaryDirectories);
    const process = new ProfilePreparationProcess(AV1_HDR_PROBE);
    const runtime = new NodeMediaRuntime({
      process,
      hardwareVideoBackend: 'videotoolbox',
    });
    runtimes.push(runtime);

    await expect(
      runtime.planVideo(fixture, {
        nativeCapabilities: { av1Mp4: false, vp9Mp4: false },
      }),
    ).resolves.toBe('h264-sdr-transcode');

    expect(process.ffmpegRuns).toEqual([]);
  });

  it('remuxes qualified VP9 WebM into MP4 without re-encoding', async () => {
    const fixture = await createVideoFixture('vp9', '.webm', temporaryDirectories);
    const process = new ProfilePreparationProcess(VP9_HDR_PROBE);
    const runtime = new NodeMediaRuntime({ process, publisher: new TestMediaPublisher() });
    runtimes.push(runtime);

    const prepared = await runtime.prepareVideo(fixture, {
      nativeCapabilities: { av1Mp4: false, vp9Mp4: true },
    });

    expect(prepared.video.preparationProfile).toBe('vp9-mp4-remux');
    expect(prepared.video.mimeType).toBe('video/mp4');
    expect(process.ffmpegRuns).toHaveLength(1);
    expect(process.ffmpegRuns[0]).toContain('-c:v');
    expect(process.ffmpegRuns[0]).toContain('copy');
    expect(process.ffmpegRuns[0]).not.toContain('libx264');
  });

  it('uses one VideoToolbox-only closure for an unqualified AV1 source', async () => {
    const fixture = await createVideoFixture('av1', '.mp4', temporaryDirectories);
    const process = new ProfilePreparationProcess(AV1_HDR_PROBE);
    const runtime = new NodeMediaRuntime({
      process,
      publisher: new TestMediaPublisher(),
      hardwareVideoBackend: 'videotoolbox',
    });
    runtimes.push(runtime);

    const prepared = await runtime.prepareVideo(fixture, {
      nativeCapabilities: { av1Mp4: false, vp9Mp4: false },
    });

    expect(prepared.video.preparationProfile).toBe('h264-sdr-transcode');
    expect(process.ffmpegRuns).toHaveLength(1);
    const args = process.ffmpegRuns[0] ?? [];
    expect(args).toEqual(
      expect.arrayContaining([
        '-xerror',
        '-hwaccel',
        'videotoolbox',
        '-hwaccel_output_format',
        'videotoolbox_vld',
        '-c:v',
        'h264_videotoolbox',
        '-allow_sw',
        '0',
      ]),
    );
    expect(args.join(' ')).toContain(
      'scale_vt=w=1280:h=720:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709',
    );
    expect(args).not.toContain('libx264');
    expect(args).not.toContain('-pix_fmt');
    expect(args.join(' ')).not.toMatch(/(?:^|[,\s])(?:zscale|tonemap|scale=)/u);
  });

  it('reports VideoToolbox AV1 decoder rejection without a CPU fallback', async () => {
    const fixture = await createVideoFixture('av1', '.mp4', temporaryDirectories);
    const process = new HardwareDecoderUnavailableProcess(AV1_HDR_PROBE);
    const runtime = new NodeMediaRuntime({
      process,
      hardwareVideoBackend: 'videotoolbox',
    });
    runtimes.push(runtime);

    await expect(
      runtime.prepareVideo(fixture, {
        nativeCapabilities: { av1Mp4: false, vp9Mp4: false },
      }),
    ).rejects.toMatchObject({
      name: 'MediaRuntimeUnavailableError',
      capability: 'AV1 VideoToolbox decoder',
      message: 'Media runtime is unavailable for AV1 VideoToolbox decoder.',
    });

    expect(process.ffmpegRuns).toHaveLength(1);
    expect(process.ffmpegRuns[0]).not.toContain('libx264');
  });

  it('preserves valid captures when one bounded frame is corrupt', async () => {
    const runtime = new NodeMediaRuntime({
      process: new PartialFrameProcess(),
      hardwareVideoBackend: 'videotoolbox',
    });
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
    const runtime = new NodeMediaRuntime({
      process: new EmptyFrameProcess(),
      hardwareVideoBackend: 'videotoolbox',
    });
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

class TestMediaPublisher implements NodeMediaPublisher {
  private readonly registrations = new Map<string, AbortController>();
  private nextId = 0;

  constructor(
    private readonly options: {
      readonly consumePcmOnPrime?: boolean;
    } = {},
  ) {}

  async registerFile() {
    return this.createRegistration();
  }

  async registerPcm(createStream: (signal: AbortSignal) => RunningProcess) {
    const registration = this.createRegistration();
    const controller = this.registrations.get(registration.token);
    if (!controller) throw new Error('Test media registration is missing.');
    return {
      ...registration,
      prime: () => {
        if (this.options.consumePcmOnPrime) createStream(controller.signal);
      },
    };
  }

  unregister(token: string): void {
    const controller = this.registrations.get(token);
    if (!controller) return;
    this.registrations.delete(token);
    controller.abort(new Error('Media PCM session was stopped.'));
  }

  private createRegistration() {
    this.nextId += 1;
    const token = String(this.nextId).padStart(32, 'a');
    const controller = new AbortController();
    this.registrations.set(token, controller);
    return {
      token,
      url: `openneko://resource/${token}`,
      release: () => this.unregister(token),
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
      return {
        stdout: Buffer.from(
          ' V h264\n V hevc\n V av1\n V vp8\n V vp9\n A aac\n A mp3\n A flac\n A dca\n',
        ),
        stderr: '',
      };
    }
    if (command === '-hwaccels') {
      return {
        stdout: Buffer.from('Hardware acceleration methods:\nvideotoolbox\n'),
        stderr: '',
      };
    }
    if (command === '-encoders') {
      return {
        stdout: Buffer.from(' V libx264\n V h264_videotoolbox\n A aac\n'),
        stderr: '',
      };
    }
    if (command === '-filters') {
      return {
        stdout: Buffer.from(' T tonemap\n A loudnorm\n A ebur128\n V scale_vt\n'),
        stderr: '',
      };
    }
    throw new Error(`Unexpected qualification command: ${args.join(' ')}`);
  }

  streamFfmpeg(): RunningProcess {
    throw new Error('Unexpected streaming command.');
  }
}

const AV1_HDR_PROBE = Buffer.from(
  JSON.stringify({
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'av1',
        pix_fmt: 'yuv420p10le',
        width: 3840,
        height: 2160,
        avg_frame_rate: '24/1',
        color_primaries: 'bt2020',
        color_transfer: 'smpte2084',
        color_space: 'bt2020nc',
      },
    ],
    format: { duration: '100', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  }),
);

const VP9_HDR_PROBE = Buffer.from(
  JSON.stringify({
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'vp9',
        profile: 'Profile 2',
        pix_fmt: 'yuv420p10le',
        width: 3840,
        height: 2160,
        avg_frame_rate: '60/1',
        color_primaries: 'bt2020',
        color_transfer: 'smpte2084',
        color_space: 'bt2020nc',
      },
    ],
    format: { duration: '580', format_name: 'matroska,webm' },
  }),
);

class ProfilePreparationProcess implements FfmpegProcessPort {
  readonly ffmpegRuns: string[][] = [];

  constructor(private readonly probe: Buffer) {}

  async run(executable: 'ffmpeg' | 'ffprobe', args: readonly string[]): Promise<FfmpegRunResult> {
    if (executable === 'ffprobe') return { stdout: this.probe, stderr: '' };
    this.ffmpegRuns.push([...args]);
    const outputPath = args.at(-1);
    if (!outputPath) throw new Error('Expected a prepared media output path.');
    await writeFile(outputPath, Buffer.from('prepared media'));
    return { stdout: Buffer.alloc(0), stderr: '' };
  }

  streamFfmpeg(): RunningProcess {
    throw new Error('Unexpected streaming command.');
  }
}

class HardwareDecoderUnavailableProcess extends ProfilePreparationProcess {
  override async run(
    executable: 'ffmpeg' | 'ffprobe',
    args: readonly string[],
  ): Promise<FfmpegRunResult> {
    if (executable === 'ffprobe') return { stdout: AV1_HDR_PROBE, stderr: '' };
    this.ffmpegRuns.push([...args]);
    throw new FfmpegCommandError(
      'ffmpeg',
      args,
      1,
      null,
      [
        '[vist#0:0/av1 @ 0x1] [dec:av1 @ 0x2] Task finished with error code: -78 (Function not implemented)',
        '[vist#0:0/av1 @ 0x1] [dec:av1 @ 0x2] Terminating thread with return code -78 (Function not implemented)',
        '[vost#0:0/h264_videotoolbox @ 0x3] [enc:h264_videotoolbox @ 0x4] Could not open encoder before EOF',
      ].join('\n'),
    );
  }
}

class PartialFrameProcess extends QualificationProcess {
  override async run(
    executable: 'ffmpeg' | 'ffprobe',
    args: readonly string[],
  ): Promise<FfmpegRunResult> {
    if (executable === 'ffprobe' && args.at(-1) !== '-version') {
      return { stdout: VIDEO_PROBE, stderr: '' };
    }
    if (args.at(-1)?.startsWith('-')) return super.run(executable, args);
    const seekIndex = args.indexOf('-ss');
    const timestamp = args[seekIndex + 1];
    if (timestamp === '1') {
      throw new FfmpegCommandError('ffmpeg', args, 1, null, 'Invalid NAL unit size');
    }
    return { stdout: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), stderr: '' };
  }

  override streamFfmpeg(): RunningProcess {
    throw new Error('Unexpected streaming command.');
  }
}

class EmptyFrameProcess extends QualificationProcess {
  override async run(
    executable: 'ffmpeg' | 'ffprobe',
    args: readonly string[],
  ): Promise<FfmpegRunResult> {
    if (executable === 'ffprobe' && args.at(-1) !== '-version') {
      return { stdout: VIDEO_PROBE, stderr: '' };
    }
    if (args.at(-1)?.startsWith('-')) return super.run(executable, args);
    throw new FfmpegCommandError(
      'ffmpeg',
      args,
      1,
      null,
      'Output file is empty, nothing was encoded (check -ss / -t / -frames parameters if used)',
    );
  }

  override streamFfmpeg(): RunningProcess {
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

async function createVideoFixture(
  name: string,
  extension: string,
  directories: string[],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'openneko-media-profile-test-'));
  directories.push(directory);
  const source = join(directory, `${name}${extension}`);
  await writeFile(source, Buffer.from('source media'));
  return source;
}
