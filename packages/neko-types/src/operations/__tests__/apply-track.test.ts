// =============================================================================
// Track Operations 测试
// =============================================================================

import { describe, it, expect } from 'vitest';
import { applyOperation } from '../apply';
import { OperationError } from '../errors';
import { createTestProject, createTestTrack, createMeta } from './test-helpers';

describe('apply-track', () => {
  describe('track.add', () => {
    it('should add track to end', () => {
      const project = createTestProject();
      const track = createTestTrack({ id: 't1', name: 'New Track' });

      const result = applyOperation(project, {
        type: 'track.add',
        meta: createMeta(),
        payload: { track },
      });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].id).toBe('t1');
    });

    it('should add track at specific index', () => {
      const t1 = createTestTrack({ id: 't1' });
      const t2 = createTestTrack({ id: 't2' });
      const project = createTestProject({ tracks: [t1, t2] });
      const newTrack = createTestTrack({ id: 't3' });

      const result = applyOperation(project, {
        type: 'track.add',
        meta: createMeta(),
        payload: { track: newTrack, index: 1 },
      });

      expect(result.tracks).toHaveLength(3);
      expect(result.tracks[1].id).toBe('t3');
    });
  });

  describe('track.remove', () => {
    it('should remove track by id', () => {
      const t1 = createTestTrack({ id: 't1' });
      const t2 = createTestTrack({ id: 't2' });
      const project = createTestProject({ tracks: [t1, t2] });

      const result = applyOperation(project, {
        type: 'track.remove',
        meta: createMeta(),
        payload: { trackId: 't1' },
        before: { track: t1, index: 0 },
      });

      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].id).toBe('t2');
    });

    it('should throw when track not found', () => {
      const project = createTestProject();

      expect(() =>
        applyOperation(project, {
          type: 'track.remove',
          meta: createMeta(),
          payload: { trackId: 'nonexistent' },
          before: { track: createTestTrack(), index: 0 },
        }),
      ).toThrow(OperationError);
    });
  });

  describe('track.update', () => {
    it('should update track fields', () => {
      const t1 = createTestTrack({ id: 't1', name: 'Old Name' });
      const project = createTestProject({ tracks: [t1] });

      const result = applyOperation(project, {
        type: 'track.update',
        meta: createMeta(),
        payload: { trackId: 't1', updates: { name: 'New Name', muted: true } },
        before: { updates: { name: 'Old Name', muted: false } },
      });

      expect(result.tracks[0].name).toBe('New Name');
      expect(result.tracks[0].muted).toBe(true);
    });
  });

  describe('track.reorder', () => {
    it('should reorder tracks', () => {
      const t1 = createTestTrack({ id: 't1' });
      const t2 = createTestTrack({ id: 't2' });
      const t3 = createTestTrack({ id: 't3' });
      const project = createTestProject({ tracks: [t1, t2, t3] });

      const result = applyOperation(project, {
        type: 'track.reorder',
        meta: createMeta(),
        payload: { trackId: 't1', fromIndex: 0, toIndex: 2 },
      });

      expect(result.tracks.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
    });

    it('should no-op when from === to', () => {
      const t1 = createTestTrack({ id: 't1' });
      const project = createTestProject({ tracks: [t1] });

      const result = applyOperation(project, {
        type: 'track.reorder',
        meta: createMeta(),
        payload: { trackId: 't1', fromIndex: 0, toIndex: 0 },
      });

      expect(result).toBe(project); // same reference
    });

    it('should throw on invalid index', () => {
      const project = createTestProject({ tracks: [createTestTrack()] });

      expect(() =>
        applyOperation(project, {
          type: 'track.reorder',
          meta: createMeta(),
          payload: { trackId: 'x', fromIndex: -1, toIndex: 0 },
        }),
      ).toThrow(OperationError);
    });
  });

  describe('track.toggle', () => {
    it('should toggle muted', () => {
      const t1 = createTestTrack({ id: 't1', muted: false });
      const project = createTestProject({ tracks: [t1] });

      const result = applyOperation(project, {
        type: 'track.toggle',
        meta: createMeta(),
        payload: { trackId: 't1', field: 'muted' },
        before: { value: false },
      });

      expect(result.tracks[0].muted).toBe(true);
    });

    it('should toggle hidden', () => {
      const t1 = createTestTrack({ id: 't1', hidden: true });
      const project = createTestProject({ tracks: [t1] });

      const result = applyOperation(project, {
        type: 'track.toggle',
        meta: createMeta(),
        payload: { trackId: 't1', field: 'hidden' },
        before: { value: true },
      });

      expect(result.tracks[0].hidden).toBe(false);
    });
  });
});
