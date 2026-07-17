import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCanvasStoryboardExecutionSummary,
  isSceneGroupNode,
  isShotNode,
  type CanvasData,
  type AnnotationCanvasNode,
  type GroupCanvasNode,
  type SceneGroupCanvasNode,
  type ShotCanvasNode,
} from '@neko/shared';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { hydrateCanvasNodePreview } from '../../utils/canvasPresetRegistry';
import { canCreateCanvasConnection, useCanvasStore } from '../canvasStore';
import { useHistoryStore } from '../historyStore';
import { usePlaybackStore } from '../playbackStore';
import { useCanvasOperationStore } from '../canvasOperationStore';

function createSceneNode(): SceneGroupCanvasNode {
  return {
    id: 'scene-1',
    type: 'scene',
    position: { x: 100, y: 100 },
    size: { width: 720, height: 420 },
    zIndex: 0,
    container: { policy: 'scene', childIds: [] },
    data: {
      sceneTitle: 'Scene 1',
      sceneNumber: 1,
    },
  };
}

function createShotNode(id: string, x: number, y: number): ShotCanvasNode {
  return {
    id,
    type: 'shot',
    position: { x, y },
    size: { width: 220, height: 200 },
    zIndex: 1,
    data: {
      shotNumber: 1,
      duration: 3,
      visualDescription: '',
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
    },
  };
}

function createGroupNode(
  id: string,
  childIds: string[],
  x = 0,
  y = 0,
  width = 500,
  height = 400,
): GroupCanvasNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    size: { width, height },
    zIndex: 0,
    container: { policy: 'group', childIds, deleteBehavior: 'release-children' },
    data: { label: id },
  };
}

function createAnnotationNode(
  id: string,
  parentId: string,
  x: number,
  y: number,
): AnnotationCanvasNode {
  return {
    id,
    type: 'annotation',
    parentId,
    position: { x, y },
    size: { width: 120, height: 80 },
    zIndex: 1,
    data: { content: id },
  };
}

function createCanvasData(nodes: CanvasData['nodes']): CanvasData {
  return {
    version: '1.0',
    name: 'Scene Test',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes,
    connections: [],
  };
}

function createConnection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasData['connections'][number]['type'] = 'default',
): CanvasData['connections'][number] {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type,
  };
}

