import { describe, expect, it } from 'vitest';
import {
  parseWorldManagementCatalogProjection,
  parseWorldManagementDetailProjection,
} from '../world-management';

describe('World management contracts', () => {
  it('parses strict catalog and detail projections without mutable World facts', () => {
    const catalog = parseWorldManagementCatalogProjection({
      scope: { kind: 'global-catalog' },
      query: { search: '', sort: 'recently-updated' },
      items: [
        {
          status: 'available',
          globalWorldId: 'global-world-1',
          title: 'Rain Station',
          summary: 'A station suspended above a flooded city.',
          currentWorldVersionId: 'world-version-1',
          updatedAt: '2026-08-14T00:00:00.000Z',
          versionCount: 1,
          runtimeCount: 2,
          runtimeEligible: true,
          attentionCount: 0,
        },
      ],
      diagnostics: [],
    });
    expect(catalog.items[0]).not.toHaveProperty('draft');
    expect(catalog.items[0]).not.toHaveProperty('events');

    const detail = parseWorldManagementDetailProjection({
      globalWorldId: 'global-world-1',
      title: 'Rain Station',
      summary: 'A station suspended above a flooded city.',
      currentWorldVersionId: 'world-version-1',
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      versions: [
        {
          worldVersionId: 'world-version-1',
          worldProjectId: 'global-world-1',
          label: 'v1',
          publishedAt: '2026-08-14T00:00:00.000Z',
          runtimeCount: 2,
          current: true,
        },
      ],
      recentRuntimes: [],
      diagnostics: [],
    });
    expect(detail).not.toHaveProperty('definition');
    expect(detail).not.toHaveProperty('worldState');
  });

  it('rejects duplicate identities and unsupported fields', () => {
    const invalidItem = {
      status: 'invalid',
      globalWorldId: 'broken-world',
      message: 'Invalid GlobalWorld.',
    } as const;
    expect(() =>
      parseWorldManagementCatalogProjection({
        scope: { kind: 'global-catalog' },
        query: { search: '', sort: 'recently-updated' },
        items: [invalidItem, invalidItem],
        diagnostics: [],
      }),
    ).toThrow('duplicate identity');
    expect(() =>
      parseWorldManagementCatalogProjection({
        scope: { kind: 'global-catalog' },
        query: { search: '', sort: 'recently-updated', latest: true },
        items: [],
        diagnostics: [],
      }),
    ).toThrow('unsupported fields');
  });
});
