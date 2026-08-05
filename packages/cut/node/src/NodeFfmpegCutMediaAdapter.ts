import * as nodeCrypto from 'node:crypto';
import * as nodeFs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveTimelinePlaybackEndSeconds,
  CUT_LOUDNESS_TARGET,
  type CutExportRequest,
  type CutMediaAudioStream,
  type CutMediaProbe,
  type CutMediaRuntimeAdapter,
  type CutMediaVideoStream,
  type CutPcmMixSource,
  type CutPreviewPreparationProfile,
  type CutRuntimeMediaSource,
  type TimelineClipView,
  type TimelineTrackView,
  CutMediaCorruptionError,
  CutMediaRuntimeUnavailableError,
} from '@neko/cut-domain';
import {
  FfmpegCommandError,
  NodeFfmpegProcess,
  createPcmPacketTransform,
  getHardwareVideoPipeline,
  resolveHardwareVideoBackend,
  type FfmpegProcessPort,
  type HardwareVideoBackend,
  type HardwareVideoPipeline,
  type NodeMediaPublisher,
  type QualifiedHardwareVideoBackend,
  type RunningProcess,
} from '@neko/media/node';

export interface NodeFfmpegCutMediaAdapterOptions {
  readonly cacheRoot?: string;
  readonly process?: FfmpegProcessPort;
  readonly publisher?: NodeMediaPublisher;
  readonly vp8WebmDirectQualified?: boolean;
  readonly hardwareVideoBackend?: HardwareVideoBackend;
}

interface PreviewSessionRecord {
  readonly kind: 'preview';
  readonly token: string;
  readonly preparedDirectory?: string;
  state: 'paused' | 'active';
}

interface PcmSessionRecord {
  readonly kind: 'pcm';
  readonly token: string;
  state: 'paused' | 'active';
}

type SessionRecord = PreviewSessionRecord | PcmSessionRecord;

interface FfprobeStream {
  readonly index?: number;
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly profile?: string;
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
  readonly level?: number;
}

interface FfprobeJson {
  readonly streams?: readonly FfprobeStream[];
  readonly format?: { readonly duration?: string };
}

interface ExportInput {
  readonly clip: TimelineClipView;
  readonly track: TimelineTrackView;
  readonly inputIndex: number;
  readonly sourcePath: string;
  readonly hasAudio: boolean;
}

interface LoudnessMeasurement {
  readonly inputIntegratedLufs: number;
  readonly inputTruePeakDbtp: number;
  readonly inputLoudnessRangeLu: number;
  readonly inputThresholdLufs: number;
  readonly targetOffsetLu: number;
}

interface KeyframeIndex {
  readonly fingerprint: string;
  readonly timestampsSeconds: readonly number[];
}

const PCM_SAMPLE_RATE = 48_000;
const PCM_CHANNELS = 2;

export class NodeFfmpegCutMediaAdapter implements CutMediaRuntimeAdapter {
  private readonly process: FfmpegProcessPort;
  private readonly publisher: NodeMediaPublisher | undefined;
  private readonly cacheRoot: string;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly keyframeIndexes = new Map<string, Promise<KeyframeIndex>>();
  private readonly thumbnailCaptures = new Map<string, Promise<{ readonly dataUrl: string }>>();
  private readonly vp8WebmDirectQualified: boolean;
  private readonly hardwareVideoPipeline: HardwareVideoPipeline | undefined;
  private nextSessionId = 0;
  private disposed = false;

  constructor(
    private readonly workspaceRoot: string,
    options: NodeFfmpegCutMediaAdapterOptions = {},
  ) {
    this.process = options.process ?? new NodeFfmpegProcess();
    this.publisher = options.publisher;
    this.cacheRoot = options.cacheRoot ?? nodePath.join(nodeOs.tmpdir(), 'openneko-cut-media');
    this.vp8WebmDirectQualified = options.vp8WebmDirectQualified ?? true;
    this.hardwareVideoPipeline = getHardwareVideoPipeline(
      options.hardwareVideoBackend ?? resolveHardwareVideoBackend(),
    );
  }

  async probe(source: CutRuntimeMediaSource, signal?: AbortSignal): Promise<CutMediaProbe> {
    this.assertUsable();
    return this.probePath(this.resolveSource(source), signal);
  }

  private async probePath(sourcePath: string, signal?: AbortSignal): Promise<CutMediaProbe> {
    let result;
    try {
      result = await this.process.run(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', sourcePath],
        signal,
      );
    } catch (error) {
      throw classifyMediaCommandError(error, 'source', 'probe media');
    }
    const json = parseProbeJson(result.stdout);
    const streams = json.streams ?? [];
    const videoStream = streams.find((stream) => stream.codec_type === 'video');
    const audioStreams = streams
      .filter((stream) => stream.codec_type === 'audio')
      .map(projectAudioStream);
    const video = videoStream ? projectVideoStream(videoStream) : undefined;
    const durationSeconds = readDuration(json, streams);
    const primaryAudio = audioStreams[0];
    return {
      durationSeconds,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      framesPerSecond: video?.framesPerSecond ?? 0,
      hasVideo: video !== undefined,
      hasAudio: audioStreams.length > 0,
      ...(primaryAudio
        ? {
            audioChannels: primaryAudio.channels,
            audioSampleRate: primaryAudio.sampleRate,
          }
        : {}),
      ...(video ? { video } : {}),
      audioStreams,
    };
  }

