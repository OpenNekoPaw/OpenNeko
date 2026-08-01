import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  HtmlVideoDescriptor,
  HtmlVideoPreparationOptions,
  HtmlVideoPreparationProfile,
  FrameCaptureResult,
  MediaAudioStream,
  MediaProbe,
  MediaRuntimeQualification,
  MediaVideoStream,
  PcmStreamDescriptor,
  WaveformResult,
} from '../contracts';
import { MediaCorruptionError, MediaRuntimeUnavailableError } from '../errors';
import {
  FfmpegCommandError,
  NodeFfmpegProcess,
  type FfmpegProcessPort,
  type RunningProcess,
} from './NodeFfmpegProcess';
import {
  NodeMediaLoopbackServer,
  createPcmPacketTransform,
  type NodeMediaPublisher,
} from './NodeMediaLoopbackServer';
import {
  getHardwareVideoPipeline,
  resolveHardwareVideoBackend,
  type HardwareVideoBackend,
  type HardwareVideoPipeline,
} from './HardwareVideoPipeline';

export interface NodeMediaRuntimeOptions {
  readonly cacheRoot?: string;
  readonly process?: FfmpegProcessPort;
  readonly publisher?: NodeMediaPublisher;
  readonly vp8WebmDirectQualified?: boolean;
  readonly hardwareVideoBackend?: HardwareVideoBackend;
}

interface FileSession {
  readonly kind: 'file';
  readonly token: string;
  readonly directory?: string;
}

interface PcmSession {
  readonly kind: 'pcm';
  readonly token: string;
}

type Session = FileSession | PcmSession;

interface ProbeJson {
  readonly streams?: readonly ProbeStream[];
  readonly format?: {
    readonly duration?: string;
    readonly format_name?: string;
    readonly bit_rate?: string;
  };
}

interface ProbeStream {
  readonly index?: number;
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly profile?: string;
  readonly level?: number;
  readonly pix_fmt?: string;
  readonly bits_per_raw_sample?: string;
  readonly width?: number;
  readonly height?: number;
  readonly r_frame_rate?: string;
  readonly avg_frame_rate?: string;
  readonly duration?: string;
  readonly sample_rate?: string;
  readonly channels?: number;
  readonly channel_layout?: string;
  readonly color_primaries?: string;
  readonly color_transfer?: string;
  readonly color_space?: string;
  readonly color_range?: string;
}

const PCM_SAMPLE_RATE = 48_000;
const PCM_CHANNELS = 2;

export class NodeMediaRuntime {
  private readonly process: FfmpegProcessPort;
  private readonly publisher: NodeMediaPublisher;
  private readonly ownedServer: NodeMediaLoopbackServer | undefined;
  private readonly cacheRoot: string;
  private readonly vp8WebmDirectQualified: boolean;
  private readonly hardwareVideoPipeline: HardwareVideoPipeline | undefined;
  private readonly sessions = new Map<string, Session>();
  private rootPromise: Promise<string> | undefined;
  private qualificationPromise: Promise<MediaRuntimeQualification> | undefined;
  private disposed = false;

  constructor(options: NodeMediaRuntimeOptions = {}) {
    this.process = options.process ?? new NodeFfmpegProcess();
    this.ownedServer = options.publisher === undefined ? new NodeMediaLoopbackServer() : undefined;
    this.publisher = options.publisher ?? this.ownedServer!;
    this.cacheRoot = options.cacheRoot ?? path.join(os.tmpdir(), 'openneko-media');
    this.vp8WebmDirectQualified = options.vp8WebmDirectQualified ?? true;
    this.hardwareVideoPipeline = getHardwareVideoPipeline(
      options.hardwareVideoBackend ?? resolveHardwareVideoBackend(),
    );
  }

