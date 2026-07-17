import { describe, expect, it } from 'vitest';
import type { ProjectSearchItem, ProjectSearchPartitionStatusSnapshot } from '@neko/shared';
import {
  aggregateProjectSearchFreshnessValues,
  aggregateProjectSearchItemsFreshness,
  aggregateProjectSearchPartitionStatus,
  dedupeCreativeEntityProjectSearchItems,
} from '../core/aggregation';
import { createProjectSearchItem } from '../testing/testAdapters';

describe('project search aggregation policy', () => {
  it('prefers unified entity projections when deduping same creative entity identity', () => {
    const legacy = {
      ...createProjectSearchItem({
        id: 'legacy:mentor',
        kind: 'creative-entity',
        label: '猫妈妈',
        partition: 'creative-entities',
        projectRoot: '/workspace',
      }),
      source: {
        partition: 'creative-entities',
        sourceId: 'legacy-story',
        sourceKind: 'character',
        metadata: { entityKind: 'character' },
      },
      canonicalName: '猫妈妈',
      metadata: { entityType: 'character' },
    } satisfies ProjectSearchItem;
    const unified = {
      ...legacy,
      id: 'entity:character:mentor',
      source: {
        partition: 'creative-entities',
        sourceId: 'neko-entity',
        sourceKind: 'registry',
        metadata: { entityKind: 'character' },
      },
      navigationData: { source: 'neko-entity' },
    } satisfies ProjectSearchItem;

    expect(dedupeCreativeEntityProjectSearchItems([legacy, unified])).toEqual([unified]);
  });

  it('keeps same-name entity candidates distinct', () => {
    const first = createProjectSearchItem({
      id: 'candidate:a',
      kind: 'entity-candidate',
      label: '小橘',
      partition: 'creative-entities',
    });
    const second = createProjectSearchItem({
      id: 'candidate:b',
      kind: 'entity-candidate',
      label: '小橘',
      partition: 'creative-entities',
    });

    expect(dedupeCreativeEntityProjectSearchItems([first, second]).map((item) => item.id)).toEqual([
      'candidate:a',
      'candidate:b',
    ]);
  });

  it('aggregates status, freshness, counts, and timestamps from provider snapshots', () => {
    const snapshots: readonly ProjectSearchPartitionStatusSnapshot[] = [
      {
        partition: 'creative-entities',
        status: 'ready',
        freshness: 'fresh',
        itemCount: 2,
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        partition: 'creative-entities',
        status: 'building',
        freshness: 'building',
        itemCount: 3,
        updatedAt: '2026-05-02T00:00:00.000Z',
      },
    ];

    expect(
      aggregateProjectSearchPartitionStatus(snapshots, {
        partition: 'creative-entities',
        provider: { providerId: 'combined' },
      }),
    ).toEqual({
      partition: 'creative-entities',
      status: 'building',
      freshness: 'building',
      itemCount: 5,
      updatedAt: '2026-05-02T00:00:00.000Z',
      provider: { providerId: 'combined' },
    });
  });

  it('aggregates item and value freshness deterministically', () => {
    expect(aggregateProjectSearchItemsFreshness([])).toBe('fresh');
    expect(
      aggregateProjectSearchItemsFreshness([
        createProjectSearchItem({
          id: 'fresh',
          kind: 'asset',
          label: 'fresh',
          partition: 'asset-library',
          freshness: 'fresh',
        }),
        createProjectSearchItem({
          id: 'stale',
          kind: 'asset',
          label: 'stale',
          partition: 'asset-library',
          freshness: 'stale',
        }),
      ]),
    ).toBe('stale');
    expect(aggregateProjectSearchFreshnessValues(['fresh', 'failed'])).toBe('partial');
  });
});
