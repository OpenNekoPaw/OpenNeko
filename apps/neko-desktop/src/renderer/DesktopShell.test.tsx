import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  projectDesktopConversationNavigation,
  resolveActiveDesktopWindowWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  ASSET_CENTER_MAIN_SPLIT_DEFAULT_RATIO,
  applyWorkbenchDisplayMode,
  createManagementMainSplitResizeBinding,
  createDesktopAgentSurfaceProps,
  DesktopShellView,
  MANAGEMENT_MAIN_SPLIT_DEFAULT_RATIO,
  MANAGEMENT_MAIN_SPLIT_MIN_RATIO,
  matchesWorkspaceAuthoringMainSurface,
  projectDesktopShellInteractionLocks,
  resizeApplicationSidebar,
  resizeProjectDockWorkbench,
  resolveAssetCenterPreviewSession,
  setResourceDockPresentationWorkbench,
  toggleWorkbenchRegion,
} from './DesktopShell';
import { filterAndSortProjectCatalog, parseProjectCatalogSort } from '@neko/project-webview/root';
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
  it('projects only an exact existing Conversation into the DSH surface', () => {
    const projection = agentProjection();
    const composition = resolveActiveDesktopWindowWorkbench(projection.window);
    const interaction = composition.scene.slots.interaction;
    if (!interaction || interaction.kind !== 'agent' || interaction.scope.kind === 'workspace') {
      throw new Error('Agent projection requires an unbound interaction surface.');
    }
    expect(
      createDesktopAgentSurfaceProps({
        workbenchInstanceId: 'workbench-1',
        sceneId: 'scene-entry',
        interaction,
      }),
    ).toEqual({
      agentSurfaceId: interaction.agentSurfaceId,
      sceneId: 'scene-entry',
      surfaceKind: 'entry',
      workbenchInstanceId: 'workbench-1',
    });

    const sessionInteraction = {
      ...interaction,
      phase: 'session' as const,
      scope: {
        kind: 'assistant' as const,
        draftId: interaction.scope.draftId,
        assistantSpaceId: 'assistant-1',
        conversationId: 'conversation-1',
      },
    };
    expect(
      createDesktopAgentSurfaceProps({
        workbenchInstanceId: 'workbench-1',
        sceneId: 'scene-assistant',
        interaction: sessionInteraction,
      }),
    ).toEqual({
      agentSurfaceId: interaction.agentSurfaceId,
      sceneId: 'scene-assistant',
      surfaceKind: 'assistant',
      workbenchInstanceId: 'workbench-1',
      conversationId: 'conversation-1',
    });

    const workspaceInteraction = {
      ...interaction,
      scope: {
        kind: 'workspace' as const,
        draftId: interaction.scope.draftId,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
    };
    expect(
      createDesktopAgentSurfaceProps({
        workbenchInstanceId: 'workbench-1',
        sceneId: 'scene-workspace',
        interaction: workspaceInteraction,
      }),
    ).toEqual({
      agentSurfaceId: interaction.agentSurfaceId,
      sceneId: 'scene-workspace',
      surfaceKind: 'workspace',
      workbenchInstanceId: 'workbench-1',
    });
  });

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
    expect(parseProjectCatalogSort('updated-ascending')).toBe('updated-ascending');
    expect(() => parseProjectCatalogSort('recent')).toThrow('Unknown Project catalog sort option');

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
    expect(ASSET_CENTER_MAIN_SPLIT_DEFAULT_RATIO).toBe(0.6);
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

  it('restores a fresh empty Main from Cut-only without fabricating a Main View', () => {
    const fresh = createDefaultDesktopWorkbenchLayout('window-empty');
    const withCut = openOrFocusCutView(fresh, {
      viewId: 'cut:empty',
      viewInstanceId: 'cut-view:empty',
      projectId: 'content:empty',
      workspaceId: 'workspace-empty',
      kind: 'cut',
      ownerId: 'cut-session:empty',
      displayLabel: 'empty.otio',
      documentId: 'cuts/empty.otio',
    });
    const withoutMain = toggleWorkbenchRegion(withCut, 'main');
    const cutOnly = toggleWorkbenchRegion(withoutMain, 'agent');
    const restoredMain = toggleWorkbenchRegion(cutOnly, 'main');

    expect(cutOnly.display.mode).toBe('empty-main');
    expect(restoredMain.display.mode).toBe('main-only');
    expect(restoredMain.main.views).toEqual([]);
    expect(restoredMain.main.groups).toEqual([{ groupId: 'main:primary', viewIds: [] }]);
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

  it('renders the canonical stable and Development primary Sidebar navigation', () => {
    const markup = renderShell(<DesktopShellView projection={agentProjection()} />);
    const primaryNavigation = markup.match(
      /<nav class="home-primary-navigation"[\s\S]*?<\/nav>/u,
    )?.[0];
    if (!primaryNavigation) throw new Error('Primary product navigation is missing.');

    expect(primaryNavigation.match(/class="home-nav-button/gu) ?? []).toHaveLength(7);
    expect(primaryNavigation).toContain('aria-label="Start creating"');
    expect(primaryNavigation).toContain('aria-label="Projects"');
    expect(primaryNavigation).toContain('aria-label="Works"');
    expect(primaryNavigation).toContain('aria-label="Asset Library"');
    expect(primaryNavigation).toContain('aria-label="Extensions"');
    expect(primaryNavigation).toContain('aria-label="Characters"');
    expect(primaryNavigation).toContain('aria-label="Worlds"');
    expect(primaryNavigation).toContain('data-navigation-group="experimental"');
    expect(primaryNavigation.indexOf('aria-label="Projects"')).toBeLessThan(
      primaryNavigation.indexOf('aria-label="Works"'),
    );
    expect(primaryNavigation.indexOf('aria-label="Works"')).toBeLessThan(
      primaryNavigation.indexOf('aria-label="Asset Library"'),
    );
    expect(primaryNavigation.indexOf('aria-label="Asset Library"')).toBeLessThan(
      primaryNavigation.indexOf('aria-label="Extensions"'),
    );
    expect(primaryNavigation.indexOf('aria-label="Extensions"')).toBeLessThan(
      primaryNavigation.indexOf('aria-label="Characters"'),
    );
    expect(primaryNavigation).not.toContain('aria-label="Conversation"');
    expect(primaryNavigation).not.toContain('aria-label="Creation"');
  });

  it('hides Character and World navigation only in the Release capability projection', () => {
    const markup = renderShell(
      <DesktopShellView
        projection={projectionWithScene(
          createDefaultDesktopAgentScene('window-1', 'release-draft'),
        )}
      />,
    );
    const primaryNavigation = markup.match(
      /<nav class="home-primary-navigation"[\s\S]*?<\/nav>/u,
    )?.[0];
    if (!primaryNavigation) throw new Error('Primary product navigation is missing.');

    expect(primaryNavigation.match(/class="home-nav-button/gu) ?? []).toHaveLength(5);
    expect(primaryNavigation).not.toContain('aria-label="Characters"');
    expect(primaryNavigation).not.toContain('aria-label="Worlds"');
    expect(primaryNavigation).not.toContain('data-navigation-group="experimental"');
    expect(markup).not.toContain('data-navigation-section="characters"');
    expect(markup).not.toContain('data-navigation-section="worlds"');
    expect(primaryNavigation).toContain('aria-label="Start creating"');
    expect(primaryNavigation).toContain('aria-label="Projects"');
    expect(primaryNavigation).toContain('aria-label="Works"');
    expect(primaryNavigation).toContain('aria-label="Asset Library"');
    expect(primaryNavigation).toContain('aria-label="Extensions"');
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

  it('keeps Workspace quick creation beside Main tabs and in only the Workspace empty state', () => {
    const start = desktopShellSource.indexOf('function MainViewGroupSurface');
    const end = desktopShellSource.indexOf('function renderWorkbenchMainView', start);
    const mainGroupSource = desktopShellSource.slice(start, end);
    const standaloneEmptyStart = desktopShellSource.indexOf(
      'data-authoring-authority="standalone-empty"',
    );
    const standaloneEmptyEnd = desktopShellSource.indexOf('return { main:', standaloneEmptyStart);
    const standaloneEmptySource = desktopShellSource.slice(
      standaloneEmptyStart,
      standaloneEmptyEnd,
    );

    expect(mainGroupSource).toContain('<WorkbenchEditorTabs');
    expect(mainGroupSource).toContain('variant="tab"');
    expect(mainGroupSource).toContain('variant="empty"');
    expect(mainGroupSource).toContain('<EmptyMainSurface');
    expect(mainGroupSource.indexOf('variant="tab"')).toBeGreaterThan(
      mainGroupSource.indexOf('<WorkbenchEditorTabs'),
    );
    expect(standaloneEmptySource).toContain('<EmptyMainSurface />');
    expect(standaloneEmptySource).not.toContain('WorkspaceQuickCreateControl');
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

  it('keeps Skill/MCP management full-width without exposing a Plugin detail panel', () => {
    const markup = renderShell(
      <DesktopShellView projection={projectionWithScene(extensionsScene())} />,
    );

    expect(markup).toContain('data-main-split="none"');
    expect(markup).toContain('data-main-composition="continuous"');
    expect(markup).not.toContain('data-workbench-slot="secondaryMain"');
    expect(markup).not.toContain('aria-label="Resize Main split"');
    expect(markup).not.toContain('data-workbench-main-gutter="true"');
  });

  it.each([
    ['asset-management', projectionWithScene(assetCenterScene())],
    ['project-management', projectionWithScene(projectManagementScene())],
  ])('uses one tabless current Main target for %s', (_panelId, projection) => {
    const markup = renderShell(<DesktopShellView projection={projection} />);

    expect(markup).toContain('data-workbench-slot="main"');
    expect(markup.match(/data-workbench-slot="main"/gu) ?? []).toHaveLength(1);
    expect(markup).toContain('data-main-split="none"');
    expect(markup).not.toContain('project-main-group__tabs');
  });

  it('composes Asset management as the primary-width surface beside Preview', () => {
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
    expect(markup).toContain('--neko-controlled-main-split-ratio:60%');
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
    expect(markup).toContain('Hi, start creating with a conversation');
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

  it('maps Character and World authoring only from exact target-qualified Views', () => {
    const characterView = {
      viewId: 'view:character-1',
      viewInstanceId: 'view-instance:character-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'character-authoring' as const,
      ownerId: 'character',
      displayLabel: 'Lead',
      characterProjectId: 'character-project-1',
    };
    const characterSurface = {
      kind: 'character-authoring' as const,
      workspaceId: 'workspace-1',
      authority: { kind: 'project' as const, projectId: 'project-1' },
      viewId: 'view:character-1',
      viewInstanceId: 'view-instance:character-1',
      characterProjectId: 'character-project-1',
    };
    expect(matchesWorkspaceAuthoringMainSurface(characterView, characterSurface, 'project-1')).toBe(
      true,
    );
    expect(
      matchesWorkspaceAuthoringMainSurface(
        characterView,
        { ...characterSurface, characterProjectId: 'character-project-other' },
        'project-1',
      ),
    ).toBe(false);
    expect(
      matchesWorkspaceAuthoringMainSurface(
        {
          ...characterView,
          kind: 'world-authoring',
          characterProjectId: undefined,
          worldProjectId: 'world-project-1',
        },
        {
          kind: 'world-authoring',
          workspaceId: 'workspace-1',
          authority: { kind: 'project', projectId: 'project-1' },
          viewId: 'view:character-1',
          viewInstanceId: 'view-instance:character-1',
          worldProjectId: 'world-project-1',
        },
        'project-other',
      ),
    ).toBe(false);
  });

  it('uses one Workbench shell and the package-owned Asset Management surface', () => {
    expect(desktopShellSource.match(/<ControlledWorkbenchShell/gu) ?? []).toHaveLength(1);
    expect(desktopShellSource).not.toContain('onChooseWorkspaceTarget');
    expect(desktopShellSource).not.toContain('AgentComposerWorkspaceTarget');
    expect(assetManagementSurfaceSource).toContain('@neko/assets-webview/asset-management/root');
  });

  it('maps project-local authoring through public package Roots without domain file access', () => {
    expect(desktopShellSource).toContain('CharacterAuthoringSurface');
    expect(desktopShellSource).toContain('WorldAuthoringStudioRoot');
    expect(desktopShellSource).toContain('ProjectAuthoringTargetSwitchRoot');
    expect(desktopShellSource).toContain('@neko/chara-webview/root');
    expect(desktopShellSource).toContain('@neko/world-webview/root');
    expect(desktopShellSource).not.toContain('@neko/chara-node');
    expect(desktopShellSource).not.toContain('@neko/world-node');
    expect(desktopShellSource).not.toMatch(/node:fs|readFile|writeFile|workspacePath/u);
  });

  it('opens project-local World authoring in Secondary Main without replacing the Board', () => {
    const start = desktopShellSource.indexOf('const openWorkspaceTarget =');
    const end = desktopShellSource.indexOf('const resourceDock =', start);
    const source = desktopShellSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(source).toContain("target.kind === 'character-project'");
    expect(source).toContain('groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID');
  });

  it('mounts only the visible management or authoring Root during exact Scene switching', () => {
    const portalDeckStart = desktopShellSource.indexOf('const portalDeck =');
    const portalDeckEnd = desktopShellSource.indexOf('return (', portalDeckStart);
    const portalDeckSource = desktopShellSource.slice(portalDeckStart, portalDeckEnd);
    expect(portalDeckSource).toContain('visible ?');
    expect(portalDeckSource).toContain('<DesktopWorkbenchPortalTarget');
    expect(portalDeckSource).not.toMatch(/display:\s*none|visibility:\s*hidden/u);

    const runtimeStart = desktopShellSource.indexOf('function DesktopWorkbenchRuntimePortals(');
    const runtimeEnd = desktopShellSource.indexOf('type DesktopWorkbenchPortalSlot', runtimeStart);
    const runtimeSource = desktopShellSource.slice(runtimeStart, runtimeEnd);
    expect(runtimeSource).toContain("scene.context.kind === 'creative-management'");
    expect(runtimeSource).toContain("scene.context.scope.kind === 'workspace'");
    expect(runtimeSource).not.toMatch(/retainedManagement|hiddenCharacter|studioPortalDeck/u);
  });

  it('keeps Character management read-only and does not open Project authoring from management', () => {
    const detailStart = desktopShellSource.indexOf('<CharacterDetailSurface');
    const detailEnd = desktopShellSource.indexOf('/>', detailStart);
    const detailSource = desktopShellSource.slice(detailStart, detailEnd);
    expect(detailSource).toContain('onExport: actions.onExportCharacterPackage');
    expect(detailSource).toContain('onImport: () =>');
    expect(detailSource).toContain('globalCharacterId: character.globalCharacterId');
    expect(detailSource).toContain(
      'expectedCurrentCharacterVersionId: character.currentCharacterVersionId',
    );
    expect(detailSource).not.toContain('onOpenAuthoring');
    expect(detailSource).not.toContain('CharacterAuthoringSurface');
    expect(desktopShellSource).not.toMatch(/CharacterStudio(?:Scene|Workbench|Controller)/u);
    expect(desktopShellSource).not.toMatch(/rawPath|zipPath|recentWorkspace|activeWorkspace/u);
  });

  it('does not retain standalone Character package selection producers', () => {
    expect(desktopShellSource).not.toContain('const exportCharacterPackage = (');
    expect(desktopShellSource).not.toContain('const previewCharacterPackageImport = (');
    expect(desktopShellSource).not.toContain('selectAuthoringLibrary');
    expect(desktopShellSource).not.toMatch(/readFile|writeFile|rawPath|zipPath|packagePath/u);
  });

  it('finalizes before opening the exact Character Dialogue entry and never infers a version', () => {
    const start = desktopShellSource.indexOf(
      'onFinalizeAndStartCharacterConversation: async (input) =>',
    );
    const end = desktopShellSource.indexOf('onCharacterProductHandoff:', start);
    const source = desktopShellSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(source).toContain("{ kind: 'open-agent-entry' }");
    expect(source).toContain('characterVersionId: input.characterVersionId');
    expect(source).toContain('createCharacterDialogueHandoffIntent');
    expect(source).not.toMatch(/latest|versions\[0\]|activeCharacter|recentCharacter/u);
  });

  it('projects Entry targets without creating Workspace authority in Renderer', () => {
    const characterStart = desktopShellSource.indexOf('onLoadEntryCharacterTargets: async () =>');
    const worldStart = desktopShellSource.indexOf(
      'onLoadEntryWorldTargets: async () =>',
      characterStart,
    );
    const handoffStart = desktopShellSource.indexOf('onCharacterProductHandoff:', worldStart);
    const characterSource = desktopShellSource.slice(characterStart, worldStart);
    const worldSource = desktopShellSource.slice(worldStart, handoffStart);
    const entryContextStart = desktopShellSource.indexOf('entryContext: {');
    const entryContextEnd = desktopShellSource.indexOf('loadWorldTargets:', entryContextStart);
    const entryContextSource = desktopShellSource.slice(entryContextStart, entryContextEnd);

    expect(characterStart).toBeGreaterThanOrEqual(0);
    expect(worldStart).toBeGreaterThan(characterStart);
    expect(handoffStart).toBeGreaterThan(worldStart);
    expect(entryContextStart).toBeGreaterThanOrEqual(0);
    expect(entryContextEnd).toBeGreaterThan(entryContextStart);
    expect(entryContextSource).toContain('projection.catalog.projects.map');
    expect(entryContextSource).toContain('projectId: project.projectId');
    expect(entryContextSource).not.toContain('workspaceGrants.selectProject');
    expect(desktopShellSource).not.toContain('onSelectEntryProject');
    expect(characterSource).toContain('characterFoundation.getConversationLaunchCatalog()');
    expect(worldSource).toContain('worldManagement.getCatalog');
    expect(worldSource).toContain('worldManagement.getDetail');
    expect(desktopShellSource).not.toContain('onSelectWorkspaceProjectTarget');
  });

  it('removes standalone management creation producers', () => {
    const actionsStart = desktopShellSource.indexOf('const actions: ShellActions = {');
    expect(actionsStart).toBeGreaterThanOrEqual(0);
    expect(desktopShellSource).not.toContain('onManualCreateCharacter:');
    expect(desktopShellSource).not.toContain('onOpenCharacterAuthoring:');
    expect(desktopShellSource).not.toContain("kind: 'standalone-library'");
    expect(desktopShellSource).toContain('DesktopResourceBrowserSurface');
    expect(desktopShellSource).toContain('onCharacterCreated');
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
  const projection = projectionWithScene(
    createDefaultDesktopAgentScene('window-1', 'assistant-space:test'),
  );
  return {
    ...projection,
    domains: [
      ...projection.domains,
      { surface: 'character', status: 'ready', ownerSlice: 'P1.6' },
      { surface: 'world', status: 'ready', ownerSlice: 'P1.6' },
    ],
  };
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
  return managementScene('creative-management');
}

function managementScene(
  kind: 'asset-center' | 'creative-management' | 'extensions',
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
  if (kind === 'creative-management') {
    return parseDesktopWorkbenchSceneProjection({
      sceneId,
      windowId: 'window-1',
      context: { kind, catalog: 'content-projects' },
      slots: {
        main: { kind: 'creative-management', catalog: 'content-projects' },
        status: { kind: 'scene-status', sceneId },
      },
    });
  }
  throw new Error(`Unsupported management fixture: ${kind}`);
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