  async qualify(signal?: AbortSignal): Promise<MediaRuntimeQualification> {
    this.assertUsable();
    if (signal?.aborted) throw signal.reason;
    this.qualificationPromise ??= (async () => {
      try {
        const [ffmpegVersion, ffprobeVersion, hardwareAccelerators, decoders, encoders, filters] =
          await Promise.all([
            this.process.run('ffmpeg', ['-hide_banner', '-version']),
            this.process.run('ffprobe', ['-hide_banner', '-version']),
            this.process.run('ffmpeg', ['-hide_banner', '-hwaccels']),
            this.process.run('ffmpeg', ['-hide_banner', '-decoders']),
            this.process.run('ffmpeg', ['-hide_banner', '-encoders']),
            this.process.run('ffmpeg', ['-hide_banner', '-filters']),
          ]);
        const hardwareAcceleratorText = hardwareAccelerators.stdout.toString('utf8');
        const decoderText = decoders.stdout.toString('utf8');
        const encoderText = encoders.stdout.toString('utf8');
        const filterText = filters.stdout.toString('utf8');
        return {
          ffmpegVersion: firstLine(ffmpegVersion.stdout),
          ffprobeVersion: firstLine(ffprobeVersion.stdout),
          hardwareAccelerators: {
            videoToolbox: hasListedCapability(hardwareAcceleratorText, 'videotoolbox'),
          },
          decoders: {
            h264: hasListedCapability(decoderText, 'h264'),
            hevc: hasListedCapability(decoderText, 'hevc'),
            av1: hasListedCapability(decoderText, 'av1'),
            vp8: hasListedCapability(decoderText, 'vp8'),
            vp9: hasListedCapability(decoderText, 'vp9'),
            aac: hasListedCapability(decoderText, 'aac'),
            mp3: hasListedCapability(decoderText, 'mp3'),
            flac: hasListedCapability(decoderText, 'flac'),
            dts: hasListedCapability(decoderText, 'dca'),
          },
          encoders: {
            h264:
              hasListedCapability(encoderText, 'libx264') ||
              hasListedCapability(encoderText, 'h264'),
            h264VideoToolbox: hasListedCapability(encoderText, 'h264_videotoolbox'),
            aac: hasListedCapability(encoderText, 'aac'),
          },
          filters: {
            zscale: hasListedCapability(filterText, 'zscale'),
            tonemap: hasListedCapability(filterText, 'tonemap'),
            sidedata: hasListedCapability(filterText, 'sidedata'),
            alimiter: hasListedCapability(filterText, 'alimiter'),
            loudnorm: hasListedCapability(filterText, 'loudnorm'),
            ebur128: hasListedCapability(filterText, 'ebur128'),
            scaleVt: hasListedCapability(filterText, 'scale_vt'),
          },
        };
      } catch (error) {
        throw classifyRuntimeCapabilityError(error, 'FFmpeg/ffprobe executables');
      }
    })();
    return this.qualificationPromise;
  }

  async probe(sourcePath: string, signal?: AbortSignal): Promise<MediaProbe> {
    this.assertUsable();
    let output;
    try {
      output = await this.process.run(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', sourcePath],
        signal,
      );
    } catch (error) {
      throw classifyCommandError(error, 'source', 'probe media');
    }
    return projectProbe(parseProbe(output.stdout));
  }

