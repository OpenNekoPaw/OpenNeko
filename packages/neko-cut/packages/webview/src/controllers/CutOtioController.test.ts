import type { TimelineView } from '@neko-cut/domain';
import { describe, expect, it, vi } from 'vitest';
import { createCutPresentationStore } from '../stores/cut-presentation-store';
import { CutOtioController } from './CutOtioController';

describe('CutOtioController', () => {
  it('keeps TimelineView immutable until the Host returns a new revision', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const view = createView();

    controller.acceptHostMessage({ type: 'cut:view', view });
    controller.command({ type: 'rename-clip', clipId: 'clip-1', name: 'Renamed' });

    expect(store.getState().view).toBe(view);
    expect(findClipName(store.getState().view)).toBe('Clip 1');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'cut:command',
      clientMutationId: expect.any(String),
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      expectedRevision: 4,
      command: { type: 'rename-clip', clipId: 'clip-1', name: 'Renamed' },
    });
  });

  it('serializes rapid durable edits across Host revisions', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const view = createView();
    controller.acceptHostMessage({ type: 'cut:view', view });

    controller.command({
      type: 'place-clip',
      clipId: 'clip-1',
      toTrackId: 'track-video',
      timelineStartFrames: 30,
      rate: 30,
      overlapPolicy: 'insert',
    });
    controller.command({
      type: 'place-clip',
      clipId: 'clip-1',
      toTrackId: 'track-video',
      timelineStartFrames: 60,
      rate: 30,
      overlapPolicy: 'insert',
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'cut:command',
      clientMutationId: 'session-1:1',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      expectedRevision: 4,
      command: {
        type: 'place-clip',
        clipId: 'clip-1',
        toTrackId: 'track-video',
        timelineStartFrames: 30,
        rate: 30,
        overlapPolicy: 'insert',
      },
    });

    controller.acceptHostMessage({
      type: 'cut:view',
      view: { ...view, revision: 5 },
    });
    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: true,
      revision: 5,
    });

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:command',
      clientMutationId: 'session-1:2',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      expectedRevision: 5,
      command: {
        type: 'place-clip',
        clipId: 'clip-1',
        toTrackId: 'track-video',
        timelineStartFrames: 60,
        rate: 30,
        overlapPolicy: 'insert',
      },
    });
  });

  it('defers playback until the preceding edit revision is accepted', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const view = createView();
    controller.acceptHostMessage({ type: 'cut:view', view });

    controller.command({ type: 'set-clip-locked', clipId: 'clip-1', locked: true });
    controller.startPreview(1.5);

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(store.getState().isPlaying).toBe(true);

    controller.acceptHostMessage({
      type: 'cut:view',
      view: { ...view, revision: 5 },
    });
    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: true,
      revision: 5,
    });

    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:preview-start',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      expectedRevision: 5,
      timelineTimeSeconds: 1.5,
    });
    expect(store.getState().isPlaying).toBe(true);
  });

  it('stores only presentation state and clears selection removed by a Host revision', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });
    store.getState().actions.select({ kind: 'clip', trackId: 'track-video', clipId: 'clip-1' });

    const next = { ...createView(), revision: 5, tracks: [createView().tracks[0]!] };
    controller.acceptHostMessage({
      type: 'cut:view',
      view: { ...next, tracks: [{ ...next.tracks[0]!, items: [] }] },
    });

    const stateRecord = store.getState();
    expect(store.getState().selection).toBeUndefined();
    expect('project' in stateRecord).toBe(false);
    expect('updateProject' in stateRecord).toBe(false);
    expect('save' in stateRecord).toBe(false);
  });

  it('rejects stale derived representations without changing the current cache', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.acceptHostMessage({
      type: 'cut:representations',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      revision: 3,
      results: [
        {
          clipId: 'clip-1',
          kind: 'waveform',
          status: 'ready',
          waveform: { peaks: [0.2], durationSeconds: 1, peaksPerSecond: 1 },
        },
      ],
    });

    expect(store.getState().representations.size).toBe(0);
  });

  it('retains unchanged Clip representations across structural Host revisions', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    const current = createView();
    controller.acceptHostMessage({ type: 'cut:view', view: current });
    controller.acceptHostMessage({
      type: 'cut:representations',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      revision: current.revision,
      results: [
        {
          clipId: 'clip-1',
          kind: 'thumbnail',
          status: 'ready',
          thumbnails: [{ sourceTimeSeconds: 0, dataUrl: 'data:image/png;base64,thumb' }],
        },
      ],
    });

    const previousTrack = store.getState().view?.tracks[0];
    controller.acceptHostMessage({
      type: 'cut:view',
      view: {
        ...createView(),
        revision: 5,
        tracks: [
          ...createView().tracks,
          { trackId: 'track-audio', name: 'Audio 1', kind: 'Audio', items: [] },
        ],
      },
    });

    expect(store.getState().representations.get('5:clip-1:thumbnail')).toMatchObject({
      clipId: 'clip-1',
      status: 'ready',
    });
    expect(store.getState().view?.tracks[0]).toBe(previousTrack);
  });

  it('does not reuse stale Track or Clip projections when edit state changes', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    const current = createView();
    controller.acceptHostMessage({ type: 'cut:view', view: current });
    const track = current.tracks[0]!;
    const clip = track.items[0]!;
    if (clip.kind !== 'clip') throw new Error('Clip fixture is missing.');

    controller.acceptHostMessage({
      type: 'cut:view',
      view: {
        ...current,
        revision: 5,
        tracks: [
          {
            ...track,
            audioMuted: true,
            locked: true,
            items: [{ ...clip, enabled: false, locked: true }],
          },
        ],
      },
    });

    const acceptedTrack = store.getState().view?.tracks[0];
    const acceptedClip = acceptedTrack?.items[0];
    expect(acceptedTrack).not.toBe(track);
    expect(acceptedTrack).toMatchObject({ audioMuted: true, locked: true });
    expect(acceptedClip).toMatchObject({ enabled: false, locked: true });
  });

  it('accepts audio-only and streamless preview segments without a Video Clip identity', () => {
    const store = createCutPresentationStore();
    const onPreviewReady = vi.fn();
    const controller = new CutOtioController(store, { postMessage: vi.fn() }, { onPreviewReady });
    const message = {
      type: 'cut:preview-ready',
      timelineTimeSeconds: 2,
      segmentEndSeconds: 4,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      audioStreamUrls: ['ws://audio/pcm-1'],
      audioGainsDb: [0],
    };

    expect(controller.acceptHostMessage(message)).toBe(true);
    expect(onPreviewReady).toHaveBeenCalledWith(message);
  });

  it('projects background export task state and keeps task control Host-owned', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.startExport();
    controller.acceptHostMessage({
      type: 'cut:export-task',
      task: {
        jobId: 'job-1',
        documentUri: 'file:///workspace/project.otio',
        sessionId: 'session-1',
        sourceRevision: 4,
        outputWorkspaceRelativePath: 'exports/project.mp4',
        status: 'running',
        startedAt: 100,
      },
    });
    controller.cancelExport('job-1');

    expect(store.getState().exportTasks).toHaveLength(1);
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'cut:export-start',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      expectedRevision: 4,
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:export-cancel',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      expectedRevision: 4,
      jobId: 'job-1',
    });
  });

  it('copies explicit multi-Clip locators and delegates paste identity allocation to the Host', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createTwoClipView() });
    store.getState().actions.select({
      kind: 'clip',
      trackId: 'track-video',
      clipId: 'clip-1',
    });
    store.getState().actions.select(
      {
        kind: 'clip',
        trackId: 'track-video',
        clipId: 'clip-2',
      },
      'toggle',
    );

    store.getState().actions.copySelection();
    const clipboard = store.getState().clipboard;
    expect(clipboard).toEqual({
      kind: 'clips',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      clips: [
        { trackId: 'track-video', clipId: 'clip-1' },
        { trackId: 'track-video', clipId: 'clip-2' },
      ],
    });
    expect(clipboard).not.toHaveProperty('view');
    expect(clipboard).not.toHaveProperty('document');

    if (!clipboard) throw new Error('Expected a copied Clip locator.');
    controller.paste(clipboard, 8);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'cut:paste',
      clientMutationId: expect.any(String),
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      expectedRevision: 4,
      source: clipboard,
      timelineStartSeconds: 8,
    });
  });

  it('posts an atomic Host batch for multi-Clip durable edits', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createTwoClipView() });

    controller.batch([
      { type: 'ripple-delete', clipId: 'clip-1' },
      { type: 'ripple-delete', clipId: 'clip-2' },
    ]);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'cut:batch',
      clientMutationId: expect.any(String),
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      expectedRevision: 4,
      commands: [
        { type: 'ripple-delete', clipId: 'clip-1' },
        { type: 'ripple-delete', clipId: 'clip-2' },
      ],
    });
  });

  it('copies a Track locator without cloning a writable timeline snapshot', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });
    store.getState().actions.select({ kind: 'track', trackId: 'track-video' });

    store.getState().actions.copySelection();

    expect(store.getState().clipboard).toEqual({
      kind: 'track',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      trackId: 'track-video',
    });
  });

  it('sends an explicit Clip selection to the Host-owned Agent context path', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.sendToAgent({
      kind: 'clip',
      trackId: 'track-video',
      clipId: 'clip-1',
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'cut:send-to-agent',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      expectedRevision: 4,
      selection: {
        kind: 'clip',
        trackId: 'track-video',
        clipId: 'clip-1',
      },
    });
  });
});

