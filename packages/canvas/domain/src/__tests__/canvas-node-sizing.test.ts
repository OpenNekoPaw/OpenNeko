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
      markdown: { width: 120, height: 80 },
      media: { width: 120, height: 90 },
      group: { width: 160, height: 110 },
      job: { width: 120, height: 75 },
      file: { width: 110, height: 75 },
      'canvas-embed': { width: 120, height: 80 },
      generation: { width: 120, height: 90 },
    });
    expect(CANVAS_AUDIO_NODE_DEFAULT_SIZE).toEqual({ width: 120, height: 60 });
  });

  it('resolves kind-specific Generation defaults without exposing mutable catalog state', () => {
    const prompt = resolveCanvasGenerationNodeDefaultSize('prompt');
    expect(prompt).toEqual({ width: 120, height: 80 });
    expect(resolveCanvasGenerationNodeDefaultSize('image')).toEqual({ width: 120, height: 90 });
    expect(resolveCanvasGenerationNodeDefaultSize('audio')).toEqual({ width: 120, height: 60 });
    expect(resolveCanvasGenerationNodeDefaultSize('video')).toEqual({ width: 120, height: 90 });

    (prompt as { width: number }).width = 999;
    expect(resolveCanvasGenerationNodeDefaultSize('prompt')).toEqual({ width: 120, height: 80 });
    expect(resolveCanvasNodeDefaultSize('markdown')).toEqual({ width: 120, height: 80 });
  });

  it('keeps resize minimums below authoring defaults', () => {
    for (const [type, minimum] of Object.entries(CANVAS_NODE_MIN_SIZES)) {
      const defaultSize = CANVAS_NODE_DEFAULT_SIZES[type as keyof typeof CANVAS_NODE_DEFAULT_SIZES];
      expect(minimum.width).toBeLessThanOrEqual(defaultSize.width);
      expect(minimum.height).toBeLessThanOrEqual(defaultSize.height);
    }
  });
});
