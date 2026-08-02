import type {
  CutHtmlVideoDescriptor,
  CutMediaRuntimeAdapter,
  CutPcmStreamDescriptor,
  TimelineView,
} from '@neko/cut-domain';
import { CutWorkspaceMediaPaths } from './CutWorkspaceMediaPaths';
import { resolvePreviewSelection } from './previewSelection';

export interface CutPreviewAudioPlayback {
  readonly mediaOriginSeconds: number;
  readonly playbackRate: number;
  readonly positionSeconds: number;
  readonly clipDurationSeconds: number;
  readonly fadeInSeconds: number;
  readonly fadeOutSeconds: number;
}

export interface CutPreviewStreamProjection {
  readonly videoClipId?: string;
  readonly timelineTimeSeconds: number;
  readonly segmentEndSeconds: number;
  readonly playbackEndSeconds: number;
  readonly mediaSourceTimeSeconds?: number;
  readonly mediaPlaybackRate?: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly video?: CutHtmlVideoDescriptor;
  readonly videoPlaybackRate?: number;
  readonly audioStreams: readonly CutPcmStreamDescriptor[];
  readonly audioGainsDb: readonly number[];
  readonly audioPlayback: readonly CutPreviewAudioPlayback[];
}

export type CutPreviewRuntimeEvent =
  | ({
      readonly type: 'cut:preview-ready' | 'cut:preview-prepared';
      readonly generation: number;
    } & CutPreviewStreamProjection)
  | {
      readonly type: 'cut:preview-activated';
      readonly generation: number;
    };

interface CutPreviewRecord {
  readonly generation: number;
  readonly videoSessionId?: string;
  readonly pcmSessionIds: readonly string[];
  readonly projection: CutPreviewStreamProjection;
}

export class CutPreviewRuntimeController {
  private active: CutPreviewRecord | undefined;
  private prepared: CutPreviewRecord | undefined;
  private latestGeneration = 0;
  private disposed = false;

  constructor(
    private readonly options: {
      readonly documentPath: string;
      readonly workspacePath: string;
      readonly mediaAdapter: CutMediaRuntimeAdapter;
    },
  ) {}

  async start(
    view: TimelineView,
    input: {
      readonly timelineTimeSeconds: number;
      readonly generation: number;
      readonly retainedVideoClipId?: string;
      readonly includeAudio?: boolean;
    },
  ): Promise<CutPreviewRuntimeEvent> {
    this.requireActive();
    this.latestGeneration = Math.max(this.latestGeneration, input.generation);
    const record = await this.build(view, input);
    if (input.generation !== this.latestGeneration) {
      await this.stopRecord(record);
      throw new Error(`Cut preview generation ${input.generation} was superseded.`);
    }
    const previousPrepared = this.prepared;
    this.prepared = record;
    if (previousPrepared) await this.stopRecord(previousPrepared);
    return {
      type: 'cut:preview-ready',
      generation: input.generation,
      ...record.projection,
    };
  }

  async prepare(
    view: TimelineView,
    input: {
      readonly timelineTimeSeconds: number;
      readonly generation: number;
    },
  ): Promise<CutPreviewRuntimeEvent> {
    this.requireActive();
    this.latestGeneration = Math.max(this.latestGeneration, input.generation);
    const record = await this.build(view, {
      ...input,
      ...(this.active?.projection.videoClipId
        ? { retainedVideoClipId: this.active.projection.videoClipId }
        : {}),
    });
    if (input.generation !== this.latestGeneration) {
      await this.stopRecord(record);
      throw new Error(`Cut preview generation ${input.generation} was superseded.`);
    }
    const previousPrepared = this.prepared;
    this.prepared = record;
    if (previousPrepared) await this.stopRecord(previousPrepared);
    return {
      type: 'cut:preview-prepared',
      generation: input.generation,
      ...record.projection,
    };
  }

  async activate(generation: number): Promise<CutPreviewRuntimeEvent> {
    this.requireActive();
    if (generation !== this.latestGeneration) {
      throw new Error(
        `Cut preview generation ${generation} is stale; current generation is ${this.latestGeneration}.`,
      );
    }
    const prepared = this.prepared;
    if (!prepared || prepared.generation !== generation) {
      throw new Error(`Cut preview generation ${generation} is not prepared.`);
    }
    const previousActive = this.active;
    const activated =
      previousActive?.videoSessionId &&
      !prepared.videoSessionId &&
      previousActive.projection.videoClipId !== undefined &&
      previousActive.projection.videoClipId === prepared.projection.videoClipId
        ? { ...prepared, videoSessionId: previousActive.videoSessionId }
        : prepared;
    await this.resumeRecord(prepared);
    this.active = activated;
    this.prepared = undefined;
    if (previousActive) {
      await this.stopRecord(
        activated.videoSessionId === previousActive.videoSessionId
          ? withoutVideoSession(previousActive)
          : previousActive,
      );
    }
    return { type: 'cut:preview-activated', generation };
  }

