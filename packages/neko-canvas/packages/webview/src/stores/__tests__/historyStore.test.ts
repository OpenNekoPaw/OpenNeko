import { describe, it, expect, beforeEach } from 'vitest';
import { useHistoryStore } from '../historyStore';
import type { CanvasData } from '@neko/shared';

// =============================================================================
// Test Helpers
// =============================================================================

function createCanvasData(overrides: Partial<CanvasData> = {}): CanvasData {
  return {
    version: '1.0',
    name: 'Test Canvas',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [],
    connections: [],
    ...overrides,
  };
}

function createCanvasDataWithNode(nodeId: string, x = 0, y = 0): CanvasData {
  return createCanvasData({
    nodes: [
      {
        id: nodeId,
        type: 'annotation',
        position: { x, y },
        size: { width: 100, height: 80 },
        zIndex: 0,
        data: { content: '' },
      },
    ],
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('historyStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useHistoryStore.setState({
      undoStack: [],
      redoStack: [],
      maxHistory: 50,
    });
  });

  it('should start with empty stacks', () => {
    const state = useHistoryStore.getState();

    expect(state.undoStack).toHaveLength(0);
    expect(state.redoStack).toHaveLength(0);
    expect(state.canUndo()).toBe(false);
    expect(state.canRedo()).toBe(false);
  });

  it('should push state to undo stack', () => {
    const data = createCanvasDataWithNode('node-1');
    useHistoryStore.getState().pushState(data);

    const state = useHistoryStore.getState();
    expect(state.undoStack).toHaveLength(1);
    expect(state.canUndo()).toBe(true);
  });

  it('should skip duplicate states', () => {
    const data = createCanvasDataWithNode('node-1', 100, 200);
    useHistoryStore.getState().pushState(data);
    useHistoryStore.getState().pushState(data);

    const state = useHistoryStore.getState();
    // Should only have 1 entry since both pushes are identical
    expect(state.undoStack).toHaveLength(1);
  });

  it('should clear redo stack on new push', () => {
    const data1 = createCanvasDataWithNode('node-1');
    const data2 = createCanvasDataWithNode('node-2');
    const current = createCanvasDataWithNode('node-3');

    // Push two states, then undo to create redo entries
    useHistoryStore.getState().pushState(data1);
    useHistoryStore.getState().pushState(data2);
    useHistoryStore.getState().undo(current);

    expect(useHistoryStore.getState().canRedo()).toBe(true);

    // Push a new state - should clear redo
    const data3 = createCanvasDataWithNode('node-4');
    useHistoryStore.getState().pushState(data3);

    expect(useHistoryStore.getState().canRedo()).toBe(false);
    expect(useHistoryStore.getState().redoStack).toHaveLength(0);
  });

  it('should trim undo stack when exceeding maxHistory', () => {
    useHistoryStore.setState({ maxHistory: 3 });

    // Push 5 different states
    for (let i = 0; i < 5; i++) {
      useHistoryStore.getState().pushState(createCanvasDataWithNode(`node-${i}`, i * 10, 0));
    }

    const state = useHistoryStore.getState();
    expect(state.undoStack).toHaveLength(3);
  });

  it('should undo and push current to redo', () => {
    const data1 = createCanvasDataWithNode('node-1', 0, 0);
    const data2 = createCanvasDataWithNode('node-2', 100, 100);
    const current = createCanvasDataWithNode('node-3', 200, 200);

    useHistoryStore.getState().pushState(data1);
    useHistoryStore.getState().pushState(data2);

    const restored = useHistoryStore.getState().undo(current);

    expect(restored).not.toBeNull();
    // Undo should pop the last entry (data2) from undo stack
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
    // Current state should be pushed to redo stack
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    expect(useHistoryStore.getState().redoStack).toHaveLength(1);

    // Restored should contain data2's nodes (deserialized from the last undo entry)
    expect(restored?.nodes).toHaveLength(1);
    expect(restored?.nodes[0]?.id).toBe('node-2');
  });

  it('should redo and push current to undo', () => {
    const data1 = createCanvasDataWithNode('node-1', 0, 0);
    const afterUndo = createCanvasDataWithNode('node-current', 50, 50);

    useHistoryStore.getState().pushState(data1);

    // Undo to create a redo entry
    useHistoryStore.getState().undo(afterUndo);

    // Now redo
    const currentForRedo = createCanvasDataWithNode('node-redo-current', 75, 75);
    const restored = useHistoryStore.getState().redo(currentForRedo);

    expect(restored).not.toBeNull();
    // Redo should pop from redo stack and push current to undo stack
    expect(useHistoryStore.getState().redoStack).toHaveLength(0);
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);
  });

  it('should preserve viewport on undo/redo', () => {
    const data1 = createCanvasData({
      nodes: [
        {
          id: 'n1',
          type: 'annotation',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 80 },
          zIndex: 0,
          data: { content: '' },
        },
      ],
      viewport: { pan: { x: 10, y: 20 }, zoom: 1.5 },
    });

    const current = createCanvasData({
      nodes: [
        {
          id: 'n2',
          type: 'annotation',
          position: { x: 50, y: 50 },
          size: { width: 100, height: 80 },
          zIndex: 0,
          data: { content: '' },
        },
      ],
      viewport: { pan: { x: 100, y: 200 }, zoom: 2.0 },
    });

    useHistoryStore.getState().pushState(data1);

    const restored = useHistoryStore.getState().undo(current);

    // Viewport should be the current viewport (not the stored one)
    expect(restored?.viewport).toEqual({ pan: { x: 100, y: 200 }, zoom: 2.0 });
    // Nodes should be from the stored state
    expect(restored?.nodes[0]?.id).toBe('n1');
  });

  it('should clear all history', () => {
    useHistoryStore.getState().pushState(createCanvasDataWithNode('a'));
    useHistoryStore.getState().pushState(createCanvasDataWithNode('b', 10, 0));

    useHistoryStore.getState().clear();

    const state = useHistoryStore.getState();
    expect(state.undoStack).toHaveLength(0);
    expect(state.redoStack).toHaveLength(0);
    expect(state.canUndo()).toBe(false);
    expect(state.canRedo()).toBe(false);
  });

  it('should return null when undo stack is empty', () => {
    const current = createCanvasDataWithNode('current');
    const result = useHistoryStore.getState().undo(current);
    expect(result).toBeNull();
  });

  it('should return null when redo stack is empty', () => {
    const current = createCanvasDataWithNode('current');
    const result = useHistoryStore.getState().redo(current);
    expect(result).toBeNull();
  });
});