  async captureFrame(
    sourcePath: string,
    timeSeconds: number,
    options: { readonly width?: number; readonly height?: number; readonly quality?: number } = {},
    signal?: AbortSignal,
  ): Promise<string> {
    this.assertUsable();
    assertNonNegative(timeSeconds, 'frame time');
    const probe = await this.probe(sourcePath, signal);
    const video = probe.video;
    if (!video) throw new Error('Frame source contains no video stream.');
    const hardwareVideoPipeline = this.requireHardwareVideoPipeline();
    const qualification = await this.qualify(signal);
    if (!qualification.filters[hardwareVideoPipeline.filterCapability]) {
      throw new MediaRuntimeUnavailableError(
        `${hardwareVideoPipeline.displayName} hardware scale filter`,
        'Bounded frame capture requires hardware scaling before single-frame readback.',
      );
    }
    if (isHdr(video)) {
      throw new MediaRuntimeUnavailableError(
        'hardware-only HDR frame capture',
        'HDR frame capture would require a CPU video-filter/readback path and is disabled.',
      );
    }
    const size = fitVideoWithin(
      video.width,
      video.height,
      options.width ?? video.width,
      options.height ?? video.height,
    );
    const filters = [hardwareVideoPipeline.buildFrameCaptureFilter(size.width, size.height)];
    const quality = Math.max(2, Math.min(31, Math.round(31 - (options.quality ?? 80) * 0.29)));
    try {
      const output = await this.process.run(
        'ffmpeg',
        [
          '-v',
          'error',
          '-xerror',
          ...hardwareVideoPipeline.decodeInputArgs,
          '-ss',
          decimal(timeSeconds),
          '-i',
          sourcePath,
          '-map',
          '0:v:0',
          '-frames:v',
          '1',
          ...(filters.length > 0 ? ['-vf', filters.join(',')] : []),
          '-c:v',
          'mjpeg',
          '-q:v',
          String(quality),
          '-f',
          'image2pipe',
          'pipe:1',
        ],
        signal,
      );
      if (output.stdout.byteLength === 0) {
        throw new MediaCorruptionError('interval', 'capture frame', 'FFmpeg returned no frame.');
      }
      return `data:image/jpeg;base64,${output.stdout.toString('base64')}`;
    } catch (error) {
      const failure = hardwareVideoPipeline.classifyFailure(error, video.codecName);
      if (failure) throw new MediaRuntimeUnavailableError(failure.capability);
      throw classifyCommandError(error, 'interval', 'capture frame');
    }
  }

  async captureFrames(
    sourcePath: string,
    timeSeconds: readonly number[],
    options: { readonly width?: number; readonly height?: number; readonly quality?: number } = {},
    signal?: AbortSignal,
  ): Promise<readonly FrameCaptureResult[]> {
    const results: FrameCaptureResult[] = [];
    for (const timestamp of timeSeconds) {
      try {
        results.push({
          status: 'ok',
          timeSeconds: timestamp,
          dataUrl: await this.captureFrame(sourcePath, timestamp, options, signal),
        });
      } catch (error) {
        if (!(error instanceof MediaCorruptionError) || error.scope !== 'interval') throw error;
        results.push({
          status: 'corrupt',
          timeSeconds: timestamp,
          scope: 'interval',
          message: error.message,
        });
      }
    }
    return results;
  }

