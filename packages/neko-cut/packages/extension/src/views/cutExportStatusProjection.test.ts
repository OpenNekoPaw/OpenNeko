import { describe, expect, it } from 'vitest';
import type { CutExportTaskSnapshot } from '@neko-cut/domain';
import { projectCutExportStatus, type CutExportStatusMessages } from './cutExportStatusProjection';

const messages: CutExportStatusMessages = {
  runningText: (label) => `Cut: ${label}`,
  runningCount: (count) => `${count} exports`,
  exporting: (path) => `Exporting ${path}`,
  completedText: (name) => `Cut: ${name}`,
  completed: (path) => `Export completed: ${path}`,
  failedText: 'Cut export failed',
  failed: (path) => `Export failed: ${path}`,
  cancelledText: 'Cut export cancelled',
  cancelled: (path) => `Export cancelled: ${path}`,
};

function task(overrides: Partial<CutExportTaskSnapshot> = {}): CutExportTaskSnapshot {
  return {
    jobId: 'job-1',
    documentUri: 'file:///workspace/cuts/scene.otio',
    sessionId: 'session-1',
    sourceRevision: 3,
    settings: {
      outputName: 'Project',
      container: 'mp4',
      width: 1920,
      height: 1080,
      framesPerSecond: 30,
      videoBitrate: 8_000_000,
      includeAudio: true,
      audioBitrate: 192_000,
      audioSampleRate: 48_000,
    },
    outputWorkspaceRelativePath: 'exports/scene.mp4',
    status: 'running',
    startedAt: 100,
    ...overrides,
  };
}

describe('projectCutExportStatus', () => {
  it('hides before the Host owns an export task', () => {
    expect(projectCutExportStatus([], messages)).toEqual({
      visible: false,
      text: '',
      tooltip: '',
      tone: 'neutral',
    });
  });

  it('prefers running work and retains its explicit document identity', () => {
    const projection = projectCutExportStatus(
      [
        task({ jobId: 'done', status: 'completed', finishedAt: 300 }),
        task({
          jobId: 'running',
          documentUri: 'file:///workspace/cuts/other.otio',
          outputWorkspaceRelativePath: 'exports/other.mp4',
          startedAt: 200,
        }),
      ],
      messages,
    );

    expect(projection.text).toBe('$(sync~spin) Cut: other.mp4');
    expect(projection.tone).toBe('warning');
    expect(projection.documentUri).toBe('file:///workspace/cuts/other.otio');
  });

  it('projects the newest terminal failure with its diagnostic', () => {
    const projection = projectCutExportStatus(
      [
        task({ jobId: 'done', status: 'completed', finishedAt: 300 }),
        task({
          jobId: 'failed',
          status: 'failed',
          finishedAt: 400,
          diagnostic: { code: 'export-failed' },
        }),
      ],
      messages,
    );

    expect(projection.text).toBe('$(error) Cut export failed');
    expect(projection.tooltip).toBe('Export failed: exports/scene.mp4');
    expect(projection.tone).toBe('error');
  });
});
