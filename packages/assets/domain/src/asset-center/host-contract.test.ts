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
        identity,
        route: 'asset.remove',
        itemId: 'global-asset-library:item-1',
      }),
    ).toMatchObject({ route: 'asset.remove', identity });

    const request = createAssetCenterHostRequest({
      requestId: 'request-2',
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

  it.each(['rendererSessionId', 'absolutePath', 'selectedId', 'extension', 'previewKind'])(
    'rejects renderer-owned %s fallback fields',
    (field) => {
      expect(() =>
        parseAssetCenterHostRequest({
          requestId: 'request-poison',
          identity,
          route: 'selection.select',
          owner: 'global-asset-library',
          itemId: 'global-asset-library:item-1',
          [field]: field === 'absolutePath' ? '/private/item.png' : 'png',
        }),
      ).toThrow('unsupported fields');
    },
  );
});
