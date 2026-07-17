/**
 * ContextMenu — adapter wrapping the shared macOS glass ContextMenu.
 *
 * Keeps the existing neko-cut MenuItem type (separator as optional bool)
 * so all callers require no changes. Internally converts to the shared
 * discriminated union (MenuAction | MenuSeparator) before rendering.
 */

import { memo } from 'react';
import {
  PositionedContextMenu as SharedContextMenu,
  type MenuItem as SharedMenuItem,
} from '@neko/ui/primitives';

// ── neko-cut public MenuItem type (unchanged for callers) ────────────────────

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  shortcut?: string;
  submenu?: MenuItem[];
}

// ── Adapter ──────────────────────────────────────────────────────────────────

function toSharedItems(items: MenuItem[]): SharedMenuItem[] {
  return items.map((item): SharedMenuItem => {
    if (item.separator) return { separator: true };
    return {
      label: item.label,
      icon: item.icon,
      onClick: item.onClick,
      disabled: item.disabled,
      danger: item.danger,
      shortcut: item.shortcut,
      submenu: item.submenu ? toSharedItems(item.submenu) : undefined,
    };
  });
}

// ── Component ────────────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export const ContextMenu = memo(function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return <SharedContextMenu x={x} y={y} items={toSharedItems(items)} onClose={onClose} />;
});
