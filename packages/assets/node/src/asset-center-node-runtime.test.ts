import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AssetCenterNodeRuntime } from './asset-center-node-runtime';

describe('AssetCenterNodeRuntime', () => {
  it('keeps Assets facts while releasing an authorized Preview handle on view detach', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openneko-asset-center-'));
    const absolutePath = join(directory, 'shot.png');
    await writeFile(absolutePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const releaseSession = vi.fn();
    const item = {
      id: 'media-library:item-1',
      owner: 'media-library' as const,
      libraryId: 'library-1',
      libraryLabel: 'Footage',
      label: 'shot.png',
      kind: 'file' as const,
      locationKind: 'local' as const,
      relativePath: 'shots/shot.png',
      availability: 'available' as const,
    };
    const resources = {
      searchHomeAssets: vi.fn(async () => ({ items: [] })),
      searchHomeMediaLibraries: vi.fn(async () => ({ items: [item] })),
      readHomeMediaLibraryChildren: vi.fn(async () => ({ items: [] })),
      resolveHomeLibraryThumbnail: vi.fn(),
      importHomeAssets: vi.fn(),
      removeHomeAssets: vi.fn(),
      moveHomeItems: vi.fn(),
      addHomeMediaLibrary: vi.fn(),
      relinkHomeMediaLibrary: vi.fn(),
      removeHomeMediaLibrary: vi.fn(),
      revealHomeMediaLibrary: vi.fn(),
      resolveAssetCenterSelection: vi.fn(async () => ({
        item,
        contentLocator: { kind: 'workspace-file' as const, path: 'shots/shot.png' },
        absolutePath,
      })),
    };
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: resources,
      createIdentity: () => 'preview-1',
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        })),
        releaseSession,
      },
    });
    const identity = {
      assetCenterSessionId: 'asset-center:window-1',
      windowId: 'window-1',
    };
    runtime.attach({ identity });
    await runtime.refresh({ identity });
    const selected = await runtime.select({
      identity,
      owner: 'media-library',
      itemId: item.id,
    });
    expect(selected).toMatchObject({
      selection: { itemId: item.id },
      preview: { status: 'ready', previewSessionId: 'preview:asset-center:preview-1' },
    });
    expect(runtime.getPreview(identity, 'preview:asset-center:preview-1')).toMatchObject({
      identity: {
        owner: { kind: 'asset-center', assetCenterSessionId: identity.assetCenterSessionId },
      },
      descriptor: { contentLocator: { kind: 'workspace-file', path: 'shots/shot.png' } },
    });

    const detached = await runtime.detachView(identity);
    expect(detached.selection?.itemId).toBe(item.id);
    expect(detached.preview).toEqual({ status: 'empty' });
    expect(releaseSession).toHaveBeenCalledWith('preview:asset-center:preview-1');
  });

  it('restores the exact Session across endpoint replacement without creating a duplicate', async () => {
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: emptyResourceBrowser(),
      resources: { registerFile: vi.fn(), releaseSession: vi.fn() },
    });
    const identity = {
      assetCenterSessionId: 'asset-center:window-1',
      windowId: 'window-1',
    };
    const first = runtime.attach({ identity });
    const restored = runtime.attach({ identity });
    expect(restored).toBe(first);
    expect(() =>
      runtime.attach({
        identity: { ...identity, windowId: 'window-2' },
      }),
    ).toThrow('owning Window');
  });

  it('continues the session queue after one operation fails locally', async () => {
    const resources = emptyResourceBrowser();
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: resources,
      resources: { registerFile: vi.fn(), releaseSession: vi.fn() },
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });

    await expect(
      runtime.select({
        identity,
        owner: 'media-library',
        itemId: 'missing-item',
      }),
    ).rejects.toThrow("Asset Center item 'missing-item' is unavailable");

    await expect(runtime.refresh({ identity })).resolves.toMatchObject({
      catalog: { status: 'ready', owner: 'media-library' },
    });
    expect(resources.searchHomeMediaLibraries).toHaveBeenCalledTimes(1);
  });

  it('keeps selection visible when Preview kind is unsupported', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openneko-asset-center-unsupported-'));
    const absolutePath = join(directory, 'material.unknown');
    await writeFile(absolutePath, 'fixture');
    const item = mediaItem('material.unknown');
    const registerFile = vi.fn();
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: resourceBrowserWithItem(item, absolutePath),
      createIdentity: () => 'unsupported',
      resources: { registerFile, releaseSession: vi.fn() },
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await runtime.refresh({ identity });
    const selected = await runtime.select({
      identity,
      owner: 'media-library',
      itemId: item.id,
    });
    expect(selected.selection?.itemId).toBe(item.id);
    expect(selected.preview).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'preview-unsupported-kind' },
    });
    expect(registerFile).not.toHaveBeenCalled();
  });

  it('keeps selection visible when Host resource authorization fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openneko-asset-center-denied-'));
    const absolutePath = join(directory, 'shot.png');
    await writeFile(absolutePath, 'fixture');
    const item = mediaItem('shot.png');
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: resourceBrowserWithItem(item, absolutePath),
      resources: {
        registerFile: vi.fn(async () => {
          throw new Error('resource authorization denied');
        }),
        releaseSession: vi.fn(),
      },
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await runtime.refresh({ identity });
    const selected = await runtime.select({
      identity,
      owner: 'media-library',
      itemId: item.id,
    });
    expect(selected.selection?.itemId).toBe(item.id);
    expect(selected.preview).toMatchObject({
      status: 'unavailable',
      diagnostic: {
        code: 'preview-source-unavailable',
        message: 'resource authorization denied',
      },
    });
  });

  it('releases Window Preview handles and disposes only the Window-scoped session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openneko-asset-center-window-'));
    const absolutePath = join(directory, 'shot.png');
    await writeFile(absolutePath, 'fixture');
    const item = mediaItem('shot.png');
    const releaseSession = vi.fn();
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: resourceBrowserWithItem(item, absolutePath),
      createIdentity: () => 'window-close',
      resources: {
        registerFile: vi.fn(async () => ({
          url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        })),
        releaseSession,
      },
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await runtime.refresh({ identity });
    await runtime.select({
      identity,
      owner: 'media-library',
      itemId: item.id,
    });
    runtime.detachWindow(identity.windowId);
    expect(releaseSession).toHaveBeenCalledWith('preview:asset-center:window-close');
    expect(() => runtime.getSnapshot(identity)).toThrow('unavailable');
  });
});

