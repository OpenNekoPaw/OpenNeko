import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ITempFileService } from '../../contracts/ITempFileService';

import { MediaDiffRequestState } from './MediaDiffRequestState';

describe('MediaDiffRequestState', () => {
  let tempFileService: ITempFileService;

  beforeEach(() => {
    vi.clearAllMocks();
    tempFileService = {
      createTempPath: vi.fn(),
      writeTempFile: vi.fn(),
      deleteTempFile: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should abort the previous analysis when a new one begins', () => {
    const state = new MediaDiffRequestState(tempFileService);
    const first = state.beginAnalysis();
    const second = state.beginAnalysis();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(state.currentAbortController).toBe(second);
  });

  it('should track extracted temp files by ref and clean stale ones', async () => {
    const state = new MediaDiffRequestState(tempFileService);

    await state.setPreviousFilePath('/tmp/prev-head.mp4', 'HEAD');
    expect(state.hasPreviousFileForRef('HEAD')).toBe(true);
    expect(state.hasPreviousFileForRef('abc123')).toBe(false);

    await state.setPreviousFilePath('/tmp/prev-commit.mp4', 'abc123');
    expect(tempFileService.deleteTempFile).toHaveBeenCalledWith('/tmp/prev-head.mp4');
    expect(state.previousFilePath).toBe('/tmp/prev-commit.mp4');
    expect(state.previousFileRef).toBe('abc123');
  });

  it('should clear fetch promise only when the current promise matches', () => {
    const state = new MediaDiffRequestState(tempFileService);
    const activeFetch = Promise.resolve();
    const staleFetch = Promise.resolve();

    state.fetchPromise = activeFetch;
    state.clearFetchPromise(staleFetch);
    expect(state.fetchPromise).toBe(activeFetch);

    state.clearFetchPromise(activeFetch);
    expect(state.fetchPromise).toBeNull();
  });

  it('should await temp file cleanup during disposeAsync', async () => {
    let resolveDelete: (() => void) | undefined;
    tempFileService.deleteTempFile = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );

    const state = new MediaDiffRequestState(tempFileService);
    await state.setPreviousFilePath('/tmp/prev-head.mp4', 'HEAD');

    const disposePromise = state.disposeAsync();

    expect(tempFileService.deleteTempFile).toHaveBeenCalledWith('/tmp/prev-head.mp4');
    expect(state.previousFilePath).toBeNull();
    expect(state.previousFileRef).toBeNull();

    let settled = false;
    void disposePromise.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    resolveDelete?.();
    await disposePromise;

    expect(settled).toBe(true);
  });
});
