// =============================================================================
// ShapeOpsSlice Tests
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import type { ProjectData } from '../../../types';
import type { EditOperation } from '@neko/shared';
import type { ShapeOpsSlice } from '../shapeOpsSlice';

// Mock vscodeApi to prevent @neko/shared/vscode resolution failure in test environment
vi.mock('../../../utils/vscodeApi', () => ({
  postMessage: vi.fn(),
  getVSCodeAPI: vi.fn(),
  isVSCodeContext: vi.fn().mockReturnValue(false),
  getState: vi.fn(),
  setState: vi.fn(),
  sendRequest: vi.fn(),
  cancelRequest: vi.fn(),
  getPendingRequestCount: vi.fn().mockReturnValue(0),
  vscodeApi: null,
  sendMessage: vi.fn(),
}));

import { createShapeOpsSlice } from '../shapeOpsSlice';

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

function createProjectWithShapes(): ProjectData {
  return createTestProject({
    tracks: [
      {
        id: 'shape-track',
        name: 'Shape Track',
        type: 'shape',
        elements: [
          {
            id: 'shape-elem-1',
            type: 'shape',
            name: 'Shape Layer',
            startTime: 0,
            duration: 5,
            trimStart: 0,
            trimEnd: 0,
            transform: {},
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
            shapeType: 'rectangle',
            fill: '#4a90d9',
            stroke: '#333333',
            strokeWidth: 2,
            shapes: [
              {
                id: 'shape-inst-1',
                name: 'Rectangle 1',
                shape: {
                  shapeType: 'rectangle',
                  centerX: 50,
                  centerY: 50,
                  width: 100,
                  height: 80,
                  rotation: 0,
                  cornerRadius: 0,
                },
                style: {
                  fill: { type: 'solid', color: '#ff0000', opacity: 1 },
                  stroke: {
                    color: '#000000',
                    width: 2,
                    opacity: 1,
                    lineCap: 'butt',
                    lineJoin: 'miter',
                    dashArray: [],
                  },
                  shadow: { color: '#000000', blur: 0, offsetX: 0, offsetY: 0, opacity: 0 },
                },
                zIndex: 0,
                visible: true,
                locked: false,
              },
              {
                id: 'shape-inst-2',
                name: 'Ellipse 1',
                shape: {
                  shapeType: 'ellipse',
                  centerX: 150,
                  centerY: 100,
                  radiusX: 40,
                  radiusY: 30,
                  rotation: 0,
                },
                style: {
                  fill: { type: 'solid', color: '#00ff00', opacity: 1 },
                  stroke: {
                    color: '#000000',
                    width: 1,
                    opacity: 1,
                    lineCap: 'butt',
                    lineJoin: 'miter',
                    dashArray: [],
                  },
                  shadow: { color: '#000000', blur: 0, offsetX: 0, offsetY: 0, opacity: 0 },
                },
                zIndex: 1,
                visible: true,
                locked: false,
              },
            ],
          } as any,
        ],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      } as any,
      {
        id: 'media-track',
        name: 'Media Track',
        type: 'media',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      } as any,
    ],
  });
}

interface TestStore extends ShapeOpsSlice {
  project: ProjectData | null;
  dispatch: (op: EditOperation) => void;
}

function createTestStore(project: ProjectData | null = null) {
  const dispatchMock = vi.fn();
  const store = create<TestStore>()((set, get, storeApi) => ({
    project,
    dispatch: dispatchMock,
    ...createShapeOpsSlice(set as any, get as any, storeApi as any),
  }));
  return { store, dispatchMock };
}

// -- Tests -----------------------------------------------------------------