function createView(): TimelineView {
  return {
    documentUri: 'file:///workspace/project.otio',
    sessionId: 'session-1',
    revision: 4,
    name: 'Project',
    durationSeconds: 3,
    profile: {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    },
    tracks: [
      {
        trackId: 'track-video',
        name: 'Video',
        kind: 'Video',
        enabled: true,
        locked: false,
        audioMuted: false,
        items: [
          {
            kind: 'clip',
            clipId: 'clip-1',
            name: 'Clip 1',
            targetUrl: '../media/clip.mp4',
            startSeconds: 0,
            durationSeconds: 3,
            sourceStartSeconds: 0,
            playbackRate: 1,
            enabled: true,
            locked: false,
            audio: { muted: false, gainDb: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
          },
        ],
      },
    ],
  };
}

function createTwoClipView(): TimelineView {
  const view = createView();
  const track = view.tracks[0];
  const first = track?.items[0];
  if (!track || !first || first.kind !== 'clip') throw new Error('Clip fixture is missing.');
  return {
    ...view,
    durationSeconds: 6,
    tracks: [
      {
        ...track,
        items: [
          first,
          {
            ...first,
            clipId: 'clip-2',
            name: 'Clip 2',
            startSeconds: 3,
          },
        ],
      },
    ],
  };
}

function findClipName(view: TimelineView | undefined): string | undefined {
  const item = view?.tracks[0]?.items[0];
  return item?.kind === 'clip' ? item.name : undefined;
}
