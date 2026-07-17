import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { toCodiconClassName } from '../icons/codicon';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { cn } from '../utils';
import {
  DEFAULT_TREE_VIEW_VIRTUALIZATION,
  type TreeViewItem,
  type TreeViewVirtualizationOptions,
} from './tree-view-types';

export interface TreeViewProps {
  readonly items: readonly TreeViewItem[];
  readonly selectedIds?: ReadonlySet<string> | readonly string[];
  readonly expandedIds?: ReadonlySet<string> | readonly string[];
  readonly virtualization?: Partial<TreeViewVirtualizationOptions>;
  readonly label?: string;
  readonly className?: string;
  readonly height?: number;
  readonly scrollTop?: number;
  readonly focusedId?: string;
  readonly onSelect?: (id: string, event: TreeViewSelectEvent) => void;
  readonly onToggleExpand?: (id: string, expanded: boolean) => void;
  readonly onToggleVisibility?: (id: string, visible: boolean) => void;
  readonly onToggleLock?: (id: string, locked: boolean) => void;
  readonly onAction?: (id: string, actionId: string) => void;
  readonly onContextMenu?: (id: string, event: React.MouseEvent) => void;
  readonly onDragStart?: (id: string, event: React.DragEvent) => void;
  readonly onFocusItem?: (id: string) => void;
  readonly showStaticStateIndicators?: boolean;
  readonly visibilityDisabled?: boolean;
  readonly visibilityLabels?: TreeViewVisibilityLabels;
  readonly lockDisabled?: boolean;
  readonly lockLabels?: TreeViewLockLabels;
}

export interface TreeViewSelectEvent {
  readonly multi: boolean;
  readonly range: boolean;
}

export interface TreeViewVisibilityLabels {
  readonly hide: string;
  readonly show: string;
}

export interface TreeViewLockLabels {
  readonly lock: string;
  readonly unlock: string;
}

interface FlatTreeItem {
  readonly item: TreeViewItem;
  readonly depth: number;
  readonly expanded: boolean;
  readonly selected: boolean;
}

const DEFAULT_TREE_VIEW_HEIGHT = 240;

