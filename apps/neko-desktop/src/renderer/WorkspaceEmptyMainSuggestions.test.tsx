// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  createCanvasWorkspaceContextCatalog,
  createCanvasWorkspaceContextCatalogOption,
  createCanvasWorkspaceTarget,
  createDefaultCanvasWorkspaceTarget,
  type CanvasWorkspaceContextCatalog,
} from '@neko/canvas-domain';
import { createDesktopI18n } from './i18n';
import {
  WorkspaceEmptyMainSuggestions,
  projectWorkspaceMainSuggestions,
  type WorkspaceMainSuggestion,
} from './WorkspaceEmptyMainSuggestions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('WorkspaceEmptyMainSuggestions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('shows the default Canvas immediately and adds indexed Canvases from this Workspace', async () => {
    const onOpen = vi.fn(async () => undefined);
    await renderSuggestions({
      workspaceId: 'workspace-1',
      loadWorkspaceCanvases: async () =>
        canvasCatalog('workspace-1', [canvasOption('workspace-1', 'boards/story.nkc')]),
      onOpen,
    });

    expect(screen.getByRole('button', { name: 'Open workspace.nkc' })).toBeTruthy();
    await act(async () => Promise.resolve());
    expect(screen.getByRole('button', { name: 'Open story.nkc' })).toBeTruthy();
    expect(screen.getAllByText('workspace.nkc')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open story.nkc' }));
    await act(async () => Promise.resolve());
    expect(onOpen).toHaveBeenCalledWith({
      kind: 'canvas-document',
      canvasId: 'boards/story.nkc',
      label: 'story.nkc',
    });
  });

  it('replaces suggestions when the exact Workspace changes', async () => {
    const firstLoader = vi.fn(async () =>
      canvasCatalog('workspace-1', [canvasOption('workspace-1', 'one.nkc')]),
    );
    const secondLoader = vi.fn(async () =>
      canvasCatalog('workspace-2', [canvasOption('workspace-2', 'two.nkc')]),
    );
    await renderSuggestions({
      workspaceId: 'workspace-1',
      loadWorkspaceCanvases: firstLoader,
      onOpen: vi.fn(async () => undefined),
    });
    await act(async () => Promise.resolve());
    expect(screen.getByRole('button', { name: 'Open one.nkc' })).toBeTruthy();

    await renderSuggestions({
      workspaceId: 'workspace-2',
      loadWorkspaceCanvases: secondLoader,
      onOpen: vi.fn(async () => undefined),
    });
    await act(async () => Promise.resolve());
    expect(screen.queryByRole('button', { name: 'Open one.nkc' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open two.nkc' })).toBeTruthy();
    expect(firstLoader).toHaveBeenCalledTimes(1);
    expect(secondLoader).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-workspace-suggestions="workspace-2"]')).not.toBeNull();
  });

  it('keeps an invalid Canvas visible and disabled with its diagnostic', async () => {
    await renderSuggestions({
      workspaceId: 'workspace-1',
      loadWorkspaceCanvases: async () =>
        canvasCatalog('workspace-1', [
          createCanvasWorkspaceContextCatalogOption({
            target: createCanvasWorkspaceTarget('workspace-1', 'broken.nkc'),
            label: 'broken.nkc',
            disabled: true,
            diagnostic: 'Canvas bytes are invalid.',
          }),
        ]),
      onOpen: vi.fn(async () => undefined),
    });
    await act(async () => Promise.resolve());
    const button = screen.getByRole('button', { name: 'Open broken.nkc' });
    if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a Canvas button.');
    expect(button.disabled).toBe(true);
    expect(screen.getByText('Canvas bytes are invalid.')).toBeTruthy();
  });

  it('keeps a Workspace-local load failure visible while preserving the default Canvas', async () => {
    await renderSuggestions({
      workspaceId: 'workspace-1',
      loadWorkspaceCanvases: async () => {
        throw new Error('Workspace Canvas index is unavailable.');
      },
      onOpen: vi.fn(async () => undefined),
    });
    await act(async () => Promise.resolve());
    expect(screen.getByRole('alert').textContent).toContain(
      'Workspace Canvas index is unavailable.',
    );
    expect(screen.getByRole('button', { name: 'Open workspace.nkc' })).toBeTruthy();
  });

  async function renderSuggestions(input: {
    readonly workspaceId: string;
    readonly loadWorkspaceCanvases: () => Promise<CanvasWorkspaceContextCatalog>;
    readonly onOpen: (suggestion: WorkspaceMainSuggestion) => Promise<void>;
  }): Promise<void> {
    const i18n = createDesktopI18n('en');
    await act(async () => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <WorkspaceEmptyMainSuggestions
            createControl={<button type="button">Create content</button>}
            loadWorkspaceCanvases={input.loadWorkspaceCanvases}
            onOpen={input.onOpen}
            workspaceId={input.workspaceId}
          />
        </I18nProvider>,
      );
    });
  }
});

describe('projectWorkspaceMainSuggestions', () => {
  it('rejects an option from another Workspace instead of mixing suggestions', () => {
    expect(() =>
      projectWorkspaceMainSuggestions({
        ...canvasCatalog('workspace-1', []),
        options: [canvasOption('workspace-2', 'two.nkc')],
      }),
    ).toThrow('belongs to another Workspace');
  });
});

function canvasCatalog(
  workspaceId: string,
  options: CanvasWorkspaceContextCatalog['options'],
): CanvasWorkspaceContextCatalog {
  return createCanvasWorkspaceContextCatalog({
    workspaceId,
    options: [
      createCanvasWorkspaceContextCatalogOption({
        target: createDefaultCanvasWorkspaceTarget(workspaceId),
        label: 'workspace.nkc',
      }),
      ...options,
    ],
  });
}

function canvasOption(workspaceId: string, canvasId: string) {
  return createCanvasWorkspaceContextCatalogOption({
    target: createCanvasWorkspaceTarget(workspaceId, canvasId),
    label: canvasId.split('/').at(-1) ?? canvasId,
  });
}
