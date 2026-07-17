import { describe, expect, it } from 'vitest';
import type { GeneratedImageVersion } from '@neko/shared';
import { appendSelectedGenerationCandidate, selectGenerationCandidate } from './generationHistory';

function createCandidate(id: string, selected: boolean, timestamp: number): GeneratedImageVersion {
  return {
    id,
    dataUrl: `data:image/png;base64,${id}`,
    prompt: id,
    timestamp,
    selected,
  };
}

describe('generationHistory helpers', () => {
  it('marks only the appended candidate as selected', () => {
    const history = appendSelectedGenerationCandidate(
      [createCandidate('old', true, 1), createCandidate('older', false, 0)],
      createCandidate('new', true, 2),
    );

    expect(history.map((candidate) => [candidate.id, candidate.selected])).toEqual([
      ['old', false],
      ['older', false],
      ['new', true],
    ]);
  });

  it('switches selection to a single matching candidate', () => {
    const history = selectGenerationCandidate(
      [
        createCandidate('a', true, 1),
        createCandidate('b', true, 2),
        createCandidate('c', false, 3),
      ],
      'c',
    );

    expect(history.map((candidate) => [candidate.id, candidate.selected])).toEqual([
      ['a', false],
      ['b', false],
      ['c', true],
    ]);
  });
});