export function TreeView({
  className,
  expandedIds,
  focusedId,
  height,
  items,
  label = 'Tree',
  onFocusItem,
  onSelect,
  onAction,
  onContextMenu,
  onDragStart,
  onToggleLock,
  onToggleExpand,
  onToggleVisibility,
  scrollTop = 0,
  selectedIds,
  showStaticStateIndicators = true,
  virtualization,
  lockDisabled,
  lockLabels = DEFAULT_TREE_VIEW_LOCK_LABELS,
  visibilityDisabled,
  visibilityLabels = DEFAULT_TREE_VIEW_VISIBILITY_LABELS,
}: TreeViewProps): React.ReactElement {
  const viewportHeight = height ?? DEFAULT_TREE_VIEW_HEIGHT;
  const defaultExpandedIds = useMemo(() => collectDefaultExpandedIds(items), [items]);
  const itemIds = useMemo(() => collectTreeItemIds(items), [items]);
  const knownItemIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [internalExpandedIds, setInternalExpandedIds] = useState<ReadonlySet<string>>(
    () => defaultExpandedIds,
  );
  const controlledExpanded = expandedIds !== undefined;
  const expandedSet = controlledExpanded
    ? toReadonlySet(expandedIds)
    : mergeNewDefaultExpandedIds(internalExpandedIds, defaultExpandedIds, knownItemIdsRef.current);
  const selectedSet = toReadonlySet(selectedIds);
  const options = { ...DEFAULT_TREE_VIEW_VIRTUALIZATION, ...virtualization };
  const flatItems = flattenTreeItems(items, {
    controlledExpanded,
    controlledSelected: selectedIds !== undefined,
    expandedSet,
    selectedSet,
  });
  const useVirtualization = options.enabled && flatItems.length >= options.threshold;
  const visibleRows = useVirtualization
    ? getVirtualRows(flatItems, {
        height: viewportHeight,
        itemHeight: options.itemHeight,
        overscan: options.overscan ?? 0,
        scrollTop,
      })
    : { rows: flatItems, offsetTop: 0, totalHeight: flatItems.length * options.itemHeight };
  const viewportStyle =
    height !== undefined || useVirtualization
      ? { height: viewportHeight, minHeight: 0, overflow: 'auto' }
      : undefined;
  const toggleExpand = (id: string, expanded: boolean): void => {
    if (!controlledExpanded) {
      setInternalExpandedIds((current) => {
        const next = new Set(current);
        if (expanded) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    }
    onToggleExpand?.(id, expanded);
  };

  useEffect(() => {
    if (controlledExpanded) {
      knownItemIdsRef.current = itemIds;
      return;
    }

    setInternalExpandedIds((current) => {
      const next = new Set(current);
      const knownItemIds = knownItemIdsRef.current;
      let changed = false;

      for (const id of defaultExpandedIds) {
        if (!knownItemIds.has(id) && !next.has(id)) {
          next.add(id);
          changed = true;
        }
      }

      for (const id of next) {
        if (!itemIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : current;
    });
    knownItemIdsRef.current = itemIds;
  }, [controlledExpanded, defaultExpandedIds, itemIds]);

  return (
    <div
      aria-label={label}
      className={cn(
        'neko-creative-tree-view relative min-h-0 overflow-auto rounded-[var(--neko-radius-sm,6px)]',
        'border border-[var(--neko-border)] bg-[var(--vscode-editor-background)]',
        className,
      )}
      data-neko-tree-view="true"
      role="tree"
      style={viewportStyle}
      tabIndex={0}
      {...getKeyboardBoundaryMetadata({
        scope: 'tree',
        ownerId: label,
        ownedKeys: [
          'Enter',
          'Space',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
        ],
      })}
      onKeyDown={(event) => {
        handleTreeKeyDown({
          event,
          flatItems,
          focusedId,
          onFocusItem,
          onSelect,
          onToggleExpand: toggleExpand,
        });
      }}
    >
      <div
        data-virtualized={useVirtualization ? 'true' : 'false'}
        style={
          useVirtualization ? { height: visibleRows.totalHeight, position: 'relative' } : undefined
        }
      >
        <div
          style={
            useVirtualization ? { transform: `translateY(${visibleRows.offsetTop}px)` } : undefined
          }
        >
          {visibleRows.rows.map((row) => (
            <TreeViewRow
              key={row.item.id}
              row={row}
              focused={row.item.id === focusedId}
              itemHeight={options.itemHeight}
              onSelect={onSelect}
              onAction={onAction}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onFocusItem={onFocusItem}
              onToggleExpand={toggleExpand}
              onToggleLock={onToggleLock}
              onToggleVisibility={onToggleVisibility}
              showStaticStateIndicators={showStaticStateIndicators}
              lockDisabled={lockDisabled}
              lockLabels={lockLabels}
              visibilityDisabled={visibilityDisabled}
              visibilityLabels={visibilityLabels}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeViewRow({
  focused,
  itemHeight,
  lockDisabled,
  lockLabels,
  onAction,
  onContextMenu,
  onDragStart,
  onFocusItem,
  onSelect,
  onToggleExpand,
  onToggleLock,
  onToggleVisibility,
  row,
  showStaticStateIndicators,
  visibilityDisabled,
  visibilityLabels,
}: {
  readonly row: FlatTreeItem;
  readonly focused: boolean;
  readonly itemHeight: number;
  readonly lockDisabled?: boolean;
  readonly lockLabels: TreeViewLockLabels;
  readonly onAction?: TreeViewProps['onAction'];
  readonly onContextMenu?: TreeViewProps['onContextMenu'];
  readonly onDragStart?: TreeViewProps['onDragStart'];
  readonly onFocusItem?: TreeViewProps['onFocusItem'];
  readonly onSelect?: TreeViewProps['onSelect'];
  readonly onToggleExpand?: TreeViewProps['onToggleExpand'];
  readonly onToggleLock?: TreeViewProps['onToggleLock'];
  readonly onToggleVisibility?: TreeViewProps['onToggleVisibility'];
  readonly showStaticStateIndicators: boolean;
  readonly visibilityDisabled?: boolean;
  readonly visibilityLabels: TreeViewVisibilityLabels;
}): React.ReactElement {
  const { item } = row;
  const hasChildren = Boolean(item.children?.length);
  const visible = item.visible ?? true;
  const locked = item.locked ?? false;
  const visibilityLabel = visible ? visibilityLabels.hide : visibilityLabels.show;
  const lockLabel = locked ? lockLabels.unlock : lockLabels.lock;

  return (
    <div
      aria-disabled={item.disabled || undefined}
      aria-expanded={hasChildren ? row.expanded : undefined}
      aria-label={item.title ?? item.label}
      aria-selected={row.selected}
      className={cn(
        'group relative grid items-center gap-1 px-1 text-xs outline-none',
        showStaticStateIndicators
          ? 'grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]'
          : 'grid-cols-[auto_minmax(0,1fr)_auto]',
        'text-[var(--vscode-foreground)] transition-colors duration-100 hover:bg-[var(--neko-hover)]',
        row.selected
          ? 'bg-[var(--vscode-list-activeSelectionBackground,var(--neko-accent-muted))] text-[var(--vscode-list-activeSelectionForeground,var(--vscode-foreground))] before:absolute before:inset-y-[3px] before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--vscode-focusBorder,var(--neko-accent))]'
          : null,
        focused && !row.selected ? 'ring-1 ring-inset ring-[var(--vscode-focusBorder)]' : null,
        focused && row.selected ? 'ring-1 ring-inset ring-[var(--vscode-focusBorder)]' : null,
        item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-default',
      )}
      data-focused={focused ? 'true' : 'false'}
      data-selected={row.selected ? 'true' : 'false'}
      data-tree-item-id={item.id}
      draggable={item.draggable && !item.disabled ? true : undefined}
      role="treeitem"
      style={{ height: itemHeight, paddingLeft: 4 + row.depth * 14 }}
      tabIndex={focused ? 0 : -1}
      title={item.title}
      onClick={(event) => {
        if (!item.disabled) {
          onFocusItem?.(item.id);
          onSelect?.(item.id, {
            multi: event.metaKey || event.ctrlKey,
            range: event.shiftKey,
          });
        }
      }}
      onContextMenu={(event) => {
        onContextMenu?.(item.id, event);
      }}
      onDoubleClick={() => {
        if (hasChildren && !item.disabled) {
          onToggleExpand?.(item.id, !row.expanded);
        }
      }}
      onDragStart={(event) => {
        if (!item.draggable || item.disabled) {
          event.preventDefault();
          return;
        }
        onDragStart?.(item.id, event);
      }}
    >
      <button
        aria-label={row.expanded ? 'Collapse item' : 'Expand item'}
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-[var(--neko-radius-sm,6px)]',
          'text-[var(--vscode-descriptionForeground)] outline-none hover:bg-[var(--neko-hover)]',
          'focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
          !hasChildren ? 'invisible' : null,
        )}
        disabled={!hasChildren || item.disabled}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleExpand?.(item.id, !row.expanded);
        }}
      >
        <span
          aria-hidden="true"
          className={toCodiconClassName(row.expanded ? 'chevron-down' : 'chevron-right')}
        />
      </button>
      <span className="flex min-w-0 items-center gap-1 truncate">
        {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
        <span className={cn('truncate', row.selected ? 'font-medium' : null)}>{item.label}</span>
        {item.description ? (
          <span
            className="min-w-0 shrink truncate text-[var(--vscode-descriptionForeground)]"
            data-tree-item-description="true"
          >
            {item.description}
          </span>
        ) : null}
        {item.badges?.map((badge) => (
          <span
            key={badge.id}
            className={cn(
              'shrink-0 rounded-[var(--neko-radius-sm,6px)] px-1 text-[10px]',
              'bg-[var(--vscode-badge-background,var(--neko-accent-muted))] text-[var(--vscode-badge-foreground,var(--vscode-foreground))]',
            )}
            title={badge.title}
          >
            {badge.label}
          </span>
        ))}
      </span>
      {onToggleVisibility ? (
        <button
          aria-label={visibilityLabel}
          aria-pressed={visible}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-[var(--neko-radius-sm,6px)]',
            'outline-none hover:bg-[var(--neko-hover)] focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={visibilityDisabled || item.disabled}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisibility(item.id, !visible);
          }}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 rounded-full',
              visible ? 'bg-[var(--neko-accent)]' : 'bg-[var(--vscode-disabledForeground)]',
            )}
          />
        </button>
      ) : showStaticStateIndicators ? (
        <span
          aria-label={visible ? 'Visible' : 'Hidden'}
          className={cn(
            'h-2 w-2 rounded-full',
            visible ? 'bg-[var(--neko-accent)]' : 'bg-[var(--vscode-disabledForeground)]',
          )}
          role="img"
        />
      ) : null}
      {onToggleLock ? (
        <button
          aria-label={lockLabel}
          aria-pressed={locked}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-[var(--neko-radius-sm,6px)]',
            'outline-none hover:bg-[var(--neko-hover)] focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={lockDisabled || item.disabled}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleLock(item.id, !locked);
          }}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 rounded-sm border',
              locked
                ? 'border-[var(--neko-warning)] bg-[var(--neko-warning)]'
                : 'border-[var(--neko-border)]',
            )}
          />
        </button>
      ) : showStaticStateIndicators ? (
        <span
          aria-label={locked ? 'Locked' : 'Unlocked'}
          className={cn(
            'h-2 w-2 rounded-sm border',
            locked
              ? 'border-[var(--neko-warning)] bg-[var(--neko-warning)]'
              : 'border-[var(--neko-border)]',
          )}
          role="img"
        />
      ) : null}
      {item.decoration || item.actions?.length ? (
        <span className="flex min-w-0 items-center justify-end gap-1">
          {item.decoration ? (
            <span
              className="shrink-0 text-[var(--vscode-descriptionForeground)]"
              data-tree-item-decoration="true"
              title={item.decorationTitle}
            >
              {item.decoration}
            </span>
          ) : null}
          {item.actions?.map((action) => (
            <button
              key={action.id}
              aria-label={action.label}
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded-[var(--neko-radius-sm,6px)]',
                'outline-none hover:bg-[var(--neko-hover)] focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                action.danger ? 'text-[var(--vscode-errorForeground,var(--neko-danger))]' : null,
              )}
              disabled={action.disabled || item.disabled}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAction?.(item.id, action.id);
              }}
            >
              {action.icon}
            </button>
          ))}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

