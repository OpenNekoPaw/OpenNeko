import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it, vi } from 'vitest';
import type { EpubPreviewResourceTree } from '@neko/preview-node';
import {
  AssetCenterNodeRuntime,
  type AssetCenterNodeRuntimeOptions,
} from './asset-center-node-runtime';

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
        contentLocator: {
          file: { authority: 'workspace' as const, path: 'shots/shot.png' },
        },
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
        registerResourceTree: vi.fn(),
        releaseSession,
      },
    });
    const identity = {
      assetCenterSessionId: 'asset-center:window-1',
      windowId: 'window-1',
    };
    runtime.attach({ identity });
    await selectMediaCatalog(runtime, identity);
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
      descriptor: { contentLocator: { file: { authority: 'workspace', path: 'shots/shot.png' } } },
    });

    const detached = await runtime.detachSession(identity);
    expect(detached.selection?.itemId).toBe(item.id);
    expect(detached.preview).toEqual({ status: 'empty' });
    expect(releaseSession).toHaveBeenCalledWith('preview:asset-center:preview-1');
  });

  it('publishes EPUB through the Preview virtual directory path without single-file fallback', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openneko-asset-center-epub-'));
    const absolutePath = join(directory, 'book.epub');
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    await writer.add('META-INF/container.xml', new TextReader('<container/>'));
    await writer.add('OPS/chapter.xhtml', new TextReader('<p>chapter</p>'));
    await writeFile(absolutePath, await writer.close());
    const item = mediaItem('book.epub');
    const registerFile = vi.fn(async () => {
      throw new Error('EPUB must not use registerFile.');
    });
    let resourceTree: EpubPreviewResourceTree | undefined;
    const registerResourceTree = vi.fn(async (_owner: unknown, tree: EpubPreviewResourceTree) => {
      resourceTree = tree;
      return {
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
        release: vi.fn(),
      };
    });
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: resourceBrowserWithItem(item, absolutePath),
      createIdentity: () => 'epub-preview',
      resources: createPreviewResources({ registerFile, registerResourceTree }),
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await selectMediaCatalog(runtime, identity);
    await runtime.refresh({ identity });

    const selected = await runtime.select({
      identity,
      owner: 'media-library',
      itemId: item.id,
    });

    expect(selected).toMatchObject({
      selection: { itemId: item.id },
      preview: { status: 'ready', previewSessionId: 'preview:asset-center:epub-preview' },
    });
    expect(runtime.getPreview(identity, 'preview:asset-center:epub-preview')).toMatchObject({
      descriptor: {
        mediaType: 'application/epub+zip',
        url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
      },
    });
    expect(registerResourceTree).toHaveBeenCalledOnce();
    expect(registerFile).not.toHaveBeenCalled();
    expect(resourceTree?.entries.map((entry) => entry.virtualPath)).toEqual([
      'META-INF/container.xml',
      'OPS/chapter.xhtml',
    ]);
  });

  it('restores the exact Session across endpoint replacement without creating a duplicate', async () => {
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: emptyResourceBrowser(),
      resources: createPreviewResources(),
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

  it('reconstructs filter and selection through current authority after Session detach', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openneko-asset-center-restore-'));
    const absolutePath = join(directory, 'restored.png');
    await writeFile(absolutePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const item = mediaItem('restored.png');
    const resourceBrowser = resourceBrowserWithItem(item, absolutePath);
    const registerFile = vi.fn(async () => ({
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }));
    const releaseSession = vi.fn();
    const createIdentity = vi
      .fn<() => string>()
      .mockReturnValueOnce('first-preview')
      .mockReturnValueOnce('restored-preview');
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser,
      createIdentity,
      resources: createPreviewResources({ registerFile, releaseSession }),
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await runtime.updateFilter({
      identity,
      filter: {
        ...runtime.getSnapshot(identity).filter,
        catalog: 'media-library',
        query: 'restored',
        viewMode: 'grid',
      },
    });
    await runtime.refresh({ identity });
    await runtime.select({ identity, owner: 'media-library', itemId: item.id });

    await runtime.detachSession(identity);
    expect(() => runtime.getSnapshot(identity)).toThrow('unavailable');
    expect(releaseSession).toHaveBeenCalledWith('preview:asset-center:first-preview');

    const attached = runtime.attach({ identity, initialViewMode: 'list' });
    expect(attached).toMatchObject({
      filter: { catalog: 'media-library', query: 'restored', viewMode: 'grid' },
      catalog: { status: 'loading' },
      preview: { status: 'empty' },
    });
    expect(attached).not.toHaveProperty('selection');

    const restored = await runtime.refresh({ identity });
    expect(restored).toMatchObject({
      selection: { owner: 'media-library', itemId: item.id },
      preview: {
        status: 'ready',
        previewSessionId: 'preview:asset-center:restored-preview',
      },
    });
    expect(resourceBrowser.resolveAssetCenterSelection).toHaveBeenCalledTimes(2);
    expect(registerFile).toHaveBeenCalledTimes(2);
  });

  it('does not retain an empty default presentation after Session detach', async () => {
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: emptyResourceBrowser(),
      resources: createPreviewResources(),
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await runtime.detachSession(identity);
    await expect(runtime.detachSession(identity)).rejects.toThrow(
      `Asset Center session '${identity.assetCenterSessionId}' is unavailable.`,
    );

    expect(runtime.attach({ identity, initialViewMode: 'grid' }).filter.viewMode).toBe('grid');
    await runtime.detachSession(identity);
    expect(runtime.attach({ identity, initialViewMode: 'list' }).filter.viewMode).toBe('list');
  });

  it('clears detached presentation snapshots with their owning Window', async () => {
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: emptyResourceBrowser(),
      resources: createPreviewResources(),
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await runtime.updateFilter({
      identity,
      filter: { ...runtime.getSnapshot(identity).filter, query: 'window-owned' },
    });
    await runtime.detachSession(identity);
    runtime.detachWindow(identity.windowId);

    expect(runtime.attach({ identity }).filter.query).toBe('');
  });

  it('continues the session queue after one operation fails locally', async () => {
    const resources = emptyResourceBrowser();
    const runtime = new AssetCenterNodeRuntime({
      resourceBrowser: resources,
      resources: createPreviewResources(),
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
      resources: createPreviewResources({ registerFile }),
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await selectMediaCatalog(runtime, identity);
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
        registerResourceTree: vi.fn(),
        releaseSession: vi.fn(),
      },
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await selectMediaCatalog(runtime, identity);
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
        registerResourceTree: vi.fn(),
        releaseSession,
      },
    });
    const identity = sessionIdentity();
    runtime.attach({ identity });
    await selectMediaCatalog(runtime, identity);
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

function createPreviewResources(
  overrides: Partial<AssetCenterNodeRuntimeOptions['resources']> = {},
): AssetCenterNodeRuntimeOptions['resources'] {
  return {
    registerFile: vi.fn(async () => ({
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })),
    registerResourceTree: vi.fn(async () => ({
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
      release: vi.fn(),
    })),
    releaseSession: vi.fn(),
    ...overrides,
  };
}

function sessionIdentity() {
  return { assetCenterSessionId: 'asset-center:window-1', windowId: 'window-1' };
}

async function selectMediaCatalog(
  runtime: AssetCenterNodeRuntime,
  identity: ReturnType<typeof sessionIdentity>,
): Promise<void> {
  const projection = runtime.getSnapshot(identity);
  await runtime.updateFilter({
    identity,
    filter: { ...projection.filter, catalog: 'media-library' },
  });
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
      contentLocator: {
        file: { authority: 'workspace' as const, path: item.relativePath },
      },
      absolutePath,
    })),
  };
}
