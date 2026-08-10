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

  it('opens the exact Workspace on one native button click without a selection surface', async () => {
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
    expect(projectButton.tagName).toBe('BUTTON');
    expect(projectButton.type).toBe('button');
    await act(async () => projectButton.click());
    expect(projectButton.hasAttribute('aria-pressed')).toBe(false);
    expect(onOpen).toHaveBeenCalledWith('project-1');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.project-management-batch-toolbar')).toBeNull();
    expect(container.querySelector('button[aria-label="Open project: Demo"]')).toBeNull();
    expect(container.querySelectorAll('.management-surface-row-actions button')).toHaveLength(2);
    await act(async () => root.unmount());
  });

  it('does not retain modifier selection, select-all, or keyboard removal paths', async () => {
    const onOpen = vi.fn();
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
        onOpen={onOpen}
        onDeleteConversations={vi.fn()}
        onRemove={onRemove}
        projects={projects}
      />,
    );
    const list = markup.container.querySelector<HTMLElement>('.management-surface-list');
    const gamma = findButton(markup.container, 'Gamma');
    await act(async () =>
      gamma.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })),
    );
    expect(onOpen).toHaveBeenCalledWith('project-gamma');
    expect(markup.container.querySelector('.project-management-batch-toolbar')).toBeNull();
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', metaKey: true }));
      list?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
    });
    expect(onRemove).not.toHaveBeenCalled();
    expect(markup.container.querySelector('[data-selected]')).toBeNull();
    await act(async () => markup.root.unmount());
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

  it('defaults to grid mode and keeps unavailable Workspace fields visible and removable', async () => {
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
      'is-grid',
    );
    expect(
      markup.container.querySelector('.management-surface-list')?.getAttribute('data-view-mode'),
    ).toBe('grid');
    expect(findButton(markup.container, 'Grid view').getAttribute('aria-pressed')).toBe('true');
    expect(findButton(markup.container, 'List view').getAttribute('aria-pressed')).toBe('false');
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
    expect(unavailableProject.disabled).toBe(true);
    expect(
      unavailableProject
        .closest('.management-surface-row')
        ?.getAttribute('data-workspace-open-disabled'),
    ).toBe('true');
    expect(markup.container.querySelector('button[aria-label="Open project: Demo"]')).toBeNull();
    await act(async () => unavailableProject.click());
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
    if (!search || !sort) {
      throw new Error('Project Management controls are unavailable.');
    }
    const listButton = findButton(first.container, 'List view');
    await act(async () => {
      search.value = 'missing';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      sort.value = 'name-ascending';
      sort.dispatchEvent(new Event('change', { bubbles: true }));
      listButton.click();
    });
    expect(first.container.querySelector('.management-surface-list')?.className).toContain(
      'is-list',
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
      'is-grid',
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
