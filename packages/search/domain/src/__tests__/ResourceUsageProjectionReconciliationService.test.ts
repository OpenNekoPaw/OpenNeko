import { describe, expect, it, vi } from 'vitest';
import {
  ResourceUsageProjectionReconciliationService,
  type ResourceUsageProjectionRecord,
  type ResourceUsageProjectionSource,
} from '..';

const source: ResourceUsageProjectionSource = {
  ownerId: 'project',
  sourceId: 'project-composition',
};

const record: ResourceUsageProjectionRecord = {
  projectionId: 'project:entity-rin',
  source,
  target: { ownerId: 'project-entity', resourceId: 'entity-rin' },
  occurrences: [{ occurrenceId: 'association-rin', location: 'project-composition' }],
  usageCount: 1,
  dependencies: [{ targetOwnerId: 'character-project', count: 1 }],
  availability: 'available',
  freshness: 'fresh',
  sourceFingerprint: 'sha256:composition',
  updatedAt: '2026-08-13T08:00:00.000Z',
};

describe('ResourceUsageProjectionReconciliationService', () => {
  it('atomically replaces one complete bounded owner source', async () => {
    const replaceSource = vi.fn().mockResolvedValue(undefined);
    const service = new ResourceUsageProjectionReconciliationService({
      partition: {
        scope: 'workspace',
        workspaceId: 'workspace-1',
        domain: 'resource-usage-projection',
      },
      repository: { replaceSource },
      maximumRecordsPerSource: 10,
      now: () => '2026-08-13T09:00:00.000Z',
    });

    await expect(
      service.reconcile({
        source,
        read: async () => ({ source, complete: true, records: [record] }),
      }),
    ).resolves.toBe(1);
    expect(replaceSource).toHaveBeenCalledWith({
      partition: {
        scope: 'workspace',
        workspaceId: 'workspace-1',
        domain: 'resource-usage-projection',
      },
      source,
      records: [record],
      updatedAt: '2026-08-13T09:00:00.000Z',
    });
  });

  it('does not replace an incomplete, foreign, or over-limit source', async () => {
    const replaceSource = vi.fn().mockResolvedValue(undefined);
    const service = new ResourceUsageProjectionReconciliationService({
      partition: {
        scope: 'workspace',
        workspaceId: 'workspace-1',
        domain: 'resource-usage-projection',
      },
      repository: { replaceSource },
      maximumRecordsPerSource: 1,
    });

    await expect(
      service.reconcile({
        source,
        read: async () => ({ source, complete: false, records: [] }),
      }),
    ).rejects.toThrow('complete source snapshot');
    await expect(
      service.reconcile({
        source,
        read: async () => ({
          source: { ownerId: 'document', sourceId: source.sourceId },
          complete: true,
          records: [],
        }),
      }),
    ).rejects.toThrow('foreign owner-qualified source');
    await expect(
      service.reconcile({
        source,
        read: async () => ({
          source,
          complete: true,
          records: [record, { ...record, projectionId: 'second' }],
        }),
      }),
    ).rejects.toThrow('record reconciliation limit');
    expect(replaceSource).not.toHaveBeenCalled();
  });
});
