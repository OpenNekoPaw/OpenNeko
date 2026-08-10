import { describe, expect, it } from 'vitest';
import {
  CANVAS_AUDIO_NODE_DEFAULT_SIZE,
  CANVAS_NODE_DEFAULT_SIZES,
  CANVAS_NODE_MIN_SIZES,
  resolveCanvasGenerationNodeDefaultSize,
  resolveCanvasNodeDefaultSize,
} from '../canvas-node-sizing';

describe('Canvas node sizing', () => {
  it('uses one compact default catalog for canonical authoring paths', () => {
    expect(CANVAS_NODE_DEFAULT_SIZES).toEqual({
      markdown: { width: 240, height: 160 },
      media: { width: 240, height: 180 },
      group: { width: 320, height: 220 },
      job: { width: 240, height: 150 },
      file: { width: 220, height: 150 },
      'canvas-embed': { width: 240, height: 160 },
      generation: { width: 240, height: 180 },
    });
    expect(CANVAS_AUDIO_NODE_DEFAULT_SIZE).toEqual({ width: 240, height: 120 });
  });

  it('resolves kind-specific Generation defaults without exposing mutable catalog state', () => {
    const prompt = resolveCanvasGenerationNodeDefaultSize('prompt');
    expect(prompt).toEqual({ width: 240, height: 160 });
    expect(resolveCanvasGenerationNodeDefaultSize('image')).toEqual({ width: 240, height: 180 });
    expect(resolveCanvasGenerationNodeDefaultSize('audio')).toEqual({ width: 240, height: 120 });
    expect(resolveCanvasGenerationNodeDefaultSize('video')).toEqual({ width: 240, height: 180 });

    (prompt as { width: number }).width = 999;
    expect(resolveCanvasGenerationNodeDefaultSize('prompt')).toEqual({ width: 240, height: 160 });
    expect(resolveCanvasNodeDefaultSize('markdown')).toEqual({ width: 240, height: 160 });
  });

  it('keeps resize minimums below authoring defaults', () => {
    for (const [type, minimum] of Object.entries(CANVAS_NODE_MIN_SIZES)) {
      const defaultSize = CANVAS_NODE_DEFAULT_SIZES[type as keyof typeof CANVAS_NODE_DEFAULT_SIZES];
      expect(minimum.width).toBeLessThanOrEqual(defaultSize.width);
      expect(minimum.height).toBeLessThanOrEqual(defaultSize.height);
    }
  });
});
