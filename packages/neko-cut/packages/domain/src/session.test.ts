import { describe, expect, it } from 'vitest';
import {
  CutCommandError,
  CutDocumentSession,
  CutDocumentSessionError,
  applyCutCommand,
  createOtioTimeline,
  parseOtio,
  projectTimelineView,
  serializeOtio,
  type CutCommand,
  type CutDocumentStorage,
  type OtioTimeline,
} from '.';

describe('Cut Core commands', () => {
  it('changes the project Canvas while preserving the edit rate and serializable OTIO metadata', () => {
    const document = applyCutCommand(emptyTimeline(), {
      type: 'set-project-canvas',
      profile: 'short-video-1080p',
      width: 1080,
      height: 1920,
    });

    expect(
      projectTimelineView({
        document,
        documentUri: 'file:///workspace/demo.otio',
        sessionId: 'session-canvas',
        revision: 1,
      }).profile,
    ).toEqual({
      profile: 'short-video-1080p',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1080,
      height: 1920,
    });
    expect(parseOtio(serializeOtio(document))).toMatchObject({ ok: true });
  });

  it('rejects invalid project Canvas dimensions before mutation', () => {
    expect(() =>
      applyCutCommand(emptyTimeline(), {
        type: 'set-project-canvas',
        profile: 'invalid',
        width: 0,
        height: 1080,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid-command' }));
  });

  it('links, edits, separates, manually mutes, unseparates and ripple deletes', () => {
    let document = emptyTimeline();
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'video-1',
      name: 'Shot',
      targetUrl: '../../neko/assets/shot.mp4',
      durationFrames: 90,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'separate-audio',
      videoClipId: 'video-1',
      audioClipId: 'audio-1',
      audioTrackId: 'audio-track-1',
    });
    document = applyCutCommand(document, {
      type: 'set-audio',
      clipId: 'video-1',
      settings: { muted: true },
    });

    const linkedVideo = document.tracks.children[0]?.children[0];
    const linkedAudio = document.tracks.children[1]?.children[0];
    expect(linkedVideo).toMatchObject({
      metadata: {
        openneko: {
          cut: { clipId: 'video-1' },
          link: { linkedAudioClipId: 'audio-1' },
          audio: { muted: true },
        },
      },
    });
    expect(linkedAudio).toMatchObject({
      media_reference: { target_url: '../../neko/assets/shot.mp4' },
      metadata: {
        openneko: {
          cut: { clipId: 'audio-1' },
          link: { linkedVideoClipId: 'video-1' },
          audio: { muted: false, gainDb: 0 },
        },
      },
    });

    document = applyCutCommand(document, { type: 'unseparate-audio', videoClipId: 'video-1' });
    expect(document.tracks.children[1]?.children).toHaveLength(0);
    expect(document.tracks.children[0]?.children[0]).toMatchObject({
      metadata: { openneko: { cut: { clipId: 'video-1' }, audio: { muted: true } } },
    });

    document = applyCutCommand(document, { type: 'ripple-delete', clipId: 'video-1' });
    expect(document.tracks.children[0]?.children).toHaveLength(0);
  });

  it('keeps linked separation serializable after coupled source-range editing', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'video-1',
      name: 'Shot',
      targetUrl: '../../neko/assets/shot.mp4',
      durationFrames: 90,
      availableDurationFrames: 120,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'separate-audio',
      videoClipId: 'video-1',
      audioClipId: 'audio-1',
      audioTrackId: 'audio-track-1',
    });

    document = applyCutCommand(document, {
      type: 'set-clip-duration',
      clipId: 'video-1',
      durationFrames: 60,
      rate: 30,
    });

    expect(() => serializeOtio(document)).not.toThrow();
    expect(document.tracks.children[0]?.children[0]?.source_range).toEqual(
      document.tracks.children[1]?.children[0]?.source_range,
    );
  });

  it('splits, trims, inserts gaps and reorders with visible contract failures', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'clip-1',
      name: 'Shot',
      targetUrl: 'shot.mp4',
      durationFrames: 90,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'split',
      clipId: 'clip-1',
      offsetFrames: 30,
      rightClipId: 'clip-2',
    });
    document = applyCutCommand(document, {
      type: 'trim',
      clipId: 'clip-2',
      startDeltaFrames: 15,
      endDeltaFrames: 15,
    });
    document = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 1,
      durationFrames: 15,
      rate: 30,
    });
    document = applyCutCommand(document, {
      type: 'move-item',
      fromTrackId: 'video-1',
      fromIndex: 2,
      toTrackId: 'video-1',
      toIndex: 1,
    });

    expect(document.tracks.children[0]?.children).toMatchObject([
      {
        metadata: { openneko: { cut: { clipId: 'clip-1' } } },
        source_range: { duration: { value: 30 } },
      },
      {
        metadata: { openneko: { cut: { clipId: 'clip-2' } } },
        source_range: { start_time: { value: 45 }, duration: { value: 30 } },
      },
      { OTIO_SCHEMA: 'Gap.1', source_range: { duration: { value: 15 } } },
    ]);
    expect(() =>
      applyCutCommand(document, {
        type: 'trim',
        clipId: 'clip-2',
        startDeltaFrames: 30,
        endDeltaFrames: 0,
      }),
    ).toThrow(CutCommandError);
    expect(() =>
      applyCutCommand(document, {
        type: 'trim',
        clipId: 'clip-2',
        startDeltaFrames: 0.5,
        endDeltaFrames: 0,
      }),
    ).toThrow('whole project frames');
  });

  it('persists constant speed, bounds duration and places Clips through normalized Gaps', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'clip-a',
      name: 'A',
      targetUrl: 'a.mp4',
      durationFrames: 60,
      availableDurationFrames: 120,
      rate: 30,
      trackId: 'video-1',
    });
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'clip-b',
      name: 'B',
      targetUrl: 'b.mp4',
      durationFrames: 30,
      availableDurationFrames: 90,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'set-playback-rate',
      clipId: 'clip-a',
      playbackRate: 2,
    });
    expect(document.tracks.children[0]?.children[0]).toMatchObject({
      effects: [{ OTIO_SCHEMA: 'LinearTimeWarp.1', time_scalar: 2 }],
    });

    document = applyCutCommand(document, {
      type: 'set-clip-duration',
      clipId: 'clip-a',
      durationFrames: 45,
      rate: 30,
    });
    expect(document.tracks.children[0]?.children[0]).toMatchObject({
      source_range: { duration: { value: 90 } },
    });

    document = applyCutCommand(document, {
      type: 'place-clip',
      clipId: 'clip-b',
      toTrackId: 'video-1',
      timelineStartFrames: 90,
      rate: 30,
      sourcePolicy: 'preserve-gap',
      overlapPolicy: 'reject',
    });
    expect(document.tracks.children[0]?.children).toMatchObject([
      { metadata: { openneko: { cut: { clipId: 'clip-a' } } } },
      { OTIO_SCHEMA: 'Gap.1', source_range: { duration: { value: 45 } } },
      { metadata: { openneko: { cut: { clipId: 'clip-b' } } } },
    ]);
    expect(() =>
      applyCutCommand(document, {
        type: 'set-clip-duration',
        clipId: 'clip-a',
        durationFrames: 61,
        rate: 30,
      }),
    ).toThrow('available range');
    try {
      applyCutCommand(document, {
        type: 'place-clip',
        clipId: 'clip-b',
        toTrackId: 'video-1',
        timelineStartFrames: 10,
        rate: 30,
        sourcePolicy: 'preserve-gap',
        overlapPolicy: 'reject',
      });
      throw new Error('Expected overlapping placement to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(CutCommandError);
      expect(error).toMatchObject({ code: 'clip-placement-overlap' });
    }
  });

  it('inserts a dragged Clip before or after the overlapped Clip instead of rejecting it', () => {
    let document = emptyTimeline();
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'clip-a',
      name: 'A',
      targetUrl: '../a.mp4',
      durationFrames: 30,
      rate: 30,
      trackId: 'video-1',
    });
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'clip-b',
      name: 'B',
      targetUrl: '../b.mp4',
      durationFrames: 30,
      rate: 30,
      trackId: 'video-1',
    });
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'clip-c',
      name: 'C',
      targetUrl: '../c.mp4',
      durationFrames: 30,
      rate: 30,
      trackId: 'video-1',
    });

    document = applyCutCommand(document, {
      type: 'place-clip',
      clipId: 'clip-c',
      toTrackId: 'video-1',
      timelineStartFrames: 10,
      rate: 30,
      sourcePolicy: 'ripple',
      overlapPolicy: 'insert',
    });
    expect(
      document.tracks.children[0]?.children.map((item) =>
        item.OTIO_SCHEMA === 'Clip.2' ? item.name : item.OTIO_SCHEMA,
      ),
    ).toEqual(['C', 'A', 'B']);

    document = applyCutCommand(document, {
      type: 'place-clip',
      clipId: 'clip-c',
      toTrackId: 'video-1',
      timelineStartFrames: 50,
      rate: 30,
      sourcePolicy: 'ripple',
      overlapPolicy: 'insert',
    });
    expect(
      document.tracks.children[0]?.children.map((item) =>
        item.OTIO_SCHEMA === 'Clip.2' ? item.name : item.OTIO_SCHEMA,
      ),
    ).toEqual(['A', 'C', 'B']);
  });

  it('distinguishes sequence ripple placement from exact preserve-gap placement', () => {
    let document = emptyTimeline();
    for (const [clipId, name] of [
      ['clip-a', 'A'],
      ['clip-b', 'B'],
      ['clip-c', 'C'],
    ] as const) {
      document = linkMediaForTest(document, {
        type: 'link-media',
        clipId,
        name,
        targetUrl: `../${name.toLowerCase()}.mp4`,
        durationFrames: 30,
        rate: 30,
        trackId: 'video-1',
      });
    }

    const withTrailingGap = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 3,
      durationFrames: 300,
      rate: 30,
    });
    const sequenced = applyCutCommand(withTrailingGap, {
      type: 'place-clip',
      clipId: 'clip-a',
      toTrackId: 'video-1',
      timelineStartFrames: 390,
      rate: 30,
      sourcePolicy: 'ripple',
      overlapPolicy: 'insert',
    });
    expect(
      sequenced.tracks.children[0]?.children.map((item) =>
        item.OTIO_SCHEMA === 'Clip.2' ? item.name : item.OTIO_SCHEMA,
      ),
    ).toEqual(['B', 'C', 'A']);

    const positioned = applyCutCommand(document, {
      type: 'place-clip',
      clipId: 'clip-a',
      toTrackId: 'video-1',
      timelineStartFrames: 120,
      rate: 30,
      sourcePolicy: 'preserve-gap',
      overlapPolicy: 'reject',
    });
    expect(
      positioned.tracks.children[0]?.children.map((item) =>
        item.OTIO_SCHEMA === 'Clip.2'
          ? item.name
          : `${item.OTIO_SCHEMA}:${item.source_range.duration.value}`,
      ),
    ).toEqual(['Gap.1:30', 'B', 'C', 'Gap.1:30', 'A']);
  });

  it('removes trailing and internal Gaps from a Track changed by ripple delete', () => {
    let document = emptyTimeline();
    for (const [clipId, name] of [
      ['clip-a', 'A'],
      ['clip-b', 'B'],
    ] as const) {
      document = linkMediaForTest(document, {
        type: 'link-media',
        clipId,
        name,
        targetUrl: `../${name.toLowerCase()}.mp4`,
        durationFrames: 30,
        rate: 30,
        trackId: 'video-1',
      });
    }
    document = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 1,
      durationFrames: 60,
      rate: 30,
    });
    document = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 3,
      durationFrames: 300,
      rate: 30,
    });

    const deleted = applyCutCommand(document, { type: 'ripple-delete', clipId: 'clip-b' });
    expect(
      deleted.tracks.children[0]?.children.map((item) =>
        item.OTIO_SCHEMA === 'Clip.2' ? item.name : item.OTIO_SCHEMA,
      ),
    ).toEqual(['A']);
  });

  it('trims trailing Gaps across Tracks without shifting internal synchronization Gaps', () => {
    let document = emptyTimeline();
    for (const [clipId, name] of [
      ['clip-a', 'A'],
      ['clip-b', 'B'],
    ] as const) {
      document = linkMediaForTest(document, {
        type: 'link-media',
        clipId,
        name,
        targetUrl: `../${name.toLowerCase()}.mp4`,
        durationFrames: 30,
        rate: 30,
        trackId: 'video-1',
      });
    }
    document = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 1,
      durationFrames: 60,
      rate: 30,
    });
    document = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 3,
      durationFrames: 300,
      rate: 30,
    });
    document = applyCutCommand(document, {
      type: 'add-track',
      trackId: 'audio-1',
      trackKind: 'Audio',
      name: 'Audio 1',
    });
    document = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'audio-1',
      index: 0,
      durationFrames: 600,
      rate: 30,
    });

    const trimmed = applyCutCommand(document, { type: 'trim-trailing-gaps' });
    expect(
      trimmed.tracks.children.map((track) =>
        track.children.map((item) =>
          item.OTIO_SCHEMA === 'Clip.2'
            ? item.name
            : `${item.OTIO_SCHEMA}:${item.source_range.duration.value}`,
        ),
      ),
    ).toEqual([['A', 'Gap.1:60', 'B'], []]);
  });

  it('rejects trailing Gap trim when an affected Track is locked', () => {
    let document = applyCutCommand(emptyTimeline(), {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 0,
      durationFrames: 30,
      rate: 30,
    });
    document = applyCutCommand(document, {
      type: 'set-track-locked',
      trackId: 'video-1',
      locked: true,
    });

    expect(() => applyCutCommand(document, { type: 'trim-trailing-gaps' })).toThrowError(
      expect.objectContaining({ code: 'locked' }),
    );
  });

  it('inserts linked media at an explicit time instead of always appending', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'clip-a',
      name: 'A',
      targetUrl: '../a.mp4',
      durationFrames: 30,
      rate: 30,
      trackId: 'video-1',
      timelineStartFrames: 60,
      overlapPolicy: 'reject',
    });
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'clip-b',
      name: 'B',
      targetUrl: '../b.mp4',
      durationFrames: 30,
      rate: 30,
      trackId: 'video-1',
      timelineStartFrames: 0,
      overlapPolicy: 'reject',
    });

    expect(
      document.tracks.children[0]?.children.map((item) =>
        item.OTIO_SCHEMA === 'Clip.2' ? item.name : `Gap:${item.source_range.duration.value}`,
      ),
    ).toEqual(['B', 'Gap:30', 'A']);
  });

  it('appends an ordered Canvas media/gap route as one command', () => {
    const document = applyCutCommand(emptyTimeline(), {
      type: 'append-route',
      items: [
        {
          kind: 'media',
          clipId: 'route-clip-1',
          name: 'Opening',
          targetUrl: '../media/opening.mp4',
          durationFrames: 60,
          rate: 30,
        },
        { kind: 'gap', durationFrames: 15, rate: 30 },
      ],
    });

    expect(document.tracks.children[0]?.children).toMatchObject([
      {
        OTIO_SCHEMA: 'Clip.2',
        media_reference: { target_url: '../media/opening.mp4' },
        metadata: { openneko: { cut: { clipId: 'route-clip-1' } } },
      },
      { OTIO_SCHEMA: 'Gap.1', source_range: { duration: { value: 15 } } },
    ]);
    expect(() =>
      applyCutCommand(emptyTimeline(), {
        type: 'append-route',
        items: [
          {
            kind: 'media',
            clipId: 'duplicate',
            name: 'A',
            targetUrl: 'a.mp4',
            durationFrames: 30,
            rate: 30,
          },
          {
            kind: 'media',
            clipId: 'duplicate',
            name: 'B',
            targetUrl: 'b.mp4',
            durationFrames: 30,
            rate: 30,
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'identity-conflict' }));
  });

  it('enforces 1 video + 3 audio + 1 subtitle and targets moves by stable trackId', () => {
    let document = emptyTimeline();
    for (const [trackId, name] of [
      ['audio-track-1', 'Audio 1'],
      ['audio-track-2', 'Audio 2'],
      ['audio-track-3', 'Audio 3'],
    ] as const) {
      document = applyCutCommand(document, {
        type: 'add-track',
        trackId,
        trackKind: 'Audio',
        name,
      });
    }
    document = applyCutCommand(document, {
      type: 'add-track',
      trackId: 'subtitle-track-1',
      trackKind: 'Subtitle',
      name: 'Subtitle 1',
    });
    expect(document.tracks.children.map((track) => track.kind)).toEqual([
      'Video',
      'Audio',
      'Audio',
      'Audio',
      'Subtitle',
    ]);
    expect(() =>
      applyCutCommand(document, {
        type: 'add-track',
        trackId: 'audio-track-4',
        trackKind: 'Audio',
        name: 'Audio 4',
      }),
    ).toThrowError(expect.objectContaining({ code: 'track-limit' }));

    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'audio-clip-1',
      name: 'Music',
      targetUrl: 'music.wav',
      durationFrames: 60,
      rate: 30,
      trackId: 'audio-track-1',
    });
    document = applyCutCommand(document, {
      type: 'move-item',
      fromTrackId: 'audio-track-1',
      fromIndex: 0,
      toTrackId: 'audio-track-3',
      toIndex: 0,
    });
    expect(document.tracks.children[1]?.children).toHaveLength(0);
    expect(document.tracks.children[3]?.children[0]).toMatchObject({
      metadata: { openneko: { cut: { clipId: 'audio-clip-1' } } },
    });
    expect(() =>
      applyCutCommand(document, {
        type: 'move-item',
        fromTrackId: 'audio-track-3',
        fromIndex: 0,
        toTrackId: 'subtitle-track-1',
        toIndex: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'incompatible-track' }));
  });

  it('persists independent Clip/Track participation and rejects edits through locked content', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'clip-1',
      name: 'Shot',
      targetUrl: 'shot.mp4',
      durationFrames: 90,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'set-clip-enabled',
      clipId: 'clip-1',
      enabled: false,
    });
    document = applyCutCommand(document, {
      type: 'set-track-enabled',
      trackId: 'video-1',
      enabled: false,
    });
    document = applyCutCommand(document, {
      type: 'set-track-muted',
      trackId: 'video-1',
      muted: true,
    });
    document = applyCutCommand(document, {
      type: 'set-clip-locked',
      clipId: 'clip-1',
      locked: true,
    });

    expect(document.tracks.children[0]).toMatchObject({
      enabled: false,
      metadata: {
        openneko: {
          cut: { trackId: 'video-1' },
          audio: { muted: true },
        },
      },
      children: [
        {
          enabled: false,
          metadata: { openneko: { cut: { clipId: 'clip-1', locked: true } } },
        },
      ],
    });
    expect(() =>
      applyCutCommand(document, { type: 'rename-clip', clipId: 'clip-1', name: 'Blocked' }),
    ).toThrowError(expect.objectContaining({ code: 'locked' }));
    expect(
      projectTimelineView({
        document,
        documentUri: 'file:///workspace/cut.otio',
        sessionId: 'session-1',
        revision: 4,
      }).tracks[0],
    ).toMatchObject({ enabled: false, audioMuted: true });

    document = applyCutCommand(document, {
      type: 'set-clip-locked',
      clipId: 'clip-1',
      locked: false,
    });
    document = applyCutCommand(document, {
      type: 'set-track-locked',
      trackId: 'video-1',
      locked: true,
    });
    document = applyCutCommand(document, {
      type: 'set-track-muted',
      trackId: 'video-1',
      muted: false,
    });
    expect(() =>
      applyCutCommand(document, {
        type: 'trim',
        clipId: 'clip-1',
        startDeltaFrames: 1,
        endDeltaFrames: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'locked' }));
  });

  it('duplicates a Clip with a new stable identity', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'clip-1',
      name: 'Shot',
      targetUrl: 'shot.mp4',
      durationFrames: 90,
      rate: 30,
      trackId: 'video-1',
    });

    document = applyCutCommand(document, {
      type: 'duplicate-clip',
      clipId: 'clip-1',
      duplicateClipId: 'clip-2',
    });

    expect(document.tracks.children[0]?.children).toMatchObject([
      { metadata: { openneko: { cut: { clipId: 'clip-1' } } } },
      { metadata: { openneko: { cut: { clipId: 'clip-2' } } } },
    ]);
    expect(() => serializeOtio(document)).not.toThrow();
  });

  it('clones multiple Clips directly at absolute times without shifting their sources', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'clip-a',
      name: 'A',
      targetUrl: 'a.mp4',
      durationFrames: 18,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 1,
      durationFrames: 120,
      rate: 30,
    });
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'clip-b',
      name: 'B',
      targetUrl: 'b.mp4',
      durationFrames: 638,
      rate: 30,
      trackId: 'video-1',
    });

    document = applyCutCommand(document, {
      type: 'clone-clip-at-time',
      clipId: 'clip-a',
      duplicateClipId: 'copy-a',
      timelineStartFrames: 776,
      rate: 30,
    });
    document = applyCutCommand(document, {
      type: 'clone-clip-at-time',
      clipId: 'clip-b',
      duplicateClipId: 'copy-b',
      timelineStartFrames: 914,
      rate: 30,
    });

    const clips = projectTimelineView({
      document,
      documentUri: 'file:///workspace/cut.otio',
      sessionId: 'session-1',
      revision: 1,
    }).tracks[0]?.items.filter((item) => item.kind === 'clip');
    expect(clips).toHaveLength(4);
    expect(clips?.map((clip) => clip.clipId)).toEqual(['clip-a', 'clip-b', 'copy-a', 'copy-b']);
    expect(clips?.map((clip) => clip.startSeconds)).toEqual([
      0,
      4.6,
      776 / 30,
      expect.closeTo(914 / 30),
    ]);
    expect(() => serializeOtio(document)).not.toThrow();
  });

  it('clones linked Video and Audio Clips with reciprocal new identities', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'video-1',
      name: 'Shot',
      targetUrl: 'shot.mp4',
      durationFrames: 90,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'separate-audio',
      videoClipId: 'video-1',
      audioClipId: 'audio-1',
      audioTrackId: 'audio-track-1',
    });

    document = applyCutCommand(document, {
      type: 'clone-clip-at-time',
      clipId: 'video-1',
      duplicateClipId: 'video-2',
      duplicateLinkedClipId: 'audio-2',
      timelineStartFrames: 90,
      linkedTimelineStartFrames: 90,
      rate: 30,
    });

    expect(document.tracks.children[0]?.children[1]).toMatchObject({
      metadata: {
        openneko: {
          cut: { clipId: 'video-2' },
          link: { linkedAudioClipId: 'audio-2' },
        },
      },
    });
    expect(document.tracks.children[1]?.children[1]).toMatchObject({
      metadata: {
        openneko: {
          cut: { clipId: 'audio-2' },
          link: { linkedVideoClipId: 'video-2' },
        },
      },
    });
    expect(() => serializeOtio(document)).not.toThrow();
  });

  it('removes only an explicitly addressed Gap from an unlocked Track', () => {
    let document = applyCutCommand(emptyTimeline(), {
      type: 'insert-gap',
      trackId: 'video-1',
      index: 0,
      durationFrames: 30,
      rate: 30,
    });

    document = applyCutCommand(document, {
      type: 'remove-gap',
      trackId: 'video-1',
      itemIndex: 0,
    });

    expect(document.tracks.children[0]?.children).toEqual([]);
    expect(() =>
      applyCutCommand(document, {
        type: 'remove-gap',
        trackId: 'video-1',
        itemIndex: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid-command' }));
  });

  it('projects the complete media available range for reversible edge trim', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'clip-1',
      name: 'Shot',
      targetUrl: 'shot.mp4',
      durationFrames: 90,
      availableDurationFrames: 120,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'trim',
      clipId: 'clip-1',
      startDeltaFrames: 15,
      endDeltaFrames: 15,
    });

    const view = projectTimelineView({
      document,
      documentUri: 'file:///workspace/cut.otio',
      sessionId: 'session-1',
      revision: 2,
    });

    expect(view.tracks[0]?.items[0]).toMatchObject({
      sourceAvailableStartSeconds: 0,
      sourceAvailableDurationSeconds: 4,
      sourceStartSeconds: 0.5,
      durationSeconds: 2,
    });
  });

  it('preserves a legacy Clip source range when its first trim creates available range metadata', () => {
    let document = applyCutCommand(emptyTimeline(), {
      type: 'append-route',
      items: [
        {
          kind: 'media',
          clipId: 'legacy-clip',
          name: 'Legacy',
          targetUrl: 'legacy.mp4',
          durationFrames: 90,
          rate: 30,
        },
      ],
    });
    const clip = document.tracks.children[0]?.children[0];
    if (!clip || clip.OTIO_SCHEMA !== 'Clip.2') throw new Error('Legacy Clip fixture missing.');
    document = {
      ...document,
      tracks: {
        ...document.tracks,
        children: [
          {
            ...document.tracks.children[0]!,
            children: [
              {
                ...clip,
                media_reference: {
                  OTIO_SCHEMA: clip.media_reference.OTIO_SCHEMA,
                  target_url: clip.media_reference.target_url,
                  metadata: clip.media_reference.metadata,
                },
              },
            ],
          },
        ],
      },
    };

    document = applyCutCommand(document, {
      type: 'trim',
      clipId: 'legacy-clip',
      startDeltaFrames: 0,
      endDeltaFrames: 15,
    });
    let view = projectTimelineView({
      document,
      documentUri: 'file:///workspace/cut.otio',
      sessionId: 'session-1',
      revision: 1,
    });
    expect(view.tracks[0]?.items[0]).toMatchObject({
      durationSeconds: 2.5,
      sourceAvailableStartSeconds: 0,
      sourceAvailableDurationSeconds: 3,
    });

    document = applyCutCommand(document, {
      type: 'trim',
      clipId: 'legacy-clip',
      startDeltaFrames: 0,
      endDeltaFrames: -15,
    });
    view = projectTimelineView({
      document,
      documentUri: 'file:///workspace/cut.otio',
      sessionId: 'session-1',
      revision: 2,
    });
    expect(view.tracks[0]?.items[0]).toMatchObject({ durationSeconds: 3 });
  });

  it('renames, reorders and removes a non-empty optional Track without dangling links', () => {
    let document = linkMediaForTest(emptyTimeline(), {
      type: 'link-media',
      clipId: 'video-1',
      name: 'Shot',
      targetUrl: 'shot.mp4',
      durationFrames: 90,
      rate: 30,
      trackId: 'video-1',
    });
    document = applyCutCommand(document, {
      type: 'separate-audio',
      videoClipId: 'video-1',
      audioClipId: 'audio-1',
      audioTrackId: 'audio-track-1',
    });
    document = applyCutCommand(document, {
      type: 'rename-track',
      trackId: 'audio-track-1',
      name: 'Dialogue',
    });
    document = applyCutCommand(document, {
      type: 'move-track',
      trackId: 'audio-track-1',
      toIndex: 0,
    });
    expect(document.tracks.children[0]).toMatchObject({
      name: 'Dialogue',
      metadata: { openneko: { cut: { trackId: 'audio-track-1' } } },
    });

    document = applyCutCommand(document, {
      type: 'remove-track',
      trackId: 'audio-track-1',
    });

    expect(document.tracks.children).toHaveLength(1);
    expect(document.tracks.children[0]?.children[0]).toMatchObject({
      metadata: { openneko: { cut: { clipId: 'video-1' } } },
    });
    expect(document.tracks.children[0]?.children[0]?.metadata).not.toMatchObject({
      openneko: { link: expect.anything() },
    });
    expect(() => serializeOtio(document)).not.toThrow();
  });

  it('duplicates an optional Track with new Track and Clip identities', () => {
    let document = applyCutCommand(emptyTimeline(), {
      type: 'add-track',
      trackId: 'audio-1',
      trackKind: 'Audio',
      name: 'Music',
    });
    document = linkMediaForTest(document, {
      type: 'link-media',
      clipId: 'music-1',
      name: 'Theme',
      targetUrl: 'theme.wav',
      durationFrames: 90,
      rate: 30,
      trackId: 'audio-1',
    });

    document = applyCutCommand(document, {
      type: 'duplicate-track',
      trackId: 'audio-1',
      duplicateTrackId: 'audio-2',
      duplicateClipIds: ['music-2'],
    });

    expect(document.tracks.children[2]).toMatchObject({
      name: 'Music Copy',
      metadata: { openneko: { cut: { trackId: 'audio-2' } } },
      children: [{ metadata: { openneko: { cut: { clipId: 'music-2' } } } }],
    });
    expect(() => serializeOtio(document)).not.toThrow();
    expect(() =>
      applyCutCommand(document, {
        type: 'duplicate-track',
        trackId: 'video-1',
        duplicateTrackId: 'video-2',
        duplicateClipIds: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'track-limit' }));
  });
});

