import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime } from './audio/audioUtils';

describe('media diff time labels', () => {
  it('uses shared generic media time labels for audio controls', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatDuration(65.678)).toBe('1:05.67');
  });
});
