import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  EngineAudioContentDiff,
  EngineAudioDiffRegion,
  EngineDiffResult,
  EngineFieldDiff,
  EngineTimelineContentDiff,
  EngineTimelineDiffSummary,
  EngineTrackChange,
  EngineVideoDiffRegion,
  EngineVideoContentDiff,
} from '@neko/shared';
import { NodeFfmpegProcess, NodeMediaRuntime } from '@neko/media/node';
import type { MediaProbe } from '@neko/media';
import type {
  IMediaRuntimeService,
  IToolsMediaRuntime,
  MediaProbeResult,
  SilenceAnalysis,
  SilenceRegion,
} from '../contracts/IMediaRuntimeService';

const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_BLOCK_SECONDS = 1;
const AUDIO_DIFF_SNR_THRESHOLD = 40;

export class NodeMediaRuntimeService implements IMediaRuntimeService {
  readonly runtime: IToolsMediaRuntime;
  private readonly process = new NodeFfmpegProcess();

  constructor(runtime: IToolsMediaRuntime = new NodeMediaRuntime()) {
    this.runtime = runtime;
  }

  async probe(_group: 'videos' | 'audios', source: string): Promise<MediaProbeResult> {
    return projectProbe(await this.runtime.probe(source));
  }

  async detectSilence(
    source: string,
    thresholdDbfs = -50,
    minDuration = 0.1,
  ): Promise<SilenceAnalysis> {
    const [probe, command] = await Promise.all([
      this.runtime.probe(source),
      this.process.run('ffmpeg', [
        '-hide_banner',
        '-nostats',
        '-i',
        source,
        '-vn',
        '-af',
        `silencedetect=noise=${thresholdDbfs}dB:d=${minDuration}`,
        '-f',
        'null',
        '-',
      ]),
    ]);
    const regions = parseSilenceRegions(command.stderr, probe.durationSeconds);
    const silenceDuration = regions.reduce((sum, region) => sum + region.duration, 0);
    return {
      totalDuration: probe.durationSeconds,
      silenceDuration,
      silenceRatio: probe.durationSeconds > 0 ? silenceDuration / probe.durationSeconds : 0,
      regionCount: regions.length,
      regions,
      thresholdDbfs,
      minDuration,
    };
  }

  async diff(
    group: string,
    sourceA: string,
    sourceB: string,
    options: Record<string, unknown> = {},
  ): Promise<EngineDiffResult> {
    switch (group) {
      case 'images':
        return this.diffImages(sourceA, sourceB);
      case 'audios':
        return this.diffAudio(sourceA, sourceB, options);
      case 'videos':
        return this.diffVideo(sourceA, sourceB, options);
      case 'timelines':
        return this.diffTimeline(sourceA, sourceB);
      default:
        throw new Error(`Unsupported Node media diff group: ${group}`);
    }
  }

  private async diffImages(sourceA: string, sourceB: string): Promise<EngineDiffResult> {
    const [probeA, probeB] = await Promise.all([
      this.runtime.probe(sourceA),
      this.runtime.probe(sourceB),
    ]);
    const videoA = requireVisualStream(probeA, sourceA);
    const videoB = requireVisualStream(probeB, sourceB);
    const command = await this.process.run('ffmpeg', [
      '-hide_banner',
      '-nostats',
      '-i',
      sourceA,
      '-i',
      sourceB,
      '-filter_complex',
      `[1:v]scale=${videoA.width}:${videoA.height}[b];[0:v][b]ssim`,
      '-f',
      'null',
      '-',
    ]);
    const ssim = parseSsimSummary(command.stderr) ?? 0;
    const totalPixels = videoA.width * videoA.height;
    const diffPixelPercent = 1 - ssim;
    const fields = mediaFields(probeA, probeB);
    return {
      sourceA,
      sourceB,
      category: 'image',
      identical: ssim >= 0.999999,
      diffCount: fields.filter((field) => field.changed).length,
      totalFields: fields.length,
      fields,
      infoA: JSON.stringify(projectProbe(probeA)),
      infoB: JSON.stringify(projectProbe(probeB)),
      imageDiff: {
        ssim,
        psnr: similarityToPsnr(ssim),
        mse: (1 - ssim) * 255 * 255,
        diffPixelPercent,
        diffPixelCount: Math.round(totalPixels * diffPixelPercent),
        totalPixels,
        widthA: videoA.width,
        heightA: videoA.height,
        widthB: videoB.width,
        heightB: videoB.height,
        heatmap: '',
        heatmapWidth: 0,
        heatmapHeight: 0,
      },
    };
  }

