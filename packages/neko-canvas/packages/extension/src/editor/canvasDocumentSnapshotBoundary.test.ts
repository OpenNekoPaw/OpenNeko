import { describe, expect, it } from 'vitest';
import type { CanvasData, CanvasNode } from '@neko/shared';
import {
  applyCanvasContentNodeDelta,
  assertCanvasDocumentSnapshotBoundary,
} from './canvasDocumentSnapshotBoundary';

describe('Canvas document snapshot boundary', () => {
  it('rejects unconfirmed node loss from a Webview save snapshot', () => {
    const authoritative = canvas([node('generated-a'), node('generated-b')]);
    const candidate = canvas([]);

    expect(() =>
      assertCanvasDocumentSnapshotBoundary({
        authoritative,
        candidate,
        confirmedRemovedNodeIds: [],
      }),
    ).toThrow('unconfirmed-node-removal');
  });

  it('accepts an intentional clear when every removed node was confirmed', () => {
    const authoritative = canvas([node('generated-a'), node('generated-b')]);
    const candidate = canvas([]);

    expect(() =>
      assertCanvasDocumentSnapshotBoundary({
        authoritative,
        candidate,
        confirmedRemovedNodeIds: ['generated-a', 'generated-b'],
      }),
    ).not.toThrow();
  });

  it('rejects partial unconfirmed loss while allowing confirmed removals', () => {
    const authoritative = canvas([node('generated-a'), node('generated-b'), node('generated-c')]);
    const candidate = canvas([node('generated-c')]);

    expect(() =>
      assertCanvasDocumentSnapshotBoundary({
        authoritative,
        candidate,
        confirmedRemovedNodeIds: ['generated-a'],
      }),
    ).toThrow('generated-b');
  });

  it('does not require evidence for new nodes or retained authoritative nodes', () => {
    const authoritative = canvas([node('generated-a')]);
    const candidate = canvas([node('generated-a'), node('generated-b')]);

    expect(() =>
      assertCanvasDocumentSnapshotBoundary({
        authoritative,
        candidate,
        confirmedRemovedNodeIds: [],
      }),
    ).not.toThrow();
  });

  it('revokes deletion evidence when undo restores a node', () => {
    const afterDelete = applyCanvasContentNodeDelta([], {
      removedNodeIds: ['generated-a'],
      restoredNodeIds: [],
    });
    const afterUndo = applyCanvasContentNodeDelta(afterDelete, {
      removedNodeIds: [],
      restoredNodeIds: ['generated-a'],
    });

    expect([...afterUndo]).toEqual([]);
  });
});

function canvas(nodes: CanvasNode[]): CanvasData {
  return {
    version: '2.1',
    name: 'Workspace',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes,
    connections: [],
  };
}

function node(id: string): CanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 },
    zIndex: 0,
    data: { content: '' },
  };
}
