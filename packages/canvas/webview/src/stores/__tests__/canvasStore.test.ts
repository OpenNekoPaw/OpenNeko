import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CanvasConnection,
  CanvasData,
  CanvasNode,
  GroupCanvasNode,
  MarkdownCanvasNode,
  MediaCanvasNode,
} from '@neko/canvas-domain';
import { createNodeConnectionEndpoint, createPortConnectionEndpoint } from '@neko/canvas-domain';
import { canCreateCanvasConnection, useCanvasStore } from '../canvasStore';
import { useHistoryStore } from '../historyStore';
import { useCanvasOperationStore } from '../canvasOperationStore';

function markdown(id: string, x: number, y: number, parentId?: string): MarkdownCanvasNode {
  return {
    id,
    type: 'markdown',
    ...(parentId ? { parentId } : {}),
    position: { x, y },
    size: { width: 280, height: 180 },
    zIndex: 1,
    data: { content: id },
  };
}

function media(id: string, x: number, y: number, parentId?: string): MediaCanvasNode {
  return {
    id,
    type: 'media',
    ...(parentId ? { parentId } : {}),
    position: { x, y },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data: { assetPath: `media/${id}.png`, mediaType: 'image' },
  };
}

function group(
  id: string,
  childIds: string[],
  x = 0,
  y = 0,
  width = 600,
  height = 440,
  parentId?: string,
): GroupCanvasNode {
  return {
    id,
    type: 'group',
    ...(parentId ? { parentId } : {}),
    position: { x, y },
    size: { width, height },
    zIndex: 0,
    container: {
      policy: 'group',
      childIds,
      layout: { mode: 'manual' },
      deleteBehavior: 'release-children',
    },
    data: { label: id },
  };
}

function canvas(nodes: CanvasNode[], connections: CanvasConnection[] = []): CanvasData {
  return {
    version: '3.0',
    name: 'Canonical Canvas Test',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes,
    connections,
  };
}

function connection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasConnection['type'] = 'reference',
): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    type,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
  };
}

