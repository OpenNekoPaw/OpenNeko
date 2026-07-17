// =============================================================================
// OperationHistorySlice 测试
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { ProjectData } from '../../../types';
import type { EditOperation } from '@neko/shared';
import { applyOperation } from '@neko/shared';
import type { OperationHistorySlice } from '../operationHistorySlice';
import { createOperationHistorySlice } from '../operationHistorySlice';

// Mock extension-sync (postMessage to Extension Host)
vi.mock('../../utils/extension-sync', () => ({
  syncOperationToExtension: vi.fn(),
}));

import { syncOperationToExtension } from '../../utils/extension-sync';

// -- Test helpers ----------------------------------------------------------

function createTestProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Test Project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [],
    ...overrides,
  };
}

function createMeta() {
  return { id: `test-${Date.now()}`, timestamp: Date.now(), source: 'user' as const };
}

function createTrackAddOp(trackId: string): EditOperation {
  return {
    type: 'track.add',
    meta: createMeta(),
    payload: {
      track: {
        id: trackId,
        name: `Track ${trackId}`,
        type: 'video',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      },
    },
  };
}

function createProjectUpdateOp(name: string, oldName: string): EditOperation {
  return {
    type: 'project.update',
    meta: createMeta(),
    payload: { updates: { name } },
    before: { updates: { name: oldName } },
  };
}

// Minimal store combining projectSlice + operationHistorySlice
interface TestStore extends OperationHistorySlice {
  project: ProjectData | null;
  setProject: (p: ProjectData) => void;
}

function createTestStore(initialProject: ProjectData | null = null) {
  return create<TestStore>()((set, get, store) => ({
    project: initialProject,
    setProject: (p) => set({ project: p }),
    ...createOperationHistorySlice(set as any, get as any, store as any),
  }));
}

// -- Tests -----------------------------------------------------------------

