// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_LOCATOR_DRAG_MIME } from '@neko/content';
import {
  ResourceBrowserOperationRejectedError,
  type ResourceBrowserHostRuntime,
  type ResourceBrowserProjectionEvent,
  type ResourceBrowserProjection,
} from '@neko/assets-domain/resource-browser/contract';
import { ResourceBrowserRoot } from './root';
import { ResourceBrowserPresentationSnapshotProvider } from './presentation-snapshot-context';
import { createResourceBrowserPresentationSnapshotStore } from './presentation-snapshot';

const projection: ResourceBrowserProjection = {
  identity: {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    windowId: 'window-1',
    viewId: 'resource-view-1',
    viewInstanceId: 'view-instance-1',
    rendererSessionId: 'endpoint-1',
  },
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
        sourceFingerprint: '1',
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

  it('defaults Workspace resources to list view', async () => {
    render(<ResourceBrowserRoot runtime={createRuntime()} locale="en" />);

    await screen.findByText('cat.png');
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('list');
  }, 15_000);

  it('does not create a presentation snapshot for the default reconstructable page', async () => {
    const defaultProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'files',
      items: [],
    };
    const store = createResourceBrowserPresentationSnapshotStore();
    render(
      <ResourceBrowserPresentationSnapshotProvider store={store}>
        <ResourceBrowserRoot runtime={createRuntime(defaultProjection)} locale="en" />
      </ResourceBrowserPresentationSnapshotProvider>,
    );

    await screen.findByText('No matching resources');
    await waitFor(() => expect(store.read(defaultProjection.identity)).toBeUndefined());
  });

  it('contains invalid runtime data inside the Resource Browser surface', async () => {
    const runtime: ResourceBrowserHostRuntime = {
      ...createRuntime(),
      getSnapshot: vi.fn(async () => {
        throw new Error('Resource snapshot is invalid.');
      }),
    };

    render(
      <>
        <div>Canvas remains available</div>
        <ResourceBrowserRoot runtime={runtime} locale="en" />
      </>,
    );

    expect(await screen.findByText('Resource Browser unavailable')).toBeTruthy();
    expect(screen.getByText('Resource snapshot is invalid.')).toBeTruthy();
    expect(screen.getByText('Canvas remains available')).toBeTruthy();
  });

  it('keeps resources visible when Main View capacity rejects an open and clears the alert after retry', async () => {
    const filesProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'files',
      items: [
        {
          resourceId: 'content:ninth',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'file',
          label: 'ninth.md',
          locator: { kind: 'workspace-file', path: 'ninth.md' },
          capabilities: ['edit-text'],
        },
      ],
    };
    const runtime = createRuntime(filesProjection);
    runtime.execute
      .mockRejectedValueOnce(
        new ResourceBrowserOperationRejectedError({
          code: 'main-view-capacity-reached',
          maximum: 8,
        }),
      )
      .mockResolvedValueOnce(filesProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="zh-cn" />);

    fireEvent.click(await screen.findByText('ninth.md'));
    expect(
      await screen.findByText('最多可打开 8 个主视图。请先关闭一个，再打开此资源。'),
    ).toBeTruthy();
    expect(screen.getByText('ninth.md')).toBeTruthy();
    expect(screen.queryByText('资源库不可用')).toBeNull();

    fireEvent.click(screen.getByText('ninth.md'));
    await waitFor(() =>
      expect(screen.queryByText('最多可打开 8 个主视图。请先关闭一个，再打开此资源。')).toBeNull(),
    );
    expect(screen.getByText('ninth.md')).toBeTruthy();
    expect(runtime.execute).toHaveBeenCalledTimes(2);
  });

  it('shows an Entity record diagnostic without hiding valid siblings', async () => {
    const entityProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'entities',
      diagnostics: [
        {
          code: 'invalid-project-entity-document',
          message: "Project Entity 'character-invalid' is invalid.",
          recordId: 'character-invalid',
        },
      ],
      items: [
        {
          resourceId: 'entity:character-rin',
          facet: 'entities',
          role: 'entity',
          depth: 0,
          kind: 'character',
          label: 'Rin',
          entityRef: { entityId: 'character-rin', entityKind: 'character' },
          entityStatus: 'confirmed',
          sourceOwners: ['project-entity'],
          attentionBindingIds: [],
          representationAvailability: 'unbound',
          inspector: {
            status: 'confirmed',
            kind: 'character',
            names: { canonical: 'Rin', aliases: [] },
            facts: {},
            entityId: 'character-rin',
            bindings: [],
            operations: ['edit'],
            blockers: [],
          },
          capabilities: [],
        },
      ],
    };

    render(<ResourceBrowserRoot runtime={createRuntime(entityProjection)} locale="en" />);

    expect(await screen.findByText('Rin')).toBeTruthy();
    expect(screen.getByText("Project Entity 'character-invalid' is invalid.")).toBeTruthy();
    expect(screen.queryByText('Resource Browser unavailable')).toBeNull();
  });

  it('routes Files context actions and never offers generic deletion for Media content', async () => {
    const filesProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-file-context',
        workspaceId: 'workspace-file-context',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:notes',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'file',
          label: 'notes.txt',
          locator: { kind: 'workspace-file', path: 'notes.txt' },
          capabilities: ['reveal'],
        },
      ],
    };
    const runtime = createRuntime(filesProjection);
    const view = render(<ResourceBrowserRoot runtime={runtime} locale="en" />);
    await screen.findByText('notes.txt');
    const items = document.querySelector('.neko-resource-browser__items');
    expect(items).toBeTruthy();

    vi.stubGlobal('innerWidth', 120);
    vi.stubGlobal('innerHeight', 120);
    fireEvent.contextMenu(items!);
    expect((await screen.findByRole('menu')).style).toMatchObject({ left: '4px', top: '4px' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New folder' }));
    const entryInput = screen.getByRole('textbox', { name: 'File or folder name' });
    fireEvent.change(entryInput, {
      target: { value: 'References' },
    });
    fireEvent.submit(entryInput.closest('form')!);
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'workspace-entry.create-directory',
          entryName: 'References',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'File or folder name' })).toBeNull(),
    );

    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    const fileButton = screen.getByText('notes.txt').closest('button');
    expect(fileButton).toBeTruthy();
    fireEvent.keyDown(fileButton!, { key: 'F10', shiftKey: true });
    expect(screen.queryByRole('menuitem', { name: 'New file' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(fileButton));
    fireEvent.keyDown(fileButton!, { key: 'ContextMenu' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to Trash' }));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'content.trash',
          resourceId: 'content:notes',
        }),
      ),
    );
    view.unmount();

    render(<ResourceBrowserRoot runtime={createRuntime()} locale="en" />);
    const mediaButton = (await screen.findByText('cat.png')).closest('button');
    expect(mediaButton).toBeTruthy();
    fireEvent.contextMenu(mediaButton!);
    expect(screen.queryByRole('menuitem', { name: 'Move to Trash' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Reveal' })).toBeTruthy();
  }, 15_000);

  it('cancels and resets inline entry naming with Escape', async () => {
    const runtime = createRuntime({
      ...projection,
      facet: 'files',
      items: [],
    });
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    await screen.findByText('No matching resources');
    const items = document.querySelector('.neko-resource-browser__items');
    if (!items) throw new Error('Resource Browser item surface is required.');
    fireEvent.contextMenu(items);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New folder' }));
    const entryInput = screen.getByRole('textbox', { name: 'File or folder name' });
    fireEvent.change(entryInput, {
      target: { value: 'Must not leak' },
    });
    fireEvent.keyDown(entryInput, { key: 'Escape' });

    fireEvent.contextMenu(items);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New folder' }));
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: 'File or folder name' }).value,
    ).toBe('');
  });

  it('omits duplicate package chrome when embedded while keeping toolbar actions', async () => {
    const runtime = createRuntime();
    render(<ResourceBrowserRoot runtime={runtime} locale="en" chrome="embedded" />);

    await screen.findByText('cat.png');
    expect(screen.queryByText('Resource management')).toBeNull();
    expect(screen.getByRole('button', { name: 'Configure media libraries' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(document.querySelector('.neko-resource-browser__toolbar')).toBeTruthy();
    expect(document.querySelector('.neko-resource-browser__header')).toBeNull();
  });

  it('does not expose a normal refresh control when composed by Workspace', async () => {
    render(<ResourceBrowserRoot runtime={createRuntime()} locale="en" chrome="embedded" />);

    await screen.findByText('cat.png');
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Configure media libraries' })).toBeTruthy();
  });

  it('exposes all four Files creation kinds through one discoverable add menu', async () => {
    const filesProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'files',
      items: [],
    };
    const runtime = createRuntime(filesProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    await screen.findByText('No matching resources');
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText('Create in Workspace')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'New file' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'New folder' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'New Canvas' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Cut' }));
    const input = screen.getByRole('textbox', { name: 'File or folder name' });
    expect(input).toHaveProperty('value', '');
    expect(screen.getByText('.otio').tagName).toBe('SPAN');
    fireEvent.change(input, { target: { value: 'Rough Cut' } });
    expect(input).toHaveProperty('value', 'Rough Cut');
    expect(screen.getByText('.otio')).toBeTruthy();
    fireEvent.submit(input.closest('form')!);

    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'creative-document.create',
          documentKind: 'cut',
          entryName: 'Rough Cut.otio',
        }),
      ),
    );
  });

  it('keeps toolbar, directory-menu, and blank-area creation targets exact', async () => {
    const directoryId = 'content:references';
    const fileId = 'content:references-notes';
    const filesProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'files',
      items: [
        {
          resourceId: directoryId,
          facet: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'References',
          locator: { kind: 'workspace-file', path: 'References' },
          capabilities: [],
        },
        {
          resourceId: fileId,
          parentResourceId: directoryId,
          facet: 'files',
          role: 'content',
          depth: 1,
          kind: 'file',
          label: 'notes.txt',
          locator: { kind: 'workspace-file', path: 'References/notes.txt' },
          capabilities: [],
        },
      ],
    };
    const runtime = createRuntime(filesProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    const directoryButton = (await screen.findByText('References')).closest('button');
    if (!directoryButton) throw new Error('Directory button is required.');
    fireEvent.click(directoryButton);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText('Create in References')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'New file' }));
    const directoryInput = screen.getByRole('textbox', { name: 'File or folder name' });
    expect(directoryButton.closest('.neko-resource-browser__item-row')?.nextElementSibling).toBe(
      directoryInput.closest('form'),
    );
    fireEvent.change(directoryInput, { target: { value: 'sources.md' } });
    fireEvent.submit(directoryInput.closest('form')!);
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          route: 'workspace-entry.create-file',
          resourceId: directoryId,
          entryName: 'sources.md',
        }),
      ),
    );

    const fileButton = screen.getByText('notes.txt').closest('button');
    if (!fileButton) throw new Error('File button is required.');
    fireEvent.click(fileButton);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder' }));
    const fileInput = screen.getByRole('textbox', { name: 'File or folder name' });
    expect(fileButton.closest('.neko-resource-browser__item-row')?.nextElementSibling).toBe(
      fileInput.closest('form'),
    );
    fireEvent.change(fileInput, { target: { value: 'Drafts' } });
    fireEvent.submit(fileInput.closest('form')!);
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          route: 'workspace-entry.create-directory',
          resourceId: fileId,
          entryName: 'Drafts',
        }),
      ),
    );

    fireEvent.contextMenu(directoryButton);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New Canvas' }));
    const contextInput = screen.getByRole('textbox', { name: 'File or folder name' });
    expect(screen.getByText('.nkc')).toBeTruthy();
    fireEvent.change(contextInput, { target: { value: 'Board' } });
    fireEvent.submit(contextInput.closest('form')!);
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenLastCalledWith(
        expect.objectContaining({
          route: 'creative-document.create',
          documentKind: 'canvas',
          resourceId: directoryId,
          entryName: 'Board.nkc',
        }),
      ),
    );

    const items = document.querySelector('.neko-resource-browser__items');
    if (!items) throw new Error('Resource Browser item surface is required.');
    fireEvent.contextMenu(items);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New Cut' }));
    const rootInput = screen.getByRole('textbox', { name: 'File or folder name' });
    expect(items.firstElementChild).toBe(rootInput.closest('form'));
    fireEvent.change(rootInput, { target: { value: 'Rough Cut' } });
    fireEvent.submit(rootInput.closest('form')!);
    await waitFor(() => {
      const request = runtime.execute.mock.calls.at(-1)?.[0];
      expect(request).toMatchObject({
        route: 'creative-document.create',
        documentKind: 'cut',
        entryName: 'Rough Cut.otio',
      });
      expect(request).not.toHaveProperty('resourceId');
    });
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
        },
      }),
    );
    expect(document.querySelector('.neko-resource-browser__actions')).toBeNull();
  });

  it('opens admitted text in the editor by default and Preview only from the explicit menu', async () => {
    const textProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'files',
      items: [
        {
          resourceId: 'content:story',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'document',
          label: 'story.fountain',
          locator: { kind: 'workspace-file', path: 'story.fountain' },
          capabilities: ['edit-text', 'preview', 'reveal'],
        },
      ],
    };
    const runtime = createRuntime(textProjection);
    render(
      <ResourceBrowserRoot
        runtime={runtime}
        locale="en"
        previewTarget={{ viewId: 'preview-1', presentation: 'temporary' }}
      />,
    );

    const item = await screen.findByRole('treeitem', { name: 'story.fountain' });
    fireEvent.click(item, { detail: 1 });
    await waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(1));
    expect(runtime.execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ route: 'text.edit', resourceId: 'content:story' }),
    );

    fireEvent.keyDown(item, { key: 'F10', shiftKey: true });
    const preview = await screen.findByRole('menuitem', { name: 'Preview' });
    fireEvent.click(preview);
    await waitFor(() => expect(runtime.execute).toHaveBeenCalledTimes(2));
    expect(runtime.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        route: 'preview',
        resourceId: 'content:story',
        targetPreview: { viewId: 'preview-1', presentation: 'temporary' },
      }),
    );
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

  it('releases the high-cost quick preview when its current Root is suspended', async () => {
    const runtime = createRuntime();
    const view = render(
      <ResourceBrowserRoot
        lifecyclePresentation="active"
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
    await screen.findByTestId('quick-preview');

    view.rerender(
      <ResourceBrowserRoot
        lifecyclePresentation="suspended"
        runtime={runtime}
        locale="en"
        renderQuickPreview={(descriptor) => (
          <div data-testid="quick-preview">{descriptor.displayName}</div>
        )}
      />,
    );

    await waitFor(() => expect(screen.queryByTestId('quick-preview')).toBeNull());
    expect(runtime.releaseQuickPreview).toHaveBeenCalledWith(
      expect.objectContaining({ previewSessionId: 'hover:content:cat' }),
    );
  });

  it('releases a stale quick preview result that resolves after pointer leave', async () => {
    const runtime = createRuntime();
    let resolvePreview: (() => void) | undefined;
    runtime.resolveQuickPreview.mockImplementation((request) =>
      new Promise<void>((resolve) => {
        resolvePreview = resolve;
      }).then(() => ({
        requestId: request.requestId,
        identity: request.identity,
        resourceId: request.resourceId,
        previewSessionId: `stale:${request.resourceId}`,
        descriptor: {
          descriptorId: `descriptor:${request.resourceId}`,
          sourceFingerprint: 'fingerprint-1',
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
          capabilities: ['open-creative-document', 'reveal'],
        },
      ],
    });
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    fireEvent.click(await screen.findByText('story.otio'));

    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'creative-document.open',
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
    expect(screen.getByRole('tab', { name: '目录' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '媒体库' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '素材库' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '实体' }));
    await waitFor(() =>
      expect(runtime.search).toHaveBeenCalledWith(
        expect.objectContaining({ facet: 'entities', route: 'search' }),
      ),
    );
    expect(screen.queryByRole('button', { name: '配置媒体库' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '媒体库' }));
    await waitFor(() =>
      expect(runtime.search).toHaveBeenCalledWith(
        expect.objectContaining({ facet: 'media', route: 'search' }),
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

  it('preserves selection independently while switching owner facets', async () => {
    const filesProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-facet-selection',
        workspaceId: 'workspace-facet-selection',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:brief',
          facet: 'files',
          role: 'content',
          depth: 0,
          kind: 'file',
          label: 'brief.md',
          locator: { kind: 'workspace-file', path: 'brief.md' },
          capabilities: ['reveal'],
        },
      ],
    };
    const assetsProjection: ResourceBrowserProjection = {
      ...filesProjection,
      facet: 'assets',
      items: [
        {
          resourceId: 'asset:lighting',
          facet: 'assets',
          role: 'asset',
          depth: 0,
          kind: 'asset',
          label: 'Lighting preset',
          assetRef: { assetId: 'global-asset-library:lighting' },
          availability: 'available',
          capabilities: [],
        },
      ],
    };
    const runtime = createRuntime(filesProjection);
    runtime.search.mockImplementation(async (request) =>
      request.facet === 'assets' ? assetsProjection : filesProjection,
    );
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    const file = await screen.findByText('brief.md');
    fireEvent.click(file);
    fireEvent.click(screen.getByRole('tab', { name: 'Asset library' }));
    const asset = await screen.findByText('Lighting preset');
    expect(screen.queryByText('brief.md')).toBeNull();
    fireEvent.click(asset);
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    await waitFor(() =>
      expect(
        screen
          .getByText('brief.md')
          .closest('.neko-resource-browser__item-row')
          ?.getAttribute('data-selected'),
      ).toBe('true'),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Asset library' }));
    await waitFor(() =>
      expect(
        screen
          .getByText('Lighting preset')
          .closest('.neko-resource-browser__item-row')
          ?.getAttribute('data-selected'),
      ).toBe('true'),
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

  it('uses the Desktop default view only when the package owner has no Workspace snapshot', async () => {
    const defaultProjection: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-desktop-default-grid',
        workspaceId: 'workspace-desktop-default-grid',
      },
    };
    const runtime = createRuntime(defaultProjection);
    const view = render(
      <ResourceBrowserPresentationSnapshotProvider>
        <ResourceBrowserRoot runtime={runtime} locale="en" defaultViewMode="grid" />
      </ResourceBrowserPresentationSnapshotProvider>,
    );
    await screen.findByText('cat.png');
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('grid');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('list');
    view.rerender(
      <ResourceBrowserPresentationSnapshotProvider>
        {null}
      </ResourceBrowserPresentationSnapshotProvider>,
    );
    view.rerender(
      <ResourceBrowserPresentationSnapshotProvider>
        <ResourceBrowserRoot runtime={runtime} locale="en" defaultViewMode="grid" />
      </ResourceBrowserPresentationSnapshotProvider>,
    );
    await screen.findByText('cat.png');
    expect(
      document.querySelector('.neko-resource-browser__items')?.getAttribute('data-view-mode'),
    ).toBe('list');
  });

  it('returns a remounted Media facet to root when retained navigation has no loaded children', async () => {
    const mediaRoot: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-media-remount-root',
        workspaceId: 'workspace-media-remount-root',
      },
      items: [
        {
          resourceId: 'content:media-library-assets',
          facet: 'media',
          role: 'library-root',
          depth: 0,
          kind: 'directory',
          label: 'Assets',
          libraryName: 'Assets',
          locator: { kind: 'workspace-file', path: 'neko/assets/Assets' },
          capabilities: ['reveal'],
        },
      ],
    };
    const loaded = {
      ...mediaRoot,
      items: [
        ...mediaRoot.items,
        {
          resourceId: 'content:media-library-assets:portrait',
          parentResourceId: 'content:media-library-assets',
          facet: 'media' as const,
          role: 'content' as const,
          depth: 1,
          kind: 'image' as const,
          label: 'portrait.png',
          locator: { kind: 'workspace-file' as const, path: 'neko/assets/Assets/portrait.png' },
          capabilities: ['preview' as const],
        },
      ],
    };
    const firstRuntime = createRuntime(mediaRoot);
    firstRuntime.children.mockResolvedValueOnce(loaded);
    const first = render(
      <ResourceBrowserRoot runtime={firstRuntime} locale="en" defaultViewMode="grid" />,
    );

    fireEvent.doubleClick(await screen.findByText('Assets'));
    expect(await screen.findByText('portrait.png')).toBeTruthy();
    first.unmount();

    render(
      <ResourceBrowserRoot runtime={createRuntime(mediaRoot)} locale="en" defaultViewMode="grid" />,
    );

    await waitFor(() =>
      expect(document.querySelector('.neko-resource-browser__item strong')?.textContent).toBe(
        'Assets',
      ),
    );
  });

  it('returns to root and clears stale selection after a mutation refreshes a grid container', async () => {
    const filesRoot: ResourceBrowserProjection = {
      ...projection,
      identity: {
        ...projection.identity,
        projectId: 'project-files-mutation-root',
        workspaceId: 'workspace-files-mutation-root',
      },
      facet: 'files',
      items: [
        {
          resourceId: 'content:references',
          facet: 'files',
          role: 'directory',
          depth: 0,
          kind: 'directory',
          label: 'References',
          locator: { kind: 'workspace-file', path: 'References' },
          capabilities: ['reveal'],
        },
      ],
    };
    const loaded: ResourceBrowserProjection = {
      ...filesRoot,
      items: [
        ...filesRoot.items,
        {
          resourceId: 'content:references:notes',
          parentResourceId: 'content:references',
          facet: 'files',
          role: 'content',
          depth: 1,
          kind: 'file',
          label: 'notes.txt',
          locator: { kind: 'workspace-file', path: 'References/notes.txt' },
          capabilities: ['reveal'],
        },
      ],
    };
    const runtime = createRuntime(filesRoot);
    runtime.children.mockResolvedValueOnce(loaded);
    runtime.execute.mockResolvedValueOnce(filesRoot);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    render(<ResourceBrowserRoot runtime={runtime} locale="en" defaultViewMode="grid" />);

    fireEvent.doubleClick(await screen.findByText('References'));
    const notes = await screen.findByText('notes.txt');
    fireEvent.contextMenu(notes.closest('button')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to Trash' }));

    await waitFor(() => expect(screen.queryByText('notes.txt')).toBeNull());
    const references = await screen.findByText('References');
    expect(
      references.closest('.neko-resource-browser__item-row')?.getAttribute('data-selected'),
    ).toBe('false');
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
    const view = render(
      <ResourceBrowserPresentationSnapshotProvider>
        <ResourceBrowserRoot runtime={runtime} locale="en" />
      </ResourceBrowserPresentationSnapshotProvider>,
    );
    const search = await screen.findByRole('textbox', { name: 'Search' });
    fireEvent.change(search, { target: { value: 'nested-image' } });
    fireEvent.submit(search.closest('form')!);
    await waitFor(() => expect(runtime.search).toHaveBeenCalledOnce());
    view.rerender(
      <ResourceBrowserPresentationSnapshotProvider>
        {null}
      </ResourceBrowserPresentationSnapshotProvider>,
    );
    view.rerender(
      <ResourceBrowserPresentationSnapshotProvider>
        <ResourceBrowserRoot runtime={runtime} locale="en" />
      </ResourceBrowserPresentationSnapshotProvider>,
    );

    expect(
      (await screen.findByRole('textbox', {
        name: 'Search',
      })) as HTMLInputElement,
    ).toHaveProperty('value', 'nested-image');
    await waitFor(() => expect(runtime.search).toHaveBeenCalledTimes(2));
    expect(runtime.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        facet: 'media',
        query: 'nested-image',
        identity: queryProjection.identity,
      }),
    );
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
    const characters = screen.getByRole('treeitem', { name: /characters/i });
    const disclosure = characters.querySelector('.neko-resource-browser__disclosure');
    if (!disclosure) throw new Error('Directory disclosure is required.');
    fireEvent.click(disclosure);
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
    fireEvent.click(disclosure);
    expect(screen.queryByText('hero.png')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(await screen.findByText('characters')).toBeTruthy();
    fireEvent.doubleClick(screen.getByText('characters'));
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
        }}
      />,
    );

    fireEvent.doubleClick(await screen.findByText('characters'));
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
        }),
      ),
    );
    runtime.execute.mockClear();
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove media library' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(runtime.execute).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove media library' }));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'source.remove',
          resourceId: 'content:library',
        }),
      ),
    );
    expect(document.querySelector('.neko-resource-browser__actions')).toBeNull();
  });

  it('submits Entity edits through the canonical Resource Browser runtime', async () => {
    const entityProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'entities',
      items: [
        {
          resourceId: 'entity:character-rin',
          facet: 'entities',
          role: 'entity',
          depth: 0,
          kind: 'character',
          label: 'Rin',
          entityRef: { entityId: 'character-rin', entityKind: 'character' },
          entityStatus: 'confirmed',
          sourceOwners: ['project-entity'],
          attentionBindingIds: [],
          representationAvailability: 'unbound',
          inspector: {
            status: 'confirmed',
            kind: 'character',
            names: { canonical: 'Rin', aliases: [] },
            facts: {},
            entityId: 'character-rin',
            bindings: [],
            operations: ['edit'],
            blockers: [],
          },
          capabilities: [],
        },
      ],
    };
    const runtime = createRuntime(entityProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    fireEvent.click(await screen.findByText('Rin'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Rin Aoki' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'entity.manage',
          resourceId: 'entity:character-rin',
          entityIntent: {
            type: 'edit',
            entityId: 'character-rin',
            changes: { names: { canonical: 'Rin Aoki', aliases: [] } },
          },
        }),
      ),
    );
  });

  it('restores Entity drafts from presentation state without retaining hidden Inspector Roots', async () => {
    const entity = (
      resourceId: string,
      entityId: string,
      label: string,
    ): ResourceBrowserProjection['items'][number] => ({
      resourceId,
      facet: 'entities',
      role: 'entity',
      depth: 0,
      kind: 'character',
      label,
      entityRef: { entityId, entityKind: 'character' },
      entityStatus: 'confirmed',
      sourceOwners: ['project-entity'],
      attentionBindingIds: [],
      representationAvailability: 'unbound',
      inspector: {
        status: 'confirmed',
        kind: 'character',
        names: { canonical: label, aliases: [] },
        facts: {},
        entityId,
        bindings: [],
        operations: ['edit'],
        blockers: [],
      },
      capabilities: [],
    });
    const first = entity('entity:rin', 'rin', 'Rin');
    const second = entity('entity:mika', 'mika', 'Mika');
    const entityProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'entities',
      items: [first, second],
    };
    const runtime = createRuntime(entityProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    fireEvent.click((await screen.findByText('Rin')).closest('button')!);
    const firstDetail = document.querySelector<HTMLElement>('.neko-entity-inspector');
    expect(firstDetail).not.toBeNull();
    fireEvent.change(firstDetail!.querySelector<HTMLInputElement>('[aria-label="Name"]')!, {
      target: { value: 'Uncommitted Rin' },
    });

    fireEvent.click(screen.getByText('Mika').closest('button')!);
    const secondDetail = document.querySelector<HTMLElement>('.neko-entity-inspector');
    expect(secondDetail).not.toBe(firstDetail);
    expect(document.querySelectorAll('.neko-entity-inspector')).toHaveLength(1);
    fireEvent.click(screen.getByText('Rin').closest('button')!);
    expect(
      document.querySelector<HTMLInputElement>('.neko-entity-inspector [aria-label="Name"]')?.value,
    ).toBe('Uncommitted Rin');

    act(() => runtime.emit({ sequence: 1, projection: { ...entityProjection, items: [second] } }));
    await waitFor(() => expect(document.querySelector('.neko-entity-inspector')).toBeNull());
  });

  it('keeps missing library identity across list/grid and confirms revisioned recovery', async () => {
    const libraryProjection: ResourceBrowserProjection = {
      ...projection,
      facet: 'media',
      items: [
        {
          resourceId: 'content:missing-library',
          facet: 'media',
          role: 'library-root',
          libraryName: 'Footage',
          libraryStatus: {
            libraryName: 'Footage',
            state: 'required-unlinked',
            referenceCount: 2,
            missingCount: 2,
            operationFingerprint: 'sha256:operation',
          },
          depth: 0,
          kind: 'directory',
          label: 'Footage',
          locator: { kind: 'workspace-file', path: 'neko/assets/Footage' },
          capabilities: [],
        },
      ],
    };
    const runtime = createRuntime(libraryProjection);
    runtime.planRecovery.mockResolvedValueOnce({
      requestId: 'resource-recovery-plan-1',
      identity: libraryProjection.identity,
      resourceId: 'content:missing-library',
      status: 'planned',
      plan: {
        planId: 'media-library-recovery:plan-1',
        workspaceId: libraryProjection.identity.workspaceId,
        libraryName: 'Footage',
        requirementFingerprint: 'requirements-1',
        operationFingerprint: 'sha256:operation',
        candidate: { kind: 'global-alias', name: 'Footage', locationKind: 'local' },
        referencedCount: 2,
        validatedCount: 2,
      },
    });
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    fireEvent.click((await screen.findByText('Footage')).closest('button')!);
    expect(
      document.querySelector(
        '.neko-resource-browser__library-status[data-state="required-unlinked"]',
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(
      document.querySelector('.neko-resource-browser__item-row[data-selected="true"] strong')
        ?.textContent,
    ).toBe('Footage');
    fireEvent.click(screen.getByRole('button', { name: 'Recover media library' }));
    expect(await screen.findByRole('dialog', { name: 'Recover media library' })).toBeTruthy();
    expect(runtime.applyRecovery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm recovery' }));
    await waitFor(() =>
      expect(runtime.applyRecovery).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'source.recovery.apply',
          planId: 'media-library-recovery:plan-1',
          expectedOperationFingerprint: 'sha256:operation',
        }),
      ),
    );
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

  it('ignores a completed thumbnail when its source fingerprint was replaced', async () => {
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
      items: projection.items.map((item) => ({
        ...item,
        thumbnail: item.thumbnail ? { ...item.thumbnail, sourceFingerprint: '2' } : undefined,
      })),
    };
    const nextRuntime = createRuntime(nextProjection);
    nextRuntime.resolveThumbnail.mockResolvedValue({
      requestId: 'thumbnail-new',
      identity: nextProjection.identity,
      resourceId: 'content:cat',
      descriptorId: 'thumbnail-cat',
      sourceFingerprint: '2',
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
      requestId: 'thumbnail-old',
      identity: projection.identity,
      resourceId: 'content:cat',
      descriptorId: 'thumbnail-cat',
      sourceFingerprint: '1',
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
          capabilities: ['open-creative-document', 'preview', 'reveal'],
        },
      ],
    };
    const runtime = createRuntime(canvasProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    fireEvent.click(await screen.findByText('board.nkc'));
    await waitFor(() =>
      expect(runtime.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'creative-document.open',
          resourceId: 'content:board',
        }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Open Canvas' })).toBeNull();
    expect(runtime.execute).toHaveBeenCalledTimes(1);
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
          capabilities: ['open-creative-document', 'preview', 'reveal'],
        },
      ],
    };
    const runtime = createRuntime(canvasProjection);
    render(<ResourceBrowserRoot runtime={runtime} locale="en" />);

    const canvasDocument = await screen.findByText('board.nkc');
    fireEvent.click(canvasDocument, { detail: 1 });
    fireEvent.click(canvasDocument, { detail: 2 });

    expect(runtime.execute).toHaveBeenCalledTimes(1);
  });
});