describe('shapeOpsSlice', () => {
  describe('addShapeElement', () => {
    it('should dispatch shape.addElement operation', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().addShapeElement('shape-track');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.addElement');
      expect((op.payload as any).trackId).toBe('shape-track');
    });

    it('should return generated element ID', () => {
      const { store } = createTestStore(createProjectWithShapes());
      const id = store.getState().addShapeElement('shape-track');
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should return empty string when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      const id = store.getState().addShapeElement('shape-track');
      expect(id).toBe('');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should use default startTime=0 and duration=5', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().addShapeElement('shape-track');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const elem = (op.payload as any).element;
      expect(elem.startTime).toBe(0);
      expect(elem.duration).toBe(5);
    });

    it('should accept custom startTime and duration', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().addShapeElement('shape-track', 3, 10);

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const elem = (op.payload as any).element;
      expect(elem.startTime).toBe(3);
      expect(elem.duration).toBe(10);
    });

    it('should create element with empty shapes array', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().addShapeElement('shape-track');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).element.shapes).toEqual([]);
    });
  });

  describe('addShape', () => {
    it('should dispatch shape.add for rectangle', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().addShape('shape-track', 'shape-elem-1', 'rectangle');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.add');
      expect((op.payload as any).trackId).toBe('shape-track');
      expect((op.payload as any).elementId).toBe('shape-elem-1');
    });

    it('should return generated shape instance ID', () => {
      const { store } = createTestStore(createProjectWithShapes());
      const id = store.getState().addShape('shape-track', 'shape-elem-1', 'ellipse');
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should set zIndex to current max + 1', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().addShape('shape-track', 'shape-elem-1', 'rectangle');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      const shape = (op.payload as any).shape;
      // Current max zIndex is 1 (shape-inst-2), so new should be 2
      expect(shape.zIndex).toBe(2);
    });

    it('should return empty string when element not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      const id = store.getState().addShape('shape-track', 'nonexistent', 'rectangle');
      expect(id).toBe('');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return empty string when project is null', () => {
      const { store } = createTestStore(null);
      const id = store.getState().addShape('t', 'e', 'rectangle');
      expect(id).toBe('');
    });

    it('should use custom name when provided', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().addShape('shape-track', 'shape-elem-1', 'star', 'My Star');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).shape.name).toBe('My Star');
    });

    it('should not match non-shape track elements', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      const id = store.getState().addShape('media-track', 'some-elem', 'rectangle');
      expect(id).toBe('');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('removeShape', () => {
    it('should dispatch shape.remove', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().removeShape('shape-track', 'shape-elem-1', 'shape-inst-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.remove');
      expect((op.payload as any).shapeId).toBe('shape-inst-1');
    });

    it('should include before data with shape and index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().removeShape('shape-track', 'shape-elem-1', 'shape-inst-1');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.shape.id).toBe('shape-inst-1');
      expect((op as any).before.index).toBe(0);
    });

    it('should not dispatch when shape not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().removeShape('shape-track', 'shape-elem-1', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().removeShape('t', 'e', 's');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('duplicateShape', () => {
    it('should dispatch shape.duplicate', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().duplicateShape('shape-track', 'shape-elem-1', 'shape-inst-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.duplicate');
    });

    it('should append (Copy) to duplicated name', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().duplicateShape('shape-track', 'shape-elem-1', 'shape-inst-1');

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).newShape.name).toBe('Rectangle 1 (Copy)');
    });

    it('should return new shape ID', () => {
      const { store } = createTestStore(createProjectWithShapes());
      const id = store.getState().duplicateShape('shape-track', 'shape-elem-1', 'shape-inst-1');
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should return null when shape not found', () => {
      const { store } = createTestStore(createProjectWithShapes());
      const id = store.getState().duplicateShape('shape-track', 'shape-elem-1', 'nonexistent');
      expect(id).toBeNull();
    });

    it('should return null when project is null', () => {
      const { store } = createTestStore(null);
      const id = store.getState().duplicateShape('t', 'e', 's');
      expect(id).toBeNull();
    });
  });

  describe('updateShape', () => {
    it('should dispatch shape.update with updates', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store
        .getState()
        .updateShape('shape-track', 'shape-elem-1', 'shape-inst-1', { name: 'Renamed' });

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.update');
      expect((op.payload as any).updates.name).toBe('Renamed');
    });

    it('should include before data with old values', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().updateShape('shape-track', 'shape-elem-1', 'shape-inst-1', { name: 'New' });

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.updates.name).toBe('Rectangle 1');
    });

    it('should not dispatch when shape not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().updateShape('shape-track', 'shape-elem-1', 'nonexistent', { name: 'X' });
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('updateShapeGeometry', () => {
    it('should dispatch shape.updateGeometry', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().updateShapeGeometry('shape-track', 'shape-elem-1', 'shape-inst-1', {
        centerX: 200,
        centerY: 200,
      });

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.updateGeometry');
      expect((op.payload as any).shape.centerX).toBe(200);
    });

    it('should include before data from existing geometry', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().updateShapeGeometry('shape-track', 'shape-elem-1', 'shape-inst-1', {
        centerX: 200,
      });

      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op as any).before.shape.centerX).toBe(50);
    });
  });

  describe('updateShapeStyle', () => {
    it('should dispatch shape.updateStyle', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      const newFill = { type: 'solid' as const, color: '#0000ff', opacity: 0.5 };
      store
        .getState()
        .updateShapeStyle('shape-track', 'shape-elem-1', 'shape-inst-1', { fill: newFill });

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.updateStyle');
    });
  });

  describe('toggleShapeVisibility', () => {
    it('should dispatch shape.toggle with field "visible"', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().toggleShapeVisibility('shape-track', 'shape-elem-1', 'shape-inst-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.toggle');
      expect((op.payload as any).field).toBe('visible');
      expect((op as any).before.value).toBe(true);
    });

    it('should not dispatch when shape not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().toggleShapeVisibility('shape-track', 'shape-elem-1', 'nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('toggleShapeLocked', () => {
    it('should dispatch shape.toggle with field "locked"', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().toggleShapeLocked('shape-track', 'shape-elem-1', 'shape-inst-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.toggle');
      expect((op.payload as any).field).toBe('locked');
      expect((op as any).before.value).toBe(false);
    });
  });

  describe('moveShapeToIndex', () => {
    it('should dispatch shape.reorder', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeToIndex('shape-track', 'shape-elem-1', 'shape-inst-1', 1);

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.reorder');
      expect((op.payload as any).fromIndex).toBe(0);
      expect((op.payload as any).toIndex).toBe(1);
    });

    it('should not dispatch when already at target index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeToIndex('shape-track', 'shape-elem-1', 'shape-inst-1', 0);
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when shape not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeToIndex('shape-track', 'shape-elem-1', 'nonexistent', 1);
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('moveShapeUp', () => {
    it('should move shape up (higher index)', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeUp('shape-track', 'shape-elem-1', 'shape-inst-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).fromIndex).toBe(0);
      expect((op.payload as any).toIndex).toBe(1);
    });

    it('should not move when already at top (last index)', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeUp('shape-track', 'shape-elem-1', 'shape-inst-2');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('moveShapeDown', () => {
    it('should move shape down (lower index)', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeDown('shape-track', 'shape-elem-1', 'shape-inst-2');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).fromIndex).toBe(1);
      expect((op.payload as any).toIndex).toBe(0);
    });

    it('should not move when already at bottom (index 0)', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeDown('shape-track', 'shape-elem-1', 'shape-inst-1');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('moveShapeToTop', () => {
    it('should move shape to last index', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeToTop('shape-track', 'shape-elem-1', 'shape-inst-1');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).toIndex).toBe(1); // 2 shapes, last index is 1
    });
  });

  describe('moveShapeToBottom', () => {
    it('should move shape to index 0', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().moveShapeToBottom('shape-track', 'shape-elem-1', 'shape-inst-2');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect((op.payload as any).toIndex).toBe(0);
    });
  });

  describe('updateShapeById', () => {
    it('should find shape across tracks and dispatch update', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().updateShapeById('shape-inst-1', { name: 'Updated Name' });

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.update');
      expect((op.payload as any).trackId).toBe('shape-track');
      expect((op.payload as any).elementId).toBe('shape-elem-1');
      expect((op.payload as any).shapeId).toBe('shape-inst-1');
    });

    it('should not dispatch when shape ID not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().updateShapeById('nonexistent', { name: 'X' });
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should not dispatch when project is null', () => {
      const { store, dispatchMock } = createTestStore(null);
      store.getState().updateShapeById('shape-inst-1', { name: 'X' });
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('removeShapeById', () => {
    it('should find shape across tracks and dispatch remove', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().removeShapeById('shape-inst-2');

      expect(dispatchMock).toHaveBeenCalledTimes(1);
      const op = dispatchMock.mock.calls[0]![0] as EditOperation;
      expect(op.type).toBe('shape.remove');
      expect((op.payload as any).shapeId).toBe('shape-inst-2');
      expect((op as any).before.index).toBe(1);
    });

    it('should not dispatch when shape ID not found', () => {
      const { store, dispatchMock } = createTestStore(createProjectWithShapes());
      store.getState().removeShapeById('nonexistent');
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });
});
