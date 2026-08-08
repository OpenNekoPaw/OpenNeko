import { DEFAULT_CUT_HOST_PRESENTATION, type TimelineView } from '@neko/cut-domain';
import { describe, expect, it, vi } from 'vitest';
import { createCutPresentationStore } from '../stores/cut-presentation-store';
import { CutOtioController } from './CutOtioController';

describe('CutOtioController', () => {
  it('accepts structured Host diagnostics and rejects the removed raw-message protocol', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });

    expect(
      controller.acceptHostMessage({
        type: 'cut:error',
        diagnostic: { code: 'clip-placement-overlap' },
      }),
    ).toBe(true);
    expect(store.getState().diagnostic).toEqual({ code: 'clip-placement-overlap' });
    expect(() =>
      controller.acceptHostMessage({
        type: 'cut:error',
        message: 'Clip placement would overlap another Clip on the target Track.',
      }),
    ).toThrow('invalid Cut error diagnostic');
  });

  it('keeps TimelineView immutable until the Host returns an updated view', () => {
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
      command: { type: 'rename-clip', clipId: 'clip-1', name: 'Renamed' },
    });
  });

  it('accepts dirty/presentation snapshots and serializes presentation with save intents', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const view = createView();
    const initialPresentation = {
      ...DEFAULT_CUT_HOST_PRESENTATION,
      previewVolume: 0.5,
      pixelsPerSecond: 120,
    };

    expect(
      controller.acceptHostMessage({
        type: 'cut:runtime-snapshot',
        view,
        dirty: true,
        presentation: initialPresentation,
      }),
    ).toBe(true);
    expect(store.getState()).toMatchObject({
      dirty: true,
      previewVolume: 0.5,
      pixelsPerSecond: 120,
    });

    const nextPresentation = {
      ...initialPresentation,
      snappingEnabled: false,
      overviewVisible: false,
    };
    controller.updatePresentation(nextPresentation);
    controller.save();
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'cut:presentation-update',
      clientMutationId: 'session-1:1',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      presentation: nextPresentation,
    });

    controller.acceptHostMessage({
      type: 'cut:runtime-snapshot',
      view,
      dirty: true,
      presentation: nextPresentation,
    });
    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: true,
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:save',
      clientMutationId: 'session-1:2',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
    });

    controller.acceptHostMessage({
      type: 'cut:runtime-snapshot',
      view,
      dirty: false,
      presentation: nextPresentation,
    });
    expect(store.getState().dirty).toBe(false);
  });

  it('enters sequence mode through a trailing-Gap trim and reverts on failure', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const view = createViewWithTrailingGap();

    controller.acceptHostMessage({ type: 'cut:view', view });
    expect(store.getState().placementMode).toBe('position');

    controller.setPlacementMode('sequence');
    expect(store.getState().placementMode).toBe('sequence');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'cut:command',
      clientMutationId: 'session-1:1',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      command: { type: 'trim-trailing-gaps' },
    });

    controller.acceptHostMessage({
      type: 'cut:error',
      diagnostic: { code: 'locked' },
    });
    expect(store.getState().placementMode).toBe('position');
  });

  it('changes placement presentation directly when no trailing Gap requires mutation', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.setPlacementMode('position');
    controller.setPlacementMode('sequence');

    expect(store.getState().placementMode).toBe('sequence');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('keeps sequence mode after the Host accepts the trailing-Gap trim', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const view = createViewWithTrailingGap();
    controller.acceptHostMessage({ type: 'cut:view', view });

    controller.setPlacementMode('sequence');
    controller.acceptHostMessage({
      type: 'cut:view',
      view: createView(),
    });
    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: true,
    });

    expect(store.getState().placementMode).toBe('sequence');
    expect(store.getState().view?.tracks[0]?.items.some((item) => item.kind === 'gap')).toBe(false);

    controller.undo();
    controller.acceptHostMessage({
      type: 'cut:view',
      view,
    });
    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:2',
      succeeded: true,
    });

    expect(store.getState().placementMode).toBe('position');
  });

  it('keeps a queued sequence trim bound to its own mutation result', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const view = createViewWithTrailingGap();
    controller.acceptHostMessage({ type: 'cut:view', view });

    controller.command({ type: 'rename-clip', clipId: 'clip-1', name: 'Renamed' });
    controller.setPlacementMode('sequence');
    expect(postMessage).toHaveBeenCalledTimes(1);

    controller.acceptHostMessage({
      type: 'cut:view',
      view,
    });
    expect(store.getState().placementMode).toBe('sequence');

    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: true,
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:command',
      clientMutationId: 'session-1:2',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      command: { type: 'trim-trailing-gaps' },
    });

    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:2',
      succeeded: false,
    });
    expect(store.getState().placementMode).toBe('position');
  });

  it('serializes rapid durable edits by exact mutation identity', () => {
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
      sourcePolicy: 'ripple',
      overlapPolicy: 'insert',
    });
    controller.command({
      type: 'place-clip',
      clipId: 'clip-1',
      toTrackId: 'track-video',
      timelineStartFrames: 60,
      rate: 30,
      sourcePolicy: 'ripple',
      overlapPolicy: 'insert',
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'cut:command',
      clientMutationId: 'session-1:1',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      command: {
        type: 'place-clip',
        clipId: 'clip-1',
        toTrackId: 'track-video',
        timelineStartFrames: 30,
        rate: 30,
        sourcePolicy: 'ripple',
        overlapPolicy: 'insert',
      },
    });

    controller.acceptHostMessage({
      type: 'cut:view',
      view,
    });
    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: true,
    });

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:command',
      clientMutationId: 'session-1:2',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      command: {
        type: 'place-clip',
        clipId: 'clip-1',
        toTrackId: 'track-video',
        timelineStartFrames: 60,
        rate: 30,
        sourcePolicy: 'ripple',
        overlapPolicy: 'insert',
      },
    });
  });

  it('sends explicit picker and drop placement instead of an append-only media intent', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.selectLinkMedia('track-video', 45, 'reject');
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'cut:select-link-media',
        trackId: 'track-video',
        timelineStartFrames: 45,
        overlapPolicy: 'reject',
      }),
    );

    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: false,
      diagnostic: { code: 'internal-failure' },
    });
    controller.dropLinkMedia(
      'track-video',
      { kind: 'local-file-uris', uris: ['file:///workspace/a.mp4'] },
      90,
      'insert',
    );
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'cut:drop-link-media',
        trackId: 'track-video',
        source: { kind: 'local-file-uris', uris: ['file:///workspace/a.mp4'] },
        timelineStartFrames: 90,
        overlapPolicy: 'insert',
      }),
    );
  });

  it('defers playback until the preceding edit is accepted', () => {
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
      view,
    });
    controller.acceptHostMessage({
      type: 'cut:mutation-result',
      clientMutationId: 'session-1:1',
      succeeded: true,
    });

    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:preview-start',
      documentUri: view.documentUri,
      sessionId: view.sessionId,
      timelineTimeSeconds: 1.5,
      previewRequestId: 'session-1:preview:1',
      playbackMode: 'playing',
    });
    expect(store.getState().isPlaying).toBe(true);
  });

  it('assigns one exact identity to each rapid preview request', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    expect(controller.startPreview(1)).toBe('session-1:preview:1');
    expect(controller.startPreview(2)).toBe('session-1:preview:2');

    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'cut:preview-start',
        previewRequestId: 'session-1:preview:2',
      }),
    );
  });

  it('projects a retained same-Clip video identity when resuming PCM playback', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.startPreview(2, 'clip-1');

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'cut:preview-start',
        timelineTimeSeconds: 2,
        retainedVideoClipId: 'clip-1',
      }),
    );
  });

  it('requests a paused preview previewRequestId without changing transport to playing', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.startPreview(3, undefined, 'paused');

    expect(store.getState().isPlaying).toBe(false);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'cut:preview-start',
        timelineTimeSeconds: 3,
        playbackMode: 'paused',
      }),
    );
  });

  it('distinguishes retaining a paused video from fully stopping preview resources', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    const preparedRequestId = controller.startPreview(3, undefined, 'paused');
    controller.pausePreview(preparedRequestId);
    controller.stopPreview();

    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:preview-pause',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      previewRequestId: 'session-1:preview:2',
      preparedRequestId,
    });
    expect(postMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'cut:preview-stop',
        previewRequestId: 'session-1:preview:3',
      }),
    );
  });

  it('prepares and activates one exact preview previewRequestId at a Clip boundary', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.startPreview(0);
    const preparedRequestId = controller.preparePreview(4);
    controller.activatePreview(preparedRequestId);

    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:preview-prepare',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      timelineTimeSeconds: 4,
      previewRequestId: 'session-1:preview:2',
    });
    expect(postMessage).toHaveBeenNthCalledWith(3, {
      type: 'cut:preview-activate',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
      previewRequestId: 'session-1:preview:2',
    });
    expect(() => controller.activatePreview('session-1:preview:1')).toThrow(
      'Cannot activate non-current Cut preview request',
    );
  });

  it('stores only presentation state and clears selection removed by a Host snapshot', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });
    store.getState().actions.select({ kind: 'clip', trackId: 'track-video', clipId: 'clip-1' });

    const next = { ...createView(), tracks: [createView().tracks[0]!] };
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
      results: [
        {
          clipId: 'clip-1',
          kind: 'waveform',
          status: 'ready',
          peaksPerSecond: 1,
          waveform: { peaks: [0.2], durationSeconds: 1, peaksPerSecond: 1 },
        },
      ],
    });

    expect(store.getState().representations.size).toBe(0);
  });

  it('retains unchanged Clip representations across structural Host snapshots', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    const current = createView();
    controller.acceptHostMessage({ type: 'cut:view', view: current });
    controller.requestRepresentations([
      { clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 0 },
    ]);
    controller.acceptHostMessage({
      type: 'cut:representations',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      requestId: 'session-1:representation:1',
      results: [
        {
          clipId: 'clip-1',
          kind: 'thumbnail',
          status: 'ready',
          density: 64,
          tileIndex: 0,
          sourceTimeSeconds: 0,
          dataUrl: 'data:image/png;base64,thumb',
        },
      ],
    });

    const previousTrack = store.getState().view?.tracks[0];
    controller.acceptHostMessage({
      type: 'cut:view',
      view: {
        ...createView(),
        tracks: [
          ...createView().tracks,
          { trackId: 'track-audio', name: 'Audio 1', kind: 'Audio', items: [] },
        ],
      },
    });

    expect(store.getState().representations.get('clip-1:thumbnail:64:0')).toMatchObject({
      clipId: 'clip-1',
      status: 'ready',
    });
    expect(store.getState().view?.tracks[0]).toBe(previousTrack);
  });

  it('merges overlapping representation batches that complete out of order', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const current = createView();
    controller.acceptHostMessage({ type: 'cut:view', view: current });

    controller.requestRepresentations([
      { clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 0 },
    ]);
    controller.requestRepresentations([
      { clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 0 },
      { clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 1 },
    ]);

    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestId: 'session-1:representation:2',
        requests: [{ clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 1 }],
      }),
    );
    controller.acceptHostMessage({
      type: 'cut:representations',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      requestId: 'session-1:representation:2',
      results: [thumbnailResult(1)],
    });
    controller.acceptHostMessage({
      type: 'cut:representations',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      requestId: 'session-1:representation:1',
      results: [thumbnailResult(0)],
    });

    expect([...store.getState().representations.keys()]).toEqual([
      'clip-1:thumbnail:64:1',
      'clip-1:thumbnail:64:0',
    ]);
  });

  it('retries failed media representations once before settling as unavailable', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    const current = createView();
    controller.acceptHostMessage({ type: 'cut:view', view: current });
    const request = {
      clipId: 'clip-1',
      kind: 'thumbnail' as const,
      density: 64 as const,
      tileIndex: 0,
    };

    controller.requestRepresentations([request]);
    controller.acceptHostMessage({
      type: 'cut:representation-failed',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      requestId: 'session-1:representation:1',
      diagnostic: { code: 'media-runtime-unavailable' },
    });

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'session-1:representation:2', requests: [request] }),
    );
    controller.acceptHostMessage({
      type: 'cut:representation-failed',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      requestId: 'session-1:representation:2',
      diagnostic: { code: 'media-runtime-unavailable' },
    });

    expect(store.getState().diagnostic).toEqual({ code: 'media-runtime-unavailable' });
    expect(store.getState().representations.get('clip-1:thumbnail:64:0')).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('thumbnail'),
    });
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('stores independent thumbnail tiles and rejects the removed Clip-wide result schema', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    const current = createView();
    controller.acceptHostMessage({ type: 'cut:view', view: current });
    controller.requestRepresentations([
      { clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 0 },
      { clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 1 },
    ]);

    controller.acceptHostMessage({
      type: 'cut:representations',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      requestId: 'session-1:representation:1',
      results: [
        {
          clipId: 'clip-1',
          kind: 'thumbnail',
          status: 'ready',
          density: 64,
          tileIndex: 0,
          sourceTimeSeconds: 0.5,
          dataUrl: 'data:image/jpeg;base64,tile-0',
        },
        {
          clipId: 'clip-1',
          kind: 'thumbnail',
          status: 'ready',
          density: 64,
          tileIndex: 1,
          sourceTimeSeconds: 2.5,
          dataUrl: 'data:image/jpeg;base64,tile-1',
        },
      ],
    });

    expect([...store.getState().representations.keys()]).toEqual([
      'clip-1:thumbnail:64:0',
      'clip-1:thumbnail:64:1',
    ]);
    controller.requestRepresentations([
      { clipId: 'clip-1', kind: 'thumbnail', density: 64, tileIndex: 2 },
    ]);
    expect(() =>
      controller.acceptHostMessage({
        type: 'cut:representations',
        documentUri: current.documentUri,
        sessionId: current.sessionId,
        requestId: 'session-1:representation:2',
        results: [
          {
            clipId: 'clip-1',
            kind: 'thumbnail',
            status: 'ready',
            thumbnails: [{ sourceTimeSeconds: 0, dataUrl: 'data:image/jpeg;base64,invalid' }],
          },
        ],
      }),
    ).toThrow('invalid Clip representations');
  });

  it('bounds the disposable thumbnail tile cache', () => {
    const store = createCutPresentationStore();
    const controller = new CutOtioController(store, { postMessage: vi.fn() });
    const current = createView();
    controller.acceptHostMessage({ type: 'cut:view', view: current });
    const requests = Array.from({ length: 257 }, (_, tileIndex) => ({
      clipId: 'clip-1',
      kind: 'thumbnail' as const,
      density: 64 as const,
      tileIndex,
    }));
    controller.requestRepresentations(requests);

    controller.acceptHostMessage({
      type: 'cut:representations',
      documentUri: current.documentUri,
      sessionId: current.sessionId,
      requestId: 'session-1:representation:1',
      results: requests.map(({ tileIndex }) => ({
        clipId: 'clip-1',
        kind: 'thumbnail',
        status: 'ready',
        density: 64,
        tileIndex,
        sourceTimeSeconds: tileIndex,
        dataUrl: `data:image/jpeg;base64,${tileIndex}`,
      })),
    });

    expect(store.getState().representations.size).toBe(256);
    expect(store.getState().representations.has('clip-1:thumbnail:64:0')).toBe(false);
    expect(store.getState().representations.has('clip-1:thumbnail:64:256')).toBe(true);
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
      previewRequestId: 'session-1:preview:1',
      timelineTimeSeconds: 2,
      segmentEndSeconds: 4,
      playbackEndSeconds: 4,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      audioStreams: [
        {
          streamUrl: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
      audioGainsDb: [0],
      audioPlayback: [
        {
          mediaOriginSeconds: 2,
          playbackRate: 1,
          positionSeconds: 2,
          clipDurationSeconds: 4,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
        },
      ],
    };

    expect(controller.acceptHostMessage(message)).toBe(true);
    expect(onPreviewReady).toHaveBeenCalledWith(message);
  });

  it('accepts only OpenNeko native video descriptors', () => {
    const store = createCutPresentationStore();
    const onPreviewReady = vi.fn();
    const controller = new CutOtioController(store, { postMessage: vi.fn() }, { onPreviewReady });
    const message = {
      type: 'cut:preview-ready',
      previewRequestId: 'session-1:preview:1',
      videoClipId: 'clip-1',
      timelineTimeSeconds: 2,
      segmentEndSeconds: 4,
      playbackEndSeconds: 4,
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      video: {
        url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        mimeType: 'video/mp4; codecs="avc1.640029"',
        preparationProfile: 'h264-mp4-direct',
        mediaTimeOriginSeconds: 5,
        durationSeconds: 2,
      },
      audioStreams: [],
      audioGainsDb: [],
      audioPlayback: [],
    };

    expect(controller.acceptHostMessage(message)).toBe(true);
    expect(
      controller.acceptHostMessage({
        ...message,
        previewRequestId: 'session-1:preview:2',
        video: { ...message.video, url: 'https://example.com/video.mp4' },
      }),
    ).toBe(false);
    expect(onPreviewReady).toHaveBeenCalledTimes(1);
  });

  it('projects background export task state and keeps task control Host-owned', () => {
    const store = createCutPresentationStore();
    const postMessage = vi.fn();
    const controller = new CutOtioController(store, { postMessage });
    controller.acceptHostMessage({ type: 'cut:view', view: createView() });

    controller.startExport({
      outputName: 'Project',
      container: 'mp4',
      width: 1280,
      height: 720,
      framesPerSecond: 24,
      videoBitrate: 8_000_000,
      includeAudio: true,
      audioBitrate: 192_000,
      audioSampleRate: 48_000,
    });
    controller.acceptHostMessage({
      type: 'cut:export-task',
      task: {
        jobId: 'job-1',
        documentUri: 'file:///workspace/project.otio',
        sessionId: 'session-1',
        sourceSnapshotId: 'export-request-1',
        settings: {
          outputName: 'Project',
          container: 'mp4',
          width: 1280,
          height: 720,
          framesPerSecond: 24,
          videoBitrate: 8_000_000,
          includeAudio: true,
          audioBitrate: 192_000,
          audioSampleRate: 48_000,
        },
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
      settings: {
        outputName: 'Project',
        container: 'mp4',
        width: 1280,
        height: 720,
        framesPerSecond: 24,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioBitrate: 192_000,
        audioSampleRate: 48_000,
      },
    });
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      type: 'cut:export-cancel',
      documentUri: 'file:///workspace/project.otio',
      sessionId: 'session-1',
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
      selection: {
        kind: 'clip',
        trackId: 'track-video',
        clipId: 'clip-1',
      },
    });
  });
});

function thumbnailResult(tileIndex: number) {
  return {
    clipId: 'clip-1',
    kind: 'thumbnail' as const,
    status: 'ready' as const,
    density: 64 as const,
    tileIndex,
    sourceTimeSeconds: tileIndex,
    dataUrl: `data:image/jpeg;base64,tile-${tileIndex}`,
  };
}

function createView(): TimelineView {
  return {
    documentUri: 'file:///workspace/project.otio',
    sessionId: 'session-1',
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

function createViewWithTrailingGap(): TimelineView {
  const view = createView();
  const track = view.tracks[0];
  if (!track) throw new Error('Track fixture is missing.');
  return {
    ...view,
    durationSeconds: 13,
    tracks: [
      {
        ...track,
        items: [
          ...track.items,
          {
            kind: 'gap',
            startSeconds: 3,
            durationSeconds: 10,
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
