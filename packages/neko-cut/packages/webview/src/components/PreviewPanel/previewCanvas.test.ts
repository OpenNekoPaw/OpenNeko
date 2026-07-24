import { describe, expect, it } from 'vitest';
import { containSourceRect } from './previewCanvas';

describe('Preview Canvas contain geometry', () => {
  it('letterboxes a landscape source inside a short-video Canvas without cropping or stretching', () => {
    expect(containSourceRect(1920, 1080, 1080, 1920)).toEqual({
      x: 0,
      y: 656.25,
      width: 1080,
      height: 607.5,
    });
  });

  it('pillarboxes a portrait source inside a TV Canvas without cropping or stretching', () => {
    expect(containSourceRect(1080, 1920, 1920, 1080)).toEqual({
      x: 656.25,
      y: 0,
      width: 607.5,
      height: 1080,
    });
  });

  it('rejects non-positive source or Canvas dimensions', () => {
    expect(() => containSourceRect(0, 1080, 1920, 1080)).toThrow(
      'Preview dimensions must be finite positive numbers.',
    );
  });
});
