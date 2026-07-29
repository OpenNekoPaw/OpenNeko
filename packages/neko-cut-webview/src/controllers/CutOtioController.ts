import { CUT_THUMBNAIL_DENSITIES, isCutUserDiagnostic } from '@neko-cut/domain';
import type {
  CutClipRepresentationRequest,
  CutClipRepresentationResult,
  CutCommand,
  CutExportTaskSnapshot,
  CutExportSettings,
  CutHtmlVideoDescriptor,
  CutPcmStreamDescriptor,
  OtioTrackKind,
  TimelineView,
} from '@neko-cut/domain';
import {
  representationKey,
  type CutPlacementMode,
  type CutPresentationClipSelection,
  type CutPresentationClipboard,
  type CutPresentationSelection,
  type CutPresentationStore,
} from '../stores/cut-presentation-store';

export interface CutWebviewMessageBridge {
  postMessage(message: CutWebviewIntent): void;
}

export interface CutOtioControllerEvents {
  readonly onViewAccepted?: (view: TimelineView) => void;
  readonly onPreviewReady?: (message: CutPreviewReadyMessage) => void;
}

interface CutIdentity {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly expectedRevision: number;
}

interface CutMutationIdentity extends CutIdentity {
  readonly clientMutationId: string;
}

export type CutAgentSelection =
  | { readonly kind: 'clip'; readonly trackId: string; readonly clipId: string }
  | { readonly kind: 'track'; readonly trackId: string };

export type CutWebviewIntent =
  | { readonly type: 'cut:ready' }
  | ({ readonly type: 'cut:command'; readonly command: CutCommand } & CutMutationIdentity)
  | ({ readonly type: 'cut:batch'; readonly commands: readonly CutCommand[] } & CutMutationIdentity)
  | ({ readonly type: 'cut:undo' | 'cut:redo' } & CutMutationIdentity)
  | ({
      readonly type: 'cut:add-track';
      readonly trackKind: 'Audio' | 'Subtitle';
    } & CutMutationIdentity)
  | ({
      readonly type: 'cut:select-link-media';
      readonly trackId: string;
      readonly timelineStartFrames: number;
      readonly overlapPolicy: 'reject' | 'insert';
    } & CutMutationIdentity)
  | ({
      readonly type: 'cut:drop-link-media';
      readonly trackId: string;
      readonly uris: readonly string[];
      readonly timelineStartFrames: number;
      readonly overlapPolicy: 'reject' | 'insert';
    } & CutMutationIdentity)
  | ({
      readonly type: 'cut:split';
      readonly clipId: string;
      readonly offsetFrames: number;
    } & CutMutationIdentity)
  | ({ readonly type: 'cut:duplicate'; readonly clipIds: readonly string[] } & CutMutationIdentity)
  | ({
      readonly type: 'cut:paste';
      readonly source: CutPresentationClipboard;
      readonly timelineStartSeconds: number;
    } & CutMutationIdentity)
  | ({ readonly type: 'cut:send-to-agent'; readonly selection: CutAgentSelection } & CutIdentity)
  | ({ readonly type: 'cut:separate'; readonly videoClipId: string } & CutMutationIdentity)
  | ({
      readonly type: 'cut:preview-start';
      readonly timelineTimeSeconds: number;
      readonly generation: number;
      readonly retainedVideoClipId?: string;
      readonly playbackMode: 'playing' | 'paused';
    } & CutIdentity)
  | ({
      readonly type: 'cut:preview-prepare';
      readonly timelineTimeSeconds: number;
      readonly generation: number;
    } & CutIdentity)
  | ({ readonly type: 'cut:preview-activate'; readonly generation: number } & CutIdentity)
  | ({
      readonly type: 'cut:preview-pause';
      readonly generation: number;
      readonly preparedGeneration?: number;
    } & CutIdentity)
  | ({ readonly type: 'cut:preview-stop'; readonly generation: number } & CutIdentity)
  | ({
      readonly type: 'cut:request-representations';
      readonly requests: readonly CutClipRepresentationRequest[];
    } & CutIdentity)
  | ({ readonly type: 'cut:export-query' } & CutIdentity)
  | ({ readonly type: 'cut:export-start'; readonly settings: CutExportSettings } & CutIdentity)
  | ({ readonly type: 'cut:export-cancel'; readonly jobId: string } & CutIdentity);

