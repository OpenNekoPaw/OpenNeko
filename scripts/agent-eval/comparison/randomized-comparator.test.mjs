import { describe, expect, it } from 'vitest';
import {
  createRandomizedEvidenceComparison,
  resolveRandomizedPreference,
} from './randomized-comparator.mjs';

describe('randomized evidence comparison', () => {
  it.each([
    [0.1, 'left-report', 'right-report'],
    [0.9, 'right-report', 'left-report'],
  ])('hides source labels for random value %s', (random, first, second) => {
    const comparison = createRandomizedEvidenceComparison(
      {
        leftId: 'baseline-secret-label',
        rightId: 'candidate-secret-label',
        leftEvidence: { reportId: 'left-report', output: 'A' },
        rightEvidence: { reportId: 'right-report', output: 'B' },
        publicContract: { rubricId: 'quality-v1' },
      },
      { random: () => random },
    );
    expect(comparison.projection.options.map((option) => option.evidence.reportId)).toEqual([
      first,
      second,
    ]);
    const serialized = JSON.stringify(comparison.projection);
    expect(serialized).not.toContain('baseline-secret-label');
    expect(serialized).not.toContain('candidate-secret-label');
    expect(resolveRandomizedPreference('option-1', comparison.mapping)).toBe(
      random >= 0.5 ? 'candidate-secret-label' : 'baseline-secret-label',
    );
  });

  it('rejects an unknown Judge selection', () => {
    expect(() => resolveRandomizedPreference('baseline', { 'option-1': 'left' })).toThrow(
      'unknown randomized comparison option',
    );
  });
});
