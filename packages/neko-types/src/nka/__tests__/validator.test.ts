import { describe, expect, it } from 'vitest';
import { validateNka } from '../validator';
import { CURRENT_NKA_VERSION } from '../codec';

function createProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: CURRENT_NKA_VERSION,
    name: 'Validation Fixture',
    sampleRate: 48000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
    tempoMap: {
      ppq: 480,
      tempoEvents: [{ ticks: 0, bpm: 120 }],
      timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
    },
    ...overrides,
  };
}

describe('validateNka', () => {
  it('promotes warnings into visible errors in strict mode', () => {
    const result = validateNka(createProject({ sampleRate: 22050 }), { strict: true });

    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'sampleRate',
        message: 'uncommon sample rate (expected 44100, 48000, or 96000)',
        severity: 'error',
      }),
    );
  });

  it('validates optional bpm and masterVolume ranges when present', () => {
    const result = validateNka(createProject({ bpm: 12, masterVolume: 3 }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'bpm',
        message: 'must be between 20 and 300',
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'masterVolume',
        message: 'must be between 0 and 2',
      }),
    );
  });

  it('validates track mix volume and pan ranges', () => {
    const result = validateNka(
      createProject({
        trackMix: {
          voice: {
            volume: 3,
            pan: 2,
            solo: false,
            effectChain: [],
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.voice.volume',
        message: 'must be between 0 and 2',
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.voice.pan',
        message: 'must be between -1 and 1',
      }),
    );
  });

  it('validates tempo map tick-zero requirements and event ordering', () => {
    const result = validateNka(
      createProject({
        tempoMap: {
          ppq: 480,
          tempoEvents: [
            { ticks: 480, bpm: 120 },
            { ticks: 240, bpm: 128 },
          ],
          timeSignatureEvents: [{ ticks: 120, numerator: 4, denominator: 4 }],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'tempoMap.tempoEvents[1].ticks',
        message: 'must be strictly increasing',
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'tempoMap.tempoEvents',
        message: 'must include a tempo event at tick 0',
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'tempoMap.timeSignatureEvents',
        message: 'must include a time signature event at tick 0',
      }),
    );
  });

  it('validates track automation target ranges and rejects derived seconds', () => {
    const result = validateNka(
      createProject({
        trackMix: {
          voice: {
            volume: 1,
            pan: 0,
            solo: false,
            effectChain: [],
            automation: [
              {
                id: 'lane-1',
                enabled: true,
                target: { kind: 'track-volume' },
                points: [
                  { ticks: 0, value: 1, curve: 'linear' },
                  { ticks: 480, value: 2.5, curve: 'linear', seconds: 1 },
                ],
              },
            ],
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.voice.automation[0].points[1].value',
        message: 'must be between 0 and 2',
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.voice.automation[0].points[1].seconds',
        message: 'must not persist derived seconds',
      }),
    );
  });

  it('validates effect parameter automation against shared metadata', () => {
    const valid = validateNka(
      createProject({
        trackMix: {
          voice: {
            volume: 1,
            pan: 0,
            solo: false,
            effectChain: [
              {
                id: 'fx-1',
                effectType: 'compressor',
                enabled: true,
                params: { threshold: -18 },
              },
            ],
            automation: [
              {
                id: 'lane-1',
                enabled: true,
                target: { kind: 'effect-param', effectId: 'fx-1', param: 'threshold' },
                points: [{ ticks: 0, value: -24, curve: 'linear' }],
              },
            ],
          },
        },
      }),
    );

    expect(valid.valid).toBe(true);

    const invalid = validateNka(
      createProject({
        trackMix: {
          voice: {
            volume: 1,
            pan: 0,
            solo: false,
            effectChain: [
              {
                id: 'fx-1',
                effectType: 'compressor',
                enabled: true,
                params: { threshold: -18 },
              },
            ],
            automation: [
              {
                id: 'lane-1',
                enabled: true,
                target: { kind: 'effect-param', effectId: 'fx-1', param: 'missing' },
                points: [{ ticks: 0, value: 0, curve: 'linear' }],
              },
            ],
          },
        },
      }),
    );

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContainEqual(
      expect.objectContaining({
        field: 'trackMix.voice.automation[0].target.param',
        message: 'unsupported automatable parameter: missing',
      }),
    );
  });
});
