import { describe, it, expect } from 'vitest';
import {
  getViewportBounds,
  isNodeVisible,
  cullNodes,
  getNodesBounds,
  calculateFitViewport,
  VIEWPORT_BUFFER,
} from '../viewportCulling';
import type { CanvasNode, CanvasViewport } from '@neko/shared';
import type { ViewportBounds } from '../viewportCulling';

// =============================================================================
// Test Helpers
// =============================================================================

function createNode(id: string, x: number, y: number, width = 100, height = 80): CanvasNode {
  return {
    id,
    type: 'annotation',
    position: { x, y },
    size: { width, height },
    zIndex: 0,
    data: { content: '' },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('viewportCulling', () => {
  // ===========================================================================
  // getViewportBounds
  // ===========================================================================

  describe('getViewportBounds', () => {
    it('should calculate bounds at zoom 1 with no pan', () => {
      const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };
      const bounds = getViewportBounds(viewport, 1000, 800, 0);

      // Formula: left = (-pan.x - buffer) / zoom = (-0 - 0) / 1 = -0
      // Use toBeCloseTo to handle -0 vs +0 distinction
      expect(bounds.left).toBeCloseTo(0);
      expect(bounds.top).toBeCloseTo(0);
      expect(bounds.right).toBe(1000);
      expect(bounds.bottom).toBe(800);
    });

    it('should handle panning offset', () => {
      // Panning by (200, 100) shifts the viewport origin in canvas space
      const viewport: CanvasViewport = { pan: { x: 200, y: 100 }, zoom: 1 };
      const bounds = getViewportBounds(viewport, 1000, 800, 0);

      // left = (-200 - 0) / 1 = -200
      expect(bounds.left).toBe(-200);
      expect(bounds.top).toBe(-100);
      expect(bounds.right).toBe(800); // (1000 - 200) / 1
      expect(bounds.bottom).toBe(700); // (800 - 100) / 1
    });

    it('should handle zoom factor', () => {
      const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 2 };
      const bounds = getViewportBounds(viewport, 1000, 800, 0);

      // At zoom 2, the visible canvas area is half the screen size
      // left = (-0 - 0) / 2 = -0, use toBeCloseTo to handle -0
      expect(bounds.left).toBeCloseTo(0);
      expect(bounds.top).toBeCloseTo(0);
      expect(bounds.right).toBe(500); // 1000 / 2
      expect(bounds.bottom).toBe(400); // 800 / 2
    });

    it('should include buffer', () => {
      const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };
      const buffer = 100;
      const bounds = getViewportBounds(viewport, 1000, 800, buffer);

      // Buffer expands the bounds in all directions
      expect(bounds.left).toBe(-100); // (-0 - 100) / 1
      expect(bounds.top).toBe(-100);
      expect(bounds.right).toBe(1100); // (1000 - 0 + 100) / 1
      expect(bounds.bottom).toBe(900);
    });

    it('should use default buffer when not specified', () => {
      const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };
      const bounds = getViewportBounds(viewport, 1000, 800);

      // Default buffer is VIEWPORT_BUFFER = 100
      expect(bounds.left).toBe(-VIEWPORT_BUFFER);
      expect(bounds.top).toBe(-VIEWPORT_BUFFER);
    });
  });

  // ===========================================================================
  // isNodeVisible
  // ===========================================================================

  describe('isNodeVisible', () => {
    const viewportBounds: ViewportBounds = {
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
    };

    it('should return true for fully visible node', () => {
      const node = createNode('a', 100, 100, 200, 150);
      expect(isNodeVisible(node, viewportBounds)).toBe(true);
    });

    it('should return true for partially visible node', () => {
      // Node extends beyond the right edge but overlaps with viewport
      const node = createNode('b', 950, 100, 200, 150);
      expect(isNodeVisible(node, viewportBounds)).toBe(true);
    });

    it('should return false for node completely outside', () => {
      // Node is entirely to the right of viewport
      const node = createNode('c', 1100, 100, 200, 150);
      expect(isNodeVisible(node, viewportBounds)).toBe(false);
    });

    it('should return false for node above viewport', () => {
      const node = createNode('above', 100, -200, 100, 80);
      expect(isNodeVisible(node, viewportBounds)).toBe(false);
    });

    it('should return false for node below viewport', () => {
      const node = createNode('below', 100, 900, 100, 80);
      expect(isNodeVisible(node, viewportBounds)).toBe(false);
    });

    it('should return true for node at viewport edge', () => {
      // Node right edge exactly touches viewport left edge:
      // nodeRight = -100 + 100 = 0, viewportBounds.left = 0
      // The check is nodeRight < left, so 0 < 0 is false => visible
      const node = createNode('edge', -100, 100, 100, 80);
      expect(isNodeVisible(node, viewportBounds)).toBe(true);
    });

    it('should return true for node spanning entire viewport', () => {
      const node = createNode('huge', -100, -100, 1200, 1000);
      expect(isNodeVisible(node, viewportBounds)).toBe(true);
    });
  });

  // ===========================================================================
  // cullNodes
  // ===========================================================================

  describe('cullNodes', () => {
    it('should return all nodes when all visible', () => {
      const nodes = [
        createNode('a', 100, 100),
        createNode('b', 200, 200),
        createNode('c', 300, 300),
      ];
      const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };

      const result = cullNodes(nodes, viewport, 1000, 800);

      expect(result.visibleNodes).toHaveLength(3);
      expect(result.culledCount).toBe(0);
      expect(result.totalCount).toBe(3);
    });

    it('should cull nodes outside viewport', () => {
      const nodes = [
        createNode('visible', 100, 100),
        createNode('far-right', 5000, 100),
        createNode('far-below', 100, 5000),
      ];
      const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };

      const result = cullNodes(nodes, viewport, 1000, 800);

      expect(result.visibleNodes).toHaveLength(1);
      expect(result.visibleNodes[0]?.id).toBe('visible');
      expect(result.culledCount).toBe(2);
      expect(result.totalCount).toBe(3);
    });

    it('should handle empty node list', () => {
      const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };
      const result = cullNodes([], viewport, 1000, 800);

      expect(result.visibleNodes).toHaveLength(0);
      expect(result.culledCount).toBe(0);
      expect(result.totalCount).toBe(0);
    });
  });

  // ===========================================================================
  // getNodesBounds
  // ===========================================================================

  describe('getNodesBounds', () => {
    it('should return null for empty array', () => {
      expect(getNodesBounds([])).toBeNull();
    });

    it('should calculate correct bounds for single node', () => {
      const nodes = [createNode('a', 50, 100, 200, 150)];
      const bounds = getNodesBounds(nodes);

      expect(bounds).toEqual({
        x: 50,
        y: 100,
        width: 200,
        height: 150,
      });
    });

    it('should calculate correct bounds for multiple nodes', () => {
      const nodes = [
        createNode('a', 50, 100, 200, 150), // right=250, bottom=250
        createNode('b', 300, 50, 100, 80), // right=400, bottom=130
        createNode('c', 10, 200, 50, 300), // right=60, bottom=500
      ];
      const bounds = getNodesBounds(nodes);

      expect(bounds).toEqual({
        x: 10, // min x
        y: 50, // min y
        width: 390, // 400 - 10
        height: 450, // 500 - 50
      });
    });
  });

  // ===========================================================================
  // calculateFitViewport
  // ===========================================================================

  describe('calculateFitViewport', () => {
    it('should center content in viewport', () => {
      const bounds = { x: 100, y: 100, width: 200, height: 200 };
      const result = calculateFitViewport(bounds, 1000, 800, 0);

      // Center of bounds: (200, 200)
      // zoom = min(1000/200, 800/200) = min(5, 4) = 4 => clamped to 4
      // But maxZoom is 16, so zoom = 4
      // panX = 1000/2 - 200 * 4 = 500 - 800 = -300
      // panY = 800/2 - 200 * 4 = 400 - 800 = -400
      expect(result.zoom).toBe(4);
      expect(result.pan.x).toBe(-300);
      expect(result.pan.y).toBe(-400);
    });

    it('should clamp zoom between min and max', () => {
      // Very large content should clamp zoom to minZoom
      const bounds = { x: 0, y: 0, width: 100000, height: 100000 };
      const result = calculateFitViewport(bounds, 1000, 800, 50, 0.05, 16);

      expect(result.zoom).toBeGreaterThanOrEqual(0.05);
      expect(result.zoom).toBeLessThanOrEqual(16);
    });

    it('should handle zero-size bounds', () => {
      const bounds = { x: 100, y: 100, width: 0, height: 0 };
      const result = calculateFitViewport(bounds, 1000, 800);

      expect(result.pan).toEqual({ x: 0, y: 0 });
      expect(result.zoom).toBe(1);
    });

    it('should handle zero-width bounds', () => {
      const bounds = { x: 100, y: 100, width: 0, height: 200 };
      const result = calculateFitViewport(bounds, 1000, 800);

      // width === 0 triggers early return
      expect(result.pan).toEqual({ x: 0, y: 0 });
      expect(result.zoom).toBe(1);
    });

    it('should account for padding', () => {
      const bounds = { x: 0, y: 0, width: 800, height: 600 };
      const padding = 100;
      const result = calculateFitViewport(bounds, 1000, 800, padding);

      // availableWidth = 1000 - 200 = 800, availableHeight = 800 - 200 = 600
      // scaleX = 800/800 = 1, scaleY = 600/600 = 1, zoom = 1
      expect(result.zoom).toBe(1);
    });
  });
});
