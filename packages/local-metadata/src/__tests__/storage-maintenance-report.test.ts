import { describe, expect, it } from 'vitest';
import { createStorageMaintenanceReport } from '../maintenance-report';

describe('Storage maintenance report', () => {
  it('counts every cleanup outcome without collapsing user action into skipped', () => {
    const report = createStorageMaintenanceReport({
      operation: 'cleanup',
      startedAt: '2026-07-13T10:00:00.000Z',
      completedAt: '2026-07-13T10:00:01.000Z',
      entries: [
        {
          outcome: 'deleted',
          subject: 'cache:a',
          sourcePath: '/home/.neko/workspace-cache/workspace-a/resources/a',
        },
        { outcome: 'rebuilt', subject: 'catalog:conversation' },
        {
          outcome: 'promoted',
          subject: 'recording:take-1',
          targetPath: '/workspace/media/take-1.webm',
        },
        { outcome: 'skipped', subject: 'cache:pinned', reason: 'pinned' },
        {
          outcome: 'quarantined',
          subject: 'cache:truncated',
          sourcePath: '/home/.neko/workspace-cache/workspace-a/index.json.corrupt',
          reason: 'malformed-json',
        },
        {
          outcome: 'user-action-required',
          subject: 'recording:unknown-retention',
          sourcePath: '/workspace/media/take.webm',
          reason: 'retention-decision-required',
        },
      ],
    });

    expect(report.counts).toEqual({
      deleted: 1,
      rebuilt: 1,
      promoted: 1,
      skipped: 1,
      quarantined: 1,
      'user-action-required': 1,
    });
    expect(report.entries).toHaveLength(6);
  });
});
