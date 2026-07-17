import { describe, expect, it } from 'vitest';
import type { AudioProjectData, TimelineTrack } from '../../types';
import { buildMixConfig } from '../build-mix-config';

function createTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    name: 'Track 1',
    type: 'audio',
    muted: false,
    locked: false,
    hidden: false,
    isMain: true,
    elements: [
      {
        id: 'clip-1',
        type: 'audio',
        name: 'Clip 1',
        src: 'audio/clip.wav',
        duration: 10,
        startTime: 2,
        trimStart: 1,
        trimEnd: 0,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
        opacity: 1,
        blendMode: 'normal',
        effects: [],
        muted: false,
        hidden: false,
        locked: false,
        audio: {
          volume: 0.7,
          pan: -0.2,
          muted: false,
          fadeIn: 0.25,
          fadeOut: 0.5,
          fadeInCurve: 'linear',
          fadeOutCurve: 'linear',
          gain: 1.5,
        },
      },
    ],
    ...overrides,
  };
}

function createProject(overrides: Partial<AudioProjectData> = {}): AudioProjectData {
  return {
    version: '2.1',
    name: 'Project',
    sampleRate: 48000,
    channels: 2,
    tracks: [createTrack()],
    masterEffectsChain: [],
    markers: [],
    ...overrides,
  };
}

describe('buildMixConfig', () => {
  it('maps project tracks, elements, mix state, and master state', () => {
    const result = buildMixConfig(
      createProject({
        trackMix: {
          'track-1': {
            volume: 0.6,
            pan: 0.25,
            solo: true,
            effectChain: [
              { id: 'fx-1', effectType: 'compressor', enabled: true, params: { ratio: 3 } },
            ],
            automation: [
              {
                id: 'lane-volume',
                enabled: true,
                target: { kind: 'track-volume' },
                points: [
                  { ticks: 0, value: 0.2, curve: 'linear' },
                  { ticks: 480, value: 1, curve: 'hold' },
                ],
              },
            ],
          },
        },
        tempoMap: {
          ppq: 480,
          tempoEvents: [{ ticks: 0, bpm: 120 }],
          timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
        },
        masterEffectsChain: [
          {
            id: 'master-fx-1',
            type: 'parametric-eq',
            name: 'EQ',
            enabled: true,
            params: {},
          },
        ],
        masterVolume: 0.8,
      }),
      {
        projectDir: '/project',
        resolveSourcePath: (src, dir) => `${dir}/${src}`,
      },
    );

    expect(result.warnings).toEqual([]);
    expect(result.config).toMatchObject({
      masterVolume: 0.8,
      sampleRate: 48000,
      channels: 2,
      masterEffects: [{ id: 'master-fx-1', effectType: 'parametric-eq', enabled: true }],
      tracks: [
        {
          id: 'track-1',
          volume: 0.6,
          pan: 0.25,
          solo: true,
          effectChain: [{ id: 'fx-1', effectType: 'compressor' }],
          automation: [
            {
              id: 'lane-volume',
              target: { kind: 'track-volume' },
              enabled: true,
              points: [
                { time: 0, value: 0.2, curve: 'linear' },
                { time: 0.5, value: 1, curve: 'hold' },
              ],
            },
          ],
        },
      ],
    });
    expect(result.config.tracks[0]?.elements[0]).toMatchObject({
      id: 'clip-1',
      src: '/project/audio/clip.wav',
      volume: 0.7,
      pan: -0.2,
      fadeIn: 0.25,
      fadeOut: 0.5,
      gain: 1.5,
    });
  });

  it('resolves variable paths through the provided context', () => {
    const project = createProject({
      tracks: [
        createTrack({
          elements: [
            {
              ...createTrack().elements[0]!,
              src: '${MEDIA}/clip.wav',
            },
          ],
        }),
      ],
    });

    const result = buildMixConfig(project, {
      projectDir: '/project',
      resolveSourcePath: (src) => src.replace('${MEDIA}', '/mnt/media'),
    });

    expect(result.config.tracks[0]?.elements[0]?.src).toBe('/mnt/media/clip.wav');
  });

  it('filters planned-only and unknown effects with warnings', () => {
    const result = buildMixConfig(
      createProject({
        masterEffectsChain: [
          {
            id: 'planned',
            type: 'noise-reduction',
            name: 'Noise Reduction',
            enabled: true,
            params: {},
          },
          {
            id: 'unknown',
            type: 'made-up' as never,
            name: 'Unknown',
            enabled: true,
            params: {},
          },
        ],
      }),
      {
        projectDir: '/project',
        resolveSourcePath: (src, dir) => `${dir}/${src}`,
      },
    );

    expect(result.config.masterEffects).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'planned-effect',
      'unknown-effect',
    ]);
  });

  it('omits unsupported effect automation with a warning', () => {
    const result = buildMixConfig(
      createProject({
        trackMix: {
          'track-1': {
            volume: 1,
            pan: 0,
            solo: false,
            effectChain: [
              { id: 'fx-1', effectType: 'compressor', enabled: true, params: { threshold: -18 } },
            ],
            automation: [
              {
                id: 'lane-threshold',
                enabled: true,
                target: { kind: 'effect-param', effectId: 'fx-1', param: 'threshold' },
                points: [{ ticks: 0, value: -24, curve: 'linear' }],
              },
            ],
          },
        },
      }),
      {
        projectDir: '/project',
        resolveSourcePath: (src, dir) => `${dir}/${src}`,
      },
    );

    expect(result.config.tracks[0]?.automation).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'unsupported-automation',
        message: expect.stringContaining('not supported by mix rendering yet'),
      }),
    );
  });
});
