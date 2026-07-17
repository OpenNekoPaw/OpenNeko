import * as vscode from 'vscode';
import type { ProjectSearchResult } from '@neko/shared';
import {
  projectSearchResultToGlobalSearchResult,
  toProjectGlobalSearchQuery,
  type ProjectGlobalSearchQuery,
  type ProjectGlobalSearchResult,
} from '../core/projections';
import { PROJECT_SEARCH_QUERY_COMMAND } from './commands';

export async function queryProjectGlobalSearch(
  query: ProjectGlobalSearchQuery,
): Promise<ProjectGlobalSearchResult> {
  const result = await vscode.commands.executeCommand<ProjectSearchResult>(
    PROJECT_SEARCH_QUERY_COMMAND,
    toProjectGlobalSearchQuery(query),
  );
  return projectSearchResultToGlobalSearchResult(query, result ?? emptyResult(query));
}

function emptyResult(query: ProjectGlobalSearchQuery): ProjectSearchResult {
  return {
    query: toProjectGlobalSearchQuery(query),
    context: {},
    items: [],
    partitions: [],
    freshness: 'failed',
  };
}
