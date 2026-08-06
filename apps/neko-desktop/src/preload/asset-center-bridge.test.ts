import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_CENTER_HOST_CHANNEL,
  createAssetCenterHostRequest,
} from '@neko/assets-domain/asset-center/host-contract';
import { createDefaultAssetCenterFilter } from '@neko/assets-domain/asset-center/contract';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: vi.fn(),
  },
}));

await import('./index');

const identity = {
  assetCenterSessionId: 'asset-center:window-1',
  windowId: 'window-1',
};

describe('Desktop Asset Center preload bridge', () => {
  beforeEach(async () => {
    electron.invoke.mockReset();
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        application: { applicationId: 'neko-desktop', instanceId: 'application-1' },
        window: { windowId: 'window-1', rendererSessionId: 'renderer-session-1' },
        host: { id: 'electron', kind: 'electron', ui: 'graphical' },
        runtime: { platform: 'darwin' },
        status: 'foundation-ready',
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.bootstrap.get();
    electron.invoke.mockReset();
  });

  it.each(['assets.remove', 'items.move'] as const)(
    'routes %s through the one owner-qualified channel with opaque identities',
    async (route) => {
      const request = createAssetCenterHostRequest({
        route,
        requestId: `asset-center-${route}`,
        identity,
        itemIds: ['global-asset-library:item-1', 'global-asset-library:item-2'],
      });
      electron.invoke.mockImplementation(async (channel: string, value: unknown) => {
        expect(channel).toBe(ASSET_CENTER_HOST_CHANNEL);
        expect(value).toEqual(request);
        return {
          requestId: request.requestId,
          route,
          projection: {
            identity,
            filter: createDefaultAssetCenterFilter(),
            catalog: { status: 'loading' },
            preview: { status: 'empty' },
          },
        };
      });
      const bridge = electron.bridge;
      if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

      await expect(bridge.assetCenter.execute(request)).resolves.toMatchObject({ route });
      expect(electron.invoke).toHaveBeenCalledWith(ASSET_CENTER_HOST_CHANNEL, request);
      expect(JSON.stringify(electron.invoke.mock.calls)).not.toMatch(
        /absolutePath|destinationPath|sourcePath/u,
      );
    },
  );

  it('rejects a stale result identity at the preload boundary', async () => {
    const request = createAssetCenterHostRequest({
      route: 'items.move',
      requestId: 'asset-center-move-stale',
      identity,
      itemIds: ['global-asset-library:item-1'],
    });
    electron.invoke.mockResolvedValue({
      requestId: request.requestId,
      route: 'assets.remove',
      projection: {
        identity,
        filter: createDefaultAssetCenterFilter(),
        catalog: { status: 'loading' },
        preview: { status: 'empty' },
      },
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.assetCenter.execute(request)).rejects.toThrow('result identity is stale');
  });
});
