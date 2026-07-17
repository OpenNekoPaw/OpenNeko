// =============================================================================
// Element Operations 测试
// =============================================================================

import { describe, it, expect } from 'vitest';
import { applyOperation } from '../apply';
import { OperationError } from '../errors';
import {
  createTestProject,
  createTestTrack,
  createTestMediaElement,
  createTestAudioElement,
  createMeta,
  createPopulatedProject,
} from './test-helpers';

describe('apply-element', () => {
  describe('element.add', () => {
    it('should add element to track', () => {
      const track = createTestTrack({ id: 't1' });
      const project = createTestProject({ tracks: [track] });
      const element = createTestMediaElement({ id: 'e1' });

      const result = applyOperation(project, {
        type: 'element.add',
        meta: createMeta(),
        payload: { trackId: 't1', element },
      });

      expect(result.tracks[0].elements).toHaveLength(1);
      expect(result.tracks[0].elements[0].id).toBe('e1');
    });

    it('should add element at specific index', () => {
      const e1 = createTestMediaElement({ id: 'e1' });
      const e2 = createTestMediaElement({ id: 'e2' });
      const track = createTestTrack({ id: 't1', elements: [e1, e2] });
      const project = createTestProject({ tracks: [track] });
      const newElem = createTestMediaElement({ id: 'e3' });

      const result = applyOperation(project, {
        type: 'element.add',
        meta: createMeta(),
        payload: { trackId: 't1', element: newElem, index: 1 },
      });

      expect(result.tracks[0].elements.map((e) => e.id)).toEqual(['e1', 'e3', 'e2']);
    });
  });

  describe('element.remove', () => {
    it('should remove element from track', () => {
      const e1 = createTestMediaElement({ id: 'e1' });
      const e2 = createTestMediaElement({ id: 'e2' });
      const track = createTestTrack({ id: 't1', elements: [e1, e2] });
      const project = createTestProject({ tracks: [track] });

      const result = applyOperation(project, {
        type: 'element.remove',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1' },
        before: { element: e1, index: 0 },
      });

      expect(result.tracks[0].elements).toHaveLength(1);
      expect(result.tracks[0].elements[0].id).toBe('e2');
    });

    it('should handle ripple editing', () => {
      const e1 = createTestMediaElement({
        id: 'e1',
        startTime: 0,
        duration: 5,
        trimStart: 0,
        trimEnd: 0,
      });
      const e2 = createTestMediaElement({ id: 'e2', startTime: 5 });
      const e3 = createTestMediaElement({ id: 'e3', startTime: 10 });
      const track = createTestTrack({ id: 't1', elements: [e1, e2, e3] });
      const project = createTestProject({ tracks: [track] });

      const result = applyOperation(project, {
        type: 'element.remove',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1' },
        before: {
          element: e1,
          index: 0,
          rippleAffected: [
            { elementId: 'e2', startTime: 5 },
            { elementId: 'e3', startTime: 10 },
          ],
        },
      });

      expect(result.tracks[0].elements).toHaveLength(2);
      expect(result.tracks[0].elements[0].startTime).toBe(0); // 5 - 5
      expect(result.tracks[0].elements[1].startTime).toBe(5); // 10 - 5
    });
  });

  describe('element.update', () => {
    it('should update element fields', () => {
      const e1 = createTestMediaElement({ id: 'e1', name: 'Old' });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });

      const result = applyOperation(project, {
        type: 'element.update',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', updates: { name: 'New', startTime: 5 } },
        before: { updates: { name: 'Old', startTime: 0 } },
      });

      expect(result.tracks[0].elements[0].name).toBe('New');
      expect(result.tracks[0].elements[0].startTime).toBe(5);
    });

    it('should reset trim when duration makes trim invalid', () => {
      const e1 = createTestMediaElement({ id: 'e1', duration: 10, trimStart: 3, trimEnd: 3 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });

      const result = applyOperation(project, {
        type: 'element.update',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', updates: { duration: 5 } },
        before: { updates: { duration: 10 } },
      });

      expect(result.tracks[0].elements[0].duration).toBe(5);
      expect(result.tracks[0].elements[0].trimStart).toBe(0);
      expect(result.tracks[0].elements[0].trimEnd).toBe(0);
    });
  });

  describe('element.move', () => {
    it('should move element between tracks', () => {
      const e1 = createTestMediaElement({ id: 'e1' });
      const t1 = createTestTrack({ id: 't1', elements: [e1] });
      const t2 = createTestTrack({ id: 't2' });
      const project = createTestProject({ tracks: [t1, t2] });

      const result = applyOperation(project, {
        type: 'element.move',
        meta: createMeta(),
        payload: { fromTrackId: 't1', toTrackId: 't2', elementId: 'e1' },
        before: { fromIndex: 0 },
      });

      expect(result.tracks[0].elements).toHaveLength(0);
      expect(result.tracks[1].elements).toHaveLength(1);
      expect(result.tracks[1].elements[0].id).toBe('e1');
    });
  });

  describe('element.toggle', () => {
    it('should toggle hidden', () => {
      const e1 = createTestMediaElement({ id: 'e1', hidden: false });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });

      const result = applyOperation(project, {
        type: 'element.toggle',
        meta: createMeta(),
        payload: { trackId: 't1', elementId: 'e1', field: 'hidden' },
        before: { value: false },
      });

      expect(result.tracks[0].elements[0].hidden).toBe(true);
    });
  });

  describe('element.linkAudio', () => {
    it('should link audio element to video element', () => {
      const { project, videoElement } = createPopulatedProject();
      const newAudioElem = createTestAudioElement({ id: 'a2', linkedVideoId: 'v1' });

      const result = applyOperation(project, {
        type: 'element.linkAudio',
        meta: createMeta(),
        payload: {
          videoTrackId: 'vt1',
          videoElementId: 'v1',
          audioTrackId: 'at1',
          audioElement: newAudioElem,
        },
      });

      expect(result.tracks[1].elements).toHaveLength(2);
      expect((result.tracks[0].elements[0] as any).linkedAudioId).toBe('a2');
    });

    it('should create new audio track if needed', () => {
      const videoElement = createTestMediaElement({ id: 'v1' });
      const videoTrack = createTestTrack({ id: 'vt1', elements: [videoElement] });
      const project = createTestProject({ tracks: [videoTrack] });

      const newAudioTrack = createTestTrack({ id: 'at-new', type: 'audio' });
      const newAudioElem = createTestAudioElement({ id: 'a-new' });

      const result = applyOperation(project, {
        type: 'element.linkAudio',
        meta: createMeta(),
        payload: {
          videoTrackId: 'vt1',
          videoElementId: 'v1',
          audioTrackId: 'at-new',
          audioElement: newAudioElem,
          audioTrack: newAudioTrack,
        },
      });

      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[1].id).toBe('at-new');
      expect(result.tracks[1].elements[0].id).toBe('a-new');
    });
  });

  describe('element.unlinkAudio', () => {
    it('should unlink audio from video', () => {
      const videoElement = createTestMediaElement({ id: 'v1', linkedAudioId: 'a1' });
      const audioElement = createTestAudioElement({ id: 'a1', linkedVideoId: 'v1' });
      const videoTrack = createTestTrack({ id: 'vt1', elements: [videoElement] });
      const audioTrack = createTestTrack({ id: 'at1', type: 'audio', elements: [audioElement] });
      const project = createTestProject({ tracks: [videoTrack, audioTrack] });

      const result = applyOperation(project, {
        type: 'element.unlinkAudio',
        meta: createMeta(),
        payload: { videoTrackId: 'vt1', videoElementId: 'v1' },
        before: {
          linkedAudioId: 'a1',
          audioTrackId: 'at1',
          audioElement,
        },
      });

      expect((result.tracks[0].elements[0] as any).linkedAudioId).toBeUndefined();
      expect(result.tracks[1].elements).toHaveLength(0);
    });
  });

  describe('element.splitAt', () => {
    it('should split element at point', () => {
      const e1 = createTestMediaElement({ id: 'e1', duration: 10, trimEnd: 0 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });

      const rightElement = createTestMediaElement({
        id: 'e1-right',
        startTime: 5,
        trimStart: 5,
        trimEnd: 0,
        duration: 10,
      });

      const result = applyOperation(project, {
        type: 'element.splitAt',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          splitPoint: 5,
          rightElement,
        },
        before: { trimEnd: 0 },
      });

      expect(result.tracks[0].elements).toHaveLength(2);
      expect(result.tracks[0].elements[0].trimEnd).toBe(5); // duration - splitPoint
      expect(result.tracks[0].elements[1].id).toBe('e1-right');
    });
  });

  describe('element.splitKeepLeft', () => {
    it('should keep left part only', () => {
      const e1 = createTestMediaElement({ id: 'e1', name: 'Original', duration: 10, trimEnd: 0 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });

      const result = applyOperation(project, {
        type: 'element.splitKeepLeft',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          splitPoint: 5,
          newName: 'Original (left)',
        },
        before: { trimEnd: 0, name: 'Original' },
      });

      expect(result.tracks[0].elements).toHaveLength(1);
      expect(result.tracks[0].elements[0].trimEnd).toBe(5);
      expect(result.tracks[0].elements[0].name).toBe('Original (left)');
    });
  });

  describe('element.splitKeepRight', () => {
    it('should keep right part only', () => {
      const e1 = createTestMediaElement({ id: 'e1', name: 'Original', startTime: 0, trimStart: 0 });
      const track = createTestTrack({ id: 't1', elements: [e1] });
      const project = createTestProject({ tracks: [track] });

      const result = applyOperation(project, {
        type: 'element.splitKeepRight',
        meta: createMeta(),
        payload: {
          trackId: 't1',
          elementId: 'e1',
          splitPoint: 5,
          newStartTime: 5,
          newName: 'Original (right)',
        },
        before: { startTime: 0, trimStart: 0, name: 'Original' },
      });

      expect(result.tracks[0].elements[0].startTime).toBe(5);
      expect(result.tracks[0].elements[0].trimStart).toBe(5);
      expect(result.tracks[0].elements[0].name).toBe('Original (right)');
    });
  });
});
