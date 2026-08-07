import { describe, expect, it, vi } from 'vitest';
import type { GlobalLibraryBrowserRuntime } from '../global-library';
import { AssetCenterController } from './controller';
import { AssetCenterSession } from './session';
import { createDefaultAssetCenterFilter } from './contract';

describe('AssetCenterController', () => {
  it('owns catalog filters and resolves exact selection through its Assets port', async () => {
    const source = libraryRuntime();
    const resolve = vi.fn(async () => ({
      kind: 'workspace-file' as const,
      path: 'shots/shot.png',
    }));
    const controller = createController(source, resolve);
    await controller.refresh();
    const selected = await controller.select({
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });

    expect(resolve).toHaveBeenCalledWith({
      identity: {
        assetCenterSessionId: 'asset-center:window-1',
        windowId: 'window-1',
      },
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });
    expect(selected.selection?.contentLocator).toEqual({
      kind: 'workspace-file',
      path: 'shots/shot.png',
    });
  });

  it('keeps selection facts while a filter refresh is pending', async () => {
    const source = libraryRuntime();
    const controller = createController(source, async () => ({
      kind: 'workspace-file',
      path: 'shots/shot.png',
    }));
    await controller.refresh();
    const selected = await controller.select({
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });
    const loading = controller.updateFilter({
      ...selected.filter,
      query: 'shot',
    });
    expect(loading.catalog.status).toBe('loading');
    expect(loading.selection?.itemId).toBe('media-library:item-1');
  });

  it('projects source failures as typed unavailable without clearing selection', async () => {
    const source = libraryRuntime();
    const controller = createController(source, async () => ({
      kind: 'workspace-file',
      path: 'shots/shot.png',
    }));
    await controller.refresh();
    await controller.select({
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });
    source.searchMediaLibraries = vi.fn(async () => {
      throw new Error('authorization failed');
    });
    const unavailable = await controller.refresh();
    expect(unavailable).toMatchObject({
      catalog: {
        status: 'unavailable',
        diagnostic: { code: 'asset-center-catalog-unavailable' },
      },
      selection: { itemId: 'media-library:item-1' },
    });
  });

  it('authorizes the exact locator and binds an owner-qualified Preview session', async () => {
    const source = libraryRuntime();
    const authorize = vi.fn(async () => ({
      status: 'ready' as const,
      descriptor: previewDescriptor(),
    }));
    const create = vi.fn(async () => ({
      identity: {
        previewSessionId: 'preview:asset-center:1',
        windowId: 'window-1',
        owner: {
          kind: 'asset-center' as const,
          assetCenterSessionId: 'asset-center:window-1',
          resourceOwner: 'media-library' as const,
          itemId: 'media-library:item-1',
        },
      },
      status: 'ready' as const,
      descriptor: previewDescriptor(),
    }));
    const controller = new AssetCenterController(
      createMediaSession(),
      source,
      { resolve: async () => ({ kind: 'workspace-file', path: 'shots/shot.png' }) },
      {
        contentAuthorization: { authorize },
        previewSessions: { create, release: vi.fn() },
      },
    );
    await controller.refresh();
    const selected = await controller.select({
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });

    expect(authorize).toHaveBeenCalledWith({
      identity: {
        assetCenterSessionId: 'asset-center:window-1',
        windowId: 'window-1',
      },
      owner: 'media-library',
      itemId: 'media-library:item-1',
      contentLocator: { kind: 'workspace-file', path: 'shots/shot.png' },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ assetCenterSessionId: 'asset-center:window-1' }),
        descriptor: previewDescriptor(),
      }),
    );
    expect(selected.preview).toEqual({
      status: 'ready',
      itemId: 'media-library:item-1',
      previewSessionId: 'preview:asset-center:1',
    });
  });

  it('releases Preview and clears selection when the selected Asset membership is removed', async () => {
    const source = libraryRuntime();
    const asset = {
      id: 'asset-membership-1',
      owner: 'global-asset-library' as const,
      label: 'hero.png',
      kind: 'asset' as const,
      mediaType: 'image',
      availability: 'available' as const,
    };
    source.searchAssets = vi.fn(async () => ({ items: [asset] }));
    const release = vi.fn(async () => undefined);
    const controller = new AssetCenterController(
      createMediaSession(),
      source,
      { resolve: async () => ({ kind: 'workspace-file', path: 'hero.png' }) },
      {
        contentAuthorization: {
          authorize: async () => ({ status: 'ready', descriptor: previewDescriptor() }),
        },
        previewSessions: {
          create: async () => ({
            identity: {
              previewSessionId: 'preview:asset-center:asset-1',
              windowId: 'window-1',
              owner: {
                kind: 'asset-center',
                assetCenterSessionId: 'asset-center:window-1',
                resourceOwner: 'global-asset-library',
                itemId: asset.id,
              },
            },
            status: 'ready',
            descriptor: previewDescriptor(),
          }),
          release,
        },
      },
    );
    const initial = controller.getSnapshot();
    controller.updateFilter({
      ...initial.filter,
      catalog: 'global-asset-library',
    });
    await controller.refresh();
    await controller.select({
      owner: asset.owner,
      itemId: asset.id,
    });

    await controller.removeAssets([asset]);

    expect(source.removeAssets).toHaveBeenCalledWith([asset.id]);
    expect(release).toHaveBeenCalledWith({
      identity: controller.identity,
      previewSessionId: 'preview:asset-center:asset-1',
    });
    expect(controller.getSnapshot()).toMatchObject({ preview: { status: 'empty' } });
    expect(controller.getSnapshot().selection).toBeUndefined();
  });
});

function createController(
  source: GlobalLibraryBrowserRuntime,
  resolve: (input: {
    readonly identity: { readonly assetCenterSessionId: string; readonly windowId: string };
    readonly owner: 'global-asset-library' | 'media-library';
    readonly itemId: string;
  }) => Promise<{ readonly kind: 'workspace-file'; readonly path: string }>,
): AssetCenterController {
  return new AssetCenterController(createMediaSession(), source, { resolve });
}

function createMediaSession(): AssetCenterSession {
  return new AssetCenterSession(
    {
      assetCenterSessionId: 'asset-center:window-1',
      windowId: 'window-1',
    },
    { ...createDefaultAssetCenterFilter(), catalog: 'media-library' },
  );
}

function libraryRuntime(): GlobalLibraryBrowserRuntime {
  return {
    searchAssets: vi.fn(async () => ({ items: [] })),
    searchMediaLibraries: vi.fn(async () => ({
      items: [
        {
          id: 'media-library:item-1',
          owner: 'media-library',
          libraryId: 'library-1',
          libraryLabel: 'Footage',
          label: 'shot.png',
          kind: 'file',
          locationKind: 'local',
          relativePath: 'shots/shot.png',
          availability: 'available',
        },
      ] as const,
    })),
    readMediaLibraryChildren: vi.fn(async () => ({ items: [] })),
    resolveThumbnail: vi.fn(),
    importAssets: vi.fn(),
    removeAssets: vi.fn(),
    moveItems: vi.fn(),
    addMediaLibrary: vi.fn(),
    relinkMediaLibrary: vi.fn(),
    removeMediaLibrary: vi.fn(),
    revealMediaLibrary: vi.fn(),
  };
}

function previewDescriptor() {
  return {
    descriptorId: 'descriptor-1',
    sourceFingerprint: 'fingerprint-1',
    contentLocator: { kind: 'workspace-file' as const, path: 'shots/shot.png' },
    url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    contentKind: 'image' as const,
    mediaType: 'image/png',
    displayName: 'shot.png',
    byteLength: 42,
  };
}
