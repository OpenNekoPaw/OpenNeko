import { describe, expect, it } from 'vitest';
import {
  assignMissingClipIds,
  createLinkedAudioClip,
  createOtioTimeline,
  createTrack,
  parseOtio,
  serializeOtio,
  splitClipIdentity,
  timeRange,
  withAudioSettings,
  withClipIdentity,
  type OtioClip,
  type OtioTimeline,
} from '.';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('lightweight OTIO codec', () => {
  it('round-trips the supported subset and preserves third-party metadata', () => {
    const source = timelineWithClip();
    const bytes = serializeOtio(source);
    const parsed = parseOtio(bytes);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document).toEqual(source);
    expect(parsed.document.metadata['studio']).toEqual({ slate: 'A-001' });
  });

  it('round-trips one bounded OTIO LinearTimeWarp and rejects unsupported speed effects', () => {
    const source = timelineWithClip();
    const clip = source.tracks.children[0]?.children[0];
    if (!clip || clip.OTIO_SCHEMA !== 'Clip.2') throw new Error('Fixture clip missing.');
    const sped: OtioTimeline = {
      ...source,
      tracks: {
        ...source.tracks,
        children: [
          {
            ...source.tracks.children[0]!,
            children: [
              {
                ...clip,
                effects: [
                  {
                    OTIO_SCHEMA: 'LinearTimeWarp.1',
                    name: 'Constant Speed',
                    effect_name: 'LinearTimeWarp',
                    time_scalar: 2,
                    metadata: {},
                  },
                ],
              },
            ],
          },
          ...source.tracks.children.slice(1),
        ],
      },
    };
    expect(parseOtio(serializeOtio(sped))).toMatchObject({ ok: true, document: sped });

    const value = JSON.parse(decoder.decode(serializeOtio(sped))) as {
      tracks: { children: Array<{ children: Array<Record<string, unknown>> }> };
    };
    value.tracks.children[0]!.children[0]!.effects = [
      {
        OTIO_SCHEMA: 'LinearTimeWarp.1',
        name: 'Reverse',
        effect_name: 'LinearTimeWarp',
        time_scalar: -1,
        metadata: {},
      },
    ];
    expect(parseOtio(encoder.encode(JSON.stringify(value)))).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          path: '$.tracks.children[0].children[0].effects[0].time_scalar',
        }),
      ],
    });
  });

  it('preserves rejected source bytes and reports every object path', () => {
    const invalid = timelineWithClip();
    const value = JSON.parse(decoder.decode(serializeOtio(invalid))) as Record<string, unknown>;
    const tracks = value['tracks'] as { children: Array<Record<string, unknown>> };
    tracks.children.push({
      OTIO_SCHEMA: 'Track.1',
      name: 'Video 2',
      kind: 'Video',
      children: [{ OTIO_SCHEMA: 'Transition.1' }],
      metadata: {},
    });
    const bytes = encoder.encode(JSON.stringify(value));

    const parsed = parseOtio(bytes);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.sourceBytes).toBe(bytes);
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-schema',
          path: '$.tracks.children[2].children[0].OTIO_SCHEMA',
        }),
        expect.objectContaining({
          code: 'unsupported-structure',
          path: '$.tracks.children',
        }),
      ]),
    );
  });

  it('rejects non-empty effects and unknown OpenNeko metadata without dropping it', () => {
    const value = JSON.parse(decoder.decode(serializeOtio(timelineWithClip()))) as Record<
      string,
      unknown
    >;
    const tracks = value['tracks'] as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    };
    const clip = tracks.children[0]?.children[0];
    if (!clip) throw new Error('Fixture clip missing.');
    clip['effects'] = [{ OTIO_SCHEMA: 'Effect.1' }];
    clip['metadata'] = { openneko: { cut: { clipId: 'clip-1', mystery: true } } };

    const parsed = parseOtio(encoder.encode(JSON.stringify(value)));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.tracks.children[0].children[0].effects[0].OTIO_SCHEMA',
        }),
        expect.objectContaining({
          path: '$.tracks.children[0].children[0].metadata.openneko.cut.mystery',
        }),
      ]),
    );
  });

  it('rejects malformed known OpenNeko values with precise paths', () => {
    const value = JSON.parse(decoder.decode(serializeOtio(timelineWithClip()))) as Record<
      string,
      unknown
    >;
    const metadata = value['metadata'] as { openneko: { cut: Record<string, unknown> } };
    metadata.openneko.cut['width'] = 0;
    const tracks = value['tracks'] as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    };
    const clipMetadata = tracks.children[0]?.children[0]?.['metadata'] as {
      openneko: Record<string, unknown>;
    };
    clipMetadata.openneko['audio'] = { muted: 'no', fadeInSeconds: -1 };

    const parsed = parseOtio(encoder.encode(JSON.stringify(value)));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.metadata.openneko.cut.width' }),
        expect.objectContaining({
          path: '$.tracks.children[0].children[0].metadata.openneko.audio.muted',
        }),
        expect.objectContaining({
          path: '$.tracks.children[0].children[0].metadata.openneko.audio.fadeInSeconds',
        }),
      ]),
    );
  });

  it.each([
    'file:///tmp/shot.mp4',
    '/tmp/shot.mp4',
    'media\\shot.mp4',
    './media/shot.mp4',
    'media/../shot.mp4',
  ])('rejects non-canonical persistent media target %s', (targetUrl) => {
    const value = JSON.parse(decoder.decode(serializeOtio(timelineWithClip()))) as Record<
      string,
      unknown
    >;
    const tracks = value['tracks'] as {
      children: Array<{ children: Array<Record<string, unknown>> }>;
    };
    const reference = tracks.children[0]?.children[0]?.['media_reference'] as Record<
      string,
      unknown
    >;
    reference['target_url'] = targetUrl;

    const parsed = parseOtio(encoder.encode(JSON.stringify(value)));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'invalid-value',
        path: '$.tracks.children[0].children[0].media_reference.target_url',
      }),
    );
  });

  it('rejects duplicate and non-reciprocal linked Clip identities', () => {
    const source = timelineWithClip();
    const video = source.tracks.children[0]?.children[0];
    if (!video || video.OTIO_SCHEMA !== 'Clip.2') throw new Error('Fixture clip missing.');
    const invalidVideo: OtioClip = {
      ...video,
      metadata: withClipIdentity(video.metadata, {
        clipId: 'clip-1',
        linkedAudioClipId: 'clip-1',
      }),
    };
    const duplicateAudio: OtioClip = {
      ...video,
      metadata: withClipIdentity(video.metadata, {
        clipId: 'clip-1',
        linkedVideoClipId: 'missing-video',
      }),
    };
    const document: OtioTimeline = {
      ...source,
      tracks: {
        ...source.tracks,
        children: [
          { ...source.tracks.children[0]!, children: [invalidVideo] },
          { ...source.tracks.children[1]!, children: [duplicateAudio] },
        ],
      },
    };

    expect(() => serializeOtio(document)).toThrowError(
      expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            path: '$.tracks.children[1].children[0].metadata.openneko.cut.clipId',
          }),
          expect.objectContaining({
            path: '$.tracks.children[0].children[0].metadata.openneko.link.linkedAudioClipId',
          }),
        ]),
      }),
    );
  });
  it('rejects Track structures beyond 1 Video + 3 Audio + 1 Subtitle', () => {
    const timeline = createOtioTimeline('Bounded', {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    });
    const tooManyAudio: OtioTimeline = {
      ...timeline,
      tracks: {
        ...timeline.tracks,
        children: [
          ...timeline.tracks.children,
          createTrack('Audio', 'Audio 1', 'audio-1'),
          createTrack('Audio', 'Audio 2', 'audio-2'),
          createTrack('Audio', 'Audio 3', 'audio-3'),
          createTrack('Audio', 'Audio 4', 'audio-4'),
        ],
      },
    };
    expect(() => serializeOtio(tooManyAudio)).toThrowError(
      expect.objectContaining({ name: 'OtioValidationError' }),
    );

    const duplicateSubtitle: OtioTimeline = {
      ...timeline,
      tracks: {
        ...timeline.tracks,
        children: [
          ...timeline.tracks.children,
          createTrack('Subtitle', 'Subtitle 1', 'subtitle-1'),
          createTrack('Subtitle', 'Subtitle 2', 'subtitle-2'),
        ],
      },
    };
    expect(() => serializeOtio(duplicateSubtitle)).toThrowError(
      expect.objectContaining({ name: 'OtioValidationError' }),
    );
  });

  it('round-trips standard enabled state and bounded OpenNeko lock metadata', () => {
    const value = JSON.parse(decoder.decode(serializeOtio(timelineWithClip()))) as {
      tracks: {
        children: Array<{
          enabled?: boolean;
          metadata: {
            openneko?: {
              cut?: Record<string, unknown>;
              audio?: Record<string, unknown>;
            };
          };
          children: Array<{
            enabled?: boolean;
            metadata: { openneko?: { cut?: Record<string, unknown> } };
          }>;
        }>;
      };
    };
    const track = value.tracks.children[0];
    const clip = track?.children[0];
    if (!track || !clip) throw new Error('Fixture Track or Clip missing.');
    track.enabled = false;
    track.metadata.openneko = {
      cut: { trackId: 'video-1', locked: true },
      audio: { muted: true },
    };
    clip.enabled = false;
    clip.metadata.openneko = { cut: { clipId: 'clip-1', locked: true } };

    const parsed = parseOtio(encoder.encode(JSON.stringify(value)));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.tracks.children[0]).toMatchObject({
      enabled: false,
      metadata: {
        openneko: {
          cut: { trackId: 'video-1', locked: true },
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
  });
});

describe('Cut clip identity', () => {
  it('assigns missing and duplicate IDs deterministically', () => {
    const document = timelineWithClip(false);
    const duplicate = clip('Second', 'media/second.mp4', 'clip-1');
    const withDuplicate: OtioTimeline = {
      ...document,
      tracks: {
        ...document.tracks,
        children: [
          {
            ...document.tracks.children[0]!,
            children: [...document.tracks.children[0]!.children, duplicate],
          },
        ],
      },
    };
    const ids = ['clip-1', 'clip-2'];

    const result = assignMissingClipIds(withDuplicate, () => ids.shift() ?? 'unexpected');

    expect(result.changed).toBe(true);
    expect(
      result.document.tracks.children[0]?.children.map((item) =>
        item.OTIO_SCHEMA === 'Clip.2'
          ? (item.metadata['openneko'] as { cut: { clipId: string } }).cut.clipId
          : '',
      ),
    ).toEqual(['clip-1', 'clip-2']);
  });

  it('creates reciprocal same-source linked audio without changing video mute', () => {
    const video = {
      ...clip('Shot', '../media/shot.mp4', 'video-1'),
      metadata: withAudioSettings(withClipIdentity({}, { clipId: 'video-1' }), { muted: true }),
    };

    const linked = createLinkedAudioClip(video, 'audio-1');

    expect(linked.videoClip.metadata).toMatchObject({
      openneko: {
        cut: { clipId: 'video-1' },
        link: { linkedAudioClipId: 'audio-1' },
        audio: { muted: true },
      },
    });
    expect(linked.audioClip.media_reference.target_url).toBe('../media/shot.mp4');
    expect(linked.audioClip.source_range).toEqual(video.source_range);
    expect(linked.audioClip.metadata).toMatchObject({
      openneko: {
        cut: { clipId: 'audio-1' },
        link: { linkedVideoClipId: 'video-1' },
        audio: { muted: false, gainDb: 0 },
      },
    });
  });

  it('keeps the left ID and assigns the supplied right ID during split', () => {
    const original = clip('Shot', 'shot.mp4', 'clip-left');
    const split = splitClipIdentity(original, 'clip-right');
    expect(split.left.metadata).toMatchObject({ openneko: { cut: { clipId: 'clip-left' } } });
    expect(split.right.metadata).toMatchObject({ openneko: { cut: { clipId: 'clip-right' } } });
  });
});

function timelineWithClip(withId = true): OtioTimeline {
  const timeline = createOtioTimeline('Demo', {
    profile: '1080p30',
    editRateNumerator: 30,
    editRateDenominator: 1,
    width: 1920,
    height: 1080,
  });
  const video = timeline.tracks.children[0]!;
  return {
    ...timeline,
    metadata: { ...timeline.metadata, studio: { slate: 'A-001' } },
    tracks: {
      ...timeline.tracks,
      children: [
        {
          ...video,
          children: [clip('Shot 1', '../media/shot.mp4', withId ? 'clip-1' : undefined)],
        },
        createTrack('Audio', 'Audio 1', 'audio-1'),
      ],
    },
  };
}

function clip(name: string, targetUrl: string, clipId?: string): OtioClip {
  return {
    OTIO_SCHEMA: 'Clip.2',
    name,
    media_reference: {
      OTIO_SCHEMA: 'ExternalReference.1',
      target_url: targetUrl,
      metadata: {},
    },
    source_range: timeRange(0, 90, 30),
    metadata: clipId ? withClipIdentity({}, { clipId }) : {},
    enabled: true,
    effects: [],
    markers: [],
  };
}