  async generateWaveform(
    sourcePath: string,
    options: { readonly peaksPerSecond: number },
    signal?: AbortSignal,
  ): Promise<WaveformResult> {
    this.assertUsable();
    assertPositive(options.peaksPerSecond, 'waveform peaks per second');
    const probe = await this.probe(sourcePath, signal);
    const audio = probe.audioStreams[0];
    if (!audio) throw new Error('Waveform source contains no audio stream.');
    const samplesPerPeak = Math.max(1, Math.round(PCM_SAMPLE_RATE / options.peaksPerSecond));
    const process = this.process.streamFfmpeg(
      [
        '-v',
        'error',
        '-i',
        sourcePath,
        '-map',
        `0:${audio.streamIndex}`,
        '-ac',
        '1',
        '-ar',
        String(PCM_SAMPLE_RATE),
        '-f',
        'f32le',
        'pipe:1',
      ],
      signal,
    );
    const aggregator = new WaveformPeakAggregator(samplesPerPeak);
    let processError: unknown;
    try {
      for await (const chunk of process.stdout) {
        aggregator.push(readableChunkBuffer(chunk));
      }
    } catch (error) {
      processError = error;
      process.terminate();
    }
    try {
      await process.completion;
    } catch (error) {
      processError ??= error;
    }
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error('Waveform generation was cancelled.');
    }
    let partialMessage: string | undefined;
    if (processError !== undefined) {
      if (!(processError instanceof FfmpegCommandError) || aggregator.sampleCount === 0) {
        throw classifyCommandError(processError, 'stream', 'generate waveform');
      }
      partialMessage = compactDiagnostic(processError.stderr);
    } else if (aggregator.incompleteByteCount > 0) {
      throw new MediaCorruptionError(
        'stream',
        'generate waveform',
        'FFmpeg returned an incomplete float32 sample.',
      );
    }
    const peaks = aggregator.finish();
    const availableDurationSeconds = aggregator.sampleCount / PCM_SAMPLE_RATE;
    return {
      peaks,
      durationSeconds: probe.durationSeconds,
      sampleRate: PCM_SAMPLE_RATE,
      ...(partialMessage
        ? {
            partial: {
              availableDurationSeconds,
              failureScope: 'stream' as const,
              message: partialMessage,
            },
          }
        : {}),
    };
  }

  async prepareVideo(
    sourcePath: string,
    options: HtmlVideoPreparationOptions = {},
    signal?: AbortSignal,
  ): Promise<{
    readonly sessionId: string;
    readonly video: HtmlVideoDescriptor;
  }> {
    this.assertUsable();
    const probe = await this.probe(sourcePath, signal);
    const video = probe.video;
    if (!video) throw new Error('Video source contains no video stream.');
    const profile = this.selectVideoProfile(sourcePath, probe, options);
    let preparedPath = sourcePath;
    let directory: string | undefined;
    if (
      profile === 'h264-mp4-remux' ||
      profile === 'vp9-mp4-remux' ||
      profile === 'h264-sdr-transcode'
    ) {
      directory = await fs.mkdtemp(path.join(await this.runtimeRoot(), 'preview-'));
      preparedPath = path.join(directory, 'preview.mp4');
      try {
        const hardwareVideoPipeline =
          profile === 'h264-sdr-transcode' ? this.requireHardwareVideoPipeline() : undefined;
        await this.process.run(
          'ffmpeg',
          [
            '-y',
            '-v',
            'error',
            ...(profile === 'h264-sdr-transcode'
              ? [
                  '-xerror',
                  ...requirePreparedHardwareVideoPipeline(hardwareVideoPipeline).decodeInputArgs,
                ]
              : []),
            '-i',
            sourcePath,
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            ...(profile === 'h264-mp4-remux' || profile === 'vp9-mp4-remux'
              ? ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k']
              : hardwareVideoTranscodeArgs(
                  video,
                  requirePreparedHardwareVideoPipeline(hardwareVideoPipeline),
                ).concat(['-c:a', 'aac', '-b:a', '192k'])),
            '-movflags',
            '+faststart',
            preparedPath,
          ],
          signal,
        );
      } catch (error) {
        await fs.rm(directory, { recursive: true, force: true });
        if (profile === 'h264-sdr-transcode') {
          const failure = this.requireHardwareVideoPipeline().classifyFailure(
            error,
            video.codecName,
          );
          if (failure) throw new MediaRuntimeUnavailableError(failure.capability);
          throw classifyCommandError(error, 'stream', 'prepare hardware video');
        }
        throw classifyCommandError(error, 'stream', 'prepare video');
      }
    }
    const registration = await this.publisher.registerFile(
      preparedPath,
      profile === 'vp8-webm-direct' ? 'video/webm' : 'video/mp4',
    );
    const sessionId = randomUUID();
    this.sessions.set(sessionId, {
      kind: 'file',
      token: registration.token,
      ...(directory ? { directory } : {}),
    });
    return {
      sessionId,
      video: {
        version: 1,
        transport: 'http',
        url: registration.url,
        mimeType: profile === 'vp8-webm-direct' ? 'video/webm' : 'video/mp4',
        preparationProfile: profile,
        durationSeconds: probe.durationSeconds,
      },
    };
  }

  async planVideo(
    sourcePath: string,
    options: HtmlVideoPreparationOptions = {},
    signal?: AbortSignal,
  ): Promise<HtmlVideoPreparationProfile> {
    this.assertUsable();
    const probe = await this.probe(sourcePath, signal);
    if (!probe.video) throw new Error('Video source contains no video stream.');
    return this.selectVideoProfile(sourcePath, probe, options);
  }

  async publishFile(
    sourcePath: string,
    contentType: string,
  ): Promise<{ readonly sessionId: string; readonly url: string }> {
    this.assertUsable();
    const registration = await this.publisher.registerFile(sourcePath, contentType);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { kind: 'file', token: registration.token });
    return { sessionId, url: registration.url };
  }

  async startPcm(
    sourcePath: string,
    options: {
      readonly startTimeSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
      readonly audioStreamIndex?: number;
    },
    signal?: AbortSignal,
  ): Promise<{ readonly sessionId: string; readonly stream: PcmStreamDescriptor }> {
    this.assertUsable();
    assertNonNegative(options.startTimeSeconds, 'PCM start');
    assertPositive(options.durationSeconds, 'PCM duration');
    assertPositive(options.playbackRate, 'PCM playback rate');
    const probe = await this.probe(sourcePath, signal);
    const audio =
      options.audioStreamIndex === undefined
        ? probe.audioStreams[0]
        : probe.audioStreams.find((item) => item.streamIndex === options.audioStreamIndex);
    if (!audio) throw new Error('PCM source contains no selected audio stream.');
    const registration = await this.publisher.registerPcm((streamSignal) =>
      this.createPcmProcess(sourcePath, audio.streamIndex, options, streamSignal),
    );
    registration.prime();
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { kind: 'pcm', token: registration.token });
    return {
      sessionId,
      stream: {
        version: 1,
        transport: 'http',
        protocol: 'neko-pcm-f32le-v1',
        streamUrl: registration.url,
        sampleRate: PCM_SAMPLE_RATE,
        channels: PCM_CHANNELS,
      },
    };
  }

  async transcode(
    sourcePath: string,
    outputPath: string,
    options: { readonly kind: 'audio' | 'video' },
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertUsable();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const staging = `${outputPath}.${randomUUID()}.tmp${path.extname(outputPath)}`;
    try {
      await this.process.run(
        'ffmpeg',
        [
          '-y',
          '-v',
          'error',
          '-i',
          sourcePath,
          ...(options.kind === 'audio'
            ? ['-vn', '-c:a', 'aac', '-b:a', '192k']
            : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart']),
          staging,
        ],
        signal,
      );
      await fs.rename(staging, outputPath);
    } catch (error) {
      await fs.rm(staging, { force: true });
      throw classifyCommandError(error, 'operation', 'transcode media');
    }
  }

  async keyframes(sourcePath: string, signal?: AbortSignal): Promise<readonly number[]> {
    this.assertUsable();
    const output = await this.process.run(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-skip_frame',
        'nokey',
        '-show_entries',
        'frame=best_effort_timestamp_time',
        '-of',
        'csv=p=0',
        sourcePath,
      ],
      signal,
    );
    return output.stdout
      .toString('utf8')
      .split(/\r?\n/u)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 0);
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown media session: ${sessionId}`);
    this.sessions.delete(sessionId);
    this.publisher.unregister(session.token);
    if (session.kind === 'file' && session.directory) {
      await fs.rm(session.directory, { recursive: true, force: true });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of [...this.sessions.keys()]) await this.stop(id);
    await this.ownedServer?.dispose();
    const root = await this.rootPromise?.catch(() => undefined);
    if (root) await fs.rm(root, { recursive: true, force: true });
  }

  private createPcmProcess(
    sourcePath: string,
    streamIndex: number,
    options: {
      readonly startTimeSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
    },
    signal: AbortSignal,
  ): RunningProcess {
    const audioFilter = atempo(options.playbackRate);
    const raw = this.process.streamFfmpeg(
      [
        '-v',
        'error',
        '-ss',
        decimal(options.startTimeSeconds),
        '-i',
        sourcePath,
        '-t',
        decimal(options.durationSeconds * options.playbackRate),
        '-map',
        `0:${streamIndex}`,
        ...(audioFilter ? ['-af', audioFilter] : []),
        '-ac',
        String(PCM_CHANNELS),
        '-ar',
        String(PCM_SAMPLE_RATE),
        '-f',
        'f32le',
        'pipe:1',
      ],
      signal,
    );
    const framed = raw.stdout.pipe(
      createPcmPacketTransform({
        sampleRate: PCM_SAMPLE_RATE,
        channels: PCM_CHANNELS,
        startTimeSeconds: options.startTimeSeconds,
        playbackRate: options.playbackRate,
      }),
    );
    raw.stdout.on('error', (error: Error) => {
      if (signal.aborted) {
        framed.end();
        return;
      }
      framed.destroy(error);
    });
    const completion = raw.completion.catch((error: unknown) => {
      if (signal.aborted) return;
      throw error;
    });
    return { stdout: framed, completion, terminate: () => raw.terminate() };
  }

  private selectVideoProfile(
    sourcePath: string,
    probe: MediaProbe,
    options: HtmlVideoPreparationOptions,
  ): HtmlVideoPreparationProfile {
    const video = probe.video;
    if (!video) throw new Error('Video source contains no video stream.');
    const extension = path.extname(sourcePath).toLowerCase();
    const mp4 = extension === '.mp4' || extension === '.m4v';
    if (video.codecName === 'h264' && (video.bitDepth ?? 8) <= 8 && !isHdr(video)) {
      return mp4 ? 'h264-mp4-direct' : 'h264-mp4-remux';
    }
    if (video.codecName === 'av1' && mp4 && options.nativeCapabilities?.av1Mp4 === true) {
      return 'av1-mp4-direct';
    }
    if (
      video.codecName === 'vp9' &&
      extension === '.webm' &&
      options.nativeCapabilities?.vp9Mp4 === true
    ) {
      return 'vp9-mp4-remux';
    }
    if (
      this.vp8WebmDirectQualified &&
      video.codecName === 'vp8' &&
      extension === '.webm' &&
      (video.bitDepth ?? 8) <= 8 &&
      !isHdr(video)
    ) {
      return 'vp8-webm-direct';
    }
    return 'h264-sdr-transcode';
  }

  private requireHardwareVideoPipeline(): HardwareVideoPipeline {
    if (!this.hardwareVideoPipeline) {
      throw new MediaRuntimeUnavailableError(
        'hardware video preview backend',
        'Video preview requires an all-hardware backend; CPU transcoding is disabled.',
      );
    }
    return this.hardwareVideoPipeline;
  }

  private runtimeRoot(): Promise<string> {
    this.rootPromise ??= (async () => {
      await fs.mkdir(this.cacheRoot, { recursive: true });
      return fs.mkdtemp(path.join(this.cacheRoot, 'runtime-'));
    })();
    return this.rootPromise;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Node media runtime is disposed.');
  }
}

function parseProbe(bytes: Buffer): ProbeJson {
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!isProbeJson(value)) throw new Error('ffprobe returned invalid JSON.');
  return value;
}

function projectProbe(json: ProbeJson): MediaProbe {
  const streams = json.streams ?? [];
  const videoSource = streams.find((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio').map(projectAudio);
  const video = videoSource ? projectVideo(videoSource) : undefined;
  const durationSeconds =
    positive(Number(json.format?.duration)) ??
    Math.max(...streams.map((stream) => positive(Number(stream.duration)) ?? 0));
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new Error('ffprobe returned an invalid media duration.');
  }
  return {
    durationSeconds,
    ...(json.format?.format_name ? { formatName: json.format.format_name } : {}),
    ...(positive(Number(json.format?.bit_rate)) ? { bitRate: Number(json.format?.bit_rate) } : {}),
    ...(video ? { video } : {}),
    audioStreams,
  };
}

function projectVideo(stream: ProbeStream): MediaVideoStream {
  const width = positive(stream.width);
  const height = positive(stream.height);
  if (!width || !height) throw new Error('Video stream is missing dimensions.');
  return {
    streamIndex: nonNegativeInteger(stream.index),
    codecName: requiredString(stream.codec_name, 'video codec'),
    ...(stream.profile ? { codecProfile: stream.profile } : {}),
    ...(stream.level !== undefined ? { codecLevel: stream.level } : {}),
    ...(stream.pix_fmt ? { pixelFormat: stream.pix_fmt } : {}),
    ...(inferBitDepth(stream) !== undefined ? { bitDepth: inferBitDepth(stream) } : {}),
    width,
    height,
    framesPerSecond: parseRate(stream.avg_frame_rate || stream.r_frame_rate),
    color: {
      ...(stream.color_primaries ? { primaries: stream.color_primaries } : {}),
      ...(stream.color_transfer ? { transfer: stream.color_transfer } : {}),
      ...(stream.color_space ? { space: stream.color_space } : {}),
      ...(stream.color_range ? { range: stream.color_range } : {}),
    },
  };
}

function projectAudio(stream: ProbeStream): MediaAudioStream {
  return {
    streamIndex: nonNegativeInteger(stream.index),
    codecName: requiredString(stream.codec_name, 'audio codec'),
    sampleRate: positive(Number(stream.sample_rate)) ?? 0,
    channels: positive(stream.channels) ?? 0,
    ...(stream.channel_layout ? { channelLayout: stream.channel_layout } : {}),
  };
}

function classifyCommandError(
  error: unknown,
  scope: 'source' | 'stream' | 'interval' | 'operation',
  operation: string,
): Error {
  if (error instanceof MediaRuntimeUnavailableError || error instanceof MediaCorruptionError) {
    return error;
  }
  if (error instanceof FfmpegCommandError && isCorruption(error.stderr)) {
    return new MediaCorruptionError(
      scope === 'operation' ? 'stream' : scope,
      operation,
      compactDiagnostic(error.stderr),
    );
  }
  if (isUnavailableProcessError(error)) {
    return new MediaRuntimeUnavailableError(operation, error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function classifyRuntimeCapabilityError(error: unknown, capability: string): Error {
  if (error instanceof MediaRuntimeUnavailableError) return error;
  if (error instanceof Error) {
    return new MediaRuntimeUnavailableError(capability, error.message);
  }
  return new MediaRuntimeUnavailableError(capability, String(error));
}

function isUnavailableProcessError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    (error instanceof FfmpegCommandError &&
      /(?:unknown encoder|encoder .* not found|no such filter|error initializing output stream)/iu.test(
        error.stderr,
      ))
  );
}

function isCorruption(stderr: string): boolean {
  return /(?:invalid nal unit size|missing picture in access unit|packet corrupt|invalid data found when processing input|channel element \d+\.\d+ is not allocated|error while decoding stream|output file is empty|nothing was encoded|nothing was written into output file|received no packets)/iu.test(
    stderr,
  );
}

function compactDiagnostic(stderr: string): string {
  return stderr.trim().split(/\r?\n/u).slice(-6).join('\n') || 'Media decode failed.';
}

function hardwareVideoTranscodeArgs(
  video: MediaVideoStream,
  pipeline: HardwareVideoPipeline,
): readonly string[] {
  const size = fitVideoWithin(video.width, video.height, 1280, 720);
  return [
    '-vf',
    pipeline.buildSdrFilter(size.width, size.height, isHdr(video)),
    ...pipeline.h264EncoderArgs,
    '-b:v',
    '8M',
  ];
}

function requirePreparedHardwareVideoPipeline(
  pipeline: HardwareVideoPipeline | undefined,
): HardwareVideoPipeline {
  if (!pipeline) {
    throw new Error('Hardware transcode profile requires a hardware video pipeline.');
  }
  return pipeline;
}

function fitVideoWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(2, Math.floor((width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((height * scale) / 2) * 2),
  };
}

function isHdr(video: MediaVideoStream): boolean {
  return (
    video.color.transfer === 'smpte2084' ||
    video.color.transfer === 'arib-std-b67' ||
    video.color.primaries === 'bt2020'
  );
}

function hasListedCapability(output: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:\\s|$)`, 'mu').test(output);
}

