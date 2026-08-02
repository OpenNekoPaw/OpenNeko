import { describe, expect, it } from 'vitest';
import { createStorageMaintenanceReport } from '../maintenance-report';

describe('Storage maintenance report', () => {
  it('counts every cleanup and migration outcome without collapsing user action into skipped', () => {
    const report = createStorageMaintenanceReport({
      operation: 'migration',
      startedAt: '2026-07-13T10:00:00.000Z',
      completedAt: '2026-07-13T10:00:01.000Z',
      entries: [
        { outcome: 'deleted', subject: 'cache:a', sourcePath: '/workspace/.neko/.cache/a' },
        {
          outcome: 'migrated',
          subject: 'legacy:index',
          sourcePath: '/home/.neko/index.json',
          targetPath: '/home/.neko/neko.db',
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
          subject: 'legacy:truncated',
          sourcePath: '/home/.neko/index.json.corrupt',
          reason: 'malformed-json',
        },
        {
          outcome: 'user-action-required',
          subject: 'recording:unknown-retention',
          sourcePath: '/workspace/.neko/recordings/take.webm',
          reason: 'retention-decision-required',
        },
      ],
    });

    expect(report.counts).toEqual({
      deleted: 1,
      migrated: 1,
      rebuilt: 1,
      promoted: 1,
      skipped: 1,
      quarantined: 1,
      'user-action-required': 1,
    });
    expect(report.entries).toHaveLength(7);
  });
});
