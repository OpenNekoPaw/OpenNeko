import type { ReactElement } from 'react';
import {
  PositionedContextMenu,
  type MenuAction,
  type MenuItem,
  type MenuSeparator,
  type PositionedContextMenuProps,
} from '@neko/ui/primitives';
import {
  CopyIcon,
  LayersIcon,
  PlusIcon,
  RefreshIcon,
  ScissorsIcon,
  SendIcon,
  UndoIcon,
  RedoIcon,
  PlayIcon,
} from '@neko/ui/icons';
import { t } from '../../i18n';
import { createCanvasAddActionIcon } from '../adapters/sharedCanvasUiAdapter';
import {
  CANVAS_ADD_ACTIONS,
  CANVAS_ADD_SOURCE_MODES,
  type CanvasAddActionId,
  type CanvasAddSourceModeId,
} from '../../utils/canvasAddActions';

export type MenuEntry = MenuItem;
export type ContextMenuProps = PositionedContextMenuProps;
export type { MenuAction, MenuItem, MenuSeparator, PositionedContextMenuProps };

const MENU_ICON_SIZE = 13;
const CANVAS_CONTEXT_MENU_CLASS_NAME = 'canvas-context-menu';

export function ContextMenu({ className, ...props }: PositionedContextMenuProps): ReactElement {
  const menuClassName = className
    ? `${CANVAS_CONTEXT_MENU_CLASS_NAME} ${className}`
    : CANVAS_CONTEXT_MENU_CLASS_NAME;
  return <PositionedContextMenu {...props} className={menuClassName} />;
}

function menuIcon(icon: ReactElement): ReactElement {
  return icon;
}

// =============================================================================
// Menu Builders
// =============================================================================

export interface CanvasMenuContext {
  canvasPosition: { x: number; y: number };
  hasSelection: boolean;
  selectedCount: number;
  isNodeLocked?: boolean;
  onAddAction: (
    actionId: CanvasAddActionId,
    pos: { x: number; y: number },
    sourceMode?: CanvasAddSourceModeId,
  ) => void;
  onSelectAll: () => void;
  onFitContent: () => void;
  onResetView: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onPasteInPlace?: () => void;
  onDuplicate?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onSetPlaybackEntry?: (nodeId: string) => void;
  contextNodeId?: string;
  canGroup?: boolean;
  canUngroup?: boolean;
  canPaste?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSendToAgent?: (intent?: string) => void;
}

/**
 * Build context menu items for canvas background right-click
 */
export function buildCanvasMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  return [
    buildCanvasAddActionMenu(ctx),
    { separator: true },
    {
      label: t('menu.paste'),
      icon: menuIcon(<CopyIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌘V',
      onClick: () => ctx.onPaste?.(),
      disabled: !ctx.canPaste,
    },
    {
      label: t('menu.pasteInPlace'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      shortcut: '⇧⌘V',
      onClick: () => ctx.onPasteInPlace?.(),
      disabled: !ctx.canPaste,
    },
    { separator: true },
    {
      label: t('menu.undo'),
      icon: menuIcon(<UndoIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌘Z',
      onClick: () => ctx.onUndo?.(),
      disabled: !ctx.canUndo,
    },
    {
      label: t('menu.redo'),
      icon: menuIcon(<RedoIcon size={MENU_ICON_SIZE} />),
      shortcut: '⇧⌘Z',
      onClick: () => ctx.onRedo?.(),
      disabled: !ctx.canRedo,
    },
    { separator: true },
    {
      label: t('menu.selectAll'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌘A',
      onClick: ctx.onSelectAll,
    },
    {
      label: t('menu.fitContent'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      onClick: ctx.onFitContent,
    },
    {
      label: t('menu.resetView'),
      icon: menuIcon(<RefreshIcon size={MENU_ICON_SIZE} />),
      onClick: ctx.onResetView,
    },
  ];
}

function buildCanvasAddActionMenu(ctx: CanvasMenuContext): MenuAction {
  return {
    label: t('toolbar.addNode'),
    icon: menuIcon(<PlusIcon size={MENU_ICON_SIZE} />),
    onClick: () => {},
    submenu: CANVAS_ADD_ACTIONS.map((action) => {
      const item = {
        label: t(action.labelKey),
        icon: createCanvasAddActionIcon(action.id),
      };
      if (action.mode !== 'source') {
        return {
          ...item,
          onClick: () => ctx.onAddAction(action.id, ctx.canvasPosition),
        };
      }
      return {
        ...item,
        onClick: () => {},
        submenu: CANVAS_ADD_SOURCE_MODES.map((sourceMode) => ({
          label: t(sourceMode.labelKey),
          onClick: () => ctx.onAddAction(action.id, ctx.canvasPosition, sourceMode.id),
        })),
      };
    }),
  };
}

/**
 * Build context menu items for node right-click
 */
export function buildNodeMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  return [
    {
      label: t('menu.copy'),
      icon: menuIcon(<CopyIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌘C',
      onClick: () => ctx.onCopy?.(),
    },
    {
      label: t('menu.cut'),
      icon: menuIcon(<ScissorsIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌘X',
      onClick: () => ctx.onCut?.(),
    },
    {
      label: t('menu.duplicate'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌘D',
      onClick: () => ctx.onDuplicate?.(),
    },
    { separator: true },
    {
      label: t('menu.group'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌘G',
      onClick: () => ctx.onGroup?.(),
      disabled: !ctx.canGroup,
    },
    {
      label: t('menu.ungroup'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      shortcut: '⇧⌘G',
      onClick: () => ctx.onUngroup?.(),
      disabled: !ctx.canUngroup,
    },
    { separator: true },
    {
      label: t('menu.bringToFront'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      onClick: () => {},
    },
    {
      label: t('menu.sendToBack'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      onClick: () => {},
    },
    {
      label: t('menu.setPlaybackEntry'),
      icon: menuIcon(<PlayIcon size={MENU_ICON_SIZE} />),
      onClick: () => {
        if (ctx.contextNodeId) {
          ctx.onSetPlaybackEntry?.(ctx.contextNodeId);
        }
      },
      disabled: !ctx.contextNodeId || !ctx.onSetPlaybackEntry,
    },
    { separator: true },
    {
      label: t('menu.ai.sendToAgent'),
      icon: menuIcon(<SendIcon size={MENU_ICON_SIZE} />),
      onClick: () => ctx.onSendToAgent?.(),
    },
  ];
}
