// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { createDefaultAssetCenterFilter } from '@neko/assets-domain/asset-center/contract';
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

  it('keeps the populated collection unframed', () => {
    const globalLibraryStyles = readFileSync(resolve(import.meta.dirname, 'style.css'), 'utf8');
    const collectionRule = globalLibraryStyles.match(
      /\.global-library-browser__collection\s*\{(?<body>[^}]*)\}/u,
    )?.groups?.['body'];

    expect(collectionRule).toBeDefined();
    expect(collectionRule).not.toMatch(/\bborder(?:-[a-z]+)?\s*:/u);
    expect(collectionRule).toContain('outline: none');
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

  it('renders the shared fill empty state for a ready catalog without matching items', async () => {
    const runtime = createRuntime(createLibrary());
    runtime.source.searchMediaLibraries = vi.fn(async () => ({ items: [] }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
      );
    });
    await act(async () => wait(180));

    expect(container.querySelector('[data-catalog-status="ready"]')).not.toBeNull();
    const emptyState = container.querySelector('[data-neko-empty-state="fill"]');
    expect(emptyState?.textContent).toContain('No matching content');
    expect(emptyState?.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.global-library-browser__empty')).toBeNull();

    await act(async () => root.unmount());
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
    expect(collection?.dataset['viewMode']).toBe('list');
    expect(container.textContent).not.toContain('Browse');
    expect(container.textContent).not.toContain('Open folder');

    const gridButton = container.querySelector<HTMLButtonElement>('button[aria-label="Grid view"]');
    await act(async () => gridButton?.click());
    expect(collection?.dataset['viewMode']).toBe('grid');
    expect(runtime.management.getSnapshot().filter.viewMode).toBe('grid');

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

  it('loads icon thumbnails lazily without creating a second hover preview path', async () => {
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
      await vi.advanceTimersByTimeAsync(190);
    });
    expect(runtime.source.resolveThumbnail).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'hover' }),
    );
    expect(container.querySelector('.global-library-browser__hover-preview')).toBeNull();

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

    await act(async () => container.querySelector<HTMLElement>('article')?.click());
    const removeButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Remove selected records'),
    );
    await act(async () => removeButton?.click());
    await act(async () => wait(0));
    expect(confirmAction).toHaveBeenCalledWith(
      'Remove 1 selected records from the Asset Library? Source files will be preserved.',
    );
    expect(runtime.source.removeAssets).toHaveBeenCalledWith([asset.id]);
    expect(runtime.source.removeMediaLibrary).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('shows unavailable source fields and removes the membership without preview selection', async () => {
    const asset: GlobalAssetItem = {
      id: 'global-asset-library:missing',
      owner: 'global-asset-library',
      label: 'missing.png',
      description: 'missing/missing.png',
      kind: 'asset',
      mediaType: 'image',
      availability: 'unavailable',
      unavailable: {
        fieldNames: ['sourceRelativePath'],
        message: 'Asset source file is unavailable.',
      },
    };
    const runtime = createRuntime(asset);
    const select = vi.spyOn(runtime.management, 'select');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
      );
    });
    await act(async () => wait(180));

    expect(container.textContent).toContain(
      'sourceRelativePath: Asset source file is unavailable.',
    );
    await act(async () => container.querySelector<HTMLElement>('article')?.click());
    expect(select).not.toHaveBeenCalled();
    const removeButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Remove selected records'),
    );
    expect(removeButton?.disabled).toBe(false);
    await act(async () => removeButton?.click());
    await act(async () => wait(0));
    expect(runtime.source.removeAssets).toHaveBeenCalledWith([asset.id]);

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

  it('supports desktop multi-selection and delegates complete batch mutations', async () => {
    const assets = [assetItem('one'), assetItem('two'), assetItem('three')];
    const runtime = createRuntime(assets);
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
    await act(async () => findButton(container, 'Asset Library')?.click());
    await act(async () => wait(180));

    const entries = [...container.querySelectorAll<HTMLElement>('article')];
    await act(async () => entries[0]?.click());
    expect(entries[0]?.dataset['selected']).toBe('true');
    expect(runtime.management.getSnapshot().selection?.itemId).toBe(assets[0]?.id);

    await act(async () => {
      entries[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });
    expect(selectedItemIds(container)).toEqual([assets[0]?.id, assets[2]?.id]);
    expect(runtime.management.getSnapshot().selection?.itemId).toBe(assets[0]?.id);

    await act(async () => {
      entries[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    });
    expect(selectedItemIds(container)).toEqual([assets[1]?.id, assets[2]?.id]);

    const collection = requireCollection(container);
    await act(async () => {
      collection.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'a', ctrlKey: true }),
      );
    });
    expect(selectedItemIds(container)).toEqual(assets.map((item) => item.id));
    await act(async () => {
      collection.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(selectedItemIds(container)).toEqual([]);

    await act(async () => entries[0]?.click());
    await act(async () => {
      entries[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });
    await act(async () => findButton(container, 'Move to')?.click());
    await act(async () => wait(180));
    expect(runtime.source.moveItems).toHaveBeenCalledWith([assets[0]!.id, assets[1]!.id]);
    expect(selectedItemIds(container)).toEqual([]);

    const refreshedEntries = [...container.querySelectorAll<HTMLElement>('article')];
    await act(async () => refreshedEntries[0]?.click());
    await act(async () => {
      refreshedEntries[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });
    await act(async () => findButton(container, 'Remove selected records')?.click());
    await act(async () => wait(180));
    expect(confirmAction).toHaveBeenCalledWith(
      'Remove 2 selected records from the Asset Library? Source files will be preserved.',
    );
    expect(runtime.source.removeAssets).toHaveBeenCalledWith([assets[0]!.id, assets[1]!.id]);
    expect(selectedItemIds(container)).toEqual([]);

    await act(async () => root.unmount());
  });

  it('uses pointer capture for marquee and applies the right-click selection policy', async () => {
    const assets = [assetItem('one'), assetItem('two'), assetItem('three')];
    const runtime = createRuntime(assets);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AssetManagementRoot runtime={runtime.management} locale="en" confirmAction={() => true} />,
      );
    });
    await act(async () => wait(180));
    await act(async () => findButton(container, 'Asset Library')?.click());
    await act(async () => wait(180));

    const collection = requireCollection(container);
    const entries = [...container.querySelectorAll<HTMLElement>('article')];
    entries.forEach((entry, index) => {
      const left = index * 100 + 10;
      vi.spyOn(entry, 'getBoundingClientRect').mockReturnValue({
        x: left,
        y: 10,
        left,
        top: 10,
        right: left + 60,
        bottom: 70,
        width: 60,
        height: 60,
        toJSON: () => undefined,
      });
    });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(collection, {
      setPointerCapture,
      releasePointerCapture,
      hasPointerCapture: () => true,
    });

    await act(async () => {
      collection.dispatchEvent(
        pointerEvent('pointerdown', { pointerId: 7, clientX: 0, clientY: 0 }),
      );
      collection.dispatchEvent(
        pointerEvent('pointermove', { pointerId: 7, clientX: 80, clientY: 80 }),
      );
    });
    expect(container.querySelector('.global-library-browser__marquee')).not.toBeNull();
    expect(selectedItemIds(container)).toEqual([assets[0]?.id]);
    await act(async () => {
      collection.dispatchEvent(
        pointerEvent('pointerup', { pointerId: 7, clientX: 80, clientY: 80 }),
      );
    });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(container.querySelector('.global-library-browser__marquee')).toBeNull();

    await act(async () => {
      entries[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });
    await act(async () => {
      entries[0]?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
    });
    expect(selectedItemIds(container)).toEqual([assets[0]?.id, assets[1]?.id]);
    await act(async () => {
      entries[2]?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
      await wait(0);
    });
    expect(selectedItemIds(container)).toEqual([assets[2]?.id]);
    const moveMenuItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.includes('Move to'),
    );
    expect(moveMenuItem).not.toBeUndefined();
    await act(async () => moveMenuItem?.click());
    await act(async () => wait(180));
    expect(runtime.source.moveItems).toHaveBeenCalledWith([assets[2]!.id]);

    await act(async () => root.unmount());
  });

  it('keeps unsupported content on its typed icon without resolving hover media', async () => {
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
        sourceFingerprint: 'fingerprint:50',
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
    const entry = container.querySelector<HTMLElement>('article');
    await act(async () => {
      entry?.focus();
      await vi.advanceTimersByTimeAsync(190);
      entry?.blur();
      await Promise.resolve();
    });
    expect(runtime.source.resolveThumbnail).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'hover' }),
    );
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

