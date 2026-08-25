import { describe, expect, it } from 'vitest';
import {
  createWorldManagementCatalogRequest,
  createWorldManagementDetailRequest,
  parseWorldManagementHostRequest,
  parseWorldManagementHostResult,
} from '../world-management-host';

describe('World management host contract', () => {
  it('round-trips catalog and exact detail requests', () => {
    const catalogRequest = createWorldManagementCatalogRequest('request-catalog', {
      search: 'rain',
      sort: 'title',
    });
    expect(catalogRequest).toEqual({
      requestId: 'request-catalog',
      operation: 'catalog-get',
      query: { search: 'rain', sort: 'title' },
    });
    const detailRequest = createWorldManagementDetailRequest('request-detail', 'global-world-1');
    expect(detailRequest).toEqual({
      requestId: 'request-detail',
      operation: 'detail-get',
      globalWorldId: 'global-world-1',
    });
  });

  it('rejects mixed operations and mismatched responses', () => {
    expect(() =>
      parseWorldManagementHostRequest({
        requestId: 'request-1',
        operation: 'catalog-get',
        query: { search: '', sort: 'recently-updated' },
        worldProjectId: 'world-project-1',
      }),
    ).toThrow('unsupported fields: worldProjectId');
    const request = createWorldManagementDetailRequest('request-detail', 'global-world-1');
    expect(() =>
      parseWorldManagementHostResult(
        {
          requestId: 'request-detail',
          operation: 'detail-get',
          detail: {
            globalWorldId: 'another-world',
            title: 'Another',
            summary: '',
            currentWorldVersionId: 'world-version-another',
            createdAt: '2026-08-14T00:00:00.000Z',
            updatedAt: '2026-08-14T00:00:00.000Z',
            versions: [
              {
                worldProjectId: 'another-world',
                worldVersionId: 'world-version-another',
                label: 'v1',
                publishedAt: '2026-08-14T00:00:00.000Z',
                runtimeCount: 0,
                current: true,
              },
            ],
            recentRuntimes: [],
            diagnostics: [],
          },
        },
        request,
      ),
    ).toThrow('GlobalWorld identity mismatch');
  });
});
