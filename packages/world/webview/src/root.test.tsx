import type {
  WorldAuthoringSnapshot,
  WorldManagementCatalogProjection,
  WorldManagementDetailProjection,
} from '@neko/world-domain/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  WorldAuthoringStudioRoot,
  WorldManagementCatalogRoot,
  WorldManagementDetailRoot,
  WorldPortableExportScopeSurface,
  WorldPortableImportSurface,
} from './root';

const now = '2026-08-10T10:00:00.000Z';

describe('World package Webview roots', () => {
  it('renders the canonical card-only empty catalog without fabricating an active World', async () => {
    const onCreate = vi.fn();
    const onImport = vi.fn();
    const onStartFromTemplate = vi.fn();
    const reload = vi.fn(async () => undefined);
    const { container } = render(
      <WorldManagementCatalogRoot
        actions={{ onCreate, onImport, onStartFromTemplate }}
        locale="en"
        onSelect={vi.fn()}
        runtime={{
          loadState: { kind: 'ready', catalog: { ...managementCatalog(), items: [] } },
          reload,
          readDetail: vi.fn(async () => managementDetail()),
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Worlds' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'My Worlds' })).toBeTruthy();
    expect(screen.getByLabelText('0 worlds')).toBeTruthy();
    expect(screen.getByText('Add or import your first World')).toBeTruthy();
    expect(container.querySelector('.world-management__hero-visual')).not.toBeNull();
    expect(container.querySelector('.world-management__catalog-grid.is-empty')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Create from a World template' })).toBeTruthy();
    const template = container.querySelector<HTMLButtonElement>(
      '[data-world-template="world-bible"]',
    );
    if (!template) throw new Error('World catalog fixture requires the World Bible.');
    expect(screen.queryByText('Archive City')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quick generate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh worlds' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add world' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Import world package' })).toHaveLength(2);
    await waitFor(() =>
      expect(reload).toHaveBeenCalledWith({ search: '', sort: 'recently-updated' }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Add world' })[0]!);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Import world package' })[0]!);
    expect(onImport).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Search worlds'), { target: { value: 'archive' } });
    await waitFor(() =>
      expect(reload).toHaveBeenCalledWith({ search: 'archive', sort: 'recently-updated' }),
    );
    fireEvent.click(template);
    expect(onStartFromTemplate).toHaveBeenCalledOnce();
  });

  it('keeps an invalid card visible beside valid siblings', () => {
    const onSelect = vi.fn();
    const catalog: WorldManagementCatalogProjection = {
      ...managementCatalog(),
      items: [
        ...managementCatalog().items,
        {
          status: 'invalid',
          globalWorldId: 'world-invalid',
          message: 'World project file cannot be decoded.',
        },
      ],
    };
    const { container } = render(
      <WorldManagementCatalogRoot
        actions={{ onCreate: vi.fn(), onImport: vi.fn(), onStartFromTemplate: vi.fn() }}
        locale="en"
        onSelect={onSelect}
        runtime={{
          loadState: { kind: 'ready', catalog },
          reload: vi.fn(async () => undefined),
          readDetail: vi.fn(async () => managementDetail()),
        }}
      />,
    );

    expect(screen.getByRole('button', { name: /Archive City/u })).toBeTruthy();
    expect(screen.getByLabelText('2 worlds')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Archive City/u }));
    expect(onSelect).toHaveBeenCalledWith('global-world-a');
    expect(screen.getByText('World project file cannot be decoded.')).toBeTruthy();
    expect(container.querySelectorAll('[data-world-management-invalid-card="true"]')).toHaveLength(
      1,
    );
    expect(container.querySelector('.world-management__catalog-grid.is-empty')).toBeNull();
  });

  it('keeps catalog failure visible and retries the canonical runtime', async () => {
    const reload = vi.fn(async () => undefined);
    render(
      <WorldManagementCatalogRoot
        actions={{ onCreate: vi.fn(), onImport: vi.fn(), onStartFromTemplate: vi.fn() }}
        locale="en"
        onSelect={vi.fn()}
        runtime={{
          loadState: { kind: 'failed', message: 'World catalog unavailable' },
          reload,
          readDetail: vi.fn(async () => managementDetail()),
        }}
      />,
    );

    expect(screen.getByText('World catalog unavailable')).toBeTruthy();
    await waitFor(() => expect(reload).toHaveBeenCalled());
    reload.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledWith({ search: '', sort: 'recently-updated' });
  });

  it('delegates the exact global export identity from one detail scroller', async () => {
    const onExport = vi.fn();
    const { container } = render(
      <WorldManagementDetailRoot
        actions={{
          onExport,
          onImport: vi.fn(),
        }}
        locale="en"
        runtime={{
          loadState: { kind: 'ready', catalog: managementCatalog() },
          reload: vi.fn(async () => undefined),
          readDetail: vi.fn(async () => managementDetail()),
        }}
        selection={{ kind: 'global', globalWorldId: 'global-world-a' }}
      />,
    );

    await screen.findByRole('heading', { name: 'Archive City' });
    expect(container.querySelectorAll('[data-world-management-detail-scroll="true"]')).toHaveLength(
      1,
    );
    expect(container.querySelector('.world-authoring__preview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledWith('global-world-a');
  });

  it('mounts only the exact authoring target and emits an authoring command', async () => {
    const snapshot = authoringSnapshot();
    const execute = vi.fn(async () => snapshot);
    const { container, unmount } = render(
      <WorldAuthoringStudioRoot
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          authority: { kind: 'project', projectId: 'project-1' },
          worldProjectId: 'world-a',
        }}
        host={{ getSnapshot: vi.fn(async () => snapshot), execute }}
        initialSnapshot={snapshot}
        locale="en"
        windowId="window-1"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Archive City' })).toBeTruthy();
    expect(screen.queryByText('Preview runs')).toBeNull();
    expect(container.querySelector('[data-world-authoring-preview="true"]')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Background'), { target: { value: 'Updated world' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({ worldProjectId: 'world-a' }),
      expect.objectContaining({ operation: 'world-project-update-draft' }),
    );
    unmount();
    expect(container.querySelector('[data-world-authoring-studio="true"]')).toBeNull();
  });

  it('keeps portable export selection explicit and import conflicts fail-visible', () => {
    const onExport = vi.fn();
    const { unmount } = render(
      <WorldPortableExportScopeSurface
        detail={managementDetail()}
        disabled={false}
        locale="en"
        onCancel={vi.fn()}
        onExport={onExport}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose location and export' }));
    expect(onExport).toHaveBeenCalledWith({
      worldProjectId: 'world-a',
      worldVersionId: 'version-a',
      embeddedResourceIds: [],
    });
    unmount();

    render(
      <WorldPortableImportSurface
        disabled={false}
        locale="en"
        preview={{
          worldProjectId: 'world-a',
          worldVersionId: 'version-a',
          embeddedResources: [],
          externalDependencies: [],
          conflicts: [{ kind: 'world-project', recordId: 'world-a' }],
          canCommit: false,
        }}
        onCancel={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('world-project: world-a');
    expect(
      screen.getByRole('button', { name: 'Import to global catalog' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

function managementCatalog(): WorldManagementCatalogProjection {
  return {
    scope: { kind: 'global-catalog' },
    query: { search: '', sort: 'recently-updated' },
    items: [
      {
        status: 'available',
        globalWorldId: 'global-world-a',
        title: 'Archive City',
        summary: 'A city of archives.',
        currentWorldVersionId: 'version-a',
        updatedAt: now,
        versionCount: 1,
        runtimeCount: 1,
        runtimeEligible: true,
        attentionCount: 0,
      },
    ],
    diagnostics: [],
  };
}

function managementDetail(): WorldManagementDetailProjection {
  return {
    globalWorldId: 'global-world-a',
    title: 'Archive City',
    summary: 'A city of archives.',
    currentWorldVersionId: 'version-a',
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        worldProjectId: 'world-a',
        worldVersionId: 'version-a',
        label: 'First publication',
        publishedAt: now,
        runtimeCount: 1,
        current: true,
      },
    ],
    recentRuntimes: [],
    diagnostics: [],
  };
}

function authoringSnapshot(): WorldAuthoringSnapshot {
  const definition = {
    background: 'A city of archives.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
  return {
    project: {
      worldProjectId: 'world-a',
      title: 'Archive City',
      draft: definition,
      sourceRefs: [],
      reviewStatus: 'ready',
      createdAt: now,
      updatedAt: now,
    },
    versions: [
      {
        worldVersionId: 'version-a',
        worldProjectId: 'world-a',
        label: 'First publication',
        definition,
        acceptedSourceRefIds: [],
        publishedAt: now,
      },
    ],
    diagnostics: [],
  };
}
