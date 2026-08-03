import { describe, expect, it, vi } from 'vitest';
import type { GlobalLibraryBrowserRuntime } from '../global-library';
import { AssetCenterController } from './controller';
import { AssetCenterSession } from './session';
import { AUTHORIZED_PREVIEW_SESSION_VERSION } from '@neko/preview-domain/authorized-session';

describe('AssetCenterController', () => {
  it('owns catalog filters and resolves exact selection through its Assets port', async () => {
    const source = libraryRuntime();
    const resolve = vi.fn(async () => ({
      kind: 'workspace-file' as const,
      path: 'shots/shot.png',
    }));
    const controller = createController(source, resolve);
    const ready = await controller.refresh(0);
    const selected = await controller.select({
      expectedRevision: ready.revision,
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
      expectedCatalogRevision: 7,
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
    const ready = await controller.refresh(0);
    const selected = await controller.select({
      expectedRevision: ready.revision,
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });
    const loading = controller.updateFilter(selected.revision, {
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
    const ready = await controller.refresh(0);
    const selected = await controller.select({
      expectedRevision: ready.revision,
      owner: 'media-library',
      itemId: 'media-library:item-1',
    });
    source.searchMediaLibraries = vi.fn(async () => {
      throw new Error('authorization failed');
    });
    const unavailable = await controller.refresh(selected.revision);
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
      schemaVersion: AUTHORIZED_PREVIEW_SESSION_VERSION,
      identity: {
        previewSessionId: 'preview:asset-center:1',
        windowId: 'window-1',
        owner: {
          kind: 'asset-center' as const,
          assetCenterSessionId: 'asset-center:window-1',
          resourceOwner: 'media-library' as const,
          itemId: 'media-library:item-1',
        },
        revision: 0,
      },
      status: 'ready' as const,
      descriptor: previewDescriptor(),
    }));
    const controller = new AssetCenterController(
      new AssetCenterSession({
        assetCenterSessionId: 'asset-center:window-1',
        windowId: 'window-1',
      }),
      source,
      { resolve: async () => ({ kind: 'workspace-file', path: 'shots/shot.png' }) },
      {
        contentAuthorization: { authorize },
        previewSessions: { create, release: vi.fn() },
      },
    );
    const ready = await controller.refresh(0);
    const selected = await controller.select({
      expectedRevision: ready.revision,
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
});

function createController(
  source: GlobalLibraryBrowserRuntime,
  resolve: (input: {
    readonly identity: { readonly assetCenterSessionId: string; readonly windowId: string };
    readonly owner: 'global-asset-library' | 'media-library';
    readonly itemId: string;
    readonly expectedCatalogRevision: number;
  }) => Promise<{ readonly kind: 'workspace-file'; readonly path: string }>,
): AssetCenterController {
  return new AssetCenterController(
    new AssetCenterSession({
      assetCenterSessionId: 'asset-center:window-1',
      windowId: 'window-1',
    }),
    source,
    { resolve },
  );
}

function libraryRuntime(): GlobalLibraryBrowserRuntime {
  return {
    searchAssets: vi.fn(async () => ({ revision: 7, items: [] })),
    searchMediaLibraries: vi.fn(async () => ({
      revision: 7,
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
    readMediaLibraryChildren: vi.fn(async () => ({ revision: 7, items: [] })),
    resolveThumbnail: vi.fn(),
    importAssets: vi.fn(),
    removeAsset: vi.fn(),
    addMediaLibrary: vi.fn(),
    relinkMediaLibrary: vi.fn(),
    removeMediaLibrary: vi.fn(),
    revealMediaLibrary: vi.fn(),
  };
}

function previewDescriptor() {
  return {
    descriptorId: 'descriptor-1',
    revision: 'revision-1',
    contentLocator: { kind: 'workspace-file' as const, path: 'shots/shot.png' },
    url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    contentKind: 'image' as const,
    mediaType: 'image/png',
    displayName: 'shot.png',
    byteLength: 42,
  };
}