function emptyResourceBrowser() {
  return {
    searchHomeAssets: vi.fn(async () => ({ items: [] })),
    searchHomeMediaLibraries: vi.fn(async () => ({ items: [] })),
    readHomeMediaLibraryChildren: vi.fn(async () => ({ items: [] })),
    resolveHomeLibraryThumbnail: vi.fn(),
    importHomeAssets: vi.fn(),
    removeHomeAssets: vi.fn(),
    moveHomeItems: vi.fn(),
    addHomeMediaLibrary: vi.fn(),
    relinkHomeMediaLibrary: vi.fn(),
    removeHomeMediaLibrary: vi.fn(),
    revealHomeMediaLibrary: vi.fn(),
    resolveAssetCenterSelection: vi.fn(),
  };
}

function sessionIdentity() {
  return { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' };
}

function mediaItem(label: string) {
  return {
    id: `media-library:${label}`,
    owner: 'media-library' as const,
    libraryId: 'library-1',
    libraryLabel: 'Footage',
    label,
    kind: 'file' as const,
    locationKind: 'local' as const,
    relativePath: label,
    availability: 'available' as const,
  };
}

function resourceBrowserWithItem(item: ReturnType<typeof mediaItem>, absolutePath: string) {
  return {
    ...emptyResourceBrowser(),
    searchHomeMediaLibraries: vi.fn(async () => ({ items: [item] })),
    resolveAssetCenterSelection: vi.fn(async () => ({
      item,
      contentLocator: { kind: 'workspace-file' as const, path: item.relativePath },
      absolutePath,
    })),
  };
}