type CutMutationIntent = Extract<CutWebviewIntent, { readonly clientMutationId: string }>;
type CutMutationFactory = (identity: CutMutationIdentity) => CutMutationIntent;

export interface CutPreviewReadyMessage extends Record<string, unknown> {
  readonly type: 'cut:preview-ready';
  readonly generation: number;
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

export interface CutPreviewAudioPlayback {
  readonly mediaOriginSeconds: number;
  readonly playbackRate: number;
  readonly positionSeconds: number;
  readonly clipDurationSeconds: number;
  readonly fadeInSeconds: number;
  readonly fadeOutSeconds: number;
}

export class CutOtioController {
  private readonly mutationQueue: CutMutationFactory[] = [];
  private inFlightMutationId?: string;
  private mutationSequence = 0;
  private placementModeInitialized = false;
  private pendingSequenceTrim = false;
  private sequenceTrimMutationId?: string;
  private deferredPreview?: {
    readonly timelineTimeSeconds: number;
    readonly generation: number;
    readonly retainedVideoClipId?: string;
    readonly playbackMode: 'playing' | 'paused';
  };
  private previewGeneration = 0;

  constructor(
    private readonly store: CutPresentationStore,
    private readonly bridge: CutWebviewMessageBridge,
    private readonly events: CutOtioControllerEvents = {},
  ) {}

  ready(): void {
    this.bridge.postMessage({ type: 'cut:ready' });
  }

  command(command: CutCommand): void {
    this.enqueueMutation((identity) => ({ type: 'cut:command', ...identity, command }));
  }

  setPlacementMode(mode: CutPlacementMode): void {
    if (mode === 'position') {
      this.pendingSequenceTrim = false;
      this.sequenceTrimMutationId = undefined;
      this.store.getState().actions.setPlacementMode(mode);
      return;
    }
    const view = this.store.getState().view;
    if (!view) throw new Error('Cut TimelineView is unavailable.');
    this.store.getState().actions.setPlacementMode(mode);
    if (!hasTrailingGap(view)) return;
    this.pendingSequenceTrim = true;
    this.enqueueMutation((identity) => {
      this.sequenceTrimMutationId = identity.clientMutationId;
      return {
        type: 'cut:command',
        ...identity,
        command: { type: 'trim-trailing-gaps' },
      };
    });
  }

  batch(commands: readonly CutCommand[]): void {
    if (commands.length === 0) throw new Error('Cut command batch cannot be empty.');
    this.enqueueMutation((identity) => ({ type: 'cut:batch', ...identity, commands }));
  }

  undo(): void {
    this.enqueueMutation((identity) => ({ type: 'cut:undo', ...identity }));
  }

  redo(): void {
    this.enqueueMutation((identity) => ({ type: 'cut:redo', ...identity }));
  }

  addTrack(trackKind: Extract<OtioTrackKind, 'Audio' | 'Subtitle'>): void {
    this.enqueueMutation((identity) => ({ type: 'cut:add-track', ...identity, trackKind }));
  }

  selectLinkMedia(
    trackId: string,
    timelineStartFrames: number,
    overlapPolicy: 'reject' | 'insert',
  ): void {
    this.enqueueMutation((identity) => ({
      type: 'cut:select-link-media',
      ...identity,
      trackId,
      timelineStartFrames,
      overlapPolicy,
    }));
  }

  dropLinkMedia(
    trackId: string,
    uris: string | readonly string[],
    timelineStartFrames: number,
    overlapPolicy: 'reject' | 'insert',
  ): void {
    const normalized = typeof uris === 'string' ? [uris] : uris;
    this.enqueueMutation((identity) => ({
      type: 'cut:drop-link-media',
      ...identity,
      trackId,
      uris: normalized,
      timelineStartFrames,
      overlapPolicy,
    }));
  }

