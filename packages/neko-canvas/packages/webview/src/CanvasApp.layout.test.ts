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
  const nodeLibrarySource = readFileSync(
    resolve(__dirname, 'components/panels/NodeLibraryPanel.tsx'),
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
  const containerRendererSource = readFileSync(
    resolve(__dirname, 'components/content/ContainerRenderer.tsx'),
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
    for (const token of [
      '<MiniMap',
      '<ZoomControls',
      '<CanvasToolbar',
      '<FloatingPanelHost',
      '<GenerationPromptPanel',
      '<ContentOverlay',
    ]) {
      expect(appSource.indexOf(token)).toBeGreaterThan(mainStart);
    }
    expect(appSource).toMatch(/id="canvas-hud-controls"/);
    expect(appSource).toMatch(/isHudVisible && \(/);
    expect(appSource).not.toMatch(/<CanvasSettingsPanel/);
    expect(appSource).not.toMatch(/isCanvasSettingsVisible/);
  });

  it('styles the left toolbar as a bounded theme-colored pill with inset active circles', () => {
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar-host\s*\{[^}]*left:\s*16px;[^}]*bottom:\s*16px;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar\.neko-vtoolbar\s*\{[^}]*height:\s*auto;[^}]*max-height:\s*100%;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar\.neko-vtoolbar\s*\{[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--toolbar-bg\);/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar \.neko-toolbar-btn\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;[^}]*border-radius:\s*999px;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar \.neko-toolbar-btn\.active::before,[\s\S]*content:\s*none;[\s\S]*display:\s*none;/,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar \.neko-toolbar-btn\.active\s*\{[^}]*color:\s*var\(--neko-accent\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s,
    );
    expect(cssSource).toMatch(
      /\.canvas-floating-toolbar \.neko-toolbar-btn\.active::after\s*\{[^}]*inset:\s*3px;[^}]*border:[^}]*var\(--neko-accent\)[^}]*border-radius:\s*999px;[^}]*background:[^}]*var\(--neko-accent\)[^}]*box-shadow:[^}]*var\(--neko-accent-glow\);/s,
    );
    expect(appSource).toMatch(/data-canvas-toolbar-host="left"/);
    expect(appSource).not.toMatch(/data-canvas-toolbar-host="right"/);
  });

  it('routes Shot overlay AI buttons through typed Canvas creative actions', () => {
    const overlayActionStart = appSource.indexOf('const postCanvasCreativeAiAction');
    const overlayActionEnd = appSource.indexOf('/** Open GenerationPromptPanel in video mode');
    expect(overlayActionStart).toBeGreaterThan(-1);
    expect(overlayActionEnd).toBeGreaterThan(overlayActionStart);
    const overlayActionSource = appSource.slice(overlayActionStart, overlayActionEnd);

    expect(overlayActionSource).toMatch(/type: 'canvasCreativeAiAction'/);
    expect(overlayActionSource).toMatch(/type: 'canvasCreativeAiCandidateAction'/);
    for (const actionId of [
      'optimize-video-prompt',
      'generate-image',
      'edit-image',
      'generate-video',
      'edit-video',
    ]) {
      expect(overlayActionSource).toContain(actionId);
    }
    expect(overlayActionSource).not.toContain("type: 'sendToAgent'");
    expect(overlayActionSource).not.toContain("type: 'generateForNode'");
    expect(overlayActionSource).not.toContain("type: 'generationProgress'");
    expect(overlayActionSource).not.toContain('dataUrl');
    expect(overlayActionSource).not.toContain('openGenerationPanel');
  });

  it('routes GenerationPromptPanel through the same Canvas-owned typed action', () => {
    const panelGenerateStart = appSource.indexOf('const handlePanelGenerate');
    const panelGenerateEnd = appSource.indexOf('// Context menu');
    expect(panelGenerateStart).toBeGreaterThan(-1);
    expect(panelGenerateEnd).toBeGreaterThan(panelGenerateStart);
    const panelGenerateSource = appSource.slice(panelGenerateStart, panelGenerateEnd);
    expect(panelGenerateSource).toContain("type: 'canvasCreativeAiAction'");
    expect(panelGenerateSource).not.toContain("type: 'generateForNode'");
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
    expect(toolbarSource).not.toMatch(
      /data-canvas-toolbar-action="toggle-playback-canvas-pane"/,
    );
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

  it('keeps floating toolbar actions grouped by canvas workflow frequency', () => {
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="select-tool"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-kind="tool-mode"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-pan-mode"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="toggle-canvas-settings"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-settings-panel"/);

    const orderedActions = [
      'select-tool',
      'toggle-pan-mode',
      'toggle-right-node-tree',
      'undo',
      'redo',
      'toggle-playback-stage-pane',
      'toggle-playback-route-pane',
      'open-export',
      'open-package',
    ];
    const positions = orderedActions.map((action) =>
      toolbarSource.indexOf(`data-canvas-toolbar-action="${action}"`),
    );
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
    expect(containerRendererSource).toMatch(/state\.activePlayingNodeId === childNode\.id/);
    expect(containerRendererSource).toMatch(/data-playback-active=\{isPlaybackActive/);
    expect(appSource).not.toMatch(/setActivePlayingNode\(/);
  });

  it('keeps the right node library in the right-panel responsibility', () => {
    expect(appSource).toMatch(
      /const \[isRightNodeTreeVisible, setIsRightNodeTreeVisible\] = useState\(false\)/,
    );
    expect(appSource).toMatch(/rightDock=\{\s*isRightNodeTreeVisible/);
    expect(appSource).toMatch(/id: 'canvas-right-node-tree-panel'/);
    expect(appSource).toMatch(/panelId: 'canvas\.nodeLibraryDock'/);
    expect(appSource).toMatch(
      /const \[rightDockMode, setRightDockMode\] = useState<CanvasRightDockMode>\('basic'\)/,
    );
    expect(appSource).toMatch(/groups: \{/);
    expect(appSource).toMatch(/activeId: rightDockMode/);
    expect(appSource).toMatch(/label: t\('rightDock\.mode\.basic'\)/);
    expect(appSource).toMatch(/label: t\('rightDock\.mode\.professional'\)/);
    expect(appSource).not.toMatch(/isNodeTreeVisible=\{isRightNodeTreeVisible\}/);
    expect(appSource).not.toMatch(/nodeTreeMode=\{rightDockMode\}/);
    expect(appSource).not.toMatch(/BASIC_CANVAS_SUBSYSTEM_IDS/);
    expect(appSource).toMatch(/basicNodeLibraryDescriptors/);
    expect(appSource).toMatch(
      /rightDockMode === 'professional'\s*\?\s*WEBVIEW_SUBSYSTEM_REGISTRY\.manifests\s*:\s*\[\]/,
    );
    expect(appSource).toMatch(
      /rightDockMode === 'professional'\s*\?\s*coreNodeTypeDescriptors\s*:\s*basicNodeLibraryDescriptors/,
    );
    expect(appSource).toMatch(/<NodeLibraryPanel/);
    expect(appSource).toMatch(/'data-canvas-right-node-tree': 'true'/);
    expect(nodeLibrarySource).not.toMatch(/id="canvas-right-node-tree-panel"/);
    expect(nodeLibrarySource).not.toMatch(/data-canvas-right-node-tree="true"/);
  });

  it('keeps the node library visually integrated with the right dock', () => {
    expect(nodeLibrarySource).toContain('className="canvas-node-library-panel');
    expect(nodeLibrarySource).toContain('className="canvas-node-library-header');
    expect(nodeLibrarySource).toContain('className="canvas-node-library-scroll');
    expect(cssSource).toMatch(/\.canvas-right-node-tree-panel-content\s*\{[^}]*width:\s*100%/);
    expect(cssSource).toMatch(/\.canvas-node-library-panel\s*\{[^}]*width:\s*100%/);
    expect(cssSource).toMatch(/\.canvas-node-library-section\s*\{[^}]*background:\s*transparent/);
    expect(cssSource).toMatch(/\.canvas-node-library-section\s*\{[^}]*box-shadow:\s*none/);
    expect(cssSource).toMatch(/#canvas-right-node-tree-panel \.neko-creative-tree-view/);
    expect(cssSource).toMatch(
      /#canvas-right-node-tree-panel \[role=["']treeitem["']\] > button:first-child/,
    );
    expect(cssSource).toMatch(
      /#canvas-right-node-tree-panel \[role=["']treeitem["']\] > button:first-child\.invisible\s*\{[^}]*display:\s*none/,
    );
  });

  it('marks primary canvas tools and visibility toggles by responsibility', () => {
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-pan-mode"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="open-add-node-popover"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="import-file"/);
    expect(toolbarSource).not.toMatch(/data-canvas-toolbar-action="reveal-playback-workspace"/);
    expect(toolbarSource).not.toMatch(
      /data-canvas-toolbar-action="toggle-playback-canvas-pane"/,
    );
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
    expect(toolbarSource).toMatch(/data-canvas-toolbar-action="toggle-right-node-tree"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-kind="visibility-toggle"/);
    expect(toolbarSource).toMatch(/data-canvas-toolbar-target="right-panel"/);
    expect(toolbarSource).not.toMatch(/aria-controls="canvas-hud-controls"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-right-node-tree-panel"/);
  });
});
