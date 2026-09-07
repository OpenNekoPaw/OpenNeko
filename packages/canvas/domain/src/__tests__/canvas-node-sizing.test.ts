import { describe, expect, it } from 'vitest';
import {
  CANVAS_AUDIO_NODE_DEFAULT_SIZE,
  CANVAS_NODE_DEFAULT_SIZES,
  CANVAS_NODE_MIN_SIZES,
  CANVAS_TEXT_REFERENCE_NODE_DEFAULT_SIZE,
  resolveCanvasFileNodeDefaultSize,
  resolveCanvasImageNodeMinSize,
  resolveCanvasImageNodeSize,
  readCanvasImageDimensions,
  resolveCanvasGenerationNodeDefaultSize,
  resolveCanvasNodeDefaultSize,
} from '../canvas-node-sizing';

describe('Canvas node sizing', () => {
  it('uses one canonical default catalog with readable text surfaces', () => {
    expect(CANVAS_NODE_DEFAULT_SIZES).toEqual({
      markdown: { width: 240, height: 160 },
      media: { width: 120, height: 90 },
      group: { width: 160, height: 110 },
      job: { width: 120, height: 75 },
      file: { width: 110, height: 75 },
      'canvas-embed': { width: 120, height: 80 },
      generation: { width: 120, height: 90 },
    });
    expect(CANVAS_AUDIO_NODE_DEFAULT_SIZE).toEqual({ width: 240, height: 100 });
    expect(CANVAS_TEXT_REFERENCE_NODE_DEFAULT_SIZE).toEqual({ width: 240, height: 160 });
    expect(resolveCanvasFileNodeDefaultSize({ path: 'notes/readme.md' })).toEqual({
      width: 240,
      height: 160,
    });
    expect(
      resolveCanvasFileNodeDefaultSize({ path: 'data/result.bin', mediaType: 'application/json' }),
    ).toEqual({ width: 240, height: 160 });
    expect(resolveCanvasFileNodeDefaultSize({ path: 'books/volume.epub' })).toEqual({
      width: 110,
      height: 75,
    });
  });

  it('resolves kind-specific Generation defaults without exposing mutable catalog state', () => {
    const prompt = resolveCanvasGenerationNodeDefaultSize('prompt');
    expect(prompt).toEqual({ width: 120, height: 80 });
    expect(resolveCanvasGenerationNodeDefaultSize('image')).toEqual({ width: 120, height: 90 });
    expect(resolveCanvasGenerationNodeDefaultSize('audio')).toEqual({ width: 240, height: 100 });
    expect(resolveCanvasGenerationNodeDefaultSize('video')).toEqual({ width: 120, height: 90 });

    (prompt as { width: number }).width = 999;
    expect(resolveCanvasGenerationNodeDefaultSize('prompt')).toEqual({ width: 120, height: 80 });
    expect(resolveCanvasNodeDefaultSize('markdown')).toEqual({ width: 240, height: 160 });
  });

  it('keeps resize minimums below authoring defaults', () => {
    for (const [type, minimum] of Object.entries(CANVAS_NODE_MIN_SIZES)) {
      const defaultSize = CANVAS_NODE_DEFAULT_SIZES[type as keyof typeof CANVAS_NODE_DEFAULT_SIZES];
      expect(minimum.width).toBeLessThanOrEqual(defaultSize.width);
      expect(minimum.height).toBeLessThanOrEqual(defaultSize.height);
    }
  });

  it('fits image dimensions into one compact square bound without changing aspect ratio', () => {
    expect(resolveCanvasImageNodeSize({ width: 1600, height: 900 })).toEqual({
      width: 120,
      height: 67.5,
    });
    expect(resolveCanvasImageNodeSize({ width: 800, height: 1200 })).toEqual({
      width: 80,
      height: 120,
    });
    expect(resolveCanvasImageNodeSize({ width: 400, height: 400 })).toEqual({
      width: 120,
      height: 120,
    });
    expect(resolveCanvasImageNodeSize({ width: 100, height: 10_000 })).toEqual({
      width: 1.2,
      height: 120,
    });
  });

  it('rejects invalid image dimensions and derives a proportional image minimum', () => {
    expect(resolveCanvasImageNodeSize(undefined)).toBeUndefined();
    expect(resolveCanvasImageNodeSize({ width: 0, height: 10 })).toBeUndefined();
    expect(resolveCanvasImageNodeSize({ width: Number.NaN, height: 10 })).toBeUndefined();
    expect(resolveCanvasImageNodeSize({ aspectRatio: '2:3' })).toEqual({
      width: 80,
      height: 120,
    });
    expect(resolveCanvasImageNodeSize({ aspectRatio: 'invalid' })).toBeUndefined();
    expect(readCanvasImageDimensions({ width: 800, height: 1200 })).toEqual({
      width: 800,
      height: 1200,
    });
    expect(readCanvasImageDimensions({ width: 800, height: 0 })).toBeUndefined();
    expect(resolveCanvasImageNodeMinSize({ width: 80, height: 120 })).toEqual({
      width: 100 / 3,
      height: 50,
    });
    expect(resolveCanvasImageNodeMinSize({ width: 10, height: 20 })).toEqual({
      width: 10,
      height: 20,
    });
  });
});
