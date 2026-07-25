import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Canvas creative workbench layout boundary', () => {
  const appSource = readFileSync(resolve(__dirname, 'CanvasApp.tsx'), 'utf8');
  const toolbarSource = readFileSync(
    resolve(__dirname, 'components/toolbar/CanvasToolbar.tsx'),
    'utf8',
  );
  const playbackWorkspaceSource = readFileSync(
    resolve(__dirname, 'components/playback/PlaybackWorkspace.tsx'),
    'utf8',
  );
  const addActionPopoverSource = readFileSync(
    resolve(__dirname, 'components/toolbar/CanvasAddActionPopover.tsx'),
    'utf8',
  );
  const addActionCatalogSource = readFileSync(
    resolve(__dirname, 'utils/canvasAddActions.ts'),
    'utf8',
  );
  const cssSource = readFileSync(resolve(__dirname, 'index.css'), 'utf8');
  const baseNodeSource = readFileSync(resolve(__dirname, 'components/nodes/BaseNode.tsx'), 'utf8');
  const canvasStoreSource = readFileSync(resolve(__dirname, 'stores/canvasStore.ts'), 'utf8');
  const infiniteCanvasSource = readFileSync(
    resolve(__dirname, 'components/InfiniteCanvas.tsx'),
    'utf8',
  );
  const connectionLayerSource = readFileSync(
    resolve(__dirname, 'components/connections/ConnectionLayer.tsx'),
    'utf8',
  );

  it('uses the shared shell without changing the canvas-first main panel', () => {
    expect(appSource).toMatch(/import \{ CreativeWorkbenchShell \} from '@neko\/ui\/workbench'/);
    expect(appSource).toMatch(/<CreativeWorkbenchShell/);
    expect(appSource).toMatch(/mainKind="canvas"/);
    expect(appSource).not.toMatch(/leftRail=\{/);
    expect(appSource).toMatch(/className="canvas-floating-toolbar-host"/);
    expect(appSource.indexOf('<CanvasToolbar')).toBeGreaterThan(
      appSource.indexOf('className="canvas-main-surface-inner"'),
    );
    expect(appSource).toMatch(/mainClassName="canvas-main-panel"/);
    expect(appSource).toMatch(/className="canvas-main-surface"/);
    expect(appSource).toMatch(/<InfiniteCanvas/);
  });

  it('keeps CanvasApp subscribed through focused store selectors', () => {
    expect(appSource).not.toMatch(/useCanvasStore\(\)/);
    expect(appSource).toMatch(/useCanvasStore\(\(state\) => state\.canvasData\)/);
    expect(appSource).toMatch(/useRuntimeViewportStore\(\(state\) => state\.viewport\)/);
  });

  it('keeps transform pointer frames in transient node preview state', () => {
    expect(appSource).not.toMatch(/state\.moveNode\)/);
    expect(appSource).not.toMatch(/state\.resizeNode\)/);
    expect(appSource).not.toMatch(/state\.rotateNode\)/);
    expect(canvasStoreSource).not.toMatch(/^\s{2}moveNode: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}resizeNode: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}rotateNode: /m);
    expect(appSource).not.toMatch(/onNodeDrag=\{/);
    expect(appSource).not.toMatch(/onNodeResize=\{/);
    expect(appSource).not.toMatch(/onNodeRotate=\{/);
    expect(baseNodeSource).not.toMatch(/onDrag:\s*onDrag/);
    expect(baseNodeSource).not.toMatch(/onResize,\s*disabled/);
    expect(baseNodeSource).not.toMatch(/onRotate,\s*disabled/);
    expect(baseNodeSource).toMatch(/onDragEnd:\s*onMove/);
    expect(baseNodeSource).toMatch(/onResizeEnd/);
    expect(baseNodeSource).toMatch(/onRotateEnd/);
  });

  it('keeps selected-node resize handles outside scrollable node content', () => {
    expect(baseNodeSource).toMatch(/bottom: -8/);
    expect(baseNodeSource).toMatch(/right: -8/);
    expect(baseNodeSource).not.toMatch(/bottom: -4/);
    expect(baseNodeSource).not.toMatch(/right: -4/);
  });

  it('keeps foundational node chrome borderless', () => {
    expect(cssSource).toMatch(/\.node-card--foundational\s*\{[^}]*border:\s*0;/s);
  });

  it('keeps viewport writes in runtime state and webview snapshots', () => {
    expect(canvasStoreSource).not.toMatch(/^\s{2}setViewport: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}panCanvas: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}zoomCanvas: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}resetViewport: /m);
    expect(appSource).toMatch(/createViewportSnapshotPolicy/);
    expect(appSource).toMatch(/writeCanvasViewportSnapshot/);
    expect(appSource).toMatch(/readCanvasViewportSnapshot/);
  });

  it('keeps derived projection dependencies memoized and degradable', () => {
    expect(infiniteCanvasSource).toMatch(/const renderedNodes = useMemo/);
    expect(infiniteCanvasSource).toMatch(/const renderedNodeIds = useMemo/);
    expect(infiniteCanvasSource).toMatch(/resolveCanvasRenderRefreshDecision/);
    expect(infiniteCanvasSource).toMatch(/shouldThrottleViewportProjection/);
    expect(infiniteCanvasSource).toMatch(
      /freezeProjection=\{renderRefreshDecision\.shouldFreezeConnectionProjection\}/,
    );
    expect(connectionLayerSource).toMatch(/freezeProjection\?: boolean/);
    expect(connectionLayerSource).toMatch(/latestProjectionRef/);
    expect(appSource).toMatch(/const minimapViewport = useThrottledCanvasViewport\(viewport/);
    expect(appSource).toMatch(/viewport=\{minimapViewport\}/);
  });

  it('rebounds minimap sizing observers when the canvas pane remounts', () => {
    expect(appSource).toMatch(/const setCanvasContainerRef = useCallback/);
    expect(appSource).toMatch(/setCanvasContainerElement\(element\)/);
    expect(appSource).toMatch(/const setZoomControlsRef = useCallback/);
    expect(appSource).toMatch(/setZoomControlsElement\(element\)/);
    expect(appSource).toMatch(/ref=\{setCanvasContainerRef\}/);
    expect(appSource).toMatch(/ref=\{setZoomControlsRef\}/);
    expect(appSource).not.toMatch(
      /useEffect\(\(\) => \{[\s\S]*canvasContainerRef\.current[\s\S]*\}, \[isReady\]\)/,
    );
  });

  it('keeps canvas overlays and controls inside the main panel surface', () => {
    const mainStart = appSource.indexOf('className="canvas-main-surface"');
    expect(mainStart).toBeGreaterThan(-1);
    for (const token of ['<MiniMap', '<ZoomControls', '<CanvasToolbar']) {
      expect(appSource.indexOf(token)).toBeGreaterThan(mainStart);
    }
    expect(appSource).not.toContain('<GenerationPromptPanel');
    expect(appSource).not.toContain('<ContentOverlay');
    expect(appSource).toMatch(/id="canvas-hud-controls"/);
    expect(appSource).toMatch(/isHudVisible && \(/);
    expect(appSource).not.toMatch(/<CanvasSettingsPanel/);
    expect(appSource).not.toMatch(/isCanvasSettingsVisible/);
  });

  it('uses the shared theme-colored floating-toolbar recipe and keeps only Canvas placement local', () => {
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar-host\s*\{[^}]*left:\s*16px;[^}]*bottom:\s*16px;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar\.neko-vtoolbar\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*100%;/s,
    );
    expect(toolbarSource).toMatch(/className="canvas-floating-toolbar neko-floating-toolbar/);
    expect(toolbarSource).toMatch(/data-orientation="vertical"/);
    expect(toolbarSource).toMatch(/className="canvas-toolbar-mode-group neko-toolbar-mode-group"/);
    expect(cssSource).not.toMatch(/\.canvas-floating-toolbar \.neko-toolbar-btn/);
    expect(cssSource).not.toMatch(/\.canvas-toolbar-mode-group\s*\{/);
    expect(appSource).toMatch(/data-canvas-toolbar-host="left"/);
    expect(appSource).not.toMatch(/data-canvas-toolbar-host="right"/);
  });

  it('creates nodes through canonical add action ids', () => {
    expect(appSource).toContain('getCanvasAddAction(actionId)');
    expect(appSource).toContain("case 'markdown'");
    expect(appSource).toContain("case 'group'");
    expect(appSource).not.toContain("case 'job'");
    expect(appSource).not.toContain("case 'shot'");
    expect(appSource).not.toContain("case 'scene'");
    expect(addActionCatalogSource).not.toContain("'job-card'");
  });

  it('does not retain legacy generation and content overlay entry points', () => {
    expect(appSource).not.toContain('handlePanelGenerate');
    expect(appSource).not.toContain('canvasCreativeAiAction');
    expect(appSource).not.toContain('GenerationPromptPanel');
    expect(appSource).not.toContain('ContentOverlay');
  });

  it('does not duplicate the document title as a canvas scope chip', () => {
    expect(appSource).toMatch(/function CanvasBoardNavigationBar/);
    expect(appSource).toMatch(/if \(relatedBoards\.length === 0\) return null/);
    expect(appSource).not.toMatch(/CanvasScopeNavigationBar/);
    expect(appSource).not.toMatch(/SCOPE_LABELS/);
    expect(appSource).not.toMatch(/scopeNavigation\.kind/);
    expect(appSource).not.toMatch(/scopeNavigation\.boardCount/);
  });

  it('keeps playback workspace visibility controls in the floating toolbar', () => {
    expect(appSource).not.toMatch(/<PlaybackControllerHost/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="reveal-playback-workspace"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-playback-canvas-pane"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-playback-stage-pane"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-playback-route-pane"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="hide-playback-workspace"/);
    expect(toolbarSource).toMatch(/icon=\{<PlayIcon size=\{18\} \/>\}/);
    expect(toolbarSource).toMatch(
      /type PlaybackToolbarSurfacePane = Exclude<PlaybackWorkspacePane, 'canvas'>/,
    );
    expect(toolbarSource).toMatch(
      /onToggleWorkspaceSurface\?: \(pane: PlaybackToolbarSurfacePane\) => void/,
    );
    expect(toolbarSource).toMatch(
      /workspaceSurfaceState\?: Readonly<Record<PlaybackToolbarSurfacePane, boolean>>/,
    );
    expect(appSource).toMatch(/const workspaceSurfaceState = useMemo/);
    expect(appSource).toMatch(/canvas: !playbackWorkspaceVisible \|\| playbackPaneState\.canvas/);
    expect(appSource).toMatch(/stage: playbackWorkspaceVisible && playbackPaneState\.stage/);
    expect(appSource).toMatch(/route: playbackWorkspaceVisible && playbackPaneState\.route/);
    expect(appSource).toMatch(/if \(pane === 'canvas' && !session\.visible\)/);
    expect(appSource).toMatch(/if \(!nextPanes\.stage && !nextPanes\.route\)/);
    expect(appSource).toMatch(/hidePlaybackWorkspace\(\)/);
    expect(playbackWorkspaceSource).not.toMatch(/PlaybackWorkspaceHeader/);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-workspace-header/);
    expect(playbackWorkspaceSource).not.toMatch(/PlaybackRoutePaneToolbar/);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-route-pane-toolbar/);
    expect(appSource).toMatch(/reportAction\('toggleWorkspaceSurface', pane\)/);
    expect(appSource).toMatch(/revealPlaybackWorkspace\(\{\s*focusOwner: pane/);
    expect(appSource).toMatch(/stage: pane === 'stage'/);
    expect(appSource).toMatch(/route: pane === 'route'/);
  });

  it('renders the route projection as a top overlay with explicit storyline and comparison modes', () => {
    expect(playbackWorkspaceSource).toMatch(
      /className="canvas-playback-route-pane canvas-playback-route-overlay"/,
    );
    expect(playbackWorkspaceSource).toMatch(
      /data-route-view-mode=\{session\.matrix\.routeViewMode\}/,
    );
    expect(playbackWorkspaceSource).toMatch(/<SegmentedControl/);
    expect(playbackWorkspaceSource).toMatch(/value:\s*'compact'/);
    expect(playbackWorkspaceSource).toMatch(/value:\s*'matrix'/);
    expect(playbackWorkspaceSource).toMatch(
      /session\.matrix\.routeViewMode === 'matrix' && routeMatrix/,
    );
    expect(playbackWorkspaceSource).toMatch(/<PlaybackRouteStrip/);
    expect(playbackWorkspaceSource).toMatch(/--canvas-playback-overlay-safe-top/);
    expect(cssSource).toMatch(
      /\.canvas-playback-route-pane\s*\{[^}]*position:\s*absolute;[^}]*top:\s*12px;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-board-navigation-bar\s*\{[^}]*var\(--canvas-playback-overlay-safe-top/s,
    );
    const narrowPlaybackStart = cssSource.indexOf('@media (max-width: 920px)');
    const nextResponsiveBlock = cssSource.indexOf('@media (max-width:', narrowPlaybackStart + 1);
    const narrowPlaybackCss = cssSource.slice(narrowPlaybackStart, nextResponsiveBlock);
    expect(narrowPlaybackCss).toMatch(
      /\.canvas-playback-workspace-main\s*\{[^}]*flex-direction:\s*column;/s,
    );
  });

  it('keeps floating toolbar actions grouped by canvas workflow frequency', () => {
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="select-tool"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-kind="tool-mode"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-pan-mode"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-canvas-settings"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-settings-panel"/);

    const orderedTokens = [
      'data-canvas-toolbar-action="select-tool"',
      'data-canvas-toolbar-action="toggle-pan-mode"',
      '<CanvasAddActionPopover',
      'data-canvas-toolbar-action="undo"',
      'data-canvas-toolbar-action="redo"',
      'data-canvas-toolbar-action="toggle-playback-stage-pane"',
      'data-canvas-toolbar-action="toggle-playback-route-pane"',
      'data-canvas-toolbar-action="open-export"',
      'data-canvas-toolbar-action="open-package"',
    ];
    const positions = orderedTokens.map((token) => toolbarSource.indexOf(token));
    expect(positions.every((position) => position > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(toolbarSource).not.toMatch(/ToolbarSpacer/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-hud-controls"/);
  });

  it('keeps grid visible by default without a hidden settings mount path', () => {
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-grid"/);
    expect(appSource).toMatch(/const isGridVisible = true/);
    expect(appSource).toMatch(/isGridVisible=\{isGridVisible\}/);
    expect(appSource).not.toMatch(/onGridVisibleChange=/);
    expect(infiniteCanvasSource).toMatch(/isGridVisible\?: boolean/);
    expect(infiniteCanvasSource).toMatch(/isGridVisible = true/);
    expect(infiniteCanvasSource).toMatch(/\{isGridVisible && \(/);
  });

  it('keeps playback highlight as visual state separate from selection props', () => {
    expect(baseNodeSource).toMatch(/state\.activePlayingNodeId/);
    expect(baseNodeSource).toMatch(/data-playback-active=\{isPlaybackActive/);
    expect(baseNodeSource).toMatch(/isSelected \|\| isPlaybackActive/);
    expect(appSource).not.toMatch(/setActivePlayingNode\(/);
  });

  it('removes the persistent right node library Dock', () => {
    expect(appSource).not.toMatch(/isRightNodeTreeVisible|canvas-right-node-tree/);
    expect(appSource).not.toMatch(/rightDock=/);
    expect(appSource).not.toMatch(/NodeLibraryPanel|canvas\.nodeLibraryDock/);
    expect(cssSource).not.toMatch(/canvas-right-node-tree|canvas-node-library/);
  });

  it('projects the shared add catalog from the left toolbar popover', () => {
    expect(toolbarSource).toMatch(/<CanvasAddActionPopover/);
    expect(toolbarSource).toMatch(/onSelectAddAction/);
    expect(addActionPopoverSource).toMatch(/CANVAS_ADD_ACTION_GROUPS\.map/);
    expect(addActionPopoverSource).toMatch(/data-canvas-add-action-popover="true"/);
    expect(addActionCatalogSource).toContain("id: 'create'");
    expect(addActionCatalogSource).toContain("id: 'import'");
    expect(addActionCatalogSource).toContain("id: 'reference'");
  });

  it('marks primary canvas tools and visibility toggles by responsibility', () => {
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-pan-mode"/);
    expect(addActionPopoverSource).toMatch(/data-canvas-toolbar-action="open-add-node-popover"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="import-file"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="reveal-playback-workspace"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-playback-canvas-pane"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-playback-stage-pane"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-playback-route-pane"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="hide-playback-workspace"/);
    expect(toolbarSource).toMatch(/onToggleWorkspaceSurface/);
    expect(toolbarSource).toMatch(/workspaceSurfaceState/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="open-export"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="open-package"/);
    expect(toolbarSource).not.toMatch(/onRevealPlaybackWorkspace/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-playback-canvas-pane"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-playback-stage-pane"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-playback-route-pane"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-playback-workspace"/);
    expect(toolbarSource).toMatch(/onOpenExport\?: \(\) => void/);
    expect(toolbarSource).toMatch(/onOpenPackage\?: \(\) => void/);
    expect(appSource).toMatch(/reportAction\('toggleWorkspaceSurface', pane\)/);
    expect(appSource).toMatch(/reportAction\('openExport', t\('toolbar\.export'\)\)/);
    expect(appSource).toMatch(
      /reportAction\('openPackage', t\('toolbar\.package'\), undefined, canvasData\)/,
    );
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-right-node-tree"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-target="right-panel"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-hud-controls"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-right-node-tree-panel"/);
  });
});
