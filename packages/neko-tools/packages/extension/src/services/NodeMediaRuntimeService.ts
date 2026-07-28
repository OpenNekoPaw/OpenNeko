import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AudioDiffDetails,
  DiffOptions,
  DiffResult,
  MediaType,
  VideoDiffDetails,
} from '@neko-tools/contracts';
import { NodeFfmpegProcess, NodeMediaRuntime, type FfmpegProcessPort } from '@neko/media/node';
import type { MediaProbe } from '@neko/media';
import type {
  IMediaRuntimeService,
  IToolsMediaRuntime,
  MediaProbeResult,
} from '../contracts/IMediaRuntimeService';

const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_BLOCK_SECONDS = 1;
const AUDIO_DIFF_SNR_THRESHOLD = 40;

interface AudioDiffRegion {
  start: number;
  end: number;
  snr: number;
  rmsDiff: number;
}

interface AudioComparison {
  readonly snr: number;
  readonly diffSegmentCount: number;
  readonly totalSegments: number;
  readonly diffRegions: readonly AudioDiffRegion[];
  readonly waveformPeaksA: readonly number[];
  readonly waveformPeaksB: readonly number[];
}

interface VideoMetric {
  readonly frame: number;
  readonly timestamp: number;
  readonly ssim: number;
}

export class NodeMediaRuntimeService implements IMediaRuntimeService {
  constructor(
    readonly runtime: IToolsMediaRuntime = new NodeMediaRuntime(),
    private readonly process: FfmpegProcessPort = new NodeFfmpegProcess(),
  ) {}

  async probe(source: string, signal?: AbortSignal): Promise<MediaProbeResult> {
    return projectProbe(await this.runtime.probe(source, signal));
  }

  async compare(
    mediaType: MediaType,
    currentPath: string,
    previousPath: string,
    options: DiffOptions,
    signal: AbortSignal,
  ): Promise<DiffResult> {
    switch (mediaType) {
      case 'image':
        return this.compareImages(currentPath, previousPath, signal);
      case 'audio':
        return this.compareAudio(currentPath, previousPath, options, signal);
      case 'video':
        return this.compareVideo(currentPath, previousPath, options, signal);
    }
  }

