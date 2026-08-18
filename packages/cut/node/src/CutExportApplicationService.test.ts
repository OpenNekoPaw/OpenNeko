import { describe, expect, it, vi } from 'vitest';

import type { CutProjectSnapshot } from '@neko/cut-domain';
import { CutExportApplicationService } from './CutExportApplicationService';

describe('CutExportApplicationService', () => {
  it('queries the exact document and freezes the returned timeline session', async () => {
    const snapshot = projectSnapshot('cuts/story.otio', 'session:query');
    const query = vi.fn(async () => snapshot);
    const start = vi.fn(async (input) => ({
      jobId: 'job:one',
      documentUri: input.documentUri,
      sessionId: input.sessionId,
      sourceSnapshotId: input.sourceSnapshotId,
      settings: input.settings,
      outputWorkspaceRelativePath: input.outputWorkspaceRelativePath,
      status: 'running' as const,
      startedAt: 1,
    }));
    const service = new CutExportApplicationService({
      authoring: { query },
      registry: { start, describe: vi.fn(), cancel: vi.fn() },
    });

    await service.submit({
      documentPath: 'cuts/story.otio',
      sessionId: 'session:requested',
      outputWorkspaceRelativePath: 'exports/story.mp4',
      settings: exportSettings(),
    });

    expect(query).toHaveBeenCalledWith({ documentPath: 'cuts/story.otio' });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        documentUri: 'cuts/story.otio',
        sessionId: 'session:requested',
        sourceSnapshotId: 'sha256:fingerprint',
        timeline: expect.objectContaining({ sessionId: 'session:requested' }),
      }),
    );
  });

  it('forwards describe and cancel using the exact document/job pair', async () => {
    const describe = vi.fn(async () => task('job:describe'));
    const cancel = vi.fn(async () => task('job:cancel'));
    const service = new CutExportApplicationService({
      authoring: { query: vi.fn() },
      registry: { start: vi.fn(), describe, cancel },
    });

    await service.describe({ documentPath: 'cuts/story.otio', jobId: 'job:describe' });
    await service.cancel({ documentPath: 'cuts/story.otio', jobId: 'job:cancel' });

    expect(describe).toHaveBeenCalledWith('cuts/story.otio', 'job:describe');
    expect(cancel).toHaveBeenCalledWith('cuts/story.otio', 'job:cancel');
  });

  it('fails visibly when the authoring owner returns a different document identity', async () => {
    const start = vi.fn();
    const service = new CutExportApplicationService({
      authoring: { query: vi.fn(async () => projectSnapshot('cuts/other.otio', 'session:query')) },
      registry: { start, describe: vi.fn(), cancel: vi.fn() },
    });

    await expect(
      service.submit({
        documentPath: 'cuts/story.otio',
        sessionId: 'session:requested',
        outputWorkspaceRelativePath: 'exports/story.mp4',
        settings: exportSettings(),
      }),
    ).rejects.toThrow(/different document identity/);
    expect(start).not.toHaveBeenCalled();
  });
});

function projectSnapshot(documentPath: string, _sessionId: string): CutProjectSnapshot {
  return {
    documentPath,
    fingerprint: { strategy: 'sha256', value: 'fingerprint' },
    timeline: {
      documentUri: documentPath,
      name: 'Story',
      durationSeconds: 1,
      tracks: [],
    },
  };
}

function task(jobId: string) {
  return {
    jobId,
    documentUri: 'cuts/story.otio',
    sessionId: 'session:requested',
    sourceSnapshotId: 'sha256:fingerprint',
    settings: exportSettings(),
    outputWorkspaceRelativePath: 'exports/story.mp4',
    status: 'running' as const,
    startedAt: 1,
  };
}

function exportSettings() {
  return {
    outputName: 'story',
    container: 'mp4' as const,
    width: 1920,
    height: 1080,
    framesPerSecond: 30,
    videoBitrate: 8_000_000,
    includeAudio: false,
    audioBitrate: 192_000,
    audioSampleRate: 48_000 as const,
  };
}
