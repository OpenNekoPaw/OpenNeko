import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  DESKTOP_SHELL_CONTRACT_VERSION,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  activateWorkbenchMainView,
  applyWorkbenchDisplayMode,
  DesktopShellView,
  openCanvasDocumentWorkbench,
  resizeApplicationSidebar,
  resizeProjectDockWorkbench,
  resizeTimelineWorkbench,
  resolveAssetCenterPreviewSession,
  setResourceDockPresentationWorkbench,
} from './DesktopShell';
import {
  filterAndSortProjectCatalog,
  parseProjectManagementSort,
} from './DesktopProjectManagementSurface';
import { createDesktopI18n } from './i18n';
import {
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  createDefaultDesktopWorkbenchLayout,
} from '@neko/host/desktop-workbench-contract';
import {
  DESKTOP_SCENE_CONTRACT_VERSION,
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
  type DesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
} from '@neko/host/application-settings';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import desktopShellSource from './DesktopShell.tsx?raw';
import assetCenterRuntimeSource from './desktop-asset-center-runtime.ts?raw';
import assetManagementSurfaceSource from './DesktopAssetManagementSurface.tsx?raw';

describe('Desktop scene Workbench', () => {
  it('keeps catalog parsing and deterministic ordering fail-visible', () => {
    expect(parseProjectManagementSort('updated-ascending')).toBe('updated-ascending');
    expect(() => parseProjectManagementSort('recent')).toThrow(
      'Unknown Project Management sort option',
    );

    expect(
      filterAndSortProjectCatalog(
        [
          projectFixture('older', '2026-01-02T00:00:00.000Z'),
          projectFixture('newer', '2026-07-02T00:00:00.000Z'),
        ],
        '',
        'updated-descending',
      ).map((project) => project.displayName),
    ).toEqual(['newer', 'older']);
  });

  it('projects final resize sizes to their exact Host-owned aggregates', () => {
    const workbench = { ...createDefaultDesktopWorkbenchLayout('window-1'), revision: 8 };
    expect(
      resizeApplicationSidebar(
        { ...createDefaultDesktopApplicationSidebar('window-1'), revision: 8 },
        288,
      ),
    ).toMatchObject({ revision: 8, width: 288 });
    expect(resizeTimelineWorkbench(workbench, 320)).toMatchObject({
      revision: 9,
      timeline: { height: 320 },
    });
    expect(resizeProjectDockWorkbench(workbench, 'agent', 400).display.chatWidth).toBe(400);
    expect(resizeProjectDockWorkbench(workbench, 'resources', 416).resourceDock.width).toBe(416);
  });

  it('keeps Resource management independent from creative Main and Agent placement', () => {
    const initial = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      display: { mode: 'chat-main' as const, chatPosition: 'right' as const, chatWidth: 360 },
    };
    const revealed = setResourceDockPresentationWorkbench(initial, 'docked');
    expect(revealed.resourceDock).toEqual({ presentation: 'docked', width: 320 });
    expect(revealed.display).toMatchObject({ mode: 'chat-main', chatPosition: 'left' });
    expect(revealed.main).toEqual(initial.main);
    expect(applyWorkbenchDisplayMode(revealed, 'chat-main-right').display.chatPosition).toBe(
      'left',
    );
  });

  it.each([
    ['agent', agentProjection()],
    ['workspace', workspaceProjection()],
    ['asset-center', projectionWithScene(assetCenterScene())],
    ['extensions', projectionWithScene(extensionsScene())],
    ['project-management', projectionWithScene(projectManagementScene())],
    ['settings', projectionWithScene(settingsScene())],
  ])(
    'mounts exactly one PrimarySidebar and ControlledWorkbenchShell for %s',
    (_name, projection) => {
      const markup = renderShell(<DesktopShellView projection={projection} />);
      expect(markup.match(/data-neko-controlled-workbench="true"/gu) ?? []).toHaveLength(1);
      expect(markup.match(/data-primary-sidebar="application"/gu) ?? []).toHaveLength(1);
      expect(markup.match(/neko-controlled-workbench-primary/gu) ?? []).toHaveLength(1);
      expect(markup.match(/primary-sidebar-toggle/gu) ?? []).toHaveLength(1);
      expect(markup).toContain('aria-label="Collapse sidebar"');
      expect(markup).not.toContain('home-brand-title');
      expect(markup).toContain('workspace-1');
      expect(markup).toContain('Conversation one');
    },
  );

  it('keeps the dedicated Sidebar toggle visible in compact presentation', () => {
    const projection = agentProjection();
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          window: {
            ...projection.window,
            applicationSidebar: { ...projection.window.applicationSidebar, visible: false },
          },
        }}
      />,
    );

    expect(markup.match(/primary-sidebar-toggle/gu) ?? []).toHaveLength(1);
    expect(markup).toContain('aria-label="Expand sidebar"');
  });

  it('composes Settings navigation and Main inside the same Workbench', () => {
    const markup = renderShell(
      <DesktopShellView projection={projectionWithScene(settingsScene('appearance'))} />,
    );
    expect(markup).toContain('data-settings-surface="navigation"');
    expect(markup).toContain('data-settings-surface="main"');
    expect(markup).toContain('Theme');
    expect(markup).not.toContain('data-primary-sidebar-frame="application"');
  });

  it('mounts Asset Preview only from the same Scene and AssetCenterSession ref', () => {
    const scene = assetCenterScene();
    const session = {
      schemaVersion: 1 as const,
      identity: { assetCenterSessionId: 'asset-center-1', windowId: 'window-1' },
      revision: 2,
      filter: {
        catalog: 'media-library' as const,
        query: '',
        sortBy: 'name' as const,
        sortDirection: 'ascending' as const,
        viewMode: 'grid' as const,
      },
      catalog: { status: 'loading' as const },
      preview: {
        status: 'ready' as const,
        itemId: 'media-library:item-1',
        previewSessionId: 'preview:asset-center:1',
      },
    };
    expect(
      resolveAssetCenterPreviewSession(
        {
          ...scene,
          slots: {
            ...scene.slots,
            secondaryMain: {
              kind: 'asset-preview',
              assetCenterSessionId: 'asset-center-1',
              previewSessionId: 'preview:asset-center:1',
            },
          },
        },
        session,
      ),
    ).toBe('preview:asset-center:1');
    expect(resolveAssetCenterPreviewSession(scene, session)).toBeNull();
    expect(() =>
      resolveAssetCenterPreviewSession(scene, {
        ...session,
        identity: { ...session.identity, assetCenterSessionId: 'asset-center:other' },
      }),
    ).toThrow('does not match');
  });

  it('uses the Workspace visual frame while preserving each scene shape', () => {
    const agentMarkup = renderShell(<DesktopShellView projection={agentProjection()} />);
    expect(agentMarkup).toContain('project-workspace desktop-scene-workbench');
    expect(agentMarkup).toContain('desktop-scene-workbench--agent-only');
    expect(agentMarkup).toContain('data-dock-owner="agent"');
    expect(agentMarkup).toContain('data-primary-surface="agent"');
    expect(agentMarkup).not.toContain('data-owner-root="assistant-resources"');

    vi.stubGlobal('window', { openNekoDesktop: {} });
    const assistantMarkup = renderShell(
      <DesktopShellView projection={projectionWithScene(assistantPreviewScene())} />,
    );
    expect(assistantMarkup).toContain('desktop-scene-workbench--assistant');
    expect(assistantMarkup).toContain('data-left-presentation="docked"');
    expect(assistantMarkup).toContain('data-dock-owner="agent"');
    vi.unstubAllGlobals();

    const assetMarkup = renderShell(
      <DesktopShellView projection={projectionWithScene(assetCenterScene())} />,
    );
    expect(assetMarkup).toContain('desktop-scene-workbench--management');
    expect(assetMarkup).toContain('data-left-presentation="hidden"');
    expect(assetMarkup).not.toContain('neko-controlled-workbench-dock--left');
  });

  it('preserves Workspace Agent, Main, Resource and Timeline identities without a nested Shell', () => {
    vi.stubGlobal('window', {
      openNekoDesktop: {
        resources: {
          getSnapshot: vi.fn(),
          children: vi.fn(),
          resolveThumbnail: vi.fn(),
          resolveQuickPreview: vi.fn(),
          releaseQuickPreview: vi.fn(),
          search: vi.fn(),
          execute: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
      },
    });
    const projection = workspaceProjection();
    const markup = renderShell(<DesktopShellView projection={projection} />);
    expect(markup.match(/data-neko-controlled-workbench="true"/gu) ?? []).toHaveLength(1);
    expect(markup.match(/data-primary-surface="agent"/gu) ?? []).toHaveLength(1);
    expect(markup).toContain('data-workbench-main-panel="workspace:main:primary"');
    expect(markup).toContain('data-main-view-id="cut:view-1:story"');
    expect(markup).toContain('data-testid="desktop-cut-timeline-slot"');
    expect(markup).toContain('data-dock-owner="resources"');
    expect(markup).toContain('data-timeline-visible="true"');
    vi.unstubAllGlobals();
  });

  it('maps Workspace only from the exact scene View and never from legacy active target', () => {
    const assistant = agentProjection();
    const misleading: DesktopShellProjection = {
      ...assistant,
      window: {
        ...assistant.window,
        activeTarget: { kind: 'project', tabId: 'tab-1' },
        tabs: [
          {
            tabId: 'tab-1',
            projectId: 'content:workspace-1',
            viewId: 'view-1',
            viewEpoch: 1,
          },
        ],
      },
    };
    const markup = renderShell(<DesktopShellView projection={misleading} />);
    expect(markup).toContain('Connecting to Agent');
    expect(markup).toContain('data-agent-scope="assistant"');
    expect(markup).not.toContain('data-main-view-id=');

    const workspace = workspaceProjection();
    expect(() =>
      renderShell(
        <DesktopShellView
          projection={{
            ...workspace,
            window: {
              ...workspace.window,
              workbench: {
                ...workspace.window.workbench,
                main: {
                  ...workspace.window.workbench.main,
                  views: workspace.window.workbench.main.views.map((view) => ({
                    ...view,
                    viewEpoch: view.viewEpoch + 1,
                  })),
                },
              },
            },
          }}
        />,
      ),
    ).toThrow('Workspace Scene Main Surface has no exact Workbench View');
  });

  it('poisons superseded Home handoff, top-level branches and scene-owned sidebar paths', () => {
    for (const forbidden of [
      'Home' + 'Workspace',
      'Home' + 'StartCreating',
      'agent' + 'InitialInput',
      'application' + 'Surface',
      'DesktopApplication' + 'SidebarFrame',
      'ProjectPrimary' + 'Sidebar',
      'resolve' + 'ActiveProject',
      '.window.' + 'activeTarget',
      'Home' + 'AssetCenter',
      'parseHome' + 'AssetSortOption',
    ]) {
      expect(desktopShellSource).not.toContain(forbidden);
    }
    expect(desktopShellSource.match(/<ControlledWorkbenchShell/gu) ?? []).toHaveLength(1);
    expect(assetManagementSurfaceSource).toContain('@neko/assets-webview/asset-management/root');
    expect(assetCenterRuntimeSource).not.toMatch(
      /absolutePath|selectedId|previewKind|path\.extname|home\.assets|home\.mediaLibraries/u,
    );
  });

  it('opens and focuses Canvas documents without changing scene authority', () => {
    const projection = workspaceProjection();
    const project = projection.catalog.projects[0]!;
    const first = openCanvasDocumentWorkbench({
      documentId: 'boards/first.nkc',
      presentation: 'main',
      project,
      projection,
      workbench: projection.window.workbench,
    });
    const duplicate = openCanvasDocumentWorkbench({
      documentId: 'boards/first.nkc',
      presentation: 'main',
      project,
      projection,
      workbench: first,
    });
    expect(duplicate.main.views).toHaveLength(first.main.views.length);
    expect(activateWorkbenchMainView(duplicate, duplicate.main.views[0]!).main.activeGroupId).toBe(
      DESKTOP_PRIMARY_MAIN_GROUP_ID,
    );
  });
});

