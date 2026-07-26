import { describe, expect, it } from 'vitest';
import { formatMediaTimeWithFraction } from './time';

describe('formatMediaTimeWithFraction', () => {
  it('truncates media fractions without rolling the displayed second forward', () => {
    expect(formatMediaTimeWithFraction(65.678, 2)).toBe('1:05.67');
    expect(formatMediaTimeWithFraction(59.999, 2)).toBe('0:59.99');
  });
});