function createRuntime(snapshot = projection): ResourceBrowserHostRuntime & {
  readonly children: ReturnType<typeof vi.fn>;
  readonly search: ReturnType<typeof vi.fn>;
  readonly execute: ReturnType<typeof vi.fn>;
  readonly resolveThumbnail: ReturnType<typeof vi.fn>;
  readonly resolveQuickPreview: ReturnType<typeof vi.fn>;
  readonly releaseQuickPreview: ReturnType<typeof vi.fn>;
  readonly planRecovery: ReturnType<typeof vi.fn>;
  readonly applyRecovery: ReturnType<typeof vi.fn>;
  readonly cancelRecovery: ReturnType<typeof vi.fn>;
  readonly emit: (event: ResourceBrowserProjectionEvent) => void;
} {
  let listener: ((event: ResourceBrowserProjectionEvent) => void) | undefined;
  return {
    identity: snapshot.identity,
    getSnapshot: vi.fn(async () => snapshot),
    resolveThumbnail: vi.fn(async (request) => ({
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      descriptorId: request.descriptorId,
      sourceFingerprint: request.sourceFingerprint,
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
    })),
    resolveQuickPreview: vi.fn(async (request) => ({
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      previewSessionId: `hover:${request.resourceId}`,
      descriptor: {
        descriptorId: `descriptor:${request.resourceId}`,
        sourceFingerprint: 'fingerprint-1',
        contentLocator: { kind: 'workspace-file' as const, path: 'preview/preview.png' },
        url: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
        contentKind: 'image' as const,
        mediaType: 'image/png',
        displayName: 'preview.png',
        byteLength: 128,
      },
    })),
    releaseQuickPreview: vi.fn(async (request) => ({
      requestId: request.requestId,
      identity: request.identity,
      previewSessionId: request.previewSessionId,
      status: 'released' as const,
    })),
    planRecovery: vi.fn(async (request) => ({
      requestId: request.requestId,
      identity: request.identity,
      resourceId: request.resourceId,
      status: 'cancelled' as const,
    })),
    applyRecovery: vi.fn(async () => snapshot),
    cancelRecovery: vi.fn(async (request) => ({
      requestId: request.requestId,
      identity: request.identity,
      planId: request.planId,
      status: 'cancelled' as const,
    })),
    subscribe: vi.fn((nextListener: (event: ResourceBrowserProjectionEvent) => void) => {
      listener = nextListener;
      return () => {
        if (listener === nextListener) listener = undefined;
      };
    }),
    emit(event) {
      if (!listener) throw new Error('Resource Browser test listener is unavailable.');
      listener(event);
    },
    children: vi.fn(async () => snapshot),
    search: vi.fn(async (request) => ({
      ...snapshot,
      facet: request.facet,
      query: request.query,
      items: [],
    })),
    execute: vi.fn(async () => snapshot),
  };
}
