import type {
  ProjectIndexFreshness,
  ProjectSearchAdapter,
  ProjectSearchItem,
  ProjectSearchItemKind,
  ProjectSearchPartitionKind,
} from '@neko/shared';

export function createProjectSearchItem(input: {
  readonly id: string;
  readonly kind: ProjectSearchItemKind;
  readonly label: string;
  readonly partition: ProjectSearchPartitionKind;
  readonly projectRoot?: string;
  readonly priority?: number;
  readonly freshness?: ProjectIndexFreshness;
  readonly searchText?: string;
}): ProjectSearchItem {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    source: { partition: input.partition },
    projectRoot: input.projectRoot ?? '/workspace',
    searchText: input.searchText ?? input.label,
    scoreHints: { priority: input.priority ?? 0 },
    freshness: input.freshness ?? 'fresh',
  };
}

export function createStaticProjectSearchAdapter(
  partition: ProjectSearchPartitionKind,
  items: readonly ProjectSearchItem[],
): ProjectSearchAdapter {
  return {
    partition,
    ensureInitialized: async () => undefined,
    query: async () => items,
    getStatus: () => ({
      partition,
      status: 'ready',
      freshness: 'fresh',
      itemCount: items.length,
    }),
  };
}