describe('canvasStore scene container actions', () => {
  let recordNodeUpdateSpy: ReturnType<typeof vi.spyOn>;
  let recordDirtySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    recordNodeUpdateSpy = vi.spyOn(useCanvasOperationStore.getState(), 'recordNodeUpdate');
    recordDirtySpy = vi.spyOn(useCanvasOperationStore.getState(), 'recordDirty');
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      expandedNodeId: null,
      generationPanelState: { visible: false, nodeId: null, childNodeId: null },
      contentOverlayState: { visible: false, nodeId: null },
    });
    useHistoryStore.setState({ undoStack: [], redoStack: [], maxHistory: 50 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assigns selected shots into a scene and auto-layouts them in container order', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([
          createSceneNode(),
          createShotNode('shot-1', 20, 20),
          createShotNode('shot-2', 40, 40),
        ]),
      );

    useCanvasStore.getState().assignShotsToScene('scene-1', ['shot-2', 'shot-1'], true);

    const state = useCanvasStore.getState().canvasData;
    const scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    const shot1 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );
    const shot2 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-2',
    );

    expect(scene?.container?.childIds).toEqual(['shot-2', 'shot-1']);
    expect(shot1?.parentId).toBe('scene-1');
    expect(shot2?.parentId).toBe('scene-1');
    expect(shot2?.position.x).toBeLessThan(shot1?.position.x ?? 0);
    expect(shot1?.position.y).toBe(shot2?.position.y);
  });

  it('updates scene membership when a shot is dragged into and out of a scene', () => {
    useCanvasStore
      .getState()
      .setCanvasData(createCanvasData([createSceneNode(), createShotNode('shot-1', 900, 900)]));

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 160, y: 220 });

    let state = useCanvasStore.getState().canvasData;
    let scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    let shot = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(shot?.parentId).toBe('scene-1');
    expect(scene?.container?.childIds).toEqual(['shot-1']);

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 980, y: 980 });

    state = useCanvasStore.getState().canvasData;
    scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    shot = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(shot?.parentId).toBeUndefined();
    expect(scene?.container?.childIds).toEqual([]);
  });

  it('preserves real child connections when dragging a shot into and out of a scene', () => {
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([
        createSceneNode(),
        createShotNode('shot-1', 900, 900),
        createShotNode('shot-2', 1200, 900),
      ]),
      connections: [createConnection('shot-link', 'shot-1', 'shot-2', 'reference')],
    });

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 160, y: 220 });
    expect(useCanvasStore.getState().canvasData?.connections).toEqual([
      createConnection('shot-link', 'shot-1', 'shot-2', 'reference'),
    ]);

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 980, y: 980 });
    expect(useCanvasStore.getState().canvasData?.connections).toEqual([
      createConnection('shot-link', 'shot-1', 'shot-2', 'reference'),
    ]);
  });

  it('records one history and operation entry for completed node transform gestures only', () => {
    useCanvasStore.getState().setCanvasData(createCanvasData([createShotNode('shot-1', 100, 100)]));

    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    expect(recordNodeUpdateSpy).not.toHaveBeenCalled();

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 160, y: 180 });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(recordNodeUpdateSpy).toHaveBeenCalledTimes(1);
    expect(recordNodeUpdateSpy).toHaveBeenLastCalledWith(
      'shot-1',
      { position: { x: 160, y: 180 } },
      { position: { x: 100, y: 100 } },
    );

    useCanvasStore.getState().moveNodeEnd('shot-1', { x: 160, y: 180 });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(recordNodeUpdateSpy).toHaveBeenCalledTimes(1);
  });

  it('sets a durable playback entry and records history once', () => {
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([createSceneNode(), createShotNode('shot-1', 160, 220)]),
      playback: {
        version: 1,
        adapterId: 'storyboard',
        mode: 'linear',
        entryIds: ['old-entry'],
        nodeOverrides: { 'shot-1': { durationMs: 2500 } },
      },
    });

    useCanvasStore.getState().setPlaybackEntry('scene-1');

    expect(useCanvasStore.getState().canvasData?.playback).toEqual({
      version: 1,
      adapterId: 'storyboard',
      mode: 'linear',
      entryIds: ['scene-1'],
      nodeOverrides: { 'shot-1': { durationMs: 2500 } },
    });
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(recordDirtySpy).toHaveBeenCalledWith('Update canvas playback entry');

    useCanvasStore.getState().setPlaybackEntry('scene-1');

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(recordDirtySpy).toHaveBeenCalledTimes(1);
  });

  it('marks semantic canvas data updates dirty while allowing runtime sync updates', () => {
    useCanvasStore.getState().setCanvasData(createCanvasData([createSceneNode()]));

    useCanvasStore.getState().updateCanvasData({
      narrative: {
        variables: [{ id: 'var-1', name: 'mood', value: 'calm' }],
      },
    });

    expect(useCanvasStore.getState().canvasData?.narrative?.variables).toHaveLength(1);
    expect(recordDirtySpy).toHaveBeenCalledWith('Update canvas data');

    useCanvasStore.getState().updateCanvasData(
      {
        projectionStatus: { state: 'clean', updatedAt: 123 },
      } as Partial<CanvasData>,
      { dirty: false },
    );

    expect(useCanvasStore.getState().canvasData).toMatchObject({
      projectionStatus: { state: 'clean', updatedAt: 123 },
    });
    expect(recordDirtySpy).toHaveBeenCalledTimes(1);
  });

  it('does not record resize or rotation gestures when the committed value is unchanged', () => {
    useCanvasStore.getState().setCanvasData(createCanvasData([createShotNode('shot-1', 100, 100)]));

    useCanvasStore
      .getState()
      .resizeNodeEnd('shot-1', { width: 220, height: 200 }, { x: 100, y: 100 });
    useCanvasStore.getState().rotateNodeEnd('shot-1', 0);

    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    expect(recordNodeUpdateSpy).not.toHaveBeenCalled();
  });

  it('reorders managed shots within a scene and preserves container order', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
        },
        {
          ...createShotNode('shot-1', 160, 220),
          parentId: 'scene-1',
        },
        {
          ...createShotNode('shot-2', 420, 220),
          parentId: 'scene-1',
        },
      ]),
    );

    useCanvasStore.getState().reorderSceneShots('scene-1', ['shot-2', 'shot-1'], true);

    const state = useCanvasStore.getState().canvasData;
    const scene = state?.nodes.find(
      (node): node is SceneGroupCanvasNode => isSceneGroupNode(node) && node.id === 'scene-1',
    );
    const shot1 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );
    const shot2 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-2',
    );

    expect(scene?.container?.childIds).toEqual(['shot-2', 'shot-1']);
    expect(shot2?.position.x).toBeLessThan(shot1?.position.x ?? 0);
  });

  it('reorders managed shots without rewriting real sequence edges by default', () => {
    const sequence = createConnection('sequence-1', 'shot-1', 'shot-2', 'sequence');
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([
        {
          ...createSceneNode(),
          container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
        },
        {
          ...createShotNode('shot-1', 160, 220),
          parentId: 'scene-1',
        },
        {
          ...createShotNode('shot-2', 420, 220),
          parentId: 'scene-1',
        },
      ]),
      connections: [sequence],
    });

    useCanvasStore.getState().reorderSceneShots('scene-1', ['shot-2', 'shot-1'], false);

    expect(useCanvasStore.getState().canvasData?.connections).toEqual([sequence]);
  });

  it('records moved shot positions when auto-layout runs on an existing scene', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
        },
        {
          ...createShotNode('shot-1', 120, 360),
          parentId: 'scene-1',
        },
        {
          ...createShotNode('shot-2', 140, 620),
          parentId: 'scene-1',
        },
      ]),
    );

    useCanvasStore.getState().autoLayoutSceneShots('scene-1');
  });

  it('groups and ungroups nodes through generic container membership', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([createShotNode('shot-1', 100, 100), createShotNode('shot-2', 360, 100)]),
      );

    const groupId = useCanvasStore.getState().groupNodes(['shot-1', 'shot-2']);

    let state = useCanvasStore.getState().canvasData;
    const group = state?.nodes.find((node) => node.id === groupId);
    const shot1 = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(group?.type).toBe('group');
    expect(group?.container?.childIds).toEqual(['shot-1', 'shot-2']);
    expect(shot1?.parentId).toBe(groupId);

    useCanvasStore.getState().ungroupNodes(groupId);

    state = useCanvasStore.getState().canvasData;
    const releasedShot = state?.nodes.find(
      (node): node is ShotCanvasNode => isShotNode(node) && node.id === 'shot-1',
    );

    expect(state?.nodes.some((node) => node.id === groupId)).toBe(false);
    expect(releasedShot?.parentId).toBeUndefined();
  });

  it('moves a spatial Group and every nested descendant by exactly one delta', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([
          createGroupNode('outer', ['inner']),
          { ...createGroupNode('inner', ['child'], 20, 80, 180, 160), parentId: 'outer' },
          createAnnotationNode('child', 'inner', 50, 140),
        ]),
      );

    useCanvasStore.getState().moveNodeEnd('outer', { x: 100, y: 50 });

    const nodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    expect(nodes.find((node) => node.id === 'outer')?.position).toEqual({ x: 100, y: 50 });
    expect(nodes.find((node) => node.id === 'inner')?.position).toEqual({ x: 120, y: 130 });
    expect(nodes.find((node) => node.id === 'child')?.position).toEqual({ x: 150, y: 190 });
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('moves one child without moving siblings or reflowing manual positions on ordinary updates', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([
          createGroupNode('group', ['a', 'b']),
          createAnnotationNode('a', 'group', 40, 100),
          createAnnotationNode('b', 'group', 240, 100),
        ]),
      );

    useCanvasStore.getState().moveNodeEnd('a', { x: 80, y: 160 });
    useCanvasStore.getState().updateNodeData('a', { content: 'updated' });

    const nodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    expect(nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 80, y: 160 });
    expect(nodes.find((node) => node.id === 'b')?.position).toEqual({ x: 240, y: 100 });
  });

  it('preserves exact spatial geometry across collapse and expand', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([
          createGroupNode('group', ['child']),
          createAnnotationNode('child', 'group', 80, 140),
        ]),
      );
    const before = structuredClone(useCanvasStore.getState().canvasData?.nodes);

    useCanvasStore.getState().setGroupCollapsed('group', true);
    useCanvasStore.getState().setGroupCollapsed('group', false);

    const after = useCanvasStore.getState().canvasData?.nodes;
    expect(
      after?.map((node) => ({ id: node.id, position: node.position, size: node.size })),
    ).toEqual(before?.map((node) => ({ id: node.id, position: node.position, size: node.size })));
    expect(after?.find((node) => node.id === 'group')?.container?.collapsed).toBe(false);
    expect(useHistoryStore.getState().undoStack).toHaveLength(2);
  });

  it('records exactly one history entry for each arrange, fit, resize, and collapse action', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([
          createGroupNode('group', ['b', 'a'], 0, 0, 900, 700),
          createAnnotationNode('a', 'group', 500, 400),
          createAnnotationNode('b', 'group', 300, 300),
        ]),
      );

    useCanvasStore.getState().arrangeGroup('group', 'name');
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    useCanvasStore.getState().fitGroupToContent('group');
    expect(useHistoryStore.getState().undoStack).toHaveLength(2);

    const fitted = useCanvasStore.getState().canvasData?.nodes.find((node) => node.id === 'group');
    if (!fitted) throw new Error('Missing fitted Group');
    useCanvasStore
      .getState()
      .resizeNodeEnd(
        'group',
        { width: fitted.size.width + 100, height: fitted.size.height + 100 },
        fitted.position,
      );
    expect(useHistoryStore.getState().undoStack).toHaveLength(3);

    useCanvasStore.getState().setGroupCollapsed('group', true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(4);
    useCanvasStore.getState().setGroupCollapsed('group', true);
    expect(useHistoryStore.getState().undoStack).toHaveLength(4);
  });

  it('deletes selected containers according to release-children and delete-subtree policies', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        createGroupNode('group', ['released']),
        createAnnotationNode('released', 'group', 40, 100),
        {
          id: 'gallery',
          type: 'gallery',
          position: { x: 600, y: 0 },
          size: { width: 400, height: 320 },
          zIndex: 0,
          container: { policy: 'gallery', childIds: ['deleted'], deleteBehavior: 'delete-subtree' },
          data: { preset: 'custom', rows: 1, cols: 1 },
        },
        {
          id: 'deleted',
          type: 'media',
          parentId: 'gallery',
          position: { x: 640, y: 100 },
          size: { width: 120, height: 80 },
          zIndex: 1,
          data: { assetPath: 'neko/assets/files/image/deleted.png', mediaType: 'image' },
        },
      ]),
    );

    useCanvasStore.getState().selectNodes(['group', 'gallery']);
    useCanvasStore.getState().deleteSelected();

    const nodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    expect(nodes.map((node) => node.id)).toEqual(['released']);
    expect(nodes[0]?.parentId).toBeUndefined();
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('releases a child from a non-gallery container without deleting child connections', () => {
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([
        {
          id: 'group-1',
          type: 'group',
          position: { x: 0, y: 0 },
          size: { width: 400, height: 320 },
          zIndex: 0,
          container: { policy: 'group', childIds: ['shot-1'] },
          data: { label: 'Group' },
        },
        { ...createShotNode('shot-1', 20, 60), parentId: 'group-1' },
        createShotNode('shot-2', 500, 60),
      ]),
      connections: [createConnection('shot-link', 'shot-1', 'shot-2', 'reference')],
    });

    useCanvasStore.getState().removeChildFromContainer('group-1', 'shot-1');

    const state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.find((node) => node.id === 'shot-1')?.parentId).toBeUndefined();
    expect(state?.connections).toEqual([
      createConnection('shot-link', 'shot-1', 'shot-2', 'reference'),
    ]);
    expect(recordDirtySpy).toHaveBeenCalledWith('Remove child from container');
  });

  it('removes gallery child nodes and their connections for delete-subtree gallery policy', () => {
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([
        {
          id: 'gallery-1',
          type: 'gallery',
          position: { x: 0, y: 0 },
          size: { width: 400, height: 320 },
          zIndex: 0,
          container: { policy: 'gallery', childIds: ['media-1'], deleteBehavior: 'delete-subtree' },
          data: { preset: 'custom', rows: 1, cols: 1 },
        } as CanvasData['nodes'][number],
        {
          id: 'media-1',
          type: 'media',
          position: { x: 20, y: 60 },
          size: { width: 200, height: 120 },
          zIndex: 1,
          parentId: 'gallery-1',
          data: { assetPath: 'image.png' },
        } as CanvasData['nodes'][number],
        createShotNode('shot-1', 500, 60),
      ]),
      connections: [createConnection('media-link', 'media-1', 'shot-1', 'reference')],
    });

    useCanvasStore.getState().removeChildFromContainer('gallery-1', 'media-1');

    const state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.some((node) => node.id === 'media-1')).toBe(false);
    expect(state?.connections).toEqual([]);
    expect(recordDirtySpy).toHaveBeenCalledWith('Remove child from container');
  });

  it('marks connection metadata updates dirty without writing immediately', () => {
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([createShotNode('shot-1', 0, 0), createShotNode('shot-2', 260, 0)]),
      connections: [createConnection('connection-1', 'shot-1', 'shot-2')],
    });

    useCanvasStore.getState().updateConnection('connection-1', { label: 'Beat link' });

    expect(useCanvasStore.getState().canvasData?.connections[0]).toMatchObject({
      id: 'connection-1',
      label: 'Beat link',
    });
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(recordDirtySpy).toHaveBeenCalledWith('Update connection');

    useCanvasStore.getState().updateConnection('connection-1', { label: 'Beat link' });

    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    expect(recordDirtySpy).toHaveBeenCalledTimes(1);
  });

  it('marks selection deletion and undo/redo dirty through the operation bridge', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([createShotNode('shot-1', 0, 0), createShotNode('shot-2', 260, 0)]),
      );
    useCanvasStore.getState().selectNode('shot-1');

    useCanvasStore.getState().deleteSelected();

    expect(useCanvasStore.getState().canvasData?.nodes.map((node) => node.id)).toEqual(['shot-2']);
    expect(recordDirtySpy).toHaveBeenCalledWith('Delete selection');

    useCanvasStore.getState().undo();

    expect(useCanvasStore.getState().canvasData?.nodes.map((node) => node.id)).toEqual([
      'shot-1',
      'shot-2',
    ]);
    expect(recordDirtySpy).toHaveBeenCalledWith('Undo canvas edit');

    useCanvasStore.getState().redo();

    expect(useCanvasStore.getState().canvasData?.nodes.map((node) => node.id)).toEqual(['shot-2']);
    expect(recordDirtySpy).toHaveBeenCalledWith('Redo canvas edit');
  });

  it('does not mark missing connection removal dirty', () => {
    useCanvasStore
      .getState()
      .setCanvasData(
        createCanvasData([createShotNode('shot-1', 0, 0), createShotNode('shot-2', 260, 0)]),
      );

    useCanvasStore.getState().removeConnection('missing-connection');

    expect(useHistoryStore.getState().undoStack).toHaveLength(0);
    expect(recordDirtySpy).not.toHaveBeenCalled();
  });

  it('deletes release-children containers while preserving released child connections', () => {
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([
        {
          id: 'group-1',
          type: 'group',
          position: { x: 0, y: 0 },
          size: { width: 400, height: 320 },
          zIndex: 0,
          container: { policy: 'group', childIds: ['shot-1'], deleteBehavior: 'release-children' },
          data: { label: 'Group' },
        },
        { ...createShotNode('shot-1', 20, 60), parentId: 'group-1' },
        createShotNode('shot-2', 500, 60),
      ]),
      connections: [
        createConnection('container-link', 'group-1', 'shot-2', 'reference'),
        createConnection('child-link', 'shot-1', 'shot-2', 'reference'),
      ],
    });

    useCanvasStore.getState().removeNode('group-1');

    const state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.some((node) => node.id === 'group-1')).toBe(false);
    expect(state?.nodes.find((node) => node.id === 'shot-1')?.parentId).toBeUndefined();
    expect(state?.connections).toEqual([
      createConnection('child-link', 'shot-1', 'shot-2', 'reference'),
    ]);
  });

  it('removes Canvas Group organization without deleting Asset-backed child identity', () => {
    const promotedAsset = {
      entityId: 'asset:entity:1',
      variantId: 'asset:variant:1',
      fileId: 'asset:file:1',
      path: 'neko/assets/files/image/concept.png',
    };
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          id: 'group-1',
          type: 'group',
          position: { x: 0, y: 0 },
          size: { width: 400, height: 320 },
          zIndex: 0,
          container: { policy: 'group', childIds: ['media-1'], deleteBehavior: 'release-children' },
          data: { label: 'Saved candidates' },
        },
        {
          id: 'media-1',
          type: 'media',
          position: { x: 20, y: 60 },
          size: { width: 200, height: 120 },
          zIndex: 1,
          parentId: 'group-1',
          data: { assetPath: promotedAsset.path, promotedAsset },
        } as CanvasData['nodes'][number],
      ]),
    );

    useCanvasStore.getState().removeNode('group-1');

    const remaining = useCanvasStore.getState().canvasData?.nodes;
    expect(remaining).toHaveLength(1);
    expect(remaining?.[0]).toMatchObject({
      id: 'media-1',
      data: expect.objectContaining({ promotedAsset }),
    });
    expect(remaining?.[0]?.parentId).toBeUndefined();
  });

  it('deletes delete-subtree containers with descendant connections', () => {
    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([
        {
          id: 'gallery-1',
          type: 'gallery',
          position: { x: 0, y: 0 },
          size: { width: 400, height: 320 },
          zIndex: 0,
          container: { policy: 'gallery', childIds: ['media-1'], deleteBehavior: 'delete-subtree' },
          data: { preset: 'custom', rows: 1, cols: 1, cells: [] },
        } as CanvasData['nodes'][number],
        {
          id: 'media-1',
          type: 'media',
          position: { x: 20, y: 60 },
          size: { width: 200, height: 120 },
          zIndex: 1,
          parentId: 'gallery-1',
          data: { assetPath: 'image.png' },
        } as CanvasData['nodes'][number],
        createShotNode('shot-1', 500, 60),
      ]),
      connections: [
        createConnection('gallery-link', 'gallery-1', 'shot-1', 'reference'),
        createConnection('media-link', 'media-1', 'shot-1', 'reference'),
      ],
    });

    useCanvasStore.getState().removeNode('gallery-1');

    const state = useCanvasStore.getState().canvasData;
    expect(state?.nodes.some((node) => node.id === 'gallery-1')).toBe(false);
    expect(state?.nodes.some((node) => node.id === 'media-1')).toBe(false);
    expect(state?.connections).toEqual([]);
  });

  it('refreshes migrated node previews after data and block updates', () => {
    const shot = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 4,
          visualDescription: 'Old description',
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'blob:runtime-old',
              prompt: 'old',
              timestamp: 1,
              selected: true,
              assetId: 'asset-old',
            },
          ],
        },
      }),
      id: 'shot-4',
    } as CanvasData['nodes'][number]);

    useCanvasStore.getState().setCanvasData(createCanvasData([shot]));
    useCanvasStore.getState().updateNodeData('shot-4', {
      visualDescription: 'Updated description',
      generationHistory: [
        {
          id: 'candidate-2',
          dataUrl: 'blob:runtime-new',
          prompt: 'new',
          timestamp: 2,
          selected: true,
          assetId: 'asset-new',
        },
      ],
    });

    let state = useCanvasStore.getState().canvasData;
    let nextShot = state?.nodes.find((node) => node.id === 'shot-4');
    expect(nextShot?.preview).toMatchObject({
      nodeId: 'shot-4',
      subtitle: 'Updated description',
      thumbnailVariantId: 'candidate-2',
      metadata: {
        selectedAssetId: 'asset-new',
      },
    });

    useCanvasStore.getState().updateBlock({
      nodeId: 'shot-4',
      blockId: 'shot-visual-description',
      value: 'Block edit',
    });

    state = useCanvasStore.getState().canvasData;
    nextShot = state?.nodes.find((node) => node.id === 'shot-4');
    expect(nextShot?.preview?.subtitle).toBe('Block edit');
    expect(JSON.stringify(nextShot?.preview)).not.toContain('blob:runtime');
  });

  it('provides store node data for storyboard execution summary projection', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          data: {
            ...createSceneNode().data,
            sourceScriptUri: 'file:///project/demo.fountain',
            sceneId: 'scene_1',
          },
          container: { policy: 'scene', childIds: ['shot-1'] },
        },
        {
          ...createShotNode('shot-1', 160, 220),
          parentId: 'scene-1',
          data: {
            ...createShotNode('shot-1', 160, 220).data,
            generationStatus: 'done',
            generationHistory: [
              {
                id: 'candidate-1',
                dataUrl: 'blob:runtime-preview',
                prompt: 'test',
                timestamp: 1,
                selected: true,
                assetId: 'asset-shot-1',
              },
            ],
            lastImportedToTimelineAt: 42,
            lastImportedToTimelineProject: 'Demo Cut',
          },
        },
      ]),
    );

    const nodes = useCanvasStore.getState().canvasData?.nodes ?? [];
    const summary = createCanvasStoryboardExecutionSummary({
      nodes,
      request: {
        sourceScriptUri: 'file:///project/demo.fountain',
        sceneId: 'scene_1',
      },
    });

    expect(summary.scenes[0]).toMatchObject({
      sceneId: 'scene_1',
      shotCount: 1,
      generatedShotCount: 1,
      selectedThumbnailRef: 'asset-shot-1',
    });
    expect(summary.scenes[0]?.shots[0]).toMatchObject({
      lastImportedToTimelineAt: 42,
      lastImportedToTimelineProject: 'Demo Cut',
    });
    expect(JSON.stringify(summary)).not.toContain('blob:runtime-preview');
  });

  it('applies subsystem metadata defaults when trigger nodes are loaded or added', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          id: 'choice-1',
          type: 'choice',
          position: { x: 0, y: 0 },
          size: { width: 220, height: 120 },
          zIndex: 1,
          data: {},
        },
      ]),
    );

    expect(useCanvasStore.getState().canvasData?.narrative).toEqual({
      variables: [],
      genre: 'illustrated-text',
    });

    useCanvasStore.getState().addNode({
      type: 'state',
      position: { x: 260, y: 0 },
      size: { width: 220, height: 120 },
      zIndex: 2,
      data: {},
    });

    expect(useCanvasStore.getState().canvasData?.behavior).toEqual({ blackboard: [] });
  });

  it('enforces narrative start and ending runtime connection constraints', () => {
    const start = {
      ...buildCanvasNode({
        type: 'narrative-start',
        position: { x: 0, y: 0 },
        zIndex: 1,
        data: {},
      }),
      id: 'start',
    } as CanvasData['nodes'][number];
    const scene = {
      ...buildCanvasNode({
        type: 'narrative-scene',
        position: { x: 260, y: 0 },
        zIndex: 2,
        data: { sceneRef: 'scenes/cafe.fountain' },
      }),
      id: 'scene',
    } as CanvasData['nodes'][number];
    const ending = {
      ...buildCanvasNode({
        type: 'narrative-ending',
        position: { x: 520, y: 0 },
        zIndex: 3,
        data: {},
      }),
      id: 'ending',
    } as CanvasData['nodes'][number];
    const nodes = [start, scene, ending];

    expect(
      canCreateCanvasConnection(nodes, {
        sourceId: 'start',
        targetId: 'scene',
        type: 'default',
      }),
    ).toBe(true);
    expect(
      canCreateCanvasConnection(nodes, {
        sourceId: 'scene',
        targetId: 'start',
        type: 'default',
      }),
    ).toBe(false);
    expect(
      canCreateCanvasConnection(nodes, {
        sourceId: 'ending',
        targetId: 'scene',
        type: 'default',
      }),
    ).toBe(false);

    useCanvasStore.getState().setCanvasData(createCanvasData(nodes));
    expect(() =>
      useCanvasStore.getState().addConnection({
        sourceId: 'scene',
        targetId: 'start',
        sourceEndpoint: { nodeId: 'scene', scope: 'node' },
        targetEndpoint: { nodeId: 'start', scope: 'node' },
        type: 'default',
      }),
    ).toThrow(/narrative graph constraints/);
    expect(() =>
      useCanvasStore.getState().addConnection({
        sourceId: 'start',
        targetId: 'scene',
        sourceEndpoint: { nodeId: 'start', scope: 'node' },
        targetEndpoint: { nodeId: 'scene', scope: 'node' },
        type: 'default',
      }),
    ).not.toThrow();
  });

  it('rejects strict sequence cycles while allowing choice loops', () => {
    const a = createShotNode('shot-a', 0, 0);
    const b = createShotNode('shot-b', 260, 0);

    expect(
      canCreateCanvasConnection(
        [a, b],
        { sourceId: 'shot-a', targetId: 'shot-b', type: 'sequence' },
        [createConnection('b-a', 'shot-b', 'shot-a', 'sequence')],
      ),
    ).toBe(false);
    expect(
      canCreateCanvasConnection(
        [a, b],
        { sourceId: 'shot-a', targetId: 'shot-b', type: 'choice' },
        [createConnection('b-a', 'shot-b', 'shot-a', 'choice')],
      ),
    ).toBe(true);

    useCanvasStore.getState().setCanvasData({
      ...createCanvasData([a, b]),
      connections: [createConnection('b-a', 'shot-b', 'shot-a', 'sequence')],
    });

    expect(() =>
      useCanvasStore.getState().addConnection({
        sourceId: 'shot-a',
        targetId: 'shot-b',
        sourceEndpoint: { nodeId: 'shot-a', scope: 'node' },
        targetEndpoint: { nodeId: 'shot-b', scope: 'node' },
        type: 'sequence',
      }),
    ).toThrow(/constraints/);
  });

  it('normalizes undersized nodes at store boundaries', () => {
    useCanvasStore.getState().setCanvasData(
      createCanvasData([
        {
          ...createSceneNode(),
          id: 'tiny-scene',
          size: { width: 90, height: 60 },
        },
      ]),
    );

    let tinyScene = useCanvasStore
      .getState()
      .canvasData?.nodes.find((node) => node.id === 'tiny-scene');
    expect(tinyScene?.size).toEqual({ width: 320, height: 220 });

    useCanvasStore
      .getState()
      .resizeNodeEnd('tiny-scene', { width: 500, height: 260 }, { x: 120, y: 140 });

    tinyScene = useCanvasStore
      .getState()
      .canvasData?.nodes.find((node) => node.id === 'tiny-scene');
    expect(tinyScene?.size).toEqual({ width: 500, height: 260 });

    useCanvasStore.getState().updateNode('tiny-scene', { size: { width: 100, height: 100 } });

    tinyScene = useCanvasStore
      .getState()
      .canvasData?.nodes.find((node) => node.id === 'tiny-scene');
    expect(tinyScene?.size).toEqual({ width: 320, height: 220 });
  });
});

