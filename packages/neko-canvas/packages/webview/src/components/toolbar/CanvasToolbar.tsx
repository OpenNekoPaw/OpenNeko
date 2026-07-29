/**
 * CanvasToolbar - Floating bottom canvas toolbar
 *
 * Provides quick access to:
 * - Select / Hand tools
 * - Contextual Canvas add actions
 * - Undo / Redo
 * - Playback workspace surfaces
 *
 * Uses shared ToolbarButton for consistent active state and hover styling.
 */

import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { HorizontalToolbar, ToolbarButton, ToolbarSeparator } from '@neko/ui/primitives';
import { StorylineIcon } from '@neko/shared/icons';
import { useScopedHistoryStore as useHistoryStore } from '../../stores/canvasStoreScope';
import { t } from '../../i18n';
import { DownloadIcon, UndoIcon, RedoIcon, PackageIcon, PointerIcon } from '@neko/ui/icons';
import type { CanvasAddActionId } from '../../utils/canvasAddActions';
import { CanvasAddActionPopover } from './CanvasAddActionPopover';

// =============================================================================
// Types
// =============================================================================

export interface CanvasToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  /** Select tool mode */
  isSelectMode?: boolean;
  onSelectTool?: () => void;
  /** Creates or binds one user-authorable Canvas action. */
  onSelectAddAction?: (actionId: CanvasAddActionId) => void;
  /** Unified Storyline Overlay visibility, controlled from the floating toolbar. */
  playbackWorkspaceVisible?: boolean;
  onTogglePlaybackWorkspace?: () => void;
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
  onSelectAddAction,
  playbackWorkspaceVisible,
  onTogglePlaybackWorkspace,
  onOpenExport,
  onOpenPackage,
  isPanMode = false,
  onTogglePanMode,
}: CanvasToolbarProps) {
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const canControlPlaybackWorkspace =
    playbackWorkspaceVisible !== undefined && onTogglePlaybackWorkspace !== undefined;

  return (
    <HorizontalToolbar
      className="canvas-floating-toolbar neko-floating-toolbar relative z-20"
      data-orientation="horizontal"
      height={48}
      aria-label={t('toolbar.leftRail')}
      {...getKeyboardBoundaryMetadata({
        scope: 'popover',
        ownerId: 'canvas-toolbar',
        priority: 20,
        ownedKeys: ['Enter', 'Escape', 'Space', 'Tab', 'ArrowLeft', 'ArrowRight'],
      })}
    >
      <div
        aria-label={t('toolbar.navigationMode')}
        className="canvas-toolbar-mode-group neko-toolbar-mode-group"
        data-active-mode={isPanMode ? 'pan' : 'select'}
        data-canvas-toolbar-mode-group="navigation"
        role="group"
      >
        <ToolbarButton
          data-canvas-toolbar-action="select-tool"
          data-canvas-toolbar-kind="tool-mode"
          icon={<PointerIcon size={18} />}
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

      {onSelectAddAction && (
        <>
          <ToolbarSeparator orientation="vertical" />
          <CanvasAddActionPopover onSelectAction={onSelectAddAction} />
        </>
      )}

      <ToolbarSeparator orientation="vertical" />

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

      {canControlPlaybackWorkspace ? (
        <>
          <ToolbarSeparator orientation="vertical" />

          <ToolbarButton
            aria-controls="canvas-playback-overlay"
            aria-expanded={playbackWorkspaceVisible}
            data-canvas-toolbar-action="toggle-playback-panel"
            data-canvas-toolbar-kind="visibility-toggle"
            data-canvas-toolbar-target="overlay"
            icon={<StorylineIcon size={18} />}
            title={
              playbackWorkspaceVisible
                ? t('playback.workspace.hidePanel')
                : t('playback.workspace.showPanel')
            }
            active={playbackWorkspaceVisible}
            onClick={onTogglePlaybackWorkspace}
          />
        </>
      ) : null}

      {(onOpenExport || onOpenPackage) && <ToolbarSeparator orientation="vertical" />}

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
    </HorizontalToolbar>
  );
}

function HandToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 15V6a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.243-1.757l-3.5-3.5a1.5 1.5 0 0 1 2.121-2.121L8 17V6" />
    </svg>
  );
}