  async captureFrame(
    source: CutRuntimeMediaSource,
    timeSeconds: number,
    options: { readonly width: number; readonly height: number },
    signal?: AbortSignal,
  ): Promise<{ readonly dataUrl: string }> {
    this.assertUsable();
    assertNonNegativeFinite(timeSeconds, 'frame time');
    assertPositiveInteger(options.width, 'frame width');
    assertPositiveInteger(options.height, 'frame height');
    signal?.throwIfAborted();
    const sourcePath = this.resolveSource(source);
    const stat = await nodeFs.stat(sourcePath);
    const cacheKey = nodeCrypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          source: source.workspaceRelativePath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          timeSeconds,
          width: options.width,
          height: options.height,
        }),
      )
      .digest('hex');
    const existing = this.thumbnailCaptures.get(cacheKey);
    if (existing) return existing;
    const pending = this.captureFrameCached(
      source,
      sourcePath,
      timeSeconds,
      options,
      cacheKey,
      signal,
    );
    this.thumbnailCaptures.set(cacheKey, pending);
    try {
      return await pending;
    } finally {
      if (this.thumbnailCaptures.get(cacheKey) === pending) {
        this.thumbnailCaptures.delete(cacheKey);
      }
    }
  }

  private async captureFrameCached(
    source: CutRuntimeMediaSource,
    sourcePath: string,
    timeSeconds: number,
    options: { readonly width: number; readonly height: number },
    cacheKey: string,
    signal?: AbortSignal,
  ): Promise<{ readonly dataUrl: string }> {
    const directory = nodePath.join(this.cacheRoot, 'thumbnails');
    const cachePath = nodePath.join(directory, `${cacheKey}.jpg`);
    try {
      const cached = await nodeFs.readFile(cachePath);
      if (cached.byteLength > 0) {
        return { dataUrl: `data:image/jpeg;base64,${cached.toString('base64')}` };
      }
      await nodeFs.rm(cachePath, { force: true });
    } catch (error) {
      if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
    }
    signal?.throwIfAborted();
    const captured = await this.captureFrameUncached(
      source,
      sourcePath,
      timeSeconds,
      options,
      signal,
    );
    const jpeg = Buffer.from(captured.dataUrl.slice('data:image/jpeg;base64,'.length), 'base64');
    await nodeFs.mkdir(directory, { recursive: true });
    const temporaryPath = `${cachePath}.${nodeCrypto.randomUUID()}.tmp`;
    try {
      await nodeFs.writeFile(temporaryPath, jpeg);
      await nodeFs.rename(temporaryPath, cachePath);
    } finally {
      await nodeFs.rm(temporaryPath, { force: true });
    }
    return captured;
  }

  private async captureFrameUncached(
    source: CutRuntimeMediaSource,
    sourcePath: string,
    timeSeconds: number,
    options: { readonly width: number; readonly height: number },
    signal?: AbortSignal,
  ): Promise<{ readonly dataUrl: string }> {
    const probe = await this.probe(source, signal);
    const video = probe.video;
    if (!video) throw new Error('Frame source contains no video stream.');
    const hardwareVideoPipeline = this.requireHardwareVideoPipeline(
      'hardware frame capture backend',
    );
    if (isHdrVideo(video)) {
      throw new CutMediaRuntimeUnavailableError('hardware-only HDR frame capture');
    }
    const filters = [
      buildCutFrameFilter(video, options.width, options.height, hardwareVideoPipeline),
    ];
    let result;
    try {
      result = await this.process.run(
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
          '-vf',
          filters.join(','),
          '-f',
          'image2pipe',
          '-c:v',
          'mjpeg',
          'pipe:1',
        ],
        signal,
      );
    } catch (error) {
      const failure = hardwareVideoPipeline.classifyFailure(error, video.codecName);
      if (failure) throw new CutMediaRuntimeUnavailableError(failure.capability);
      throw classifyMediaCommandError(
        error,
        'interval',
        `capture frame at ${decimal(timeSeconds)} seconds`,
      );
    }
    if (result.stdout.byteLength === 0) {
      throw new CutMediaCorruptionError(
        'interval',
        `capture frame at ${decimal(timeSeconds)} seconds`,
        'FFmpeg returned no captured frame.',
      );
    }
    return { dataUrl: `data:image/jpeg;base64,${result.stdout.toString('base64')}` };
  }

  async generateWaveform(
    source: CutRuntimeMediaSource,
    options: { readonly peaksPerSecond: number },
    signal?: AbortSignal,
  ) {
    this.assertUsable();
    assertPositiveFinite(options.peaksPerSecond, 'waveform peaks per second');
    const probe = await this.probe(source, signal);
    if (!probe.hasAudio) throw new Error('Waveform source contains no audio stream.');
    const decodeRate = Math.min(
      PCM_SAMPLE_RATE,
      Math.max(1_000, Math.ceil(options.peaksPerSecond * 128)),
    );
    let result;
    let partialFailure: FfmpegCommandError | undefined;
    try {
      result = await this.process.run(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          this.resolveSource(source),
          '-map',
          '0:a:0',
          '-vn',
          '-ac',
          '1',
          '-ar',
          String(decodeRate),
          '-f',
          'f32le',
          'pipe:1',
        ],
        signal,
      );
    } catch (error) {
      if (
        error instanceof FfmpegCommandError &&
        isMediaCorruptionDiagnostic(error.stderr) &&
        error.stdout.byteLength > 0
      ) {
        result = { stdout: error.stdout, stderr: error.stderr };
        partialFailure = error;
      } else {
        throw classifyMediaCommandError(error, 'stream', 'generate audio waveform');
      }
    }
    const samples = toFloat32(result.stdout);
    const samplesPerPeak = Math.max(1, Math.ceil(decodeRate / options.peaksPerSecond));
    const peakCount = Math.max(1, Math.ceil(samples.length / samplesPerPeak));
    const peaks = Array.from({ length: peakCount }, (_unused, peakIndex) => {
      const start = peakIndex * samplesPerPeak;
      const end = Math.min(samples.length, start + samplesPerPeak);
      let peak = 0;
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(samples[index] ?? 0));
      }
      return Math.min(1, peak);
    });
    return {
      peaks,
      durationSeconds: probe.durationSeconds,
      peaksPerSecond: options.peaksPerSecond,
      ...(partialFailure
        ? {
            partial: {
              availableDurationSeconds: samples.length / decodeRate,
              failureScope: 'stream' as const,
              message: compactFfmpegDiagnostic(partialFailure.stderr),
            },
          }
        : {}),
    };
  }

  async startPreview(
    source: CutRuntimeMediaSource,
    options: {
      readonly startTimeSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
      readonly startPaused: boolean;
    },
    signal?: AbortSignal,
  ) {
    this.assertUsable();
    validatePreviewInterval(options);
    const sourcePath = this.resolveSource(source);
    const probe = await this.probe(source, signal);
    const video = probe.video;
    if (!video) throw new Error('Preview source contains no video stream.');
    const profile = this.selectPreparationProfile(sourcePath, video);
    this.assertPreviewRuntimeCapabilities(profile, signal);
    const sourceDuration = options.durationSeconds * options.playbackRate;
    const sessionId = this.newSessionId('preview');
    const webm = profile === 'vp8-webm-direct';
    const direct = profile === 'h264-mp4-direct' || webm;
    let preparedDirectory: string | undefined;
    let registration: Awaited<ReturnType<NodeMediaPublisher['registerFile']>> | undefined;
    try {
      let preparedPath = sourcePath;
      let mediaTimeOriginSeconds = options.startTimeSeconds;
      if (!direct) {
        const fragment =
          profile === 'h264-mp4-remux'
            ? await this.resolveH264Fragment(
                sourcePath,
                options.startTimeSeconds,
                sourceDuration,
                signal,
              )
            : {
                startTimeSeconds: options.startTimeSeconds,
                sourceDurationSeconds: sourceDuration,
                mediaTimeOriginSeconds: 0,
              };
        await nodeFs.mkdir(this.cacheRoot, { recursive: true });
        preparedDirectory = await nodeFs.mkdtemp(nodePath.join(this.cacheRoot, 'preview-'));
        preparedPath = nodePath.join(preparedDirectory, 'preview.mp4');
        try {
          await this.process.run(
            'ffmpeg',
            buildPreviewArgs(
              sourcePath,
              preparedPath,
              video,
              profile,
              {
                startTimeSeconds: fragment.startTimeSeconds,
                sourceDurationSeconds: fragment.sourceDurationSeconds,
              },
              this.hardwareVideoPipeline,
            ),
            signal,
          );
        } catch (error) {
          if (profile === 'h264-sdr-transcode') {
            const failure = this.requireHardwareVideoPipeline(
              'hardware video preview backend',
            ).classifyFailure(error, video.codecName);
            if (failure) throw new CutMediaRuntimeUnavailableError(failure.capability);
          }
          throw classifyMediaCommandError(error, 'interval', 'prepare preview interval');
        }
        mediaTimeOriginSeconds = fragment.mediaTimeOriginSeconds;
      }
      registration = await this.requirePublisher().registerFile(
        preparedPath,
        webm ? 'video/webm' : 'video/mp4',
      );
      this.sessions.set(sessionId, {
        kind: 'preview',
        token: registration.token,
        ...(preparedDirectory ? { preparedDirectory } : {}),
        state: options.startPaused ? 'paused' : 'active',
      });
      return {
        sessionId,
        video: {
          url: registration.url,
          mimeType: webm
            ? 'video/webm; codecs="vp8"'
            : profile === 'h264-sdr-transcode'
              ? 'video/mp4; codecs="avc1.640029"'
              : h264MimeType(video),
          preparationProfile: profile,
          mediaTimeOriginSeconds,
          durationSeconds: options.durationSeconds,
        },
      };
    } catch (error) {
      if (registration) this.requirePublisher().unregister(registration.token);
      if (preparedDirectory) {
        await nodeFs.rm(preparedDirectory, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async resumePreview(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId, 'preview');
    if (session.state !== 'paused') {
      throw new Error(`Cut preview session is not paused: ${sessionId}`);
    }
    session.state = 'active';
  }

  async stopPreview(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId, 'preview');
    this.sessions.delete(sessionId);
    this.requirePublisher().unregister(session.token);
    if (session.preparedDirectory) {
      await nodeFs.rm(session.preparedDirectory, { recursive: true, force: true });
    }
  }

  async startPcmMix(
    sources: readonly CutPcmMixSource[],
    options: {
      readonly timelineStartSeconds: number;
      readonly durationSeconds: number;
      readonly startPaused: boolean;
    },
    signal?: AbortSignal,
  ) {
    this.assertUsable();
    assertNonNegativeFinite(options.timelineStartSeconds, 'PCM timeline start');
    assertPositiveFinite(options.durationSeconds, 'PCM duration');
    if (sources.length === 0) throw new Error('PCM mix requires at least one audible source.');
    const resolvedSources = await Promise.all(
      sources.map(async (source) => {
        validatePcmMixSource(source);
        const sourcePath = this.resolveSource(source.source);
        const probe = await this.probePath(sourcePath, signal);
        const audioStream =
          source.audioStreamIndex === undefined
            ? probe.audioStreams[0]
            : probe.audioStreams.find(
                (candidate) => candidate.streamIndex === source.audioStreamIndex,
              );
        if (!audioStream) throw new Error('PCM mix source contains no selected audio stream.');
        return {
          ...source,
          sourcePath,
          audioStreamIndex: audioStream.streamIndex,
        };
      }),
    );
    const registration = await this.requirePublisher().registerPcm((streamSignal) =>
      this.createPcmMixProcess(resolvedSources, options, streamSignal),
    );
    const sessionId = this.newSessionId('pcm');
    registration.prime();
    this.sessions.set(sessionId, {
      kind: 'pcm',
      token: registration.token,
      state: options.startPaused ? 'paused' : 'active',
    });
    return {
      sessionId,
      stream: {
        streamUrl: registration.url,
        sampleRate: PCM_SAMPLE_RATE,
        channels: PCM_CHANNELS,
      },
    };
  }

  async resumePcm(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId, 'pcm');
    if (session.state !== 'paused') throw new Error(`Cut PCM session is not paused: ${sessionId}`);
    session.state = 'active';
  }

  async stopPcm(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId, 'pcm');
    this.sessions.delete(sessionId);
    this.requirePublisher().unregister(session.token);
  }

  async export(
    request: CutExportRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly outputWorkspaceRelativePath: string }> {
    this.assertUsable();
    const playbackEnd = resolveTimelinePlaybackEndSeconds(request.timeline);
    if (playbackEnd <= 0) {
      throw new Error('Cut export requires at least one enabled Video or audible Audio Clip.');
    }
    const outputPath = await this.resolveWritableOutput(request.outputWorkspaceRelativePath);
    const jobId = this.newSessionId('export');
    const stagingPath = nodePath.join(
      nodePath.dirname(outputPath),
      `.${nodePath.basename(outputPath, nodePath.extname(outputPath))}.${jobId}.tmp${nodePath.extname(outputPath)}`,
    );
    try {
      const args = await this.buildExportArgs(request, stagingPath, playbackEnd, signal);
      await this.process.run('ffmpeg', args, signal);
      const result = await this.probeAbsolute(stagingPath, signal);
      validateExportProbe(result, playbackEnd, request.settings.framesPerSecond);
      if (request.settings.includeAudio && result.hasAudio) {
        const measuredOutput = await this.measureRenderedLoudness(stagingPath, signal);
        assertExportLoudness(measuredOutput);
      }
      await replaceOutputAtomically(stagingPath, outputPath, jobId);
      return { outputWorkspaceRelativePath: request.outputWorkspaceRelativePath };
    } finally {
      await nodeFs.rm(stagingPath, { force: true });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const records = [...this.sessions.entries()];
    this.sessions.clear();
    const publisher = records.length > 0 ? this.requirePublisher() : undefined;
    for (const [, session] of records) publisher?.unregister(session.token);
    await Promise.all(
      records.flatMap(([, session]) =>
        session.kind === 'preview' && session.preparedDirectory
          ? [nodeFs.rm(session.preparedDirectory, { recursive: true, force: true })]
          : [],
      ),
    );
  }

  private createPcmMixProcess(
    sources: readonly (CutPcmMixSource & {
      readonly sourcePath: string;
      readonly audioStreamIndex: number;
    })[],
    options: {
      readonly timelineStartSeconds: number;
      readonly durationSeconds: number;
    },
    signal: AbortSignal,
  ): RunningProcess {
    const inputArgs: string[] = [];
    const filters: string[] = [];
    const labels: string[] = [];
    sources.forEach((source, inputIndex) => {
      const sourceDuration = options.durationSeconds * source.playbackRate;
      inputArgs.push(
        '-ss',
        decimal(source.sourceStartSeconds),
        '-t',
        decimal(sourceDuration),
        '-i',
        source.sourcePath,
      );
      const label = `pcm${inputIndex}`;
      filters.push(
        `[${inputIndex}:${source.audioStreamIndex}]` +
          [
            `atrim=duration=${decimal(sourceDuration)}`,
            'asetpts=PTS-STARTPTS',
            ...atempoFilterChain(source.playbackRate),
            previewVolumeFilter(source),
          ].join(',') +
          `[${label}]`,
      );
      labels.push(`[${label}]`);
    });
    const mixedLabel = 'pcmmix';
    filters.push(
      labels.length === 1
        ? `${labels[0]}anull[${mixedLabel}]`
        : `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[${mixedLabel}]`,
    );
    filters.push(
      `[${mixedLabel}]atrim=duration=${decimal(options.durationSeconds)},` +
        `aformat=sample_fmts=flt:channel_layouts=stereo,` +
        `${realtimeLoudnessNormalizer()},aresample=${PCM_SAMPLE_RATE},${peakLimiter()},` +
        `aformat=sample_fmts=flt:channel_layouts=stereo[pcmout]`,
    );
    const process = this.process.streamFfmpeg(
      [
        '-v',
        'error',
        ...inputArgs,
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[pcmout]',
        '-vn',
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
    const framed = createPcmPacketTransform({
      sampleRate: PCM_SAMPLE_RATE,
      channels: PCM_CHANNELS,
      startTimeSeconds: options.timelineStartSeconds,
      playbackRate: 1,
    });
    process.stdout.pipe(framed);
    process.stdout.on('error', (error: Error) => {
      if (signal.aborted) {
        framed.end();
        return;
      }
      framed.destroy(error);
    });
    const completion = process.completion.catch((error: unknown) => {
      if (signal.aborted) return;
      throw error;
    });
    return {
      stdout: framed,
      completion,
      terminate: process.terminate,
    };
  }

  private selectPreparationProfile(
    sourcePath: string,
    video: CutMediaVideoStream,
  ): CutPreviewPreparationProfile {
    const extension = nodePath.extname(sourcePath).toLowerCase();
    if (
      video.codecName === 'vp8' &&
      extension === '.webm' &&
      this.vp8WebmDirectQualified &&
      isQualifiedNativeVideo(video)
    ) {
      return 'vp8-webm-direct';
    }
    if (video.codecName !== 'h264' || !isQualifiedNativeVideo(video)) {
      return 'h264-sdr-transcode';
    }
    return extension === '.mp4' || extension === '.m4v' ? 'h264-mp4-direct' : 'h264-mp4-remux';
  }

  private async resolveH264Fragment(
    sourcePath: string,
    requestedStartTimeSeconds: number,
    requestedDurationSeconds: number,
    signal?: AbortSignal,
  ): Promise<{
    readonly startTimeSeconds: number;
    readonly sourceDurationSeconds: number;
    readonly mediaTimeOriginSeconds: number;
  }> {
    if (requestedStartTimeSeconds === 0) {
      return {
        startTimeSeconds: 0,
        sourceDurationSeconds: requestedDurationSeconds,
        mediaTimeOriginSeconds: 0,
      };
    }
    const timestamps = await this.keyframes(sourcePath, signal);
    const preceding = timestamps.reduce<number | undefined>(
      (nearest, candidate) =>
        candidate <= requestedStartTimeSeconds && (nearest === undefined || candidate > nearest)
          ? candidate
          : nearest,
      undefined,
    );
    if (preceding === undefined) {
      throw new CutMediaCorruptionError(
        'interval',
        'prepare GOP-aligned H.264 preview',
        `No random-access frame precedes ${decimal(requestedStartTimeSeconds)} seconds.`,
      );
    }
    const mediaTimeOriginSeconds = Math.max(0, requestedStartTimeSeconds - preceding);
    return {
      startTimeSeconds: preceding,
      sourceDurationSeconds: mediaTimeOriginSeconds + requestedDurationSeconds,
      mediaTimeOriginSeconds,
    };
  }

  private async keyframes(sourcePath: string, signal?: AbortSignal): Promise<readonly number[]> {
    const stat = await nodeFs.stat(sourcePath);
    const fingerprint = `${stat.size}:${stat.mtimeMs}`;
    const cached = this.keyframeIndexes.get(sourcePath);
    if (cached) {
      const index = await cached;
      if (index.fingerprint === fingerprint) return index.timestampsSeconds;
      this.keyframeIndexes.delete(sourcePath);
    }
    const pending = this.readKeyframes(sourcePath, fingerprint, signal);
    this.keyframeIndexes.set(sourcePath, pending);
    try {
      return (await pending).timestampsSeconds;
    } catch (error) {
      if (this.keyframeIndexes.get(sourcePath) === pending) {
        this.keyframeIndexes.delete(sourcePath);
      }
      throw error;
    }
  }

  private async readKeyframes(
    sourcePath: string,
    fingerprint: string,
    signal?: AbortSignal,
  ): Promise<KeyframeIndex> {
    let result;
    try {
      result = await this.process.run(
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
    } catch (error) {
      throw classifyMediaCommandError(error, 'interval', 'index H.264 random-access frames');
    }
    const timestampsSeconds = result.stdout
      .toString('utf8')
      .split(/\r?\n/u)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (timestampsSeconds.length === 0) {
      throw new CutMediaCorruptionError(
        'stream',
        'index H.264 random-access frames',
        'FFprobe returned no usable random-access timestamps.',
      );
    }
    return { fingerprint, timestampsSeconds };
  }

  private async buildExportArgs(
    request: CutExportRequest,
    stagingPath: string,
    playbackEnd: number,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    const { timeline, settings } = request;
    const documentPath = fileURLToPath(timeline.documentUri);
    const realRoot = await nodeFs.realpath(this.workspaceRoot);
    const inputs: ExportInput[] = [];
    const inputArgs: string[] = [];
    const tracks = timeline.tracks.filter((track) => track.enabled);
    for (const track of tracks) {
      if (track.kind === 'Subtitle' && track.items.some((item) => item.kind === 'clip')) {
        throw new Error('The Node/FFmpeg Cut adapter cannot burn Subtitle Tracks into export yet.');
      }
      for (const item of track.items) {
        if (item.kind !== 'clip' || !item.enabled || track.kind === 'Subtitle') continue;
        const sourcePath = await resolveTimelineSource(realRoot, documentPath, item.targetUrl);
        const mediaProbe = await this.probeAbsolute(sourcePath, signal);
        const inputIndex = inputs.length;
        inputArgs.push(
          '-ss',
          decimal(item.sourceStartSeconds),
          '-t',
          decimal(item.durationSeconds * item.playbackRate),
          '-i',
          sourcePath,
        );
        inputs.push({
          clip: item,
          track,
          inputIndex,
          sourcePath,
          hasAudio: mediaProbe.hasAudio,
        });
      }
    }
    const videoFilters: string[] = [];
    const videoTrack = tracks.find((track) => track.kind === 'Video');
    const videoLabels: string[] = [];
    let videoCursor = 0;
    if (videoTrack) {
      for (const item of videoTrack.items) {
        if (item.startSeconds >= playbackEnd) break;
        const duration = Math.min(item.durationSeconds, playbackEnd - item.startSeconds);
        if (duration <= 0) continue;
        const input =
          item.kind === 'clip'
            ? inputs.find((candidate) => candidate.track === videoTrack && candidate.clip === item)
            : undefined;
        const label = `vseg${videoLabels.length}`;
        if (!input) {
          videoFilters.push(
            `color=c=black:s=${settings.width}x${settings.height}:r=${decimal(settings.framesPerSecond)}:d=${decimal(duration)}[${label}]`,
          );
        } else {
          videoFilters.push(
            `[${input.inputIndex}:v:0]setpts=(PTS-STARTPTS)/${decimal(input.clip.playbackRate)},` +
              `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,` +
              `pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:black,` +
              `setsar=1,fps=${decimal(settings.framesPerSecond)},format=yuv420p,` +
              `trim=duration=${decimal(duration)},setpts=PTS-STARTPTS[${label}]`,
          );
        }
        videoLabels.push(`[${label}]`);
        videoCursor = item.startSeconds + duration;
      }
    }
    if (videoCursor < playbackEnd) {
      const label = `vseg${videoLabels.length}`;
      videoFilters.push(
        `color=c=black:s=${settings.width}x${settings.height}:r=${decimal(settings.framesPerSecond)}:d=${decimal(playbackEnd - videoCursor)}[${label}]`,
      );
      videoLabels.push(`[${label}]`);
    }
    if (videoLabels.length === 0) {
      videoFilters.push(
        `color=c=black:s=${settings.width}x${settings.height}:r=${decimal(settings.framesPerSecond)}:d=${decimal(playbackEnd)}[vout]`,
      );
    } else if (videoLabels.length === 1) {
      videoFilters.push(`${videoLabels[0]}null[vout]`);
    } else {
      videoFilters.push(`${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0[vout]`);
    }

    const audioLabels: string[] = [];
    const audioFilters: string[] = [];
    if (settings.includeAudio) {
      for (const input of inputs) {
        const { clip, track } = input;
        const audible =
          input.hasAudio &&
          !track.audioMuted &&
          !clip.audio.muted &&
          (track.kind === 'Audio' || track.kind === 'Video');
        if (!audible) continue;
        const label = `aseg${audioLabels.length}`;
        const clipFilters = [
          `atrim=duration=${decimal(clip.durationSeconds * clip.playbackRate)}`,
          'asetpts=PTS-STARTPTS',
          ...atempoFilterChain(clip.playbackRate),
          `volume=${decimal(10 ** (clip.audio.gainDb / 20))}`,
        ];
        if (clip.audio.fadeInSeconds > 0) {
          clipFilters.push(`afade=t=in:st=0:d=${decimal(clip.audio.fadeInSeconds)}`);
        }
        if (clip.audio.fadeOutSeconds > 0) {
          clipFilters.push(
            `afade=t=out:st=${decimal(Math.max(0, clip.durationSeconds - clip.audio.fadeOutSeconds))}:d=${decimal(clip.audio.fadeOutSeconds)}`,
          );
        }
        clipFilters.push(`adelay=${Math.round(clip.startSeconds * 1_000)}:all=1`);
        audioFilters.push(`[${input.inputIndex}:a:0]${clipFilters.join(',')}[${label}]`);
        audioLabels.push(`[${label}]`);
      }
      if (audioLabels.length > 0) {
        audioFilters.push(
          `anullsrc=r=${settings.audioSampleRate}:cl=stereo:d=${decimal(playbackEnd)}[asilence]`,
        );
        audioFilters.push(
          `[asilence]${audioLabels.join('')}amix=inputs=${audioLabels.length + 1}:duration=longest:normalize=0,atrim=duration=${decimal(playbackEnd)}[amaster]`,
        );
      }
    }
    if (audioLabels.length > 0) {
      const measurement = await this.measureMixedLoudness(inputArgs, audioFilters, signal);
      audioFilters.push(
        `[amaster]${measuredLoudnessNormalizer(measurement)},${peakLimiter()}[aout]`,
      );
    }
    return [
      '-y',
      '-v',
      'error',
      ...inputArgs,
      '-filter_complex',
      [...videoFilters, ...audioFilters].join(';'),
      '-map',
      '[vout]',
      ...(audioLabels.length > 0 ? ['-map', '[aout]'] : []),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-r',
      decimal(settings.framesPerSecond),
      '-b:v',
      String(settings.videoBitrate),
      ...(audioLabels.length > 0
        ? [
            '-c:a',
            'aac',
            '-b:a',
            String(settings.audioBitrate),
            '-ar',
            String(settings.audioSampleRate),
          ]
        : []),
      '-movflags',
      '+faststart',
      stagingPath,
    ];
  }

  private async measureMixedLoudness(
    inputArgs: readonly string[],
    audioFilters: readonly string[],
    signal?: AbortSignal,
  ): Promise<LoudnessMeasurement> {
    const result = await this.process.run(
      'ffmpeg',
      [
        '-v',
        'info',
        ...inputArgs,
        '-filter_complex',
        [...audioFilters, `[amaster]${measurementLoudnessNormalizer()}[ameasure]`].join(';'),
        '-map',
        '[ameasure]',
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    return parseLoudnessMeasurement(result.stderr);
  }

  private async measureRenderedLoudness(
    outputPath: string,
    signal?: AbortSignal,
  ): Promise<LoudnessMeasurement> {
    const result = await this.process.run(
      'ffmpeg',
      [
        '-v',
        'info',
        '-i',
        outputPath,
        '-map',
        '0:a:0',
        '-af',
        measurementLoudnessNormalizer(),
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    return parseLoudnessMeasurement(result.stderr);
  }

  private async probeAbsolute(path: string, signal?: AbortSignal): Promise<CutMediaProbe> {
    return this.probePath(path, signal);
  }

  private resolveSource(source: CutRuntimeMediaSource): string {
    const value = source.workspaceRelativePath;
    if (
      value.length === 0 ||
      value.includes('\\') ||
      value.includes('\0') ||
      nodePath.posix.isAbsolute(value)
    ) {
      throw new Error('Cut media source must be a POSIX workspace-relative path.');
    }
    const resolved = nodePath.resolve(this.workspaceRoot, ...value.split('/'));
    assertContained(this.workspaceRoot, resolved);
    return resolved;
  }

  private async resolveWritableOutput(workspaceRelativePath: string): Promise<string> {
    const extension = nodePath.posix.extname(workspaceRelativePath).toLowerCase();
    if (extension !== '.mp4' && extension !== '.mov') {
      throw new Error('Cut export requires a workspace-relative .mp4 or .mov output.');
    }
    const outputPath = this.resolveSource({ workspaceRelativePath });
    const [realRoot, realParent] = await Promise.all([
      nodeFs.realpath(this.workspaceRoot),
      nodeFs.realpath(nodePath.dirname(outputPath)),
    ]);
    assertContained(realRoot, realParent);
    return nodePath.join(realParent, nodePath.basename(outputPath));
  }

  private requireSession<TKind extends SessionRecord['kind']>(
    sessionId: string,
    kind: TKind,
  ): Extract<SessionRecord, { readonly kind: TKind }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.kind !== kind) {
      throw new Error(`Unknown Cut ${kind} session: ${sessionId}`);
    }
    return session as Extract<SessionRecord, { readonly kind: TKind }>;
  }

  private newSessionId(kind: 'preview' | 'pcm' | 'export'): string {
    this.nextSessionId += 1;
    return `cut-${kind}-${this.nextSessionId}`;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Node/FFmpeg Cut media adapter is disposed.');
  }

  private requirePublisher(): NodeMediaPublisher {
    if (!this.publisher) {
      throw new Error('Cut media publication requires an injected Host publisher.');
    }
    return this.publisher;
  }

  private assertPreviewRuntimeCapabilities(
    profile: CutPreviewPreparationProfile,
    signal?: AbortSignal,
  ): void {
    if (profile !== 'h264-sdr-transcode') return;
    if (signal?.aborted) throw signal.reason;
    this.requireHardwareVideoPipeline('hardware video preview backend');
  }

  private requireHardwareVideoPipeline(capability: string): HardwareVideoPipeline {
    if (!this.hardwareVideoPipeline) {
      throw new CutMediaRuntimeUnavailableError(capability);
    }
    return this.hardwareVideoPipeline;
  }
}

function buildPreviewArgs(
  sourcePath: string,
  outputPath: string,
  video: CutMediaVideoStream,
  profile: CutPreviewPreparationProfile,
  interval: { readonly startTimeSeconds: number; readonly sourceDurationSeconds: number },
  hardwareVideoPipeline: HardwareVideoPipeline | undefined,
): readonly string[] {
  if (profile === 'h264-mp4-direct' || profile === 'vp8-webm-direct') {
    throw new Error(`Direct Cut preview profile must not invoke FFmpeg: ${profile}`);
  }
  const base = [
    '-y',
    '-v',
    'error',
    ...(profile === 'h264-sdr-transcode'
      ? ['-xerror', ...requirePreviewHardwareVideoPipeline(hardwareVideoPipeline).decodeInputArgs]
      : []),
    '-ss',
    decimal(interval.startTimeSeconds),
    '-t',
    decimal(interval.sourceDurationSeconds),
    '-i',
    sourcePath,
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-dn',
  ];
  if (profile === 'h264-mp4-remux') {
    return [
      ...base,
      '-c:v',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      outputPath,
    ];
  }
  const fps = Math.max(1, video.framesPerSecond || 30);
  const keyframeInterval = Math.max(1, Math.round(fps * 2));
  const pipeline = requirePreviewHardwareVideoPipeline(hardwareVideoPipeline);
  return [
    ...base,
    '-vf',
    buildCutPreviewVideoFilter(video, 1280, 720, pipeline.backend),
    ...pipeline.h264EncoderArgs,
    '-b:v',
    '8M',
    '-profile:v',
    'high',
    '-level:v',
    '4.1',
    '-g',
    String(keyframeInterval),
    '-keyint_min',
    String(keyframeInterval),
    '-sc_threshold',
    '0',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    outputPath,
  ];
}

export function buildCutPreviewVideoFilter(
  video: CutMediaVideoStream,
  maxWidth: number,
  maxHeight: number,
  hardwareVideoBackend: QualifiedHardwareVideoBackend,
): string {
  const size = fitVideoWithin(video.width, video.height, maxWidth, maxHeight);
  const pipeline = getHardwareVideoPipeline(hardwareVideoBackend);
  if (!pipeline) throw new Error(`Unknown hardware video backend: ${hardwareVideoBackend}`);
  return pipeline.buildSdrFilter(size.width, size.height, isHdrVideo(video));
}

function buildCutFrameFilter(
  video: CutMediaVideoStream,
  maxWidth: number,
  maxHeight: number,
  hardwareVideoPipeline: HardwareVideoPipeline,
): string {
  const size = fitVideoWithin(video.width, video.height, maxWidth, maxHeight);
  return hardwareVideoPipeline.buildFrameCaptureFilter(size.width, size.height);
}

function requirePreviewHardwareVideoPipeline(
  pipeline: HardwareVideoPipeline | undefined,
): HardwareVideoPipeline {
  if (!pipeline) {
    throw new CutMediaRuntimeUnavailableError('hardware video preview backend');
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
    width: evenDimension(width * scale),
    height: evenDimension(height * scale),
  };
}

function evenDimension(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function isHdrVideo(video: CutMediaVideoStream): boolean {
  return (
    video.color?.colorTransfer === 'smpte2084' || video.color?.colorTransfer === 'arib-std-b67'
  );
}

function isQualifiedNativeVideo(video: CutMediaVideoStream): boolean {
  return (
    (video.bitDepth ?? 8) <= 8 &&
    !isHdrVideo(video) &&
    (video.pixelFormat === 'yuv420p' ||
      video.pixelFormat === 'yuvj420p' ||
      video.pixelFormat === 'nv12')
  );
}

function classifyMediaCommandError(
  error: unknown,
  scope: 'source' | 'stream' | 'interval',
  operation: string,
): Error {
  if (error instanceof FfmpegCommandError && isMediaCorruptionDiagnostic(error.stderr)) {
    return new CutMediaCorruptionError(scope, operation, compactFfmpegDiagnostic(error.stderr));
  }
  return error instanceof Error ? error : new Error(String(error));
}

function isMediaCorruptionDiagnostic(stderr: string): boolean {
  return /(?:invalid nal unit size|missing picture in access unit|packet corrupt|invalid data found when processing input|channel element \d+\.\d+ is not allocated|error while decoding stream|output file is empty|nothing was encoded|nothing was written into output file|received no packets)/iu.test(
    stderr,
  );
}

function compactFfmpegDiagnostic(stderr: string): string {
  return stderr.trim().split(/\r?\n/u).filter(Boolean).slice(0, 2).join(' ');
}

function h264MimeType(video: CutMediaVideoStream): string {
  const profilePrefix =
    video.profile?.toLowerCase().includes('high') === true
      ? '6400'
      : video.profile?.toLowerCase().includes('main') === true
        ? '4d00'
        : '42e0';
  const level = Math.max(10, Math.min(255, videoLevel(video)));
  return `video/mp4; codecs="avc1.${profilePrefix}${level.toString(16).padStart(2, '0')}"`;
}

function videoLevel(video: CutMediaVideoStream): number {
  return video.level ?? 41;
}

function parseProbeJson(stdout: Buffer): FfprobeJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString('utf8'));
  } catch (error) {
    throw new Error('ffprobe returned invalid JSON.', { cause: error });
  }
  if (!isFfprobeJson(parsed)) throw new Error('ffprobe returned an invalid probe result.');
  return parsed;
}

function projectVideoStream(stream: FfprobeStream): CutMediaVideoStream {
  const width = positiveNumber(stream.width);
  const height = positiveNumber(stream.height);
  if (width === undefined || height === undefined) {
    throw new Error('ffprobe video stream is missing dimensions.');
  }
  const streamIndex = nonNegativeInteger(stream.index);
  const codecName = nonEmptyString(stream.codec_name);
  return {
    streamIndex,
    codecName,
    ...(stream.profile ? { profile: stream.profile } : {}),
    ...(stream.level !== undefined ? { level: stream.level } : {}),
    ...(stream.pix_fmt ? { pixelFormat: stream.pix_fmt } : {}),
    ...(inferBitDepth(stream) ? { bitDepth: inferBitDepth(stream) } : {}),
    width,
    height,
    framesPerSecond: parseRate(stream.avg_frame_rate ?? stream.r_frame_rate),
    color: {
      ...(stream.color_primaries ? { colorPrimaries: stream.color_primaries } : {}),
      ...(stream.color_transfer ? { colorTransfer: stream.color_transfer } : {}),
      ...(stream.color_space ? { colorSpace: stream.color_space } : {}),
      ...(stream.color_range ? { colorRange: stream.color_range } : {}),
    },
  };
}

function isFfprobeJson(value: unknown): value is FfprobeJson {
  if (!isRecord(value)) return false;
  if (value['streams'] !== undefined) {
    if (!Array.isArray(value['streams']) || !value['streams'].every(isFfprobeStream)) {
      return false;
    }
  }
  if (value['format'] !== undefined) {
    if (!isRecord(value['format'])) return false;
    const duration = value['format']['duration'];
    if (duration !== undefined && typeof duration !== 'string') return false;
  }
  return true;
}

function isFfprobeStream(value: unknown): value is FfprobeStream {
  if (!isRecord(value)) return false;
  return (
    hasOptionalNumber(value, 'index') &&
    hasOptionalString(value, 'codec_type') &&
    hasOptionalString(value, 'codec_name') &&
    hasOptionalString(value, 'profile') &&
    hasOptionalString(value, 'pix_fmt') &&
    hasOptionalString(value, 'bits_per_raw_sample') &&
    hasOptionalNumber(value, 'width') &&
    hasOptionalNumber(value, 'height') &&
    hasOptionalString(value, 'r_frame_rate') &&
    hasOptionalString(value, 'avg_frame_rate') &&
    hasOptionalString(value, 'duration') &&
    hasOptionalString(value, 'sample_rate') &&
    hasOptionalNumber(value, 'channels') &&
    hasOptionalString(value, 'channel_layout') &&
    hasOptionalString(value, 'color_primaries') &&
    hasOptionalString(value, 'color_transfer') &&
    hasOptionalString(value, 'color_space') &&
    hasOptionalString(value, 'color_range') &&
    hasOptionalNumber(value, 'level')
  );
}

function hasOptionalString(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === 'string';
}

function hasOptionalNumber(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === 'number';
}

function projectAudioStream(stream: FfprobeStream): CutMediaAudioStream {
  return {
    streamIndex: nonNegativeInteger(stream.index),
    codecName: nonEmptyString(stream.codec_name),
    ...(stream.profile ? { profile: stream.profile } : {}),
    channels: positiveNumber(stream.channels) ?? 1,
    ...(stream.channel_layout ? { channelLayout: stream.channel_layout } : {}),
    sampleRate: positiveNumber(Number(stream.sample_rate)) ?? PCM_SAMPLE_RATE,
  };
}

function readDuration(json: FfprobeJson, streams: readonly FfprobeStream[]): number {
  const formatDuration = positiveNumber(Number(json.format?.duration));
  if (formatDuration !== undefined) return formatDuration;
  const streamDuration = streams.reduce(
    (maximum, stream) => Math.max(maximum, positiveNumber(Number(stream.duration)) ?? 0),
    0,
  );
  if (streamDuration <= 0) throw new Error('ffprobe returned no positive media duration.');
  return streamDuration;
}

function parseRate(value: string | undefined): number {
  if (!value) return 0;
  const [numeratorText, denominatorText] = value.split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText ?? 1);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? numerator / denominator
    : 0;
}

function inferBitDepth(stream: FfprobeStream): number | undefined {
  const explicit = Number(stream.bits_per_raw_sample);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const match = /(?:p|yuv)\d*(10|12|16)(?:le|be)?/u.exec(stream.pix_fmt ?? '');
  return match?.[1] ? Number(match[1]) : stream.pix_fmt ? 8 : undefined;
}

function toFloat32(buffer: Buffer): Float32Array {
  const length = Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
  const copy = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + length * Float32Array.BYTES_PER_ELEMENT,
  );
  return new Float32Array(copy);
}

function peakLimiter(): string {
  return 'alimiter=limit=0.891251:attack=5:release=50:level=0:latency=1';
}

function realtimeLoudnessNormalizer(): string {
  return (
    `loudnorm=I=${CUT_LOUDNESS_TARGET.integratedLufs}:` +
    `TP=${CUT_LOUDNESS_TARGET.truePeakDbtp}:LRA=${CUT_LOUDNESS_TARGET.loudnessRangeLu}:` +
    'linear=false:print_format=summary'
  );
}

function measurementLoudnessNormalizer(): string {
  return (
    `loudnorm=I=${CUT_LOUDNESS_TARGET.integratedLufs}:` +
    `TP=${CUT_LOUDNESS_TARGET.truePeakDbtp}:LRA=${CUT_LOUDNESS_TARGET.loudnessRangeLu}:` +
    'print_format=json'
  );
}

function measuredLoudnessNormalizer(measurement: LoudnessMeasurement): string {
  return (
    `loudnorm=I=${CUT_LOUDNESS_TARGET.integratedLufs}:` +
    `TP=${CUT_LOUDNESS_TARGET.truePeakDbtp}:LRA=${CUT_LOUDNESS_TARGET.loudnessRangeLu}:` +
    `measured_I=${decimal(measurement.inputIntegratedLufs)}:` +
    `measured_TP=${decimal(measurement.inputTruePeakDbtp)}:` +
    `measured_LRA=${decimal(measurement.inputLoudnessRangeLu)}:` +
    `measured_thresh=${decimal(measurement.inputThresholdLufs)}:` +
    `offset=${decimal(measurement.targetOffsetLu)}:` +
    'linear=true:print_format=summary'
  );
}

function parseLoudnessMeasurement(stderr: string): LoudnessMeasurement {
  const blocks = stderr.match(/\{\s*"input_i"[\s\S]*?\}/gu);
  const block = blocks?.at(-1);
  if (!block) {
    throw new Error('FFmpeg loudnorm did not emit an EBU R128 measurement object.');
  }
  let value: unknown;
  try {
    value = JSON.parse(block);
  } catch (error) {
    throw new Error('FFmpeg loudnorm emitted invalid EBU R128 measurement JSON.', {
      cause: error,
    });
  }
  if (!isRecord(value)) {
    throw new Error('FFmpeg loudnorm measurement must be an object.');
  }
  return {
    inputIntegratedLufs: readFiniteLoudnessValue(value, 'input_i'),
    inputTruePeakDbtp: readFiniteLoudnessValue(value, 'input_tp'),
    inputLoudnessRangeLu: readFiniteLoudnessValue(value, 'input_lra'),
    inputThresholdLufs: readFiniteLoudnessValue(value, 'input_thresh'),
    targetOffsetLu: readFiniteLoudnessValue(value, 'target_offset'),
  };
}

function readFiniteLoudnessValue(value: Readonly<Record<string, unknown>>, key: string): number {
  const raw = value[key];
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(`FFmpeg loudnorm measurement ${key} is not finite: ${JSON.stringify(value)}.`);
  }
  return parsed;
}

