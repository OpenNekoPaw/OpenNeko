import { describe, expect, it } from 'vitest';
import type { LocalMetadataPartitionRevision, LocalMetadataStore } from '..';
import { createLocalMetadataRevisionCursor } from '../revision-cursor';

describe('LocalMetadataRevisionCursor', () => {
  it('reports only domain revisions committed after its baseline', async () => {
    const revisions = new Map<string, LocalMetadataPartitionRevision>();
    const store = {
      readPartitionRevision: async (partition) => revisions.get(partition.domain) ?? null,
    } as Pick<LocalMetadataStore, 'readPartitionRevision'>;
    const cursor = createLocalMetadataRevisionCursor({
      store,
      workspaceId: '9b2de3b5-5f50-4be4-9551-71fb5b512489',
      domains: ['conversations', 'tasks'],
    });

    await cursor.initialize();
    await expect(cursor.poll()).resolves.toEqual({ changedDomains: [], revisions: {} });

    revisions.set('conversations', revision('conversations', 1));
    await expect(cursor.poll()).resolves.toEqual({
      changedDomains: ['conversations'],
      revisions: { conversations: 1 },
    });
    await expect(cursor.poll()).resolves.toEqual({ changedDomains: [], revisions: {} });

    revisions.set('tasks', revision('tasks', 3));
    await expect(cursor.poll()).resolves.toEqual({
      changedDomains: ['tasks'],
      revisions: { tasks: 3 },
    });
  });
});

function revision(domain: string, value: number): LocalMetadataPartitionRevision {
  return {
    partition: {
      scope: 'workspace',
      workspaceId: '9b2de3b5-5f50-4be4-9551-71fb5b512489',
      domain,
    },
    revision: value,
    freshness: 'fresh',
    diagnostic: null,
    updatedAt: '2026-07-13T00:00:00.000Z',
  };
}