describe('canvasStore canonical workspace', () => {
  let recordNodeUpdateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    recordNodeUpdateSpy = vi.spyOn(useCanvasOperationStore.getState(), 'recordNodeUpdate');
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
    });
    useHistoryStore.setState({ undoStack: [], redoStack: [], maxHistory: 50 });
  });

  afterEach(() => vi.restoreAllMocks());

  it('moves a Markdown node into and out of a Group using spatial membership', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        canvas([group('group-1', [], 100, 100, 720, 420), markdown('note-1', 900, 900)]),
      );

    useCanvasStore.getState().moveNodeEnd('note-1', { x: 180, y: 220 });

    let state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.find((node) => node.id === 'note-1')?.parentId).toBe('group-1');
    expect(state?.nodes.find((node) => node.id === 'group-1')?.container?.childIds).toEqual([
      'note-1',
    ]);

    useCanvasStore.getState().moveNodeEnd('note-1', { x: 980, y: 980 });

    state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.find((node) => node.id === 'note-1')?.parentId).toBeUndefined();
    expect(state?.nodes.find((node) => node.id === 'group-1')?.container?.childIds).toEqual([]);
  });

  it('preserves canonical connections while membership changes', () => {
    const reference = connection('ref', 'note-1', 'media-1');
    useCanvasStore
      .getState()
      .setCanvasData(
        canvas(
          [
            group('group-1', [], 100, 100, 720, 420),
            markdown('note-1', 900, 900),
            media('media-1', 1200, 900),
          ],
          [reference],
        ),
      );

    useCanvasStore.getState().moveNodeEnd('note-1', { x: 180, y: 220 });
    useCanvasStore.getState().moveNodeEnd('note-1', { x: 980, y: 980 });

    expect(useCanvasStore.getState().canvasData?.connections).toEqual([reference]);
  });

  it('records a single history and operation entry for a committed transform', () => {
    useCanvasStore.getState().setCanvasData(canvas([markdown('note-1', 100, 100)]));

    useCanvasStore.getState().moveNodeEnd('note-1', { x: 160, y: 180 });
    useCanvasStore.getState().moveNodeEnd('note-1', { x: 160, y: 180 });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(recordNodeUpdateSpy).toHaveBeenCalledTimes(1);
  });

  it('groups and ungroups heterogeneous canonical nodes', () => {
    useCanvasStore
      .getState()
      .setCanvasData(canvas([markdown('note-1', 100, 100), media('media-1', 420, 100)]));

    const groupId = useCanvasStore.getState().groupNodes(['note-1', 'media-1']);
    let state = useCanvasStore.getState().canvasData;

    expect(state?.nodes.find((node) => node.id === groupId)?.container?.childIds).toEqual([
      'note-1',
      'media-1',
    ]);
    expect(state?.nodes.find((node) => node.id === 'media-1')?.parentId).toBe(groupId);

    useCanvasStore.getState().ungroupNodes(groupId);
    state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.some((node) => node.id === groupId)).toBe(false);
    expect(state?.nodes.find((node) => node.id === 'media-1')?.parentId).toBeUndefined();
  });

  it('moves nested Group descendants by exactly the parent delta', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        canvas([
          group('outer', ['inner']),
          group('inner', ['child'], 20, 80, 360, 280, 'outer'),
          markdown('child', 60, 160, 'inner'),
        ]),
      );

    useCanvasStore.getState().moveNodeEnd('outer', { x: 100, y: 50 });

    const nodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    expect(nodes.find((node) => node.id === 'inner')?.position).toEqual({ x: 120, y: 130 });
    expect(nodes.find((node) => node.id === 'child')?.position).toEqual({ x: 160, y: 210 });
  });

  it('deleting a Group releases children and preserves child connections', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        canvas(
          [
            group('group-1', ['note-1']),
            markdown('note-1', 40, 100, 'group-1'),
            media('media-1', 700, 100),
          ],
          [connection('ref', 'note-1', 'media-1')],
        ),
      );

    useCanvasStore.getState().removeNode('group-1');

    const state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.map((node) => node.id)).toEqual(['note-1', 'media-1']);
    expect(state?.nodes.find((node) => node.id === 'note-1')?.parentId).toBeUndefined();
    expect(state?.connections).toHaveLength(1);
  });

  it('deleting a selected Group and selected child removes only selected nodes', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        canvas([
          group('group-1', ['selected', 'released']),
          markdown('selected', 40, 100, 'group-1'),
          media('released', 340, 100, 'group-1'),
        ]),
      );
    useCanvasStore.getState().selectNodes(['group-1', 'selected']);

    useCanvasStore.getState().deleteSelected();

    const nodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    expect(nodes.map((node) => node.id)).toEqual(['released']);
    expect(nodes[0]?.parentId).toBeUndefined();
  });

  it('rejects cycles for sequence and derived-from connections', () => {
    const first = markdown('first', 0, 0);
    const second = markdown('second', 320, 0);
    const reverseSequence = connection('reverse', 'second', 'first', 'sequence');

    expect(
      canCreateCanvasConnection(
        [first, second],
        {
          sourceId: 'first',
          targetId: 'second',
          type: 'sequence',
        },
        [reverseSequence],
      ),
    ).toBe(false);
    expect(
      canCreateCanvasConnection(
        [first, second],
        {
          sourceId: 'first',
          targetId: 'second',
          type: 'reference',
        },
        [connection('reverse-ref', 'second', 'first', 'reference')],
      ),
    ).toBe(true);
  });

  it('commits a Media-to-Media sequence through compatible ports exactly once', () => {
    useCanvasStore
      .getState()
      .setCanvasData(canvas([media('source', 0, 0), media('target', 320, 0)]));

    const result = useCanvasStore.getState().addConnection({
      sourceId: 'source',
      targetId: 'target',
      type: 'sequence',
      sourceEndpoint: createPortConnectionEndpoint('source', 'out'),
      targetEndpoint: createPortConnectionEndpoint('target', 'in'),
    });

    expect(result).toMatchObject({ ok: true });
    expect(useCanvasStore.getState().canvasData?.connections).toEqual([
      expect.objectContaining({
        sourceId: 'source',
        targetId: 'target',
        type: 'sequence',
      }),
    ]);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('rejects duplicate and self sequence drafts without recording history', () => {
    const existing = connection('existing', 'source', 'target', 'sequence');
    useCanvasStore
      .getState()
      .setCanvasData(canvas([media('source', 0, 0), media('target', 320, 0)], [existing]));

    const duplicate = useCanvasStore.getState().addConnection({
      sourceId: 'source',
      targetId: 'target',
      type: 'sequence',
      sourceEndpoint: createNodeConnectionEndpoint('source'),
      targetEndpoint: createNodeConnectionEndpoint('target'),
    });
    const self = useCanvasStore.getState().addConnection({
      sourceId: 'source',
      targetId: 'source',
      type: 'sequence',
      sourceEndpoint: createNodeConnectionEndpoint('source'),
      targetEndpoint: createNodeConnectionEndpoint('source'),
    });

    expect(duplicate).toEqual({ ok: false, reason: 'duplicate' });
    expect(self).toEqual({ ok: false, reason: 'self-connection' });
    expect(useCanvasStore.getState().canvasData?.connections).toEqual([existing]);
    expect(useHistoryStore.getState().undoStack).toEqual([]);
  });

  it('validates connection type updates and preserves the original edge on rejection', () => {
    const reference = connection('forward', 'a', 'b', 'reference');
    const reverse = connection('reverse', 'b', 'a', 'sequence');
    useCanvasStore
      .getState()
      .setCanvasData(canvas([markdown('a', 0, 0), markdown('b', 320, 0)], [reference, reverse]));

    const result = useCanvasStore.getState().updateConnection('forward', { type: 'sequence' });

    expect(result).toEqual({ ok: false, reason: 'cycle' });
    expect(
      useCanvasStore.getState().canvasData?.connections.find((item) => item.id === 'forward')?.type,
    ).toBe('reference');
    expect(useHistoryStore.getState().undoStack).toEqual([]);
  });

  it('allows node-scoped sequence branches and merges', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        canvas([
          markdown('a', 0, 0),
          markdown('b', 320, 0),
          markdown('c', 320, 240),
          markdown('d', 640, 0),
        ]),
      );

    for (const [sourceId, targetId] of [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ] as const) {
      expect(
        useCanvasStore.getState().addConnection({
          sourceId,
          targetId,
          type: 'sequence',
          sourceEndpoint: createNodeConnectionEndpoint(sourceId),
          targetEndpoint: createNodeConnectionEndpoint(targetId),
        }),
      ).toMatchObject({ ok: true });
    }

    expect(useCanvasStore.getState().canvasData?.connections).toHaveLength(4);
  });

  it('normalizes undersized canonical nodes at store boundaries', () => {
    useCanvasStore
      .getState()
      .setCanvasData(canvas([{ ...group('tiny-group', []), size: { width: 90, height: 60 } }]));

    expect(
      useCanvasStore.getState().canvasData?.nodes.find((node) => node.id === 'tiny-group')?.size,
    ).toEqual({ width: 260, height: 180 });

    useCanvasStore.getState().updateNode('tiny-group', { size: { width: 100, height: 100 } });

    expect(
      useCanvasStore.getState().canvasData?.nodes.find((node) => node.id === 'tiny-group')?.size,
    ).toEqual({ width: 260, height: 180 });
  });
});
