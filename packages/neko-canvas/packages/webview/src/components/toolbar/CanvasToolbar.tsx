/**
 * CanvasToolbar - Floating vertical canvas toolbar
 *
 * Provides quick access to:
 * - Select / Hand tools
 * - Right node tree/library panel toggle
 * - Undo / Redo
 * - Playback workspace surfaces
 *
 * Uses shared ToolbarButton for consistent active state and hover styling.
 */

import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { ToolbarButton, ToolbarSeparator, VerticalToolbar } from '@neko/ui/primitives';
import { useHistoryStore } from '../../stores/historyStore';
import { t } from '../../i18n';
import {
  DownloadIcon,
  PlayIcon,
  UndoIcon,
  RedoIcon,
  LayersIcon,
  PackageIcon,
  RightPanelIcon,
  RightPanelOffIcon,
} from '@neko/ui/icons';
import type { PlaybackWorkspacePane } from '../../stores/playbackStore';

type PlaybackToolbarSurfacePane = Exclude<PlaybackWorkspacePane, 'canvas'>;

// =============================================================================
// Types
// =============================================================================

export interface CanvasToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  /** Select tool mode */
  isSelectMode?: boolean;
  onSelectTool?: () => void;
  /** Node tree/library panel visibility */
  isNodeLibraryVisible?: boolean;
  onToggleNodeLibrary?: () => void;
  /** Playback workspace surface visibility, controlled from the floating toolbar. */
  workspaceSurfaceState?: Readonly<Record<PlaybackToolbarSurfacePane, boolean>>;
  onToggleWorkspaceSurface?: (pane: PlaybackToolbarSurfacePane) => void;
  /** Opens the Extension Host-owned rendered export picker */
  onOpenExport?: () => void;
  /** Opens the Extension Host-owned no-engine project package flow */
  onOpenPackage?: () => void;
  /** Hand tool (drag-to-pan) mode */
  isPanMode?: boolean;
  onTogglePanMode?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function CanvasToolbar({
  onUndo,
  onRedo,
  isSelectMode = true,
  onSelectTool,
  isNodeLibraryVisible = true,
  onToggleNodeLibrary,
  workspaceSurfaceState,
  onToggleWorkspaceSurface,
  onOpenExport,
  onOpenPackage,
  isPanMode = false,
  onTogglePanMode,
}: CanvasToolbarProps) {
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const nodeLibraryTitle = isNodeLibraryVisible
    ? t('toolbar.hideRightNodeTree')
    : t('toolbar.showRightNodeTree');
  const canControlPlaybackPanes =
    workspaceSurfaceState !== undefined && onToggleWorkspaceSurface !== undefined;

  return (
    <VerticalToolbar
      className="canvas-floating-toolbar relative z-20"
      width={48}
      aria-label={t('toolbar.leftRail')}
      {...getKeyboardBoundaryMetadata({
        scope: 'popover',
        ownerId: 'canvas-toolbar',
        priority: 20,
        ownedKeys: ['Enter', 'Escape', 'Space', 'Tab', 'ArrowUp', 'ArrowDown'],
      })}
    >
      <div
        aria-label={t('toolbar.navigationMode')}
        className="canvas-toolbar-mode-group"
        data-active-mode={isPanMode ? 'pan' : 'select'}
        data-canvas-toolbar-mode-group="navigation"
        role="group"
      >
        <ToolbarButton
          data-canvas-toolbar-action="select-tool"
          data-canvas-toolbar-kind="tool-mode"
          icon={<SelectToolIcon />}
          title={`${t('toolbar.selectTool')} (V)`}
          active={isSelectMode}
          onClick={onSelectTool}
        />

        <ToolbarButton
          data-canvas-toolbar-action="toggle-pan-mode"
          data-canvas-toolbar-kind="tool-mode"
          icon={<HandToolIcon />}
          title={`${t('toolbar.handTool')} (H)`}
          active={isPanMode}
          onClick={onTogglePanMode}
        />
      </div>

      {onToggleNodeLibrary && (
        <>
          <ToolbarSeparator />
          <ToolbarButton
            aria-controls="canvas-right-node-tree-panel"
            aria-expanded={isNodeLibraryVisible}
            data-canvas-toolbar-action="toggle-right-node-tree"
            data-canvas-toolbar-kind="visibility-toggle"
            data-canvas-toolbar-target="right-panel"
            icon={
              isNodeLibraryVisible ? <RightPanelIcon size={18} /> : <RightPanelOffIcon size={18} />
            }
            title={nodeLibraryTitle}
            active={isNodeLibraryVisible}
            onClick={onToggleNodeLibrary}
          />
        </>
      )}

      <ToolbarSeparator />

      <ToolbarButton
        data-canvas-toolbar-action="undo"
        data-canvas-toolbar-kind="common-action"
        icon={<UndoIcon size={18} />}
        title={`${t('toolbar.undo')} (⌘Z)`}
        onClick={onUndo}
        disabled={!canUndo}
      />

      <ToolbarButton
        data-canvas-toolbar-action="redo"
        data-canvas-toolbar-kind="common-action"
        icon={<RedoIcon size={18} />}
        title={`${t('toolbar.redo')} (⇧⌘Z)`}
        onClick={onRedo}
        disabled={!canRedo}
      />

      {canControlPlaybackPanes ? (
        <>
          <ToolbarSeparator />

          <ToolbarButton
            aria-controls="canvas-playback-stage-pane"
            aria-expanded={workspaceSurfaceState.stage}
            data-canvas-toolbar-action="toggle-playback-stage-pane"
            data-canvas-toolbar-kind="visibility-toggle"
            data-canvas-toolbar-target="playback-stage"
            icon={<PlayIcon size={18} />}
            title={
              workspaceSurfaceState.stage
                ? t('playback.workspace.hideStage')
                : t('playback.workspace.showStage')
            }
            active={workspaceSurfaceState.stage}
            onClick={() => onToggleWorkspaceSurface('stage')}
          />
          <ToolbarButton
            aria-controls="canvas-playback-route-pane"
            aria-expanded={workspaceSurfaceState.route}
            data-canvas-toolbar-action="toggle-playback-route-pane"
            data-canvas-toolbar-kind="visibility-toggle"
            data-canvas-toolbar-target="playback-route"
            icon={<LayersIcon size={18} />}
            title={
              workspaceSurfaceState.route
                ? t('playback.workspace.hideRoute')
                : t('playback.workspace.showRoute')
            }
            active={workspaceSurfaceState.route}
            onClick={() => onToggleWorkspaceSurface('route')}
          />
        </>
      ) : null}

      {(onOpenExport || onOpenPackage) && <ToolbarSeparator />}

      {onOpenExport && (
        <ToolbarButton
          data-canvas-toolbar-action="open-export"
          data-canvas-toolbar-kind="common-action"
          icon={<DownloadIcon size={18} />}
          title={t('toolbar.export')}
          onClick={onOpenExport}
        />
      )}

      {onOpenPackage && (
        <ToolbarButton
          data-canvas-toolbar-action="open-package"
          data-canvas-toolbar-kind="common-action"
          icon={<PackageIcon size={18} />}
          title={t('toolbar.package')}
          onClick={onOpenPackage}
        />
      )}
    </VerticalToolbar>
  );
}

function SelectToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M5 3l12 9-5 1.2 3.4 5.9-2.5 1.4-3.3-5.8L6 18z"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HandToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 15V6a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.243-1.757l-3.5-3.5a1.5 1.5 0 0 1 2.121-2.121L8 17V6" />
    </svg>
  );
}
