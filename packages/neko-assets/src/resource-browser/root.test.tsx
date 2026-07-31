// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_LOCATOR_DRAG_MIME } from '@neko/shared';
import {
  RESOURCE_BROWSER_CONTRACT_VERSION,
  type ResourceBrowserHostRuntime,
  type ResourceBrowserProjection,
} from './contract';
import { ResourceBrowserRoot } from './root';

const projection: ResourceBrowserProjection = {
  schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
  identity: {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'resource-view-1',
    viewEpoch: 1,
    endpointEpoch: 'endpoint-1',
  },
  revision: 0,
  facet: 'media',
  query: '',
  items: [
    {
      resourceId: 'content:cat',
      facet: 'media',
      role: 'content',
      depth: 0,
      kind: 'image',
      label: 'cat.png',
      locator: { kind: 'workspace-file', path: 'assets/cat.png' },
      thumbnail: {
        descriptorId: 'thumbnail-cat',
        revision: '1',
        mediaType: 'image',
      },
      capabilities: ['preview', 'reveal', 'add-to-canvas'],
    },
  ],
};

describe('ResourceBrowserRoot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a previewable item on single click without a persistent action footer', async () => {
    const runtime = createRuntime();
    render(
      <ResourceBrowserRoot
        runtime={runtime}
        locale="en"
        previewTarget={{
          viewId: 'preview:project-view-1:temporary',
          presentation: 'temporary',
          expectedWorkbenchRevision: 2,
        }}
      />,
    );

    expect(await screen.findByText('cat.png')).toBeTruthy();
    await waitFor(() =>
      expect(
        document.querySelector<HTMLImageElement>('.neko-resource-browser__kind img')?.src,
      ).toBe('data:image/png;base64,aW1hZ2U='),
    );
    fireEvent.click(screen.getByText('cat.png'));
    await waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
    expect(runtime.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        route: 'preview',
        resourceId: 'content:cat',
        targetPreview: {
          viewId: 'preview:project-view-1:temporary',
          presentation: 'temporary',
          expectedWorkbenchRevision: 2,
        },
      }),
    );
    expect(document.querySelector('.neko-resource-browser__actions')).toBeNull();
  });

  it('opens a package-owned quick preview on hover and releases it on leave', async () => {
    const runtime = createRuntime();
    const renderQuickPreview = vi.fn((descriptor) => (
      <div data-testid="quick-preview">{descriptor.displayName}</div>
    ));
    render(
      <ResourceBrowserRoot runtime={runtime} locale="en" renderQuickPreview={renderQuickPreview} />,
    );

    const row = (await screen.findByText('cat.png')).closest('.neko-resource-browser__item-row');
    expect(row).toBeTruthy();
    fireEvent.pointerEnter(row!);

    await waitFor(() => expect(runtime.resolveQuickPreview).toHaveBeenCalledOnce());
    expect((await screen.findByTestId('quick-preview')).textContent).toBe('preview.png');

    fireEvent.pointerLeave(row!);
    await waitFor(() =>
      expect(runtime.releaseQuickPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'quick-preview.release',
          previewSessionId: 'hover:content:cat',
        }),
      ),
    );
    expect(screen.queryByTestId('quick-preview')).toBeNull();
  });

  it('releases a stale quick preview result that resolves after pointer leave', async () => {
    const runtime = createRuntime();
    let resolvePreview: (() => void) | undefined;
    runtime.resolveQuickPreview.mockImplementation((request) =>
      new Promise<void>((resolve) => {
        resolvePreview = resolve;
      }).then(() => ({
        schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
        requestId: request.requestId,
        identity: request.identity,
        resourceId: request.resourceId,
        previewSessionId: `stale:${request.resourceId}`,
        descriptor: {
          descriptorId: `descriptor:${request.resourceId}`,
          revision: 'revision-1',
          contentKind: 'image' as const,
          mediaType: 'image/png',
          displayName: 'stale.png',
          byteLength: 128,
        },
      })),
    );
    render(
      <ResourceBrowserRoot
        runtime={runtime}
        locale="en"
        renderQuickPreview={(descriptor) => (
          <div data-testid="quick-preview">{descriptor.displayName}</div>
        )}
      />,
    );

    const row = (await screen.findByText('cat.png')).closest('.neko-resource-browser__item-row');
    expect(row).toBeTruthy();
    fireEvent.pointerEnter(row!);
    await waitFor(() => expect(runtime.resolveQuickPreview).toHaveBeenCalledOnce());
    fireEvent.pointerLeave(row!);

    await act(async () => {
      resolvePreview?.();
    });
    await waitFor(() =>
      expect(runtime.releaseQuickPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'quick-preview.release',
          previewSessionId: 'stale:content:cat',
        }),
      ),
    );
    expect(screen.queryByTestId('quick-preview')).toBeNull();
  });

  it('drags a portable ContentLocator without exposing an absolute path', async () => {
    const runtime = createRuntime();
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);
    const row = (await screen.findByText('cat.png')).closest('button');
    expect(row).toBeTruthy();
    const transferred = new Map<string, string>();

    fireEvent.dragStart(row!, {
      dataTransfer: {
        effectAllowed: 'none',
        setData: (type: string, value: string) => transferred.set(type, value),
      },
    });

    const payload = transferred.get(CONTENT_LOCATOR_DRAG_MIME);
    expect(payload).toBeDefined();
    expect(transferred.get('application/json')).toBe(payload);
    expect(JSON.parse(payload!)).toEqual({
      schemaVersion: 1,
      type: 'content-locator',
      locator: { kind: 'workspace-file', path: 'assets/cat.png' },
      name: 'cat.png',
    });
    expect(payload).not.toContain('/private/');
    expect(payload).not.toContain('file://');
  });

  it('opens an OTIO item through the explicit Cut route on single click', async () => {
    const runtime = createRuntime({
      ...projection,
      items: [
        {
          resourceId: 'content:cut',
          facet: 'media',
          role: 'content',
          depth: 0,
          kind: 'file',
          label: 'story.otio',
          locator: { kind: 'workspace-file', path: 'cuts/story.otio' },
          capabilities: ['open-cut', 'reveal'],
        },
      ],
    });
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    fireEvent.click(await screen.findByText('story.otio'));

    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'cut.open',
          resourceId: 'content:cut',
        }),
      ),
    );
  });

  it('does not expose persistent Cut or Canvas action buttons', async () => {
    const videoProjection: ResourceBrowserProjection = {
      ...projection,
      items: [
        {
          resourceId: 'content:clip',
          facet: 'media',
          role: 'content',
          depth: 0,
          kind: 'video',
          label: 'clip.mp4',
          locator: { kind: 'workspace-file', path: 'media/clip.mp4' },
          capabilities: ['preview', 'reveal', 'add-to-cut'],
        },
      ],
    };
    const runtime = createRuntime(videoProjection);
    render(
      <ResourceBrowserRoot
        runtime={runtime}
        locale="en"
        previewTarget={{
          viewId: 'preview:project-view-1:temporary',
          presentation: 'temporary',
          expectedWorkbenchRevision: 5,
        }}
      />,
    );

    fireEvent.click(await screen.findByText('clip.mp4'));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'preview',
          resourceId: 'content:clip',
        }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Add to Cut' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to Canvas' })).toBeNull();
  });

  it('changes facets through the injected runtime instead of owning catalog state', async () => {
    const runtime = createRuntime();
    render(<ResourceBrowserRoot runtime={runtime} locale="zh-cn" />);

    await screen.findByText('cat.png');
    expect(screen.queryByRole('tab', { name: '全部' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '实体' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '素材' }));
    await waitFor(() =>
      expect(runtime.search).toHaveBeenCalledWith(
        expect.objectContaining({ facet: 'materials', route: 'search' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '配置媒体库' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '关联全局媒体库' }));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({ route: 'source.link-global-library' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '配置媒体库' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '将目录添加为媒体库' }));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({ route: 'source.add-directory-library' }),
      ),
    );
  });

  it('switches a concrete facet between list and grid without changing source state', async () => {
    const filesProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-all-view-mode',
        workspaceId: 'workspace-all-view-mode',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:directory',
          facet: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'characters',
          locator: { kind: 'workspace-file', path: 'characters' },
          capabilities: ['reveal'],
        },
      ],
    };
    const runtime = createRuntime(filesProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    expect(await screen.findByText('characters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('grid');
    expect(runtime.search).not.toHaveBeenCalled();
  });

  it('uses the Desktop default view only when no project-scoped view has been saved', async () => {
    const defaultProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-desktop-default-grid',
        workspaceId: 'workspace-desktop-default-grid',
      },
    };
    const runtime = createRuntime(defaultProjection);
    const first = render(
      <ResourceBrowserRoot runtime={runtime} locale="en" defaultViewMode="grid" />,
    );
    await screen.findByText('cat.png');
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('grid');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('list');
    first.unmount();

    render(<ResourceBrowserRoot runtime={runtime} locale="en" defaultViewMode="grid" />);
    await screen.findByText('cat.png');
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('list');
  });

  it('restores the project-scoped query after the Resource Dock remounts', async () => {
    const queryProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-query-state',
        workspaceId: 'workspace-query-state',
      },
    };
    const runtime = createRuntime(queryProjection);
    const first = render(<ResourceBrowserRoot runtime={runtime} locale="en" />);
    const search = await screen.findByRole('textbox', { name: 'Search' });
    fireEvent.change(search, { target: { value: 'nested-image' } });
    fireEvent.submit(search.closest('form')!);
    await waitFor(() => expect(runtime.search).toHaveBeenCalledOnce());
    first.unmount();

    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    expect(
      (await screen.findByRole('textbox', {
        name: 'Search',
      })) as HTMLInputElement,
    ).toHaveProperty('value', 'nested-image');
  });

  it('expands Directory list branches in place and reserves container navigation for grid view', async () => {
    const directoryProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-directory-tree-grid',
        workspaceId: 'workspace-directory-tree-grid',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:characters',
          facet: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'characters',
          locator: { kind: 'workspace-file', path: 'characters' },
          capabilities: ['reveal'],
        },
        {
          resourceId: 'content:worlds',
          facet: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'worlds',
          locator: { kind: 'workspace-file', path: 'worlds' },
          capabilities: ['reveal'],
        },
        {
          resourceId: 'content:hero',
          parentResourceId: 'content:characters',
          facet: 'files',
          role: 'content',
          depth: 1,
          kind: 'image',
          label: 'hero.png',
          locator: { kind: 'workspace-file', path: 'characters/hero.png' },
          capabilities: ['preview', 'reveal'],
        },
      ],
    };
    const runtime = createRuntime(directoryProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    expect(await screen.findByText('characters')).toBeTruthy();
    expect(screen.queryByText('hero.png')).toBeNull();
    fireEvent.click(screen.getByText('characters'));
    expect(screen.getByText('characters')).toBeTruthy();
    expect(await screen.findByText('hero.png')).toBeTruthy();
    expect(screen.getByRole('tree')).toBeTruthy();
    expect(
      screen.getByRole('treeitem', { name: /characters/i }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByRole('treeitem', { name: /hero\.png/i }).getAttribute('aria-level')).toBe(
      '2',
    );
    expect(
      screen.getAllByRole('treeitem').map((item) => item.textContent?.replace(/\s+/g, '')),
    ).toEqual([
      expect.stringContaining('characters'),
      expect.stringContaining('hero.png'),
      expect.stringContaining('worlds'),
    ]);
    expect(runtime.children).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'children',
        facet: 'files',
        parentResourceId: 'content:characters',
      }),
    );
    fireEvent.click(screen.getByText('characters'));
    expect(screen.queryByText('hero.png')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(await screen.findByText('characters')).toBeTruthy();
    fireEvent.click(screen.getByText('characters'));
    expect(await screen.findByText('hero.png')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Resource location' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
    expect(await screen.findByText('characters')).toBeTruthy();
    expect(screen.queryByText('hero.png')).toBeNull();
    expect(runtime.search).not.toHaveBeenCalled();
  });

  it('presents Directory tree rows as compact single-line resources without placeholder metadata', async () => {
    const longLabel = 'render-timeline87752a1a-6f4e-4d12-9ce8-preview.mp4';
    const directoryProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-directory-compact-tree',
        workspaceId: 'workspace-directory-compact-tree',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:analysis-pages',
          facet: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'analysis_pages',
          description: '.',
          locator: { kind: 'workspace-file', path: 'analysis_pages' },
          capabilities: ['reveal'],
        },
        {
          resourceId: 'content:preview-video',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'video',
          label: longLabel,
          description: '.',
          locator: { kind: 'workspace-file', path: longLabel },
          capabilities: ['preview', 'reveal'],
        },
        {
          resourceId: 'content:project-notes',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'document',
          label: '项目说明.md',
          description: '.',
          locator: { kind: 'workspace-file', path: '项目说明.md' },
          capabilities: ['preview', 'reveal'],
        },
      ],
    };
    render(<ResourceBrowserRoot runtime={createRuntime(directoryProjection)} locale="zh-cn" />);

    const directoryRow = await screen.findByRole('treeitem', { name: 'analysis_pages' });
    const videoRow = screen.getByRole('treeitem', { name: longLabel });
    const documentRow = screen.getByRole('treeitem', { name: '项目说明.md' });

    expect(directoryRow.textContent).toBe('analysis_pages');
    expect(videoRow.textContent).toBe(longLabel);
    expect(documentRow.textContent).toBe('项目说明.md');
    expect(document.querySelector('.neko-resource-browser__item small')).toBeNull();
    expect(videoRow.getAttribute('data-tree-item')).toBe('true');
    expect(
      videoRow.querySelector('.neko-resource-browser__disclosure.is-placeholder'),
    ).toBeTruthy();
    expect(videoRow.querySelector('.neko-resource-browser__kind svg')).toBeTruthy();
    expect(videoRow.querySelector('strong')?.getAttribute('title')).toBe(longLabel);
  });

  it('supports nested keyboard expansion, branch collapse and file activation in Directory tree view', async () => {
    const directoryProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-directory-nested',
        workspaceId: 'workspace-directory-nested',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:characters',
          facet: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'characters',
          locator: { kind: 'workspace-file', path: 'characters' },
          capabilities: ['reveal'],
        },
        {
          resourceId: 'content:portraits',
          parentResourceId: 'content:characters',
          facet: 'files',
          role: 'directory',
          depth: 1,
          kind: 'directory',
          label: 'portraits',
          locator: { kind: 'workspace-file', path: 'characters/portraits' },
          capabilities: ['reveal'],
        },
        {
          resourceId: 'content:hero',
          parentResourceId: 'content:portraits',
          facet: 'files',
          role: 'content',
          depth: 2,
          kind: 'image',
          label: 'hero.png',
          locator: {
            kind: 'workspace-file',
            path: 'characters/portraits/hero.png',
          },
          capabilities: ['preview', 'reveal'],
        },
      ],
    };
    const runtime = createRuntime(directoryProjection);
    render(
      <ResourceBrowserRoot
        runtime={runtime}
        locale="en"
        previewTarget={{
          viewId: 'preview:directory-tree',
          presentation: 'temporary',
          expectedWorkbenchRevision: 4,
        }}
      />,
    );

    fireEvent.click(await screen.findByText('characters'));
    const portraits = await screen.findByRole('treeitem', {
      name: /portraits/i,
    });
    expect(screen.queryByText('hero.png')).toBeNull();
    fireEvent.keyDown(portraits, { key: 'ArrowRight' });
    expect(
      (await screen.findByRole('treeitem', { name: /hero\.png/i })).getAttribute('aria-level'),
    ).toBe('3');

    fireEvent.click(screen.getByText('hero.png'));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'preview',
          resourceId: 'content:hero',
        }),
      ),
    );

    fireEvent.keyDown(screen.getByRole('treeitem', { name: /characters/i }), { key: 'ArrowLeft' });
    expect(screen.queryByText('portraits')).toBeNull();
    expect(screen.queryByText('hero.png')).toBeNull();
  });

  it('keeps media library management on the selected library row', async () => {
    const libraryProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'media',
      items: [
        {
          resourceId: 'content:library',
          facet: 'media',
          role: 'library-root',
          libraryName: 'Footage',
          depth: 0,
          kind: 'directory',
          label: 'Footage',
          locator: { kind: 'workspace-file', path: 'neko/assets/Footage' },
          capabilities: ['reveal'],
        },
      ],
    };
    const runtime = createRuntime(libraryProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    expect(await screen.findByText('Footage')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Relink media library' }));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'source.relink',
          resourceId: 'content:library',
          expectedRevision: 0,
        }),
      ),
    );
    expect(document.querySelector('.neko-resource-browser__actions')).toBeNull();
  });

  it('resolves media thumbnails only when their row enters the visible range', async () => {
    let notify: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = (entries) => callback(entries, this as unknown as IntersectionObserver);
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
        readonly root = null;
        readonly rootMargin = '160px 0px';
        readonly thresholds = [0];
      },
    );
    const runtime = createRuntime();
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    expect(await screen.findByText('cat.png')).toBeTruthy();
    expect(runtime.resolveThumbnail).not.toHaveBeenCalled();
    notify?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    await waitFor(() => expect(runtime.resolveThumbnail).toHaveBeenCalledTimes(1));
  });

  it('ignores a completed thumbnail when its descriptor revision was replaced', async () => {
    let notify: ((entries: IntersectionObserverEntry[]) => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = (entries) => callback(entries, this as unknown as IntersectionObserver);
        }
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
        readonly root = null;
        readonly rootMargin = '160px 0px';
        readonly thresholds = [0];
      },
    );
    let resolveOld:
      | ((value: Awaited<ReturnType<ResourceBrowserHostRuntime['resolveThumbnail']>>) => void)
      | undefined;
    const oldResult = new Promise<
      Awaited<ReturnType<ResourceBrowserHostRuntime['resolveThumbnail']>>
    >((resolve) => {
      resolveOld = resolve;
    });
    const firstRuntime = createRuntime();
    firstRuntime.resolveThumbnail.mockImplementationOnce(() => oldResult);
    const { rerender } = render(<ResourceBrowserRoot runtime={firstRuntime} locale="en" />);

    expect(await screen.findByText('cat.png')).toBeTruthy();
    notify?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    await waitFor(() => expect(firstRuntime.resolveThumbnail).toHaveBeenCalledTimes(1));

    const nextProjection: ResourceBrowserProjection = {
      ...projection,
      revision: 1,
      items: projection.items.map((item) => ({
        ...item,
        thumbnail: item.thumbnail ? { ...item.thumbnail, revision: '2' } : undefined,
      })),
    };
    const nextRuntime = createRuntime(nextProjection);
    nextRuntime.resolveThumbnail.mockResolvedValue({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: 'thumbnail-new',
      identity: nextProjection.identity,
      resourceId: 'content:cat',
      descriptorId: 'thumbnail-cat',
      revision: '2',
      dataUrl: 'data:image/png;base64,bmV3',
    });
    rerender(<ResourceBrowserRoot runtime={nextRuntime} locale="en" />);
    await screen.findByText('cat.png');
    notify?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    await waitFor(() =>
      expect(
        document.querySelector<HTMLImageElement>('.neko-resource-browser__kind img')?.src,
      ).toBe('data:image/png;base64,bmV3'),
    );

    resolveOld?.({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: 'thumbnail-old',
      identity: projection.identity,
      resourceId: 'content:cat',
      descriptorId: 'thumbnail-cat',
      revision: '1',
      dataUrl: 'data:image/png;base64,b2xk',
    });
    await Promise.resolve();
    expect(document.querySelector<HTMLImageElement>('.neko-resource-browser__kind img')?.src).toBe(
      'data:image/png;base64,bmV3',
    );
  });

  it('keeps main Canvas open available when the bounded side slot is unavailable', async () => {
    const canvasProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-canvas-open',
        workspaceId: 'workspace-canvas-open',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:board',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'document',
          label: 'board.nkc',
          locator: { kind: 'workspace-file', path: 'neko/boards/board.nkc' },
          capabilities: ['preview', 'reveal'],
        },
      ],
    };
    const runtime = createRuntime(canvasProjection);
    const onOpenCanvas = vi.fn();
    render(<ResourceBrowserRoot runtime={runtime} locale="en" onOpenCanvas={onOpenCanvas} />);

    fireEvent.click(await screen.findByText('board.nkc'));
    expect(onOpenCanvas).toHaveBeenCalledWith(canvasProjection.items[0], 'main');
    expect(screen.queryByRole('button', { name: 'Open Canvas' })).toBeNull();
    expect(onOpenCanvas).toHaveBeenCalledTimes(1);
  });

  it('dispatches one Canvas open when the user double-clicks a document', async () => {
    const canvasProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-canvas-double-click',
        workspaceId: 'workspace-canvas-double-click',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:board',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'document',
          label: 'board.nkc',
          locator: { kind: 'workspace-file', path: 'neko/boards/board.nkc' },
          capabilities: ['preview', 'reveal'],
        },
      ],
    };
    const runtime = createRuntime(canvasProjection);
    const onOpenCanvas = vi.fn();
    render(<ResourceBrowserRoot runtime={runtime} locale="en" onOpenCanvas={onOpenCanvas} />);

    const canvasDocument = await screen.findByText('board.nkc');
    fireEvent.click(canvasDocument, { detail: 1 });
    fireEvent.click(canvasDocument, { detail: 2 });

    expect(onOpenCanvas).toHaveBeenCalledTimes(1);
  });
});

