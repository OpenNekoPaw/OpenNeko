/**
 * NKA Format SDK — Codec Tests
 */

import { describe, it, expect } from 'vitest';
import { CURRENT_NKA_VERSION, loadNka, saveNka, isValidNka } from '../codec';
import type { AudioProjectData } from '../../types/audioProject';

// =============================================================================
// Fixtures
// =============================================================================

const VALID_AUDIO_PROJECT: AudioProjectData = {
  version: CURRENT_NKA_VERSION,
  name: 'Test Audio Project',
  sampleRate: 48000,
  channels: 2,
  tracks: [
    {
      id: 'track-1',
      name: 'Main Audio',
      type: 'audio',
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: true,
    },
  ],
  masterEffectsChain: [
    {
      id: 'effect-1',
      type: 'compressor',
      name: 'Master Compressor',
      enabled: true,
      params: { threshold: -20, ratio: 4 },
    },
  ],
  markers: [
    {
      id: 'marker-1',
      time: 5.0,
      label: 'Chorus Start',
    },
  ],
  trackMix: {
    'track-1': {
      volume: 0.75,
      pan: -0.1,
      solo: false,
      effectChain: [
        {
          id: 'track-fx-1',
          effectType: 'noise-gate',
          enabled: true,
          params: { threshold: -40 },
        },
      ],
    },
  },
  tempoMap: {
    ppq: 480,
    tempoEvents: [{ ticks: 0, bpm: 128 }],
    timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
  },
  masterVolume: 0.9,
};

// =============================================================================
// loadNka
// =============================================================================

describe('loadNka', () => {
  it('should load valid JSON and return a valid result', () => {
    const json = JSON.stringify(VALID_AUDIO_PROJECT);
    const result = loadNka(json);

    expect(result.validation.valid).toBe(true);
    expect(result.data.name).toBe('Test Audio Project');
    expect(result.data.sampleRate).toBe(48000);
    expect(result.compatibility.mode).toBe('current');
    expect(result.compatibility.readOnly).toBe(false);
  });

  it('should return error result for invalid JSON', () => {
    const result = loadNka('{ broken json!!!');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('JSON parse error'),
      }),
    );
  });

  it('should return error result for empty string', () => {
    const result = loadNka('');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('should return error result for non-object data', () => {
    const result = loadNka('"just a string"');

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        message: 'data must be an object',
      }),
    );
  });

  it('should return validation errors for missing required fields', () => {
    const result = loadNka(JSON.stringify({ version: CURRENT_NKA_VERSION }));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.field === 'name')).toBe(true);
    expect(result.validation.errors.some((e) => e.field === 'tracks')).toBe(true);
  });

  it('should validate effect structure in masterEffectsChain', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      masterEffectsChain: [{ id: 'e1' }], // missing required fields
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.field.startsWith('masterEffectsChain[0]'))).toBe(
      true,
    );
  });

  it('should validate marker structure', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      markers: [{ id: 'm1', time: -1, label: 'Bad' }], // negative time
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.field === 'markers[0].time')).toBe(true);
  });

  it('should reject non-current project versions', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      version: '2.0',
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.compatibility.mode).toBe('invalid');
    expect(result.compatibility.readOnly).toBe(true);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        field: 'version',
        message: 'unsupported NKA version: "2.0"',
      }),
    );
    expect(result.validation.warnings).toHaveLength(0);
  });

  it('should load v2.1 projects and derive a default tempo map from bpm', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      version: '2.1',
      bpm: 132,
      tempoMap: undefined,
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.validation.valid).toBe(true);
    expect(result.compatibility.mode).toBe('current');
    expect(result.data.tempoMap).toEqual({
      ppq: 480,
      tempoEvents: [{ ticks: 0, bpm: 132 }],
      timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
    });
  });

  it('should reject unknown effect names', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      masterEffectsChain: [
        {
          id: 'effect-1',
          type: 'spectral-cleanup',
          name: 'Unknown Effect',
          enabled: true,
          params: {},
        },
      ],
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        field: 'masterEffectsChain[0].type',
        message: 'invalid audio effect type: "spectral-cleanup"',
      }),
    );
  });

  it('should mark future-version projects as read-only with warnings', () => {
    const data = { ...VALID_AUDIO_PROJECT, version: '99.0' };
    const result = loadNka(JSON.stringify(data));

    expect(result.compatibility.mode).toBe('future');
    expect(result.compatibility.readOnly).toBe(true);
    expect(result.validation.warnings.some((warning) => warning.field === 'version')).toBe(true);
  });

  it('should return an empty project when validation fails without critical root errors', () => {
    const data = {
      ...VALID_AUDIO_PROJECT,
      trackMix: {
        'track-1': {
          volume: 'loud',
          pan: 0,
          solo: false,
          effectChain: [],
        },
      },
    };
    const result = loadNka(JSON.stringify(data));

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.track-1.volume',
        message: 'must be a number',
      }),
    );
    expect(result.data).toEqual({
      version: CURRENT_NKA_VERSION,
      name: '',
      sampleRate: 48000,
      channels: 2,
      tracks: [],
      masterEffectsChain: [],
      markers: [],
    });
  });
});

// =============================================================================
// saveNka
// =============================================================================

