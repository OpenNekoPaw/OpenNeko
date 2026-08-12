import { describe, expect, it } from 'vitest';
import { isResourceUsageProjectionRecord } from '../resource-usage-projection';

const record = {
  projectionId: 'document:script:character-version:rin-published',
  source: { ownerId: 'document' as const, sourceId: 'scripts/episode-01.md' },
  target: { ownerId: 'character-version' as const, resourceId: 'rin-published' },
  occurrences: [{ occurrenceId: 'line-42', location: 'scripts/episode-01.md#L42' }],
  usageCount: 2,
  recentlyUsedAt: '2026-08-13T08:00:00.000Z',
  dependencies: [{ targetOwnerId: 'asset' as const, count: 1 }],
  availability: 'available' as const,
  freshness: 'fresh' as const,
  sourceFingerprint: 'sha256:source',
  updatedAt: '2026-08-13T08:00:00.000Z',
};

describe('ResourceUsageProjectionRecord', () => {
  it('accepts owner-qualified usage without authoritative domain payload', () => {
    expect(isResourceUsageProjectionRecord(record)).toBe(true);
    expect(record).not.toHaveProperty('entity');
    expect(record).not.toHaveProperty('character');
    expect(record).not.toHaveProperty('asset');
  });

  it('rejects duplicate occurrence identities and counts below known occurrences', () => {
    expect(
      isResourceUsageProjectionRecord({
        ...record,
        occurrences: [record.occurrences[0], record.occurrences[0]],
      }),
    ).toBe(false);
    expect(isResourceUsageProjectionRecord({ ...record, usageCount: 0 })).toBe(false);
  });

  it('rejects copied authoritative payload and unknown owners', () => {
    expect(isResourceUsageProjectionRecord({ ...record, character: { name: 'Rin' } })).toBe(false);
    expect(
      isResourceUsageProjectionRecord({
        ...record,
        source: { ownerId: 'entity-registry', sourceId: 'retired-source' },
      }),
    ).toBe(false);
  });
});