describe('CutDocumentSession', () => {
  it('applies a command batch as one serializable revision and one undo step', () => {
    const storage = new MemoryStorage();
    const session = CutDocumentSession.create('file:///workspace/batch.otio', emptyTimeline(), {
      storage,
      createClipId: sequence('normalized'),
      createTrackId: sequence('track'),
      createSessionId: () => 'session-batch',
    });

    const edited = session.applyBatch({
      ...identity(session, 0),
      commands: [
        {
          type: 'link-media',
          clipId: 'clip-1',
          name: 'One',
          targetUrl: 'one.mp4',
          durationFrames: 30,
          rate: 30,
          trackId: 'video-1',
          timelineStartFrames: 0,
          overlapPolicy: 'reject',
        },
        {
          type: 'link-media',
          clipId: 'clip-2',
          name: 'Two',
          targetUrl: 'two.mp4',
          durationFrames: 30,
          rate: 30,
          trackId: 'video-1',
          timelineStartFrames: 30,
          overlapPolicy: 'reject',
        },
      ],
    });

    expect(edited.revision).toBe(1);
    expect(edited.tracks[0]?.items).toHaveLength(2);

    const undone = session.undo(identity(session, 1));
    expect(undone.tracks[0]?.items).toHaveLength(0);
  });

  it('does not mutate or advance revision when any batch command fails', () => {
    const storage = new MemoryStorage();
    const session = CutDocumentSession.create('file:///workspace/batch.otio', emptyTimeline(), {
      storage,
      createClipId: sequence('normalized'),
      createTrackId: sequence('track'),
      createSessionId: () => 'session-batch',
    });

    expect(() =>
      session.applyBatch({
        ...identity(session, 0),
        commands: [
          linkCommand(),
          {
            type: 'rename-clip',
            clipId: 'missing',
            name: 'Invalid',
          },
        ],
      }),
    ).toThrow(CutCommandError);
    expect(session.revision).toBe(0);
    expect(session.view().tracks[0]?.items).toHaveLength(0);
    expect(session.canUndo).toBe(false);
  });

  it('owns revision, projection, save, backup, undo/redo and Webview-independent state', async () => {
    const storage = new MemoryStorage();
    const session = CutDocumentSession.create('file:///workspace/demo.otio', emptyTimeline(), {
      storage,
      createClipId: sequence('normalized'),
      createTrackId: sequence('track'),
      createSessionId: () => 'session-1',
    });

    const edited = session.apply({
      documentUri: session.documentUri,
      sessionId: session.sessionId,
      expectedRevision: 0,
      command: {
        type: 'link-media',
        clipId: 'clip-1',
        name: 'Shot',
        targetUrl: '../media/shot.mp4',
        durationFrames: 60,
        rate: 30,
        trackId: 'video-1',
        timelineStartFrames: 0,
        overlapPolicy: 'reject',
      },
    });
    expect(edited).toMatchObject({ revision: 1, durationSeconds: 2, tracks: [{ kind: 'Video' }] });
    expect(session.dirty).toBe(true);
    Reflect.set(edited.tracks[0]?.items[0] ?? {}, 'name', 'Webview-only mutation');
    expect(session.view().tracks[0]?.items[0]).toMatchObject({ name: 'Shot' });

    const undone = session.undo(identity(session, 1));
    expect(undone.tracks[0]?.items).toHaveLength(0);
    const redone = session.redo(identity(session, 2));
    expect(redone.tracks[0]?.items).toHaveLength(1);

    await session.save();
    expect(session.dirty).toBe(false);
    await session.backup('file:///workspace/.backup/demo.otio');
    expect(storage.has('file:///workspace/.backup/demo.otio')).toBe(true);

    const reopened = await CutDocumentSession.open('file:///workspace/demo.otio', {
      storage,
      createClipId: sequence('open'),
      createTrackId: sequence('track'),
      createSessionId: () => 'session-2',
    });
    expect(reopened.view().tracks[0]?.items).toHaveLength(1);
    expect(reopened.view().sessionId).toBe('session-2');
  });

  it('rejects stale/mismatched commands and dirty external changes without mutation', async () => {
    const storage = new MemoryStorage();
    const session = CutDocumentSession.create('file:///workspace/a.otio', emptyTimeline(), {
      storage,
      createClipId: sequence('clip'),
      createTrackId: sequence('track'),
      createSessionId: () => 'session-a',
    });
    await session.save();

    expect(() =>
      session.apply({
        documentUri: 'file:///workspace/b.otio',
        sessionId: session.sessionId,
        expectedRevision: 0,
        command: linkCommand(),
      }),
    ).toThrowError(expect.objectContaining({ code: 'document-mismatch' }));
    expect(() =>
      session.apply({
        documentUri: session.documentUri,
        sessionId: 'stale-session',
        expectedRevision: 0,
        command: linkCommand(),
      }),
    ).toThrowError(expect.objectContaining({ code: 'session-mismatch' }));

    session.apply({ ...identity(session, 0), command: linkCommand() });
    await expect(session.acceptExternalChange('external-v2')).rejects.toBeInstanceOf(
      CutDocumentSessionError,
    );
    expect(session.view().tracks[0]?.items).toHaveLength(1);
  });

  it('rebases through the supplied Save As boundary and resets document identity history', async () => {
    const storage = new MemoryStorage();
    const session = CutDocumentSession.create('file:///workspace/old/demo.otio', emptyTimeline(), {
      storage,
      createClipId: sequence('clip'),
      createTrackId: sequence('track'),
      createSessionId: () => 'session-save-as',
    });
    session.apply({ ...identity(session, 0), command: linkCommand() });

    await session.saveAs({
      documentUri: 'file:///workspace/new/demo.otio',
      rebase: (document) =>
        applyCutCommand(document, {
          type: 'relink-media',
          clipId: 'clip-1',
          targetUrl: '../media/shot.mp4',
        }),
    });

    expect(session.documentUri).toBe('file:///workspace/new/demo.otio');
    expect(session.dirty).toBe(false);
    expect(session.canUndo).toBe(false);
    const stored = storage.readSync(session.documentUri);
    const parsed = parseOtio(stored.bytes);
    expect(parsed.ok && parsed.document.tracks.children[0]?.children[0]).toMatchObject({
      media_reference: { target_url: '../media/shot.mp4' },
    });
  });
});

