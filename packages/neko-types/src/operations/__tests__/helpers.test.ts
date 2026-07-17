// =============================================================================
// Helpers 测试 — ProjectData 不可变更新辅助函数
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  findTrack,
  findElement,
  findShape,
  updateTrackInProject,
  updateElementInProject,
  updateShapeInProject,
  pickKeys,
  arrayMove,
} from '../helpers';
import { OperationError } from '../errors';
import {
  createTestProject,
  createTestTrack,
  createTestMediaElement,
  createTestShapeInstance,
  createWebviewElement,
} from './test-helpers';
import type { WebviewElement } from '../webview-types';

describe('findTrack', () => {
  it('should find track by id', () => {
    const t1 = createTestTrack({ id: 't1', name: 'First' });
    const t2 = createTestTrack({ id: 't2', name: 'Second' });
    const project = createTestProject({ tracks: [t1, t2] });

    const result = findTrack(project, 't2');
    expect(result.track.id).toBe('t2');
    expect(result.index).toBe(1);
  });

  it('should throw OperationError when track not found', () => {
    const project = createTestProject({ tracks: [] });

    expect(() => findTrack(project, 'nonexistent')).toThrow(OperationError);
  });
});

describe('findElement', () => {
  it('should find element by id', () => {
    const e1 = createTestMediaElement({ id: 'e1' });
    const e2 = createTestMediaElement({ id: 'e2' });
    const track = createTestTrack({ id: 't1', elements: [e1, e2] });

    const result = findElement(track, 'e2');
    expect(result.element.id).toBe('e2');
    expect(result.index).toBe(1);
  });

  it('should throw OperationError when element not found', () => {
    const track = createTestTrack({ id: 't1', elements: [] });

    expect(() => findElement(track, 'nonexistent')).toThrow(OperationError);
  });
});

describe('findShape', () => {
  it('should find shape by id', () => {
    const s1 = createTestShapeInstance({ id: 's1' });
    const s2 = createTestShapeInstance({ id: 's2' });

    const result = findShape([s1, s2], 's2');
    expect(result.shape.id).toBe('s2');
    expect(result.index).toBe(1);
  });

  it('should throw OperationError when shape not found', () => {
    expect(() => findShape([], 'nonexistent')).toThrow(OperationError);
  });
});

describe('updateTrackInProject', () => {
  it('should return new ProjectData with updated track', () => {
    const t1 = createTestTrack({ id: 't1', name: 'Old' });
    const project = createTestProject({ tracks: [t1] });

    const result = updateTrackInProject(project, 't1', (track) => ({
      ...track,
      name: 'New',
    }));

    expect(result.tracks[0]!.name).toBe('New');
    // Immutability: original unchanged
    expect(project.tracks[0]!.name).toBe('Old');
    expect(result).not.toBe(project);
  });

  it('should not mutate other tracks', () => {
    const t1 = createTestTrack({ id: 't1', name: 'Track 1' });
    const t2 = createTestTrack({ id: 't2', name: 'Track 2' });
    const project = createTestProject({ tracks: [t1, t2] });

    const result = updateTrackInProject(project, 't1', (track) => ({
      ...track,
      name: 'Updated',
    }));

    expect(result.tracks[1]).toBe(t2); // same reference
  });
});

describe('updateElementInProject', () => {
  it('should return new ProjectData with updated element', () => {
    const e1 = createTestMediaElement({ id: 'e1', name: 'Old' });
    const track = createTestTrack({ id: 't1', elements: [e1] });
    const project = createTestProject({ tracks: [track] });

    const result = updateElementInProject(project, 't1', 'e1', (elem) => ({
      ...elem,
      name: 'New',
    }));

    expect(result.tracks[0]!.elements[0]!.name).toBe('New');
    expect(project.tracks[0]!.elements[0]!.name).toBe('Old');
  });

  it('should throw when track not found', () => {
    const project = createTestProject({ tracks: [] });

    expect(() => updateElementInProject(project, 'bad-track', 'e1', (e) => e)).toThrow(
      OperationError,
    );
  });

  it('should throw when element not found', () => {
    const track = createTestTrack({ id: 't1', elements: [] });
    const project = createTestProject({ tracks: [track] });

    expect(() => updateElementInProject(project, 't1', 'bad-elem', (e) => e)).toThrow(
      OperationError,
    );
  });
});

describe('updateShapeInProject', () => {
  it('should return new ProjectData with updated shape', () => {
    const s1 = createTestShapeInstance({ id: 's1', name: 'Old Shape' });
    const elem = createWebviewElement(createTestMediaElement({ id: 'e1' }), { shapes: [s1] });
    const track = createTestTrack({ id: 't1', elements: [elem] });
    const project = createTestProject({ tracks: [track] });

    const result = updateShapeInProject(project, 't1', 'e1', 's1', (shape) => ({
      ...shape,
      name: 'New Shape',
    }));

    const updatedShapes = (result.tracks[0]!.elements[0]! as WebviewElement).shapes;
    expect(updatedShapes[0].name).toBe('New Shape');
  });

  it('should handle element without shapes array', () => {
    const elem = createTestMediaElement({ id: 'e1' });
    const track = createTestTrack({ id: 't1', elements: [elem] });
    const project = createTestProject({ tracks: [track] });

    // No shapes array → findShape throws
    expect(() => updateShapeInProject(project, 't1', 'e1', 's1', (s) => s)).toThrow(OperationError);
  });
});

describe('pickKeys', () => {
  it('should pick matching keys from source', () => {
    const obj = { a: 1, b: 'hello', c: true, d: null };
    const updates = { a: 99, c: false };

    const result = pickKeys(obj, updates);
    expect(result).toEqual({ a: 1, c: true });
  });

  it('should return empty object when no keys match', () => {
    const obj = { a: 1 };
    const updates = { x: 2 } as Partial<typeof obj>;

    const result = pickKeys(obj, updates);
    expect(result).toEqual({});
  });

  it('should handle empty updates', () => {
    const obj = { a: 1, b: 2 };
    const result = pickKeys(obj, {});
    expect(result).toEqual({});
  });
});

describe('arrayMove', () => {
  it('should move element forward', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const result = arrayMove(arr, 0, 2);
    expect(result).toEqual(['b', 'c', 'a', 'd']);
  });

  it('should move element backward', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const result = arrayMove(arr, 3, 1);
    expect(result).toEqual(['a', 'd', 'b', 'c']);
  });

  it('should not mutate original array', () => {
    const arr = ['a', 'b', 'c'];
    const result = arrayMove(arr, 0, 2);
    expect(arr).toEqual(['a', 'b', 'c']);
    expect(result).not.toBe(arr);
  });

  it('should handle same index (no-op)', () => {
    const arr = ['a', 'b', 'c'];
    const result = arrayMove(arr, 1, 1);
    expect(result).toEqual(['a', 'b', 'c']);
  });
});
