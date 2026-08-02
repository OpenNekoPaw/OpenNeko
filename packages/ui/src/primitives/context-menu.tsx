import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { useState } from 'react';
import type React from 'react';
import type { ReactNode } from 'react';
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

export interface ContextMenuActionItem {
  readonly type?: 'item';
  readonly id: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly shortcut?: ReactNode;
  readonly onSelect?: () => void;
}

export interface ContextMenuSeparatorItem {
  readonly type: 'separator';
  readonly id: string;
}

export type ContextMenuItem = ContextMenuActionItem | ContextMenuSeparatorItem;

export interface ContextMenuProps {
  readonly trigger: ReactNode;
  readonly items: readonly ContextMenuItem[];
  readonly alignOffset?: number;
  readonly className?: string;
  readonly onOpenChange?: (open: boolean) => void;
}

export function ContextMenu({
  alignOffset,
  className,
  items,
  onOpenChange,
  trigger,
}: ContextMenuProps): React.ReactElement {
  return (
    <ContextMenuPrimitive.Root onOpenChange={onOpenChange}>
      <ContextMenuPrimitive.Trigger asChild>{trigger}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          alignOffset={alignOffset}
          className={className}
          style={{
            ...MENU_SURFACE_STYLE,
            overflow: 'hidden',
            zIndex: 10_000,
          }}
          {...getKeyboardBoundaryMetadata({
            scope: 'menu',
            ownerId: 'context-menu',
            priority: 40,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          })}
        >
          {items.map((item) =>
            item.type === 'separator' ? (
              <ContextMenuPrimitive.Separator
                key={item.id}
                className="neko-menu-sep"
                style={MENU_SEPARATOR_STYLE}
              />
            ) : (
              <ContextMenuAction key={item.id} item={item} />
            ),
          )}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

function ContextMenuAction({ item }: { readonly item: ContextMenuActionItem }): React.ReactElement {
  const [interactive, setInteractive] = useState(false);

  return (
    <ContextMenuPrimitive.Item
      className={item.danger ? 'neko-menu-item danger' : 'neko-menu-item'}
      disabled={item.disabled}
      onBlur={() => setInteractive(false)}
      onFocus={() => setInteractive(true)}
      onMouseEnter={() => setInteractive(true)}
      onMouseLeave={() => setInteractive(false)}
      onSelect={item.onSelect}
      style={{
        ...CONTEXT_MENU_ITEM_STYLE,
        ...(interactive ? MENU_ACTION_INTERACTIVE_STYLE : null),
        ...(item.danger ? MENU_ACTION_DANGER_STYLE : null),
        ...(interactive && item.danger ? MENU_ACTION_DANGER_INTERACTIVE_STYLE : null),
        ...(item.disabled ? MENU_ACTION_DISABLED_STYLE : null),
      }}
    >
      <span style={CONTEXT_MENU_ITEM_LABEL_STYLE}>{item.label}</span>
      {item.shortcut ? (
        <span
          className="neko-menu-item-shortcut neko-shortcut-hint"
          data-neko-shortcut-hint="true"
          style={MENU_SHORTCUT_STYLE}
        >
          {item.shortcut}
        </span>
      ) : null}
    </ContextMenuPrimitive.Item>
  );
}

const CONTEXT_MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  minHeight: 26,
  padding: '5px 10px',
  borderRadius: 'var(--radius-sm, var(--neko-radius-sm, 6px))',
  color: 'inherit',
  cursor: 'default',
  fontSize: 13,
  outline: 'none',
  userSelect: 'none',
};

const CONTEXT_MENU_ITEM_LABEL_STYLE: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