  async pause(preparedGeneration?: number): Promise<void> {
    this.requireActive();
    const requested =
      preparedGeneration === undefined
        ? this.active
        : this.prepared?.generation === preparedGeneration
          ? this.prepared
          : undefined;
    if (preparedGeneration !== undefined && !requested) {
      throw new Error(`Cut paused preview generation ${preparedGeneration} is not prepared.`);
    }
    const retained =
      requested &&
      !requested.videoSessionId &&
      this.active?.videoSessionId &&
      requested.projection.videoClipId !== undefined &&
      requested.projection.videoClipId === this.active.projection.videoClipId
        ? { ...requested, videoSessionId: this.active.videoSessionId }
        : requested;
    const retainedVideoSessionId = retained?.videoSessionId;
    const records = distinctRecords(this.active, this.prepared);
    this.active = retainedVideoSessionId
      ? {
          ...retained,
          videoSessionId: retainedVideoSessionId,
          pcmSessionIds: [],
        }
      : undefined;
    this.prepared = undefined;
    await stopRecords(
      records,
      (record) =>
        record === requested || record.videoSessionId === retainedVideoSessionId
          ? withoutVideoSession(record)
          : record,
      (record) => this.stopRecord(record),
      'One or more Cut preview audio sessions could not be paused.',
    );
  }

  async stop(): Promise<void> {
    this.requireActive();
    const records = distinctRecords(this.active, this.prepared);
    this.active = undefined;
    this.prepared = undefined;
    await stopRecords(
      records,
      (record) => record,
      (record) => this.stopRecord(record),
      'One or more Cut preview generations could not be stopped.',
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    const records = distinctRecords(this.active, this.prepared);
    this.active = undefined;
    this.prepared = undefined;
    this.disposed = true;
    const stopResults = await Promise.allSettled(records.map((record) => this.stopRecord(record)));
    const disposeResult = await Promise.allSettled([this.options.mediaAdapter.dispose()]);
    const results = [...stopResults, ...disposeResult];
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Cut preview runtime could not be disposed.');
    }
  }

  private async build(
    view: TimelineView,
    input: {
      readonly timelineTimeSeconds: number;
      readonly generation: number;
      readonly retainedVideoClipId?: string;
      readonly includeAudio?: boolean;
    },
  ): Promise<CutPreviewRecord> {
    const selection = resolvePreviewSelection(view, input.timelineTimeSeconds);
    const videoClip = selection.videoClip;
    const paths = await CutWorkspaceMediaPaths.create(this.options.workspacePath);
    let preview:
      | {
          readonly sessionId: string;
          readonly video: CutHtmlVideoDescriptor;
        }
      | undefined;
    let videoProbe:
      | {
          readonly width: number;
          readonly height: number;
          readonly framesPerSecond: number;
          readonly hasAudio: boolean;
        }
      | undefined;
    if (videoClip) {
      const source = await paths.resolveTarget(this.options.documentPath, videoClip.targetUrl);
      if (source.status !== 'available') throw new Error('Cannot preview missing media.');
      videoProbe = await this.options.mediaAdapter.probe({
        workspaceRelativePath: source.workspaceRelativePath,
      });
      if (videoClip.clipId !== input.retainedVideoClipId) {
        preview = await this.options.mediaAdapter.startPreview(
          { workspaceRelativePath: source.workspaceRelativePath },
          {
            startTimeSeconds:
              videoClip.sourceStartSeconds +
              Math.max(0, input.timelineTimeSeconds - videoClip.startSeconds) *
                videoClip.playbackRate,
            durationSeconds:
              (selection.videoSegmentEndSeconds ?? selection.segmentEndSeconds) -
              input.timelineTimeSeconds,
            playbackRate: videoClip.playbackRate,
            startPaused: true,
          },
        );
      }
    }
    const pcmSessions: Array<{
      readonly sessionId: string;
      readonly stream: CutPcmStreamDescriptor;
    }> = [];
    try {
      const audibleClips =
        input.includeAudio === false
          ? []
          : [
              ...(!selection.videoAudioMuted &&
              videoClip &&
              videoProbe?.hasAudio === true &&
              !videoClip.audio.muted
                ? [videoClip]
                : []),
              ...selection.audioClips,
            ];
      if (audibleClips.length > 0) {
        const mixSources = await Promise.all(
          audibleClips.map(async (audioClip) => {
            const source = await paths.resolveTarget(
              this.options.documentPath,
              audioClip.targetUrl,
            );
            if (source.status !== 'available') {
              throw new Error(`Cannot preview missing audio media: ${audioClip.targetUrl}`);
            }
            const clipPositionSeconds = Math.max(
              0,
              input.timelineTimeSeconds - audioClip.startSeconds,
            );
            return {
              source: { workspaceRelativePath: source.workspaceRelativePath },
              sourceStartSeconds:
                audioClip.sourceStartSeconds + clipPositionSeconds * audioClip.playbackRate,
              playbackRate: audioClip.playbackRate,
              gainDb: audioClip.audio.gainDb,
              clipPositionSeconds,
              clipDurationSeconds: audioClip.durationSeconds,
              fadeInSeconds: audioClip.audio.fadeInSeconds,
              fadeOutSeconds: audioClip.audio.fadeOutSeconds,
            };
          }),
        );
        pcmSessions.push(
          await this.options.mediaAdapter.startPcmMix(mixSources, {
            timelineStartSeconds: input.timelineTimeSeconds,
            durationSeconds: selection.segmentEndSeconds - input.timelineTimeSeconds,
            startPaused: true,
          }),
        );
      }
      const profile = view.profile;
      const hasMixedPcm = pcmSessions.length > 0;
      const mediaSourceTimeSeconds = hasMixedPcm
        ? input.timelineTimeSeconds
        : videoClip
          ? videoClip.sourceStartSeconds +
            Math.max(0, input.timelineTimeSeconds - videoClip.startSeconds) * videoClip.playbackRate
          : undefined;
      const mediaPlaybackRate = hasMixedPcm ? 1 : videoClip?.playbackRate;
      return {
        generation: input.generation,
        ...(preview ? { videoSessionId: preview.sessionId } : {}),
        pcmSessionIds: pcmSessions.map((session) => session.sessionId),
        projection: {
          ...(videoClip ? { videoClipId: videoClip.clipId } : {}),
          timelineTimeSeconds: selection.timelineTimeSeconds,
          segmentEndSeconds: selection.segmentEndSeconds,
          playbackEndSeconds: selection.playbackEndSeconds,
          ...(mediaSourceTimeSeconds !== undefined && mediaPlaybackRate !== undefined
            ? { mediaSourceTimeSeconds, mediaPlaybackRate }
            : {}),
          width: videoProbe?.width ?? profile?.width ?? 1920,
          height: videoProbe?.height ?? profile?.height ?? 1080,
          framesPerSecond:
            videoProbe?.framesPerSecond ??
            (profile ? profile.editRateNumerator / profile.editRateDenominator : 30),
          ...(preview ? { video: preview.video } : {}),
          ...(videoClip ? { videoPlaybackRate: videoClip.playbackRate } : {}),
          audioStreams: pcmSessions.map((session) => session.stream),
          audioGainsDb: pcmSessions.map(() => 0),
          audioPlayback: pcmSessions.map(() => ({
            mediaOriginSeconds: input.timelineTimeSeconds,
            playbackRate: 1,
            positionSeconds: 0,
            clipDurationSeconds: selection.segmentEndSeconds - input.timelineTimeSeconds,
            fadeInSeconds: 0,
            fadeOutSeconds: 0,
          })),
        },
      };
    } catch (error) {
      await this.stopRecord({
        generation: input.generation,
        ...(preview ? { videoSessionId: preview.sessionId } : {}),
        pcmSessionIds: pcmSessions.map((session) => session.sessionId),
        projection: emptyProjection(selection),
      });
      throw error;
    }
  }

