import { describe, expect, it } from 'vitest';
import {
  calculateVisionVideoFrameSize,
  calculateVisionVideoSampleRange,
  getVisionMediaKindFromPath,
  isVisionImageMime,
  isVisionVideoMime,
  planVisionImagePreprocess,
  resolveVisionImageAttachmentMediaType,
  selectVisionVideoSampleTimestamps,
  uniformVisionVideoSample,
} from '../vision-preprocess-policy';

describe('vision preprocess policy', () => {
  it('detects supported vision media MIME types and paths', () => {
    expect(isVisionImageMime('image/png')).toBe(true);
    expect(isVisionVideoMime('video/mp4')).toBe(true);
    expect(getVisionMediaKindFromPath('/tmp/a.webp')).toBe('image');
    expect(getVisionMediaKindFromPath('/tmp/a.webm')).toBe('video');
    expect(getVisionMediaKindFromPath('/tmp/a.txt')).toBeUndefined();
  });

  it('resolves unknown image attachment extensions to png', () => {
    expect(resolveVisionImageAttachmentMediaType('/tmp/image.xyz')).toBe('image/png');
  });

  it('plans image resize based on dimensions or payload size', () => {
    expect(
      planVisionImagePreprocess({ width: 2000, height: 1000, byteLength: 1024 }),
    ).toMatchObject({
      shouldResize: true,
      maxWidth: 1568,
      maxHeight: 1568,
      jpegQuality: 85,
    });
    expect(planVisionImagePreprocess({ width: 800, height: 600, byteLength: 1024 })).toMatchObject({
      shouldResize: false,
      jpegQuality: 90,
    });
  });

  it('calculates video sample range with edge skip by default', () => {
    expect(calculateVisionVideoSampleRange(100)).toEqual({ rangeIn: 5, rangeOut: 95 });
    expect(calculateVisionVideoSampleRange(100, { in: 10, out: 20 })).toEqual({
      rangeIn: 10,
      rangeOut: 20,
    });
  });

  it('samples keyframes in range before falling back to uniform sampling', () => {
    expect(
      selectVisionVideoSampleTimestamps({
        keyframes: [0, 10, 20, 30, 40, 50],
        rangeIn: 10,
        rangeOut: 50,
        maxFrames: 3,
      }),
    ).toEqual([10, 30, 50]);
    expect(
      selectVisionVideoSampleTimestamps({
        keyframes: [0],
        rangeIn: 10,
        rangeOut: 20,
        maxFrames: 3,
      }),
    ).toEqual([10, 15, 20]);
    expect(
      selectVisionVideoSampleTimestamps({
        keyframes: [10, 20],
        rangeIn: 10,
        rangeOut: 20,
        maxFrames: 0,
      }),
    ).toEqual([]);
  });

  it('uniformly samples ranges and calculates resize dimensions', () => {
    expect(uniformVisionVideoSample(10, 20, 1)).toEqual([15]);
    expect(uniformVisionVideoSample(10, 20, 3)).toEqual([10, 15, 20]);
    expect(calculateVisionVideoFrameSize(2000, 1000)).toEqual({ width: 1568 });
    expect(calculateVisionVideoFrameSize(1000, 2000)).toEqual({ height: 1568 });
    expect(calculateVisionVideoFrameSize(800, 600)).toEqual({});
  });
});
