import type { ReactElement } from 'react';
import {
  PositionedContextMenu,
  type MenuAction,
  type MenuItem,
  type MenuSeparator,
  type PositionedContextMenuProps,
} from '@neko/ui/primitives';
import {
  CameraIcon,
  CopyIcon,
  EditIcon,
  LayersIcon,
  PackageIcon,
  PlusIcon,
  RefreshIcon,
  ScissorsIcon,
  SendIcon,
  TrashIcon,
  UndoIcon,
  RedoIcon,
  UploadIcon,
  PlayIcon,
} from '@neko/shared/icons';
import { t } from '../../i18n';

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
  onAddText: (pos: { x: number; y: number }) => void;
  onAddScene: (pos: { x: number; y: number }) => void;
  onAddShot?: (pos: { x: number; y: number }) => void;
  onAddGallery?: (pos: { x: number; y: number }) => void;
  onAddTable?: (pos: { x: number; y: number }) => void;
  onImportFile?: () => void;
  onDelete: () => void;
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
  // AI actions
  onGenerateSelected?: () => void;
  onBatchGenerate?: () => void;
  onSendToAgent?: (intent?: string) => void;
  hasShotSelected?: boolean;
  // Workflow: open selected shot image in neko-sketch
  onEditInSketch?: () => void;
  hasShotWithImage?: boolean;
  // E6: ControlNet editing + video generation
  onGenerateVideo?: () => void;
  onEditWithControlNet?: () => void;
}

/**
 * Build context menu items for canvas background right-click
 */
export function buildCanvasMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  return [
    {
      label: t('toolbar.addNode'),
      icon: menuIcon(<PlusIcon size={MENU_ICON_SIZE} />),
      onClick: () => {},
      submenu: [
        {
          label: t('menu.addShot'),
          icon: menuIcon(<CameraIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onAddShot?.(ctx.canvasPosition),
        },
        {
          label: t('menu.addScene'),
          icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onAddScene(ctx.canvasPosition),
        },
        {
          label: t('menu.addGallery'),
          icon: menuIcon(<CameraIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onAddGallery?.(ctx.canvasPosition),
        },
        {
          label: t('menu.addTable'),
          icon: menuIcon(<PackageIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onAddTable?.(ctx.canvasPosition),
        },
        { separator: true },
        {
          label: t('menu.addText'),
          icon: menuIcon(<EditIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onAddText(ctx.canvasPosition),
        },
      ],
    },
    {
      label: t('menu.importFile'),
      icon: menuIcon(<UploadIcon size={MENU_ICON_SIZE} />),
      onClick: () => ctx.onImportFile?.(),
    },
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
      label: t('menu.delete'),
      icon: menuIcon(<TrashIcon size={MENU_ICON_SIZE} />),
      shortcut: '⌫',
      onClick: ctx.onDelete,
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
    // ── AI section (unified shell) ──
    { separator: true },
    {
      label: t('menu.ai.generateImage'),
      icon: menuIcon(<CameraIcon size={MENU_ICON_SIZE} />),
      disabled: !ctx.hasShotSelected,
      onClick: () => ctx.onGenerateSelected?.(),
    },
    {
      label: t('menu.ai.batchGenerate'),
      icon: menuIcon(<LayersIcon size={MENU_ICON_SIZE} />),
      disabled: !ctx.hasShotSelected || (ctx.selectedCount ?? 0) < 2,
      onClick: () => ctx.onBatchGenerate?.(),
    },
    {
      label: t('menu.ai.editInSketch'),
      icon: menuIcon(<EditIcon size={MENU_ICON_SIZE} />),
      disabled: !ctx.hasShotWithImage,
      onClick: () => ctx.onEditInSketch?.(),
    },
    {
      label: t('menu.ai.editWithControlNet'),
      icon: menuIcon(<EditIcon size={MENU_ICON_SIZE} />),
      disabled: !ctx.hasShotWithImage,
      onClick: () => ctx.onEditWithControlNet?.(),
    },
    {
      label: t('menu.ai.generateVideo'),
      icon: menuIcon(<PlayIcon size={MENU_ICON_SIZE} />),
      disabled: !ctx.hasShotWithImage,
      onClick: () => ctx.onGenerateVideo?.(),
    },
    { separator: true },
    {
      label: t('menu.ai.sendToAgent'),
      icon: menuIcon(<SendIcon size={MENU_ICON_SIZE} />),
      onClick: () => {},
      submenu: [
        {
          label: t('menu.ai.optimizeDesc'),
          icon: menuIcon(<EditIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onSendToAgent?.('optimize'),
        },
        {
          label: t('menu.ai.adjustCamera'),
          icon: menuIcon(<CameraIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onSendToAgent?.('camera'),
        },
        {
          label: t('menu.ai.understand'),
          icon: menuIcon(<SendIcon size={MENU_ICON_SIZE} />),
          onClick: () => ctx.onSendToAgent?.('understand'),
        },
      ],
    },
  ];
}
