import type { ReactNode } from 'react';

export interface TreeViewItem<TMetadata = unknown> {
  readonly id: string;
  readonly label: string;
  readonly description?: ReactNode;
  readonly title?: string;
  readonly decoration?: ReactNode;
  readonly decorationTitle?: string;
  readonly icon?: ReactNode;
  readonly children?: readonly TreeViewItem<TMetadata>[];
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly expanded?: boolean;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly draggable?: boolean;
  readonly badges?: readonly TreeViewBadge[];
  readonly actions?: readonly TreeViewAction[];
  readonly metadata?: TMetadata;
}

export interface TreeViewBadge {
  readonly id: string;
  readonly label: ReactNode;
  readonly title?: string;
}

export interface TreeViewAction {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly danger?: boolean;
}

export interface TreeViewVirtualizationOptions {
  readonly enabled: boolean;
  readonly threshold: number;
  readonly itemHeight: number;
  readonly overscan?: number;
}

export const DEFAULT_TREE_VIEW_VIRTUALIZATION: TreeViewVirtualizationOptions = {
  enabled: true,
  threshold: 200,
  itemHeight: 24,
  overscan: 8,
};
