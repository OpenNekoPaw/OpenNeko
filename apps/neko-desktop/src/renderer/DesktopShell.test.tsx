import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import type { DesktopShellProjection } from '@neko/host/desktop-shell-contract';
import {
  activateWorkbenchMainView,
  applyWorkbenchDisplayMode,
  DesktopShellView,
  filterAndSortHomeProjects,
  openCanvasDocumentWorkbench,
  parseHomeAssetSortOption,
  parseHomeProjectSortOption,
  resizePrimarySidebarWorkbench,
  resizeProjectDockWorkbench,
  resizeTimelineWorkbench,
  searchAndOrderHomeExtensions,
  searchAndOrderHomeSkills,
  setResourceDockPresentationWorkbench,
} from './DesktopShell';
import { createDesktopI18n } from './i18n';
import {
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  createDefaultDesktopWorkbenchLayout,
  getActiveMainView,
  openOrFocusMainView,
  showWorkbenchTimeline,
  splitMainView,
} from '@neko/host/desktop-workbench-contract';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
} from '@neko/host/application-settings';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import type {
  DesktopHomeExtensionItem,
  DesktopHomeSkillItem,
} from '../shared/home-management-contract';

function skillFixture(
  name: string,
  source: 'personal' | 'plugin',
  description: string,
): DesktopHomeSkillItem {
  const managementId = source === 'personal' ? `skill:${'a'.repeat(64)}` : '';
  const sourceId = source === 'personal' ? source : 'story-tools@openneko';
  return {
    id: `${source}:${sourceId}:${name}`,
    name,
    description,
    source,
    sourceId,
    managementId,
    canRemove: source === 'personal',
  };
}

function extensionFixture(
  input: Pick<
    DesktopHomeExtensionItem,
    'id' | 'displayName' | 'description' | 'version' | 'mcpServerIds'
  > &
    Partial<Pick<DesktopHomeExtensionItem, 'appIds' | 'category'>>,
): DesktopHomeExtensionItem {
  const separator = input.id.lastIndexOf('@');
  return {
    id: input.id,
    name: input.id.slice(0, separator),
    displayName: input.displayName,
    description: input.description,
    version: input.version,
    developer: 'OpenAI',
    marketplace: input.id.slice(separator + 1),
    category: input.category ?? 'Productivity',
    installed: true,
    enabled: true,
    canInstall: false,
    canRemove: true,
    agentStatus: 'ready',
    runtimeDiagnosticCode: '',
    iconDataUrl: '',
    mcpServerIds: input.mcpServerIds,
    hasSkills: true,
    appIds: input.appIds ?? [],
  };
}