function renderShell(node: JSX.Element): string {
  const i18n = createDesktopI18n('en');
  return renderToStaticMarkup(
    <I18nProvider service={i18n.i18nService}>
      <DesktopApplicationSettingsProvider
        value={{
          projection: {
            schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
            revision: 0,
            eventSequence: 0,
            preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          },
          update: async () => undefined,
          openAgentAdvanced: async () => undefined,
        }}
      >
        {node}
      </DesktopApplicationSettingsProvider>
    </I18nProvider>,
  );
}

function agentProjection(): DesktopShellProjection {
  return projectionWithScene(createDefaultDesktopAgentScene('window-1', 'assistant-space:test'));
}

function workspaceProjection(): DesktopShellProjection {
  const base = baseProjection();
  const project = base.catalog.projects[0]!;
  const tab = {
    tabId: 'tab-1',
    projectId: project.projectId,
    viewId: 'view-1',
    viewEpoch: 1,
  };
  const cutViewId = 'cut:view-1:story';
  return {
    ...base,
    domains: [
      { surface: 'agent', status: 'ready', ownerSlice: 'P1.3' },
      {
        surface: 'media-library',
        status: 'unavailable',
        ownerSlice: 'P1.4',
        diagnosticCode: 'desktop-domain-surface-unavailable',
      },
      { surface: 'cut', status: 'ready', ownerSlice: 'P1.5' },
    ],
    window: {
      ...base.window,
      activeTarget: { kind: 'home' },
      tabs: [tab],
      scene: workspaceScene(),
      workbench: {
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        revision: 4,
        resourceDock: { presentation: 'docked', width: 344 },
        display: { mode: 'chat-main', chatPosition: 'left', chatWidth: 376 },
        main: {
          views: [
            {
              viewId: cutViewId,
              viewEpoch: 1,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'cut',
              ownerId: 'cut-session:story',
              displayLabel: 'story.otio',
              documentId: 'cuts/story.otio',
            },
          ],
          groups: [
            {
              groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
              viewIds: [cutViewId],
              activeViewId: cutViewId,
            },
          ],
          activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        },
        timeline: { presentation: 'docked', ownerViewId: cutViewId, height: 288 },
      },
    },
  };
}

