import { describe, expect, it } from 'vitest';
import { buildWaveformPath } from './waveform';

describe('buildWaveformPath', () => {
  it('draws only from supplied Engine peak samples and bounds amplitude', () => {
    const path = buildWaveformPath([0, 0.5, 2, -0.25], 100, 20);
    expect(path).toContain('0.00,10.00');
    expect(path).toContain('66.67,0.00');
    expect(path).toContain('Z');
  });

  it('does not fabricate an empty waveform', () => {
    expect(buildWaveformPath([], 100, 20)).toBe('');
  });
});
