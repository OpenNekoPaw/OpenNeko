/**
 * ContextMenu — macOS glass-style context menu with sub-menu support.
 *
 * Features:
 * - macOS frosted glass visual style (--neko-glass-* tokens)
 * - Sub-menus with 150ms hover delay
 * - danger variant (red text / red hover background)
 * - Viewport-aware positioning (auto-flips when near edges)
 * - Portal rendering into document.body
 * - Closes on: outside click (capture), Escape, scroll, window blur
 *
 * CSS classes injected by Tailwind preset plugin.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Types ────────────────────────────────────────────────────────────────────

export type MenuSeparator = { separator: true };

export type MenuAction = {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  submenu?: MenuItem[];
  onClick: () => void;
};

export type MenuItem = MenuAction | MenuSeparator;

function isSeparator(item: MenuItem): item is MenuSeparator {
  return 'separator' in item && item.separator === true;
}

const MENU_GROUP_ATTR = 'data-neko-menu-group';

// ── ContextMenu ──────────────────────────────────────────────────────────────

export interface ContextMenuProps {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
  className?: string;
  /** @internal Used to link parent and sub-menu portals for outside-click detection. */
  menuGroupId?: string;
}

export function ContextMenu({ items, x, y, onClose, className, menuGroupId }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const ownId = useId();
  const groupId = menuGroupId ?? ownId;
  const isRoot = menuGroupId === undefined;

  // Adjust position to keep menu within viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: rect.right > vw ? Math.max(0, x - rect.width) : x,
      y: rect.bottom > vh ? Math.max(0, y - rect.height) : y,
    });
  }, [x, y]);

  // Only the root menu registers outside-click / Escape / scroll listeners.
  // Sub-menus are linked by the shared menuGroupId data attribute.
  useEffect(() => {
    if (!isRoot) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(`[${MENU_GROUP_ATTR}="${CSS.escape(groupId)}"]`)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    const handleBlur = () => onClose();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isRoot, groupId, onClose]);

  // Focus menu on mount for keyboard navigation
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  const content = (
    <div
      ref={menuRef}
      className={`neko-menu${className ? ` ${className}` : ''}`}
      style={{ left: pos.x, top: pos.y }}
      role="menu"
      tabIndex={-1}
      {...{ [MENU_GROUP_ATTR]: groupId }}
    >
      {items.map((item, i) =>
        isSeparator(item) ? (
          <div key={i} className="neko-menu-sep" role="separator" />
        ) : (
          <MenuItemRow key={i} item={item} onClose={onClose} menuGroupId={groupId} />
        ),
      )}
    </div>
  );

  return createPortal(content, document.body);
}

// ── MenuItemRow ──────────────────────────────────────────────────────────────

interface MenuItemRowProps {
  item: MenuAction;
  onClose: () => void;
  menuGroupId: string;
}

function MenuItemRow({ item, onClose, menuGroupId }: MenuItemRowProps) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const hasSubmenu = (item.submenu?.length ?? 0) > 0;

  const handleMouseEnter = useCallback(() => {
    if (!hasSubmenu) return;
    hoverTimerRef.current = setTimeout(() => setSubmenuOpen(true), 150);
  }, [hasSubmenu]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (item.disabled) return;
    if (!hasSubmenu) {
      item.onClick();
      onClose();
    }
  }, [item, hasSubmenu, onClose]);

  const cls = ['neko-menu-item', item.danger ? 'danger' : ''].filter(Boolean).join(' ');

  // Calculate sub-menu position relative to the row
  const getSubmenuPos = () => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vw = window.innerWidth;
    const submenuWidth = 180;
    const x = rect.right + submenuWidth > vw ? rect.left - submenuWidth : rect.right;
    return { x, y: rect.top };
  };

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={rowRef}
        className={cls}
        onClick={handleClick}
        disabled={item.disabled}
        role="menuitem"
      >
        {item.icon !== undefined && <span className="neko-menu-item-icon">{item.icon}</span>}
        <span className="neko-menu-item-label">{item.label}</span>
        {item.shortcut !== undefined && (
          <span className="neko-menu-item-shortcut">{item.shortcut}</span>
        )}
        {hasSubmenu && <span className="neko-menu-item-arrow">›</span>}
      </button>

      {submenuOpen &&
        hasSubmenu &&
        (() => {
          const { x, y } = getSubmenuPos();
          return (
            <ContextMenu
              items={item.submenu!}
              x={x}
              y={y}
              onClose={onClose}
              menuGroupId={menuGroupId}
            />
          );
        })()}
    </div>
  );
}
