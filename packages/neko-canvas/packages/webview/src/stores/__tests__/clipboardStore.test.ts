import { describe, it, expect, beforeEach } from 'vitest';
import { useClipboardStore } from '../clipboardStore';
import type { CanvasNode, CanvasConnection } from '@neko/shared';

// =============================================================================
// Test Helpers
// =============================================================================

function createNode(id: string, x = 0, y = 0, width = 100, height = 80): CanvasNode {
  return {
    id,
    type: 'annotation',
    position: { x, y },
    size: { width, height },
    zIndex: 0,
    data: { content: `Node ${id}` },
  };
}

function createConnection(id: string, sourceId: string, targetId: string): CanvasConnection {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type: 'default',
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('clipboardStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useClipboardStore.setState({ clipboard: null });
  });

  it('canPaste should return false when empty', () => {
    expect(useClipboardStore.getState().canPaste()).toBe(false);
  });

  it('copy should store selected nodes', () => {
    const nodes = [createNode('a', 10, 20), createNode('b', 100, 200), createNode('c', 300, 400)];
    const connections: CanvasConnection[] = [];

    useClipboardStore.getState().copy(['a', 'b'], nodes, connections);

    const { clipboard } = useClipboardStore.getState();
    expect(clipboard).not.toBeNull();
    expect(clipboard?.nodes).toHaveLength(2);
    expect(clipboard?.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(useClipboardStore.getState().canPaste()).toBe(true);
  });

  it('copy should only store inter-connections', () => {
    const nodes = [createNode('a'), createNode('b'), createNode('c')];
    const connections = [
      createConnection('conn-ab', 'a', 'b'), // both selected
      createConnection('conn-ac', 'a', 'c'), // c not selected
      createConnection('conn-bc', 'b', 'c'), // c not selected
    ];

    useClipboardStore.getState().copy(['a', 'b'], nodes, connections);

    const { clipboard } = useClipboardStore.getState();
    // Only conn-ab should be stored (both source and target selected)
    expect(clipboard?.connections).toHaveLength(1);
    expect(clipboard?.connections[0]?.id).toBe('conn-ab');
  });

  it('paste should clone with new IDs', () => {
    const nodes = [createNode('original', 50, 60)];
    const connections: CanvasConnection[] = [];

    useClipboardStore.getState().copy(['original'], nodes, connections);
    const result = useClipboardStore.getState().paste();

    expect(result).not.toBeNull();
    expect(result?.nodes).toHaveLength(1);
    // ID should be different from original
    expect(result?.nodes[0]?.id).not.toBe('original');
    // Type and data should be preserved
    expect(result?.nodes[0]?.type).toBe('annotation');
  });

  it('paste should offset positions', () => {
    const nodes = [createNode('a', 100, 200)];
    const connections: CanvasConnection[] = [];

    useClipboardStore.getState().copy(['a'], nodes, connections);
    const result = useClipboardStore.getState().paste();

    expect(result).not.toBeNull();
    // Default paste offset is { x: 30, y: 30 }
    expect(result?.nodes[0]?.position.x).toBe(130);
    expect(result?.nodes[0]?.position.y).toBe(230);
  });

  it('paste should use custom offset when provided', () => {
    const nodes = [createNode('a', 100, 200)];
    const connections: CanvasConnection[] = [];

    useClipboardStore.getState().copy(['a'], nodes, connections);
    const result = useClipboardStore.getState().paste({ x: 50, y: -10 });

    expect(result).not.toBeNull();
    expect(result?.nodes[0]?.position.x).toBe(150);
    expect(result?.nodes[0]?.position.y).toBe(190);
  });

  it('paste should remap connection IDs to new node IDs', () => {
    const nodes = [createNode('a'), createNode('b')];
    const connections = [createConnection('conn-1', 'a', 'b')];

    useClipboardStore.getState().copy(['a', 'b'], nodes, connections);
    const result = useClipboardStore.getState().paste();

    expect(result).not.toBeNull();
    expect(result?.connections).toHaveLength(1);

    const pastedConn = result?.connections[0];
    const pastedNodeIds = result?.nodes.map((n) => n.id) ?? [];

    // Connection IDs should be remapped to new node IDs
    expect(pastedNodeIds).toContain(pastedConn?.sourceId);
    expect(pastedNodeIds).toContain(pastedConn?.targetId);
    // Original IDs should not appear
    expect(pastedConn?.sourceId).not.toBe('a');
    expect(pastedConn?.targetId).not.toBe('b');
  });

  it('paste should remap container child IDs and parent IDs within the copied subtree', () => {
    const group: CanvasNode = {
      id: 'group-1',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 200, height: 160 },
      zIndex: 0,
      container: { policy: 'group', childIds: ['child-1'] },
      data: { label: 'Group' },
    };
    const child: CanvasNode = {
      ...createNode('child-1', 20, 20),
      parentId: 'group-1',
    };

    useClipboardStore.getState().copy(['group-1', 'child-1'], [group, child], []);
    const result = useClipboardStore.getState().paste();

    const pastedGroup = result?.nodes.find((node) => node.type === 'group');
    const pastedChild = result?.nodes.find((node) => node.type === 'annotation');

    expect(pastedGroup?.id).not.toBe('group-1');
    expect(pastedChild?.id).not.toBe('child-1');
    expect(pastedGroup?.container?.childIds).toEqual([pastedChild?.id]);
    expect(pastedChild?.parentId).toBe(pastedGroup?.id);
    expect(pastedGroup?.type === 'group' ? 'childIds' in pastedGroup.data : false).toBe(false);
  });

  it('copying or duplicating only a Group includes its complete nested subtree', () => {
    const outer: CanvasNode = {
      id: 'outer',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 320 },
      zIndex: 0,
      container: { policy: 'group', childIds: ['inner'] },
      data: { label: 'Outer' },
    };
    const inner: CanvasNode = {
      id: 'inner',
      type: 'group',
      parentId: 'outer',
      position: { x: 20, y: 60 },
      size: { width: 300, height: 220 },
      zIndex: 1,
      container: { policy: 'group', childIds: ['child'] },
      data: { label: 'Inner' },
    };
    const child = { ...createNode('child', 40, 120), parentId: 'inner' };
    const connection = createConnection('inner-link', 'inner', 'child');

    useClipboardStore.getState().copy(['outer'], [outer, inner, child], [connection]);
    expect(useClipboardStore.getState().clipboard?.nodes.map((node) => node.id)).toEqual([
      'outer',
      'inner',
      'child',
    ]);
    expect(useClipboardStore.getState().clipboard?.connections).toHaveLength(1);

    const duplicate = useClipboardStore
      .getState()
      .duplicate(['outer'], [outer, inner, child], [connection]);
    expect(duplicate?.nodes).toHaveLength(3);
    expect(duplicate?.connections).toHaveLength(1);
    const duplicatedOuter = duplicate?.nodes.find((node) => !node.parentId);
    const duplicatedInner = duplicate?.nodes.find((node) => node.type === 'group' && node.parentId);
    const duplicatedChild = duplicate?.nodes.find((node) => node.type === 'annotation');
    expect(duplicatedOuter?.container?.childIds).toEqual([duplicatedInner?.id]);
    expect(duplicatedInner?.container?.childIds).toEqual([duplicatedChild?.id]);
  });

  it('paste should remap migrated Scene canonical children', () => {
    const scene: CanvasNode = {
      id: 'scene-1',
      type: 'scene',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 240 },
      zIndex: 0,
      preset: 'scene.basic',
      container: { policy: 'scene', childIds: ['shot-1'] },
      data: { sceneTitle: 'Scene', sceneNumber: 1 },
    };
    const shot: CanvasNode = {
      id: 'shot-1',
      type: 'shot',
      position: { x: 20, y: 60 },
      size: { width: 220, height: 200 },
      zIndex: 1,
      parentId: 'scene-1',
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

    useClipboardStore.getState().copy(['scene-1', 'shot-1'], [scene, shot], []);
    const result = useClipboardStore.getState().paste();

    const pastedScene = result?.nodes.find((node) => node.type === 'scene');
    const pastedShot = result?.nodes.find((node) => node.type === 'shot');

    expect(pastedScene?.container?.childIds).toEqual([pastedShot?.id]);
    expect(pastedShot?.parentId).toBe(pastedScene?.id);
  });

  it('duplicate should create copies with small offset', () => {
    const nodes = [createNode('a', 100, 200)];
    const connections: CanvasConnection[] = [];

    const result = useClipboardStore.getState().duplicate(['a'], nodes, connections);

    expect(result).not.toBeNull();
    expect(result?.nodes).toHaveLength(1);
    // Duplicate offset is { x: 20, y: 20 }
    expect(result?.nodes[0]?.position.x).toBe(120);
    expect(result?.nodes[0]?.position.y).toBe(220);
    expect(result?.nodes[0]?.id).not.toBe('a');
  });

  it('duplicate should return null for empty selection', () => {
    const nodes = [createNode('a')];
    const connections: CanvasConnection[] = [];

    const result = useClipboardStore.getState().duplicate([], nodes, connections);
    expect(result).toBeNull();
  });

  it('cut should store to clipboard (same as copy)', () => {
    const nodes = [createNode('a', 10, 20), createNode('b', 30, 40)];
    const connections: CanvasConnection[] = [];

    useClipboardStore.getState().cut(['a'], nodes, connections);

    const { clipboard } = useClipboardStore.getState();
    expect(clipboard).not.toBeNull();
    expect(clipboard?.nodes).toHaveLength(1);
    expect(clipboard?.nodes[0]?.id).toBe('a');
    expect(useClipboardStore.getState().canPaste()).toBe(true);
  });

  it('clear should reset clipboard', () => {
    const nodes = [createNode('a')];
    useClipboardStore.getState().copy(['a'], nodes, []);

    expect(useClipboardStore.getState().canPaste()).toBe(true);

    useClipboardStore.getState().clear();

    expect(useClipboardStore.getState().clipboard).toBeNull();
    expect(useClipboardStore.getState().canPaste()).toBe(false);
  });

  it('paste should return null when clipboard is empty', () => {
    const result = useClipboardStore.getState().paste();
    expect(result).toBeNull();
  });

  it('copy should not store anything when no nodes match selection', () => {
    const nodes = [createNode('a')];
    const connections: CanvasConnection[] = [];

    useClipboardStore.getState().copy(['nonexistent'], nodes, connections);

    // Copy with no matching nodes does nothing
    expect(useClipboardStore.getState().clipboard).toBeNull();
  });
});
