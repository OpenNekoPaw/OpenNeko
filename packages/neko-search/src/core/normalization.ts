import type {
  ProjectNormalizedSearchQuery,
  ProjectSearchItem,
  ProjectSearchQuery,
} from '@neko/shared';

export function normalizeProjectSearchQuery(text: string): ProjectNormalizedSearchQuery {
  const normalized = normalizeSearchText(text);
  return {
    raw: text,
    normalized,
    tokens: normalized ? normalized.split(' ').filter(Boolean) : [],
  };
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_\-./\\:()[\]{}'"`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildProjectSearchText(
  parts: readonly (string | undefined | readonly string[])[],
): string {
  const flattened: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === 'string') {
      flattened.push(part);
    } else {
      flattened.push(...part.filter(Boolean));
    }
  }
  return flattened.join(' ');
}

export function matchesProjectSearchItem(
  item: ProjectSearchItem,
  query: ProjectSearchQuery,
): boolean {
  if (!projectSearchItemMatchesFilters(item, query)) return false;

  const normalized = normalizeProjectSearchQuery(query.text);
  if (!normalized.normalized) return true;

  const haystack = normalizeSearchText(
    buildProjectSearchText([
      item.label,
      item.description,
      item.canonicalName,
      item.aliases,
      item.filePath,
      item.source.sourceId,
      item.source.sourceKind,
      item.source.refId,
      item.source.filePath,
      item.searchText,
    ]),
  );

  return normalized.tokens.every((token) => haystack.includes(token));
}

export function projectSearchItemMatchesFilters(
  item: ProjectSearchItem,
  query: ProjectSearchQuery,
): boolean {
  if (query.kinds && !query.kinds.includes(item.kind)) return false;
  if (query.partitions && !query.partitions.includes(item.source.partition)) return false;
  if (!matchesStringFilter(readMetadataString(item, 'fileType'), query.fileTypes, item.filePath)) {
    return false;
  }
  if (!matchesStringFilter(readMetadataString(item, 'mediaType'), query.mediaTypes)) {
    return false;
  }
  if (query.scopes && !matchesScopes(item, query.scopes)) return false;
  return true;
}

export function rankProjectSearchItems(
  items: readonly ProjectSearchItem[],
  query: ProjectSearchQuery,
): ProjectSearchItem[] {
  const normalized = normalizeProjectSearchQuery(query.text);
  return [...items]
    .map((item, index) => ({ item, index, score: scoreProjectSearchItem(item, normalized) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

function scoreProjectSearchItem(
  item: ProjectSearchItem,
  query: ProjectNormalizedSearchQuery,
): number {
  let score = item.scoreHints?.priority ?? 0;
  const label = normalizeSearchText(item.label);
  const canonicalName = normalizeSearchText(item.canonicalName ?? '');
  const aliases = (item.aliases ?? []).map(normalizeSearchText);
  const searchText = normalizeSearchText(item.searchText);

  if (!query.normalized) return score;
  if (label === query.normalized) score += 100;
  if (canonicalName === query.normalized) score += 95;
  if (aliases.includes(query.normalized)) score += 90;
  if (label.startsWith(query.normalized)) score += 60;
  if (canonicalName.startsWith(query.normalized)) score += 55;
  if (searchText.includes(query.normalized)) score += 20;
  if (item.scoreHints?.exact) score += 15;
  if (item.scoreHints?.currentProject) score += 5;

  return score;
}

function matchesStringFilter(
  value: string | undefined,
  filters: readonly string[] | undefined,
  fallbackPath?: string,
): boolean {
  if (!filters || filters.length === 0) return true;
  const normalizedFilters = filters.map((filter) => normalizeSearchText(filter));
  const normalizedValue = value ? normalizeSearchText(value) : undefined;
  if (normalizedValue && normalizedFilters.includes(normalizedValue)) return true;
  if (!fallbackPath) return false;
  const extension = fallbackPath.split('.').pop();
  return extension ? normalizedFilters.includes(normalizeSearchText(extension)) : false;
}

function matchesScopes(
  item: ProjectSearchItem,
  scopes: NonNullable<ProjectSearchQuery['scopes']>,
): boolean {
  return scopes.some((scope) => {
    if (scope.kind === 'project' || scope.kind === 'workspace') {
      return scope.id === undefined || scope.id === item.projectRoot;
    }
    if (scope.kind === 'current-file' || scope.kind === 'document') {
      return (
        (scope.filePath !== undefined && scope.filePath === item.filePath) ||
        (scope.uri !== undefined && scope.uri === item.source.uri)
      );
    }
    if (scope.kind === 'media-library') {
      return (
        scope.id === undefined ||
        scope.id === item.source.sourceId ||
        scope.id === readMetadataString(item, 'libraryName')
      );
    }
    return false;
  });
}

function readMetadataString(item: ProjectSearchItem, key: string): string | undefined {
  const value = item.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}
