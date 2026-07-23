import type {
  CutClipRepresentationRequest,
  CutClipRepresentationResult,
  CutCommand,
  CutExportTaskSnapshot,
  OtioTrackKind,
  TimelineView,
} from '@neko-cut/domain';
import {
  representationKey,
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
  | ({ readonly type: 'cut:select-link-media'; readonly trackId: string } & CutMutationIdentity)
  | ({
      readonly type: 'cut:drop-link-media';
      readonly trackId: string;
      readonly uris: readonly string[];
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
  | ({ readonly type: 'cut:preview-start'; readonly timelineTimeSeconds: number } & CutIdentity)
  | ({ readonly type: 'cut:preview-stop' } & CutIdentity)
  | ({
      readonly type: 'cut:request-representations';
      readonly requests: readonly CutClipRepresentationRequest[];
    } & CutIdentity)
  | ({ readonly type: 'cut:export-query' | 'cut:export-start' } & CutIdentity)
  | ({ readonly type: 'cut:export-cancel'; readonly jobId: string } & CutIdentity);

type CutMutationIntent = Extract<CutWebviewIntent, { readonly clientMutationId: string }>;
type CutMutationFactory = (identity: CutMutationIdentity) => CutMutationIntent;

export interface CutPreviewReadyMessage extends Record<string, unknown> {
  readonly type: 'cut:preview-ready';
  readonly videoClipId?: string;
  readonly timelineTimeSeconds: number;
  readonly segmentEndSeconds: number;
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly videoStreamUrl?: string;
  readonly audioStreamUrls: readonly string[];
  readonly audioGainsDb: readonly number[];
}

export class CutOtioController {
  private readonly mutationQueue: CutMutationFactory[] = [];
  private inFlightMutationId?: string;
  private mutationSequence = 0;
  private deferredPreviewStartSeconds?: number;

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

  selectLinkMedia(trackId: string): void {
    this.enqueueMutation((identity) => ({ type: 'cut:select-link-media', ...identity, trackId }));
  }

  dropLinkMedia(trackId: string, uris: string | readonly string[]): void {
    const normalized = typeof uris === 'string' ? [uris] : uris;
    this.enqueueMutation((identity) => ({
      type: 'cut:drop-link-media',
      ...identity,
      trackId,
      uris: normalized,
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

  startPreview(timelineTimeSeconds: number): void {
    if (this.inFlightMutationId || this.mutationQueue.length > 0) {
      this.deferredPreviewStartSeconds = timelineTimeSeconds;
      this.store.setState({ isPlaying: true });
      return;
    }
    this.bridge.postMessage({
      type: 'cut:preview-start',
      ...this.identity(),
      timelineTimeSeconds,
    });
  }

  stopPreview(): void {
    this.deferredPreviewStartSeconds = undefined;
    if (this.inFlightMutationId || this.mutationQueue.length > 0) return;
    this.bridge.postMessage({ type: 'cut:preview-stop', ...this.identity() });
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

  startExport(): void {
    this.bridge.postMessage({ type: 'cut:export-start', ...this.identity() });
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
    if (value['type'] === 'cut:error' && typeof value['message'] === 'string') {
      this.store.setState({ diagnostic: value['message'], isPlaying: false });
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
    this.store.setState({
      view: reconciledView,
      selection: retainedSelection ?? selectedClips[selectedClips.length - 1],
      selectedClips,
      playheadSeconds: Math.min(current.playheadSeconds, reconciledView.durationSeconds),
      isPlaying: this.deferredPreviewStartSeconds !== undefined ? true : false,
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
      this.deferredPreviewStartSeconds = undefined;
      this.store.setState({ isPlaying: false });
      return;
    }
    this.dispatchNextMutation();
  }

  private flushDeferredPreview(): void {
    const timelineTimeSeconds = this.deferredPreviewStartSeconds;
    if (timelineTimeSeconds === undefined) return;
    this.deferredPreviewStartSeconds = undefined;
    this.store.setState({ isPlaying: true });
    this.bridge.postMessage({
      type: 'cut:preview-start',
      ...this.identity(),
      timelineTimeSeconds,
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
        representations.set(
          representationKey(currentView.revision, result.clipId, result.kind),
          result,
        );
      }
      return { representations };
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
    if (result.status !== 'ready') continue;
    const previousClip = findClipProjection(previous, result.clipId);
    const nextClip = findClipProjection(next, result.clipId);
    if (!previousClip || !nextClip || !sameRepresentationInput(previousClip, nextClip)) continue;
    retained.set(representationKey(next.revision, result.clipId, result.kind), result);
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
    (value['videoClipId'] === undefined || typeof value['videoClipId'] === 'string') &&
    typeof value['timelineTimeSeconds'] === 'number' &&
    typeof value['segmentEndSeconds'] === 'number' &&
    typeof value['width'] === 'number' &&
    typeof value['height'] === 'number' &&
    typeof value['framesPerSecond'] === 'number' &&
    (value['videoStreamUrl'] === undefined || typeof value['videoStreamUrl'] === 'string') &&
    Array.isArray(value['audioStreamUrls']) &&
    value['audioStreamUrls'].every((item) => typeof item === 'string') &&
    Array.isArray(value['audioGainsDb']) &&
    value['audioGainsDb'].every((item) => typeof item === 'number')
  );
}

function isExportTaskSnapshot(value: unknown): value is CutExportTaskSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value['jobId'] === 'string' &&
    typeof value['documentUri'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['sourceRevision'] === 'number' &&
    typeof value['outputWorkspaceRelativePath'] === 'string' &&
    (value['status'] === 'running' ||
      value['status'] === 'completed' ||
      value['status'] === 'failed' ||
      value['status'] === 'cancelled') &&
    typeof value['startedAt'] === 'number'
  );
}

function isRepresentationResult(value: unknown): value is CutClipRepresentationResult {
  if (!isRecord(value) || typeof value['clipId'] !== 'string') return false;
  if (value['kind'] !== 'thumbnail' && value['kind'] !== 'waveform') return false;
  if (value['status'] === 'unavailable') return typeof value['message'] === 'string';
  if (value['status'] !== 'ready') return false;
  return value['kind'] === 'thumbnail'
    ? Array.isArray(value['thumbnails'])
    : isRecord(value['waveform']) && Array.isArray(value['waveform']['peaks']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
