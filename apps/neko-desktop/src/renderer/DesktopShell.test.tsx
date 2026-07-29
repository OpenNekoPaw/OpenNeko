import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/shared/i18n/react';
import type { DesktopShellProjection } from '../shared/shell-contract';
import {
  activateWorkbenchMainView,
  applyWorkbenchDisplayMode,
  applyWorkbenchMainComposition,
  DesktopShellView,
  nextResourceDockPresentation,
  openCanvasDocumentWorkbench,
  resizePrimarySidebarWorkbench,
  resizeProjectDockWorkbench,
  resizeTimelineWorkbench,
  setResourceDockPresentationWorkbench,
} from './DesktopShell';
import { createDesktopI18n } from './i18n';
import { createDefaultDesktopWorkbenchLayout } from '../shared/workbench-contract';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
} from '../shared/application-settings-contract';
import { DesktopApplicationSettingsProvider } from './application-settings-context';

describe('DesktopShellView', () => {
  it('reopens Resources as an overlay while a full Preview owns Main', () => {
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');

    expect(
      nextResourceDockPresentation({
        ...workbench,
        preset: 'preview-focus',
        main: {
          views: [
            {
              viewId: 'preview-1',
              viewEpoch: 1,
              projectId: 'project-1',
              workspaceId: 'workspace-1',
              kind: 'preview',
              ownerId: 'preview-session-1',
              documentId: 'resource-1',
            },
          ],
          activeViewId: 'preview-1',
          split: 'none',
        },
      }),
    ).toBe('overlay');
    expect(nextResourceDockPresentation(workbench)).toBe('docked');
  });

  it('restores the selected Main preset and a visible dock after Preview closes', () => {
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      preset: 'preview-focus' as const,
      resourceDock: {
        ...createDefaultDesktopWorkbenchLayout('window-1').resourceDock,
        presentation: 'overlay' as const,
      },
    };
    const canvasView = {
      viewId: 'canvas-1',
      viewEpoch: 1,
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'canvas' as const,
      ownerId: 'canvas-session-1',
      documentId: 'boards/main.nkc',
    };

    expect(activateWorkbenchMainView(workbench, canvasView, [canvasView])).toMatchObject({
      preset: 'canvas-focus',
      resourceDock: { presentation: 'docked' },
      main: { activeViewId: 'canvas-1', split: 'none' },
    });
  });

  it('projects final resize sizes to the exact Host-owned panel owners', () => {
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      revision: 8,
    };

    const primary = resizePrimarySidebarWorkbench(workbench, 288);
    const timeline = resizeTimelineWorkbench(workbench, 320);
    const agent = resizeProjectDockWorkbench(workbench, 'agent', 400);
    const resources = resizeProjectDockWorkbench(workbench, 'resources', 440);

    expect(primary).toMatchObject({
      revision: 9,
      primarySidebar: { width: 288 },
    });
    expect(timeline).toMatchObject({
      revision: 9,
      timeline: { height: 320 },
    });
    expect(agent.agent.width).toBe(400);
    expect(agent.resourceDock.width).toBe(workbench.resourceDock.width);
    expect(resources.agent.width).toBe(workbench.agent.width);
    expect(resources.resourceDock.width).toBe(440);
  });

  it('keeps visible Resources opposite the declared Chat side', () => {
    const projection = homeProjection();
    const project = projection.catalog.projects[0];
    if (!project) {
      throw new Error('Desktop Shell fixture requires one project.');
    }
    const projectProjection: DesktopShellProjection = {
      ...projection,
      window: {
        ...projection.window,
        tabs: [
          {
            tabId: 'tab-1',
            projectId: project.projectId,
            viewId: 'view-1',
            viewEpoch: 1,
          },
        ],
      },
    };
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      resourceDock: {
        presentation: 'docked' as const,
        position: 'right' as const,
        width: 340,
      },
    };

    const revealed = setResourceDockPresentationWorkbench(workbench, 'docked');
    const chatRight = applyWorkbenchDisplayMode(
      revealed,
      project,
      projectProjection,
      'chat-main-right',
    );

    expect(revealed.agent.dockPosition).toBe('left');
    expect(revealed.resourceDock.position).toBe('right');
    expect(chatRight.agent.dockPosition).toBe('right');
    expect(chatRight.resourceDock.position).toBe('left');
  });

  it('mounts an active Cut View into Main with its package timeline Host slot', () => {
    const projection = homeProjection();
    const project = projection.catalog.projects[0]!;
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      preset: 'cut-focus' as const,
      main: {
        views: [
          {
            viewId: 'cut:view-1:story',
            viewEpoch: 1,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'cut' as const,
            ownerId: 'cut-session:story',
            documentId: 'cuts/story.otio',
          },
        ],
        activeViewId: 'cut:view-1:story',
        split: 'none' as const,
      },
      timeline: { visible: true, height: 280 },
    };
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          domains: [
            { surface: 'cut', status: 'ready', ownerSlice: 'P1.5' },
          ],
          window: {
            ...projection.window,
            activeTarget: { kind: 'project', tabId: 'tab-1' },
            tabs: [
              {
                tabId: 'tab-1',
                projectId: project.projectId,
                viewId: 'view-1',
                viewEpoch: 1,
              },
            ],
            workbench,
          },
        }}
      />,
    );

    expect(markup).toContain('data-testid="desktop-cut-timeline-slot"');
    expect(markup).toContain('data-timeline-visible="true"');
    expect(markup).not.toContain('desktop-cut-timeline-not-mounted');
  });

  it('renders Home from the authoritative catalog without inventing domain success', () => {
    const markup = renderShell(<DesktopShellView projection={homeProjection()} />);

    expect(markup).toContain('Creation intent');
    expect(markup).toContain('Demo Project');
    expect(markup).toContain('Asset Center');
    expect(markup).toContain('Plugins');
    expect(markup).toContain('All creations');
    expect(markup).not.toContain('/Users/private');
  });

  it('uses one application primary sidebar contract on Home and in a Content Project', () => {
    const projection = homeProjection();
    const openTab = {
      tabId: 'tab-1',
      projectId: 'content:workspace-1',
      viewId: 'view-1',
      viewEpoch: 1,
    };
    const homeMarkup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          window: {
            ...projection.window,
            tabs: [openTab],
          },
        }}
      />,
    );
    const projectMarkup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          window: {
            ...projection.window,
            activeTarget: { kind: 'project', tabId: openTab.tabId },
            tabs: [openTab],
          },
        }}
      />,
    );
    const homeSidebar = extractPrimarySidebar(homeMarkup);
    const projectSidebar = extractPrimarySidebar(projectMarkup);

    for (const sidebar of [homeSidebar, projectSidebar]) {
      expect(sidebar).toContain('home-navigation project-primary-sidebar');
      expect(sidebar).toContain('Start creating');
      expect(sidebar).toContain('Asset Center');
      expect(sidebar).toContain('Plugins');
      expect(sidebar).toContain('All creations');
      expect(sidebar).toContain('Recent projects');
      expect(sidebar).toContain('Recent Agent conversations');
      expect(sidebar).toContain('Desktop settings');
      expect(sidebar).toContain('Remove Demo Project from recent projects');
      expect(sidebar).not.toContain('project-primary-brand-copy');
      expect(sidebar).not.toContain('project-layout-controls');
    }
  });

  it('renders a Content Project shell with explicit unavailable domain state', () => {
    const projection = homeProjection();
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          window: {
            ...projection.window,
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
        }}
      />,
    );

    expect(markup).toContain('Demo Project');
    expect(markup).toContain('Agent unavailable');
    expect(markup).toContain('desktop-domain-surface-unavailable');
    expect(markup).toContain('Workbench layout controls');
    expect(markup).toContain('Display');
    expect(markup).toContain('Desktop settings');
    expect(markup).toContain('Start creating');
    expect(markup).toContain('Asset Center');
    expect(markup).toContain('Plugins');
    expect(markup).toContain('All creations');
    expect(markup).toContain('Recent projects');
    expect(markup).toContain('Recent Agent conversations');
    expect(markup).toContain('home-navigation project-primary-sidebar');
    expect(markup).not.toContain('project-capabilities');
    expect(markup).not.toContain('Creative surfaces');
    expect(markup.match(/project-layout-icon-button/gu)).toHaveLength(2);
    expect(markup).not.toContain('project-workbench-header');
    expect(markup).not.toContain('project-view-switcher');
    expect(markup).not.toContain('project-view-navigation');
    expect(markup).not.toContain('class="project-tabs"');
    expect(markup).not.toContain('neko-workbench-activity-bar');
    expect(markup).toContain('data-primary-surface="agent"');
    expect(markup).not.toContain('100%');
    expect(markup).not.toContain('Ask Neko Agent about this project');
  });

  it('renders owner-derived Agent Activity summaries without Timeline payloads', () => {
    const projection = homeProjection();
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          agentHome: {
            revision: 3,
            attention: { needsInput: 1, needsReview: 0, running: 0 },
            conversations: [
              {
                navigation: {
                  projectId: 'content:workspace-1',
                  workspaceId: 'workspace-1',
                  conversationId: 'conversation-1',
                },
                title: 'Storyboard review',
                updatedAt: '2026-07-27T00:01:00.000Z',
                attention: 'needs-input',
                lastActivity: {
                  kind: 'tool-confirmation-required',
                  occurredAt: '2026-07-27T00:01:00.000Z',
                  turnId: 'turn-1',
                  runId: 'run-1',
                  toolCallId: 'tool-call-1',
                  generationJob: {
                    jobId: 'generation-1',
                    revision: 3,
                    phase: 'succeeded',
                  },
                },
              },
            ],
          },
        }}
        homeSection="creations"
      />,
    );

    expect(markup).toContain('All creations');
    expect(markup).toContain('Storyboard review');
    expect(markup).toContain('Needs input');
    expect(markup).not.toContain('Timeline payload must stay owner-only');
  });

  it('projects movable Agent/Resource docks without duplicating domain state', () => {
    const projection = homeProjection();
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          window: {
            ...projection.window,
            activeTarget: { kind: 'project', tabId: 'tab-1' },
            tabs: [
              {
                tabId: 'tab-1',
                projectId: 'content:workspace-1',
                viewId: 'view-1',
                viewEpoch: 1,
              },
            ],
            workbench: {
              ...createDefaultDesktopWorkbenchLayout('window-1'),
              revision: 2,
              preset: 'canvas-agent',
              primarySidebar: { visible: false, width: 240 },
              resourceDock: {
                presentation: 'overlay',
                position: 'left',
                width: 320,
              },
              agent: {
                presentation: 'dock',
                dockPresentation: 'docked',
                dockPosition: 'right',
                width: 360,
              },
              main: {
                views: [
                  {
                    viewId: 'view-1',
                    viewEpoch: 1,
                    projectId: 'content:workspace-1',
                    workspaceId: 'workspace-1',
                    kind: 'agent',
                    ownerId: 'view-1',
                  },
                ],
                activeViewId: 'view-1',
                split: 'none',
              },
            },
          },
        }}
      />,
    );

    expect(markup).toContain('data-primary-visible="true"');
    expect(markup).toContain('project-primary-sidebar--compact');
    expect(markup).toContain('data-left-presentation="docked"');
    expect(markup).toContain('data-right-presentation="docked"');
    expect(markup).toContain('Creative main surface');
    expect(markup).toContain('Resource facets');
    expect(markup.match(/data-primary-surface="agent"/gu)).toHaveLength(1);
  });

  it('renders Agent and Resources as independent sidebars when restored positions collide', () => {
    const projection = homeProjection();
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          window: {
            ...projection.window,
            activeTarget: { kind: 'project', tabId: 'tab-1' },
            tabs: [
              {
                tabId: 'tab-1',
                projectId: 'content:workspace-1',
                viewId: 'view-1',
                viewEpoch: 1,
              },
            ],
            workbench: {
              ...createDefaultDesktopWorkbenchLayout('window-1'),
              resourceDock: {
                presentation: 'docked',
                position: 'right',
                width: 320,
              },
              agent: {
                presentation: 'dock',
                dockPresentation: 'docked',
                dockPosition: 'right',
                width: 380,
              },
            },
          },
        }}
      />,
    );

    expect(markup).not.toContain('project-dock-stack');
    expect(markup).toContain(
      'neko-controlled-workbench-dock--left" data-presentation="docked"',
    );
    expect(markup).toContain(
      'neko-controlled-workbench-dock--right" data-presentation="docked"',
    );
    expect(markup).toMatch(
      /neko-controlled-workbench-dock--left[\s\S]*data-dock-owner="resources"/u,
    );
    expect(markup).toMatch(
      /neko-controlled-workbench-dock--right[\s\S]*data-dock-owner="agent"/u,
    );
  });

  it('mounts the package-owned Resource Browser when the Main runtime is ready', () => {
    vi.stubGlobal('window', {
      openNekoDesktop: {
        resources: {
          getSnapshot: vi.fn(),
          children: vi.fn(),
          resolveThumbnail: vi.fn(),
          search: vi.fn(),
          execute: vi.fn(),
          subscribe: vi.fn(() => () => undefined),
        },
      },
    });
    const projection = homeProjection();
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          domains: projection.domains.map((domain) =>
            domain.surface === 'media-library'
              ? {
                  surface: 'media-library',
                  status: 'ready',
                  ownerSlice: 'P1.4',
                }
              : domain,
          ),
          window: {
            ...projection.window,
            activeTarget: { kind: 'project', tabId: 'tab-1' },
            tabs: [
              {
                tabId: 'tab-1',
                projectId: 'content:workspace-1',
                viewId: 'view-1',
                viewEpoch: 1,
              },
            ],
            workbench: {
              ...projection.window.workbench,
              resourceDock: {
                presentation: 'docked',
                position: 'right',
                width: 320,
              },
            },
          },
        }}
      />,
    );

    expect(markup).toContain('Loading project resources');
    expect(markup).not.toContain('Assets are not available yet');
    vi.unstubAllGlobals();
  });

  it('renders the same authoritative Home projection in Simplified Chinese', () => {
    const i18n = createDesktopI18n('zh-cn');
    const markup = renderToStaticMarkup(
      <I18nProvider service={i18n.i18nService}>
        <DesktopShellView projection={homeProjection()} />
      </I18nProvider>,
    );

    expect(markup).toContain('开始创作');
    expect(markup).toContain('资产中心');
    expect(markup).toContain('插件');
    expect(markup).toContain('全部创作');
    expect(markup).not.toContain('Start creating');
  });

  it('focuses duplicate Canvas documents and renders a second document only on explicit side-open', () => {
    const home = homeProjection();
    const project = home.catalog.projects[0]!;
    const projection: DesktopShellProjection = {
      ...home,
      window: {
        ...home.window,
        tabs: [
          {
            tabId: 'tab-1',
            projectId: project.projectId,
            viewId: 'view-1',
            viewEpoch: 1,
          },
        ],
      },
    };
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
    const side = openCanvasDocumentWorkbench({
      documentId: 'boards/second.nkc',
      presentation: 'side',
      project,
      projection,
      workbench: duplicate,
    });

    expect(duplicate.main.views).toHaveLength(1);
    expect(duplicate.main.activeViewId).toBe(duplicate.main.views[0]?.viewId);
    expect(side.main.views).toHaveLength(2);
    expect(side.main.activeViewId).toBe(duplicate.main.activeViewId);
    expect(side.main.sideViewId).not.toBe(side.main.activeViewId);
    expect(side.main.split).toBe('horizontal');
  });

  it('composes package-owned Canvas, Cut Timeline and Model Views without alternate renderers', () => {
    const home = homeProjection();
    const project = home.catalog.projects[0]!;
    const projection: DesktopShellProjection = {
      ...home,
      window: {
        ...home.window,
        tabs: [
          {
            tabId: 'tab-1',
            projectId: project.projectId,
            viewId: 'view-1',
            viewEpoch: 1,
          },
        ],
      },
    };
    const workbench = {
      ...projection.window.workbench,
      main: {
        views: [
          {
            viewId: 'cut:view-1:story',
            viewEpoch: 1,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'cut' as const,
            ownerId: 'cut-session:story',
            documentId: 'cuts/story.otio',
          },
          {
            viewId: 'preview:view-1:model',
            viewEpoch: 1,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'preview' as const,
            ownerId: 'preview-session:model',
            documentId: 'models/character.glb',
            previewContentKind: 'model' as const,
          },
        ],
        activeViewId: 'cut:view-1:story',
        split: 'none' as const,
      },
    };

    const canvasWithTimeline = applyWorkbenchMainComposition(
      workbench,
      project,
      projection,
      'canvas-timeline',
    );
    expect(canvasWithTimeline).toMatchObject({
      preset: 'canvas-cut',
      agent: { presentation: 'dock', dockPresentation: 'docked' },
      main: {
        activeViewId: 'cut:view-1:story',
        split: 'horizontal',
      },
      timeline: { visible: true },
    });
    expect(
      canvasWithTimeline.main.views.find(
        (view) => view.viewId === canvasWithTimeline.main.sideViewId,
      )?.kind,
    ).toBe('canvas');

    const canvasWithModel = applyWorkbenchMainComposition(
      workbench,
      project,
      projection,
      'canvas-model',
    );
    expect(canvasWithModel).toMatchObject({
      preset: 'canvas-preview',
      main: { split: 'horizontal' },
      timeline: { visible: false },
    });
    expect(
      canvasWithModel.main.views.find(
        (view) => view.viewId === canvasWithModel.main.activeViewId,
      )?.kind,
    ).toBe('canvas');
    expect(
      canvasWithModel.main.views.find(
        (view) => view.viewId === canvasWithModel.main.sideViewId,
      )?.documentId,
    ).toBe('models/character.glb');
  });

  it('fails visibly when a Main composition has no owning Timeline or Model View', () => {
    const projection = homeProjection();
    const project = projection.catalog.projects[0]!;
    const projectProjection: DesktopShellProjection = {
      ...projection,
      window: {
        ...projection.window,
        tabs: [
          {
            tabId: 'tab-1',
            projectId: project.projectId,
            viewId: 'view-1',
            viewEpoch: 1,
          },
        ],
      },
    };

    expect(() =>
      applyWorkbenchMainComposition(
        projectProjection.window.workbench,
        project,
        projectProjection,
        'timeline',
      ),
    ).toThrow("Desktop Main composition 'timeline' requires an open owning View.");
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

function extractPrimarySidebar(markup: string): string {
  const match = markup.match(
    /<aside[^>]*data-primary-sidebar="application"[^>]*>[\s\S]*?<\/aside>/u,
  );
  if (!match) {
    throw new Error('Desktop Shell markup does not contain the application primary sidebar.');
  }
  return match[0];
}

function homeProjection(): DesktopShellProjection {
  return {
    schemaVersion: 1,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 2,
    catalog: {
      revision: 1,
      projects: [
        {
          projectId: 'content:workspace-1',
          workspaceId: 'workspace-1',
          profile: 'content',
          displayName: 'Demo Project',
          createdAt: '2026-07-27T00:00:00.000Z',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
      ],
    },
    window: {
      windowId: 'window-1',
      revision: 1,
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
    },
    agentHome: {
      revision: 0,
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    domains: [
      unavailable('agent', 'P1.3'),
      unavailable('media-library', 'P1.4'),
      unavailable('canvas', 'P1.4'),
      unavailable('cut', 'P1.5'),
      unavailable('preview', 'P1.5'),
      unavailable('generation', 'P1.6'),
      unavailable('quality', 'P1.6'),
      unavailable('character', 'P1.6'),
      unavailable('world', 'P1.6'),
      unavailable('tools', 'P1.6'),
    ],
  };
}

function unavailable(
  surface: DesktopShellProjection['domains'][number]['surface'],
  ownerSlice: DesktopShellProjection['domains'][number]['ownerSlice'],
): DesktopShellProjection['domains'][number] {
  return {
    surface,
    ownerSlice,
    status: 'unavailable',
    diagnosticCode: 'desktop-domain-surface-unavailable',
  };
}