  split(clipId: string, offsetFrames: number): void {
    this.enqueueMutation((identity) => ({
      type: 'cut:split',
      ...identity,
      clipId,
      offsetFrames,
    }));
  }

  duplicate(clipIds: string | readonly string[]): void {
    const normalized = typeof clipIds === 'string' ? [clipIds] : clipIds;
    if (normalized.length === 0) throw new Error('Cut duplicate requires one or more Clips.');
    this.enqueueMutation((identity) => ({
      type: 'cut:duplicate',
      ...identity,
      clipIds: normalized,
    }));
  }

  paste(source: CutPresentationClipboard, timelineStartSeconds: number): void {
    this.enqueueMutation((identity) => ({
      type: 'cut:paste',
      ...identity,
      source,
      timelineStartSeconds,
    }));
  }

  sendToAgent(selection: CutAgentSelection): void {
    this.bridge.postMessage({ type: 'cut:send-to-agent', ...this.identity(), selection });
  }

  separateAudio(videoClipId: string): void {
    this.enqueueMutation((identity) => ({
      type: 'cut:separate',
      ...identity,
      videoClipId,
    }));
  }

  startPreview(
    timelineTimeSeconds: number,
    retainedVideoClipId?: string,
    playbackMode: 'playing' | 'paused' = 'playing',
  ): number {
    const generation = ++this.previewGeneration;
    if (this.inFlightMutationId || this.mutationQueue.length > 0) {
      this.deferredPreview = {
        timelineTimeSeconds,
        generation,
        ...(retainedVideoClipId ? { retainedVideoClipId } : {}),
        playbackMode,
      };
      if (playbackMode === 'playing') this.store.setState({ isPlaying: true });
      return generation;
    }
    this.bridge.postMessage({
      type: 'cut:preview-start',
      ...this.identity(),
      timelineTimeSeconds,
      generation,
      ...(retainedVideoClipId ? { retainedVideoClipId } : {}),
      playbackMode,
    });
    return generation;
  }

  preparePreview(timelineTimeSeconds: number): number {
    if (this.inFlightMutationId || this.mutationQueue.length > 0) {
      throw new Error('Cannot prepare Cut preview while a document mutation is pending.');
    }
    const generation = ++this.previewGeneration;
    this.bridge.postMessage({
      type: 'cut:preview-prepare',
      ...this.identity(),
      timelineTimeSeconds,
      generation,
    });
    return generation;
  }

  activatePreview(generation: number): void {
    if (generation !== this.previewGeneration) {
      throw new Error(
        `Cannot activate stale Cut preview generation ${generation}; current generation is ${this.previewGeneration}.`,
      );
    }
    this.bridge.postMessage({
      type: 'cut:preview-activate',
      ...this.identity(),
      generation,
    });
  }

  pausePreview(preparedGeneration?: number): number {
    const generation = ++this.previewGeneration;
    this.deferredPreview = undefined;
    if (this.inFlightMutationId || this.mutationQueue.length > 0) return generation;
    this.bridge.postMessage({
      type: 'cut:preview-pause',
      ...this.identity(),
      generation,
      ...(preparedGeneration !== undefined ? { preparedGeneration } : {}),
    });
    return generation;
  }

  stopPreview(): number {
    const generation = ++this.previewGeneration;
    this.deferredPreview = undefined;
    if (this.inFlightMutationId || this.mutationQueue.length > 0) return generation;
    this.bridge.postMessage({ type: 'cut:preview-stop', ...this.identity(), generation });
    return generation;
  }

  requestRepresentations(requests: readonly CutClipRepresentationRequest[]): void {
    this.bridge.postMessage({
      type: 'cut:request-representations',
      ...this.identity(),
      requests,
    });
  }

  queryExportTasks(): void {
    this.bridge.postMessage({ type: 'cut:export-query', ...this.identity() });
  }

  startExport(settings: CutExportSettings): void {
    this.bridge.postMessage({ type: 'cut:export-start', ...this.identity(), settings });
  }