describe('DesktopShellView', () => {
  it('rejects unknown Home catalog sort options', () => {
    expect(parseHomeAssetSortOption('modified-descending')).toBe('modified-descending');
    expect(parseHomeProjectSortOption('updated-ascending')).toBe('updated-ascending');
    expect(() => parseHomeAssetSortOption('recent')).toThrow('Unknown Home asset sort option');
    expect(() => parseHomeProjectSortOption('recent')).toThrow('Unknown Home project sort option');
  });

  it('searches and deterministically orders global extension and Project catalogs', () => {
    expect(
      searchAndOrderHomeSkills(
        [
          skillFixture('Video', 'plugin', 'Edit clips'),
          skillFixture('Audio', 'personal', 'Mix sound'),
        ],
        '',
      ).map((skill) => skill.name),
    ).toEqual(['Audio', 'Video']);
    expect(
      searchAndOrderHomeSkills(
        [
          skillFixture('Video', 'plugin', 'Edit clips'),
          skillFixture('Audio', 'personal', 'Mix sound'),
        ],
        'edit',
      ).map((skill) => skill.name),
    ).toEqual(['Video']);
    expect(
      searchAndOrderHomeExtensions(
        [
          extensionFixture({
            id: 'github@openneko',
            displayName: 'GitHub',
            description: 'Triage pull requests.',
            version: '0.1.6',
            mcpServerIds: ['github'],
            appIds: ['github'],
          }),
          extensionFixture({
            id: 'computer-use@openneko',
            displayName: 'Computer Use',
            description: 'Control Mac apps.',
            version: '1.0.2',
            mcpServerIds: ['computer-use'],
          }),
        ],
        '',
      ).map((extension) => extension.id),
    ).toEqual(['computer-use@openneko', 'github@openneko']);
    expect(
      searchAndOrderHomeExtensions(
        [
          extensionFixture({
            id: 'computer-use@openneko',
            displayName: 'Computer Use',
            description: 'Control Mac apps.',
            version: '1.0.2',
            mcpServerIds: ['computer-use'],
          }),
        ],
        'computer-use',
      ).map((extension) => extension.id),
    ).toEqual(['computer-use@openneko']);
    expect(
      searchAndOrderHomeExtensions(
        [
          {
            ...extensionFixture({
              id: 'storyboard@market',
              displayName: 'Storyboard',
              description: 'Create visual stories.',
              version: '1.0.0',
              mcpServerIds: [],
              category: 'Creativity',
            }),
            installed: false,
            enabled: false,
            canInstall: true,
            canRemove: false,
            agentStatus: 'not-installed',
          },
          extensionFixture({
            id: 'documents@market',
            displayName: 'Documents',
            description: 'Create documents.',
            version: '1.0.0',
            mcpServerIds: [],
            category: 'Productivity',
          }),
          extensionFixture({
            id: 'build-apps@market',
            displayName: 'Build Apps',
            description: 'Build software.',
            version: '1.0.0',
            mcpServerIds: [],
            category: 'Developer Tools',
          }),
        ],
        '',
      ).map((extension) => extension.id),
    ).toEqual(['storyboard@market', 'documents@market', 'build-apps@market']);
    expect(
      filterAndSortHomeProjects(
        [
          {
            projectId: 'content:older',
            workspaceId: 'older',
            profile: 'content',
            displayName: 'Older',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
          {
            projectId: 'content:newer',
            workspaceId: 'newer',
            profile: 'content',
            displayName: 'Newer',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-07-02T00:00:00.000Z',
          },
        ],
        '',
        'updated-descending',
      ).map((project) => project.displayName),
    ).toEqual(['Newer', 'Older']);
  });

  it('activates an attached creative Main tab without mutating legacy Resource Dock state', () => {
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
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
      displayLabel: 'main.nkc',
      documentId: 'boards/main.nkc',
    };

    expect(activateWorkbenchMainView(workbench, canvasView)).toMatchObject({
      resourceDock: { presentation: 'overlay' },
      main: {
        groups: [
          {
            groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
            activeViewId: 'canvas-1',
          },
        ],
      },
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
    const resources = resizeProjectDockWorkbench(workbench, 'resources', 416);

    expect(primary).toMatchObject({
      revision: 9,
      primarySidebar: { width: 288 },
    });
    expect(timeline).toMatchObject({
      revision: 9,
      timeline: { height: 320 },
    });
    expect(agent.display.chatWidth).toBe(400);
    expect(agent.resourceDock.width).toBe(workbench.resourceDock.width);
    expect(resources.resourceDock.width).toBe(416);
    expect(resources.display.chatWidth).toBe(workbench.display.chatWidth);
  });

  it('reveals Project resources without creating a Main View and keeps Agent on the left', () => {
    const initial = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      display: {
        mode: 'chat-main' as const,
        chatPosition: 'right' as const,
        chatWidth: 360,
      },
    };
    const revealed = setResourceDockPresentationWorkbench(initial, 'docked');

    expect(revealed.resourceDock).toEqual({ presentation: 'docked', width: 320 });
    expect(revealed.display).toMatchObject({ mode: 'chat-main', chatPosition: 'left' });
    expect(revealed.main).toEqual(initial.main);
    expect(applyWorkbenchDisplayMode(revealed, 'chat-main-right').display.chatPosition).toBe(
      'left',
    );
  });

  it('mounts an active Cut View into Main with its package timeline Host slot', () => {
    const projection = homeProjection();
    const project = projection.catalog.projects[0]!;
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      main: {
        views: [
          {
            viewId: 'cut:view-1:story',
            viewEpoch: 1,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'cut' as const,
            ownerId: 'cut-session:story',
            displayLabel: 'story.otio',
            documentId: 'cuts/story.otio',
          },
        ],
        groups: [
          {
            groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
            viewIds: ['cut:view-1:story'],
            activeViewId: 'cut:view-1:story',
          },
        ],
        activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
      },
      timeline: {
        presentation: 'docked' as const,
        ownerViewId: 'cut:view-1:story',
        height: 280,
      },
      display: {
        ...createDefaultDesktopWorkbenchLayout('window-1').display,
        mode: 'main-only' as const,
      },
    };
    const markup = renderShell(
      <DesktopShellView
        projection={{
          ...projection,
          domains: [{ surface: 'cut', status: 'ready', ownerSlice: 'P1.5' }],
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
    expect(markup).toContain('Open creative documents');
    expect(markup).toContain('story.otio');
    expect(markup).not.toContain('desktop-cut-timeline-not-mounted');
  });

  it('renders Home from the authoritative catalog without inventing domain success', () => {
    const markup = renderShell(<DesktopShellView projection={homeProjection()} />);
    const composerStart = markup.indexOf('data-agent-entry="project-handoff"');
    const composerEnd = markup.indexOf('</form>', composerStart);
    const composerMarkup = markup.slice(composerStart, composerEnd);

    expect(markup).toContain('Creation intent');
    expect(markup).toContain('data-home-composition="task-launchpad"');
    expect(markup).toContain('data-home-surface="application"');
    expect(composerMarkup).toContain('data-home-agent-panel="composer"');
    expect(composerMarkup.match(/<textarea/gu)).toHaveLength(1);
    expect(composerMarkup).toContain('rows="1"');
    expect(composerMarkup.match(/<select/gu)).toHaveLength(1);
    expect(composerMarkup.match(/<button/gu)).toHaveLength(1);
    expect(composerMarkup).toContain('<option value="">Open project</option>');
    expect(composerMarkup).not.toContain('home-open-project-button');
    expect(composerMarkup).not.toContain('home-composer-divider');
    expect(composerMarkup).not.toMatch(/\b(?:Model|Skill|Version|Attachment)\b/u);
    expect(markup).toContain('Create with OpenNeko');
    expect(markup).toContain('Common creation tasks');
    expect(markup).toContain('Quick starts');
    expect(markup).not.toContain('home-main dotted-surface');
    expect(markup).not.toContain('home-hero-mark');
    expect(markup).not.toContain('home-hero');
    expect(markup).toContain('Demo Project');
    expect(markup).toContain('Asset Center');
    expect(markup).toContain('Extensions');
    expect(markup).toContain('All projects');
    expect(markup).not.toContain('/Users/private');
  });

  it('uses one application primary sidebar contract on Home and in a Content Project', () => {
    const baseProjection = homeProjection();
    const projection: DesktopShellProjection = {
      ...baseProjection,
      window: {
        ...baseProjection.window,
        workbench: {
          ...baseProjection.window.workbench,
          primarySidebar: {
            visible: true,
            width: 288,
          },
        },
      },
    };
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

    for (const markup of [homeMarkup, projectMarkup]) {
      expect(markup).toContain('class="application-primary-sidebar-frame"');
      expect(markup).toContain('data-primary-sidebar-frame="application"');
      expect(markup).toContain('data-primary-sidebar-placement="flush"');
      expect(markup).toContain('data-primary-sidebar-default-width="240"');
      expect(markup).toContain('data-primary-sidebar-width="288"');
      expect(markup).toContain('data-primary-sidebar-hover-reveal="false"');
    }
    for (const sidebar of [homeSidebar, projectSidebar]) {
      expect(sidebar).toContain('home-navigation project-primary-sidebar');
      expect(sidebar).toContain('Start creating');
      expect(sidebar).toContain('Asset Center');
      expect(sidebar).toContain('Extensions');
      expect(sidebar).toContain('All projects');
      expect(sidebar).toContain('Recent projects');
      expect(sidebar).toContain('Recent Agent conversations');
      expect(sidebar).toContain('Desktop settings');
      expect(sidebar).toContain('Remove Demo Project from recent projects');
      expect(sidebar).not.toContain('project-primary-brand-copy');
      expect(sidebar).not.toContain('project-layout-controls');
    }
    expect(homeSidebar).not.toContain('Project resources');
    expect(projectSidebar).not.toContain('Project resources');
    expect(projectMarkup).toContain('aria-label="Project resources"');
    expect(homeSidebar).not.toContain('data-workbench-display-control="primary-sidebar"');
    expect(projectSidebar).toContain('data-workbench-display-control="primary-sidebar"');
    expect(projectSidebar).toContain('aria-label="Display"');
    expect(projectSidebar).toMatch(
      /data-workbench-display-control="primary-sidebar"[\s\S]*aria-label="Desktop settings"/u,
    );
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
    expect(markup).toContain('Display');
    expect(markup).not.toContain('Main panel');
    expect(markup).toContain('data-workbench-display-control="primary-sidebar"');
    expect(markup).not.toContain('project-workbench-controls');
    expect(markup).not.toMatch(/<button[^>]*aria-label="Timeline"/u);
    expect(markup).toContain('Desktop settings');
    expect(markup).toContain('Start creating');
    expect(markup).toContain('Asset Center');
    expect(markup).toContain('Extensions');
    expect(markup).toContain('All projects');
    expect(markup).toContain('Recent projects');
    expect(markup).toContain('Recent Agent conversations');
    expect(markup).toContain('home-navigation project-primary-sidebar');
    expect(markup).not.toContain('project-capabilities');
    expect(markup).not.toContain('Creative surfaces');
    expect(markup).toContain('aria-label="Project resources"');
    expect(markup).not.toContain('project-workbench-header');
    expect(markup).not.toContain('project-view-switcher');
    expect(markup).not.toContain('project-view-navigation');
    expect(markup).not.toContain('class="project-tabs"');
    expect(markup).not.toContain('neko-workbench-activity-bar');
    expect(markup).toContain('data-primary-surface="agent"');
    expect(markup).not.toContain('100%');
    expect(markup).not.toContain('Ask Neko Agent about this project');
  });

  it('renders All Projects as a searchable sortable Project-only grid without conversations', () => {
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
        homeSection="projects"
      />,
    );
    const projectCatalogMarkup = markup.slice(markup.indexOf('<main class="home-main"'));

    expect(projectCatalogMarkup).toContain('All projects');
    expect(projectCatalogMarkup).toContain('Search projects');
    expect(projectCatalogMarkup).toContain('Recently updated');
    expect(projectCatalogMarkup).toContain('Grid');
    expect(projectCatalogMarkup).toContain('List');
    expect(projectCatalogMarkup).toContain('Demo Project');
    expect(projectCatalogMarkup).not.toContain('Storyboard review');
    expect(projectCatalogMarkup).not.toContain('Needs input');
    expect(projectCatalogMarkup).not.toContain('Timeline payload must stay owner-only');
  });

  it('renders Project resources on the right and moves Agent to an independent left Dock', () => {
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
              primarySidebar: { visible: false, width: 240 },
              resourceDock: {
                presentation: 'overlay',
                width: 320,
              },
              display: {
                mode: 'chat-main',
                chatPosition: 'right',
                chatWidth: 360,
              },
              main: {
                views: [
                  {
                    viewId: 'canvas:view-1:main',
                    viewEpoch: 1,
                    projectId: 'content:workspace-1',
                    workspaceId: 'workspace-1',
                    kind: 'canvas',
                    ownerId: 'canvas:view-1',
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
          },
        }}
      />,
    );

    expect(markup).toContain('data-primary-visible="true"');
    expect(markup).toContain('project-primary-sidebar--compact');
    expect(markup).toContain('data-primary-sidebar-placement="flush"');
    expect(markup).toContain('data-primary-sidebar-hover-reveal="true"');
    expect(markup).toContain('data-primary-sidebar-expanded-width="240"');
    expect(markup).toContain('home-brand-toggle');
    expect(markup).toContain('data-workbench-display-control="primary-sidebar"');
    expect(markup).toContain('Recent projects');
    expect(markup).toContain('Recent Agent conversations');
    expect(markup).toContain('data-left-presentation="docked"');
    expect(markup).toContain('data-right-presentation="overlay"');
    expect(markup).toContain('Creative main surface');
    expect(markup).toContain('Resource facets');
    expect(markup).toContain('data-dock-owner="resources"');
    expect(markup).toMatch(/neko-controlled-workbench-dock--left[\s\S]*data-dock-owner="agent"/u);
    expect(markup.match(/data-primary-surface="agent"/gu)).toHaveLength(1);
  });

  it('keeps the restored Resource Dock fixed right without stacking it with Agent', () => {
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
                width: 320,
              },
              display: {
                mode: 'chat-main',
                chatPosition: 'right',
                chatWidth: 380,
              },
            },
          },
        }}
      />,
    );

    expect(markup).not.toContain('project-dock-stack');
    expect(markup).toContain('Creative main surface');
    expect(markup).toContain('neko-controlled-workbench-dock--left" data-presentation="docked"');
    expect(markup).toContain('neko-controlled-workbench-dock--right" data-presentation="docked"');
    expect(markup).toContain('data-dock-owner="resources"');
    expect(markup).toMatch(
      /neko-controlled-workbench-dock--right[\s\S]*data-dock-owner="resources"/u,
    );
    expect(markup).not.toMatch(
      /neko-controlled-workbench-dock--right[\s\S]*data-dock-owner="agent"/u,
    );
  });

  it('mounts the package-owned Resource Browser in the right Dock when ready', () => {
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
                width: 320,
              },
              display: {
                ...projection.window.workbench.display,
                mode: 'chat-main',
                chatPosition: 'left',
              },
            },
          },
        }}
      />,
    );

    expect(markup).toContain('Loading project resources');
    expect(markup).not.toContain('Assets are not available yet');
    expect(markup).toContain('data-dock-owner="resources"');
    expect(markup).toContain('neko-controlled-workbench-dock--right');
    expect(markup).not.toContain('data-main-view-id="resource-browser:');
    const sidebar = extractPrimarySidebar(markup);
    expect(sidebar).not.toContain('Project resources');
    expect(sidebar).not.toMatch(/class="home-nav-button is-active"[^>]*aria-label="Asset Center"/u);
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
    expect(markup).toContain('扩展');
    expect(markup).not.toContain('插件');
    expect(markup).toContain('所有项目');
    expect(markup).not.toContain('Start creating');
  });

  it('renders global Skills and extension catalog controls without runtime capability claims', () => {
    const i18n = createDesktopI18n('zh-cn');
    const markup = renderToStaticMarkup(
      <I18nProvider service={i18n.i18nService}>
        <DesktopShellView projection={homeProjection()} homeSection="extensions" />
      </I18nProvider>,
    );

    expect(markup).toContain('搜索 Skill 或扩展');
    expect(markup).toContain('OpenNeko 与 Pi Agent 支持的扩展');
    expect(markup).toContain('扩展目录');
    expect(markup).not.toContain('home-sort-control');
    expect(markup).not.toContain('aria-label="来源"');
    expect(markup).not.toContain('aria-label="状态"');
    expect(markup).not.toContain('aria-label="分类"');
    expect(markup).not.toContain('aria-label="扩展目录排序"');
    expect(markup).toContain('扩展');
    expect(markup).not.toContain('内置能力');
    expect(markup).not.toContain('<option value="builtin">');
    expect(markup).not.toContain('内置');
    expect(markup).not.toContain('选择项目');
    expect(markup).toContain('刷新目录');

    const english = createDesktopI18n('en');
    const englishMarkup = renderToStaticMarkup(
      <I18nProvider service={english.i18nService}>
        <DesktopShellView projection={homeProjection()} homeSection="extensions" />
      </I18nProvider>,
    );
    expect(englishMarkup).toContain('Search Skills or extensions');
    expect(englishMarkup).toContain('Extension catalog');
    expect(englishMarkup).not.toContain('home-sort-control');
  });

  it('renders independent Media Library and Asset Library controls without Project resources', () => {
    const markup = renderShell(
      <DesktopShellView projection={homeProjection()} homeSection="assets" />,
    );

    expect(markup).toContain('desktop-global-library-root');
    expect(markup).not.toContain('home-management-card');
    expect(markup).not.toContain('Browse');
    expect(markup).not.toContain('Open folder');
    expect(markup).not.toContain('选择项目');
    expect(markup).not.toContain('检索已授权项目');
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
    expect(getActiveMainView(duplicate)?.viewId).toBe(duplicate.main.views[0]?.viewId);
    expect(side.main.views).toHaveLength(2);
    expect(side.main.groups).toMatchObject([
      {
        groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
        activeViewId: getActiveMainView(duplicate)?.viewId,
      },
      {
        groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
        activeViewId: getActiveMainView(side)?.viewId,
      },
    ]);
    expect(side.main.split).toEqual({ axis: 'columns', ratio: 0.5 });
  });

  it('composes package-owned Canvas, Cut Timeline and Model Views through tab Groups', () => {
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
    const canvas = openCanvasDocumentWorkbench({
      documentId: 'boards/main.nkc',
      presentation: 'main',
      project,
      projection,
      workbench: projection.window.workbench,
    });
    const cut = {
      viewId: 'cut:view-1:story',
      viewEpoch: 1,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'cut' as const,
      ownerId: 'cut-session:story',
      displayLabel: 'story.otio',
      documentId: 'cuts/story.otio',
    };
    const withCutTab = openOrFocusMainView(canvas, cut);
    const canvasWithTimeline = showWorkbenchTimeline(
      splitMainView(withCutTab, cut.viewId, 'rows'),
      cut.viewId,
    );
    expect(canvasWithTimeline).toMatchObject({
      main: {
        activeGroupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
        split: { axis: 'rows', ratio: 0.5 },
      },
      timeline: { presentation: 'docked', ownerViewId: 'cut:view-1:story' },
    });
    expect(
      canvasWithTimeline.main.groups.find(
        (group) => group.groupId === DESKTOP_SECONDARY_MAIN_GROUP_ID,
      )?.viewIds,
    ).toEqual([cut.viewId]);

    const model = {
      viewId: 'preview:view-1:model',
      viewEpoch: 1,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'preview' as const,
      ownerId: 'preview-session:model',
      displayLabel: 'character.glb',
      documentId: 'models/character.glb',
      previewContentKind: 'model' as const,
    };
    const canvasWithModel = openOrFocusMainView(canvas, model, {
      splitAxis: 'columns',
    });
    expect(canvasWithModel.main.split).toEqual({ axis: 'columns', ratio: 0.5 });
    expect(getActiveMainView(canvasWithModel)?.documentId).toBe('models/character.glb');
  });

  it('fails visibly when Timeline has no attached Cut owner', () => {
    expect(() =>
      showWorkbenchTimeline(createDefaultDesktopWorkbenchLayout('window-1'), 'cut:missing'),
    ).toThrow("Desktop Main View 'cut:missing' does not exist.");
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
