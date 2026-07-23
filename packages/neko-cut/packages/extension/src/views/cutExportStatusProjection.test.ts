import { describe, expect, it } from 'vitest';
import type { CutExportTaskSnapshot } from '@neko-cut/domain';
import { projectCutExportStatus } from './cutExportStatusProjection';

function task(overrides: Partial<CutExportTaskSnapshot> = {}): CutExportTaskSnapshot {
  return {
    jobId: 'job-1',
    documentUri: 'file:///workspace/cuts/scene.otio',
    sessionId: 'session-1',
    sourceRevision: 3,
    outputWorkspaceRelativePath: 'exports/scene.mp4',
    status: 'running',
    startedAt: 100,
    ...overrides,
  };
}

describe('projectCutExportStatus', () => {
  it('hides before the Host owns an export task', () => {
    expect(projectCutExportStatus([])).toEqual({
      visible: false,
      text: '',
      tooltip: '',
      tone: 'neutral',
    });
  });

  it('prefers running work and retains its explicit document identity', () => {
    const projection = projectCutExportStatus([
      task({ jobId: 'done', status: 'completed', finishedAt: 300 }),
      task({
        jobId: 'running',
        documentUri: 'file:///workspace/cuts/other.otio',
        outputWorkspaceRelativePath: 'exports/other.mp4',
        startedAt: 200,
      }),
    ]);

    expect(projection.text).toBe('$(sync~spin) Cut: other.mp4');
    expect(projection.tone).toBe('warning');
    expect(projection.documentUri).toBe('file:///workspace/cuts/other.otio');
  });

  it('projects the newest terminal failure with its diagnostic', () => {
    const projection = projectCutExportStatus([
      task({ jobId: 'done', status: 'completed', finishedAt: 300 }),
      task({ jobId: 'failed', status: 'failed', finishedAt: 400, error: 'codec unavailable' }),
    ]);

    expect(projection.text).toBe('$(error) Cut export failed');
    expect(projection.tooltip).toContain('codec unavailable');
    expect(projection.tone).toBe('error');
  });
});
