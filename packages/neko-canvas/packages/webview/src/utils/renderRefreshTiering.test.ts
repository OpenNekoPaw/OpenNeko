import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasNode } from '@neko/shared';
import { resolveCanvasRenderRefreshDecision } from './renderRefreshTiering';

function createNodes(count: number): CanvasNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `node-${index}`,
    type: 'annotation',
    position: { x: index * 10, y: 0 },
    size: { width: 120, height: 80 },
    zIndex: index,
    data: { content: `Node ${index}` },
  }));
}

function createConnections(count: number, nodeCount: number): CanvasConnection[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `connection-${index}`,
    sourceId: `node-${index % nodeCount}`,
    targetId: `node-${(index + 1) % nodeCount}`,
    sourceEndpoint: { nodeId: `node-${index % nodeCount}`, scope: 'node' },
    targetEndpoint: { nodeId: `node-${(index + 1) % nodeCount}`, scope: 'node' },
    type: 'reference',
  }));
}

describe('renderRefreshTiering', () => {
  it('keeps small idle canvases in the full render path', () => {
    const decision = resolveCanvasRenderRefreshDecision({
      nodes: createNodes(8),
      connections: createConnections(4, 8),
      phase: 'idle',
    });

    expect(decision).toMatchObject({
      isLargeCanvas: false,
      isVeryLargeCanvas: false,
      isDenseGraph: false,
      shouldThrottleViewportProjection: false,
      shouldFreezeConnectionProjection: false,
      shouldUseHeavyContentShell: false,
    });
  });

  it('throttles viewport-derived projections above the large canvas threshold', () => {
    const decision = resolveCanvasRenderRefreshDecision({
      nodes: createNodes(101),
      connections: createConnections(20, 101),
      phase: 'fast-viewport',
    });

    expect(decision.isLargeCanvas).toBe(true);
    expect(decision.shouldThrottleViewportProjection).toBe(true);
    expect(decision.shouldFreezeConnectionProjection).toBe(false);
  });

  it('freezes connection projection for dense transform graphs', () => {
    const decision = resolveCanvasRenderRefreshDecision({
      nodes: createNodes(40),
      connections: createConnections(90, 40),
      phase: 'transforming',
    });

    expect(decision.isDenseGraph).toBe(true);
    expect(decision.shouldFreezeConnectionProjection).toBe(true);
  });

  it('uses heavy content shell only for very large active canvases', () => {
    const idle = resolveCanvasRenderRefreshDecision({
      nodes: createNodes(501),
      connections: [],
      phase: 'idle',
    });
    const active = resolveCanvasRenderRefreshDecision({
      nodes: createNodes(501),
      connections: [],
      phase: 'fast-viewport',
    });

    expect(idle.shouldUseHeavyContentShell).toBe(false);
    expect(active.shouldUseHeavyContentShell).toBe(true);
    expect(active.maxShellDurationMs).toBe(2000);
  });
});