function projectionWithScene(scene: DesktopWorkbenchSceneProjection): DesktopShellProjection {
  const base = baseProjection();
  return { ...base, window: { ...base.window, scene } };
}

function baseProjection(): DesktopShellProjection {
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 2,
    catalog: {
      revision: 1,
      projects: [projectFixture('workspace-1', '2026-07-27T00:00:00.000Z')],
    },
    window: {
      windowId: 'window-1',
      revision: 1,
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
      scene: createDefaultDesktopAgentScene('window-1', 'assistant-space:test'),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome: {
      revision: 0,
      conversations: [
        {
          navigation: {
            projectId: 'content:workspace-1',
            workspaceId: 'workspace-1',
            conversationId: 'conversation-1',
          },
          title: 'Conversation one',
          updatedAt: '2026-07-29T00:00:00.000Z',
          attention: 'none',
          lastActivity: {
            kind: 'conversation-updated',
            occurredAt: '2026-07-29T00:00:00.000Z',
          },
        },
      ],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    domains: [],
  };
}

function workspaceScene(): DesktopWorkbenchSceneProjection {
  const scope = {
    kind: 'workspace' as const,
    workspaceId: 'workspace-1',
    workspaceGrantId: 'workspace-grant-1',
  };
  return parseDesktopWorkbenchSceneProjection({
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId: 'scene:window-1:workspace-1',
    windowId: 'window-1',
    revision: 1,
    context: { kind: 'agent', agentViewId: 'view-1', scope },
    slots: {
      interaction: { kind: 'agent', agentViewId: 'view-1', phase: 'draft', scope },
      main: {
        kind: 'workspace-main',
        workspaceId: 'workspace-1',
        viewId: 'cut:view-1:story',
        viewEpoch: 1,
      },
      rightManager: { kind: 'workspace-resources', workspaceId: 'workspace-1' },
      timeline: {
        kind: 'workspace-timeline',
        workspaceId: 'workspace-1',
        viewId: 'cut:view-1:story',
        viewEpoch: 1,
        ownerId: 'cut-session:story',
      },
      status: { kind: 'scene-status', sceneId: 'scene:window-1:workspace-1' },
    },
  });
}

function assetCenterScene(): DesktopWorkbenchSceneProjection {
  return managementScene('asset-center');
}

function assistantPreviewScene(): DesktopWorkbenchSceneProjection {
  const draft = createDefaultDesktopAgentScene('window-1', 'assistant-space:test');
  const scope = {
    kind: 'assistant' as const,
    assistantSpaceId: 'assistant-space:test',
    conversationId: 'conversation-1',
  };
  return parseDesktopWorkbenchSceneProjection({
    ...draft,
    context: { ...draft.context, scope },
    slots: {
      ...draft.slots,
      interaction: { ...draft.slots.interaction, phase: 'session', scope },
      main: {
        kind: 'assistant-preview',
        assistantSpaceId: 'assistant-space:test',
        conversationId: 'conversation-1',
        scratchArtifactId: 'scratch-1',
        previewSessionId: 'preview-1',
      },
    },
  });
}

function extensionsScene(): DesktopWorkbenchSceneProjection {
  return managementScene('extensions');
}

function projectManagementScene(): DesktopWorkbenchSceneProjection {
  return managementScene('project-management');
}

function settingsScene(section = 'general'): DesktopWorkbenchSceneProjection {
  return managementScene('settings', section);
}

function managementScene(
  kind: 'asset-center' | 'extensions' | 'project-management' | 'settings',
  section = 'general',
): DesktopWorkbenchSceneProjection {
  const sceneId = `scene:window-1:${kind}`;
  if (kind === 'asset-center') {
    return parseDesktopWorkbenchSceneProjection({
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId: 'window-1',
      revision: 1,
      context: { kind, assetCenterSessionId: 'asset-center-1' },
      slots: {
        main: { kind: 'asset-management', assetCenterSessionId: 'asset-center-1' },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (kind === 'extensions') {
    return parseDesktopWorkbenchSceneProjection({
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId: 'window-1',
      revision: 1,
      context: { kind, extensionManagementSessionId: 'extension-management-1' },
      slots: {
        main: {
          kind: 'extension-management',
          extensionManagementSessionId: 'extension-management-1',
        },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (kind === 'project-management') {
    return parseDesktopWorkbenchSceneProjection({
      schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
      sceneId,
      windowId: 'window-1',
      revision: 1,
      context: { kind, projectManagementSessionId: 'project-management-1' },
      slots: {
        main: {
          kind: 'project-management',
          projectManagementSessionId: 'project-management-1',
        },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  return parseDesktopWorkbenchSceneProjection({
    schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
    sceneId,
    windowId: 'window-1',
    revision: 1,
    context: { kind, settingsSectionId: section },
    slots: {
      leftManager: { kind: 'settings-navigation', settingsSectionId: section },
      main: { kind: 'settings-main', settingsSectionId: section },
      status: { kind: 'scene-status', sceneId },
    },
  });
}

function projectFixture(workspaceId: string, updatedAt: string) {
  return {
    projectId: `content:${workspaceId}`,
    workspaceId,
    profile: 'content' as const,
    displayName: workspaceId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  };
}