  private async resumeRecord(record: CutPreviewRecord): Promise<void> {
    await Promise.all([
      ...(record.videoSessionId
        ? [this.options.mediaAdapter.resumePreview(record.videoSessionId)]
        : []),
      ...record.pcmSessionIds.map((sessionId) => this.options.mediaAdapter.resumePcm(sessionId)),
    ]);
  }

  private async stopRecord(record: CutPreviewRecord): Promise<void> {
    const results = await Promise.allSettled([
      ...(record.videoSessionId
        ? [this.options.mediaAdapter.stopPreview(record.videoSessionId)]
        : []),
      ...record.pcmSessionIds.map((sessionId) => this.options.mediaAdapter.stopPcm(sessionId)),
    ]);
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, 'One or more Cut preview streams could not be stopped.');
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Cut preview runtime is disposed.');
  }
}

function withoutVideoSession(record: CutPreviewRecord): CutPreviewRecord {
  const { videoSessionId: _videoSessionId, ...rest } = record;
  return rest;
}

function distinctRecords(
  active: CutPreviewRecord | undefined,
  prepared: CutPreviewRecord | undefined,
): readonly CutPreviewRecord[] {
  return [...new Set([active, prepared].filter((value): value is CutPreviewRecord => !!value))];
}

async function stopRecords(
  records: readonly CutPreviewRecord[],
  select: (record: CutPreviewRecord) => CutPreviewRecord,
  stop: (record: CutPreviewRecord) => Promise<void>,
  message: string,
): Promise<void> {
  const results = await Promise.allSettled(records.map((record) => stop(select(record))));
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length > 0) throw new AggregateError(failures, message);
}

function emptyProjection(
  selection: ReturnType<typeof resolvePreviewSelection>,
): CutPreviewStreamProjection {
  return {
    timelineTimeSeconds: selection.timelineTimeSeconds,
    segmentEndSeconds: selection.segmentEndSeconds,
    playbackEndSeconds: selection.playbackEndSeconds,
    width: 0,
    height: 0,
    framesPerSecond: 0,
    audioStreams: [],
    audioGainsDb: [],
    audioPlayback: [],
  };
}
