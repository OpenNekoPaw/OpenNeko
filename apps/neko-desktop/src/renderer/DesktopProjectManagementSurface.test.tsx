// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  applyProjectSelection,
  DesktopProjectCatalogSurface,
  filterAndSortProjectCatalog,
  reconcileProjectSelection,
  selectAllProjectIds,
} from './DesktopProjectManagementSurface';
import { createDesktopI18n } from './i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Desktop Project Management surfaces', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('keeps folder authorization as an explicit Project Management action', async () => {
    const onOpenDirectory = vi.fn();
    const { container, root } = await renderWithI18n(
      <DesktopProjectCatalogSurface
        conversations={[]}
        interactive
        onDeleteConversations={vi.fn()}
        onOpen={vi.fn()}
        onOpenDirectory={onOpenDirectory}
        onRemove={vi.fn()}
        projects={[]}
      />,
    );

    await act(async () => findButton(container, 'Open folder').click());
    expect(onOpenDirectory).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('selects on click and opens the exact Workspace on double click without an open button', async () => {
    const onOpen = vi.fn();
    const { container, root } = await renderWithI18n(
      <DesktopProjectCatalogSurface
        conversations={[]}
        interactive
        onOpenDirectory={vi.fn()}
        onOpen={onOpen}
        onDeleteConversations={vi.fn()}
        onRemove={vi.fn()}
        projects={[project()]}
      />,
    );
    const projectButton = findButton(container, 'Demo');
    await act(async () => projectButton.click());
    expect(projectButton.getAttribute('aria-pressed')).toBe('true');
    expect(onOpen).not.toHaveBeenCalled();
    expect(container.querySelector('button[aria-label="Open project: Demo"]')).toBeNull();
    expect(container.querySelectorAll('.management-surface-row-actions button')).toHaveLength(2);
    await act(async () => {
      projectButton.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 }));
    });
    expect(onOpen).toHaveBeenCalledWith('project-1');
    expect(onOpen).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('supports range, modifier, filtered select-all, escape, and keyboard batch removal', async () => {
    const onRemove = vi.fn();
    const projects = [
      project('Alpha', 'project-alpha'),
      project('Beta', 'project-beta'),
      project('Gamma', 'project-gamma'),
    ];
    const markup = await renderWithI18n(
      <DesktopProjectCatalogSurface
        conversations={[]}
        interactive
        onOpenDirectory={vi.fn()}
        onOpen={vi.fn()}
        onDeleteConversations={vi.fn()}
        onRemove={onRemove}
        projects={projects}
      />,
    );
    const list = markup.container.querySelector<HTMLElement>('.management-surface-list');
    const alpha = findButton(markup.container, 'Alpha');
    const gamma = findButton(markup.container, 'Gamma');
    await act(async () => alpha.click());
    await act(async () =>
      gamma.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })),
    );
    expect(markup.container.textContent).toContain('3 selected');

    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(markup.container.textContent).not.toContain('selected');

    const search = markup.container.querySelector<HTMLInputElement>('input');
    if (!search) throw new Error('Project Management search is unavailable.');
    await act(async () => {
      setNativeInputValue(search, 'Beta');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', metaKey: true }));
    });
    expect(markup.container.textContent).toContain('1 selected');
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
    });
    expect(onRemove).toHaveBeenCalledWith([projects[1]]);
    await act(async () => markup.root.unmount());
  });

  it('applies deterministic selection updates and removes stale identities', () => {
    const projects = [
      project('Alpha', 'alpha'),
      project('Beta', 'beta'),
      project('Gamma', 'gamma'),
    ];
    const selected = applyProjectSelection({
      projectIds: projects.map((item) => item.projectId),
      selectedProjectIds: new Set(['alpha']),
      anchorId: 'alpha',
      projectId: 'gamma',
      toggle: true,
      range: true,
    });
    expect([...selected.selectedProjectIds]).toEqual(['alpha', 'beta', 'gamma']);
    expect([...selectAllProjectIds(projects.slice(1))]).toEqual(['beta', 'gamma']);
    expect([...reconcileProjectSelection(selected.selectedProjectIds, projects.slice(1))]).toEqual([
      'beta',
      'gamma',
    ]);
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
        conversations={[]}
        interactive
        onOpenDirectory={vi.fn()}
        onOpen={vi.fn()}
        onDeleteConversations={vi.fn()}
        onRemove={vi.fn()}
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
        conversations={[]}
        interactive
        onOpenDirectory={vi.fn()}
        onOpen={onOpen}
        onDeleteConversations={vi.fn()}
        onRemove={onRemove}
        projects={[unavailable]}
      />,
    );

    expect(markup.container.querySelector('.management-surface-list')?.className).toContain(
      'is-list',
    );
    expect(markup.container.querySelector('.management-surface-list')).toHaveProperty(
      'tabIndex',
      0,
    );
    expect(markup.container.querySelector('.management-surface-list')?.getAttribute('role')).toBe(
      'region',
    );
    const list = markup.container.querySelector<HTMLElement>('.management-surface-list');
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 640 });
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });
    expect(list?.scrollTop).toBe(640);
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    });
    expect(list?.scrollTop).toBe(0);
    expect(markup.container.textContent).toContain(
      'currentLocator: Workspace directory is unavailable.',
    );
    const unavailableProject = findButton(markup.container, 'Demo');
    expect(unavailableProject.disabled).toBe(false);
    expect(
      unavailableProject
        .closest('.management-surface-row')
        ?.getAttribute('data-workspace-open-disabled'),
    ).toBe('true');
    expect(markup.container.querySelector('button[aria-label="Open project: Demo"]')).toBeNull();
    await act(async () => {
      unavailableProject.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 }));
    });
    expect(findButton(markup.container, 'Delete Workspace conversations for Demo').disabled).toBe(
      true,
    );
    await act(async () => findButton(markup.container, 'Remove Demo').click());
    expect(onRemove).toHaveBeenCalledWith([unavailable]);
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => markup.root.unmount());
  });

  it('exposes Project conversation cleanup only for exact Workspace conversations', async () => {
    const onDeleteConversations = vi.fn();
    const demo = project();
    const markup = await renderWithI18n(
      <DesktopProjectCatalogSurface
        conversations={[workspaceConversation('conversation-1', demo.workspaceId)]}
        interactive
        onDeleteConversations={onDeleteConversations}
        onOpenDirectory={vi.fn()}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        projects={[demo]}
      />,
    );

    const cleanup = findButton(markup.container, 'Delete Workspace conversations for Demo');
    expect(cleanup.disabled).toBe(false);
    await act(async () => cleanup.click());
    expect(onDeleteConversations).toHaveBeenCalledWith([demo]);
    await act(async () => markup.root.unmount());
  });

  it('reconstructs query, sort and view from defaults after the singleton scene unmounts', async () => {
    const first = await renderWithI18n(
      <DesktopProjectCatalogSurface
        conversations={[]}
        interactive
        onOpenDirectory={vi.fn()}
        onOpen={vi.fn()}
        onDeleteConversations={vi.fn()}
        onRemove={vi.fn()}
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
        conversations={[]}
        interactive
        onOpenDirectory={vi.fn()}
        onOpen={vi.fn()}
        onDeleteConversations={vi.fn()}
        onRemove={vi.fn()}
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

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTML input value setter is unavailable.');
  setter.call(input, value);
}

function project(name = 'Demo', projectId = 'project-1') {
  return {
    projectId,
    workspaceId: projectId.replace('project', 'workspace'),
    profile: 'content' as const,
    displayName: name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };
}

function workspaceConversation(conversationId: string, workspaceId: string) {
  return {
    navigation: {
      conversationId,
      owner: { kind: 'workspace' as const, workspaceId },
    },
    title: conversationId,
    updatedAt: '2026-02-01T00:00:00.000Z',
    attention: 'none' as const,
    lastActivity: {
      kind: 'conversation-updated' as const,
      occurredAt: '2026-02-01T00:00:00.000Z',
    },
  };
}
