import { describe, expect, it } from 'vitest';

import { EXPORT_JOB_KIND, type ExportJobSnapshot } from './contracts';
import { createInMemoryExportJobStore } from './store';

describe('Export Job observation', () => {
  it('ends a pending observation immediately when its iterator is returned', async () => {
    const store = createInMemoryExportJobStore();
    const snapshot = exportSnapshot();
    await store.create(snapshot);
    const iterator = store.observe(snapshot.ref)[Symbol.asyncIterator]();
    const pending = iterator.next();

    await expect(iterator.return?.()).resolves.toEqual({ done: true, value: undefined });
    await expect(pending).resolves.toEqual({ done: true, value: undefined });

    await store.save({ ...snapshot, phase: 'running', updatedAt: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });
});

function exportSnapshot(): ExportJobSnapshot {
  return {
    ref: { kind: EXPORT_JOB_KIND, jobId: 'export-1' },
    phase: 'pending',
    createdAt: 1,
    updatedAt: 1,
    request: {
      documentUri: 'cuts/story.otio',
      config: {
        outputPath: 'exports/story.mp4',
        format: 'mp4',
        width: 1920,
        height: 1080,
        fps: 30,
        quality: 'medium',
        audioBitrate: 192_000,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioSampleRate: 48_000,
      },
      executionConfig: {
        executionKey: 'execution-1',
        sessionId: 'session-1',
        sourceSnapshotId: 'request-1',
      },
    },
    progress: {
      stage: 'queued',
      percent: 0,
      currentFrame: 0,
      totalFrames: 0,
      elapsedMs: 0,
      estimatedRemainingMs: 0,
      currentFps: 0,
    },
  };
}
