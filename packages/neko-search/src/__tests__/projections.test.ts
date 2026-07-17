import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ProjectSearchResult } from '@neko/shared';
import { PROJECT_SEARCH_QUERY_COMMAND, queryProjectGlobalSearch } from '../host-vscode';
import {
  projectSearchResultToGlobalSearchResult,
  toProjectGlobalSearchQuery,
} from '../core/projections';

vi.mock('vscode', async () => await import('../testing/vscode'));

describe('project search consumer projections', () => {
  it('maps Dashboard/global search queries to shared project search mode', () => {
    expect(
      toProjectGlobalSearchQuery({
        text: '小橘',
        projectRoot: '/workspace',
        contextFilePath: '/workspace/cases/test.fountain',
        limit: 5,
      }),
    ).toEqual({
      text: '小橘',
      mode: 'global',
      projectRoot: '/workspace',
      contextFilePath: '/workspace/cases/test.fountain',
      limit: 5,
    });
  });

  it('projects shared search results without exposing cache schemas', () => {
    const result = projectSearchResultToGlobalSearchResult(
      { text: '小橘' },
      {
        query: { text: '小橘', mode: 'global' },
        context: { projectRoot: '/workspace' },
        freshness: 'fresh',
        generation: 7,
        partitions: [],
        items: [
          {
            id: 'entity:xiaoju',
            kind: 'creative-entity',
            label: '小橘',
            source: {
              partition: 'creative-entities',
              sourceId: 'xiaoju',
              projectRelativePath: 'characters.json',
            },
            projectRoot: '/workspace',
            searchText: '小橘',
            freshness: 'fresh',
            navigationData: { entityId: 'xiaoju' },
            metadata: { internalCachePath: '.neko/.cache/asset-graph.json' },
          },
        ],
      },
    );

    expect(result).toEqual({
      query: { text: '小橘' },
      freshness: 'fresh',
      generation: 7,
      items: [
        expect.objectContaining({
          id: 'entity:xiaoju',
          label: '小橘',
          source: expect.objectContaining({ projectRelativePath: 'characters.json' }),
          navigationData: { entityId: 'xiaoju' },
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain('internalCachePath');
    expect(JSON.stringify(result)).not.toContain('.neko/.cache');
  });

  it('queries the host command for Dashboard/global search consumers', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      query: { text: '小橘', mode: 'global' },
      context: { projectRoot: '/workspace' },
      items: [],
      partitions: [],
      freshness: 'fresh',
    } satisfies ProjectSearchResult);

    await expect(queryProjectGlobalSearch({ text: '小橘' })).resolves.toEqual({
      query: { text: '小橘' },
      items: [],
      freshness: 'fresh',
    });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(PROJECT_SEARCH_QUERY_COMMAND, {
      text: '小橘',
      mode: 'global',
    });
  });
});
