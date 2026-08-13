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
  const playbackControllerSource = readFileSync(
    resolve(__dirname, 'components/playback/CanvasPlaybackController.tsx'),
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
  const miniMapSource = readFileSync(resolve(__dirname, 'components/controls/MiniMap.tsx'), 'utf8');
  const zoomControlsSource = readFileSync(
    resolve(__dirname, 'components/controls/ZoomControls.tsx'),
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

  it('keeps Canvas layout overrides stronger than lazily loaded shared Workbench styles', () => {
    expect(cssSource).toMatch(
      /\.canvas-webview-root \.canvas-workbench-body\s*\{[^}]*display:\s*flex;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-webview-root \.canvas-main-panel,\s*\.canvas-webview-root \.canvas-main-surface\s*\{[^}]*display:\s*flex;/s,
    );
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

  it('keeps foundational nodes on the shared solid content surface', () => {
    expect(cssSource).toMatch(
      /\.node-card\s*\{[^}]*background:\s*var\(--node-bg\);[^}]*border:\s*1px solid var\(--node-border\);[^}]*box-shadow:\s*var\(--node-shadow\);[^}]*backdrop-filter:\s*none;/s,
    );
    expect(cssSource).toMatch(/\.node-card--foundational\s*\{[^}]*overflow:\s*visible;/s);
    expect(cssSource).not.toMatch(/\.node-card--foundational\s*\{[^}]*backdrop-filter:/s);
  });

  it('uses one restrained Canvas surface hierarchy without persistent child fills', () => {
    expect(cssSource).toMatch(/--canvas-card-surface:\s*var\(--neko-elevated\);/);
    expect(cssSource).toMatch(/--canvas-card-shadow-hover:/);
    expect(cssSource).toMatch(/--canvas-card-shadow-selected:/);
    expect(cssSource).toMatch(
      /\.selection-context-toolbar\s*\{[^}]*background:\s*var\(--canvas-card-surface\);[^}]*box-shadow:\s*var\(--canvas-floating-shadow\);[^}]*backdrop-filter:\s*none;/s,
    );
    expect(cssSource).toMatch(
      /\.selection-generation-input-panel\s*\{[^}]*background:\s*var\(--canvas-card-surface\);[^}]*box-shadow:\s*var\(--canvas-floating-shadow\);[^}]*backdrop-filter:\s*none;/s,
    );
    expect(cssSource).toMatch(
      /\.selection-generation-input-panel__footer\s*\{[^}]*margin:\s*0;[^}]*background:\s*transparent;/s,
    );
    expect(cssSource).toMatch(
      /\.selection-generation-input-panel__option-grid button\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(cssSource).toMatch(
      /\.selection-action-overflow \[data-danger='true'\]\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--neko-desktop-danger-foreground, var\(--neko-danger\)\);/s,
    );
    expect(baseNodeSource).toContain("'node-card--transforming'");
    expect(baseNodeSource).toContain("'node-card--connection-valid'");
    expect(baseNodeSource).not.toContain("(isDragging || isResizing) && 'shadow-2xl'");
    expect(baseNodeSource).not.toContain(
      "targetState?.validity === 'valid' && 'ring-2 ring-blue-500'",
    );
    expect(baseNodeSource).not.toContain(
      "targetState?.validity === 'invalid' && 'ring-2 ring-red-500'",
    );
  });

  it('keeps the Canvas background plain and gives each HUD surface one shadow owner', () => {
    expect(cssSource).toMatch(/\.canvas-main-surface\s*\{[^}]*background:\s*var\(--canvas-bg\);/s);
    expect(cssSource).not.toMatch(/\.canvas-main-surface::after/);
    expect(cssSource).toMatch(/\.canvas-hud-controls\s*\{[^}]*filter:\s*none;/s);
    expect(miniMapSource).toContain('className="minimap-card relative cursor-pointer"');
    expect(zoomControlsSource).toContain('className="zoom-pill"');
    expect(miniMapSource).not.toMatch(/shadow-lg/);
    expect(zoomControlsSource).not.toMatch(/shadow-lg/);
  });

  it('keeps compact generation controls clear of the Canvas HUD', () => {
    expect(cssSource).toMatch(
      /@media \(max-width: 920px\)[\s\S]*?\.canvas-main-surface:has\(\.selection-generation-input-panel\) \.canvas-hud-controls\s*\{[^}]*top:\s*16px;[^}]*bottom:\s*auto;/,
    );
    expect(cssSource).toMatch(
      /\.canvas-main-surface:has\(\.selection-generation-input-panel\) \.canvas-hud-controls \.minimap-card\s*\{[^}]*display:\s*none;/s,
    );
  });

  it('keeps the Image composer and parameter popovers aligned with the compact reference layout', () => {
    expect(cssSource).toMatch(
      /\.selection-generation-input-panel__prompt\s*\{[^}]*min-height:\s*92px;[^}]*flex:\s*1 1 auto;/s,
    );
    expect(cssSource).toMatch(
      /\.selection-generation-input-panel__parameter-menu\s*\{[^}]*width:\s*min\(380px,/s,
    );
    expect(cssSource).toMatch(
      /data-option-layout='ratio'[\s\S]*?grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\);/,
    );
    expect(cssSource).toMatch(
      /\.selection-generation-input-panel__count-menu\s*\{[^}]*width:\s*min\(124px,/s,
    );
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

  it('queues whole-document synchronization before selected-node passive action resolution', () => {
    expect(appSource).toContain('useLayoutEffect(() => {');
    expect(appSource).toMatch(
      /useLayoutEffect\(\(\) => \{[\s\S]*?type: 'canvasStatus'[\s\S]*?\}, \[nodes\.length, connections\.length, selectedNodeIds, canvasData, nodeTypeSummary\]\);/,
    );
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
      /\.canvas-floating-toolbar-host\s*\{[^}]*bottom:\s*16px;[^}]*left:\s*50%;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar\.neko-htoolbar\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*100%;[^}]*pointer-events:\s*auto;/s,
    );
    expect(toolbarSource).toMatch(/className="canvas-floating-toolbar neko-floating-toolbar/);
    expect(toolbarSource).toMatch(/data-orientation="horizontal"/);
    expect(toolbarSource).toMatch(/className="canvas-toolbar-mode-group neko-toolbar-mode-group"/);
    expect(cssSource).not.toMatch(/\.canvas-floating-toolbar \.neko-toolbar-btn/);
    expect(cssSource).not.toMatch(/\.canvas-toolbar-mode-group\s*\{/);
    expect(appSource).toMatch(/data-canvas-toolbar-host="bottom"/);
    expect(appSource).not.toMatch(/data-canvas-toolbar-host="left"/);
  });

  it('scopes embedded Canvas theme and element resets to the package-owned Root', () => {
    expect(cssSource).toContain('.canvas-webview-root {');
    expect(cssSource).toContain('.canvas-webview-root *:focus-visible');
    expect(cssSource).toContain('.canvas-webview-root input');
    expect(cssSource).not.toMatch(/\n:root\s*\{/);
    expect(cssSource).not.toMatch(/\n\*:focus-visible\s*\{/);
  });

  it('ships the icon stylesheet required by package-owned Canvas controls', () => {
    expect(cssSource).toContain('@import "@neko/ui/icons/codicon.css";');
    expect(addActionPopoverSource).toContain('createCanvasAddActionIcon');
  });

  it('creates nodes through canonical add action ids', () => {
    expect(appSource).toContain('getCanvasAddAction(actionId)');
    expect(appSource).toContain("action.mode === 'generation'");
    expect(appSource).toContain('createGenerationNode(action.generationKind');
    expect(appSource).not.toContain("case 'table'");
    expect(appSource).not.toContain("case 'markdown'");
    expect(appSource).not.toContain("case 'group'");
    expect(appSource).not.toContain("case 'job'");
    expect(appSource).not.toContain("case 'shot'");
    expect(appSource).not.toContain("case 'scene'");
    expect(addActionCatalogSource).not.toContain("'job-card'");
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
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-playback-panel"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-playback-route-pane"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="hide-playback-workspace"/);
    expect(toolbarSource).toMatch(/icon=\{<StorylineIcon size=\{18\} \/>\}/);
    expect(toolbarSource).not.toMatch(/icon=\{<PlayIcon size=\{18\} \/>\}/);
    expect(toolbarSource).toMatch(/onTogglePlaybackWorkspace\?: \(\) => void/);
    expect(toolbarSource).toMatch(/playbackWorkspaceVisible\?: boolean/);
    expect(appSource).not.toMatch(/workspaceSurfaceState/);
    expect(appSource).not.toMatch(/playbackPaneState/);
    expect(appSource).toMatch(/hidePlaybackWorkspace\(\)/);
    expect(playbackWorkspaceSource).not.toMatch(/PlaybackWorkspaceHeader/);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-workspace-header/);
    expect(playbackWorkspaceSource).not.toMatch(/PlaybackRoutePaneToolbar/);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-route-pane-toolbar/);
    expect(appSource).toMatch(/reportAction\('togglePlaybackWorkspace', 'overlay'\)/);
    expect(appSource).toMatch(/revealPlaybackWorkspace\(\{ focusOwner: 'route' \}\)/);
    expect(appSource).not.toMatch(/panes:/);
    expect(appSource).toMatch(
      /const canOpenHostPlayback = hostPort\.supportsMessage\('preview:resolveResource'\)/,
    );
    expect(playbackWorkspaceSource).toMatch(
      /if \(!hostPort \|\| !\(hostPort\.supportsMessage\?\.\('playback:getPreviewPlan'\) \?\? true\)\)/,
    );
  });

  it('renders Storyline, controls and conditional Preview in one presentation component', () => {
    const storylinePosition = playbackWorkspaceSource.indexOf('renderStorylineGraph({');
    const controlsPosition = playbackWorkspaceSource.indexOf('<CanvasPlaybackControls');
    const stagePosition = playbackWorkspaceSource.indexOf('renderPlaybackPreview({');
    expect(storylinePosition).toBeGreaterThan(-1);
    expect(controlsPosition).toBeGreaterThan(storylinePosition);
    expect(stagePosition).toBeGreaterThan(controlsPosition);
    expect(playbackWorkspaceSource).toMatch(/function StorylinePlaybackOverlay/);
    expect(playbackWorkspaceSource).toMatch(/<StorylinePlaybackOverlay/);
    expect(playbackWorkspaceSource).not.toMatch(/function StorylineGraph/);
    expect(playbackWorkspaceSource).not.toMatch(/function PlaybackStage/);
    expect(playbackWorkspaceSource).not.toMatch(/<StorylineGraph/);
    expect(playbackWorkspaceSource).not.toMatch(/<PlaybackStage/);
    expect(playbackWorkspaceSource).not.toMatch(/data-playback-action="open-preview"/);
    expect(playbackWorkspaceSource).toMatch(/data-playback-action="reveal-preview"/);
    expect(playbackWorkspaceSource).toMatch(/data-playback-action="hide-preview"/);
    expect(playbackWorkspaceSource).toMatch(/data-playback-action="toggle-overlay-fullscreen"/);
    expect(playbackWorkspaceSource).toMatch(/data-playback-action="close-overlay"/);
    expect(playbackWorkspaceSource.match(/<CanvasPlaybackControls/g)).toHaveLength(1);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-storyline-panel/);
    expect(playbackWorkspaceSource).not.toMatch(/session\.preview\.visible/);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-route-pane/);
    expect(playbackWorkspaceSource).not.toMatch(/routeHeightPx/);
    expect(playbackWorkspaceSource).not.toMatch(/SegmentedControl/);
    expect(playbackWorkspaceSource).not.toMatch(/RouteStoryboardMatrix/);
    expect(playbackWorkspaceSource).not.toMatch(/routeViewMode/);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-route-time-ruler/);
    expect(playbackWorkspaceSource).not.toMatch(/--canvas-playback-overlay-safe-top/);
    expect(playbackWorkspaceSource).toMatch(/data-expanded=\{expanded \? 'true' : 'false'\}/);
    expect(playbackWorkspaceSource).not.toMatch(/aria-modal=/);
    expect(playbackWorkspaceSource).toMatch(/canvas-playback-overlay-layer/);
    expect(playbackWorkspaceSource).not.toMatch(/canvas-playback-overlay-backdrop/);
    expect(cssSource).not.toMatch(/\.canvas-playback-route-pane/);
    expect(cssSource).toMatch(/data-presentation='fullscreen'/);
    expect(cssSource).toMatch(
      /\.canvas-playback-overlay-layer\s*\{[\s\S]*?z-index:\s*1000;[\s\S]*?align-items:\s*flex-start;[\s\S]*?pointer-events:\s*none;/,
    );
    expect(cssSource).not.toMatch(/canvas-playback-overlay-layer\[data-expanded='true'\]/);
    expect(cssSource).not.toMatch(/canvas-playback-overlay-backdrop/);
    expect(cssSource).not.toMatch(
      /\.canvas-playback-overlay\[data-expanded='true'\]\s*\{[^}]*width:/s,
    );
    expect(cssSource).not.toMatch(
      /\.canvas-playback-overlay\[data-expanded='true'\][^{]*canvas-playback-overlay-storyline/,
    );
    expect(cssSource).toMatch(
      /\.canvas-playback-overlay-storyline\s*\{[\s\S]*?height:\s*clamp\(132px,\s*18vh,\s*168px\);[\s\S]*?min-height:\s*132px;/,
    );
    expect(cssSource).not.toMatch(/height:\s*clamp\(150px,\s*30vh,\s*230px\)/);
    expect(cssSource).toMatch(
      /\.canvas-playback-storyline-viewport\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow:\s*auto;/,
    );
    expect(cssSource).toMatch(
      /\.canvas-audio-transport\s*\{[\s\S]*?width:\s*min\(100%,\s*640px\);[\s\S]*?grid-template-columns:\s*auto auto minmax\(32px,\s*1fr\) auto;/,
    );
    const audioTransportCss = cssSource.slice(
      cssSource.indexOf('.canvas-audio-transport {'),
      cssSource.indexOf(".canvas-audio-transport[data-state='idle']"),
    );
    expect(audioTransportCss).not.toMatch(/\b(?:border|background|box-shadow):/);
    expect(cssSource).not.toMatch(/\.canvas-audio-node-(?:player|waveform|controls)/);
    expect(cssSource).toMatch(
      /\.canvas-playback-controller-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\);/,
    );
    expect(cssSource).toMatch(
      /\.canvas-playback-controller-transport\s*\{[\s\S]*?grid-column:\s*2;/,
    );
    expect(playbackControllerSource).not.toMatch(/canvas-playback-controller-time/);
    expect(playbackControllerSource).not.toMatch(/formatControllerTime/);
    const narrowPlaybackStart = cssSource.indexOf('@media (max-width: 920px)');
    const nextResponsiveBlock = cssSource.indexOf('@media (max-width:', narrowPlaybackStart + 1);
    const narrowPlaybackCss = cssSource.slice(narrowPlaybackStart, nextResponsiveBlock);
    expect(narrowPlaybackCss).toMatch(/\.canvas-playback-overlay-layer\s*\{/);
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
      'data-canvas-toolbar-action="toggle-playback-panel"',
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

  it('keeps Storyline reveal transient without Canvas selection or playback highlight state', () => {
    expect(baseNodeSource).not.toMatch(/activePlayingNodeId|isPlaybackActive/);
    expect(playbackControllerSource).not.toMatch(/setActivePlayingNode|activePlayingNodeId/);
    expect(playbackWorkspaceSource).not.toMatch(/setActivePlayingNode|activePlayingNodeId/);
    expect(playbackWorkspaceSource).not.toMatch(/selectNode\(unit\.sourceNodeId\)/);
  });

  it('keeps node selection on the Canvas without mounting a property Dock', () => {
    expect(appSource).not.toMatch(/isRightNodeTreeVisible|canvas-right-node-tree/);
    expect(appSource).not.toMatch(/NodeLibraryPanel|canvas\.nodeLibraryDock/);
    expect(cssSource).not.toMatch(/canvas-right-node-tree|canvas-node-library/);
    expect(appSource).not.toMatch(/rightDock=\{/);
    expect(appSource).not.toMatch(/selectedInspectorNode/);
    expect(appSource).not.toMatch(/<PropertyPanel/);
  });

  it('projects the shared add catalog from the left toolbar popover', () => {
    expect(toolbarSource).toMatch(/<CanvasAddActionPopover/);
    expect(toolbarSource).toMatch(/onSelectAddAction/);
    expect(addActionPopoverSource).toMatch(/CANVAS_ADD_ACTIONS\.filter/);
    expect(addActionPopoverSource).toMatch(/visibleActions\.map/);
    expect(addActionPopoverSource).toMatch(/availableGenerationKinds\.includes/);
    expect(addActionPopoverSource).toMatch(/data-canvas-add-action-popover="true"/);
    expect(addActionCatalogSource).toContain("id: 'text'");
    expect(addActionCatalogSource).not.toContain("id: 'table'");
    expect(addActionCatalogSource).not.toContain("id: 'director3d'");
    expect(addActionCatalogSource).not.toContain("id: 'markdown'");
    expect(addActionCatalogSource).not.toContain("id: 'subcanvas'");
  });

  it('keeps the add-node popover at Canvas toolbar density and on Canvas surface tokens', () => {
    expect(addActionPopoverSource).toContain(
      'contentClassName="canvas-add-action-popover-surface"',
    );
    expect(addActionPopoverSource).toContain('className="canvas-add-action-popover"');
    expect(addActionPopoverSource).toContain('className="canvas-add-action-popover__title"');
    expect(addActionPopoverSource).toContain('className="canvas-add-action-popover__action"');
    expect(addActionPopoverSource).toContain('className="canvas-add-action-popover__icon"');
    expect(addActionPopoverSource).not.toMatch(/\bw-72\b|\bh-11\b|\bw-11\b|\brounded-xl\b/);
    expect(cssSource).toMatch(
      /\.canvas-add-action-popover-surface\s*\{[^}]*--neko-menu-background:\s*var\(--neko-desktop-overlay, var\(--neko-elevated\)\);[^}]*--neko-menu-border:\s*var\(--neko-desktop-border, var\(--neko-border\)\);[^}]*--neko-menu-foreground:\s*var\(--neko-fg\);[^}]*--neko-menu-selectionBackground:\s*var\(--neko-hover\);[^}]*--neko-popover-background:\s*var\(--neko-menu-background\);[^}]*--neko-popover-border:\s*var\(--neko-menu-border\);[^}]*--neko-popover-shadow:\s*var\(--neko-desktop-shadow-overlay, var\(--neko-shadow-md\)\);/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-add-action-popover\s*\{[^}]*width:\s*236px;[^}]*color:\s*var\(--neko-fg\);/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-add-action-popover__action\s*\{[^}]*min-height:\s*40px;[^}]*background:\s*transparent;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-add-action-popover__action:is\(:hover,\s*:focus-visible\)\s*\{[^}]*background:\s*var\(--neko-menu-selectionBackground\);[^}]*color:\s*var\(--neko-menu-selectionForeground\);/s,
    );
  });

  it('marks primary canvas tools and visibility toggles by responsibility', () => {
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-pan-mode"/);
    expect(addActionPopoverSource).toMatch(/data-canvas-toolbar-action="open-add-node-popover"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="import-file"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="reveal-playback-workspace"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-playback-canvas-pane"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-playback-panel"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-playback-route-pane"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="hide-playback-workspace"/);
    expect(toolbarSource).toMatch(/onTogglePlaybackWorkspace/);
    expect(toolbarSource).toMatch(/playbackWorkspaceVisible/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="open-export"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="open-package"/);
    expect(toolbarSource).not.toMatch(/onRevealPlaybackWorkspace/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-playback-canvas-pane"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-playback-overlay"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-playback-route-pane"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-playback-workspace"/);
    expect(toolbarSource).toMatch(/onOpenExport\?: \(\) => void/);
    expect(toolbarSource).toMatch(/onOpenPackage\?: \(\) => void/);
    expect(appSource).toMatch(/reportAction\('togglePlaybackWorkspace', 'overlay'\)/);
    expect(appSource).toMatch(/reportAction\('openExport', t\('toolbar\.export'\)\)/);
    expect(appSource).toMatch(
      /reportAction\(\s*'openPackage',\s*t\('toolbar\.package'\),\s*undefined,\s*canvasData,\s*\)/,
    );
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-right-node-tree"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-target="right-panel"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-hud-controls"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-right-node-tree-panel"/);
  });
});
