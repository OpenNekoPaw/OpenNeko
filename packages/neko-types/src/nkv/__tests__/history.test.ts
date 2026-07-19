/**
 * NKV Format SDK — Operation History Persistence Tests
 */

import { describe, it, expect } from 'vitest';
import { serializeHistory, deserializeHistory, saveHistory, loadHistory } from '../history';
import type { EditOperation } from '../../operations/types';
import type { ProjectData } from '../../types/project';
import type { OperationHistorySnapshot } from '../history';

// =============================================================================
// Fixtures
// =============================================================================

const MOCK_PROJECT: ProjectData = {
  version: '2.0',
  name: 'Test Project',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [],
};

function createMockOperation(type: string, id: string): EditOperation {
  return {
    type: 'element.update',
    meta: { id, timestamp: Date.now(), source: 'user' },
    payload: {
      trackId: 'track-1',
      elementId: 'elem-1',
      updates: { opacity: 0.5 },
    },
    before: {
      updates: { opacity: 1.0 },
    },
  } as EditOperation;
}

function createLargeElementUpdateOp(base64Data: string): EditOperation {
  return {
    type: 'element.update',
    meta: { id: 'large-update-1', timestamp: Date.now(), source: 'user' },
    payload: {
      trackId: 'track-1',
      elementId: 'element-1',
      updates: { name: base64Data },
    },
    before: {
      updates: { name: base64Data },
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Operation History Persistence', () => {
  describe('serializeHistory + deserializeHistory', () => {
    it('should roundtrip simple operations', () => {
      const undoStack = [
        createMockOperation('element.update', 'op-1'),
        createMockOperation('element.update', 'op-2'),
      ];
      const redoStack = [createMockOperation('element.update', 'op-3')];

      const snapshot = serializeHistory(undoStack, redoStack, MOCK_PROJECT);

      expect(snapshot.version).toBe('1.0');
      expect(snapshot.projectVersion).toBe('2.0');
      expect(snapshot.projectName).toBe('Test Project');
      expect(snapshot.undoStack).toHaveLength(2);
      expect(snapshot.redoStack).toHaveLength(1);
      expect(typeof snapshot.savedAt).toBe('number');

      const restored = deserializeHistory(snapshot);
      expect(restored.undoStack).toHaveLength(2);
      expect(restored.redoStack).toHaveLength(1);
      expect(restored.undoStack[0]!.type).toBe('element.update');
      expect(restored.undoStack[0]!.meta.id).toBe('op-1');
    });

    it('should handle empty stacks', () => {
      const snapshot = serializeHistory([], [], MOCK_PROJECT);

      expect(snapshot.undoStack).toHaveLength(0);
      expect(snapshot.redoStack).toHaveLength(0);

      const restored = deserializeHistory(snapshot);
      expect(restored.undoStack).toHaveLength(0);
      expect(restored.redoStack).toHaveLength(0);
    });

    it('should strip large base64 binary data', () => {
      // Create a large base64 string (>1024 chars)
      const largeBase64 = 'A'.repeat(2000) + '==';
      const ops = [createLargeElementUpdateOp(largeBase64)];

      const snapshot = serializeHistory(ops, [], MOCK_PROJECT);

      // The large data should be replaced with sentinel
      const serializedPayload = snapshot.undoStack[0]!.payload as {
        readonly updates: { readonly name: string };
      };
      expect(serializedPayload.updates.name).toBe('__skipped__');

      const serializedBefore = snapshot.undoStack[0]!.before as {
        readonly updates: { readonly name: string };
      };
      expect(serializedBefore.updates.name).toBe('__skipped__');
    });

    it('should preserve small strings', () => {
      const op: EditOperation = {
        type: 'element.update',
        meta: { id: 'op-1', timestamp: 1000, source: 'user' },
        payload: {
          trackId: 'track-1',
          elementId: 'elem-1',
          updates: { name: 'Short Name' },
        },
        before: {
          updates: { name: 'Old Name' },
        },
      } as EditOperation;

      const snapshot = serializeHistory([op], [], MOCK_PROJECT);
      const payload = snapshot.undoStack[0]!.payload as Record<string, any>;
      expect(payload['updates']['name']).toBe('Short Name');
    });

    it('should not mutate original operations', () => {
      const original = createMockOperation('element.update', 'op-1');
      const originalPayload = JSON.parse(JSON.stringify((original as any).payload));

      serializeHistory([original], [], MOCK_PROJECT);

      expect((original as any).payload).toEqual(originalPayload);
    });
  });

  describe('saveHistory + loadHistory', () => {
    it('should roundtrip through JSON string', () => {
      const ops = [createMockOperation('element.update', 'op-1')];
      const snapshot = serializeHistory(ops, [], MOCK_PROJECT);

      const json = saveHistory(snapshot);
      expect(typeof json).toBe('string');

      const loaded = loadHistory(json);
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe('1.0');
      expect(loaded!.undoStack).toHaveLength(1);
      expect(loaded!.undoStack[0]!.meta.id).toBe('op-1');
    });

    it('should return null for invalid JSON', () => {
      expect(loadHistory('not json')).toBeNull();
      expect(loadHistory('')).toBeNull();
      expect(loadHistory('{}')).toBeNull();
    });

    it('should return null for malformed snapshot', () => {
      // Missing required fields
      expect(loadHistory('{"version": "1.0"}')).toBeNull();
      // Wrong version
      expect(
        loadHistory(
          JSON.stringify({
            version: '2.0',
            projectVersion: '2.0',
            projectName: 'Test',
            undoStack: [],
            redoStack: [],
            savedAt: 1000,
          }),
        ),
      ).toBeNull();
    });

    it('should accept valid minimal snapshot', () => {
      const minimal: OperationHistorySnapshot = {
        version: '1.0',
        projectVersion: '2.0',
        projectName: 'Minimal',
        undoStack: [],
        redoStack: [],
        savedAt: Date.now(),
      };

      const json = saveHistory(minimal);
      const loaded = loadHistory(json);
      expect(loaded).toEqual(minimal);
    });
  });

  describe('batch operations', () => {
    it('should serialize batch operations with nested ops', () => {
      const batchOp: EditOperation = {
        type: 'batch',
        meta: { id: 'batch-1', timestamp: Date.now(), source: 'user' },
        payload: {
          operations: [
            createMockOperation('element.update', 'inner-1'),
            createMockOperation('element.update', 'inner-2'),
          ],
        },
      } as EditOperation;

      const snapshot = serializeHistory([batchOp], [], MOCK_PROJECT);
      expect(snapshot.undoStack).toHaveLength(1);

      const serialized = snapshot.undoStack[0]!;
      expect(serialized.type).toBe('batch');

      const innerOps = (serialized.payload as Record<string, any>)['operations'] as any[];
      expect(innerOps).toHaveLength(2);
      expect(innerOps[0]['meta']['id']).toBe('inner-1');
    });
  });
});
