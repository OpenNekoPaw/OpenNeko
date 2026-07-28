import { describe, expect, it } from 'vitest';
import {
  MEDIA_DIFF_SCHEMA_VERSION,
  getMediaType,
  parseMediaDiffRequest,
  parseMediaDiffResponse,
} from './index';

describe('media diff contracts', () => {
  it('recognizes only retained media kinds', () => {
    expect(getMediaType('shot.PNG')).toBe('image');
    expect(getMediaType('clip.mp4')).toBe('video');
    expect(getMediaType('voice.wav')).toBe('audio');
    expect(getMediaType('legacy.nkv')).toBeNull();
  });

  it('accepts a versioned request for the owning session', () => {
    expect(
      parseMediaDiffRequest(
        {
          schemaVersion: MEDIA_DIFF_SCHEMA_VERSION,
          sessionId: 'session-a',
          requestId: 'request-a',
          timestamp: 1,
          type: 'mediaDiff:seek',
          payload: { time: 1.5 },
        },
        'session-a',
      ),
    ).toMatchObject({ type: 'mediaDiff:seek', requestId: 'request-a' });
  });

  it('rejects stale, unknown and non-finite requests', () => {
    const base = {
      schemaVersion: MEDIA_DIFF_SCHEMA_VERSION,
      sessionId: 'session-a',
      requestId: 'request-a',
      timestamp: 1,
    };
    expect(() =>
      parseMediaDiffRequest({ ...base, type: 'mediaDiff:seek', payload: { time: 0 } }, 'session-b'),
    ).toThrow('session identity mismatch');
    expect(() =>
      parseMediaDiffRequest({ ...base, type: 'mediaDiff:legacy', payload: {} }, 'session-a'),
    ).toThrow('Unknown media diff request');
    expect(() =>
      parseMediaDiffRequest(
        { ...base, type: 'mediaDiff:seek', payload: { time: Number.NaN } },
        'session-a',
      ),
    ).toThrow('finite number');
  });

  it('rejects result ratios outside 0..1 and retired timeline results', () => {
    const base = {
      schemaVersion: MEDIA_DIFF_SCHEMA_VERSION,
      sessionId: 'session-a',
      requestId: 'request-a',
      type: 'mediaDiff:result',
    };
    expect(() =>
      parseMediaDiffResponse(
        { ...base, payload: { mediaType: 'image', similarity: 1.01, details: {} } },
        'session-a',
      ),
    ).toThrow('0..1');
    expect(() =>
      parseMediaDiffResponse(
        { ...base, payload: { mediaType: 'timeline', similarity: 1, details: {} } },
        'session-a',
      ),
    ).toThrow('Unsupported media diff result kind');
    expect(() =>
      parseMediaDiffResponse(
        {
          ...base,
          payload: {
            mediaType: 'image',
            similarity: 0.5,
            details: { pixelDifference: 25, structuralSimilarity: 0.75 },
          },
        },
        'session-a',
      ),
    ).toThrow('pixelDifference must be within 0..1');
  });
});
