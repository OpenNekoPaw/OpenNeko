import { describe, expect, it } from 'vitest';
import {
  createAssetCenterHostRequest,
  parseAssetCenterHostRequest,
  parseAssetCenterHostResult,
} from './host-contract';

const identity = {
  assetCenterSessionId: 'asset-center:window-1',
  windowId: 'window-1',
} as const;
const rendererSessionId = 'renderer-session-1';

describe('Asset Center Host contract', () => {
  it('owns catalog mutation and thumbnail routes behind the exact session identity', () => {
    expect(
      createAssetCenterHostRequest({
        requestId: 'request-1',
        rendererSessionId,
        identity,
        route: 'assets.remove',
        itemIds: ['global-asset-library:item-1'],
      }),
    ).toMatchObject({ route: 'assets.remove', identity });

    expect(
      createAssetCenterHostRequest({
        requestId: 'request-move',
        rendererSessionId,
        identity,
        route: 'items.move',
        itemIds: ['global-asset-library:item-1'],
      }),
    ).toMatchObject({ route: 'items.move', identity });

    const request = createAssetCenterHostRequest({
      requestId: 'request-2',
      rendererSessionId,
      identity,
      route: 'thumbnail.resolve',
      itemId: 'global-asset-library:item-1',
      variant: 'hover',
    });
    expect(
      parseAssetCenterHostResult(
        {
          requestId: 'request-2',
          route: 'thumbnail.resolve',
          thumbnail: {
            owner: 'global-asset-library',
            itemId: 'global-asset-library:item-1',
            descriptorId: 'thumbnail:item-1',
            sourceFingerprint: 'fingerprint-1',
            variant: 'hover',
            dataUrl: 'data:image/png;base64,AA==',
          },
        },
        request,
      ),
    ).toMatchObject({ route: 'thumbnail.resolve', thumbnail: { variant: 'hover' } });
  });

  it('distinguishes current detach from expected stale Renderer cleanup', () => {
    const request = createAssetCenterHostRequest({
      requestId: 'request-detach',
      rendererSessionId,
      identity,
      route: 'session.detach',
    });
    const projection = {
      identity,
      filter: {
        catalog: 'media-library' as const,
        query: '',
        sortBy: 'name' as const,
        sortDirection: 'ascending' as const,
        viewMode: 'list' as const,
      },
      catalog: { status: 'loading' as const },
      preview: { status: 'empty' as const },
    };

    expect(
      parseAssetCenterHostResult(
        { requestId: request.requestId, route: request.route, status: 'stale' },
        request,
      ),
    ).toEqual({ requestId: request.requestId, route: request.route, status: 'stale' });
    expect(
      parseAssetCenterHostResult(
        {
          requestId: request.requestId,
          route: request.route,
          status: 'detached',
          projection,
        },
        request,
      ),
    ).toMatchObject({ status: 'detached', projection: { identity } });
  });

  it('rejects unsupported request fields', () => {
    expect(() =>
      parseAssetCenterHostRequest({
        requestId: 'request-invalid',
        rendererSessionId,
        identity,
        route: 'selection.select',
        owner: 'global-asset-library',
        itemId: 'global-asset-library:item-1',
        unsupportedField: true,
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAssetCenterHostRequest({
        requestId: 'request-unfenced',
        identity,
        route: 'snapshot.get',
      }),
    ).toThrow('Renderer session is required');
  });
});
