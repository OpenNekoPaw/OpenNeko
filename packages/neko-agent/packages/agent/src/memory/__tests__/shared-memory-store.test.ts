/**
 * SharedMemoryStore tests
 *
 * Covers:
 * - append / get within a scope
 * - getScope flattens across topics in write order
 * - bounded history (maxPerKey)
 * - watch emits on append, stops on unsubscribe
 * - clearScope removes only that scope's entries
 * - snapshot / restore round-trips preserve order
 */

import { describe, it, expect, vi } from 'vitest';
import { createSharedMemoryStore } from '../shared-memory-store';

describe('SharedMemoryStore', () => {
  it('append + get returns entries for the scope/topic pair', () => {
    const store = createSharedMemoryStore({ now: () => 42 });
    const e = store.append('execution', 'consistency', { score: 0.8 });
    expect(e.value).toEqual({ score: 0.8 });
    expect(e.at).toBe(42);

    const entries = store.get<{ score: number }>('execution', 'consistency');
    expect(entries).toHaveLength(1);
    expect(entries[0].value.score).toBe(0.8);
  });

  it('scopes are isolated', () => {
    const store = createSharedMemoryStore();
    store.append('creation', 'milestone', 'draft');
    store.append('execution', 'milestone', 'render');
    expect(store.get('creation', 'milestone')).toHaveLength(1);
    expect(store.get('execution', 'milestone')).toHaveLength(1);
    // Cross-scope query empty when topic not present in that scope.
    expect(store.get('shared', 'milestone')).toHaveLength(0);
  });

  it('getScope flattens topics and keeps write order', () => {
    const store = createSharedMemoryStore();
    store.append('creation', 'a', 1);
    store.append('creation', 'b', 2);
    store.append('creation', 'a', 3);
    store.append('execution', 'a', 99);

    const creation = store.getScope<number>('creation');
    expect(creation.map((e) => e.value)).toEqual([1, 2, 3]);
  });

  it('bounded history drops oldest entries when maxPerKey is exceeded', () => {
    const store = createSharedMemoryStore({ maxPerKey: 2 });
    store.append('creation', 'x', 1);
    store.append('creation', 'x', 2);
    store.append('creation', 'x', 3);
    const entries = store.get<number>('creation', 'x');
    expect(entries.map((e) => e.value)).toEqual([2, 3]);
  });

  it('watch fires listeners on append and stops on unsubscribe', () => {
    const store = createSharedMemoryStore();
    const listener = vi.fn();
    const off = store.watch('creation', 'x', listener);
    store.append('creation', 'x', 'a');
    store.append('creation', 'y', 'other'); // different topic — not notified
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    store.append('creation', 'x', 'b');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('watch listener exceptions do not block appends', () => {
    const store = createSharedMemoryStore();
    store.watch('creation', 'x', () => {
      throw new Error('bad listener');
    });
    expect(() => store.append('creation', 'x', 1)).not.toThrow();
    expect(store.get('creation', 'x')).toHaveLength(1);
  });

  it('clearScope wipes only that scope', () => {
    const store = createSharedMemoryStore();
    store.append('creation', 'a', 1);
    store.append('execution', 'a', 2);
    store.clearScope('creation');
    expect(store.get('creation', 'a')).toHaveLength(0);
    expect(store.get('execution', 'a')).toHaveLength(1);
  });

  it('snapshot + restore round-trips entries in seq order', () => {
    const store = createSharedMemoryStore();
    store.append('creation', 'a', 1, 'tag1');
    store.append('execution', 'b', 2);
    store.append('creation', 'a', 3);

    const snap = store.snapshot();
    const other = createSharedMemoryStore();
    other.restore(snap);

    expect(other.get<number>('creation', 'a').map((e) => e.value)).toEqual([1, 3]);
    expect(other.get<number>('execution', 'b').map((e) => e.value)).toEqual([2]);
    // New appends continue monotonic seq.
    const next = other.append('creation', 'a', 99);
    expect(next.seq).toBeGreaterThan(snap[snap.length - 1].seq);
  });
});