  cancelExport(jobId: string): void {
    this.bridge.postMessage({ type: 'cut:export-cancel', ...this.identity(), jobId });
  }

  acceptHostMessage(value: unknown): boolean {
    if (!isRecord(value) || typeof value['type'] !== 'string') return false;
    if (value['type'] === 'cut:view' && isTimelineView(value['view'])) {
      this.acceptView(value['view']);
      return true;
    }
    if (value['type'] === 'cut:error') {
      if (!isCutUserDiagnostic(value['diagnostic'])) {
        throw new Error('Cut Host returned an invalid Cut error diagnostic.');
      }
      const sequenceTrimFailed =
        this.pendingSequenceTrim && this.sequenceTrimMutationId === this.inFlightMutationId;
      this.store.setState({
        diagnostic: value['diagnostic'],
        isPlaying: false,
        ...(sequenceTrimFailed ? { placementMode: 'position' } : {}),
      });
      if (sequenceTrimFailed) {
        this.pendingSequenceTrim = false;
        this.sequenceTrimMutationId = undefined;
      }
      return true;
    }
    if (
      value['type'] === 'cut:mutation-result' &&
      typeof value['clientMutationId'] === 'string' &&
      typeof value['succeeded'] === 'boolean' &&
      typeof value['revision'] === 'number'
    ) {
      this.acceptMutationResult(value['clientMutationId'], value['succeeded'], value['revision']);
      return true;
    }
    if (value['type'] === 'cut:export-tasks' && Array.isArray(value['tasks'])) {
      const exportTasks = value['tasks'].filter(isExportTaskSnapshot);
      if (exportTasks.length !== value['tasks'].length) {
        throw new Error('Cut Host returned an invalid export task snapshot.');
      }
      this.store.setState({ exportTasks });
      return true;
    }
    if (value['type'] === 'cut:export-task' && isExportTaskSnapshot(value['task'])) {
      const task = value['task'];
      this.store.setState((state) => ({
        exportTasks: [
          ...state.exportTasks.filter((candidate) => candidate.jobId !== task.jobId),
          task,
        ],
      }));
      return true;
    }
    if (value['type'] === 'cut:representations') {
      return this.acceptRepresentations(value);
    }
    if (isPreviewReadyMessage(value)) {
      this.events.onPreviewReady?.(value);
      return true;
    }
    return false;
  }

  private acceptView(view: TimelineView): void {
    const current = this.store.getState();
    const reconciledView = reconcileTimelineView(current.view, view);
    const selectedClips = retainClipSelections(reconciledView, current.selectedClips);
    const retainedSelection = retainSelection(reconciledView, current.selection);
    const placementMode = this.pendingSequenceTrim
      ? 'sequence'
      : hasTrailingGap(reconciledView)
        ? 'position'
        : this.placementModeInitialized
          ? current.placementMode
          : hasAnyGap(reconciledView)
            ? 'position'
            : 'sequence';
    this.placementModeInitialized = true;
    this.store.setState({
      view: reconciledView,
      selection: retainedSelection ?? selectedClips[selectedClips.length - 1],
      selectedClips,
      placementMode,
      playheadSeconds: Math.min(current.playheadSeconds, reconciledView.durationSeconds),
      isPlaying: this.deferredPreview !== undefined ? true : false,
      gestureDraft: undefined,
      diagnostic: undefined,
      representations: retainRepresentations(current.view, reconciledView, current.representations),
    });
    this.events.onViewAccepted?.(reconciledView);
  }

  private enqueueMutation(factory: CutMutationFactory): void {
    this.mutationQueue.push(factory);
    this.dispatchNextMutation();
  }

  private dispatchNextMutation(): void {
    if (this.inFlightMutationId) return;
    const factory = this.mutationQueue.shift();
    if (!factory) {
      this.flushDeferredPreview();
      return;
    }
    const current = this.identity();
    const clientMutationId = `${current.sessionId}:${++this.mutationSequence}`;
    this.inFlightMutationId = clientMutationId;
    this.bridge.postMessage(factory({ ...current, clientMutationId }));
  }

