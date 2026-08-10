import { describe, expect, it } from 'vitest';
import { parsePiTurnPresentationTiming } from '../turn-presentation-timing';

describe('Pi Turn presentation timing', () => {
  it('accepts one exact completed Turn interval', () => {
    expect(
      parsePiTurnPresentationTiming({
        turnId: 'turn-1',
        startedAt: 10,
        completedAt: 20,
      }),
    ).toEqual({ turnId: 'turn-1', startedAt: 10, completedAt: 20 });
  });

  it('rejects unknown fields and reversed intervals', () => {
    expect(() =>
      parsePiTurnPresentationTiming({
        turnId: 'turn-1',
        startedAt: 10,
        completedAt: 20,
        duration: 10,
      }),
    ).toThrow('unknown fields');
    expect(() =>
      parsePiTurnPresentationTiming({
        turnId: 'turn-1',
        startedAt: 20,
        completedAt: 10,
      }),
    ).toThrow('precedes startedAt');
  });
});
