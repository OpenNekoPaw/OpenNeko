import { describe, expect, it, vi } from 'vitest';
import type {
  DesktopWorkspaceRegistry,
  DesktopWorkspaceResolution,
} from './desktop-workspace-registry';
import { DesktopShellService } from './shell-service';
import {
  DesktopShellStateRepository,
  type DesktopShellStateFilePort,
} from './shell-state-repository';
import { DESKTOP_PRIMARY_MAIN_GROUP_ID } from '../shared/workbench-contract';

describe('DesktopShellService', () => {
  it('starts at Home by default without deleting restored project tabs', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const projection = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      projection.endpointEpoch,
      projection.window.revision,
    );
    expect(opened.projection.window.activeTarget.kind).toBe('project');
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const second = createFixture(file);
    const restoredWindowId = await second.service.claimWindowId();
    second.service.setRendererEpoch(restoredWindowId, 1);
    const restored = await second.service.getProjection(restoredWindowId);

    expect(restored.window.activeTarget).toEqual({ kind: 'home' });
    expect(restored.window.tabs).toHaveLength(1);
    expect(restored.catalog.projects).toHaveLength(1);
  });

  it('scopes the Agent Home catalog from persisted Projects before the first snapshot', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const firstWindowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(firstWindowId, 1);
    const initial = await first.service.getProjection(firstWindowId);
    await first.service.openContent(
      firstWindowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    first.service.releaseWindow(firstWindowId);
    await first.service.dispose();

    const second = createFixture(file);
    const setHomeWorkspaceScope = vi.fn<(workspaceIds: readonly string[]) => void>();
    second.service.setAgentHomeProjectionSource({
      setHomeWorkspaceScope,
      readHomeProjection: () => ({
        revision: 1,
        conversations: [],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
      subscribeHomeProjection: () => () => undefined,
    });

    const restoredWindowId = await second.service.claimWindowId();
    second.service.setRendererEpoch(restoredWindowId, 1);
    await second.service.getProjection(restoredWindowId);

    expect(setHomeWorkspaceScope).toHaveBeenCalledWith([
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('projects only fully composed Agent and Resource Browser capabilities as ready', async () => {
    const fixture = createFixture();
    fixture.service.setAgentCapabilityReady(true);
    fixture.service.setResourceBrowserCapabilityReady(true);
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);

    const projection = await fixture.service.getProjection(windowId);

    expect(projection.domains.find((domain) => domain.surface === 'agent')).toEqual({
      surface: 'agent',
      status: 'ready',
      ownerSlice: 'P1.3',
    });
    expect(projection.domains.find((domain) => domain.surface === 'media-library')).toEqual({
      surface: 'media-library',
      status: 'ready',
      ownerSlice: 'P1.4',
    });
    expect(
      projection.domains
        .filter((domain) => domain.surface !== 'agent' && domain.surface !== 'media-library')
        .every((domain) => domain.status === 'unavailable'),
    ).toBe(true);
    expect(() => fixture.service.setAgentCapabilityReady(false)).toThrow(
      'before any Window is claimed',
    );
    expect(() => fixture.service.setResourceBrowserCapabilityReady(false)).toThrow(
      'before any Window is claimed',
    );
  });

  it('reuses one Project and focuses one Tab for duplicate opens', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);

    const first = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const second = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      first.projection.endpointEpoch,
      first.projection.window.revision,
    );

    expect(first.projection.catalog.projects).toHaveLength(1);
    expect(second.projection.catalog.projects).toHaveLength(1);
    expect(second.projection.window.tabs).toHaveLength(1);
    expect(second.projection.window.revision).toBe(first.projection.window.revision);
    expect(first.workspace).toEqual(second.workspace);
    expect(fixture.registry.resolve).toHaveBeenCalledTimes(2);
  });

  it('opens the canonical Workspace Canvas when a Project has no stored Main View', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);

    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );

    expect(opened.projection.window.workbench).toMatchObject({
      display: { mode: 'chat-main' },
      main: {
        views: [
          {
            projectId: 'content:11111111-1111-4111-8111-111111111111',
            workspaceId: '11111111-1111-4111-8111-111111111111',
            kind: 'canvas',
            documentId: 'neko/boards/workspace.nkc',
          },
        ],
      },
    });
    expect(opened.projection.window.workbench.main.groups[0]).toMatchObject({
      viewIds: [opened.projection.window.workbench.main.views[0]?.viewId],
      activeViewId: opened.projection.window.workbench.main.views[0]?.viewId,
    });
  });

  it('shares a Project owner while isolating cross-window Tab and View identity', async () => {
    const fixture = createFixture();
    const firstWindow = await fixture.service.claimWindowId();
    const secondWindow = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(firstWindow, 1);
    fixture.service.setRendererEpoch(secondWindow, 1);
    const firstEvents = vi.fn();
    const secondEvents = vi.fn();
    fixture.service.subscribe(firstWindow, firstEvents);
    fixture.service.subscribe(secondWindow, secondEvents);
    const firstInitial = await fixture.service.getProjection(firstWindow);
    const secondInitial = await fixture.service.getProjection(secondWindow);

    const first = await fixture.service.openContent(
      firstWindow,
      '/workspace/demo',
      firstInitial.endpointEpoch,
      firstInitial.window.revision,
    );
    const second = await fixture.service.openContent(
      secondWindow,
      '/workspace/demo',
      secondInitial.endpointEpoch,
      secondInitial.window.revision,
    );

    expect(first.projection.catalog.projects[0]?.projectId).toBe(
      second.projection.catalog.projects[0]?.projectId,
    );
    expect(first.projection.window.tabs[0]?.tabId).not.toBe(
      second.projection.window.tabs[0]?.tabId,
    );
    expect(first.projection.window.tabs[0]?.viewId).not.toBe(
      second.projection.window.tabs[0]?.viewId,
    );
    expect(firstEvents).toHaveBeenCalled();
    expect(secondEvents).toHaveBeenCalled();
  });

  it('removes one recent Project and all of its cross-window Tabs without deleting workspace files', async () => {
    const fixture = createFixture();
    const firstWindow = await fixture.service.claimWindowId();
    const secondWindow = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(firstWindow, 1);
    fixture.service.setRendererEpoch(secondWindow, 1);
    const firstInitial = await fixture.service.getProjection(firstWindow);
    const secondInitial = await fixture.service.getProjection(secondWindow);
    const firstOpened = await fixture.service.openContent(
      firstWindow,
      '/workspace/demo',
      firstInitial.endpointEpoch,
      firstInitial.window.revision,
    );
    await fixture.service.openContent(
      secondWindow,
      '/workspace/demo',
      secondInitial.endpointEpoch,
      secondInitial.window.revision,
    );
    const project = firstOpened.projection.catalog.projects[0]!;

    const removed = await fixture.service.removeRecentProject(
      firstWindow,
      project.projectId,
      firstOpened.projection.endpointEpoch,
      firstOpened.projection.window.revision,
      firstOpened.projection.catalog.revision,
    );
    const secondProjection = await fixture.service.getProjection(secondWindow);

    expect(removed.catalog.projects).toEqual([]);
    expect(removed.window).toMatchObject({
      activeTarget: { kind: 'home' },
      tabs: [],
    });
    expect(secondProjection.window).toMatchObject({
      activeTarget: { kind: 'home' },
      tabs: [],
    });
    expect(fixture.registry.resolve).toHaveBeenCalledTimes(2);
  });

  it('removes the Project-owned Workbench Views while Home is active', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0]!;
    const tab = opened.projection.window.tabs[0]!;
    const current = opened.projection.window.workbench;
    const withCanvas = await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        main: {
          views: [
            {
              viewId: 'canvas:view-1:main',
              viewEpoch: tab.viewEpoch,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'canvas',
              ownerId: 'canvas:project-1',
              displayLabel: 'main.nkc',
              documentId: 'boards/main.nkc',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: ['canvas:view-1:main'],
              activeViewId: 'canvas:view-1:main',
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
      },
    );
    const home = await first.service.activateHome(
      windowId,
      withCanvas.endpointEpoch,
      withCanvas.window.revision,
    );

    const removed = await first.service.removeRecentProject(
      windowId,
      project.projectId,
      home.endpointEpoch,
      home.window.revision,
      home.catalog.revision,
    );

    expect(removed.window.workbench.main.views).toEqual([]);
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const restoredWindowId = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindowId, 1);
    await expect(restored.service.getProjection(restoredWindowId)).resolves.toMatchObject({
      catalog: { projects: [] },
      window: {
        activeTarget: { kind: 'home' },
        workbench: { main: { views: [] } },
      },
    });
  });

  it('rejects a stale Project catalog removal without changing Project or Tab state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const project = opened.projection.catalog.projects[0]!;

    await expect(
      fixture.service.removeRecentProject(
        windowId,
        project.projectId,
        opened.projection.endpointEpoch,
        opened.projection.window.revision,
        opened.projection.catalog.revision - 1,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });

    expect(await fixture.service.getProjection(windowId)).toEqual(opened.projection);
  });

  it('rejects stale Window revisions without changing state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const tabId = opened.projection.window.tabs[0]!.tabId;
    await fixture.service.closeTab(
      windowId,
      tabId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
    );

    await expect(
      fixture.service.activateTab(
        windowId,
        tabId,
        opened.projection.endpointEpoch,
        opened.projection.window.revision,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect((await fixture.service.getProjection(windowId)).window.tabs).toEqual([]);
  });

  it('returns unavailable profiles without persisting Project or Tab state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const before = await fixture.service.getProjection(windowId);

    const result = await fixture.service.requestUnavailableProfile(windowId, 'request-1', 'world');
    const after = await fixture.service.getProjection(windowId);

    expect(result.diagnostic.code).toBe('desktop-project-profile-unavailable');
    expect(after).toEqual(before);
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('restores the primary Window layout and advances endpoint epoch after restart', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const firstWindow = await first.service.claimWindowId();
    first.service.setRendererEpoch(firstWindow, 1);
    const initial = await first.service.getProjection(firstWindow);
    await first.service.openContent(
      firstWindow,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    first.service.releaseWindow(firstWindow);
    await first.service.dispose();

    const second = createFixture(file);
    const restoredWindow = await second.service.claimWindowId();
    second.service.setRendererEpoch(restoredWindow, 1);
    const restored = await second.service.getProjection(restoredWindow);

    expect(restoredWindow).toBe(firstWindow);
    expect(restored.window.tabs).toHaveLength(1);
    expect(restored.endpointEpoch).toContain('app-2');
  });

  it('persists Workbench layout through Window and Workbench revision CAS', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    const next = {
      ...current,
      revision: current.revision + 1,
      primarySidebar: {
        ...current.primarySidebar,
        visible: false,
      },
      resourceDock: {
        ...current.resourceDock,
        presentation: 'overlay' as const,
        position: 'left' as const,
      },
    };

    const updated = await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      next,
    );

    expect(updated.window.workbench).toMatchObject({
      revision: current.revision + 1,
      primarySidebar: { visible: false },
      resourceDock: { presentation: 'overlay', position: 'left' },
    });
    await expect(
      first.service.updateWorkbench(
        windowId,
        updated.endpointEpoch,
        updated.window.revision,
        current.revision,
        { ...next, revision: next.revision + 1 },
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });

    first.service.releaseWindow(windowId);
    await first.service.dispose();
    const restored = createFixture(file);
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindow, 1);

    expect((await restored.service.getProjection(restoredWindow)).window.workbench).toMatchObject({
      primarySidebar: { visible: false },
      resourceDock: { presentation: 'overlay', position: 'left' },
    });
  });

  it('persists only the application primary sidebar while Home is active', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const home = await fixture.service.activateHome(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
    );
    fixture.service.setRendererEpoch(windowId, 2);
    const reattachedHome = await fixture.service.getProjection(windowId);
    const current = reattachedHome.window.workbench;
    const collapsed = {
      ...current,
      revision: current.revision + 1,
      primarySidebar: {
        ...current.primarySidebar,
        visible: false,
      },
    };

    const updated = await fixture.service.updateWorkbench(
      windowId,
      reattachedHome.endpointEpoch,
      home.window.revision,
      current.revision,
      collapsed,
    );

    expect(updated.window.activeTarget).toEqual({ kind: 'home' });
    expect(updated.window.workbench.primarySidebar.visible).toBe(false);
    expect(updated.window.tabs[0]?.viewEpoch).toBe(2);
    expect(updated.window.workbench.main.views).toEqual([
      expect.objectContaining({
        kind: 'canvas',
        documentId: 'neko/boards/workspace.nkc',
      }),
    ]);
    await expect(
      fixture.service.updateWorkbench(
        windowId,
        updated.endpointEpoch,
        updated.window.revision,
        updated.window.workbench.revision,
        {
          ...updated.window.workbench,
          revision: updated.window.workbench.revision + 1,
          resourceDock: {
            ...updated.window.workbench.resourceDock,
            presentation: 'overlay',
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'desktop-shell-project-identity-mismatch',
      message: 'Desktop Home may only mutate the application primary sidebar.',
    });
  });

  it('drops a persisted temporary Preview View and restores the default Workspace Canvas', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        main: {
          views: [
            {
              viewId: 'preview:view-1',
              viewEpoch: opened.projection.window.tabs[0]!.viewEpoch,
              projectId: opened.projection.catalog.projects[0]!.projectId,
              workspaceId: opened.workspace.workspaceId,
              kind: 'preview',
              ownerId: 'preview-session:temporary-1',
              displayLabel: 'resource-1',
              documentId: 'resource-1',
              previewPresentation: 'temporary',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: ['preview:view-1'],
              activeViewId: 'preview:view-1',
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
      },
    );
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindow, 1);
    const homeProjection = await restored.service.getProjection(restoredWindow);
    const projection = await restored.service.activateTab(
      restoredWindow,
      homeProjection.window.tabs[0]!.tabId,
      homeProjection.endpointEpoch,
      homeProjection.window.revision,
    );

    expect(projection.window.workbench).toMatchObject({
      display: { mode: 'chat-main' },
      main: {
        views: [
          {
            kind: 'canvas',
            documentId: 'neko/boards/workspace.nkc',
          },
        ],
        groups: [
          {
            groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
            viewIds: [expect.stringContaining('canvas:')],
          },
        ],
      },
    });
  });

  it('persists only the bounded presentation identity for a pinned Preview View', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const current = opened.projection.window.workbench;
    const tab = opened.projection.window.tabs[0]!;
    const project = opened.projection.catalog.projects[0]!;
    await first.service.updateWorkbench(
      windowId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
      current.revision,
      {
        ...current,
        revision: current.revision + 1,
        main: {
          views: [
            {
              viewId: 'preview:view-1:pinned',
              viewEpoch: tab.viewEpoch,
              projectId: project.projectId,
              workspaceId: opened.workspace.workspaceId,
              kind: 'preview',
              ownerId: 'preview-session:pinned-1',
              displayLabel: 'resource-1',
              documentId: 'resource-1',
              previewPresentation: 'pinned',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: ['preview:view-1:pinned'],
              activeViewId: 'preview:view-1:pinned',
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
      },
    );
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const restoredWindow = await restored.service.claimWindowId();
    restored.service.setRendererEpoch(restoredWindow, 1);
    const projection = await restored.service.getProjection(restoredWindow);

    expect(projection.window.workbench.main.views).toEqual([
      expect.objectContaining({
        viewId: 'preview:view-1:pinned',
        ownerId: 'preview-session:pinned-1',
        documentId: 'resource-1',
        previewPresentation: 'pinned',
      }),
    ]);
    expect(JSON.stringify(projection.window.workbench)).not.toMatch(
      /descriptor|absolutePath|neko-media:/u,
    );
  });

  it('resolves a restored Agent workspace through the Host-only persisted locator', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const windowId = await first.service.claimWindowId();
    first.service.setRendererEpoch(windowId, 1);
    const initial = await first.service.getProjection(windowId);
    const opened = await first.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const workspaceId = opened.workspace.workspaceId;
    first.service.releaseWindow(windowId);
    await first.service.dispose();

    const restored = createFixture(file);
    const resolution = await restored.service.resolveAgentWorkspace(workspaceId);

    expect(resolution.workspaceId).toBe(workspaceId);
    expect(restored.registry.resolve).toHaveBeenCalledWith('/workspace/demo');
  });

  it('rejects a mutation from a replaced renderer endpoint before workspace resolution', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const stale = await fixture.service.getProjection(windowId);
    fixture.service.setRendererEpoch(windowId, 2);

    await expect(
      fixture.service.openContent(
        windowId,
        '/workspace/demo',
        stale.endpointEpoch,
        stale.window.revision,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('advances View epochs when a renderer reattaches without changing the View owner', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const firstView = opened.projection.window.tabs[0];
    fixture.service.setRendererEpoch(windowId, 2);
    const reattached = await fixture.service.getProjection(windowId);

    expect(reattached.window.tabs[0]).toMatchObject({
      viewId: firstView?.viewId,
      viewEpoch: 2,
    });
    expect(firstView?.viewEpoch).toBe(1);
    expect(reattached.endpointEpoch).not.toBe(opened.projection.endpointEpoch);
  });

  it('reopens a closed catalog Project with a new View identity', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const firstTab = opened.projection.window.tabs[0]!;
    const closed = await fixture.service.closeTab(
      windowId,
      firstTab.tabId,
      opened.projection.endpointEpoch,
      opened.projection.window.revision,
    );
    const reopened = await fixture.service.openCatalogProject(
      windowId,
      opened.projection.catalog.projects[0]!.projectId,
      closed.endpointEpoch,
      closed.window.revision,
    );

    expect(reopened.projection.window.tabs[0]?.viewId).not.toBe(firstTab.viewId);
    expect(reopened.projection.window.tabs[0]?.viewEpoch).toBe(1);
  });
});

function createFixture(file = createMemoryFile(), startupTarget: 'home' | 'restore' = 'home') {
  let identity = 0;
  const resolution: DesktopWorkspaceResolution = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspacePath: '/workspace/demo',
    displayName: 'Demo',
    locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
  };
  const registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
  } = {
    resolve: vi.fn(async () => resolution),
    dispose: vi.fn(async () => undefined),
  };
  const applicationInstanceId = file.applicationCount === 0 ? 'app-1' : 'app-2';
  file.applicationCount += 1;
  return {
    registry,
    service: new DesktopShellService({
      applicationInstanceId,
      stateRepository: new DesktopShellStateRepository(file),
      workspaceRegistry: registry,
      startupTarget,
      createIdentity: () => `identity-${(identity += 1)}`,
      now: () => '2026-07-27T00:00:00.000Z',
    }),
  };
}

interface MemoryFile extends DesktopShellStateFilePort {
  applicationCount: number;
}

function createMemoryFile(): MemoryFile {
  let content: string | null = null;
  return {
    applicationCount: 0,
    readTextIfExists: async () => content,
    writeTextAtomic: async (next) => {
      content = next;
    },
  };
}
