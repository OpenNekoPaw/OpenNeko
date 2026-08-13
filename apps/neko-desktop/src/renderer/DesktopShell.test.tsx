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
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  DESKTOP_WORKBENCH_LIMITS,
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  openOrFocusMainView,
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
  it('binds Character creation handoff only to its exact fresh Agent Draft', () => {
    const projection = agentProjection();
    const composition = resolveActiveDesktopWindowWorkbench(projection.window);
    const interaction = composition.scene.slots.interaction;
    if (!interaction) throw new Error('Agent projection requires an interaction surface.');
    const handoff = {
      kind: 'character-creation' as const,
      intentId: 'character-creation-1',
      skill: {
        name: 'character-creator' as const,
        source: { kind: 'builtin' as const },
      },
      prompt: '',
      references: [],
      returnTarget: { kind: 'character-management' as const },
    };
    const common = {
      projection,
      workbenchInstanceId: composition.workbenchInstanceId,
      interaction,
      onChooseWorkspaceTarget: vi.fn(async () => undefined),
      onSelectWorkspaceProjectTarget: vi.fn(async () => undefined),
      onLoadAuthoringTargets: vi.fn(async () => ({
        targets: [],
        creationContexts: [],
        diagnostics: [],
      })),
      onSelectAuthoringTarget: vi.fn(async () => undefined),
      onCreateAuthoringTarget: vi.fn(async () => undefined),
    };

    expect(
      createDesktopAgentSurfaceProps({
        ...common,
        characterCreationHandoff: {
          draftId:
            interaction.scope.kind === 'workspace' ? 'wrong-draft' : interaction.scope.draftId,
          intent: handoff,
        },
      }),
    ).toMatchObject({ characterCreationHandoff: handoff });
    expect(
      createDesktopAgentSurfaceProps({
        ...common,
        characterCreationHandoff: { draftId: 'wrong-draft', intent: handoff },
      }),
    ).not.toHaveProperty('characterCreationHandoff');
  });

  it('binds a finalized CharacterVersion handoff only to its exact fresh Agent Draft', () => {
    const projection = agentProjection();
    const composition = resolveActiveDesktopWindowWorkbench(projection.window);
    const interaction = composition.scene.slots.interaction;
    if (!interaction || interaction.scope.kind === 'workspace') {
      throw new Error('Agent projection requires an unbound interaction surface.');
    }
    const intent = {
      kind: 'character-dialogue' as const,
      intentId: 'character-dialogue:1',
      label: 'Rin',
      binding: {
        kind: 'character-dialogue' as const,
        mode: 'companion' as const,
        participants: [
          {
            characterProjectId: 'character-project:rin',
            characterVersionId: 'character-version:rin-2',
          },
        ],
      },
    };
    const common = {
      projection,
      workbenchInstanceId: composition.workbenchInstanceId,
      interaction,
      onChooseWorkspaceTarget: vi.fn(async () => undefined),
      onSelectWorkspaceProjectTarget: vi.fn(async () => undefined),
      onLoadAuthoringTargets: vi.fn(async () => ({
        targets: [],
        creationContexts: [],
        diagnostics: [],
      })),
      onSelectAuthoringTarget: vi.fn(async () => undefined),
      onCreateAuthoringTarget: vi.fn(async () => undefined),
    };

    expect(
      createDesktopAgentSurfaceProps({
        ...common,
        characterDialogueHandoff: { draftId: interaction.scope.draftId, intent },
      }),
    ).toMatchObject({ characterDialogueHandoff: intent });
    expect(
      createDesktopAgentSurfaceProps({
        ...common,
        characterDialogueHandoff: { draftId: 'wrong-draft', intent },
      }),
    ).not.toHaveProperty('characterDialogueHandoff');
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
    ['project-management', projectionWithScene(projectManagementScene())],
  ])('uses one tabless current Main target for %s', (_panelId, projection) => {
    const markup = renderShell(<DesktopShellView projection={projection} />);

    expect(markup).toContain('data-workbench-slot="main"');
    expect(markup.match(/data-workbench-slot="main"/gu) ?? []).toHaveLength(1);
    expect(markup).toContain('data-main-split="none"');
    expect(markup).not.toContain('project-main-group__tabs');
  });

  it('keeps Extensions management full-width until package selection qualifies detail', () => {
    const markup = renderShell(
      <DesktopShellView projection={projectionWithScene(extensionsScene())} />,
    );

    expect(markup).toContain('data-main-split="none"');
    expect(markup).toContain('data-main-composition="continuous"');
    expect(markup).not.toContain('data-workbench-slot="secondaryMain"');
    expect(markup).not.toContain('aria-label="Resize Main split"');
    expect(markup).not.toContain('data-workbench-main-gutter="true"');
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
      authority: { kind: 'content-project' as const, contentProjectId: 'project-1' },
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
          authority: { kind: 'content-project', contentProjectId: 'project-1' },
          viewId: 'view:character-1',
          viewInstanceId: 'view-instance:character-1',
          worldProjectId: 'world-project-1',
        },
        'project-other',
      ),
    ).toBe(false);
  });

  it('keeps standalone Character authoring beside the explicit empty primary Main', () => {
    const base = baseProjection();
    const workspaceId = 'character-library-workspace';
    const characterProjectId = 'character-project-1';
    const viewId = `character-authoring:${characterProjectId}`;
    const viewInstanceId = 'character-authoring-view-1';
    const layout = openOrFocusMainView(
      createDefaultDesktopWorkbenchLayout(base.window.windowId),
      {
        viewId,
        viewInstanceId,
        workspaceId,
        kind: 'character-authoring',
        ownerId: characterProjectId,
        displayLabel: 'Character one',
        characterProjectId,
      },
      { groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, splitAxis: 'columns' },
    );
    const scope = {
      kind: 'workspace' as const,
      draftId: 'draft-character-1',
      workspaceId,
      workspaceGrantId: 'workspace-grant-character-1',
    };
    const scene = parseDesktopWorkbenchSceneProjection({
      sceneId: 'scene:window-1:character-library',
      windowId: base.window.windowId,
      context: { kind: 'agent', agentViewId: 'agent-view-character-1', scope },
      slots: {
        interaction: {
          kind: 'agent',
          agentSurfaceId: 'agent-surface-character-1',
          agentViewId: 'agent-view-character-1',
          phase: 'draft',
          scope,
        },
        secondaryMain: {
          kind: 'character-authoring',
          workspaceId,
          authority: { kind: 'standalone-library', library: 'character' },
          viewId,
          viewInstanceId,
          characterProjectId,
        },
        status: { kind: 'scene-status', sceneId: 'scene:window-1:character-library' },
      },
    });
    const catalog = { projects: [] };
    const agentHome = {
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    };
    const projection = withWorkbench(
      {
        ...base,
        catalog,
        agentHome,
        conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
        window: { ...base.window, activeTarget: { kind: 'home' }, tabs: [] },
      },
      scene,
      layout,
    );

    vi.stubGlobal('window', { openNekoDesktop: { characterAuthoring: {} } });
    const markup = renderShell(<DesktopShellView projection={projection} />);
    vi.unstubAllGlobals();

    expect(layout.main.groups).toEqual([
      { groupId: DESKTOP_PRIMARY_MAIN_GROUP_ID, viewIds: [] },
      {
        groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
        viewIds: [viewId],
        activeViewId: viewId,
      },
    ]);
    expect(markup).toContain('data-main-split="columns"');
    expect(markup).toContain('data-workbench-slot="main"');
    expect(markup).toContain('data-workbench-slot="secondaryMain"');
    expect(markup).toContain('data-right-presentation="hidden"');
    expect(desktopShellSource).toContain('data-authoring-authority="standalone-empty"');
    expect(desktopShellSource).toContain('data-authoring-authority="standalone-character"');
  });

  it('uses one Workbench shell and the package-owned Asset Management surface', () => {
    expect(desktopShellSource.match(/<ControlledWorkbenchShell/gu) ?? []).toHaveLength(1);
    expect(desktopShellSource).toContain('onChooseWorkspaceTarget');
    expect(desktopShellSource).toContain('AgentComposerWorkspaceTarget');
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

  it('keeps Character management read-only and delegates exact authoring without a Studio owner', () => {
    const detailStart = desktopShellSource.indexOf('<CharacterDetailSurface');
    const detailEnd = desktopShellSource.indexOf('/>', detailStart);
    const detailSource = desktopShellSource.slice(detailStart, detailEnd);
    expect(detailSource).toContain('onExport: actions.onExportCharacterPackage');
    expect(detailSource).toContain('onImport: actions.onImportCharacterPackage');
    expect(detailSource).toContain('onOpenAuthoring: actions.onOpenCharacterAuthoring');
    expect(detailSource).not.toContain('CharacterAuthoringSurface');
    expect(desktopShellSource).not.toMatch(/CharacterStudio(?:Scene|Workbench|Controller)/u);
    expect(desktopShellSource).not.toMatch(/rawPath|zipPath|recentWorkspace|activeWorkspace/u);
  });

  it('delegates portable file selection and bytes to Host ports without renderer path authority', () => {
    const start = desktopShellSource.indexOf('const exportCharacterPackage = (');
    const end = desktopShellSource.indexOf('const actions: ShellActions = {', start);
    const portableSource = desktopShellSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(portableSource).toMatch(/characterPortable\s*\.getExportScope/u);
    expect(portableSource).toMatch(/characterPortable\s*\.previewImport/u);
    expect(desktopShellSource).toMatch(/characterPortable\s*\.exportPackage/u);
    expect(desktopShellSource).toMatch(/characterPortable\s*\.commitImport/u);
    expect(desktopShellSource).toMatch(/characterPortable\s*\.cancelImport/u);
    expect(portableSource).not.toMatch(/readFile|writeFile|rawPath|zipPath|packagePath/u);
    expect(portableSource).not.toMatch(/latest|activeWorkspace|recentWorkspace|fakeProject/u);
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

  it('loads the aggregate project-local catalog without a Project-first selection step', () => {
    const start = desktopShellSource.indexOf('onLoadAuthoringTargets: async () =>');
    const end = desktopShellSource.indexOf('onSelectAuthoringTarget: async', start);
    const catalogLoaderSource = desktopShellSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(catalogLoaderSource).toContain('projectAuthoring.getCatalog');
    expect(catalogLoaderSource).toContain("kind: 'project-local'");
    expect(catalogLoaderSource).not.toContain('workspaceGrants.selectProject');
    expect(desktopShellSource).not.toContain('onLoadProjectAuthoringTargets');
  });

  it('keeps manual standalone creation grant-first and separate from quick generation and import', () => {
    const actionsStart = desktopShellSource.indexOf('const actions: ShellActions = {');
    const start = desktopShellSource.indexOf('onManualCreateCharacter: () =>', actionsStart);
    const end = desktopShellSource.indexOf('onOpenCharacterAuthoring:', start);
    const manualSource = desktopShellSource.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(manualSource.indexOf('selectAuthoringLibrary')).toBeLessThan(
      manualSource.indexOf("operation: 'character-project-create'"),
    );
    expect(manualSource).toContain("kind: 'open-character-authoring'");
    expect(manualSource).toContain(
      "authority: { kind: 'standalone-library', library: 'character' }",
    );
    expect(manualSource).not.toMatch(/characterCreationHandoff|character-creator|portable|import/u);
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
  return managementScene('creative-management');
}

function settingsScene(section = 'general'): DesktopWorkbenchSceneProjection {
  return managementScene('settings', section);
}

function managementScene(
  kind: 'asset-center' | 'creative-management' | 'extensions' | 'settings',
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
        secondaryMain: { kind: 'extension-detail' },
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