function createRuntime(snapshot = projection): ResourceBrowserHostRuntime & {
  readonly children: ReturnType<typeof vi.fn>;
  readonly search: ReturnType<typeof vi.fn>;
  readonly execute: ReturnType<typeof vi.fn>;
  readonly resolveThumbnail: ReturnType<typeof vi.fn>;
  readonly resolveQuickPreview: ReturnType<typeof vi.fn>;
  readonly releaseQuickPreview: ReturnType<typeof vi.fn>;
} {
  return {
    identity: snapshot.identity,
    getSnapshot: vi.fn(async () => snapshot),
    resolveThumbnail: vi.fn(async (request) => ({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      descriptorId: request.descriptorId,
      revision: request.revision,
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
    })),
    resolveQuickPreview: vi.fn(async (request) => ({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      previewSessionId: `hover:${request.resourceId}`,
      descriptor: {
        descriptorId: `descriptor:${request.resourceId}`,
        revision: 'revision-1',
        contentKind: 'image' as const,
        mediaType: 'image/png',
        displayName: 'preview.png',
        byteLength: 128,
      },
    })),
    releaseQuickPreview: vi.fn(async (request) => ({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: request.requestId,
      identity: request.identity,
      previewSessionId: request.previewSessionId,
      status: 'released' as const,
    })),
    subscribe: vi.fn(() => () => undefined),
    children: vi.fn(async () => snapshot),
    search: vi.fn(async (request) => ({
      ...snapshot,
      revision: snapshot.revision + 1,
      facet: request.facet,
      query: request.query,
      items: [],
    })),
    execute: vi.fn(async () => snapshot),
  };
}
