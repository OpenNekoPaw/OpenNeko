import * as nodePath from 'node:path';
import * as nodeFs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  MediaPlaybackService,
  type MediaPlaybackEnginePort,
  type PlaybackHandle,
} from '@neko/neko-client';
import type {
  AudioWaveformPort,
  AudioPcmStreamPort,
  CutMediaProbe,
  CutRuntimeMediaSource,
  FrameCapturePort,
  ExportJobPort,
  MediaProbePort,
  TimelineView,
  VideoPreviewPort,
} from '@neko-cut/domain';
import { CutMediaRuntimeUnavailableError } from '@neko-cut/domain';

export interface CutEngineClientProvider {
  ensureClient(): Promise<MediaPlaybackEnginePort | null>;
}

export class NekoEngineCutMediaAdapter
  implements
    MediaProbePort,
    FrameCapturePort,
    AudioWaveformPort,
    VideoPreviewPort,
    AudioPcmStreamPort,
    ExportJobPort
{
  private readonly sessions = new Map<string, PlaybackHandle>();
  private nextSessionId = 0;

  constructor(
    private readonly workspaceRoot: string,
    private readonly clientProvider: CutEngineClientProvider,
  ) {}

  async probe(source: CutRuntimeMediaSource, signal?: AbortSignal): Promise<CutMediaProbe> {
    throwIfAborted(signal);
    const service = await this.service('probe');
    const result = await service.probeMedia(this.resolveSource(source));
    throwIfAborted(signal);
    return {
      durationSeconds: result.duration,
      width: result.width,
      height: result.height,
      framesPerSecond: result.fps,
      hasVideo: result.width > 0 && result.height > 0,
      hasAudio: result.hasAudio,
      ...(result.audioChannels !== undefined ? { audioChannels: result.audioChannels } : {}),
      ...(result.audioSampleRate !== undefined ? { audioSampleRate: result.audioSampleRate } : {}),
    };
  }

  async captureFrame(
    source: CutRuntimeMediaSource,
    timeSeconds: number,
    options: { readonly width: number; readonly height: number },
    signal?: AbortSignal,
  ): Promise<{ readonly dataUrl: string }> {
    throwIfAborted(signal);
    const service = await this.service('frame capture');
    const dataUrl = await service.captureFrame(this.resolveSource(source), timeSeconds, {
      width: options.width,
      height: options.height,
      quality: 72,
      format: 'jpeg',
    });
    throwIfAborted(signal);
    return { dataUrl };
  }

  async generateWaveform(
    source: CutRuntimeMediaSource,
    options: { readonly peaksPerSecond: number },
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal);
    const service = await this.service('waveform');
    const result = await service.getWaveform(this.resolveSource(source), options);
    throwIfAborted(signal);
    return {
      peaks: result.peaks,
      durationSeconds: result.duration,
      peaksPerSecond: result.peaksPerSecond,
    };
  }

  async startPreview(
    source: CutRuntimeMediaSource,
    options: {
      readonly startTimeSeconds: number;
      readonly includeAudio: boolean;
      readonly playbackRate: number;
    },
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal);
    const service = await this.service('preview');
    const handle = await service.startPlayback(this.resolveSource(source), {
      startTime: options.startTimeSeconds,
      hasAudio: options.includeAudio,
      mediaType: 'video',
      speed: options.playbackRate,
    });
    try {
      throwIfAborted(signal);
    } catch (error) {
      await rethrowAfterPlaybackCleanup(service, handle, error);
    }
    const sessionId = this.storeSession(handle);
    return {
      sessionId,
      ...(handle.videoStreamUrl ? { videoStreamUrl: handle.videoStreamUrl } : {}),
      ...(handle.audioStreamUrl ? { audioStreamUrl: handle.audioStreamUrl } : {}),
    };
  }

  async stopPreview(sessionId: string): Promise<void> {
    await this.stopSession(sessionId);
  }

  async startPcm(
    source: CutRuntimeMediaSource,
    options: { readonly startTimeSeconds: number; readonly playbackRate: number },
    signal?: AbortSignal,
  ) {
    throwIfAborted(signal);
    const service = await this.service('PCM stream');
    const handle = await service.startPlayback(this.resolveSource(source), {
      startTime: options.startTimeSeconds,
      hasAudio: true,
      mediaType: 'audio',
      speed: options.playbackRate,
    });
    try {
      throwIfAborted(signal);
    } catch (error) {
      await rethrowAfterPlaybackCleanup(service, handle, error);
    }
    const audioStreamUrl = handle.audioStreamUrl;
    if (!audioStreamUrl) {
      return rethrowAfterPlaybackCleanup(
        service,
        handle,
        new Error('Engine returned no PCM stream URL.'),
      );
    }
    const sessionId = this.storeSession(handle);
    return { sessionId, streamUrl: audioStreamUrl };
  }

  async stopPcm(sessionId: string): Promise<void> {
    await this.stopSession(sessionId);
  }

  async export(
    timeline: TimelineView,
    outputWorkspaceRelativePath: string,
    signal?: AbortSignal,
  ): Promise<{ readonly outputWorkspaceRelativePath: string }> {
    throwIfAborted(signal);
    const client = await this.client('export');
    const outputPath = await this.resolveWritableOutput(outputWorkspaceRelativePath);
    const jobId = `cut-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const stagingPath = nodePath.join(
      nodePath.dirname(outputPath),
      `.${nodePath.basename(outputPath, nodePath.extname(outputPath))}.${jobId}.tmp${nodePath.extname(outputPath)}`,
    );
    const fps = timeline.profile
      ? timeline.profile.editRateNumerator / timeline.profile.editRateDenominator
      : 30;
    const width = timeline.profile?.width ?? 1920;
    const height = timeline.profile?.height ?? 1080;
    const engineTimeline = await this.buildEngineTimeline(timeline, fps, width, height);
    let result: { readonly outputWorkspaceRelativePath: string } | undefined;
    let operationError: unknown;
    try {
      await dispatchChecked(client, {
        group: 'timelines',
        action: 'export_enqueue',
        body: {
          jobId,
          outputPath: stagingPath,
          settings: {
            width,
            height,
            fps,
            videoCodec: 'h264',
            videoBitrate: 8_000_000,
            audioCodec: 'aac',
            audioBitrate: 192_000,
            hwEncoder: 'auto',
            preset: 'medium',
            useZeroCopyGpu: true,
          },
          timeline: engineTimeline,
        },
      });
      await waitForExport(client, jobId, signal);
      const probe = await new MediaPlaybackService(client).probeMedia(stagingPath);
      if (probe.duration <= 0)
        throw new Error('Engine export validation returned an empty output.');
      await replaceOutputAtomically(stagingPath, outputPath, jobId);
      result = { outputWorkspaceRelativePath };
    } catch (error) {
      operationError = error;
      if (signal?.aborted) {
        try {
          await dispatchChecked(client, {
            group: 'timelines',
            action: 'export_cancel',
            id: jobId,
          });
        } catch (cancelError) {
          operationError = new AggregateError(
            [error, cancelError],
            'Cut export was cancelled, but the Engine export job could not be cancelled cleanly.',
          );
        }
      }
    }
    let cleanupError: unknown;
    try {
      await nodeFs.rm(stagingPath, { force: true });
    } catch (error) {
      cleanupError = error;
    }
    if (operationError !== undefined && cleanupError !== undefined) {
      throw new AggregateError(
        [operationError, cleanupError],
        'Cut export failed and its staging output could not be removed.',
      );
    }
    if (operationError !== undefined) throw operationError;
    if (cleanupError !== undefined) throw cleanupError;
    if (!result) throw new Error('Cut export completed without a result.');
    return result;
  }

  async dispose(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    await Promise.all(sessionIds.map((sessionId) => this.stopSession(sessionId)));
  }

  private async service(capability: string): Promise<MediaPlaybackService> {
    return new MediaPlaybackService(await this.client(capability));
  }

  private async client(capability: string): Promise<MediaPlaybackEnginePort> {
    const client = await this.clientProvider.ensureClient();
    if (!client) throw new CutMediaRuntimeUnavailableError(capability);
    return client;
  }

  private resolveSource(source: CutRuntimeMediaSource): string {
    const value = source.workspaceRelativePath;
    if (value.length === 0 || value.includes('\\') || nodePath.posix.isAbsolute(value)) {
      throw new Error('Cut media source must be a POSIX workspace-relative path.');
    }
    const resolved = nodePath.resolve(this.workspaceRoot, ...value.split('/'));
    const relative = nodePath.relative(this.workspaceRoot, resolved);
    if (
      relative === '..' ||
      relative.startsWith(`..${nodePath.sep}`) ||
      nodePath.isAbsolute(relative)
    ) {
      throw new Error('Cut media source escapes the workspace.');
    }
    return resolved;
  }

  private storeSession(handle: PlaybackHandle): string {
    const sessionId = `cut-media-${(this.nextSessionId += 1)}`;
    this.sessions.set(sessionId, handle);
    return sessionId;
  }

  private async resolveWritableOutput(workspaceRelativePath: string): Promise<string> {
    if (nodePath.posix.extname(workspaceRelativePath).toLowerCase() !== '.mp4') {
      throw new Error('Cut basic export currently requires a workspace-relative .mp4 output.');
    }
    const outputPath = this.resolveSource({ workspaceRelativePath });
    const [realRoot, realParent] = await Promise.all([
      nodeFs.realpath(this.workspaceRoot),
      nodeFs.realpath(nodePath.dirname(outputPath)),
    ]);
    assertContained(realRoot, realParent);
    return nodePath.join(realParent, nodePath.basename(outputPath));
  }

  private async buildEngineTimeline(
    timeline: TimelineView,
    fps: number,
    width: number,
    height: number,
  ): Promise<Record<string, unknown>> {
    const documentPath = fileURLToPath(timeline.documentUri);
    const realRoot = await nodeFs.realpath(this.workspaceRoot);
    const tracks = [];
    for (let trackIndex = 0; trackIndex < timeline.tracks.length; trackIndex += 1) {
      const track = timeline.tracks[trackIndex];
      if (!track) continue;
      if (!track.enabled) continue;
      if (track.kind === 'Subtitle') {
        if (track.items.some((item) => item.kind === 'clip')) {
          throw new Error(
            'The selected VS Code media adapter cannot burn Subtitle Tracks into export yet.',
          );
        }
        continue;
      }
      const elements = [];
      for (const item of track.items) {
        if (item.kind === 'gap' || !item.enabled) continue;
        const absoluteSource = nodePath.resolve(
          nodePath.dirname(documentPath),
          ...item.targetUrl.split('/'),
        );
        const realSource = await nodeFs.realpath(absoluteSource);
        assertContained(realRoot, realSource);
        elements.push({
          id: item.clipId,
          name: item.name,
          type: track.kind === 'Video' ? 'media' : 'audio',
          src: realSource,
          startTime: item.startSeconds,
          duration: item.durationSeconds,
          trimStart: item.sourceStartSeconds,
          trimEnd: 0,
          opacity: 1,
          blendMode: 'normal',
          effects: [],
          masks: [],
          muted: track.audioMuted || item.audio.muted,
          hidden: false,
          locked: false,
          ...(item.playbackRate !== 1
            ? {
                speed: {
                  speed: item.playbackRate,
                  reverse: false,
                  preservePitch: true,
                },
              }
            : {}),
          ...(track.kind === 'Video'
            ? {
                mediaType: 'video',
                audio: {
                  volume: 1,
                  pan: 0,
                  muted: track.audioMuted || item.audio.muted,
                  fadeIn: item.audio.fadeInSeconds,
                  fadeOut: item.audio.fadeOutSeconds,
                  gain: item.audio.gainDb,
                },
              }
            : {
                audio: {
                  volume: 1,
                  pan: 0,
                  muted: track.audioMuted || item.audio.muted,
                  fadeIn: item.audio.fadeInSeconds,
                  fadeOut: item.audio.fadeOutSeconds,
                  gain: item.audio.gainDb,
                },
              }),
        });
      }
      tracks.push({
        id: track.trackId,
        name: track.name,
        type: track.kind.toLowerCase(),
        elements,
        muted: track.audioMuted,
        locked: false,
        hidden: false,
        isMain: track.kind === 'Video',
      });
    }
    return {
      duration: timeline.durationSeconds,
      resolution: { width, height },
      fps,
      tracks,
      defaults: null,
    };
  }

  private async stopSession(sessionId: string): Promise<void> {
    const handle = this.sessions.get(sessionId);
    if (!handle) throw new Error(`Unknown Cut media session: ${sessionId}`);
    const service = await this.service('stream stop');
    await service.stopPlayback(handle);
    this.sessions.delete(sessionId);
  }
}

async function rethrowAfterPlaybackCleanup(
  service: MediaPlaybackService,
  handle: PlaybackHandle,
  operationError: unknown,
): Promise<never> {
  try {
    await service.stopPlayback(handle);
  } catch (cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError],
      'Cut media start failed and its Engine streams could not be stopped.',
    );
  }
  throw operationError;
}

async function dispatchChecked(
  client: MediaPlaybackEnginePort,
  request: Parameters<MediaPlaybackEnginePort['dispatch']>[0],
) {
  const response = await client.dispatch(request);
  if (response.status === 'error') {
    throw new Error(response.error?.message ?? `Engine ${request.group}:${request.action} failed.`);
  }
  return response;
}

async function waitForExport(
  client: MediaPlaybackEnginePort,
  jobId: string,
  signal?: AbortSignal,
): Promise<void> {
  for (;;) {
    throwIfAborted(signal);
    const response = await dispatchChecked(client, {
      group: 'timelines',
      action: 'export_progress',
      id: jobId,
    });
    const progress = isRecord(response.data) ? response.data : undefined;
    const state = progress?.['state'];
    if (state === 'completed') return;
    if (state === 'cancelled') throw new Error('Cut export was cancelled.');
    if (state === 'error') {
      throw new Error(
        typeof progress?.['error'] === 'string' ? progress['error'] : 'Cut export failed.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
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

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Cut media operation was cancelled.');
}
