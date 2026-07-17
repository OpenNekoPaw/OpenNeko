import { describe, expect, it } from 'vitest';
import {
  isEngineAudioEffectType,
  isPlannedAudioEffectType,
  normalizeAudioEffectType,
  normalizeRenderableAudioEffectType,
} from '../audioMix';

describe('audioMix effect contracts', () => {
  it('recognizes canonical engine-supported effect names', () => {
    expect(isEngineAudioEffectType('parametric-eq')).toBe(true);
    expect(isEngineAudioEffectType('noise-gate')).toBe(true);
    expect(isEngineAudioEffectType('noise-reduction')).toBe(false);
  });

  it('recognizes planned-only effect names', () => {
    expect(isPlannedAudioEffectType('noise-reduction')).toBe(true);
    expect(isPlannedAudioEffectType('pitch-shift')).toBe(true);
  });

  it('does not normalize non-canonical effect names', () => {
    expect(normalizeAudioEffectType('unknown-effect')).toBeUndefined();
    expect(normalizeAudioEffectType('Noise Gate')).toBeUndefined();
    expect(normalizeAudioEffectType('high pass')).toBeUndefined();
  });

  it('returns only renderable names from renderable normalization', () => {
    expect(normalizeRenderableAudioEffectType('noise-gate')).toBe('noise-gate');
    expect(normalizeRenderableAudioEffectType('noise-reduction')).toBeUndefined();
    expect(normalizeRenderableAudioEffectType('unknown-effect')).toBeUndefined();
  });
});
