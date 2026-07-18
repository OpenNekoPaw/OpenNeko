import type {
  ProjectIndexFreshness,
  ProjectIndexPartitionStatus,
  ProjectSearchItem,
  ProjectSearchPartitionStatusSnapshot,
  ProjectSearchProviderCapabilities,
} from '@neko/shared';

export interface ProjectSearchPartitionStatusAggregationOptions {
  readonly partition: ProjectSearchPartitionStatusSnapshot['partition'];
  readonly provider?: ProjectSearchProviderCapabilities;
}

export function dedupeCreativeEntityProjectSearchItems(
  items: readonly ProjectSearchItem[],
): readonly ProjectSearchItem[] {
  const byKey = new Map<string, ProjectSearchItem>();

  for (const item of items) {
    const key = dedupeKeyForProjectSearchItem(item);
    const existing = byKey.get(key);
    if (!existing || shouldPreferProjectSearchItem(item, existing)) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()];
}

export function aggregateProjectSearchPartitionStatus(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
  options: ProjectSearchPartitionStatusAggregationOptions,
): ProjectSearchPartitionStatusSnapshot {
  const itemCount = sumItemCount(snapshots);
  const updatedAt = latestUpdatedAt(snapshots);
  return {
    partition: options.partition,
    status: aggregatePartitionStatus(snapshots),
    freshness: aggregateProjectSearchPartitionFreshness(snapshots),
    ...(itemCount !== undefined ? { itemCount } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(options.provider ? { provider: options.provider } : {}),
  };
}

export function aggregateProjectSearchItemsFreshness(
  items: readonly ProjectSearchItem[],
): ProjectIndexFreshness {
  return aggregateProjectSearchFreshnessValues(
    items.map((item) => item.freshness),
    'fresh',
  );
}

export function aggregateProjectSearchFreshnessValues(
  freshnessValues: readonly ProjectIndexFreshness[],
  emptyFreshness: ProjectIndexFreshness = 'stale',
): ProjectIndexFreshness {
  if (freshnessValues.length === 0) return emptyFreshness;
  if (freshnessValues.every((freshness) => freshness === 'failed')) return 'failed';
  if (freshnessValues.some((freshness) => freshness === 'failed')) return 'partial';
  if (freshnessValues.some((freshness) => freshness === 'building')) return 'building';
  if (freshnessValues.some((freshness) => freshness === 'stale')) return 'stale';
  return 'fresh';
}

function dedupeKeyForProjectSearchItem(item: ProjectSearchItem): string {
  if (item.kind === 'creative-entity') {
    const entityKind =
      readString(item.source.metadata?.['entityKind']) ??
      readString(item.metadata?.['entityType']) ??
      item.source.sourceKind ??
      '';
    const name = normalizeSearchIdentity(item.canonicalName ?? item.label);
    if (name) {
      return `${item.kind}:${item.projectRoot}:${entityKind}:${name}`;
    }
  }
  return `id:${item.id}`;
}

function shouldPreferProjectSearchItem(
  candidate: ProjectSearchItem,
  current: ProjectSearchItem,
): boolean {
  if (isUnifiedEntityProjection(candidate) && !isUnifiedEntityProjection(current)) {
    return true;
  }
  return candidate.freshness === 'fresh' && current.freshness !== 'fresh';
}

function isUnifiedEntityProjection(item: ProjectSearchItem): boolean {
  return (
    item.source.sourceId === 'neko-entity' ||
    readString(item.navigationData?.['source']) === 'neko-entity'
  );
}

function aggregatePartitionStatus(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): ProjectIndexPartitionStatus {
  if (snapshots.length === 0) return 'idle';
  if (snapshots.every((snapshot) => snapshot.status === 'failed')) return 'failed';
  if (snapshots.some((snapshot) => snapshot.status === 'loading')) return 'loading';
  if (snapshots.some((snapshot) => snapshot.status === 'building')) return 'building';
  if (snapshots.some((snapshot) => snapshot.status === 'ready')) return 'ready';
  if (snapshots.some((snapshot) => snapshot.status === 'stale')) return 'stale';
  return 'idle';
}

function aggregateProjectSearchPartitionFreshness(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): ProjectIndexFreshness {
  return aggregateProjectSearchFreshnessValues(
    snapshots.map((snapshot) => snapshot.freshness),
    'stale',
  );
}

function sumItemCount(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): number | undefined {
  let total = 0;
  let hasCount = false;
  for (const snapshot of snapshots) {
    if (snapshot.itemCount === undefined) continue;
    total += snapshot.itemCount;
    hasCount = true;
  }
  return hasCount ? total : undefined;
}

function latestUpdatedAt(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): string | undefined {
  return snapshots
    .map((snapshot) => snapshot.updatedAt)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort()
    .at(-1);
}

function normalizeSearchIdentity(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