  private acceptMutationResult(
    clientMutationId: string,
    succeeded: boolean,
    revision: number,
  ): void {
    if (clientMutationId !== this.inFlightMutationId) {
      throw new Error(`Unexpected Cut mutation result: ${clientMutationId}.`);
    }
    const current = this.store.getState().view;
    if (!current) throw new Error('Cut TimelineView is unavailable.');
    if (succeeded && current.revision !== revision) {
      throw new Error(
        `Cut mutation ${clientMutationId} completed at revision ${revision} before its projection was accepted.`,
      );
    }
    this.inFlightMutationId = undefined;
    if (!succeeded) {
      this.mutationQueue.length = 0;
      this.deferredPreview = undefined;
      this.store.setState({
        isPlaying: false,
        ...(this.pendingSequenceTrim ? { placementMode: 'position' } : {}),
      });
      this.pendingSequenceTrim = false;
      this.sequenceTrimMutationId = undefined;
      return;
    }
    if (clientMutationId === this.sequenceTrimMutationId) {
      this.pendingSequenceTrim = false;
      this.sequenceTrimMutationId = undefined;
    }
    this.dispatchNextMutation();
  }

  private flushDeferredPreview(): void {
    const deferred = this.deferredPreview;
    if (!deferred) return;
    this.deferredPreview = undefined;
    this.store.setState({ isPlaying: true });
    this.bridge.postMessage({
      type: 'cut:preview-start',
      ...this.identity(),
      timelineTimeSeconds: deferred.timelineTimeSeconds,
      generation: deferred.generation,
      ...(deferred.retainedVideoClipId
        ? { retainedVideoClipId: deferred.retainedVideoClipId }
        : {}),
      playbackMode: deferred.playbackMode,
    });
  }

  private acceptRepresentations(message: Record<string, unknown>): boolean {
    const currentView = this.store.getState().view;
    if (
      !currentView ||
      message['documentUri'] !== currentView.documentUri ||
      message['sessionId'] !== currentView.sessionId ||
      message['revision'] !== currentView.revision
    ) {
      return true;
    }
    const results = message['results'];
    if (!Array.isArray(results) || !results.every(isRepresentationResult)) {
      throw new Error('Cut Host returned invalid Clip representations.');
    }
    this.store.setState((state) => {
      const representations = new Map(state.representations);
      for (const result of results) {
        representations.set(representationKey(currentView.revision, result), result);
      }
      return { representations: pruneRepresentationCache(representations) };
    });
    return true;
  }

