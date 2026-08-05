import type React from 'react';
import type { ReactNode } from 'react';

export type RetainedSurfaceLifecyclePolicy = 'hot-retained' | 'suspendable' | 'ephemeral';

export interface RetainedSurfacePresentation {
  readonly active: boolean;
  readonly suspended: boolean;
  readonly lifecycle: RetainedSurfaceLifecyclePolicy;
}

export interface RetainedSurfaceDeckProps<TItem> {
  readonly items: readonly TItem[];
  readonly activeId: string | undefined;
  readonly getId: (item: TItem) => string;
  readonly getLifecycle: (item: TItem) => RetainedSurfaceLifecyclePolicy;
  readonly renderItem: (item: TItem, presentation: RetainedSurfacePresentation) => ReactNode;
  readonly visible?: boolean;
  readonly className?: string;
  readonly itemClassName?: string;
  readonly itemIdentityAttribute?: `data-${string}`;
}

export function RetainedSurfaceDeck<TItem>({
  activeId,
  className,
  getId,
  getLifecycle,
  itemClassName,
  itemIdentityAttribute,
  items,
  renderItem,
  visible = true,
}: RetainedSurfaceDeckProps<TItem>): React.ReactElement {
  const ids = new Set<string>();
  for (const item of items) {
    const id = getId(item);
    if (ids.has(id)) throw new Error(`Retained Surface identity '${id}' is duplicated.`);
    ids.add(id);
  }
  if (activeId !== undefined && !ids.has(activeId)) {
    throw new Error(`Active retained Surface '${activeId}' is unavailable.`);
  }

  return (
    <div className={className} data-neko-retained-surface-deck="true">
      {items.map((item) => {
        const id = getId(item);
        const active = visible && id === activeId;
        const lifecycle = getLifecycle(item);
        if (lifecycle === 'ephemeral' && !active) return null;
        const identityAttribute = itemIdentityAttribute
          ? { [itemIdentityAttribute]: id }
          : undefined;
        return (
          <div
            key={id}
            className={itemClassName}
            data-neko-retained-surface={id}
            data-active={active ? 'true' : 'false'}
            data-lifecycle={lifecycle}
            {...identityAttribute}
            hidden={!active}
            aria-hidden={!active}
          >
            {renderItem(item, {
              active,
              suspended: lifecycle === 'suspendable' && !active,
              lifecycle,
            })}
          </div>
        );
      })}
    </div>
  );
}
