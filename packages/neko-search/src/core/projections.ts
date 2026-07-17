import type {
  ProjectIndexFreshness,
  ProjectSearchItem,
  ProjectSearchQuery,
  ProjectSearchResult,
  ProjectSearchSourceRef,
} from '@neko/shared';

export interface ProjectGlobalSearchQuery {
  readonly text: string;
  readonly projectRoot?: string;
  readonly contextFilePath?: string;
  readonly limit?: number;
}

export interface ProjectGlobalSearchItem {
  readonly id: string;
  readonly label: string;
  readonly kind: ProjectSearchItem['kind'];
  readonly description?: string;
  readonly icon?: string;
  readonly source: ProjectSearchSourceRef;
  readonly freshness: ProjectIndexFreshness;
  readonly projectRoot: string;
  readonly navigationData?: Record<string, unknown>;
  readonly thumbnailUri?: string;
}

export interface ProjectGlobalSearchResult {
  readonly query: ProjectGlobalSearchQuery;
  readonly items: readonly ProjectGlobalSearchItem[];
  readonly freshness: ProjectIndexFreshness;
  readonly generation?: number;
}

export function toProjectGlobalSearchQuery(query: ProjectGlobalSearchQuery): ProjectSearchQuery {
  return {
    text: query.text,
    mode: 'global',
    ...(query.projectRoot ? { projectRoot: query.projectRoot } : {}),
    ...(query.contextFilePath ? { contextFilePath: query.contextFilePath } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  };
}

export function projectSearchResultToGlobalSearchResult(
  query: ProjectGlobalSearchQuery,
  result: ProjectSearchResult,
): ProjectGlobalSearchResult {
  return {
    query,
    items: result.items.map(projectSearchItemToGlobalSearchItem),
    freshness: result.freshness,
    ...(result.generation !== undefined ? { generation: result.generation } : {}),
  };
}

export function projectSearchItemToGlobalSearchItem(
  item: ProjectSearchItem,
): ProjectGlobalSearchItem {
  return {
    id: item.id,
    label: item.label,
    kind: item.kind,
    ...(item.description ? { description: item.description } : {}),
    ...(item.icon ? { icon: item.icon } : {}),
    source: item.source,
    freshness: item.freshness,
    projectRoot: item.projectRoot,
    ...(item.navigationData ? { navigationData: item.navigationData } : {}),
    ...(item.thumbnailUri ? { thumbnailUri: item.thumbnailUri } : {}),
  };
}
