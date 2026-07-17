import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaProbeCache } from '../MediaProbeCache';
import type { ProbeResultLike } from '../types';

const MOCK_PROBE: ProbeResultLike = {
  duration: 10,
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'h264',
  format: 'mp4',
  hasAudio: true,
};

describe('MediaProbeCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves probe results', () => {
    const cache = new MediaProbeCache();
    cache.set('/path/to/file.mp4', MOCK_PROBE);

    const result = cache.get('/path/to/file.mp4');
    expect(result).toEqual(MOCK_PROBE);
  });

  it('returns undefined for missing entries', () => {
    const cache = new MediaProbeCache();

    expect(cache.get('/nonexistent')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    const cache = new MediaProbeCache(1000); // 1 second TTL
    cache.set('/path/to/file.mp4', MOCK_PROBE);

    // Before expiry
    expect(cache.get('/path/to/file.mp4')).toEqual(MOCK_PROBE);

    // Advance past TTL
    vi.advanceTimersByTime(1001);
    expect(cache.get('/path/to/file.mp4')).toBeUndefined();
  });

  it('invalidates specific entries', () => {
    const cache = new MediaProbeCache();
    cache.set('/path/a.mp4', MOCK_PROBE);
    cache.set('/path/b.mp4', { ...MOCK_PROBE, width: 1280 });

    cache.invalidate('/path/a.mp4');

    expect(cache.get('/path/a.mp4')).toBeUndefined();
    expect(cache.get('/path/b.mp4')).toBeDefined();
  });

  it('clears all entries', () => {
    const cache = new MediaProbeCache();
    cache.set('/path/a.mp4', MOCK_PROBE);
    cache.set('/path/b.mp4', MOCK_PROBE);

    cache.clear();

    expect(cache.get('/path/a.mp4')).toBeUndefined();
    expect(cache.get('/path/b.mp4')).toBeUndefined();
  });

  it('overwrites existing entries', () => {
    const cache = new MediaProbeCache();
    cache.set('/path/a.mp4', MOCK_PROBE);

    const updated = { ...MOCK_PROBE, duration: 20 };
    cache.set('/path/a.mp4', updated);

    expect(cache.get('/path/a.mp4')?.duration).toBe(20);
  });
});
