import { describe, it, expect, beforeEach } from 'vitest';
import { SnapEngine } from '../snapEngine';
import type { CanvasNode } from '@neko/shared';

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

describe('SnapEngine', () => {
  let engine: SnapEngine;

  beforeEach(() => {
    engine = new SnapEngine();
  });

  // ===========================================================================
  // Grid Snapping
  // ===========================================================================

  describe('grid snapping', () => {
    it('should snap to nearest grid line when within threshold', () => {
      // Default grid = 20, threshold = 8
      // Position x=23 is 3 away from grid line 20 (within threshold 8)
      const result = engine.snap({ x: 23, y: 45 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(20);
      expect(result.position.y).toBe(40);
      expect(result.horizontal?.type).toBe('grid');
      expect(result.vertical?.type).toBe('grid');
    });

    it('should not snap when beyond threshold', () => {
      // Position x=11 is 11 away from grid 0 and 9 away from grid 20 (beyond threshold 8)
      const result = engine.snap({ x: 11, y: 11 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(false);
      expect(result.position.x).toBe(11);
      expect(result.position.y).toBe(11);
      expect(result.horizontal).toBeNull();
      expect(result.vertical).toBeNull();
    });

    it('should work with different grid sizes', () => {
      engine.setConfig({ gridSize: 50 });

      // Position x=47 is 3 away from grid 50 (within threshold 8)
      const result = engine.snap({ x: 47, y: 103 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(50);
      expect(result.position.y).toBe(100);
    });

    it('should handle position exactly on grid', () => {
      const result = engine.snap({ x: 40, y: 60 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(40);
      expect(result.position.y).toBe(60);
      expect(result.horizontal?.type).toBe('grid');
      expect(result.horizontal?.value).toBe(40);
    });
  });

  // ===========================================================================
  // Node Edge Snapping
  // ===========================================================================

  describe('node edge snapping', () => {
    beforeEach(() => {
      // Disable center snapping to isolate edge snapping behavior.
      // Center snap runs after edge snap and can override it when both
      // centers are within threshold.
      engine = new SnapEngine({
        gridEnabled: false,
        nodeEnabled: true,
        centerEnabled: false,
        threshold: 8,
      });
    });

    it('should snap left edge to reference node left edge', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setNodes([refNode]);

      // Moving node's left edge (x=203) near ref node's left edge (x=200)
      const result = engine.snap({ x: 203, y: 50 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(200);
      expect(result.horizontal?.type).toBe('node-edge');
      expect(result.horizontal?.nodeId).toBe('ref');
    });

    it('should snap right edge to reference node right edge', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setNodes([refNode]);

      // Moving node right edge = x + 100, ref right = 300
      // x=197, right=297, diff from 300 = 3 (within threshold)
      const result = engine.snap({ x: 197, y: 50 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(200); // right edge = 300 = ref right
      expect(result.horizontal?.type).toBe('node-edge');
      expect(result.horizontal?.nodeId).toBe('ref');
    });

    it('should snap left edge to reference node right edge (docking)', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setNodes([refNode]);

      // Moving node's left edge (x=303) near ref node's right edge (300)
      const result = engine.snap({ x: 303, y: 50 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(300);
      expect(result.horizontal?.type).toBe('node-edge');
      expect(result.horizontal?.value).toBe(300);
    });

    it('should snap right edge to reference node left edge (docking)', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setNodes([refNode]);

      // Moving node's right edge (x + 100 = 198) near ref's left (200), diff = 2
      const result = engine.snap({ x: 98, y: 50 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(100); // right edge = 200 = ref left
      expect(result.horizontal?.type).toBe('node-edge');
      expect(result.horizontal?.value).toBe(200);
    });

    it('should not snap excluded nodes', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setNodes([refNode], ['ref']);

      // Even though position is within snapping distance, ref node is excluded
      const result = engine.snap({ x: 203, y: 203 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(false);
      expect(result.horizontal).toBeNull();
      expect(result.vertical).toBeNull();
    });

    it('node snapping should override grid snapping', () => {
      // Use a full engine with grid + node enabled (but center disabled)
      engine = new SnapEngine({
        gridEnabled: true,
        gridSize: 20,
        nodeEnabled: true,
        centerEnabled: false,
        threshold: 8,
      });

      // Ref node left edge at x=205 (NOT on a grid line)
      const offGridRef = createNode('off-grid', 205, 105, 100, 80);
      engine.setNodes([offGridRef]);

      // Position x=202: nearest grid line is 200 (diff=2), but ref left edge is 205 (diff=3)
      // Both within threshold. Node snap runs after grid and overrides.
      const result = engine.snap({ x: 202, y: 50 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(205);
      expect(result.horizontal?.type).toBe('node-edge');
      expect(result.horizontal?.nodeId).toBe('off-grid');
    });

    it('should snap top edge to reference node top edge', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setNodes([refNode]);

      // Moving node's top (y=203) near ref's top (y=200)
      const result = engine.snap({ x: 50, y: 203 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.y).toBe(200);
      expect(result.vertical?.type).toBe('node-edge');
      expect(result.vertical?.nodeId).toBe('ref');
    });

    it('should snap bottom edge to reference node bottom edge', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setNodes([refNode]);

      // ref bottom = 200 + 80 = 280
      // Moving node bottom = y + 80, want diff < 8
      // y = 197 => bottom = 277, diff from 280 = 3
      const result = engine.snap({ x: 50, y: 197 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.y).toBe(200); // top-top edge snap (diff=3, checked first)
      expect(result.vertical?.type).toBe('node-edge');
    });
  });

  // ===========================================================================
  // Center Snapping
  // ===========================================================================

  describe('center snapping', () => {
    const refNode = createNode('center-ref', 200, 200, 100, 80);

    beforeEach(() => {
      // Disable grid and edge snapping to isolate center snapping
      engine = new SnapEngine({
        gridEnabled: false,
        nodeEnabled: false,
        centerEnabled: true,
        threshold: 8,
      });
      engine.setNodes([refNode]);
    });

    it('should snap center X to reference node center X', () => {
      // ref center X = 200 + 50 = 250
      // moving node center X = x + 50, want diff < 8
      // x + 50 = 253 => x = 203, diff to ref center = 3
      const result = engine.snap({ x: 203, y: 50 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(200); // center aligned with ref center X = 250
      expect(result.horizontal?.type).toBe('node-center');
      expect(result.horizontal?.nodeId).toBe('center-ref');
    });

    it('should snap center Y to reference node center Y', () => {
      // ref center Y = 200 + 40 = 240
      // moving node center Y = y + 40, want diff < 8
      // y + 40 = 243 => y = 203, diff = 3
      const result = engine.snap({ x: 50, y: 203 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.y).toBe(200); // center aligned with ref center Y = 240
      expect(result.vertical?.type).toBe('node-center');
      expect(result.vertical?.nodeId).toBe('center-ref');
    });

    it('should override edge snap when both are within threshold', () => {
      // When both nodeEnabled and centerEnabled are true, center snap
      // runs last and overrides edge snap for the same axis.
      engine = new SnapEngine({
        gridEnabled: false,
        nodeEnabled: true,
        centerEnabled: true,
        threshold: 8,
      });
      engine.setNodes([refNode]);

      // Both left-edge and center-X are within threshold (same-size nodes)
      const result = engine.snap({ x: 203, y: 50 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      // Center snap should win since it runs after edge snap
      expect(result.horizontal?.type).toBe('node-center');
    });
  });

  // ===========================================================================
  // Generate Guides
  // ===========================================================================

  describe('generateGuides', () => {
    const refNode = createNode('guide-ref', 200, 200, 100, 80);

    it('should generate vertical guide for horizontal snap', () => {
      // Use edge-only snapping for predictable guide positions
      engine = new SnapEngine({
        gridEnabled: false,
        nodeEnabled: true,
        centerEnabled: false,
        threshold: 8,
      });
      engine.setNodes([refNode]);

      // Snap to ref left edge x=200
      const guides = engine.generateGuides({ x: 203, y: 50 }, { width: 100, height: 80 });

      const verticalGuide = guides.find((g) => g.direction === 'vertical');
      expect(verticalGuide).toBeDefined();
      expect(verticalGuide?.position).toBe(200);
      expect(verticalGuide?.type).toBe('edge');
    });

    it('should generate horizontal guide for vertical snap', () => {
      engine = new SnapEngine({
        gridEnabled: false,
        nodeEnabled: true,
        centerEnabled: false,
        threshold: 8,
      });
      engine.setNodes([refNode]);

      // Snap to ref top edge y=200
      const guides = engine.generateGuides({ x: 50, y: 203 }, { width: 100, height: 80 });

      const horizontalGuide = guides.find((g) => g.direction === 'horizontal');
      expect(horizontalGuide).toBeDefined();
      expect(horizontalGuide?.position).toBe(200);
      expect(horizontalGuide?.type).toBe('edge');
    });

    it('should return empty when no snap', () => {
      engine = new SnapEngine({
        gridEnabled: false,
        nodeEnabled: true,
        centerEnabled: true,
        threshold: 8,
      });
      engine.setNodes([refNode]);

      // Position far from any snap target
      const guides = engine.generateGuides({ x: 500, y: 500 }, { width: 100, height: 80 });

      expect(guides).toHaveLength(0);
    });

    it('should generate center-type guide for center snap', () => {
      engine = new SnapEngine({
        gridEnabled: false,
        nodeEnabled: false,
        centerEnabled: true,
        threshold: 8,
      });
      engine.setNodes([refNode]);

      // ref center X = 250, moving center X = x + 50
      // x = 203 => center = 253, diff = 3
      const guides = engine.generateGuides({ x: 203, y: 50 }, { width: 100, height: 80 });

      const centerGuide = guides.find((g) => g.type === 'center');
      expect(centerGuide).toBeDefined();
      expect(centerGuide?.direction).toBe('vertical');
      expect(centerGuide?.position).toBe(250); // center X of ref node
    });

    it('should not generate guides for grid-only snap', () => {
      // Grid snap does not produce guides (only node snaps do)
      engine = new SnapEngine({
        gridEnabled: true,
        nodeEnabled: false,
        centerEnabled: false,
        threshold: 8,
      });

      const guides = engine.generateGuides({ x: 23, y: 45 }, { width: 100, height: 80 });

      expect(guides).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Configuration
  // ===========================================================================

  describe('configuration', () => {
    it('should disable grid snapping when gridEnabled is false', () => {
      engine.setConfig({ gridEnabled: false });

      // Position near grid line but no node references
      const result = engine.snap({ x: 23, y: 45 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(false);
      expect(result.horizontal).toBeNull();
      expect(result.vertical).toBeNull();
    });

    it('should use default config', () => {
      const defaultEngine = new SnapEngine();
      // Default config should match DEFAULT_SNAP_CONFIG
      // Grid enabled, gridSize 20, threshold 8

      // Position x=22 is 2 away from grid 20 (within threshold 8)
      const result = defaultEngine.snap({ x: 22, y: 18 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(20);
      expect(result.position.y).toBe(20);
    });

    it('should update config via setConfig', () => {
      engine.setConfig({ threshold: 2 });

      // Position x=23 is 3 away from grid 20 (beyond new threshold 2)
      const result = engine.snap({ x: 23, y: 45 }, { width: 100, height: 80 });

      expect(result.horizontal).toBeNull();
    });

    it('should disable node snapping when nodeEnabled is false', () => {
      const refNode = createNode('ref', 200, 200, 100, 80);
      engine.setConfig({ nodeEnabled: false, centerEnabled: false, gridEnabled: false });
      engine.setNodes([refNode]);

      const result = engine.snap({ x: 203, y: 203 }, { width: 100, height: 80 });

      expect(result.snapped).toBe(false);
    });
  });
});
