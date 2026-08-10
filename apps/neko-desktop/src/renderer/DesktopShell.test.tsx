import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  projectDesktopConversationNavigation,
  resolveActiveDesktopWindowWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  applyWorkbenchDisplayMode,
  createManagementMainSplitResizeBinding,
  DesktopShellView,
  MANAGEMENT_MAIN_SPLIT_DEFAULT_RATIO,
  MANAGEMENT_MAIN_SPLIT_MIN_RATIO,
  projectDesktopShellInteractionLocks,
  resizeApplicationSidebar,
  resizeProjectDockWorkbench,
  resolveAssetCenterPreviewSession,
  setResourceDockPresentationWorkbench,
  toggleWorkbenchRegion,
} from './DesktopShell';
import {
  filterAndSortProjectCatalog,
  parseProjectManagementSort,
} from './DesktopProjectManagementSurface';
import { createDesktopI18n } from './i18n';
import {
  DESKTOP_PRIMARY_MAIN_GROUP_ID,
  DESKTOP_WORKBENCH_LIMITS,
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  openOrFocusCutView,
} from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
  type DesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { DEFAULT_DESKTOP_APPLICATION_PREFERENCES } from '@neko/host/application-settings';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import desktopShellSource from './DesktopShell.tsx?raw';
import assetManagementSurfaceSource from './DesktopAssetManagementSurface.tsx?raw';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';