  private identity(): CutIdentity {
    const view = this.store.getState().view;
    if (!view) throw new Error('Cut TimelineView is unavailable.');
    return {
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      expectedRevision: view.revision,
    };
  }
}

function hasAnyGap(view: TimelineView): boolean {
  return view.tracks.some((track) => track.items.some((item) => item.kind === 'gap'));
}

function hasTrailingGap(view: TimelineView): boolean {
  return view.tracks.some((track) => track.items[track.items.length - 1]?.kind === 'gap');
}

function retainClipSelections(
  view: TimelineView,
  selections: readonly CutPresentationClipSelection[],
): readonly CutPresentationClipSelection[] {
  return selections.filter((selection) =>
    view.tracks.some(
      (track) =>
        track.trackId === selection.trackId &&
        track.items.some((item) => item.kind === 'clip' && item.clipId === selection.clipId),
    ),
  );
}

function retainRepresentations(
  previous: TimelineView | undefined,
  next: TimelineView,
  current: ReadonlyMap<string, CutClipRepresentationResult>,
): ReadonlyMap<string, CutClipRepresentationResult> {
  if (
    !previous ||
    previous.documentUri !== next.documentUri ||
    previous.sessionId !== next.sessionId
  ) {
    return new Map();
  }
  const retained = new Map<string, CutClipRepresentationResult>();
  for (const result of current.values()) {
    if (result.status !== 'ready' && result.status !== 'partial') continue;
    const previousClip = findClipProjection(previous, result.clipId);
    const nextClip = findClipProjection(next, result.clipId);
    if (!previousClip || !nextClip || !sameRepresentationInput(previousClip, nextClip)) continue;
    retained.set(representationKey(next.revision, result), result);
  }
  return retained;
}

function reconcileTimelineView(
  previous: TimelineView | undefined,
  next: TimelineView,
): TimelineView {
  if (
    !previous ||
    previous.documentUri !== next.documentUri ||
    previous.sessionId !== next.sessionId
  ) {
    return next;
  }
  const previousTracks = new Map(previous.tracks.map((track) => [track.trackId, track]));
  const tracks = next.tracks.map((track) => {
    const candidate = previousTracks.get(track.trackId);
    return candidate && sameTrackProjection(candidate, track) ? candidate : track;
  });
  return tracks.every((track, index) => track === next.tracks[index]) ? next : { ...next, tracks };
}

function findClipProjection(view: TimelineView, clipId: string) {
  for (const track of view.tracks) {
    const item = track.items.find(
      (candidate) => candidate.kind === 'clip' && candidate.clipId === clipId,
    );
    if (item?.kind === 'clip') return { trackKind: track.kind, clip: item };
  }
  return undefined;
}

function sameRepresentationInput(
  previous: NonNullable<ReturnType<typeof findClipProjection>>,
  next: NonNullable<ReturnType<typeof findClipProjection>>,
): boolean {
  return (
    previous.trackKind === next.trackKind &&
    previous.clip.targetUrl === next.clip.targetUrl &&
    previous.clip.startSeconds === next.clip.startSeconds &&
    previous.clip.sourceStartSeconds === next.clip.sourceStartSeconds &&
    previous.clip.durationSeconds === next.clip.durationSeconds &&
    previous.clip.playbackRate === next.clip.playbackRate
  );
}

function sameTrackProjection(
  previous: TimelineView['tracks'][number],
  next: TimelineView['tracks'][number],
): boolean {
  return (
    previous.name === next.name &&
    previous.kind === next.kind &&
    previous.enabled === next.enabled &&
    previous.locked === next.locked &&
    previous.audioMuted === next.audioMuted &&
    previous.items.length === next.items.length &&
    previous.items.every((item, index) => sameTimelineItem(item, next.items[index]))
  );
}

function sameTimelineItem(
  previous: TimelineView['tracks'][number]['items'][number],
  next: TimelineView['tracks'][number]['items'][number] | undefined,
): boolean {
  if (!next || previous.kind !== next.kind) return false;
  if (previous.kind === 'gap' && next.kind === 'gap') {
    return (
      previous.startSeconds === next.startSeconds &&
      previous.durationSeconds === next.durationSeconds
    );
  }
  if (previous.kind !== 'clip' || next.kind !== 'clip') return false;
  return (
    previous.clipId === next.clipId &&
    previous.name === next.name &&
    previous.targetUrl === next.targetUrl &&
    previous.startSeconds === next.startSeconds &&
    previous.durationSeconds === next.durationSeconds &&
    previous.sourceStartSeconds === next.sourceStartSeconds &&
    previous.sourceAvailableStartSeconds === next.sourceAvailableStartSeconds &&
    previous.sourceAvailableDurationSeconds === next.sourceAvailableDurationSeconds &&
    previous.playbackRate === next.playbackRate &&
    previous.enabled === next.enabled &&
    previous.locked === next.locked &&
    previous.linkedAudioClipId === next.linkedAudioClipId &&
    previous.linkedVideoClipId === next.linkedVideoClipId &&
    previous.audio.muted === next.audio.muted &&
    previous.audio.gainDb === next.audio.gainDb &&
    previous.audio.fadeInSeconds === next.audio.fadeInSeconds &&
    previous.audio.fadeOutSeconds === next.audio.fadeOutSeconds
  );
}

function retainSelection(
  view: TimelineView,
  selection: CutPresentationSelection | undefined,
): CutPresentationSelection | undefined {
  if (!selection) return undefined;
  const track = view.tracks.find((candidate) => candidate.trackId === selection.trackId);
  if (!track) return undefined;
  if (selection.kind === 'track') return selection;
  if (selection.kind === 'clip') {
    return track.items.some((item) => item.kind === 'clip' && item.clipId === selection.clipId)
      ? selection
      : undefined;
  }
  return track.items[selection.itemIndex]?.kind === 'gap' ? selection : undefined;
}

function isTimelineView(value: unknown): value is TimelineView {
  return (
    isRecord(value) &&
    typeof value['documentUri'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['revision'] === 'number' &&
    typeof value['name'] === 'string' &&
    typeof value['durationSeconds'] === 'number' &&
    Array.isArray(value['tracks'])
  );
}

function isPreviewReadyMessage(value: Record<string, unknown>): value is CutPreviewReadyMessage {
  return (
    value['type'] === 'cut:preview-ready' &&
    typeof value['generation'] === 'number' &&
    (value['videoClipId'] === undefined || typeof value['videoClipId'] === 'string') &&
    typeof value['timelineTimeSeconds'] === 'number' &&
    typeof value['segmentEndSeconds'] === 'number' &&
    typeof value['playbackEndSeconds'] === 'number' &&
    Number.isFinite(value['playbackEndSeconds']) &&
    value['playbackEndSeconds'] > 0 &&
    (value['mediaSourceTimeSeconds'] === undefined ||
      (typeof value['mediaSourceTimeSeconds'] === 'number' &&
        Number.isFinite(value['mediaSourceTimeSeconds']))) &&
    (value['mediaPlaybackRate'] === undefined ||
      (typeof value['mediaPlaybackRate'] === 'number' &&
        Number.isFinite(value['mediaPlaybackRate']) &&
        value['mediaPlaybackRate'] > 0)) &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number' &&
    typeof value['framesPerSecond'] === 'number' &&
    (value['video'] === undefined || isHtmlVideoDescriptor(value['video'])) &&
    (value['videoPlaybackRate'] === undefined ||
      (typeof value['videoPlaybackRate'] === 'number' &&
        Number.isFinite(value['videoPlaybackRate']) &&
        value['videoPlaybackRate'] > 0)) &&
    Array.isArray(value['audioStreams']) &&
    value['audioStreams'].every(isPcmStreamDescriptor) &&
    Array.isArray(value['audioGainsDb']) &&
    value['audioGainsDb'].length === value['audioStreams'].length &&
    value['audioGainsDb'].every((item) => typeof item === 'number') &&
    Array.isArray(value['audioPlayback']) &&
    value['audioPlayback'].length === value['audioStreams'].length &&
    value['audioPlayback'].every(isPreviewAudioPlayback)
  );
}

function isPreviewAudioPlayback(value: unknown): value is CutPreviewAudioPlayback {
  return (
    isRecord(value) &&
    isNonNegativeFinite(value['mediaOriginSeconds']) &&
    isPositiveFinite(value['playbackRate']) &&
    isNonNegativeFinite(value['positionSeconds']) &&
    isPositiveFinite(value['clipDurationSeconds']) &&
    value['positionSeconds'] < value['clipDurationSeconds'] &&
    isNonNegativeFinite(value['fadeInSeconds']) &&
    value['fadeInSeconds'] <= value['clipDurationSeconds'] &&
    isNonNegativeFinite(value['fadeOutSeconds']) &&
    value['fadeOutSeconds'] <= value['clipDurationSeconds']
  );
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isHtmlVideoDescriptor(value: unknown): value is CutHtmlVideoDescriptor {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    value['transport'] === 'http' &&
    isLoopbackHttpUrl(value['url']) &&
    typeof value['mimeType'] === 'string' &&
    typeof value['preparationProfile'] === 'string' &&
    isNonNegativeFinite(value['mediaTimeOriginSeconds']) &&
    isPositiveFinite(value['durationSeconds'])
  );
}

function isLoopbackHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isPcmStreamDescriptor(value: unknown): value is CutPcmStreamDescriptor {
  return (
    isRecord(value) &&
    value['version'] === 1 &&
    value['transport'] === 'http' &&
    value['protocol'] === 'neko-pcm-f32le-v1' &&
    typeof value['streamUrl'] === 'string' &&
    typeof value['sampleRate'] === 'number' &&
    typeof value['channels'] === 'number'
  );
}

function isExportTaskSnapshot(value: unknown): value is CutExportTaskSnapshot {
  if (!isRecord(value)) return false;
  const valid =
    typeof value['jobId'] === 'string' &&
    typeof value['documentUri'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['sourceRevision'] === 'number' &&
    isExportSettings(value['settings']) &&
    typeof value['outputWorkspaceRelativePath'] === 'string' &&
    (value['status'] === 'running' ||
      value['status'] === 'completed' ||
      value['status'] === 'failed' ||
      value['status'] === 'cancelled') &&
    typeof value['startedAt'] === 'number';
  return valid && (value['status'] !== 'failed' || isCutUserDiagnostic(value['diagnostic']));
}

function isExportSettings(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number' &&
    typeof value['framesPerSecond'] === 'number'
  );
}

function isRepresentationResult(value: unknown): value is CutClipRepresentationResult {
  if (!isRecord(value) || typeof value['clipId'] !== 'string') return false;
  if (value['kind'] !== 'thumbnail' && value['kind'] !== 'waveform') return false;
  if (value['kind'] === 'thumbnail') {
    if (
      !CUT_THUMBNAIL_DENSITIES.some((density) => density === value['density']) ||
      !Number.isSafeInteger(value['tileIndex']) ||
      typeof value['tileIndex'] !== 'number' ||
      value['tileIndex'] < 0
    ) {
      return false;
    }
    if (value['status'] === 'unavailable') {
      return (
        typeof value['message'] === 'string' &&
        isOptionalRepresentationFailureScope(value['failureScope'])
      );
    }
    return (
      value['status'] === 'ready' &&
      typeof value['sourceTimeSeconds'] === 'number' &&
      typeof value['dataUrl'] === 'string'
    );
  }
  if (
    !Number.isInteger(value['peaksPerSecond']) ||
    typeof value['peaksPerSecond'] !== 'number' ||
    value['peaksPerSecond'] < 1
  ) {
    return false;
  }
  if (value['status'] === 'unavailable') {
    return (
      typeof value['message'] === 'string' &&
      isOptionalRepresentationFailureScope(value['failureScope'])
    );
  }
  if (value['status'] === 'partial') {
    return (
      isRecord(value['waveform']) &&
      Array.isArray(value['waveform']['peaks']) &&
      isRecord(value['waveform']['partial']) &&
      typeof value['waveform']['partial']['availableDurationSeconds'] === 'number' &&
      (value['waveform']['partial']['failureScope'] === 'source' ||
        value['waveform']['partial']['failureScope'] === 'stream' ||
        value['waveform']['partial']['failureScope'] === 'interval') &&
      typeof value['waveform']['partial']['message'] === 'string'
    );
  }
  if (value['status'] !== 'ready') return false;
  return isRecord(value['waveform']) && Array.isArray(value['waveform']['peaks']);
}

function isOptionalRepresentationFailureScope(value: unknown): boolean {
  return (
    value === undefined ||
    value === 'source' ||
    value === 'stream' ||
    value === 'interval' ||
    value === 'operation'
  );
}

const MAX_CACHED_THUMBNAIL_TILES = 256;

function pruneRepresentationCache(
  representations: Map<string, CutClipRepresentationResult>,
): Map<string, CutClipRepresentationResult> {
  let thumbnailCount = [...representations.values()].filter(
    (result) => result.kind === 'thumbnail',
  ).length;
  if (thumbnailCount <= MAX_CACHED_THUMBNAIL_TILES) return representations;
  for (const [key, result] of representations) {
    if (result.kind !== 'thumbnail') continue;
    representations.delete(key);
    thumbnailCount -= 1;
    if (thumbnailCount <= MAX_CACHED_THUMBNAIL_TILES) break;
  }
  return representations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