function emptyTimeline(): OtioTimeline {
  return createOtioTimeline('Demo', {
    profile: '1080p30',
    editRateNumerator: 30,
    editRateDenominator: 1,
    width: 1920,
    height: 1080,
  });
}

function linkCommand() {
  return {
    type: 'link-media' as const,
    clipId: 'clip-1',
    name: 'Shot',
    targetUrl: 'media/shot.mp4',
    durationFrames: 30,
    rate: 30,
    trackId: 'video-1',
    timelineStartFrames: 0,
    overlapPolicy: 'reject' as const,
  };
}

type LinkMediaTestCommand = Omit<
  Extract<CutCommand, { readonly type: 'link-media' }>,
  'timelineStartFrames' | 'overlapPolicy'
> &
  Partial<
    Pick<
      Extract<CutCommand, { readonly type: 'link-media' }>,
      'timelineStartFrames' | 'overlapPolicy'
    >
  >;

function linkMediaForTest(document: OtioTimeline, command: LinkMediaTestCommand): OtioTimeline {
  if (command.timelineStartFrames !== undefined && command.overlapPolicy !== undefined) {
    return applyCutCommand(document, {
      ...command,
      timelineStartFrames: command.timelineStartFrames,
      overlapPolicy: command.overlapPolicy,
    });
  }
  const view = projectTimelineView({
    document,
    documentUri: 'file:///workspace/test.otio',
    sessionId: 'test-session',
    revision: 0,
  });
  const track = view.tracks.find((candidate) => candidate.trackId === command.trackId);
  if (!track) throw new Error(`Missing test Track ${command.trackId}.`);
  const timelineStartFrames = Math.round(
    track.items.reduce((end, item) => Math.max(end, item.startSeconds + item.durationSeconds), 0) *
      command.rate,
  );
  return applyCutCommand(document, {
    ...command,
    timelineStartFrames,
    overlapPolicy: 'reject',
  });
}

function identity(session: CutDocumentSession, expectedRevision: number) {
  return {
    documentUri: session.documentUri,
    sessionId: session.sessionId,
    expectedRevision,
  };
}

function sequence(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${(index += 1)}`;
}

class MemoryStorage implements CutDocumentStorage {
  private readonly values = new Map<string, { bytes: Uint8Array; version: string }>();
  private version = 0;

  async read(documentUri: string) {
    return this.readSync(documentUri);
  }

  readSync(documentUri: string) {
    const value = this.values.get(documentUri);
    if (!value) throw new Error(`Missing ${documentUri}`);
    return value;
  }

  async write(
    documentUri: string,
    bytes: Uint8Array,
    options: { readonly expectedVersion?: string },
  ) {
    const existing = this.values.get(documentUri);
    if (options.expectedVersion && existing?.version !== options.expectedVersion) {
      throw new Error('version conflict');
    }
    const version = `v${(this.version += 1)}`;
    this.values.set(documentUri, { bytes, version });
    return { version };
  }

  has(documentUri: string): boolean {
    return this.values.has(documentUri);
  }
}
