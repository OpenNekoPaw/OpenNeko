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
} from '@neko/assets-domain/global-library/contract';
import { AssetCenterController } from '@neko/assets-domain/asset-center/controller';
import { AssetCenterSession } from '@neko/assets-domain/asset-center/session';
import { AssetManagementRoot } from './root';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});

describe('AssetManagementRoot', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('keeps its controller active across React StrictMode effect replay', async () => {
    vi.useFakeTimers();
    const library = createLibrary();
    const runtime = createRuntime(library);
    const dispose = vi.spyOn(runtime.management, 'dispose');
    const releaseSubscription = vi.fn();
    const subscribe = runtime.management.subscribe.bind(runtime.management);
    vi.spyOn(runtime.management, 'subscribe').mockImplementation((listener) => {
      const release = subscribe(listener);
      return () => {
        releaseSubscription();
        release();
      };
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <AssetManagementRoot
            runtime={runtime.management}
            locale="en"
            confirmAction={() => true}
          />
        </StrictMode>,
      );
    });
    const connectButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Connect directory'),
    );
    expect(container.querySelector('[data-catalog-status="loading"]')).not.toBeNull();
    expect(connectButton?.disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(160));

    expect(runtime.source.searchMediaLibraries).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-catalog-status="ready"]')).not.toBeNull();
    expect(connectButton?.disabled).toBe(false);
    expect(container.textContent).toContain('Footage');
    expect(
      container.querySelector('.global-library-browser__header-copy .section-label')?.textContent,
    ).toBe('Global catalog');
    expect(container.querySelector('.global-library-browser__header-copy h1')?.textContent).toBe(
      'Media Library',
    );
    expect(
      container.querySelector('.global-library-browser__header-copy p:not(.section-label)')
        ?.textContent,
    ).toBe('Manage reusable media connections without copying source files into every project.');
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.includes('Connect directory'))
        ?.querySelector('svg')
        ?.getAttribute('width'),
    ).toBe('14');
    expect(
      container
        .querySelector('input[aria-label="Search media libraries"]')
        ?.closest('label')
        ?.querySelector('svg')
        ?.getAttribute('width'),
    ).toBe('16');
    expect(
      container.querySelector('button[aria-label="List view"] svg')?.getAttribute('width'),
    ).toBe('14');
    expect(container.querySelector('button[aria-label="Refresh"] svg')?.getAttribute('width')).toBe(
      '14',
    );
    expect(container.textContent).not.toContain('Global Library controller is disposed.');
    expect(dispose).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(releaseSubscription).toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('shares list/grid state and opens directories only through activation', async () => {
    const library = createLibrary();
    const runtime = createRuntime(library);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
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
    expect(runtime.management.getSnapshot().filter.viewMode).toBe('list');

    const entry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      entry?.click();
      await wait(0);
    });
    expect(runtime.source.readMediaLibraryChildren).not.toHaveBeenCalled();

    await act(async () => {
      entry?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    });
    await act(async () => wait(180));
    expect(runtime.source.readMediaLibraryChildren).toHaveBeenCalledWith(
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
        sourceFingerprint: '2026-07-31T00:00:00.000Z:50',
        mediaType: 'image',
      },
    };
    const runtime = createRuntime(item);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(160));
    expect(runtime.source.resolveThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: item.id, variant: 'icon' }),
    );

    const entry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      entry?.focus();
      await vi.advanceTimersByTimeAsync(100);
      entry?.blur();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(runtime.source.resolveThumbnail).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'hover' }),
    );
    expect(container.querySelector('.global-library-browser__hover-preview')).toBeNull();

    await act(async () => {
      entry?.focus();
      await vi.advanceTimersByTimeAsync(190);
    });
    expect(runtime.source.resolveThumbnail).toHaveBeenCalledWith(
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
    runtime.source.readMediaLibraryChildren = vi
      .fn()
      .mockResolvedValueOnce({ items: [directory] })
      .mockResolvedValue({ items: [] });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
      );
    });
    await act(async () => wait(180));

    const libraryEntry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      libraryEntry?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    await act(async () => wait(180));
    expect(runtime.source.readMediaLibraryChildren).toHaveBeenLastCalledWith(
      expect.objectContaining({ libraryId: library.libraryId, relativePath: '' }),
    );

    const nestedEntry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      nestedEntry?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    await act(async () => wait(180));
    expect(runtime.source.readMediaLibraryChildren).toHaveBeenLastCalledWith(
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
    expect(runtime.source.searchMediaLibraries).toHaveBeenCalledTimes(2);

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
    runtime.source.searchMediaLibraries = vi
      .fn()
      .mockResolvedValueOnce({ items: [library] })
      .mockResolvedValueOnce({ items: [searchDirectory] });
    runtime.source.readMediaLibraryChildren = vi.fn(async () => ({ items: [] }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
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

  it('imports and confirms record-only removal in the Asset Library', async () => {
    const asset: GlobalAssetItem = {
      id: 'global-asset-library:asset123',
      owner: 'global-asset-library',
      label: 'hero.png',
      kind: 'asset',
      mediaType: 'image',
      availability: 'available',
    };
    const runtime = createRuntime(asset);
    runtime.source.searchAssets = vi.fn(async () => ({ items: [asset] }));
    runtime.source.importAssets = vi.fn(async () => ({
      status: 'completed' as const,
      outcomes: [{ status: 'added' as const, label: 'hero.png', assetId: asset.id }],
    }));
    const confirmAction = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot
          runtime={runtime.management}
          locale="en"
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
    expect(runtime.source.importAssets).toHaveBeenCalledWith();

    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Asset Library record: hero.png"]',
    );
    await act(async () => removeButton?.click());
    await act(async () => wait(0));
    expect(confirmAction).toHaveBeenCalledWith(
      'Remove "hero.png" from the Asset Library? The source file will be preserved.',
    );
    expect(runtime.source.removeAsset).toHaveBeenCalledWith(asset.id);
    expect(runtime.source.removeMediaLibrary).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('keeps Asset mutations pending until the refreshed projection is committed', async () => {
    const asset: GlobalAssetItem = {
      id: 'global-asset-library:asset123',
      owner: 'global-asset-library',
      label: 'hero.png',
      kind: 'asset',
      mediaType: 'image',
      availability: 'available',
    };
    const refreshed = deferred<GlobalAssetProjection>();
    const runtime = createRuntime(asset);
    runtime.source.searchAssets = vi
      .fn()
      .mockResolvedValueOnce({ items: [asset] })
      .mockImplementationOnce(() => refreshed.promise);
    runtime.source.importAssets = vi.fn(async () => ({
      status: 'completed' as const,
      outcomes: [{ status: 'added' as const, label: 'hero.png', assetId: asset.id }],
    }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
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
      refreshed.resolve({ items: [asset] });
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
      readonly itemId: string;
      readonly owner: 'media-library';
      readonly sourceFingerprint: string;
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
        sourceFingerprint: 'fingerprint:50',
        mediaType: 'image',
      },
    };
    const runtime = createRuntime(item);
    runtime.source.resolveThumbnail = vi.fn(async (request) => {
      if (request.variant === 'hover') return hover.promise;
      return { ...request, dataUrl: 'data:image/png;base64,AA==' };
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
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
        descriptorId: item.thumbnail?.descriptorId ?? '',
        sourceFingerprint: item.thumbnail?.sourceFingerprint ?? '',
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
        <AssetManagementRoot
          runtime={unsupportedRuntime.management}
          locale="zh-cn"
          confirmAction={() => true}
        />,
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(400));
    container.querySelector<HTMLElement>('article')?.focus();
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(unsupportedRuntime.source.resolveThumbnail).not.toHaveBeenCalled();
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

function createRuntime(item: GlobalLibraryItem): {
  readonly management: AssetCenterController;
  readonly source: GlobalLibraryBrowserRuntime;
} {
  const source: GlobalLibraryBrowserRuntime = {
    searchAssets: vi.fn(async () => ({
      items: item.owner === 'global-asset-library' ? [item] : [],
    })),
    searchMediaLibraries: vi.fn(async () => ({
      items: item.owner === 'media-library' ? [item] : [],
    })),
    readMediaLibraryChildren: vi.fn(async () => ({ items: [] })),
    resolveThumbnail: vi.fn(async (request) => ({
      ...request,
      dataUrl: 'data:image/png;base64,AA==',
    })),
    importAssets: vi.fn(async () => ({ status: 'cancelled' as const })),
    removeAsset: vi.fn(async (assetId: string) => ({
      status: 'removed' as const,
      assetId,
    })),
    addMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const })),
    relinkMediaLibrary: vi.fn(async () => ({ status: 'cancelled' as const })),
    removeMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'removed' as const,
      libraryId,
    })),
    revealMediaLibrary: vi.fn(async (libraryId: string) => ({
      status: 'revealed' as const,
      libraryId,
    })),
  };
  const session = new AssetCenterSession({
    assetCenterSessionId: 'asset-center:window-1',
    windowId: 'window-1',
  });
  return {
    source,
    management: new AssetCenterController(session, source, {
      resolve: async ({ itemId }) => ({
        kind: 'workspace-file',
        path:
          item.owner === 'media-library' && item.kind === 'file'
            ? item.relativePath
            : `${itemId.replaceAll(':', '-')}.bin`,
      }),
    }),
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
