import { describe, expect, it } from 'vitest';
import {
  AUDIO_EFFECT_PARAMETER_METADATA,
  AUTOMATABLE_AUDIO_TARGET_PARAMETERS,
  ENGINE_AUDIO_EFFECT_TYPES,
  getAudioEffectParameterMetadata,
  getAutomatableAudioEffectParameters,
  isAudioEffectParameterValueInRange,
} from '../index';

describe('audioEffectParams metadata', () => {
  it('registers metadata for every renderable engine effect type', () => {
    expect(Object.keys(AUDIO_EFFECT_PARAMETER_METADATA).sort()).toEqual(
      [...ENGINE_AUDIO_EFFECT_TYPES].sort(),
    );

    for (const effectType of ENGINE_AUDIO_EFFECT_TYPES) {
      expect(AUDIO_EFFECT_PARAMETER_METADATA[effectType].length).toBeGreaterThan(0);
    }
  });

  it('provides numeric bounds for automatable parameters', () => {
    for (const metadata of Object.values(AUDIO_EFFECT_PARAMETER_METADATA).flat()) {
      if (!metadata.automatable) {
        continue;
      }

      expect(metadata.valueKind).toBe('number');
      expect(typeof metadata.min).toBe('number');
      expect(typeof metadata.max).toBe('number');
      expect(metadata.min).toBeLessThan(metadata.max);
    }
  });

  it('looks up automatable effect parameters and validates ranges', () => {
    const threshold = getAudioEffectParameterMetadata('compressor', 'threshold');

    expect(threshold).toBeDefined();
    expect(threshold?.automatable).toBe(true);
    expect(isAudioEffectParameterValueInRange(threshold!, -24)).toBe(true);
    expect(isAudioEffectParameterValueInRange(threshold!, -80)).toBe(false);
  });

  it('excludes non-numeric metadata from automatable parameters', () => {
    expect(getAudioEffectParameterMetadata('reverb', 'type')?.automatable).toBe(false);
    expect(
      getAutomatableAudioEffectParameters('reverb').map((metadata) => metadata.key),
    ).not.toContain('type');
  });

  it('keeps track automation target metadata aligned with operation ranges', () => {
    expect(AUTOMATABLE_AUDIO_TARGET_PARAMETERS).toContainEqual({
      kind: 'track-volume',
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: 1,
    });
    expect(AUTOMATABLE_AUDIO_TARGET_PARAMETERS).toContainEqual({
      kind: 'track-pan',
      min: -1,
      max: 1,
      step: 0.01,
      defaultValue: 0,
    });
  });
});
