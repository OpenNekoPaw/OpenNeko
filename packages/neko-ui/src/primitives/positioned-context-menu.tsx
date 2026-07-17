import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import {
  MENU_ACTION_DANGER_INTERACTIVE_STYLE,
  MENU_ACTION_DANGER_STYLE,
  MENU_ACTION_DISABLED_STYLE,
  MENU_ACTION_INTERACTIVE_STYLE,
  MENU_SEPARATOR_STYLE,
  MENU_SHORTCUT_STYLE,
  MENU_SURFACE_STYLE,
} from './menu-theme';

export type MenuSeparator = { readonly separator: true };

export type MenuAction = {
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly submenu?: readonly MenuItem[];
  readonly onClick: () => void;
};

export type MenuItem = MenuAction | MenuSeparator;

export interface PositionedContextMenuProps {
  readonly items: readonly MenuItem[];
  readonly x: number;
  readonly y: number;
  readonly onClose: () => void;
  readonly className?: string;
  /** @internal Links parent and sub-menu portals for outside-click detection. */
  readonly menuGroupId?: string;
}

const MENU_GROUP_ATTR = 'data-neko-menu-group';

export function PositionedContextMenu({
  className,
  items,
  menuGroupId,
  onClose,
  x,
  y,
}: PositionedContextMenuProps): React.ReactPortal {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const ownId = useId();
  const groupId = menuGroupId ?? ownId;
  const isRoot = menuGroupId === undefined;

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({
      x: rect.right > window.innerWidth ? Math.max(0, x - rect.width) : x,
      y: rect.bottom > window.innerHeight ? Math.max(0, y - rect.height) : y,
    });
  }, [x, y]);

  useEffect(() => {
    if (!isRoot) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(`[${MENU_GROUP_ATTR}="${cssEscape(groupId)}"]`)
      ) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
  }, [groupId, isRoot, onClose]);

  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  return createPortal(
    <div
      ref={menuRef}
      className={className ? `neko-menu ${className}` : 'neko-menu'}
      role="menu"
      style={{ ...POSITIONED_MENU_STYLE, left: position.x, top: position.y }}
      tabIndex={-1}
      {...getKeyboardBoundaryMetadata({
        scope: 'menu',
        ownerId: groupId,
        priority: 40,
        ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
      })}
      {...{ [MENU_GROUP_ATTR]: groupId }}
    >
      {items.map((item, index) =>
        isSeparator(item) ? (
          <div
            key={index}
            className="neko-menu-sep"
            role="separator"
            style={MENU_SEPARATOR_STYLE}
          />
        ) : (
          <PositionedContextMenuItem
            className={className}
            key={index}
            item={item}
            menuGroupId={groupId}
            onClose={onClose}
          />
        ),
      )}
    </div>,
    document.body,
  );
}

function PositionedContextMenuItem({
  className,
  item,
  menuGroupId,
  onClose,
}: {
  readonly className: string | undefined;
  readonly item: MenuAction;
  readonly menuGroupId: string;
  readonly onClose: () => void;
}): React.ReactElement {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const hasSubmenu = (item.submenu?.length ?? 0) > 0;

  const handleMouseEnter = useCallback(() => {
    setInteractive(true);
    if (!hasSubmenu) return;
    hoverTimerRef.current = setTimeout(() => setSubmenuOpen(true), 150);
  }, [hasSubmenu]);

  const handleMouseLeave = useCallback(() => {
    setInteractive(false);
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
  }, [hasSubmenu, item, onClose]);

  const submenuPosition = getSubmenuPosition(rowRef.current);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={rowRef}
        className={item.danger ? 'neko-menu-item danger' : 'neko-menu-item'}
        disabled={item.disabled}
        role="menuitem"
        onBlur={() => setInteractive(false)}
        onClick={handleClick}
        onFocus={() => setInteractive(true)}
        style={{
          ...MENU_ITEM_STYLE,
          ...(interactive ? MENU_ACTION_INTERACTIVE_STYLE : null),
          ...(item.danger ? MENU_ACTION_DANGER_STYLE : null),
          ...(interactive && item.danger ? MENU_ACTION_DANGER_INTERACTIVE_STYLE : null),
          ...(item.disabled ? MENU_ACTION_DISABLED_STYLE : null),
        }}
      >
        {item.icon !== undefined ? (
          <span className="neko-menu-item-icon" style={MENU_ITEM_ICON_STYLE}>
            {item.icon}
          </span>
        ) : null}
        <span className="neko-menu-item-label" style={MENU_ITEM_LABEL_STYLE}>
          {item.label}
        </span>
        {item.shortcut !== undefined ? (
          <span
            className="neko-menu-item-shortcut neko-shortcut-hint"
            data-neko-shortcut-hint="true"
            style={POSITIONED_MENU_SHORTCUT_STYLE}
          >
            {item.shortcut}
          </span>
        ) : null}
        {hasSubmenu ? (
          <span className="neko-menu-item-arrow" style={MENU_ITEM_ARROW_STYLE}>
            ›
          </span>
        ) : null}
      </button>

      {submenuOpen && hasSubmenu ? (
        <PositionedContextMenu
          className={className}
          items={item.submenu ?? []}
          menuGroupId={menuGroupId}
          x={submenuPosition.x}
          y={submenuPosition.y}
          onClose={onClose}
        />
      ) : null}
    </div>
  );
}

function isSeparator(item: MenuItem): item is MenuSeparator {
  return 'separator' in item && item.separator === true;
}

function getSubmenuPosition(row: HTMLButtonElement | null): { x: number; y: number } {
  const rect = row?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  const submenuWidth = 180;
  const x = rect.right + submenuWidth > window.innerWidth ? rect.left - submenuWidth : rect.right;
  return { x, y: rect.top };
}

function cssEscape(value: string): string {
  const css = globalThis.CSS as { escape?: (raw: string) => string } | undefined;
  return css?.escape ? css.escape(value) : value.replace(/"/g, '\\"');
}

const POSITIONED_MENU_STYLE: React.CSSProperties = {
  ...MENU_SURFACE_STYLE,
  position: 'fixed',
  zIndex: 10_000,
};

const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  minHeight: 26,
  padding: '5px 10px',
  border: 0,
  borderRadius: 'var(--radius-sm, var(--neko-radius-sm, 6px))',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
  textAlign: 'left',
  transition: 'background 100ms ease, color 100ms ease',
  userSelect: 'none',
};

const MENU_ITEM_ICON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  flexShrink: 0,
  width: 16,
  alignItems: 'center',
  justifyContent: 'center',
};

const MENU_ITEM_LABEL_STYLE: React.CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const MENU_ITEM_ARROW_STYLE: React.CSSProperties = {
  flexShrink: 0,
  marginLeft: 8,
  opacity: 0.72,
};

const POSITIONED_MENU_SHORTCUT_STYLE: React.CSSProperties = {
  ...MENU_SHORTCUT_STYLE,
  marginLeft: 12,
};
