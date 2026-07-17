import React from 'react';
import type { ViewportToolbarItem } from '@neko/shared';
import { ToolbarButton, ToolbarSeparator, VerticalToolbar } from '../primitives/toolbar';

export interface ViewportToolbarProps {
  readonly items: readonly ViewportToolbarItem[];
  readonly className?: string;
  readonly onAction?: (item: ViewportToolbarItem) => void;
}

export function ViewportToolbar({
  items,
  className,
  onAction,
}: ViewportToolbarProps): React.JSX.Element {
  const sorted = [...items].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

  return (
    <VerticalToolbar className={className ?? 'neko-viewport-toolbar'} width={48}>
      {sorted.map((item) =>
        item.kind === 'separator' ? (
          <ToolbarSeparator key={item.id} />
        ) : (
          <ToolbarButton
            key={item.id}
            icon={<span aria-hidden="true">{item.icon ?? item.label ?? item.id}</span>}
            title={item.disabledReason ?? item.label ?? item.id}
            active={item.kind === 'toggle' ? item.toggled === true : undefined}
            disabled={item.disabled}
            className="neko-viewport-toolbar-button"
            aria-disabled={item.disabled === true || item.degraded === true ? true : undefined}
            data-action={item.action}
            data-degraded={item.degraded === true ? 'true' : undefined}
            data-degraded-reason={item.degradedReason}
            onClick={() => onAction?.(item)}
          />
        ),
      )}
    </VerticalToolbar>
  );
}