describe('playbackStore runtime handoff', () => {
  beforeEach(() => {
    usePlaybackStore.setState({
      playbacks: new Map(),
      activePlayback: null,
      handoffRequest: null,
    });
  });

  it('tracks one active surface and consumes matching handoff requests once', () => {
    const store = usePlaybackStore.getState();

    store.startActivePlayback({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      surfaceId: 'inline-1',
      surfaceKind: 'inline',
      currentTime: 4,
      duration: 12,
    });
    store.updateActivePlayback('assets/clip.mp4', 'inline-1', { currentTime: 5 });
    store.requestHandoff({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      fromSurfaceId: 'inline-1',
      toKind: 'overlay',
      startTime: 5,
    });

    expect(usePlaybackStore.getState().activePlayback?.currentTime).toBe(5);
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'inline')).toBeNull();
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'overlay')).toMatchObject({
      fromSurfaceId: 'inline-1',
      startTime: 5,
    });
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'overlay')).toBeNull();
  });

  it('ignores stop requests from a non-owning playback surface', () => {
    const store = usePlaybackStore.getState();

    store.startActivePlayback({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      surfaceId: 'inline-1',
      surfaceKind: 'inline',
      currentTime: 4,
      duration: 12,
    });
    store.stopActivePlayback('assets/clip.mp4', 'overlay-1', 8);

    expect(usePlaybackStore.getState().activePlayback).toMatchObject({
      assetPath: 'assets/clip.mp4',
      surfaceId: 'inline-1',
      currentTime: 4,
    });
    expect(usePlaybackStore.getState().getPlayback('assets/clip.mp4')).toBeUndefined();
  });

  it('ignores active playback updates after playback has stopped', () => {
    const store = usePlaybackStore.getState();

    store.startActivePlayback({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      surfaceId: 'inline-1',
      surfaceKind: 'inline',
      currentTime: 4,
      duration: 12,
    });
    store.stopActivePlayback('assets/clip.mp4', 'inline-1', 5);
    store.updateActivePlayback('assets/clip.mp4', 'inline-1', { currentTime: 9, isPlaying: true });

    expect(usePlaybackStore.getState().activePlayback).toBeNull();
    expect(usePlaybackStore.getState().getPlayback('assets/clip.mp4')).toMatchObject({
      currentTime: 5,
      duration: 12,
      wasPlaying: false,
    });
  });

  it('does not consume handoff requests for a different asset or target surface kind', () => {
    const store = usePlaybackStore.getState();

    store.requestHandoff({
      assetPath: 'assets/clip.mp4',
      mediaType: 'video',
      fromSurfaceId: 'inline-1',
      toKind: 'overlay',
      startTime: 5,
    });

    expect(usePlaybackStore.getState().consumeHandoff('assets/other.mp4', 'overlay')).toBeNull();
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'inline')).toBeNull();
    expect(usePlaybackStore.getState().consumeHandoff('assets/clip.mp4', 'overlay')).toMatchObject({
      assetPath: 'assets/clip.mp4',
      startTime: 5,
    });
  });
});
