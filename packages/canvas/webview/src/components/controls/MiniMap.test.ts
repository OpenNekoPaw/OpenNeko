import type { MarkdownCanvasNode } from '@neko/canvas-domain';
import { describe, expect, it } from 'vitest';
import {
  createBuiltInMiniMapNodeStyleRegistry,
  resolveMiniMapGeometry,
  resolveMiniMapNodeStyle,
} from './MiniMap';

describe('MiniMap node style registry', () => {
  it('registers built-in minimap styles for canvas node types', () => {
    const registry = createBuiltInMiniMapNodeStyleRegistry();

    expect(registry.media?.fill).toBe('#4ec9b0');
    expect(registry.markdown.fill).toBe('#dcdcaa');
    expect(registry.group?.fill).toBe('#569cd6');
    expect(registry.job.fill).toBe('#c586c0');
    expect(registry.file.fill).toBe('#ef4444');
    expect(registry['canvas-embed'].fill).toBe('#ce9178');
  });

  it('resolves the registered style for a canonical node type', () => {
    const style = resolveMiniMapNodeStyle(createBuiltInMiniMapNodeStyleRegistry(), 'media');

    expect(style.fill).toBe('#4ec9b0');
  });

  it('projects compact node dimensions proportionally against the visible Canvas viewport', () => {
    const originalNode = createMarkdownNode({ width: 240, height: 160 });
    const compactNode = createMarkdownNode({ width: 120, height: 80 });
    const projection = {
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      containerWidth: 800,
      containerHeight: 600,
      width: 200,
      height: 150,
    };

    const originalGeometry = resolveMiniMapGeometry({ nodes: [originalNode], ...projection });
    const compactGeometry = resolveMiniMapGeometry({ nodes: [compactNode], ...projection });

    expect(compactGeometry.scale).toBe(originalGeometry.scale);
    expect(compactNode.size.width * compactGeometry.scale).toBeCloseTo(
      (originalNode.size.width * originalGeometry.scale) / 2,
    );
    expect(compactNode.size.height * compactGeometry.scale).toBeCloseTo(
      (originalNode.size.height * originalGeometry.scale) / 2,
    );
  });

  it('keeps the viewport indicator and distant nodes in the same world-space bounds', () => {
    const node = createMarkdownNode({ width: 120, height: 80 }, { x: 900, y: 700 });
    const geometry = resolveMiniMapGeometry({
      nodes: [node],
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      containerWidth: 800,
      containerHeight: 600,
      width: 200,
      height: 150,
    });

    expect(geometry.bounds.minX).toBe(-20);
    expect(geometry.bounds.minY).toBe(-20);
    expect(geometry.bounds.maxX).toBe(1040);
    expect(geometry.bounds.maxY).toBe(800);
    expect(geometry.viewportRect.x).toBeGreaterThanOrEqual(10);
    expect(geometry.viewportRect.y).toBeGreaterThanOrEqual(10);
    expect(geometry.viewportRect.x + geometry.viewportRect.width).toBeLessThanOrEqual(190);
    expect(geometry.viewportRect.y + geometry.viewportRect.height).toBeLessThanOrEqual(140);
  });
});

function createMarkdownNode(
  size: MarkdownCanvasNode['size'],
  position: MarkdownCanvasNode['position'] = { x: 100, y: 100 },
): MarkdownCanvasNode {
  return {
    id: 'markdown-node',
    type: 'markdown',
    position,
    size,
    zIndex: 1,
    data: { content: 'Preview' },
  };
}
