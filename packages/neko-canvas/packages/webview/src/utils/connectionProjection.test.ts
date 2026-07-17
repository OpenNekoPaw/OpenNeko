import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasNode } from '@neko/shared';
import {
  createBranchPrioritySyncPatches,
  createSequenceEdgeSyncPlan,
  createsDisallowedConnectionCycle,
  deriveSequenceConnectionsFromContainerOrder,
  getDefaultConnectionOrderSyncMode,
  projectCanvasConnectionView,
} from './connectionProjection';
import { projectCanvasNodeRenderPlan } from './canvasOrganization';

function node(
  id: string,
  options: Partial<CanvasNode> & { type?: CanvasNode['type'] } = {},
): CanvasNode {
  return {
    id,
    type: options.type ?? 'annotation',
    position: options.position ?? { x: 0, y: 0 },
    size: options.size ?? { width: 120, height: 80 },
    zIndex: options.zIndex ?? 1,
    data: options.type === 'group' ? { label: id } : { content: id },
    ...options,
  } as CanvasNode;
}

function container(id: string, childIds: string[], x = 0): CanvasNode {
  return node(id, {
    type: 'group',
    position: { x, y: 0 },
    size: { width: 300, height: 240 },
    container: { policy: 'group', childIds },
    data: { label: id },
  });
}

function connection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasConnection['type'] = 'default',
): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type,
  };
}