describe('Desktop scene Workbench', () => {
  it('locks only controls owned by the pending Shell mutation scope', () => {
    const base = {
      scene: false,
      workbench: false,
      navigation: false,
      sidebar: false,
      targetSelection: false,
    };

    expect(projectDesktopShellInteractionLocks({ ...base, workbench: true })).toEqual({
      workbench: true,
      navigation: false,
      sidebar: false,
      targetSelection: false,
    });
    expect(projectDesktopShellInteractionLocks({ ...base, sidebar: true })).toEqual({
      workbench: false,
      navigation: false,
      sidebar: true,
      targetSelection: false,
    });
    expect(projectDesktopShellInteractionLocks({ ...base, scene: true })).toEqual({
      workbench: true,
      navigation: true,
      sidebar: true,
      targetSelection: true,
    });
    expect(projectDesktopShellInteractionLocks({ ...base, targetSelection: true })).toEqual({
      workbench: false,
      navigation: false,
      sidebar: false,
      targetSelection: true,
    });
  });

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
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    expect(
      resizeApplicationSidebar(createDefaultDesktopApplicationSidebar('window-1'), 288),
    ).toMatchObject({ width: 288 });
    expect(resizeProjectDockWorkbench(workbench, 'agent', 400).display.chatWidth).toBe(400);
    expect(resizeProjectDockWorkbench(workbench, 'resources', 416).resourceDock.width).toBe(416);
  });

  it('keeps management Main at least as wide as Preview or Detail', () => {
    const onResizeEnd = vi.fn();
    const binding = createManagementMainSplitResizeBinding({
      label: 'Resize Main split',
      onResizeEnd,
    });

    expect(MANAGEMENT_MAIN_SPLIT_DEFAULT_RATIO).toBe(0.5);
    expect(MANAGEMENT_MAIN_SPLIT_MIN_RATIO).toBe(0.5);
    expect(binding.minSize).toBe(0.5);
    expect(binding.maxSize).toBe(DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.max);
    binding.onResizeEnd(0.5);
    expect(onResizeEnd).toHaveBeenCalledWith(0.5);
  });

  it('keeps Resource management state independent from creative Main and Agent placement', () => {
    const initial = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      display: { mode: 'chat-main' as const, chatPosition: 'right' as const, chatWidth: 360 },
    };
    const revealed = setResourceDockPresentationWorkbench(initial, 'docked');
    expect(revealed.resourceDock).toEqual({ presentation: 'docked', width: 320 });
    expect(revealed.display).toEqual(initial.display);
    expect(revealed.main).toEqual(initial.main);
    expect(applyWorkbenchDisplayMode(revealed, 'chat-main-right').display.chatPosition).toBe(
      'right',
    );
  });

  it('toggles Agent, Main, management and Cut through one canonical layout projection', () => {
    const initial = activeWorkbenchLayout(workspaceProjection());
    const withoutAgent = toggleWorkbenchRegion(initial, 'agent');
    expect(withoutAgent.display.mode).toBe('main-only');
    expect(withoutAgent.resourceDock).toEqual(initial.resourceDock);

    const restoredAgent = toggleWorkbenchRegion(withoutAgent, 'agent');
    expect(restoredAgent.display.mode).toBe('chat-main');
    expect(restoredAgent.main).toEqual(initial.main);

    const withoutMain = toggleWorkbenchRegion(initial, 'main');
    expect(withoutMain.display.mode).toBe('chat-only');
    expect(withoutMain.resourceDock).toEqual(initial.resourceDock);

    const withoutManagement = toggleWorkbenchRegion(initial, 'management');
    expect(withoutManagement.resourceDock.presentation).toBe('hidden');
    expect(withoutManagement.display).toEqual(initial.display);
    expect(withoutManagement.main).toEqual(initial.main);

    const withoutCutPanel = toggleWorkbenchRegion(initial, 'cutPanel');
    expect(withoutCutPanel.cutPanel?.presentation).toBe('hidden');
    expect(withoutCutPanel.main).toEqual(initial.main);
    expect(withoutCutPanel.display).toEqual(initial.display);
    expect(withoutCutPanel.resourceDock).toEqual(initial.resourceDock);

    const restoredCutPanel = toggleWorkbenchRegion(withoutCutPanel, 'cutPanel');
    expect(restoredCutPanel.cutPanel?.presentation).toBe('docked');
    expect(restoredCutPanel.main).toEqual(initial.main);

    const cutOnlyFromMain = toggleWorkbenchRegion(withoutAgent, 'main');
    expect(cutOnlyFromMain.display.mode).toBe('empty-main');
    expect(cutOnlyFromMain.cutPanel?.presentation).toBe('docked');

    const cutOnlyFromAgent = toggleWorkbenchRegion(withoutMain, 'agent');
    expect(cutOnlyFromAgent.display.mode).toBe('empty-main');
    expect(toggleWorkbenchRegion(cutOnlyFromAgent, 'agent').display.mode).toBe('chat-only');
    expect(toggleWorkbenchRegion(cutOnlyFromAgent, 'main').display.mode).toBe('main-only');
    expect(() => toggleWorkbenchRegion(cutOnlyFromAgent, 'cutPanel')).toThrow(
      'cannot hide the last visible business region',
    );

    const withoutCutAndAgent = toggleWorkbenchRegion(withoutCutPanel, 'agent');
    expect(() => toggleWorkbenchRegion(withoutCutAndAgent, 'main')).toThrow(
      'cannot hide the last visible business region',
    );
  });

  it('switches Cut Panel tabs without replacing the active Main Canvas', () => {
    const initial = activeWorkbenchLayout(workspaceProjection());
    const firstCut = initial.cutPanel!.views[0]!;
    const withSecondCut = openOrFocusCutView(initial, {
      ...firstCut,
      viewId: 'cut:view-1:alternate',
      ownerId: 'cut-session:alternate',
      displayLabel: 'alternate.otio',
      documentId: 'cuts/alternate.otio',
    });
    expect(withSecondCut.cutPanel?.activeViewId).toBe('cut:view-1:alternate');
    expect(withSecondCut.cutPanel?.views).toHaveLength(2);
    expect(withSecondCut.main).toEqual(initial.main);

    const { cutPanel: _cutPanel, ...withoutCutPanel } = withSecondCut;
    expect(() => toggleWorkbenchRegion(withoutCutPanel, 'cutPanel')).toThrow(
      'cannot toggle Cut Panel without an attached Cut View',
    );
  });

  it('expands Cut across Main when Agent and Main are hidden', () => {
    const projection = workspaceProjection();
    const layout = activeWorkbenchLayout(projection);
    const mainHidden = toggleWorkbenchRegion(layout, 'main');
    const cutOnly = toggleWorkbenchRegion(mainHidden, 'agent');
    const markup = renderShell(
      <DesktopShellView projection={withWorkbench(projection, workspaceScene(), cutOnly)} />,
    );

    expect(cutOnly.display.mode).toBe('empty-main');
    expect(markup).toContain('data-interaction-presentation="hidden"');
    expect(markup).toContain('data-bottom-panel-visible="true"');
    expect(markup).toContain('data-bottom-panel-presentation="expanded"');
    expect(markup).toContain('data-workbench-slot="main"');
    expect(markup).toContain('data-workbench-slot="bottomPanel"');
    expect(markup).not.toContain('data-main-view-id=');
    expect(markup).not.toContain('Connecting to Agent');
  });

  it('keeps Agent docked and expands Cut when Main is hidden', () => {
    const projection = workspaceProjection();
    const layout = activeWorkbenchLayout(projection);
    const withoutMain = toggleWorkbenchRegion(layout, 'main');
    const markup = renderShell(
      <DesktopShellView projection={withWorkbench(projection, workspaceScene(), withoutMain)} />,
    );

    expect(withoutMain.display.mode).toBe('chat-only');
    expect(markup).toContain('data-interaction-presentation="docked"');
    expect(markup).toContain('data-bottom-panel-presentation="expanded"');
    expect(markup).toContain('data-workbench-slot="bottomPanel"');
  });

  it('returns Cut below Main when Main is visible', () => {
    const projection = workspaceProjection();
    const layout = activeWorkbenchLayout(projection);
    const markup = renderShell(
      <DesktopShellView projection={withWorkbench(projection, workspaceScene(), layout)} />,
    );

    expect(markup).toContain('data-interaction-presentation="docked"');
    expect(markup).toContain('data-bottom-panel-presentation="docked"');
    expect(markup).toContain('data-workbench-slot="bottomPanel"');
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

  it('places structural Workspace controls in shared Workbench title chrome only', () => {
    const markup = renderShell(<DesktopShellView projection={workspaceProjection()} />);
    const sidebarControls = markup.match(
      /<div class="primary-sidebar-brand__controls">([\s\S]*?)<\/div>/u,
    )?.[1];
    const titleChrome = markup.match(
      /<div class="neko-controlled-workbench-title">([\s\S]*?)<\/div><\/div>/u,
    )?.[1];
    if (!titleChrome) throw new Error('Workspace title chrome is missing.');

    expect(sidebarControls).toContain('data-workbench-region-control="primary-sidebar"');
    expect(sidebarControls).not.toContain('data-workbench-region-control="agent"');
    expect(sidebarControls).not.toContain('data-workbench-region-control="main"');
    expect(sidebarControls).not.toContain('data-workbench-region-control="management"');
    expect(titleChrome).toContain('data-workbench-region-control="agent"');
    expect(titleChrome).toContain('data-workbench-region-control="creative-panels"');
    expect(titleChrome).toContain('data-workbench-region-control="management"');
    expect(titleChrome).not.toContain('data-workbench-region-control="main"');
    expect(titleChrome).not.toContain('data-workbench-region-control="cut-panel"');
    const controlOrder = ['agent', 'creative-panels', 'management'].map((region) =>
      titleChrome.indexOf(`data-workbench-region-control="${region}"`),
    );
    expect(controlOrder.every((index) => index >= 0)).toBe(true);
    expect(controlOrder).toEqual([...controlOrder].sort((left, right) => left - right));
    expect(titleChrome).toContain('codicon-layout-sidebar-left');
    expect(titleChrome).toContain('codicon-layout');
    expect(titleChrome).toContain('codicon-layout-sidebar-right');
    expect(desktopShellSource).toContain('data-workbench-region-option="main"');
    expect(desktopShellSource).toContain('data-workbench-region-option="cut-panel"');
    expect(markup).not.toContain('aria-label="Close resource management"');
    const footer = markup.match(/<div class="home-navigation-footer">([\s\S]*?)<\/div>/u)?.[1];
    expect(footer).not.toContain('data-workbench-region-control');
    expect(markup).not.toContain('project-main-group__actions');
    expect(markup).not.toContain('project-main-chat-host__controls');
  });

  it('keeps the Cut-owned add command immediately after the Cut tab list', () => {
    const start = desktopShellSource.indexOf('function CutPanelSurface');
    const end = desktopShellSource.indexOf('function MainViewGroupSurface', start);
    const cutPanelSource = desktopShellSource.slice(start, end);

    expect(cutPanelSource).toContain('project-cut-panel__tabs');
    expect(cutPanelSource).toContain('<WorkbenchEditorTabs');
    expect(cutPanelSource).toContain('data-cut-tab-add="true"');
    expect(cutPanelSource).toContain("label={t('workspace.cutTabs.add')}");
    expect(cutPanelSource).toContain('actions.onCreateCutDraft(workbenchInstanceId)');
    expect(cutPanelSource.indexOf('data-cut-tab-add="true"')).toBeGreaterThan(
      cutPanelSource.indexOf('<WorkbenchEditorTabs'),
    );
  });

  it('selects Workspace region controls only while their exact layout regions are visible', () => {
    const projection = workspaceProjection();
    const scene = workspaceScene();
    const layout = activeWorkbenchLayout(projection);
    const visibleRegions = ['agent', 'creative-panels', 'management'] as const;
    const initialMarkup = renderShell(<DesktopShellView projection={projection} />);

    for (const region of visibleRegions) {
      expectWorkspaceRegionControl(initialMarkup, region, { selected: true, disabled: false });
    }

    for (const [region, workbenchRegion] of [
      ['agent', 'agent'],
      ['management', 'management'],
    ] as const) {
      const markup = renderShell(
        <DesktopShellView
          projection={withWorkbench(
            projection,
            scene,
            toggleWorkbenchRegion(layout, workbenchRegion),
          )}
        />,
      );
      expectWorkspaceRegionControl(markup, region, { selected: false, disabled: false });
      for (const sibling of visibleRegions.filter((candidate) => candidate !== region)) {
        expectWorkspaceRegionControl(markup, sibling, { selected: true });
      }
    }

    const mainHidden = toggleWorkbenchRegion(layout, 'main');
    const allCreativePanelsHidden = toggleWorkbenchRegion(mainHidden, 'cutPanel');
    const hiddenCreativeMarkup = renderShell(
      <DesktopShellView projection={withWorkbench(projection, scene, allCreativePanelsHidden)} />,
    );
    expectWorkspaceRegionControl(hiddenCreativeMarkup, 'creative-panels', {
      selected: false,
      disabled: false,
    });

    const { cutPanel: _cutPanelSlot, ...slotsWithoutCutPanel } = scene.slots;
    const sceneWithoutCutPanel = parseDesktopWorkbenchSceneProjection({
      ...scene,
      slots: slotsWithoutCutPanel,
    });
    const hiddenCutMarkup = renderShell(
      <DesktopShellView
        projection={withWorkbench(
          projection,
          sceneWithoutCutPanel,
          toggleWorkbenchRegion(layout, 'cutPanel'),
        )}
      />,
    );
    expectWorkspaceRegionControl(hiddenCutMarkup, 'creative-panels', { selected: true });

    const dockedCutWithoutSurfaceMarkup = renderShell(
      <DesktopShellView projection={withWorkbench(projection, sceneWithoutCutPanel, layout)} />,
    );
    expectWorkspaceRegionControl(dockedCutWithoutSurfaceMarkup, 'creative-panels', {
      selected: true,
    });

    const { cutPanel: _cutPanelLayout, ...layoutWithoutCutPanel } = layout;
    const missingCutMarkup = renderShell(
      <DesktopShellView
        projection={withWorkbench(projection, sceneWithoutCutPanel, layoutWithoutCutPanel)}
      />,
    );
    expectWorkspaceRegionControl(missingCutMarkup, 'creative-panels', { selected: true });

    const unavailableCutMarkup = renderShell(
      <DesktopShellView
        projection={{
          ...withWorkbench(projection, sceneWithoutCutPanel, layoutWithoutCutPanel),
          domains: projection.domains.map((domain) =>
            domain.surface === 'cut'
              ? {
                  ...domain,
                  status: 'unavailable' as const,
                  diagnosticCode: 'desktop-domain-surface-unavailable' as const,
                }
              : domain,
          ),
        }}
      />,
    );
    expectWorkspaceRegionControl(unavailableCutMarkup, 'creative-panels', { selected: true });

    const { main: _mainSlot, ...slotsWithoutMain } = scene.slots;
    const sceneWithoutMain = parseDesktopWorkbenchSceneProjection({
      ...scene,
      slots: slotsWithoutMain,
    });
    const mainView = layout.main.views[0];
    if (!mainView) throw new Error('Workspace Main View is missing.');
    const layoutWithoutMain = closeMainView(layout, mainView.viewId);
    const missingMainSurfaceMarkup = renderShell(
      <DesktopShellView
        projection={withWorkbench(projection, sceneWithoutMain, layoutWithoutMain)}
      />,
    );
    expectWorkspaceRegionControl(missingMainSurfaceMarkup, 'creative-panels', {
      selected: true,
      disabled: false,
    });
    expectWorkspaceRegionControl(missingMainSurfaceMarkup, 'agent', {
      selected: true,
      disabled: false,
    });
  });

  it('keeps entry mode configuration out of Desktop Scene navigation controls', () => {
    const markup = renderShell(<DesktopShellView projection={agentProjection()} />);
    expect(markup.match(/data-workbench-region-control=/gu) ?? []).toHaveLength(1);
    expect(markup).toContain('data-workbench-region-control="primary-sidebar"');
    expect(markup).not.toContain('desktop-home-experience-navigation');
    expect(desktopShellSource).not.toContain('DesktopHomeExperienceNavigation');
    expect(markup).not.toContain('class="workspace-region-controls"');
  });

  it('creates management runtimes only for the current Scene', () => {
    expect(desktopShellSource).not.toContain('interactive={interactive && active}');
    expect(desktopShellSource).toContain(
      "if (!input.active || !assetCenterSessionId || typeof window === 'undefined')",
    );
    expect(desktopShellSource).toContain("const active = scene.context.kind === 'extensions'");
  });

  it('reserves Settings navigation and Main portal targets in the same Workbench', () => {
    const markup = renderShell(
      <DesktopShellView projection={projectionWithScene(settingsScene('appearance'))} />,
    );
    expect(markup).toContain('data-workbench-slot="leftDock"');
    expect(markup).toContain('data-workbench-slot="main"');
    expect(markup).not.toContain('data-lifecycle=');
    expect(markup).not.toContain('data-primary-sidebar-frame="application"');
  });

  it.each([
    ['asset-management', projectionWithScene(assetCenterScene())],
    ['extension-management', projectionWithScene(extensionsScene())],
    ['project-management', projectionWithScene(projectManagementScene())],
  ])('uses one tabless current Main target for %s', (_panelId, projection) => {
    const markup = renderShell(<DesktopShellView projection={projection} />);

    expect(markup).toContain('data-workbench-slot="main"');
    expect(markup.match(/data-workbench-slot="main"/gu) ?? []).toHaveLength(1);
    expect(markup).toContain('data-main-split="none"');
    expect(markup).not.toContain('project-main-group__tabs');
  });

  it('composes management Main and detail surfaces edge-to-edge at an equal split', () => {
    const scene = assetCenterScene();
    const markup = renderShell(
      <DesktopShellView
        projection={projectionWithScene(
          parseDesktopWorkbenchSceneProjection({
            ...scene,
            slots: {
              ...scene.slots,
              secondaryMain: {
                kind: 'asset-preview',
                assetCenterSessionId: 'asset-center-1',
                previewSessionId: 'preview:asset-center:1',
              },
            },
          }),
        )}
      />,
    );

    expect(markup).toContain('data-main-split="columns"');
    expect(markup).toContain('data-main-composition="continuous"');
    expect(markup).toContain('--neko-controlled-main-split-ratio:50%');
    expect(markup).toContain('aria-label="Resize Main split"');
    expect(markup).not.toContain('data-workbench-main-gutter="true"');
  });

  it('mounts Asset Preview only from the same Scene and AssetCenterSession ref', () => {
    const scene = assetCenterScene();
    const session = {
      identity: { assetCenterSessionId: 'asset-center-1', windowId: 'window-1' },
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
    expect(assetMarkup).toContain('neko-controlled-workbench-dock--left');
    expect(assetMarkup).not.toContain('data-workbench-slot="leftDock"');
  });

  it('mounts one current Workspace Agent and only its visible slots without a nested Shell', () => {
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
    expect(markup).toContain('data-agent-scope="workspace"');
    expect(markup).toContain('data-workbench-slot="main"');
    expect(markup).toContain('data-workbench-slot="rightDock"');
    expect(markup).toContain('data-workbench-slot="bottomPanel"');
    expect(markup).toMatch(
      /data-workbench-region-control="creative-panels"[^>]*aria-pressed="true"/u,
    );
    vi.unstubAllGlobals();
  });

  it('maps Workspace only from the exact scene View', () => {
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
            viewInstanceId: 'view-instance-1',
          },
        ],
      },
    };
    const markup = renderShell(<DesktopShellView projection={misleading} />);
    expect(markup).toContain('Connecting to Agent');
    expect(markup).toContain('data-agent-scope="unbound"');
    expect(markup).not.toContain('data-main-view-id=');

    const workspace = workspaceProjection();
    const workspaceLayout = activeWorkbenchLayout(workspace);
    expect(() =>
      renderShell(
        <DesktopShellView
          projection={withWorkbench(workspace, workspaceScene(), {
            ...workspaceLayout,
            main: {
              ...workspaceLayout.main,
              views: workspaceLayout.main.views.map((view) => ({
                ...view,
                viewInstanceId: 'view-instance-replaced',
              })),
            },
          })}
        />,
      ),
    ).toThrow('Workspace Scene Main Surface has no exact Workbench View');
  });

  it('uses one Workbench shell and the package-owned Asset Management surface', () => {
    expect(desktopShellSource.match(/<ControlledWorkbenchShell/gu) ?? []).toHaveLength(1);
    expect(desktopShellSource).toContain('onChooseWorkspaceTarget');
    expect(desktopShellSource).toContain('AgentComposerWorkspaceTarget');
    expect(assetManagementSurfaceSource).toContain('@neko/assets-webview/asset-management/root');
  });
});

