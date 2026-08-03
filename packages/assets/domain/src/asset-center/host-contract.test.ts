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

describe('Asset Center Host contract', () => {
  it('owns catalog mutation and thumbnail routes behind the exact session identity', () => {
    expect(
      createAssetCenterHostRequest({
        requestId: 'request-1',
        endpointEpoch: 'endpoint-1',
        identity,
        route: 'asset.remove',
        expectedRevision: 3,
        itemId: 'global-asset-library:item-1',
      }),
    ).toMatchObject({ route: 'asset.remove', identity, expectedRevision: 3 });

    const request = createAssetCenterHostRequest({
      requestId: 'request-2',
      endpointEpoch: 'endpoint-1',
      identity,
      route: 'thumbnail.resolve',
      expectedRevision: 3,
      itemId: 'global-asset-library:item-1',
      variant: 'hover',
    });
    expect(
      parseAssetCenterHostResult(
        {
          schemaVersion: 1,
          requestId: 'request-2',
          route: 'thumbnail.resolve',
          thumbnail: {
            owner: 'global-asset-library',
            itemId: 'global-asset-library:item-1',
            expectedCatalogRevision: 8,
            descriptorId: 'thumbnail:item-1',
            thumbnailRevision: 'revision-1',
            variant: 'hover',
            dataUrl: 'data:image/png;base64,AA==',
          },
        },
        request,
      ),
    ).toMatchObject({ route: 'thumbnail.resolve', thumbnail: { variant: 'hover' } });
  });

  it.each(['absolutePath', 'selectedId', 'extension', 'previewKind'])(
    'rejects renderer-owned %s fallback fields',
    (field) => {
      expect(() =>
        parseAssetCenterHostRequest({
          schemaVersion: 1,
          requestId: 'request-poison',
          endpointEpoch: 'endpoint-1',
          identity,
          route: 'selection.select',
          expectedRevision: 0,
          owner: 'global-asset-library',
          itemId: 'global-asset-library:item-1',
          [field]: field === 'absolutePath' ? '/private/item.png' : 'png',
        }),
      ).toThrow('unsupported fields');
    },
  );
});
