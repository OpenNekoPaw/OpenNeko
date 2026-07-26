import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CutMediaCorruptionError,
  CutMediaRuntimeUnavailableError,
  type TimelineView,
} from '@neko-cut/domain';
import { NodeFfmpegCutMediaAdapter, buildCutPreviewVideoFilter } from './NodeFfmpegCutMediaAdapter';
import {
  FfmpegCommandError,
  NodeFfmpegProcess,
  type FfmpegProcessPort,
  type FfmpegRunResult,
} from '@neko/media/node';

describe('NodeFfmpegCutMediaAdapter', () => {
  let root: string;
  let cacheRoot: string;
  let sourcePath: string;
  let vp8Path: string;
  const adapters: NodeFfmpegCutMediaAdapter[] = [];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'node-ffmpeg-cut-adapter-'));
    cacheRoot = path.join(root, '.cache');
    await mkdir(cacheRoot);
    await mkdir(path.join(root, 'exports'));
    sourcePath = path.join(root, 'source.mp4');
    vp8Path = path.join(root, 'source.webm');
    const process = new NodeFfmpegProcess();
    await process.run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=30:duration=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      sourcePath,
    ]);
    await process.run('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=160x90:rate=24:duration=1',
      '-c:v',
      'libvpx',
      '-an',
      vp8Path,
    ]);
  }, 30_000);

  afterAll(async () => {
    await Promise.all(adapters.splice(0).map((adapter) => adapter.dispose()));
    await rm(root, { recursive: true, force: true });
  });

  function createAdapter(): NodeFfmpegCutMediaAdapter {
    const adapter = new NodeFfmpegCutMediaAdapter(root, { cacheRoot });
    adapters.push(adapter);
    return adapter;
  }

  it('probes codec, color, and audio stream metadata', async () => {
    const adapter = createAdapter();

    const probe = await adapter.probe({ workspaceRelativePath: 'source.mp4' });

    expect(probe.durationSeconds).toBeGreaterThan(1.9);
    expect(probe.video).toMatchObject({
      codecName: 'h264',
      width: 320,
      height: 180,
      bitDepth: 8,
    });
    expect(probe.audioStreams[0]).toMatchObject({
      codecName: 'aac',
      channels: 1,
      sampleRate: 48_000,
    });
  });

  it('captures a JPEG frame and renders bounded normalized waveform peaks', async () => {
    const adapter = createAdapter();

    const [frame, waveform] = await Promise.all([
      adapter.captureFrame({ workspaceRelativePath: 'source.mp4' }, 0.5, {
        width: 160,
        height: 90,
      }),
      adapter.generateWaveform({ workspaceRelativePath: 'source.mp4' }, { peaksPerSecond: 10 }),
    ]);

    expect(frame.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(waveform.peaks.length).toBeGreaterThanOrEqual(19);
    expect(waveform.peaks.every((peak) => peak >= 0 && peak <= 1)).toBe(true);
  });

  it('classifies a corrupt bounded frame as interval corruption', async () => {
    const process: FfmpegProcessPort = {
      run: async (executable) => {
        if (executable === 'ffprobe') {
          return {
            stdout: Buffer.from(
              JSON.stringify({
                streams: [
                  {
                    index: 0,
                    codec_type: 'video',
                    codec_name: 'h264',
                    pix_fmt: 'yuv420p',
                    width: 1920,
                    height: 1080,
                    r_frame_rate: '30/1',
                  },
                ],
                format: { duration: '180' },
              }),
            ),
            stderr: '',
          };
        }
        throw new FfmpegCommandError(
          'ffmpeg',
          ['-frames:v', '1'],
          69,
          null,
          'Invalid NAL unit size (28388170 > 286626).',
        );
      },
      streamFfmpeg: () => {
        throw new Error('Unexpected streaming FFmpeg process.');
      },
    };
    const adapter = new NodeFfmpegCutMediaAdapter(root, { cacheRoot, process });
    adapters.push(adapter);

    await expect(
      adapter.captureFrame({ workspaceRelativePath: 'partially-corrupt.mp4' }, 139, {
        width: 160,
        height: 90,
      }),
    ).rejects.toMatchObject<CutMediaCorruptionError>({
      name: 'CutMediaCorruptionError',
      scope: 'interval',
      operation: 'capture frame at 139 seconds',
    });
  });

  it('preserves decoded waveform samples before a corrupt audio suffix', async () => {
    const decodedSamples = new Float32Array(1_280);
    decodedSamples[250] = 0.75;
    const process: FfmpegProcessPort = {
      run: async (executable) => {
        if (executable === 'ffprobe') {
          return {
            stdout: Buffer.from(
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
                format: { duration: '10' },
              }),
            ),
            stderr: '',
          };
        }
        throw new FfmpegCommandError(
          'ffmpeg',
          ['-f', 'f32le'],
          234,
          null,
          'channel element 2.7 is not allocated',
          Buffer.from(decodedSamples.buffer),
        );
      },
      streamFfmpeg: () => {
        throw new Error('Unexpected streaming FFmpeg process.');
      },
    };
    const adapter = new NodeFfmpegCutMediaAdapter(root, { cacheRoot, process });
    adapters.push(adapter);

    const waveform = await adapter.generateWaveform(
      { workspaceRelativePath: 'partially-corrupt.mp4' },
      { peaksPerSecond: 10 },
    );

    expect(waveform.peaks).toHaveLength(10);
    expect(waveform.peaks).toContain(0.75);
    expect(waveform.partial).toMatchObject({
      availableDurationSeconds: 1,
      failureScope: 'stream',
    });
    expect(waveform.durationSeconds).toBe(10);
  });

  it('prepares H.264 fMP4 and serves it through an opaque ranged URL', async () => {
    const adapter = createAdapter();

    const session = await adapter.startPreview(
      { workspaceRelativePath: 'source.mp4' },
      {
        startTimeSeconds: 0.25,
        durationSeconds: 0.75,
        playbackRate: 1,
        startPaused: true,
      },
    );
    const segment = session.video.segments[0];
    if (!segment) throw new Error('Expected one preview segment.');
    const response = await fetch(segment.url, { headers: { Range: 'bytes=0-31' } });

    expect(session.video.preparationProfile).toBe('h264-fragmented-mp4-copy');
    expect(session.video.mimeType).toContain('video/mp4');
    expect(response.status).toBe(206);
    expect((await response.arrayBuffer()).byteLength).toBe(32);
    await adapter.resumePreview(session.sessionId);
    await adapter.stopPreview(session.sessionId);
    expect((await fetch(segment.url)).status).toBe(404);
  });

  it('uses a VideoToolbox-only H.264 profile for unqualified VP8', async () => {
    const ffmpegArgs: string[][] = [];
    const process: FfmpegProcessPort = {
      run: async (executable, args) => {
        if (executable === 'ffprobe') {
          return {
            stdout: Buffer.from(
              JSON.stringify({
                streams: [
                  {
                    index: 0,
                    codec_type: 'video',
                    codec_name: 'vp8',
                    pix_fmt: 'yuv420p',
                    width: 160,
                    height: 90,
                    r_frame_rate: '24/1',
                  },
                ],
                format: { duration: '1' },
              }),
            ),
            stderr: '',
          };
        }
        ffmpegArgs.push([...args]);
        const outputPath = args.at(-1);
        if (!outputPath) throw new Error('Expected Cut preview output path.');
        await writeFile(outputPath, Buffer.from('prepared preview'));
        return { stdout: Buffer.alloc(0), stderr: '' };
      },
      streamFfmpeg: () => {
        throw new Error('Unexpected streaming FFmpeg process.');
      },
    };
    const adapter = new NodeFfmpegCutMediaAdapter(root, {
      cacheRoot,
      process,
      vp8WebmDirectQualified: false,
      hardwareVideoBackend: 'videotoolbox',
    });
    adapters.push(adapter);

    const session = await adapter.startPreview(
      { workspaceRelativePath: 'source.webm' },
      {
        startTimeSeconds: 0,
        durationSeconds: 0.5,
        playbackRate: 1,
        startPaused: false,
      },
    );

    expect(session.video.preparationProfile).toBe('h264-sdr-transcode');
    expect(session.video.mimeType).toContain('avc1');
    expect(ffmpegArgs).toHaveLength(1);
    expect(ffmpegArgs[0]).toEqual(
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
    expect(ffmpegArgs[0]).not.toContain('libx264');
    expect(ffmpegArgs[0]).not.toContain('-pix_fmt');
    await adapter.stopPreview(session.sessionId);
  });

  it('reports VideoToolbox AV1 decoder rejection without CPU fallback', async () => {
    const run = vi.fn(
      async (
        executable: 'ffmpeg' | 'ffprobe',
        args: readonly string[],
      ): Promise<FfmpegRunResult> => {
        if (executable === 'ffprobe') {
          return {
            stdout: Buffer.from(
              JSON.stringify({
                streams: [
                  {
                    index: 0,
                    codec_type: 'video',
                    codec_name: 'av1',
                    pix_fmt: 'yuv420p10le',
                    bits_per_raw_sample: '10',
                    width: 3840,
                    height: 2160,
                    r_frame_rate: '30/1',
                    color_primaries: 'bt2020',
                    color_transfer: 'smpte2084',
                    color_space: 'bt2020nc',
                  },
                ],
                format: { duration: '2' },
              }),
            ),
            stderr: '',
          };
        }
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
      },
    );
    const process: FfmpegProcessPort = {
      run,
      streamFfmpeg: () => {
        throw new Error('Unexpected streaming FFmpeg process.');
      },
    };
    const adapter = new NodeFfmpegCutMediaAdapter(root, {
      cacheRoot,
      process,
      hardwareVideoBackend: 'videotoolbox',
    });
    adapters.push(adapter);

    await expect(
      adapter.startPreview(
        { workspaceRelativePath: 'hdr-av1.mp4' },
        {
          startTimeSeconds: 0,
          durationSeconds: 0.5,
          playbackRate: 1,
          startPaused: true,
        },
      ),
    ).rejects.toMatchObject<CutMediaRuntimeUnavailableError>({
      name: 'CutMediaRuntimeUnavailableError',
      capability: 'AV1 VideoToolbox decoder',
    });
    expect(run).toHaveBeenCalledTimes(2);
    const transcodeCall = run.mock.calls[1];
    expect(transcodeCall?.[1]).not.toContain('libx264');
  });

  it('keeps Cut preview scaling and color conversion on VideoToolbox frames', () => {
    const filter = buildCutPreviewVideoFilter(
      {
        streamIndex: 0,
        codecName: 'av1',
        bitDepth: 10,
        width: 3840,
        height: 2160,
        framesPerSecond: 24,
        color: {
          colorPrimaries: 'bt2020',
          colorTransfer: 'smpte2084',
          colorSpace: 'bt2020nc',
        },
      },
      1280,
      720,
    );

    expect(filter).toBe(
      'scale_vt=w=1280:h=720:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709',
    );
    expect(filter).not.toMatch(/(?:zscale|tonemap|scale=)/u);
  });

  it('uses the qualified VP8 WebM direct profile for the VS Code baseline', async () => {
    const adapter = createAdapter();

    const session = await adapter.startPreview(
      { workspaceRelativePath: 'source.webm' },
      {
        startTimeSeconds: 0,
        durationSeconds: 0.5,
        playbackRate: 1,
        startPaused: false,
      },
    );

    expect(session.video.preparationProfile).toBe('vp8-webm-direct');
    expect(session.video.mimeType).toBe('video/webm; codecs="vp8"');
    const segment = session.video.segments[0];
    if (!segment) throw new Error('Expected one VP8 preview segment.');
    expect((await fetch(segment.url)).headers.get('content-type')).toBe('video/webm');
    await adapter.stopPreview(session.sessionId);
  });

  it('primes framed float32 PCM before logical playback activation', async () => {
    const adapter = createAdapter();
    const session = await adapter.startPcm(
      { workspaceRelativePath: 'source.mp4' },
      {
        startTimeSeconds: 0.5,
        durationSeconds: 0.25,
        playbackRate: 1,
        startPaused: true,
      },
    );
    const response = await fetch(session.stream.streamUrl);
    const bytesPromise = response.arrayBuffer();
    const primedBeforeResume = await Promise.race([
      bytesPromise.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);

    await adapter.resumePcm(session.sessionId);
    const bytes = Buffer.from(await bytesPromise);
    expect(primedBeforeResume).toBe(true);
    expect(bytes.readBigInt64LE(0)).toBe(500_000n);
    expect(bytes.readUInt32LE(16)).toBe(48_000);
    expect(bytes.readUInt16LE(20)).toBe(2);
    expect(bytes.byteLength).toBeGreaterThan(22);
    await adapter.stopPcm(session.sessionId);
  });

  it('exports the lightweight single-video timeline and validates the staged output', async () => {
    const delegate = new NodeFfmpegProcess();
    let exportArgs: readonly string[] | undefined;
    const process: FfmpegProcessPort = {
      run: async (executable, args, signal) => {
        if (executable === 'ffmpeg' && args.includes('-filter_complex')) exportArgs = args;
        return delegate.run(executable, args, signal);
      },
      streamFfmpeg: (args, signal) => delegate.streamFfmpeg(args, signal),
    };
    const adapter = new NodeFfmpegCutMediaAdapter(root, { cacheRoot, process });
    adapters.push(adapter);
    const timeline = createTimeline();

    const result = await adapter.export({
      timeline,
      outputWorkspaceRelativePath: 'exports/result.mp4',
      settings: {
        outputName: 'result.mp4',
        container: 'mp4',
        width: 320,
        height: 180,
        framesPerSecond: 30,
        videoBitrate: 1_000_000,
        includeAudio: true,
        audioBitrate: 128_000,
        audioSampleRate: 48_000,
      },
    });

    expect(result.outputWorkspaceRelativePath).toBe('exports/result.mp4');
    const probe = await adapter.probe({ workspaceRelativePath: 'exports/result.mp4' });
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect(probe.durationSeconds).toBeCloseTo(1, 1);
    const filterGraph = exportArgs?.[exportArgs.indexOf('-filter_complex') + 1];
    expect(filterGraph).toContain('alimiter=');
  }, 30_000);

  it('rejects workspace traversal before starting FFmpeg', async () => {
    const adapter = createAdapter();
    await expect(adapter.probe({ workspaceRelativePath: '../secret.mp4' })).rejects.toThrow(
      'escapes the workspace',
    );
  });

  function createTimeline(): TimelineView {
    return {
      documentUri: pathToFileURL(path.join(root, 'project.otio')).toString(),
      sessionId: 'session-1',
      revision: 0,
      name: 'Fixture',
      durationSeconds: 1,
      tracks: [
        {
          trackId: 'video-1',
          name: 'Video',
          kind: 'Video',
          enabled: true,
          locked: false,
          audioMuted: false,
          items: [
            {
              kind: 'clip',
              clipId: 'clip-1',
              name: 'Source',
              targetUrl: 'source.mp4',
              startSeconds: 0,
              durationSeconds: 1,
              sourceStartSeconds: 0,
              playbackRate: 1,
              enabled: true,
              locked: false,
              audio: {
                muted: false,
                gainDb: 0,
                fadeInSeconds: 0,
                fadeOutSeconds: 0,
              },
            },
          ],
        },
      ],
    };
  }
});