describe('saveNka', () => {
  it('should produce valid JSON with default indent of 2', () => {
    const json = saveNka(VALID_AUDIO_PROJECT);
    const parsed = JSON.parse(json) as unknown;

    expect(parsed).toEqual({ ...VALID_AUDIO_PROJECT, version: CURRENT_NKA_VERSION, bpm: 128 });
    // Check indent: second line should start with 2 spaces
    const lines = json.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toMatch(/^ {2}"/);
  });

  it('should save v2.2 tempo maps and backfill bpm from the first tempo event', () => {
    const json = saveNka({
      ...VALID_AUDIO_PROJECT,
      bpm: 120,
      tempoMap: {
        ppq: 480,
        tempoEvents: [{ ticks: 0, bpm: 142 }],
        timeSignatureEvents: [{ ticks: 0, numerator: 6, denominator: 8 }],
      },
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed['version']).toBe(CURRENT_NKA_VERSION);
    expect(parsed['bpm']).toBe(142);
    expect(parsed['tempoMap']).toEqual({
      ppq: 480,
      tempoEvents: [{ ticks: 0, bpm: 142 }],
      timeSignatureEvents: [{ ticks: 0, numerator: 6, denominator: 8 }],
    });
  });

  it('should persist automation lanes without derived seconds', () => {
    const json = saveNka({
      ...VALID_AUDIO_PROJECT,
      trackMix: {
        'track-1': {
          volume: 0.75,
          pan: -0.1,
          solo: false,
          effectChain: [
            {
              id: 'track-fx-1',
              effectType: 'compressor',
              enabled: true,
              params: { threshold: -18 },
            },
          ],
          automation: [
            {
              id: 'lane-1',
              enabled: true,
              target: { kind: 'effect-param', effectId: 'track-fx-1', param: 'threshold' },
              points: [
                { ticks: 0, value: -24, curve: 'linear' },
                { ticks: 480, value: -12, curve: 'hold' },
              ],
            },
          ],
        },
      },
    });
    const loaded = loadNka(json);

    expect(loaded.validation.valid).toBe(true);
    expect(loaded.data.trackMix?.['track-1']?.automation?.[0]?.points[0]).toEqual({
      ticks: 0,
      value: -24,
      curve: 'linear',
    });
    expect(
      Object.hasOwn(loaded.data.trackMix?.['track-1']?.automation?.[0]?.points[0] ?? {}, 'seconds'),
    ).toBe(false);
  });

  it('should respect custom indent option', () => {
    const json = saveNka(VALID_AUDIO_PROJECT, { indent: 4 });
    const lines = json.split('\n');
    expect(lines[1]).toMatch(/^ {4}"/);
  });

  it('should skip validation when validate=false', () => {
    // Invalid audio project data (missing required fields)
    const invalidProject = { version: CURRENT_NKA_VERSION } as unknown as AudioProjectData;

    // With validation enabled, should throw
    expect(() => saveNka(invalidProject)).toThrow();

    // With validation disabled, should succeed
    const json = saveNka(invalidProject, { validate: false });
    expect(json).toBe(JSON.stringify(invalidProject, null, 2));
  });

  it('should throw on validation failure with error details', () => {
    const invalidProject = { version: CURRENT_NKA_VERSION } as unknown as AudioProjectData;

    expect(() => saveNka(invalidProject)).toThrow('NKA validation failed');
  });

  it('should write the current version and strip unknown future fields', () => {
    const futureProject = {
      ...VALID_AUDIO_PROJECT,
      version: '99.0',
      futureOnlyField: { should: 'be stripped' },
      tracks: [
        {
          ...VALID_AUDIO_PROJECT.tracks[0]!,
          futureTrackField: true,
          elements: [
            {
              id: 'element-1',
              name: 'Clip',
              type: 'audio',
              src: 'clip.wav',
              duration: 1,
              startTime: 0,
              trimStart: 0,
              trimEnd: 0,
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
              opacity: 1,
              blendMode: 'normal',
              effects: [],
              muted: false,
              hidden: false,
              locked: false,
              futureElementField: true,
            },
          ],
        },
      ],
    } as unknown as AudioProjectData;

    const json = saveNka(futureProject);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed['version']).toBe(CURRENT_NKA_VERSION);
    expect(parsed['futureOnlyField']).toBeUndefined();
    expect(
      (parsed['tracks'] as Array<Record<string, unknown>>)[0]!['futureTrackField'],
    ).toBeUndefined();
    const parsedTrack = (parsed['tracks'] as Array<Record<string, unknown>>)[0]!;
    const parsedElement = (parsedTrack['elements'] as Array<Record<string, unknown>>)[0]!;
    expect(parsedElement['futureElementField']).toBeUndefined();
    expect(parsedElement['src']).toBe('clip.wav');
  });
});

// =============================================================================
// Roundtrip
// =============================================================================

describe('loadNka + saveNka roundtrip', () => {
  it('should produce valid JSON that can be loaded back', () => {
    const json1 = saveNka(VALID_AUDIO_PROJECT);
    const loaded = loadNka(json1);

    expect(loaded.validation.valid).toBe(true);

    const json2 = saveNka(loaded.data);
    expect(JSON.parse(json1)).toEqual(JSON.parse(json2));
  });
});

// =============================================================================
// isValidNka
// =============================================================================

describe('isValidNka', () => {
  it('should return true for valid audio project data', () => {
    expect(isValidNka(VALID_AUDIO_PROJECT)).toBe(true);
  });

  it('should return false for invalid data', () => {
    expect(isValidNka({ broken: true })).toBe(false);
  });

  it('should return false for non-object data', () => {
    expect(isValidNka(null)).toBe(false);
    expect(isValidNka('string')).toBe(false);
  });
});
