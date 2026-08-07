// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  DesktopProjectCatalogSurface,
  filterAndSortProjectCatalog,
} from './DesktopProjectManagementSurface';
import { createDesktopI18n } from './i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Desktop Project Management surfaces', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps selection separate from the explicit Workspace open command', async () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const { container, root } = await renderWithI18n(
      <DesktopProjectCatalogSurface
        interactive
        onOpen={onOpen}
        onRemove={vi.fn()}
        onSelect={onSelect}
        projects={[project()]}
      />,
    );
    await act(async () => findButton(container, 'Demo').click());
    expect(onSelect).toHaveBeenCalledWith('project-1');
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => findButton(container, 'Open project: Demo').click());
    expect(onOpen).toHaveBeenCalledWith('project-1');
    await act(async () => root.unmount());
  });

  it('sorts the catalog deterministically without creating a Detail surface', () => {
    expect(
      filterAndSortProjectCatalog([project('b'), project('a')], '', 'name-ascending').map(
        (item) => item.displayName,
      ),
    ).toEqual(['a', 'b']);
  });

  it('renders an explicit empty catalog state', async () => {
    const markup = await renderWithI18n(
      <DesktopProjectCatalogSurface
        interactive
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        projects={[]}
      />,
    );

    expect(markup.container.textContent).toContain('No matching projects');
    const emptyState = markup.container.querySelector('[data-neko-empty-state="fill"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.className).toContain('col-span-full');
    expect(emptyState?.querySelector('svg')).not.toBeNull();
    expect(emptyState?.closest('.management-surface-list')?.getAttribute('data-empty')).toBe(
      'true',
    );
    expect(markup.container.querySelector('.management-surface-empty')).toBeNull();
    await act(async () => markup.root.unmount());
  });

  it('defaults to list mode and keeps unavailable Workspace fields visible and removable', async () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    const unavailable = {
      ...project(),
      unavailable: {
        fieldNames: ['currentLocator'],
        message: 'Workspace directory is unavailable.',
      },
    };
    const markup = await renderWithI18n(
      <DesktopProjectCatalogSurface
        interactive
        onOpen={onOpen}
        onRemove={onRemove}
        onSelect={vi.fn()}
        projects={[unavailable]}
      />,
    );

    expect(markup.container.querySelector('.management-surface-list')?.className).toContain(
      'is-list',
    );
    expect(markup.container.textContent).toContain(
      'currentLocator: Workspace directory is unavailable.',
    );
    expect(findButton(markup.container, 'Open project: Demo').disabled).toBe(true);
    await act(async () => findButton(markup.container, 'Remove Demo from recent projects').click());
    expect(onRemove).toHaveBeenCalledWith(unavailable);
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => markup.root.unmount());
  });

  it('reconstructs query, sort and view from defaults after the singleton scene unmounts', async () => {
    const first = await renderWithI18n(
      <DesktopProjectCatalogSurface
        interactive
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        projects={[project()]}
      />,
    );
    const search = first.container.querySelector<HTMLInputElement>('input');
    const sort = first.container.querySelector<HTMLSelectElement>('select');
    const viewButtons = first.container.querySelectorAll<HTMLButtonElement>(
      '.management-surface-toolbar button',
    );
    if (!search || !sort || !viewButtons[0]) {
      throw new Error('Project Management controls are unavailable.');
    }
    const gridButton = viewButtons[0];
    await act(async () => {
      search.value = 'missing';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      sort.value = 'name-ascending';
      sort.dispatchEvent(new Event('change', { bubbles: true }));
      gridButton.click();
    });
    expect(first.container.querySelector('.management-surface-list')?.className).toContain(
      'is-grid',
    );
    await act(async () => first.root.unmount());

    const restored = await renderWithI18n(
      <DesktopProjectCatalogSurface
        interactive
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        projects={[project()]}
      />,
    );
    expect(restored.container.querySelector<HTMLInputElement>('input')?.value).toBe('');
    expect(restored.container.querySelector<HTMLSelectElement>('select')?.value).toBe(
      'updated-descending',
    );
    expect(restored.container.querySelector('.management-surface-list')?.className).toContain(
      'is-list',
    );
    await act(async () => restored.root.unmount());
  });
});

async function renderWithI18n(node: JSX.Element) {
  const i18n = createDesktopI18n('en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<I18nProvider service={i18n.i18nService}>{node}</I18nProvider>);
  });
  return { container, root };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === label ||
      candidate.textContent?.trim() === label ||
      candidate.querySelector('strong')?.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Project Management fixture requires button '${label}'.`);
  return button;
}

function project(name = 'Demo') {
  return {
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    profile: 'content' as const,
    displayName: name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };
}