function assertExportLoudness(measurement: LoudnessMeasurement): void {
  const integratedDelta = Math.abs(
    measurement.inputIntegratedLufs - CUT_LOUDNESS_TARGET.integratedLufs,
  );
  if (integratedDelta > 0.5) {
    throw new Error(
      `Cut export integrated loudness is ${decimal(measurement.inputIntegratedLufs)} LUFS; ` +
        `expected ${CUT_LOUDNESS_TARGET.integratedLufs} LUFS ±0.5 LU.`,
    );
  }
  if (measurement.inputTruePeakDbtp > CUT_LOUDNESS_TARGET.truePeakDbtp + 0.1) {
    throw new Error(
      `Cut export true peak is ${decimal(measurement.inputTruePeakDbtp)} dBTP; ` +
        `expected at most ${CUT_LOUDNESS_TARGET.truePeakDbtp} dBTP.`,
    );
  }
}

function previewVolumeFilter(source: CutPcmMixSource): string {
  const baseGain = decimal(10 ** (source.gainDb / 20));
  const factors: string[] = [baseGain];
  if (source.fadeInSeconds > 0) {
    factors.push(
      `min(1\\,(t+${decimal(source.clipPositionSeconds)})/${decimal(source.fadeInSeconds)})`,
    );
  }
  if (source.fadeOutSeconds > 0) {
    factors.push(
      `max(0\\,min(1\\,(${decimal(source.clipDurationSeconds)}-t-${decimal(source.clipPositionSeconds)})/${decimal(source.fadeOutSeconds)}))`,
    );
  }
  return factors.length === 1 ? `volume=${baseGain}` : `volume='${factors.join('*')}':eval=frame`;
}