  private async diffAudio(
    sourceA: string,
    sourceB: string,
    options: Record<string, unknown>,
  ): Promise<EngineDiffResult> {
    const [probeA, probeB] = await Promise.all([
      this.runtime.probe(sourceA),
      this.runtime.probe(sourceB),
    ]);
    const startTime = readFiniteNumber(options['startTime']) ?? 0;
    const endTime = readFiniteNumber(options['endTime']);
    const duration = Math.max(
      0,
      Math.min(
        probeA.durationSeconds,
        probeB.durationSeconds,
        endTime ?? Number.POSITIVE_INFINITY,
      ) - startTime,
    );
    if (duration <= 0) throw new Error('Audio diff has no overlapping interval.');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openneko-audio-diff-'));
    const rawA = path.join(directory, 'a.f32le');
    const rawB = path.join(directory, 'b.f32le');
    try {
      await Promise.all([
        this.decodeMonoPcm(sourceA, rawA, startTime, duration),
        this.decodeMonoPcm(sourceB, rawB, startTime, duration),
      ]);
      const audioDiff = await comparePcmFiles(
        rawA,
        rawB,
        probeA.durationSeconds,
        probeB.durationSeconds,
      );
      const fields = mediaFields(probeA, probeB);
      return {
        sourceA,
        sourceB,
        category: 'audio',
        identical:
          audioDiff.diffSegmentCount === 0 &&
          Math.abs(probeA.durationSeconds - probeB.durationSeconds) < 0.001,
        diffCount: fields.filter((field) => field.changed).length,
        totalFields: fields.length,
        fields,
        infoA: JSON.stringify(projectProbe(probeA)),
        infoB: JSON.stringify(projectProbe(probeB)),
        audioDiff,
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  private async diffVideo(
    sourceA: string,
    sourceB: string,
    options: Record<string, unknown>,
  ): Promise<EngineDiffResult> {
    const [probeA, probeB] = await Promise.all([
      this.runtime.probe(sourceA),
      this.runtime.probe(sourceB),
    ]);
    const videoA = requireVisualStream(probeA, sourceA);
    const videoB = requireVisualStream(probeB, sourceB);
    const sampleFps = readFiniteNumber(options['sampleFps']) ?? 1;
    const startTime = readFiniteNumber(options['startTime']) ?? 0;
    const endTime = readFiniteNumber(options['endTime']);
    const duration = Math.max(
      0,
      Math.min(
        probeA.durationSeconds,
        probeB.durationSeconds,
        endTime ?? Number.POSITIVE_INFINITY,
      ) - startTime,
    );
    if (duration <= 0) throw new Error('Video diff has no overlapping interval.');
    const command = await this.process.run('ffmpeg', [
      '-hide_banner',
      '-nostats',
      '-ss',
      String(startTime),
      '-i',
      sourceA,
      '-ss',
      String(startTime),
      '-i',
      sourceB,
      '-t',
      String(duration),
      '-filter_complex',
      `[0:v]fps=${sampleFps},setpts=PTS-STARTPTS[a];[1:v]fps=${sampleFps},scale=${videoA.width}:${videoA.height},setpts=PTS-STARTPTS[b];[a][b]ssim=stats_file=-`,
      '-f',
      'null',
      '-',
    ]);
    const metrics = parseSsimMetrics(
      `${command.stdout.toString('utf8')}\n${command.stderr}`,
      startTime,
      sampleFps,
    );
    const summary = parseSsimSummary(command.stderr);
    const avgSsim =
      summary ??
      (metrics.length > 0
        ? metrics.reduce((sum, metric) => sum + metric.ssim, 0) / metrics.length
        : 0);
    const minSsim =
      metrics.length > 0 ? Math.min(...metrics.map((metric) => metric.ssim)) : avgSsim;
    const diffRegions = createVideoDiffRegions(metrics, sampleFps);
    const videoDiff: EngineVideoContentDiff = {
      avgSsim,
      minSsim,
      avgPsnr: similarityToPsnr(avgSsim),
      minPsnr: similarityToPsnr(minSsim),
      durationA: probeA.durationSeconds,
      durationB: probeB.durationSeconds,
      fpsA: videoA.framesPerSecond,
      fpsB: videoB.framesPerSecond,
      widthA: videoA.width,
      heightA: videoA.height,
      widthB: videoB.width,
      heightB: videoB.height,
      totalFramesCompared: metrics.length,
      diffFrameCount: metrics.filter((metric) => metric.ssim < 0.99).length,
      diffFramePercent:
        metrics.length > 0
          ? metrics.filter((metric) => metric.ssim < 0.99).length / metrics.length
          : 0,
      frameMetrics: metrics,
      diffRegions,
    };
    const fields = mediaFields(probeA, probeB);
    return {
      sourceA,
      sourceB,
      category: 'video',
      identical: avgSsim >= 0.999999 && fields.every((field) => !field.changed),
      diffCount: fields.filter((field) => field.changed).length,
      totalFields: fields.length,
      fields,
      infoA: JSON.stringify(projectProbe(probeA)),
      infoB: JSON.stringify(projectProbe(probeB)),
      videoDiff,
    };
  }

  private async diffTimeline(sourceA: string, sourceB: string): Promise<EngineDiffResult> {
    const [rawA, rawB] = await Promise.all([
      fs.readFile(sourceA, 'utf8'),
      fs.readFile(sourceB, 'utf8'),
    ]);
    const documentA = parseJsonRecord(rawA, sourceA);
    const documentB = parseJsonRecord(rawB, sourceB);
    const timelineDiff = compareTimelines(documentA, documentB);
    const fields = recordFields(documentA, documentB, ['name', 'width', 'height', 'fps']);
    const identical = stableJson(documentA) === stableJson(documentB);
    return {
      sourceA,
      sourceB,
      category: 'timeline',
      identical,
      diffCount: fields.filter((field) => field.changed).length,
      totalFields: fields.length,
      fields,
      infoA: JSON.stringify(documentA),
      infoB: JSON.stringify(documentB),
      timelineDiff,
    };
  }

  private async decodeMonoPcm(
    source: string,
    output: string,
    startTime: number,
    duration: number,
  ): Promise<void> {
    await this.process.run('ffmpeg', [
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
    ]);
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

function mediaFields(probeA: MediaProbe, probeB: MediaProbe): EngineFieldDiff[] {
  const a = projectProbe(probeA);
  const b = projectProbe(probeB);
  return recordFields(a, b, ['duration', 'width', 'height', 'fps', 'codec', 'format', 'hasAudio']);
}

function recordFields(
  a: Record<string, unknown> | MediaProbeResult,
  b: Record<string, unknown> | MediaProbeResult,
  fields: readonly string[],
): EngineFieldDiff[] {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return fields.map((field) => ({
    field,
    valueA: JSON.stringify(left[field] ?? null),
    valueB: JSON.stringify(right[field] ?? null),
    changed: stableJson(left[field]) !== stableJson(right[field]),
  }));
}

function parseSsimSummary(output: string): number | undefined {
  const matches = [...output.matchAll(/All:([0-9.]+)/gu)];
  const value = matches.at(-1)?.[1];
  return value === undefined ? undefined : Number(value);
}

function parseSsimMetrics(output: string, startTime: number, sampleFps: number) {
  return [...output.matchAll(/n:\s*(\d+)[^\n]*All:([0-9.]+)/gu)].map((match, index) => {
    const frame = Number(match[1] ?? index + 1) - 1;
    const ssim = Number(match[2] ?? 0);
    return {
      frame,
      timestamp: startTime + frame / sampleFps,
      ssim,
      psnr: similarityToPsnr(ssim),
    };
  });
}

function createVideoDiffRegions(
  metrics: Array<{ frame: number; timestamp: number; ssim: number }>,
  sampleFps: number,
): EngineVideoDiffRegion[] {
  const regions: EngineVideoDiffRegion[] = [];
  let active: Array<{ timestamp: number; ssim: number }> = [];
  const flush = (): void => {
    if (active.length === 0) return;
    const first = active[0];
    const last = active.at(-1);
    if (!first || !last) return;
    regions.push({
      start: first.timestamp,
      end: last.timestamp + 1 / sampleFps,
      avgSsim: active.reduce((sum, item) => sum + item.ssim, 0) / active.length,
      minSsim: Math.min(...active.map((item) => item.ssim)),
      frameCount: active.length,
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
  pathA: string,
  pathB: string,
  durationA: number,
  durationB: number,
): Promise<EngineAudioContentDiff> {
  const [fileA, fileB, statA, statB] = await Promise.all([
    fs.open(pathA, 'r'),
    fs.open(pathB, 'r'),
    fs.stat(pathA),
    fs.stat(pathB),
  ]);
  const blockBytes = AUDIO_SAMPLE_RATE * AUDIO_BLOCK_SECONDS * Float32Array.BYTES_PER_ELEMENT;
  const comparedBytes = Math.min(statA.size, statB.size);
  let offset = 0;
  let signalEnergy = 0;
  let noiseEnergy = 0;
  let totalSamples = 0;
  const peaksA: number[] = [];
  const peaksB: number[] = [];
  const diffRegions: EngineAudioDiffRegion[] = [];
  try {
    while (offset < comparedBytes) {
      const length = Math.min(blockBytes, comparedBytes - offset);
      const bufferA = Buffer.allocUnsafe(length);
      const bufferB = Buffer.allocUnsafe(length);
      const [readA, readB] = await Promise.all([
        fileA.read(bufferA, 0, length, offset),
        fileB.read(bufferB, 0, length, offset),
      ]);
      const bytes = Math.min(readA.bytesRead, readB.bytesRead);
      let blockSignal = 0;
      let blockNoise = 0;
      let peakA = 0;
      let peakB = 0;
      for (let byte = 0; byte + 4 <= bytes; byte += 4) {
        const a = bufferA.readFloatLE(byte);
        const b = bufferB.readFloatLE(byte);
        const delta = a - b;
        blockSignal += a * a;
        blockNoise += delta * delta;
        peakA = Math.max(peakA, Math.abs(a));
        peakB = Math.max(peakB, Math.abs(b));
        totalSamples += 1;
      }
      signalEnergy += blockSignal;
      noiseEnergy += blockNoise;
      peaksA.push(peakA);
      peaksB.push(peakB);
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
    await Promise.all([fileA.close(), fileB.close()]);
  }
  const merged = mergeAudioRegions(diffRegions);
  const totalSegments = peaksA.length;
  return {
    snr: energyToSnr(signalEnergy, noiseEnergy),
    durationA,
    durationB,
    compareSampleRate: AUDIO_SAMPLE_RATE,
    totalSamples,
    diffSegmentCount: diffRegions.length,
    totalSegments,
    diffPercent: totalSegments > 0 ? (diffRegions.length / totalSegments) * 100 : 0,
    diffRegions: merged,
    waveformPeaksA: peaksA,
    waveformPeaksB: peaksB,
  };
}

function mergeAudioRegions(regions: EngineAudioDiffRegion[]): EngineAudioDiffRegion[] {
  const merged: EngineAudioDiffRegion[] = [];
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

function energyToSnr(signal: number, noise: number): number {
  if (noise <= Number.EPSILON) return Number.POSITIVE_INFINITY;
  if (signal <= Number.EPSILON) return 0;
  return 10 * Math.log10(signal / noise);
}

function parseSilenceRegions(output: string, duration: number): SilenceRegion[] {
  const events = [...output.matchAll(/silence_(start|end):\s*([0-9.]+)/gu)];
  const regions: SilenceRegion[] = [];
  let start: number | undefined;
  for (const event of events) {
    const value = Number(event[2]);
    if (event[1] === 'start') start = value;
    if (event[1] === 'end' && start !== undefined) {
      regions.push({ start, end: value, duration: Math.max(0, value - start) });
      start = undefined;
    }
  }
  if (start !== undefined && duration > start) {
    regions.push({ start, end: duration, duration: duration - start });
  }
  return regions;
}

function compareTimelines(
  current: Record<string, unknown>,
  previous: Record<string, unknown>,
): EngineTimelineContentDiff {
  const currentTracks = readRecordArray(current['tracks']);
  const previousTracks = readRecordArray(previous['tracks']);
  const currentById = indexById(currentTracks);
  const previousById = indexById(previousTracks);
  const ids = new Set([...currentById.keys(), ...previousById.keys()]);
  const changes: EngineTrackChange[] = [];
  const summary: EngineTimelineDiffSummary = {
    tracksAdded: 0,
    tracksRemoved: 0,
    tracksModified: 0,
    elementsAdded: 0,
    elementsRemoved: 0,
    elementsModified: 0,
    mediaSourceChanges: 0,
  };
  for (const id of ids) {
    const next = currentById.get(id);
    const before = previousById.get(id);
    const changeType = !before
      ? 'added'
      : !next
        ? 'removed'
        : stableJson(next) === stableJson(before)
          ? 'unchanged'
          : 'modified';
    if (changeType === 'added') summary.tracksAdded += 1;
    if (changeType === 'removed') summary.tracksRemoved += 1;
    if (changeType === 'modified') summary.tracksModified += 1;
    if (changeType === 'unchanged') continue;
    changes.push({
      trackId: id,
      trackName: readString(next?.['name']) ?? readString(before?.['name']) ?? id,
      trackType: readString(next?.['type']) ?? readString(before?.['type']) ?? 'unknown',
      changeType,
      propertyChanges: [],
      elementChanges: [],
    });
  }
  return {
    currentProject: timelineMeta(current),
    previousProject: timelineMeta(previous),
    trackChanges: changes,
    summary,
    durationCurrent: readFiniteNumber(current['duration']) ?? 0,
    durationPrevious: readFiniteNumber(previous['duration']) ?? 0,
    elementContentDiffs: [],
  };
}

function timelineMeta(value: Record<string, unknown>) {
  const resolution = isRecord(value['resolution']) ? value['resolution'] : {};
  return {
    name: readString(value['name']) ?? 'Untitled',
    resolutionWidth:
      readFiniteNumber(value['resolutionWidth']) ?? readFiniteNumber(resolution['width']) ?? 1920,
    resolutionHeight:
      readFiniteNumber(value['resolutionHeight']) ?? readFiniteNumber(resolution['height']) ?? 1080,
    fps: readFiniteNumber(value['fps']) ?? 30,
  };
}

function parseJsonRecord(raw: string, source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error(`Timeline source is not a JSON object: ${source}`);
  return value;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function indexById(values: Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  values.forEach((value, index) => result.set(readString(value['id']) ?? `track-${index}`, value));
  return result;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function similarityToPsnr(similarity: number): number {
  if (similarity >= 1) return Number.POSITIVE_INFINITY;
  return 10 * Math.log10(1 / Math.max(1e-12, 1 - similarity));
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