  private async compareImages(
    currentPath: string,
    previousPath: string,
    signal: AbortSignal,
  ): Promise<DiffResult> {
    const [currentProbe, previousProbe] = await Promise.all([
      this.runtime.probe(currentPath, signal),
      this.runtime.probe(previousPath, signal),
    ]);
    const currentVideo = requireVisualStream(currentProbe, currentPath);
    const previousVideo = requireVisualStream(previousProbe, previousPath);
    const command = await this.process.run(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-i',
        currentPath,
        '-i',
        previousPath,
        '-filter_complex',
        `[1:v]scale=${currentVideo.width}:${currentVideo.height}[b];[0:v][b]ssim`,
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    const structuralSimilarity = parseSsimSummary(command.stderr);
    if (structuralSimilarity === undefined) {
      throw new Error('Image comparison did not produce an SSIM result.');
    }
    return {
      mediaType: 'image',
      similarity: clampRatio(structuralSimilarity),
      details: {
        dimensions: {
          current: { width: currentVideo.width, height: currentVideo.height },
          previous: { width: previousVideo.width, height: previousVideo.height },
        },
        pixelDifference: clampRatio(1 - structuralSimilarity),
        structuralSimilarity: clampRatio(structuralSimilarity),
      },
    };
  }

  private async compareAudio(
    currentPath: string,
    previousPath: string,
    options: DiffOptions,
    signal: AbortSignal,
  ): Promise<DiffResult> {
    const [currentProbe, previousProbe] = await Promise.all([
      this.runtime.probe(currentPath, signal),
      this.runtime.probe(previousPath, signal),
    ]);
    const startTime = options.startTime ?? 0;
    const endTime = options.endTime;
    const duration = overlappingDuration(currentProbe, previousProbe, startTime, endTime);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openneko-audio-diff-'));
    const currentPcm = path.join(directory, 'current.f32le');
    const previousPcm = path.join(directory, 'previous.f32le');

    try {
      await Promise.all([
        this.decodeMonoPcm(currentPath, currentPcm, startTime, duration, signal),
        this.decodeMonoPcm(previousPath, previousPcm, startTime, duration, signal),
      ]);
      const comparison = await comparePcmFiles(currentPcm, previousPcm, signal);
      const [currentSilence, previousSilence] = await Promise.all([
        this.detectSilence(currentPath, currentProbe.durationSeconds, signal),
        this.detectSilence(previousPath, previousProbe.durationSeconds, signal),
      ]);
      const details: AudioDiffDetails = {
        duration: {
          current: currentProbe.durationSeconds,
          previous: previousProbe.durationSeconds,
        },
        sampleRate: {
          current: currentProbe.audioStreams[0]?.sampleRate ?? 0,
          previous: previousProbe.audioStreams[0]?.sampleRate ?? 0,
        },
        channels: {
          current: currentProbe.audioStreams[0]?.channels ?? 0,
          previous: previousProbe.audioStreams[0]?.channels ?? 0,
        },
        waveformSimilarity: snrToSimilarity(comparison.snr),
        spectralDifference:
          comparison.totalSegments > 0 ? comparison.diffSegmentCount / comparison.totalSegments : 0,
        diffRegions: comparison.diffRegions.map(({ start, end, snr }) => ({ start, end, snr })),
        silenceRegions: {
          current: currentSilence,
          previous: previousSilence,
        },
      };
      const durationRatio =
        Math.max(currentProbe.durationSeconds, previousProbe.durationSeconds) > 0
          ? Math.min(currentProbe.durationSeconds, previousProbe.durationSeconds) /
            Math.max(currentProbe.durationSeconds, previousProbe.durationSeconds)
          : 1;
      return {
        mediaType: 'audio',
        similarity: clampRatio(details.waveformSimilarity * durationRatio),
        details,
        visualization: {
          currentWaveform: comparison.waveformPeaksA,
          previousWaveform: comparison.waveformPeaksB,
        },
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  private async compareVideo(
    currentPath: string,
    previousPath: string,
    options: DiffOptions,
    signal: AbortSignal,
  ): Promise<DiffResult> {
    const [currentProbe, previousProbe] = await Promise.all([
      this.runtime.probe(currentPath, signal),
      this.runtime.probe(previousPath, signal),
    ]);
    const currentVideo = requireVisualStream(currentProbe, currentPath);
    const previousVideo = requireVisualStream(previousProbe, previousPath);
    const sampleFps = Math.max(0.1, options.precision ?? 1);
    const startTime = options.startTime ?? 0;
    const duration = overlappingDuration(currentProbe, previousProbe, startTime, options.endTime);
    const command = await this.process.run(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-ss',
        String(startTime),
        '-i',
        currentPath,
        '-ss',
        String(startTime),
        '-i',
        previousPath,
        '-t',
        String(duration),
        '-filter_complex',
        `[0:v]fps=${sampleFps},setpts=PTS-STARTPTS[a];[1:v]fps=${sampleFps},scale=${currentVideo.width}:${currentVideo.height},setpts=PTS-STARTPTS[b];[a][b]ssim=stats_file=-`,
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    const metrics = parseSsimMetrics(
      `${command.stdout.toString('utf8')}\n${command.stderr}`,
      startTime,
      sampleFps,
    );
    const summary = parseSsimSummary(command.stderr);
    if (summary === undefined && metrics.length === 0) {
      throw new Error('Video comparison did not produce SSIM metrics.');
    }
    const averageSsim =
      summary ??
      metrics.reduce((total, metric) => total + metric.ssim, 0) / Math.max(metrics.length, 1);
    const details: VideoDiffDetails = {
      duration: {
        current: currentProbe.durationSeconds,
        previous: previousProbe.durationSeconds,
      },
      resolution: {
        current: { width: currentVideo.width, height: currentVideo.height },
        previous: { width: previousVideo.width, height: previousVideo.height },
      },
      fps: {
        current: currentVideo.framesPerSecond,
        previous: previousVideo.framesPerSecond,
      },
      codec: {
        current: currentVideo.codecName,
        previous: previousVideo.codecName,
      },
      keyframeDiffs: metrics.map((metric) => ({
        time: metric.timestamp,
        similarity: metric.ssim,
      })),
      audioTrackChanged: audioSignature(currentProbe) !== audioSignature(previousProbe),
      diffRegions: createVideoDiffRegions(metrics, sampleFps),
    };
    const durationRatio =
      Math.max(currentProbe.durationSeconds, previousProbe.durationSeconds) > 0
        ? Math.min(currentProbe.durationSeconds, previousProbe.durationSeconds) /
          Math.max(currentProbe.durationSeconds, previousProbe.durationSeconds)
        : 1;
    const resolutionPenalty =
      currentVideo.width === previousVideo.width && currentVideo.height === previousVideo.height
        ? 1
        : 0.9;
    return {
      mediaType: 'video',
      similarity: clampRatio(averageSsim * durationRatio * resolutionPenalty),
      details,
    };
  }

  private async decodeMonoPcm(
    source: string,
    output: string,
    startTime: number,
    duration: number,
    signal: AbortSignal,
  ): Promise<void> {
    await this.process.run(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-ss',
        String(startTime),
        '-i',
        source,
        '-t',
        String(duration),
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(AUDIO_SAMPLE_RATE),
        '-c:a',
        'pcm_f32le',
        '-f',
        'f32le',
        output,
      ],
      signal,
    );
  }

  private async detectSilence(
    source: string,
    duration: number,
    signal: AbortSignal,
  ): Promise<readonly { readonly start: number; readonly end: number }[]> {
    const command = await this.process.run(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostats',
        '-i',
        source,
        '-vn',
        '-af',
        'silencedetect=noise=-50dB:d=0.1',
        '-f',
        'null',
        '-',
      ],
      signal,
    );
    return parseSilenceRegions(command.stderr, duration);
  }
}

function projectProbe(probe: MediaProbe): MediaProbeResult {
  const video = probe.video;
  const audio = probe.audioStreams[0];
  return {
    duration: probe.durationSeconds,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: video?.framesPerSecond ?? 0,
    codec: video?.codecName ?? audio?.codecName ?? 'unknown',
    format: probe.formatName ?? 'unknown',
    ...(probe.bitRate === undefined ? {} : { bitrate: probe.bitRate }),
    hasAudio: audio !== undefined,
    ...(audio
      ? {
          audioCodec: audio.codecName,
          audioSampleRate: audio.sampleRate,
          audioChannels: audio.channels,
        }
      : {}),
  };
}

function requireVisualStream(probe: MediaProbe, source: string) {
  if (!probe.video) throw new Error(`Visual diff source has no video stream: ${source}`);
  return probe.video;
}

function overlappingDuration(
  current: MediaProbe,
  previous: MediaProbe,
  startTime: number,
  endTime: number | undefined,
): number {
  const duration = Math.max(
    0,
    Math.min(
      current.durationSeconds,
      previous.durationSeconds,
      endTime ?? Number.POSITIVE_INFINITY,
    ) - startTime,
  );
  if (duration <= 0) throw new Error('Media comparison has no overlapping interval.');
  return duration;
}

function parseSsimSummary(output: string): number | undefined {
  const value = [...output.matchAll(/All:([0-9.]+)/gu)].at(-1)?.[1];
  return value === undefined ? undefined : Number(value);
}

function parseSsimMetrics(output: string, startTime: number, sampleFps: number): VideoMetric[] {
  return [...output.matchAll(/n:\s*(\d+)[^\n]*All:([0-9.]+)/gu)].map((match, index) => {
    const frame = Number(match[1] ?? index + 1) - 1;
    return {
      frame,
      timestamp: startTime + frame / sampleFps,
      ssim: clampRatio(Number(match[2] ?? 0)),
    };
  });
}

function createVideoDiffRegions(
  metrics: readonly VideoMetric[],
  sampleFps: number,
): VideoDiffDetails['diffRegions'] {
  const regions: Array<{ start: number; end: number; avgSsim: number }> = [];
  let active: VideoMetric[] = [];
  const flush = (): void => {
    const first = active[0];
    const last = active.at(-1);
    if (!first || !last) return;
    regions.push({
      start: first.timestamp,
      end: last.timestamp + 1 / sampleFps,
      avgSsim: active.reduce((sum, item) => sum + item.ssim, 0) / active.length,
    });
    active = [];
  };
  for (const metric of metrics) {
    if (metric.ssim < 0.99) active.push(metric);
    else flush();
  }
  flush();
  return regions;
}

async function comparePcmFiles(
  currentPath: string,
  previousPath: string,
  signal: AbortSignal,
): Promise<AudioComparison> {
  const [currentFile, previousFile, currentStat, previousStat] = await Promise.all([
    fs.open(currentPath, 'r'),
    fs.open(previousPath, 'r'),
    fs.stat(currentPath),
    fs.stat(previousPath),
  ]);
  const blockBytes = AUDIO_SAMPLE_RATE * AUDIO_BLOCK_SECONDS * Float32Array.BYTES_PER_ELEMENT;
  const comparedBytes = Math.min(currentStat.size, previousStat.size);
  let offset = 0;
  let signalEnergy = 0;
  let noiseEnergy = 0;
  const currentPeaks: number[] = [];
  const previousPeaks: number[] = [];
  const diffRegions: AudioDiffRegion[] = [];
  try {
    while (offset < comparedBytes) {
      signal.throwIfAborted();
      const length = Math.min(blockBytes, comparedBytes - offset);
      const currentBuffer = Buffer.allocUnsafe(length);
      const previousBuffer = Buffer.allocUnsafe(length);
      const [currentRead, previousRead] = await Promise.all([
        currentFile.read(currentBuffer, 0, length, offset),
        previousFile.read(previousBuffer, 0, length, offset),
      ]);
      const bytes = Math.min(currentRead.bytesRead, previousRead.bytesRead);
      let blockSignal = 0;
      let blockNoise = 0;
      let currentPeak = 0;
      let previousPeak = 0;
      for (let byte = 0; byte + 4 <= bytes; byte += 4) {
        const current = currentBuffer.readFloatLE(byte);
        const previous = previousBuffer.readFloatLE(byte);
        const delta = current - previous;
        blockSignal += current * current;
        blockNoise += delta * delta;
        currentPeak = Math.max(currentPeak, Math.abs(current));
        previousPeak = Math.max(previousPeak, Math.abs(previous));
      }
      signalEnergy += blockSignal;
      noiseEnergy += blockNoise;
      currentPeaks.push(currentPeak);
      previousPeaks.push(previousPeak);
      const blockSnr = energyToSnr(blockSignal, blockNoise);
      if (blockSnr < AUDIO_DIFF_SNR_THRESHOLD) {
        const start = offset / 4 / AUDIO_SAMPLE_RATE;
        diffRegions.push({
          start,
          end: Math.min(start + AUDIO_BLOCK_SECONDS, comparedBytes / 4 / AUDIO_SAMPLE_RATE),
          snr: blockSnr,
          rmsDiff: Math.sqrt(blockNoise / Math.max(1, bytes / 4)),
        });
      }
      offset += bytes;
      if (bytes === 0) break;
    }
  } finally {
    await Promise.all([currentFile.close(), previousFile.close()]);
  }
  return {
    snr: energyToSnr(signalEnergy, noiseEnergy),
    diffSegmentCount: diffRegions.length,
    totalSegments: currentPeaks.length,
    diffRegions: mergeAudioRegions(diffRegions),
    waveformPeaksA: currentPeaks,
    waveformPeaksB: previousPeaks,
  };
}

function mergeAudioRegions(regions: readonly AudioDiffRegion[]): AudioDiffRegion[] {
  const merged: AudioDiffRegion[] = [];
  for (const region of regions) {
    const previous = merged.at(-1);
    if (previous && Math.abs(previous.end - region.start) < 0.001) {
      const previousDuration = previous.end - previous.start;
      const regionDuration = region.end - region.start;
      const duration = previousDuration + regionDuration;
      previous.end = region.end;
      previous.snr =
        (previous.snr * previousDuration + region.snr * regionDuration) / Math.max(duration, 0.001);
      previous.rmsDiff = Math.max(previous.rmsDiff, region.rmsDiff);
    } else {
      merged.push({ ...region });
    }
  }
  return merged;
}

function parseSilenceRegions(
  output: string,
  duration: number,
): Array<{ readonly start: number; readonly end: number }> {
  const events = [...output.matchAll(/silence_(start|end):\s*([0-9.]+)/gu)];
  const regions: Array<{ start: number; end: number }> = [];
  let start: number | undefined;
  for (const event of events) {
    const value = Number(event[2]);
    if (event[1] === 'start') start = value;
    if (event[1] === 'end' && start !== undefined) {
      regions.push({ start, end: value });
      start = undefined;
    }
  }
  if (start !== undefined && duration > start) regions.push({ start, end: duration });
  return regions;
}

function energyToSnr(signal: number, noise: number): number {
  if (noise <= Number.EPSILON) return Number.POSITIVE_INFINITY;
  if (signal <= Number.EPSILON) return 0;
  return 10 * Math.log10(signal / noise);
}

function snrToSimilarity(snr: number): number {
  if (!Number.isFinite(snr)) return 1;
  return clampRatio(snr / 60);
}

function audioSignature(probe: MediaProbe): string {
  const audio = probe.audioStreams[0];
  return audio ? `${audio.codecName}:${audio.sampleRate}:${audio.channels}` : 'none';
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}