describe('connectionProjection', () => {
  it('projects top-level endpoints as direct connections', () => {
    const a = node('a');
    const b = node('b', { position: { x: 240, y: 0 } });

    const result = projectCanvasConnectionView({
      nodes: [a, b],
      connections: [connection('a-b', 'a', 'b')],
    });

    expect(result.directConnections).toHaveLength(1);
    expect(result.directConnections[0]?.id).toBe('a-b');
    expect(result.aggregateConnections).toHaveLength(0);
    expect(result.hiddenConnectionIds).toEqual([]);
  });

  it('aggregates a hidden child to an external visible node through its container', () => {
    const group = container('group-1', ['child']);
    const child = node('child', { parentId: 'group-1' });
    const external = node('external', { position: { x: 500, y: 0 } });

    const result = projectCanvasConnectionView({
      nodes: [group, child, external],
      connections: [connection('child-external', 'child', 'external')],
      visibleNodeIds: ['group-1', 'external'],
    });

    expect(result.directConnections).toHaveLength(0);
    expect(result.aggregateConnections).toHaveLength(1);
    expect(result.aggregateConnections[0]).toMatchObject({
      sourceVisibleNodeId: 'group-1',
      targetVisibleNodeId: 'external',
      underlyingConnectionIds: ['child-external'],
      count: 1,
    });
  });

  it('keeps expanded spatial child connections direct and projects collapsed children to Group bounds', () => {
    const expandedGroup = container('group-1', ['child']);
    const child = node('child', { parentId: 'group-1', position: { x: 40, y: 80 } });
    const external = node('external', { position: { x: 500, y: 0 } });
    const connectionValue = connection('child-external', 'child', 'external');
    const expandedPlan = projectCanvasNodeRenderPlan([expandedGroup, child, external]);

    const expanded = projectCanvasConnectionView({
      nodes: [expandedGroup, child, external],
      connections: [connectionValue],
      visibleNodeIds: [...expandedPlan.renderedNodeIds],
      expandedContainerIds: [...expandedPlan.expandedSpatialContainerIds],
    });
    expect(expanded.directConnections.map((view) => view.id)).toEqual(['child-external']);
    expect(expanded.aggregateConnections).toHaveLength(0);

    const collapsedGroup = {
      ...expandedGroup,
      container: { policy: 'group' as const, childIds: ['child'], collapsed: true },
    };
    const collapsedPlan = projectCanvasNodeRenderPlan([collapsedGroup, child, external]);
    const collapsed = projectCanvasConnectionView({
      nodes: [collapsedGroup, child, external],
      connections: [connectionValue],
      visibleNodeIds: [...collapsedPlan.renderedNodeIds],
      expandedContainerIds: [...collapsedPlan.expandedSpatialContainerIds],
    });
    expect(collapsed.directConnections).toHaveLength(0);
    expect(collapsed.aggregateConnections[0]).toMatchObject({
      sourceVisibleNodeId: 'group-1',
      targetVisibleNodeId: 'external',
    });
  });

  it('groups multiple hidden child edges between the same visible containers', () => {
    const left = container('left', ['left-a', 'left-b']);
    const right = container('right', ['right-a', 'right-b'], 500);
    const leftA = node('left-a', { parentId: 'left' });
    const leftB = node('left-b', { parentId: 'left' });
    const rightA = node('right-a', { parentId: 'right' });
    const rightB = node('right-b', { parentId: 'right' });

    const result = projectCanvasConnectionView({
      nodes: [left, right, leftA, leftB, rightA, rightB],
      connections: [
        connection('a-a', 'left-a', 'right-a', 'reference'),
        connection('b-b', 'left-b', 'right-b', 'reference'),
      ],
      visibleNodeIds: ['left', 'right'],
    });

    expect(result.aggregateConnections).toHaveLength(1);
    expect(result.aggregateConnections[0]?.underlyingConnectionIds).toEqual(['a-a', 'b-b']);
    expect(result.aggregateConnections[0]?.count).toBe(2);
  });

  it('summarizes same-container child edges as internal connections', () => {
    const group = container('group-1', ['a', 'b']);
    const a = node('a', { parentId: 'group-1' });
    const b = node('b', { parentId: 'group-1' });

    const result = projectCanvasConnectionView({
      nodes: [group, a, b],
      connections: [connection('a-b', 'a', 'b')],
      visibleNodeIds: ['group-1'],
    });

    expect(result.directConnections).toHaveLength(0);
    expect(result.aggregateConnections).toHaveLength(0);
    expect(result.internalSummaries).toEqual([
      expect.objectContaining({ containerId: 'group-1', connectionIds: ['a-b'], count: 1 }),
    ]);
    expect(result.hiddenConnectionIds).toEqual(['a-b']);
  });

  it('emits diagnostics for dangling endpoints', () => {
    const a = node('a');

    const result = projectCanvasConnectionView({
      nodes: [a],
      connections: [connection('missing', 'a', 'missing-node')],
    });

    expect(result.directConnections).toHaveLength(0);
    expect(result.hiddenConnectionIds).toEqual(['missing']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'dangling-endpoint', severity: 'error' }),
    ]);
  });

  it('projects nested hidden children through the nearest visible ancestor container', () => {
    const root = container('root', ['nested']);
    const nested = container('nested', ['child']);
    const child = node('child', { parentId: 'nested' });
    const external = node('external', { position: { x: 600, y: 0 } });
    const nestedWithParent = { ...nested, parentId: 'root' } as CanvasNode;

    const result = projectCanvasConnectionView({
      nodes: [root, nestedWithParent, child, external],
      connections: [connection('child-external', 'child', 'external')],
      visibleNodeIds: ['root', 'external'],
    });

    expect(result.aggregateConnections[0]).toMatchObject({
      sourceVisibleNodeId: 'root',
      targetVisibleNodeId: 'external',
    });
  });

  it('uses render bounds for aggregate endpoint proxy nodes', () => {
    const group = container('group-1', ['child']);
    const child = node('child', { parentId: 'group-1' });
    const external = node('external', { position: { x: 500, y: 0 } });

    const result = projectCanvasConnectionView({
      nodes: [group, child, external],
      connections: [connection('child-external', 'child', 'external')],
      visibleNodeIds: ['group-1', 'external'],
      renderBounds: [
        {
          nodeId: 'group-1',
          position: { x: 10, y: 20 },
          size: { width: 300, height: 42 },
        },
      ],
    });

    expect(result.aggregateConnections[0]?.sourceNode.position).toEqual({ x: 10, y: 20 });
    expect(result.aggregateConnections[0]?.sourceNode.size).toEqual({ width: 300, height: 42 });
  });

  it('exposes default connection order sync modes', () => {
    expect(getDefaultConnectionOrderSyncMode('scene')).toBe('derive-from-container');
    expect(getDefaultConnectionOrderSyncMode('gallery')).toBe('none');
    expect(getDefaultConnectionOrderSyncMode('narrative')).toBe('sync-branch-priority');
    expect(getDefaultConnectionOrderSyncMode('sequence')).toBe('sync-sequence-edges');
    expect(getDefaultConnectionOrderSyncMode('custom')).toBe('none');
  });

  it('derives non-mutating scene sequence hints from container order', () => {
    const scene = node('scene-1', {
      type: 'scene',
      container: { policy: 'scene', childIds: ['shot-1', 'shot-2', 'shot-3'] },
      data: { sceneTitle: 'Scene', sceneNumber: 1 },
    });

    expect(deriveSequenceConnectionsFromContainerOrder([scene])).toEqual([
      {
        kind: 'derived-sequence',
        id: 'derived-sequence-scene-1-shot-1-shot-2',
        containerId: 'scene-1',
        sourceId: 'shot-1',
        targetId: 'shot-2',
        order: 0,
      },
      {
        kind: 'derived-sequence',
        id: 'derived-sequence-scene-1-shot-2-shot-3',
        containerId: 'scene-1',
        sourceId: 'shot-2',
        targetId: 'shot-3',
        order: 1,
      },
    ]);
  });

  it('creates explicit sequence edge sync plans without mutating connections', () => {
    const existing = [
      connection('shot-1-shot-2', 'shot-1', 'shot-2', 'sequence'),
      connection('shot-3-shot-1', 'shot-3', 'shot-1', 'sequence'),
    ];

    expect(createSequenceEdgeSyncPlan(existing, ['shot-1', 'shot-2', 'shot-3'])).toMatchObject({
      mode: 'sync-sequence-edges',
      matchedConnectionIds: ['shot-1-shot-2'],
      missingEdges: [{ sourceId: 'shot-2', targetId: 'shot-3', order: 1 }],
      staleConnectionIds: ['shot-3-shot-1'],
    });
  });

  it('creates branch priority patches without retargeting endpoints', () => {
    const existing = [
      connection('a-b', 'choice-a', 'target-b', 'choice'),
      connection('a-c', 'choice-a', 'target-c', 'choice'),
    ];

    expect(createBranchPrioritySyncPatches(existing, 'choice-a', ['target-c', 'target-b'])).toEqual(
      [
        { connectionId: 'a-c', updates: { priority: 0 } },
        { connectionId: 'a-b', updates: { priority: 1 } },
      ],
    );
  });

  it('detects disallowed cycles for strict sequence-like connections', () => {
    const a = node('a');
    const b = node('b');
    const existing = [connection('b-a', 'b', 'a', 'sequence')];

    expect(
      createsDisallowedConnectionCycle([a, b], existing, {
        sourceId: 'a',
        targetId: 'b',
        type: 'sequence',
      }),
    ).toBe(true);
    expect(
      createsDisallowedConnectionCycle([a, b], existing, {
        sourceId: 'a',
        targetId: 'b',
        type: 'choice',
      }),
    ).toBe(false);
  });
});