function renderShell(node: JSX.Element): string {
  const i18n = createDesktopI18n('en');
  return renderToStaticMarkup(
    <I18nProvider service={i18n.i18nService}>
      <DesktopApplicationSettingsProvider
        value={{
          projection: {
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
    viewInstanceId: 'view-instance-1',
  };
  const canvasViewId = 'canvas:view-1:board';
  const cutViewId = 'cut:view-1:story';
  const layout = {
    ...createDefaultDesktopWorkbenchLayout('window-1'),
    resourceDock: { presentation: 'docked' as const, width: 344 },
    display: { mode: 'chat-main' as const, chatPosition: 'left' as const, chatWidth: 376 },
    main: {
      views: [
        {
          viewId: canvasViewId,
          viewInstanceId: 'view-instance-1',
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          kind: 'canvas' as const,
          ownerId: 'canvas-document:board',
          displayLabel: 'board.neko',
          documentId: 'canvas/board.neko',
        },
      ],
      groups: [
        {
          groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
          viewIds: [canvasViewId],
          activeViewId: canvasViewId,
        },
      ],
      activeGroupId: DESKTOP_PRIMARY_MAIN_GROUP_ID,
    },
    cutPanel: {
      presentation: 'docked' as const,
      height: 420,
      activeViewId: cutViewId,
      views: [
        {
          viewId: cutViewId,
          viewInstanceId: 'view-instance-1',
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          kind: 'cut' as const,
          ownerId: 'cut-session:story',
          displayLabel: 'story.otio',
          documentId: 'cuts/story.otio',
        },
      ],
    },
  };
  return withWorkbench(
    {
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
      },
    },
    workspaceScene(),
    layout,
  );
}

function projectionWithScene(scene: DesktopWorkbenchSceneProjection): DesktopShellProjection {
  const base = baseProjection();
  return withWorkbench(base, scene, createDefaultDesktopWorkbenchLayout('window-1'));
}

function baseProjection(): DesktopShellProjection {
  const catalog = {
    projects: [projectFixture('workspace-1', '2026-07-27T00:00:00.000Z')],
  };
  const agentHome = {
    conversations: [
      {
        navigation: {
          conversationId: 'conversation-1',
          owner: { kind: 'workspace' as const, workspaceId: 'workspace-1' },
        },
        title: 'Conversation one',
        updatedAt: '2026-07-29T00:00:00.000Z',
        attention: 'none' as const,
        lastActivity: {
          kind: 'conversation-updated' as const,
          occurredAt: '2026-07-29T00:00:00.000Z',
        },
      },
    ],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  };
  const scene = createDefaultDesktopAgentScene('window-1', 'draft:test');
  const instance = createDesktopWindowComposition({
    workbenchInstanceId: 'workbench:window-1:entry',
    layout: createDefaultDesktopWorkbenchLayout('window-1'),
    scene,
  });
  return {
    applicationInstanceId: 'app-1',
    rendererSessionId: 'app-1:window-1:1',
    catalog,
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: instance,
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome,
    conversationNavigation: projectDesktopConversationNavigation(
      catalog,
      agentHome,
      catalog.projects.map((project) => project.projectId),
    ),
    domains: [],
  };
}

function activeWorkbenchLayout(projection: DesktopShellProjection) {
  return resolveActiveDesktopWindowWorkbench(projection.window).layout;
}

function withWorkbench(
  projection: DesktopShellProjection,
  scene: DesktopWorkbenchSceneProjection,
  layout: ReturnType<typeof createDefaultDesktopWorkbenchLayout>,
): DesktopShellProjection {
  const current = resolveActiveDesktopWindowWorkbench(projection.window);
  const instance = createDesktopWindowComposition({
    workbenchInstanceId: current.workbenchInstanceId,
    layout,
    scene,
  });
  return {
    ...projection,
    window: {
      ...projection.window,
      workbench: instance,
    },
  };
}

function workspaceScene(): DesktopWorkbenchSceneProjection {
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft-workspace-1',
    workspaceId: 'workspace-1',
    workspaceGrantId: 'workspace-grant-1',
  };
  return parseDesktopWorkbenchSceneProjection({
    sceneId: 'scene:window-1:workspace-1',
    windowId: 'window-1',
    context: { kind: 'agent', agentViewId: 'view-1', scope },
    slots: {
      interaction: {
        kind: 'agent',
        agentSurfaceId: 'agent-surface:workspace-1',
        agentViewId: 'view-1',
        phase: 'draft',
        scope,
      },
      main: {
        kind: 'workspace-main',
        workspaceId: 'workspace-1',
        viewId: 'canvas:view-1:board',
        viewInstanceId: 'view-instance-1',
      },
      rightManager: { kind: 'workspace-resources', workspaceId: 'workspace-1' },
      cutPanel: {
        kind: 'workspace-cut',
        workspaceId: 'workspace-1',
        viewId: 'cut:view-1:story',
        viewInstanceId: 'view-instance-1',
        ownerId: 'cut-session:story',
      },
      status: { kind: 'scene-status', sceneId: 'scene:window-1:workspace-1' },
    },
  });
}

function expectWorkspaceRegionControl(
  markup: string,
  region: 'agent' | 'creative-panels' | 'management',
  expected: { readonly selected: boolean; readonly disabled?: boolean },
): void {
  const control = markup.match(
    new RegExp(`<button[^>]*data-workbench-region-control="${region}"[^>]*>`, 'u'),
  )?.[0];
  expect(control).toBeDefined();
  expect(control).toContain(`aria-pressed="${String(expected.selected)}"`);
  if (expected.disabled !== undefined) {
    expect(/\sdisabled(?:=""|(?=\s|>))/u.test(control ?? '')).toBe(expected.disabled);
  }
}

function assetCenterScene(): DesktopWorkbenchSceneProjection {
  return managementScene('asset-center');
}

function assistantPreviewScene(): DesktopWorkbenchSceneProjection {
  const draft = createDefaultDesktopAgentScene('window-1', 'draft-assistant-1');
  const scope = {
    kind: 'assistant' as const,
    draftId: 'draft-assistant-1',
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
      sceneId,
      windowId: 'window-1',
      context: { kind, assetCenterSessionId: 'asset-center-1' },
      slots: {
        main: { kind: 'asset-management', assetCenterSessionId: 'asset-center-1' },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (kind === 'extensions') {
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId: 'window-1',
      context: { kind },
      slots: {
        main: { kind: 'extension-management' },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  if (kind === 'project-management') {
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId: 'window-1',
      context: { kind },
      slots: {
        main: { kind: 'project-management' },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  return parseDesktopWorkbenchSceneProjection({
    sceneId,
    windowId: 'window-1',
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
