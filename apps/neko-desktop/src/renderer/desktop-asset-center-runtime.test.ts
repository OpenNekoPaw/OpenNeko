import { describe, expect, it, vi } from 'vitest';
import { DesktopAssetCenterRuntime } from './desktop-asset-center-runtime';
import { createDefaultAssetCenterFilter } from '@neko/assets-domain/asset-center/contract';
import type {
  AssetCenterHostRequest,
  AssetCenterHostResult,
} from '@neko/assets-domain/asset-center/host-contract';

describe('DesktopAssetCenterRuntime', () => {
  it('attaches and updates only through the package-owned typed bridge', async () => {
    const execute = vi.fn(async (request) => ({
      requestId: request.requestId,
      route: request.route === 'preview.get' ? ('snapshot.get' as const) : request.route,
      projection: projection(),
    }));
    const runtime = new DesktopAssetCenterRuntime(
      { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
      'grid',
      { assetCenter: { execute } },
    );
    await runtime.getSnapshot();
    await runtime.updateFilter({ ...createDefaultAssetCenterFilter(), query: 'shot' });
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        route: 'attach',
        identity: { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
      }),
    );
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ route: 'filter.update' }));
  });

  it('routes thumbnails and mutations through Asset Center without Home or raw-path payloads', async () => {
    const execute = vi.fn(
      async (request: AssetCenterHostRequest): Promise<AssetCenterHostResult> => {
        if (request.route === 'thumbnail.resolve') {
          return {
            requestId: request.requestId,
            route: request.route,
            thumbnail: {
              owner: 'global-asset-library' as const,
              itemId: 'global-asset-library:item-1',
              descriptorId: 'thumbnail:item-1',
              sourceFingerprint: 'fingerprint-1',
              variant: 'hover' as const,
              dataUrl: 'data:image/png;base64,AA==',
            },
          };
        }
        if (request.route === 'preview.get') throw new Error('Unexpected Preview request.');
        return {
          requestId: request.requestId,
          route: request.route,
          projection: readyProjection(),
        };
      },
    );
    const runtime = new DesktopAssetCenterRuntime(
      { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
      'grid',
      { assetCenter: { execute } },
    );
    await runtime.getSnapshot();
    const item =
      readyProjection().catalog.status === 'ready'
        ? readyProjection().catalog.entries[0]?.item
        : undefined;
    if (!item) throw new Error('Asset fixture is unavailable.');

    await runtime.resolveThumbnail(item, 'hover');
    await runtime.removeAssets([item]);
    await runtime.moveItems([item]);

    expect(execute.mock.calls.map(([request]) => request.route)).toEqual([
      'attach',
      'thumbnail.resolve',
      'assets.remove',
      'items.move',
    ]);
    expect(execute.mock.calls.at(-2)?.[0]).toMatchObject({ itemIds: [item.id] });
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({ itemIds: [item.id] });
    expect(JSON.stringify(execute.mock.calls)).not.toMatch(
      /absolutePath|selectedId|previewKind|"extension"/u,
    );
  });
});

function projection() {
  return {
    identity: { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' },
    filter: createDefaultAssetCenterFilter(),
    catalog: { status: 'loading' as const },
    preview: { status: 'empty' as const },
  };
}

function readyProjection() {
  return {
    ...projection(),
    catalog: {
      status: 'ready' as const,
      owner: 'global-asset-library' as const,
      entries: [
        {
          item: {
            id: 'global-asset-library:item-1',
            owner: 'global-asset-library' as const,
            label: 'Shot',
            kind: 'asset' as const,
            mediaType: 'image',
            availability: 'available' as const,
            thumbnail: {
              descriptorId: 'thumbnail:item-1',
              sourceFingerprint: 'fingerprint-1',
              mediaType: 'image' as const,
            },
          },
        },
      ],
    },
  };
}
