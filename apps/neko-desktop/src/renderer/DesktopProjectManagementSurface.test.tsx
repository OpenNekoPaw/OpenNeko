// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  DesktopProjectCatalogSurface,
  DesktopProjectDetailSurface,
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
      <>
        <DesktopProjectCatalogSurface
          interactive
          onSelect={onSelect}
          projects={[project()]}
          sessionId="project-management:1"
        />
        <DesktopProjectDetailSurface
          interactive
          onOpen={onOpen}
          project={project()}
          sessionId="project-management:1"
        />
      </>,
    );
    await act(async () => findButton(container, 'Demo').click());
    expect(onSelect).toHaveBeenCalledWith('project-1');
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => findButton(container, 'Open project').click());
    expect(onOpen).toHaveBeenCalledWith('project-1');
    await act(async () => root.unmount());
  });

  it('renders an owner-qualified empty detail and sorts deterministically', async () => {
    const markup = await renderWithI18n(
      <DesktopProjectDetailSurface
        interactive={false}
        onOpen={vi.fn()}
        sessionId="project-management:empty"
      />,
    );
    expect(
      markup.container.querySelector(
        '[data-project-management-session="project-management:empty"]',
      ),
    ).not.toBeNull();
    expect(
      filterAndSortProjectCatalog([project('b'), project('a')], '', 'name-ascending').map(
        (item) => item.displayName,
      ),
    ).toEqual(['a', 'b']);
    await act(async () => markup.root.unmount());
  });

  it('renders an explicit empty catalog state', async () => {
    const markup = await renderWithI18n(
      <DesktopProjectCatalogSurface
        interactive
        onSelect={vi.fn()}
        projects={[]}
        sessionId="project-management:empty-catalog"
      />,
    );

    expect(markup.container.textContent).toContain('No matching projects');
    expect(markup.container.querySelector('.management-surface-empty')).not.toBeNull();
    await act(async () => markup.root.unmount());
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
