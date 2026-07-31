// @vitest-environment jsdom

import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  GlobalAssetItem,
  GlobalAssetProjection,
  GlobalLibraryBrowserRuntime,
  GlobalLibraryItem,
  GlobalMediaLibraryItem,
} from './contract';
import { GlobalLibraryController } from './controller';
import { GlobalLibraryBrowserRoot } from './root';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

describe('GlobalLibraryBrowserRoot', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('keeps its controller active across React StrictMode effect replay', async () => {
    vi.useFakeTimers();
    const dispose = vi.spyOn(GlobalLibraryController.prototype, 'dispose');
    const library = createLibrary();
    const runtime = createRuntime(library);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <GlobalLibraryBrowserRoot
            runtime={runtime}
            locale="en"
            defaultViewMode="grid"
            confirmAction={() => true}
          />
        </StrictMode>,
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(160));

    expect(runtime.searchMediaLibraries).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Footage');
    expect(container.textContent).not.toContain('Global Library controller is disposed.');
    expect(dispose).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('shares list/grid state and opens directories only through activation', async () => {
    const library = createLibrary();
    const runtime = createRuntime(library);
    const onViewModeChange = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale="en"
          defaultViewMode="grid"
          confirmAction={() => true}
          onViewModeChange={onViewModeChange}
        />,
      );
    });
    await act(async () => wait(180));

    const collection = container.querySelector<HTMLElement>('.global-library-browser__collection');
    expect(collection?.dataset['viewMode']).toBe('grid');
    expect(container.textContent).not.toContain('Browse');
    expect(container.textContent).not.toContain('Open folder');

    const listButton = container.querySelector<HTMLButtonElement>('button[aria-label="List view"]');
    await act(async () => listButton?.click());
    expect(collection?.dataset['viewMode']).toBe('list');
    expect(onViewModeChange).toHaveBeenCalledWith('list');

    const entry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      entry?.click();
      await wait(0);
    });
    expect(runtime.readMediaLibraryChildren).not.toHaveBeenCalled();

    await act(async () => {
      entry?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    });
    await act(async () => wait(180));
    expect(runtime.readMediaLibraryChildren).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryId: library.libraryId,
        relativePath: '',
      }),
    );

    await act(async () => root.unmount());
  });

  it('loads icon thumbnails lazily and fences a cancelled static hover preview', async () => {
    vi.useFakeTimers();
    const item: GlobalMediaLibraryItem = {
      ...createLibrary(),
      id: 'media-library:file123',
      label: 'frame.png',
      kind: 'file',
      relativePath: 'frame.png',
      mediaType: 'image',
      thumbnail: {
        descriptorId: 'media-library:thumb123',
        revision: '2026-07-31T00:00:00.000Z:50',
        mediaType: 'image',
      },
    };
    const runtime = createRuntime(item);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale="en"
          defaultViewMode="grid"
          confirmAction={() => true}
        />,
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(160));
    expect(runtime.resolveThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: item.id, variant: 'icon' }),
    );

    const entry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      entry?.focus();
      await vi.advanceTimersByTimeAsync(100);
      entry?.blur();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(runtime.resolveThumbnail).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'hover' }),
    );
    expect(container.querySelector('.global-library-browser__hover-preview')).toBeNull();

    await act(async () => {
      entry?.focus();
      await vi.advanceTimersByTimeAsync(190);
    });
    expect(runtime.resolveThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: item.id, variant: 'hover' }),
    );
    expect(container.querySelector('.global-library-browser__hover-preview img')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('opens directories with Enter and navigates back through ancestor breadcrumbs', async () => {
    const library = createLibrary();
    const directory: GlobalMediaLibraryItem = {
      ...library,
      id: 'media-library:directory123',
      label: 'shots',
      kind: 'directory',
      relativePath: 'shots',
    };
    const runtime = createRuntime(library);
    runtime.readMediaLibraryChildren = vi
      .fn()
      .mockResolvedValueOnce({ revision: 0, items: [directory] })
      .mockResolvedValue({ revision: 0, items: [] });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale="en"
          defaultViewMode="grid"
          confirmAction={() => true}
        />,
      );
    });
    await act(async () => wait(180));

    const libraryEntry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      libraryEntry?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    await act(async () => wait(180));
    expect(runtime.readMediaLibraryChildren).toHaveBeenLastCalledWith(
      expect.objectContaining({ libraryId: library.libraryId, relativePath: '' }),
    );

    const nestedEntry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      nestedEntry?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    await act(async () => wait(180));
    expect(runtime.readMediaLibraryChildren).toHaveBeenLastCalledWith(
      expect.objectContaining({ libraryId: library.libraryId, relativePath: 'shots' }),
    );

    const breadcrumb = container.querySelector<HTMLElement>('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb?.textContent).toContain('Libraries');
    expect(breadcrumb?.textContent).toContain('Footage');
    expect(breadcrumb?.textContent).toContain('shots');
    const rootButton = [...(breadcrumb?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (button) => button.textContent === 'Libraries',
    );
    await act(async () => rootButton?.click());
    await act(async () => wait(180));
    expect(runtime.searchMediaLibraries).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it('keeps the owning connection label when a search result opens a directory', async () => {
    const library = createLibrary();
    const searchDirectory: GlobalMediaLibraryItem = {
      ...library,
      id: 'media-library:search-directory',
      label: 'shots',
      kind: 'directory',
      relativePath: 'sequences/shots',
    };
    const runtime = createRuntime(library);
    runtime.searchMediaLibraries = vi
      .fn()
      .mockResolvedValueOnce({ revision: 0, items: [library] })
      .mockResolvedValueOnce({ revision: 0, items: [searchDirectory] });
    runtime.readMediaLibraryChildren = vi.fn(async () => ({ revision: 0, items: [] }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale="en"
          defaultViewMode="grid"
          confirmAction={() => true}
        />,
      );
    });
    await act(async () => wait(180));
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search media libraries"]',
    );
    await act(async () => {
      if (!search) throw new Error('Expected the Media Library search input.');
      setInputValue(search, 'shots');
    });
    await act(async () => wait(180));
    await act(async () => {
      container
        .querySelector<HTMLElement>('article')
        ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    await act(async () => wait(180));

    const breadcrumb = container.querySelector<HTMLElement>('nav[aria-label="Breadcrumb"]');
    expect(breadcrumb?.textContent).toContain('Footage');
    expect(breadcrumb?.textContent).toContain('sequences');
    expect(breadcrumb?.textContent).toContain('shots');
    expect(
      [...(breadcrumb?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map(
        (button) => button.textContent,
      ),
    ).toEqual(['Libraries', 'Footage', 'sequences', 'shots']);

    await act(async () => root.unmount());
  });

  it('imports and confirms trash removal only in the Asset Library', async () => {
    const asset: GlobalAssetItem = {
      id: 'asset-library:asset123',
      owner: 'asset-library',
      label: 'hero.png',
      kind: 'asset',
      mediaType: 'image',
      availability: 'available',
    };
    const runtime = createRuntime(asset);
    runtime.searchAssets = vi.fn(async () => ({ revision: 4, items: [asset] }));
    runtime.importAssets = vi.fn(async () => ({
      status: 'completed' as const,
      revision: 4,
      outcomes: [{ status: 'added' as const, label: 'hero.png', assetId: asset.id }],
    }));
    const confirmAction = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale="en"
          defaultViewMode="list"
          confirmAction={confirmAction}
        />,
      );
    });
    await act(async () => wait(180));
    const assetCatalog = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Asset Library',
    );
    await act(async () => assetCatalog?.click());
    await act(async () => wait(180));

    const importButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Import assets'),
    );
    await act(async () => importButton?.click());
    await act(async () => wait(180));
    expect(runtime.importAssets).toHaveBeenCalledWith(4);

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Move asset to trash: hero.png"]',
    );
    await act(async () => removeButton?.click());
    await act(async () => wait(0));
    expect(confirmAction).toHaveBeenCalledWith('Move "hero.png" to the system trash?');
    expect(runtime.removeAsset).toHaveBeenCalledWith(asset.id, 4);
    expect(runtime.removeMediaLibrary).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('keeps Asset mutations pending until the refreshed projection is committed', async () => {
    const asset: GlobalAssetItem = {
      id: 'asset-library:asset123',
      owner: 'asset-library',
      label: 'hero.png',
      kind: 'asset',
      mediaType: 'image',
      availability: 'available',
    };
    const refreshed = deferred<GlobalAssetProjection>();
    const runtime = createRuntime(asset);
    runtime.searchAssets = vi
      .fn()
      .mockResolvedValueOnce({ revision: 4, items: [asset] })
      .mockImplementationOnce(() => refreshed.promise);
    runtime.importAssets = vi.fn(async () => ({
      status: 'completed' as const,
      revision: 5,
      outcomes: [{ status: 'added' as const, label: 'hero.png', assetId: asset.id }],
    }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale="en"
          defaultViewMode="list"
          confirmAction={() => true}
        />,
      );
    });
    await act(async () => wait(180));
    const assetCatalog = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Asset Library',
    );
    await act(async () => assetCatalog?.click());
    await act(async () => wait(180));

    const importButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Import assets'),
    );
    await act(async () => {
      importButton?.click();
      await wait(0);
    });
    expect(importButton?.disabled).toBe(true);
    expect(container.textContent).not.toContain('Asset import finished.');

    await act(async () => {
      refreshed.resolve({ revision: 5, items: [asset] });
      await wait(0);
    });
    expect(importButton?.disabled).toBe(false);
    expect(container.textContent).toContain('Asset import finished.');

    await act(async () => root.unmount());
  });

  it('ignores late hover results and keeps unsupported content on its typed icon', async () => {
    vi.useFakeTimers();
    const hover = deferred<{
      readonly dataUrl: string;
      readonly descriptorId: string;
      readonly expectedCatalogRevision: number;
      readonly itemId: string;
      readonly owner: 'media-library';
      readonly thumbnailRevision: string;
      readonly variant: 'hover';
    }>();
    const item: GlobalMediaLibraryItem = {
      ...createLibrary(),
      id: 'media-library:file123',
      label: 'frame.png',
      kind: 'file',
      relativePath: 'frame.png',
      mediaType: 'image',
      thumbnail: {
        descriptorId: 'media-library:thumb123',
        revision: 'revision:50',
        mediaType: 'image',
      },
    };
    const runtime = createRuntime(item);
    runtime.resolveThumbnail = vi.fn(async (request) => {
      if (request.variant === 'hover') return hover.promise;
      return { ...request, dataUrl: 'data:image/png;base64,AA==' };
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale="en"
          defaultViewMode="grid"
          confirmAction={() => true}
        />,
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(160));
    const entry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      entry?.focus();
      await vi.advanceTimersByTimeAsync(190);
      entry?.blur();
      hover.resolve({
        owner: 'media-library',
        itemId: item.id,
        expectedCatalogRevision: 0,
        descriptorId: item.thumbnail?.descriptorId ?? '',
        thumbnailRevision: item.thumbnail?.revision ?? '',
        variant: 'hover',
        dataUrl: 'data:image/png;base64,LATE',
      });
      await Promise.resolve();
    });
    expect(container.querySelector('.global-library-browser__hover-preview')).toBeNull();

    await act(async () => root.unmount());

    const unsupported: GlobalMediaLibraryItem = {
      ...createLibrary(),
      id: 'media-library:audio123',
      label: 'theme.wav',
      kind: 'file',
      relativePath: 'theme.wav',
      mediaType: 'audio',
    };
    const unsupportedRuntime = createRuntime(unsupported);
    const unsupportedRoot = createRoot(container);
    await act(async () => {
      unsupportedRoot.render(
        <GlobalLibraryBrowserRoot
          runtime={unsupportedRuntime}
          locale="zh-cn"
          defaultViewMode="grid"
          confirmAction={() => true}
        />,
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(400));
    container.querySelector<HTMLElement>('article')?.focus();
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(unsupportedRuntime.resolveThumbnail).not.toHaveBeenCalled();
    expect(container.querySelector('select[aria-label="排序"]')).not.toBeNull();
    expect(container.querySelector('.global-library-browser__thumbnail svg')).not.toBeNull();

    await act(async () => unsupportedRoot.unmount());
  });
});

