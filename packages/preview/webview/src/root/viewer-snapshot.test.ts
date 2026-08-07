import { describe, expect, it } from 'vitest';
import { createPreviewViewerSnapshotStore } from './viewer-snapshot';

describe('Preview viewer snapshot store', () => {
  it('isolates recoverable snapshots by exact descriptor identity', () => {
    const store = createPreviewViewerSnapshotStore();
    store.update('preview:a', {
      media: { currentTime: 12, playbackRate: 1.5, volume: 0.6 },
    });
    store.update('preview:b', { modelState: { camera: 'front' } });
    store.update('preview:c', { documentState: { currentPage: 9, viewMode: 'single' } });

    expect(store.read('preview:a')?.media?.currentTime).toBe(12);
    expect(store.read('preview:b')?.modelState).toEqual({ camera: 'front' });
    expect(store.read('preview:c')?.documentState).toEqual({
      currentPage: 9,
      viewMode: 'single',
    });
    store.delete('preview:a');
    expect(store.read('preview:a')).toBeUndefined();
    expect(store.read('preview:b')).toBeDefined();
  });

  it('clears the complete owner snapshot set on parent disposal', () => {
    const store = createPreviewViewerSnapshotStore();
    store.update('preview:a', { modelState: { camera: 'front' } });
    store.update('preview:b', { media: { currentTime: 2, playbackRate: 1, volume: 1 } });

    store.clear();

    expect(store.read('preview:a')).toBeUndefined();
    expect(store.read('preview:b')).toBeUndefined();
  });
});