describe('operationHistorySlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pushOperation', () => {
    it('should add operation to undo stack', () => {
      const store = createTestStore(createTestProject());
      const op = createTrackAddOp('t1');

      store.getState().pushOperation(op);

      expect(store.getState().opUndoStack).toHaveLength(1);
      expect(store.getState().opUndoStack[0]).toBe(op);
    });

    it('should clear redo stack on push', () => {
      const store = createTestStore(createTestProject());
      const op1 = createTrackAddOp('t1');
      const op2 = createTrackAddOp('t2');

      // Simulate: push op1, then manually put something in redo
      store.getState().pushOperation(op1);
      store.setState({ opRedoStack: [op2] });
      expect(store.getState().opRedoStack).toHaveLength(1);

      // Push new operation → redo stack cleared
      const op3 = createTrackAddOp('t3');
      store.getState().pushOperation(op3);

      expect(store.getState().opRedoStack).toHaveLength(0);
    });

    it('should call syncOperationToExtension', () => {
      const store = createTestStore(createTestProject());
      const op = createTrackAddOp('t1');

      store.getState().pushOperation(op);

      expect(syncOperationToExtension).toHaveBeenCalledWith(op);
    });

    it('should cap undo stack at 200 entries', () => {
      const store = createTestStore(createTestProject());

      // Push 201 operations
      for (let i = 0; i < 201; i++) {
        store.getState().pushOperation(createTrackAddOp(`t${i}`));
      }

      expect(store.getState().opUndoStack).toHaveLength(200);
      // Oldest operation should have been trimmed
      const first = store.getState().opUndoStack[0] as any;
      expect(first.payload.track.id).toBe('t1'); // t0 was trimmed
    });
  });

  describe('opUndo', () => {
    it('should apply inverse operation and move to redo stack', () => {
      const project = createTestProject({ name: 'Old' });
      const store = createTestStore(project);

      // Manually apply and push a project.update operation
      const op = createProjectUpdateOp('New', 'Old');
      const newProject = applyOperation(project, op);
      store.setState({ project: newProject as any });
      store.getState().pushOperation(op);

      expect(store.getState().project!.name).toBe('New');
      expect(store.getState().opUndoStack).toHaveLength(1);

      // Undo
      store.getState().opUndo();

      expect(store.getState().project!.name).toBe('Old');
      expect(store.getState().opUndoStack).toHaveLength(0);
      expect(store.getState().opRedoStack).toHaveLength(1);
    });

    it('should sync inverse operation to extension', () => {
      const project = createTestProject({ name: 'Old' });
      const store = createTestStore(project);
      const op = createProjectUpdateOp('New', 'Old');
      const newProject = applyOperation(project, op);
      store.setState({ project: newProject as any });
      store.getState().pushOperation(op);
      vi.clearAllMocks();

      store.getState().opUndo();

      // Should have synced the inverse operation
      expect(syncOperationToExtension).toHaveBeenCalledTimes(1);
      const syncedOp = vi.mocked(syncOperationToExtension).mock.calls[0]![0];
      expect(syncedOp.type).toBe('project.update');
      // Inverse: payload.updates should contain old name
      expect((syncedOp as any).payload.updates.name).toBe('Old');
    });

    it('should do nothing when undo stack is empty', () => {
      const project = createTestProject();
      const store = createTestStore(project);

      store.getState().opUndo();

      expect(store.getState().opUndoStack).toHaveLength(0);
      expect(store.getState().opRedoStack).toHaveLength(0);
      expect(syncOperationToExtension).not.toHaveBeenCalled();
    });

    it('should do nothing when project is null', () => {
      const store = createTestStore(null);
      store.setState({ opUndoStack: [createTrackAddOp('t1')] });

      store.getState().opUndo();

      // Stack unchanged
      expect(store.getState().opUndoStack).toHaveLength(1);
    });
  });

  describe('opRedo', () => {
    it('should reapply operation and move back to undo stack', () => {
      const project = createTestProject({ name: 'Old' });
      const store = createTestStore(project);

      // Apply → push → undo → then redo
      const op = createProjectUpdateOp('New', 'Old');
      const newProject = applyOperation(project, op);
      store.setState({ project: newProject as any });
      store.getState().pushOperation(op);
      store.getState().opUndo();

      expect(store.getState().project!.name).toBe('Old');

      // Redo
      store.getState().opRedo();

      expect(store.getState().project!.name).toBe('New');
      expect(store.getState().opUndoStack).toHaveLength(1);
      expect(store.getState().opRedoStack).toHaveLength(0);
    });

    it('should sync redo operation to extension', () => {
      const project = createTestProject({ name: 'Old' });
      const store = createTestStore(project);
      const op = createProjectUpdateOp('New', 'Old');
      const newProject = applyOperation(project, op);
      store.setState({ project: newProject as any });
      store.getState().pushOperation(op);
      store.getState().opUndo();
      vi.clearAllMocks();

      store.getState().opRedo();

      expect(syncOperationToExtension).toHaveBeenCalledTimes(1);
      const syncedOp = vi.mocked(syncOperationToExtension).mock.calls[0]![0];
      expect(syncedOp.type).toBe('project.update');
      expect((syncedOp as any).payload.updates.name).toBe('New');
    });

    it('should do nothing when redo stack is empty', () => {
      const project = createTestProject();
      const store = createTestStore(project);

      store.getState().opRedo();

      expect(store.getState().opUndoStack).toHaveLength(0);
      expect(syncOperationToExtension).not.toHaveBeenCalled();
    });
  });

  describe('clearOpHistory', () => {
    it('should clear both stacks', () => {
      const store = createTestStore(createTestProject());

      store.getState().pushOperation(createTrackAddOp('t1'));
      store.getState().pushOperation(createTrackAddOp('t2'));
      store.setState({ opRedoStack: [createTrackAddOp('t3')] });

      store.getState().clearOpHistory();

      expect(store.getState().opUndoStack).toHaveLength(0);
      expect(store.getState().opRedoStack).toHaveLength(0);
    });
  });

  describe('undo/redo roundtrip', () => {
    it('should restore original state after undo then redo', () => {
      const project = createTestProject({ name: 'Original', fps: 30 });
      const store = createTestStore(project);

      const op = createProjectUpdateOp('Modified', 'Original');
      const modified = applyOperation(project, op);
      store.setState({ project: modified as any });
      store.getState().pushOperation(op);

      // Undo → back to original
      store.getState().opUndo();
      expect(store.getState().project!.name).toBe('Original');

      // Redo → back to modified
      store.getState().opRedo();
      expect(store.getState().project!.name).toBe('Modified');

      // Undo again → original
      store.getState().opUndo();
      expect(store.getState().project!.name).toBe('Original');
    });

    it('should handle multiple operations undo in order', () => {
      const project = createTestProject({ name: 'V0' });
      const store = createTestStore(project);

      // Apply op1: V0 → V1
      const op1 = createProjectUpdateOp('V1', 'V0');
      let current = applyOperation(project, op1);
      store.setState({ project: current as any });
      store.getState().pushOperation(op1);

      // Apply op2: V1 → V2
      const op2 = createProjectUpdateOp('V2', 'V1');
      current = applyOperation(current, op2);
      store.setState({ project: current as any });
      store.getState().pushOperation(op2);

      expect(store.getState().project!.name).toBe('V2');

      // Undo op2: V2 → V1
      store.getState().opUndo();
      expect(store.getState().project!.name).toBe('V1');

      // Undo op1: V1 → V0
      store.getState().opUndo();
      expect(store.getState().project!.name).toBe('V0');
    });
  });
});