const DEFAULT_TREE_VIEW_VISIBILITY_LABELS: TreeViewVisibilityLabels = {
  hide: 'Hide item',
  show: 'Show item',
};

const DEFAULT_TREE_VIEW_LOCK_LABELS: TreeViewLockLabels = {
  lock: 'Lock item',
  unlock: 'Unlock item',
};

function flattenTreeItems(
  items: readonly TreeViewItem[],
  state: {
    readonly controlledExpanded: boolean;
    readonly controlledSelected: boolean;
    readonly expandedSet: ReadonlySet<string>;
    readonly selectedSet: ReadonlySet<string>;
  },
  depth = 0,
): FlatTreeItem[] {
  return items.flatMap((item) => {
    const expanded = state.expandedSet.has(item.id);
    const selected = state.controlledSelected
      ? state.selectedSet.has(item.id)
      : (item.selected ?? false);
    const current: FlatTreeItem[] = [{ depth, expanded, item, selected }];

    if (!expanded || !item.children?.length) {
      return current;
    }

    return [...current, ...flattenTreeItems(item.children, state, depth + 1)];
  });
}

function getVirtualRows(
  rows: readonly FlatTreeItem[],
  {
    height,
    itemHeight,
    overscan,
    scrollTop,
  }: {
    readonly height: number;
    readonly itemHeight: number;
    readonly overscan: number;
    readonly scrollTop: number;
  },
): { rows: readonly FlatTreeItem[]; offsetTop: number; totalHeight: number } {
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
  const end = Math.min(rows.length, start + visibleCount);

  return {
    rows: rows.slice(start, end),
    offsetTop: start * itemHeight,
    totalHeight: rows.length * itemHeight,
  };
}