function createRuntime(itemOrItems: GlobalLibraryItem | readonly GlobalLibraryItem[]): {
  readonly management: AssetCenterController;
  readonly source: GlobalLibraryBrowserRuntime;
} {
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
  const firstItem = items[0];
  if (!firstItem) throw new Error('Asset Center fixture requires one catalog item.');
  const source: GlobalLibraryBrowserRuntime = {
    searchAssets: vi.fn(async () => ({
      items: items.filter((item) => item.owner === 'global-asset-library'),
    })),
    searchMediaLibraries: vi.fn(async () => ({
      items: items.filter((item) => item.owner === 'media-library'),
    })),
    readMediaLibraryChildren: vi.fn(async () => ({ items: [] })),
    resolveThumbnail: vi.fn(async (request) => ({
      ...request,
      dataUrl: 'data:image/png;base64,AA==',
    })),
    importAssets: vi.fn(async () => ({ status: 'cancelled' as const })),
    removeAssets: vi.fn(async (assetIds: readonly string[]) => ({
      status: 'removed' as const,
      assetIds,
    })),
    moveItems: vi.fn(async (itemIds: readonly string[]) => ({
      status: 'moved' as const,
      itemIds,
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
  const session = new AssetCenterSession(
    {
      assetCenterSessionId: 'asset-center:window-1',
      windowId: 'window-1',
    },
    { ...createDefaultAssetCenterFilter(), catalog: firstItem.owner },
  );
  return {
    source,
    management: new AssetCenterController(session, source, {
      resolve: async ({ itemId }) => {
        const item = items.find((candidate) => candidate.id === itemId);
        if (!item) throw new Error(`Missing fixture item '${itemId}'.`);
        return {
          file: {
            authority: 'workspace',
            path:
              item.owner === 'media-library' && item.kind === 'file'
                ? item.relativePath
                : `${itemId.replaceAll(':', '-')}.bin`,
          },
        };
      },
    }),
  };
}

function assetItem(id: string): GlobalAssetItem {
  return {
    id: `global-asset-library:${id}`,
    owner: 'global-asset-library',
    label: `${id}.png`,
    kind: 'asset',
    mediaType: 'image',
    availability: 'available',
  };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(label),
  );
}

function requireCollection(container: HTMLElement): HTMLElement {
  const collection = container.querySelector<HTMLElement>('.global-library-browser__collection');
  if (!collection) throw new Error('Expected the Asset Center collection.');
  return collection;
}

function selectedItemIds(container: HTMLElement): readonly (string | undefined)[] {
  return [
    ...container.querySelectorAll<HTMLElement>('[data-library-item-id][data-selected="true"]'),
  ].map((entry) => entry.dataset['libraryItemId']);
}

function pointerEvent(
  type: string,
  input: { readonly pointerId: number; readonly clientX: number; readonly clientY: number },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: input.clientX,
    clientY: input.clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: input.pointerId });
  return event;
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