function firstLine(output: Buffer): string {
  const line = output.toString('utf8').split(/\r?\n/u)[0]?.trim();
  if (!line) throw new Error('FFmpeg capability command returned no version.');
  return line;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function inferBitDepth(stream: ProbeStream): number | undefined {
  const explicit = Number(stream.bits_per_raw_sample);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const match = /(?:p|yuv)\d*(10|12|16)(?:le|be)?/u.exec(stream.pix_fmt ?? '');
  return match?.[1] ? Number(match[1]) : stream.pix_fmt ? 8 : undefined;
}

function parseRate(value: string | undefined): number {
  if (!value) return 0;
  const [left, right] = value.split('/');
  const numerator = Number(left);
  const denominator = Number(right ?? 1);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? numerator / denominator
    : 0;
}

class WaveformPeakAggregator {
  private readonly peaks: number[] = [];
  private incompleteBytes: Buffer = Buffer.alloc(0);
  private samplesInCurrentPeak = 0;
  private currentPeak = 0;
  private finished = false;
  sampleCount = 0;

  constructor(private readonly samplesPerPeak: number) {}

  get incompleteByteCount(): number {
    return this.incompleteBytes.byteLength;
  }

  push(chunk: Buffer): void {
    if (this.finished) throw new Error('Waveform peak aggregation is already finished.');
    const bytes =
      this.incompleteBytes.byteLength === 0 ? chunk : Buffer.concat([this.incompleteBytes, chunk]);
    const completeByteCount =
      bytes.byteLength - (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT);
    for (let offset = 0; offset < completeByteCount; offset += Float32Array.BYTES_PER_ELEMENT) {
      const sample = bytes.readFloatLE(offset);
      if (!Number.isFinite(sample)) {
        throw new MediaCorruptionError(
          'stream',
          'generate waveform',
          'FFmpeg returned a non-finite PCM sample.',
        );
      }
      this.currentPeak = Math.max(this.currentPeak, Math.abs(sample));
      this.samplesInCurrentPeak += 1;
      this.sampleCount += 1;
      if (this.samplesInCurrentPeak === this.samplesPerPeak) this.flushPeak();
    }
    this.incompleteBytes =
      completeByteCount === bytes.byteLength
        ? Buffer.alloc(0)
        : Buffer.from(bytes.subarray(completeByteCount));
  }

  finish(): readonly number[] {
    if (this.finished) throw new Error('Waveform peak aggregation is already finished.');
    this.finished = true;
    if (this.samplesInCurrentPeak > 0) this.flushPeak();
    return this.peaks;
  }

  private flushPeak(): void {
    this.peaks.push(Math.min(1, this.currentPeak));
    this.samplesInCurrentPeak = 0;
    this.currentPeak = 0;
  }
}

function readableChunkBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new Error('FFmpeg waveform stream returned a non-binary chunk.');
}

function atempo(rate: number): string | undefined {
  if (Math.abs(rate - 1) < 0.000001) return undefined;
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${decimal(remaining)}`);
  return filters.join(',');
}

function decimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('FFmpeg numeric argument must be finite.');
  return value.toFixed(6).replace(/\.?0+$/u, '');
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative.`);
}

function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('ffprobe stream has an invalid index.');
  }
  return value;
}

function requiredString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`ffprobe stream is missing ${label}.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProbeJson(value: unknown): value is ProbeJson {
  if (!isRecord(value)) return false;
  if (value['streams'] !== undefined && !Array.isArray(value['streams'])) return false;
  if (value['format'] !== undefined && !isRecord(value['format'])) return false;
  return true;
}
