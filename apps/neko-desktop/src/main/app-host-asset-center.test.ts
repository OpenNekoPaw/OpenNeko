import { createDefaultAssetCenterFilter } from '@neko/assets-domain/asset-center/contract';
import type { AssetCenterNodeRuntime } from '@neko/assets-node';
import { describe, expect, it, vi } from 'vitest';
import { DesktopAppHost } from './app-host';
import type { DesktopSenderIdentity } from './window-registry';

const identity = {
  assetCenterSessionId: 'asset-center:window-1',
  windowId: 'window-1',
} as const;
const projection = {
  identity,
  filter: createDefaultAssetCenterFilter(),
  catalog: { status: 'loading' as const },
  preview: { status: 'empty' as const },
};
const sender: DesktopSenderIdentity = {
  webContentsId: 7,
  frameUrl: 'openneko://desktop',
};

describe('Desktop AppHost Asset Center Renderer fencing', () => {
  it('acknowledges stale Renderer cleanup without detaching the replacement session', async () => {
    const detachSession = vi.fn<AssetCenterNodeRuntime['detachSession']>();
    const host = createHost('renderer-current', { detachSession });

    await expect(
      execute(host, {
        requestId: 'detach-stale',
        rendererSessionId: 'renderer-outgoing',
        identity,
        route: 'session.detach',
      }),
    ).resolves.toEqual({
      requestId: 'detach-stale',
      route: 'session.detach',
      status: 'stale',
    });
    expect(detachSession).not.toHaveBeenCalled();
  });

  it('rejects stale Renderer mutations before they reach Assets Node', async () => {
    const refresh = vi.fn<AssetCenterNodeRuntime['refresh']>();
    const host = createHost('renderer-current', { refresh });

    await expect(
      execute(host, {
        requestId: 'refresh-stale',
        rendererSessionId: 'renderer-outgoing',
        identity,
        route: 'catalog.refresh',
      }),
    ).rejects.toThrow('Renderer session is stale');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('detaches only through the current Renderer and returns the explicit outcome', async () => {
    const detachSession = vi
      .fn<AssetCenterNodeRuntime['detachSession']>()
      .mockResolvedValue(projection);
    const host = createHost('renderer-current', { detachSession });

    await expect(
      execute(host, {
        requestId: 'detach-current',
        rendererSessionId: 'renderer-current',
        identity,
        route: 'session.detach',
      }),
    ).resolves.toMatchObject({
      requestId: 'detach-current',
      route: 'session.detach',
      status: 'detached',
      projection: { identity },
    });
    expect(detachSession).toHaveBeenCalledOnce();
    expect(detachSession).toHaveBeenCalledWith(identity);
  });
});

function createHost(
  rendererSessionId: string,
  runtime: Partial<Pick<AssetCenterNodeRuntime, 'detachSession' | 'refresh'>>,
): object {
  return Object.assign(Object.create(DesktopAppHost.prototype), {
    disposed: false,
    windows: { resolveSender: () => ({ windowId: identity.windowId }) },
    shell: {
      getProjection: vi.fn(async () => ({ rendererSessionId })),
      getSceneProjection: vi.fn(async () => ({ context: { kind: 'extensions' } })),
      projectAssetCenterPreview: vi.fn(),
    },
    assetCenter: runtime,
  });
}

function execute(host: object, request: Record<string, unknown>): Promise<unknown> {
  return Reflect.apply(DesktopAppHost.prototype.executeAssetCenter, host, [sender, request]);
}
