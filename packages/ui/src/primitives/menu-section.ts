import type { MenuItem } from './positioned-context-menu';

export interface MenuSectionAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly onClick: () => void;
}

export interface MenuSectionGroup {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly actions: readonly MenuSectionAction[];
}

export interface MenuSectionConfig {
  readonly actions?: readonly MenuSectionAction[];
  readonly groups?: readonly MenuSectionGroup[];
  readonly trailingActions?: readonly MenuSectionAction[];
}

export function buildMenuSection(config: MenuSectionConfig): MenuItem[] {
  const items: MenuItem[] = [];
  appendSeparator(items);
  appendActions(items, config.actions ?? []);

  for (const group of config.groups ?? []) {
    if (items.length > 1) {
      appendSeparator(items);
    }
    items.push({
      label: group.label,
      icon: group.icon,
      disabled: group.disabled,
      onClick: () => {},
      submenu: group.actions.map(toMenuItem),
    });
  }

  if (config.trailingActions && config.trailingActions.length > 0) {
    if (items.length > 1) {
      appendSeparator(items);
    }
    appendActions(items, config.trailingActions);
  }

  return items.length === 1 ? [] : items;
}

function appendActions(items: MenuItem[], actions: readonly MenuSectionAction[]): void {
  for (const action of actions) {
    items.push(toMenuItem(action));
  }
}

function appendSeparator(items: MenuItem[]): void {
  items.push({ separator: true });
}

function toMenuItem(action: MenuSectionAction): MenuItem {
  return {
    label: action.label,
    icon: action.icon,
    shortcut: action.shortcut,
    disabled: action.disabled,
    danger: action.danger,
    onClick: action.onClick,
  };
}