function handleTreeKeyDown({
  event,
  flatItems,
  focusedId,
  onFocusItem,
  onSelect,
  onToggleExpand,
}: {
  readonly event: React.KeyboardEvent<HTMLDivElement>;
  readonly flatItems: readonly FlatTreeItem[];
  readonly focusedId?: string;
  readonly onFocusItem?: TreeViewProps['onFocusItem'];
  readonly onSelect?: TreeViewProps['onSelect'];
  readonly onToggleExpand?: TreeViewProps['onToggleExpand'];
}): void {
  if (flatItems.length === 0) return;

  const currentIndex = Math.max(
    0,
    flatItems.findIndex((row) => row.item.id === focusedId),
  );
  const current = flatItems[currentIndex] ?? flatItems[0];

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault();
      const next = flatItems[Math.min(flatItems.length - 1, currentIndex + 1)];
      if (next) onFocusItem?.(next.item.id);
      break;
    }
    case 'ArrowUp': {
      event.preventDefault();
      const previous = flatItems[Math.max(0, currentIndex - 1)];
      if (previous) onFocusItem?.(previous.item.id);
      break;
    }
    case 'ArrowRight': {
      if (current?.item.children?.length && !current.expanded) {
        event.preventDefault();
        onToggleExpand?.(current.item.id, true);
      }
      break;
    }
    case 'ArrowLeft': {
      if (current?.item.children?.length && current.expanded) {
        event.preventDefault();
        onToggleExpand?.(current.item.id, false);
      }
      break;
    }
    case 'Enter':
    case ' ': {
      if (current && !current.item.disabled) {
        event.preventDefault();
        onSelect?.(current.item.id, {
          multi: event.metaKey || event.ctrlKey,
          range: event.shiftKey,
        });
      }
      break;
    }
    default:
      break;
  }
}

function toReadonlySet(
  values: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!values) return new Set();
  return values instanceof Set ? values : new Set(values);
}

function collectDefaultExpandedIds(items: readonly TreeViewItem[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.expanded) {
      ids.add(item.id);
    }
    for (const childId of collectDefaultExpandedIds(item.children ?? [])) {
      ids.add(childId);
    }
  }
  return ids;
}

function collectTreeItemIds(items: readonly TreeViewItem[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const item of items) {
    ids.add(item.id);
    for (const childId of collectTreeItemIds(item.children ?? [])) {
      ids.add(childId);
    }
  }
  return ids;
}

function mergeNewDefaultExpandedIds(
  expandedIds: ReadonlySet<string>,
  defaultExpandedIds: ReadonlySet<string>,
  knownItemIds: ReadonlySet<string>,
): ReadonlySet<string> {
  let next: Set<string> | undefined;
  for (const id of defaultExpandedIds) {
    if (knownItemIds.has(id) || expandedIds.has(id)) {
      continue;
    }
    next ??= new Set(expandedIds);
    next.add(id);
  }
  return next ?? expandedIds;
}