function createLibrary(): GlobalMediaLibraryItem {
  return {
    id: 'media-library:root123',
    owner: 'media-library',
    libraryId: 'media-library:local:Footage',
    libraryLabel: 'Footage',
    label: 'Footage',
    kind: 'library',
    locationKind: 'local',
    relativePath: '',
    availability: 'available',
  };
}

function createRuntime(item: GlobalLibraryItem): GlobalLibraryBrowserRuntime {
  return {
    searchAssets: vi.fn(async () => ({
      revision: 0,
      items: item.owner === 'asset-library' ? [item] : [],
    })),
    searchMediaLibraries: vi.fn(async () => ({
      revision: 0,
      items: item.owner === 'media-library' ? [item] : [],
    })),
    readMediaLibraryChildren: vi.fn(async () => ({ revision: 0, items: [] })),
    resolveThumbnail: vi.fn(async (request) => ({
      ...request,
      dataUrl: 'data:image/png;base64,AA==',
    })),
    importAssets: vi.fn(async () => ({ status: 'cancelled' as const, revision: 0 })),
    removeAsset: vi.fn(async (assetId: string) => ({
      status: 'removed' as const,
      assetId,
      revision: 1,
    })),
    addMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const, revision: 0 })),
    relinkMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const, revision: 0 })),
    removeMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'removed' as const,
      libraryId,
      revision: 1,
    })),
    revealMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'revealed' as const,
      libraryId,
      revision: 0,
    })),
  };
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise is unavailable.');
      resolvePromise(value);
    },
  };
}
