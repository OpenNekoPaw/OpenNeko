import { describe, expect, it } from 'vitest';
import { aspectRatioPreviewSize } from './aspect-ratio-preview';

describe('aspectRatioPreviewSize', () => {
  it('normalizes landscape, portrait, and square ratios to the same outer edge', () => {
    expect(aspectRatioPreviewSize('16:9')).toEqual({ width: 18, height: 10.125 });
    expect(aspectRatioPreviewSize('9:16')).toEqual({ width: 10.125, height: 18 });
    expect(aspectRatioPreviewSize('1:1')).toEqual({ width: 18, height: 18 });
  });

  it('uses the canonical square preview for malformed values', () => {
    expect(aspectRatioPreviewSize('invalid')).toEqual({ width: 18, height: 18 });
    expect(aspectRatioPreviewSize('16:0')).toEqual({ width: 18, height: 18 });
  });
});