function validatePcmMixSource(source: CutPcmMixSource): void {
  assertNonNegativeFinite(source.sourceStartSeconds, 'PCM source start');
  assertPositiveFinite(source.playbackRate, 'PCM playback rate');
  if (!Number.isFinite(source.gainDb) || source.gainDb < -60 || source.gainDb > 24) {
    throw new Error('PCM source gain must be finite and between -60 dB and +24 dB.');
  }
  assertNonNegativeFinite(source.clipPositionSeconds, 'PCM Clip position');
  assertPositiveFinite(source.clipDurationSeconds, 'PCM Clip duration');
  if (source.clipPositionSeconds >= source.clipDurationSeconds) {
    throw new Error('PCM Clip position must be before Clip duration.');
  }
  assertNonNegativeFinite(source.fadeInSeconds, 'PCM fade in');
  assertNonNegativeFinite(source.fadeOutSeconds, 'PCM fade out');
  if (
    source.fadeInSeconds > source.clipDurationSeconds ||
    source.fadeOutSeconds > source.clipDurationSeconds
  ) {
    throw new Error('PCM fade duration must not exceed Clip duration.');
  }
}

function atempoFilterChain(playbackRate: number): string[] {
  if (Math.abs(playbackRate - 1) < 0.000001) return [];
  const filters: string[] = [];
  let remaining = playbackRate;
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${decimal(remaining)}`);
  return filters;
}

function validatePreviewInterval(options: {
  readonly startTimeSeconds: number;
  readonly durationSeconds: number;
  readonly playbackRate: number;
}): void {
  assertNonNegativeFinite(options.startTimeSeconds, 'preview start');
  assertPositiveFinite(options.durationSeconds, 'preview duration');
  assertPositiveFinite(options.playbackRate, 'preview playback rate');
}

async function resolveTimelineSource(
  realRoot: string,
  documentPath: string,
  targetUrl: string,
): Promise<string> {
  if (!targetUrl || targetUrl.includes('\\') || nodePath.posix.isAbsolute(targetUrl)) {
    throw new Error('Cut timeline target must be a POSIX relative path.');
  }
  const resolved = nodePath.resolve(nodePath.dirname(documentPath), ...targetUrl.split('/'));
  const realSource = await nodeFs.realpath(resolved);
  assertContained(realRoot, realSource);
  return realSource;
}

function validateExportProbe(
  probe: CutMediaProbe,
  expectedDurationSeconds: number,
  framesPerSecond: number,
): void {
  if (!probe.hasVideo || probe.durationSeconds <= 0) {
    throw new Error('Node/FFmpeg export validation returned no video.');
  }
  const tolerance = 1 / framesPerSecond + 0.05;
  if (Math.abs(probe.durationSeconds - expectedDurationSeconds) > tolerance) {
    throw new Error(
      `Node/FFmpeg export duration ${probe.durationSeconds}s does not match timeline duration ${expectedDurationSeconds}s.`,
    );
  }
}

async function replaceOutputAtomically(
  stagingPath: string,
  outputPath: string,
  jobId: string,
): Promise<void> {
  const backupPath = `${outputPath}.${jobId}.backup`;
  let backedUp = false;
  try {
    await nodeFs.rename(outputPath, backupPath);
    backedUp = true;
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  try {
    await nodeFs.rename(stagingPath, outputPath);
    if (backedUp) await nodeFs.rm(backupPath, { force: true });
  } catch (error) {
    if (backedUp) await nodeFs.rename(backupPath, outputPath);
    throw error;
  }
}

function assertContained(root: string, candidate: string): void {
  const relative = nodePath.relative(nodePath.resolve(root), nodePath.resolve(candidate));
  if (
    relative === '..' ||
    relative.startsWith(`..${nodePath.sep}`) ||
    nodePath.isAbsolute(relative)
  ) {
    throw new Error('Cut path escapes the workspace.');
  }
}

function decimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('FFmpeg numeric argument must be finite.');
  return value.toFixed(6).replace(/\.?0+$/u, '');
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be non-negative.`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer.`);
}

function positiveNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? -1) < 0) {
    throw new Error('ffprobe stream is missing a valid stream index.');
  }
  return value as number;
}

function nonEmptyString(value: string | undefined): string {
  if (!value) throw new Error('ffprobe stream is missing a codec name.');
  return value;
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error['code'] === code;
}
