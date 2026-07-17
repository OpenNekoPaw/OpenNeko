import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';
import { searchProjectMentionCandidates } from '../projectMentionSearch';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('projectMentionSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
    vscode.window.activeTextEditor = {
      document: { uri: vscode.Uri.file('/workspace/cases/test.fountain') },
    } as any;
  });

  it('queries the project search service and maps shared items to mention candidates', async () => {
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (_command: string) => {
      return {
        items: [
          {
            id: 'script-role:/workspace/cases/test.fountain:小橘',
            kind: 'script-role',
            label: '小橘',
            description: 'Script role',
            icon: '@',
            source: {
              partition: 'story-symbols',
              sourceId: '小橘',
              sourceKind: 'script-role',
            },
            projectRoot: '/workspace',
            filePath: '/workspace/cases/test.fountain',
            searchText: '小橘',
            freshness: 'fresh',
          },
          {
            id: 'asset:asset-1',
            kind: 'asset',
            label: '橘猫参考图',
            description: 'Asset',
            icon: '🎭',
            source: {
              partition: 'asset-library',
              sourceId: 'asset-1',
              sourceKind: 'character',
            },
            projectRoot: '/workspace',
            filePath: 'assets/xiaoju.png',
            searchText: '橘猫参考图 小橘',
            freshness: 'fresh',
            metadata: { mediaType: 'image', entityType: 'character' },
            visualResource: {
              projectedUri: 'webview:/workspace/.neko/.cache/resources/thumbnails/asset-1.jpg',
              status: 'ready',
              alt: '橘猫参考图',
            },
          },
          {
            id: 'entity-requirement:req-1',
            kind: 'entity-candidate',
            label: '小灰',
            description: 'Missing portrait',
            source: {
              partition: 'creative-entities',
              sourceId: 'req-1',
              sourceKind: 'entity-asset-requirement',
            },
            projectRoot: '/workspace',
            searchText: '小灰 portrait',
            freshness: 'fresh',
            metadata: { entityType: 'character' },
          },
          {
            id: 'entity:scene:scene-narration',
            kind: 'creative-entity',
            label: '讲述',
            description: 'scene · confirmed',
            source: {
              partition: 'creative-entities',
              sourceId: 'neko-entity',
              sourceKind: 'registry',
              refId: 'scene-narration',
              metadata: { entityKind: 'scene', status: 'confirmed' },
            },
            projectRoot: '/workspace',
            canonicalName: '讲述',
            aliases: ['旁白段落'],
            searchText: '讲述 旁白段落 scene confirmed',
            freshness: 'fresh',
          },
        ],
        partitions: [],
        freshness: 'fresh',
        context: { projectRoot: '/workspace' },
        query: { text: '小橘' },
      };
    });

    const candidates = await searchProjectMentionCandidates({
      includePattern: '**/*小橘*',
      excludePattern: '**/node_modules/**',
      limit: 30,
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      PROJECT_SEARCH_QUERY_COMMAND,
      expect.objectContaining({
        text: '小橘',
        contextFilePath: '/workspace/cases/test.fountain',
      }),
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'character',
          label: '小橘',
          source: 'story',
          filePath: 'cases/test.fountain',
          navigationData: expect.objectContaining({
            filePath: 'cases/test.fountain',
            resolvedPath: '/workspace/cases/test.fountain',
          }),
        }),
        expect.objectContaining({
          type: 'asset',
          label: '橘猫参考图',
          source: 'asset-library',
          searchText: '橘猫参考图 小橘',
          mediaType: 'image',
          thumbnailUri: 'webview:/workspace/.neko/.cache/resources/thumbnails/asset-1.jpg',
          entityType: 'character',
          navigationData: expect.objectContaining({
            assetId: 'asset-1',
            partition: 'asset-library',
            sourceId: 'asset-1',
          }),
        }),
        expect.objectContaining({
          type: 'entity',
          label: '小灰',
          source: 'entity-graph',
          entityType: 'character',
        }),
        expect.objectContaining({
          type: 'entity',
          label: '讲述',
          source: 'entity-graph',
          entityType: 'scene',
        }),
      ]),
    );
    expect(candidates[0]?.navigationData).toEqual(
      expect.objectContaining({
        partition: 'story-symbols',
        freshness: 'fresh',
      }),
    );
  });

  it('narrows roleplay searches to playable character candidates', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      items: [
        {
          id: 'entity:char-xiaoju',
          kind: 'creative-entity',
          label: '小橘',
          description: 'Character',
          source: {
            partition: 'creative-entities',
            sourceId: 'char-xiaoju',
            sourceKind: 'character',
          },
          projectRoot: '/workspace',
          searchText: '小橘 character',
          freshness: 'fresh',
          metadata: { entityType: 'character' },
        },
        {
          id: 'asset:asset-xiaoju',
          kind: 'asset',
          label: '小橘参考图',
          description: 'Asset',
          source: {
            partition: 'asset-library',
            sourceId: 'asset-xiaoju',
            sourceKind: 'image',
          },
          projectRoot: '/workspace',
          filePath: 'assets/xiaoju.png',
          searchText: '小橘参考图',
          freshness: 'fresh',
          metadata: { mediaType: 'image', entityType: 'character' },
        },
        {
          id: 'entity:scene-rooftop',
          kind: 'creative-entity',
          label: '天台',
          description: 'Scene',
          source: {
            partition: 'creative-entities',
            sourceId: 'scene-rooftop',
            sourceKind: 'scene',
          },
          projectRoot: '/workspace',
          searchText: '天台 scene',
          freshness: 'fresh',
          metadata: { entityType: 'scene' },
        },
      ],
      partitions: [],
      freshness: 'fresh',
      context: { projectRoot: '/workspace' },
      query: { text: '' },
    });

    const candidates = await searchProjectMentionCandidates({
      includePattern: '**/*',
      excludePattern: '**/node_modules/**',
      limit: 30,
      purpose: 'roleplay',
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      PROJECT_SEARCH_QUERY_COMMAND,
      expect.objectContaining({
        text: '',
        mode: 'mention',
        kinds: ['script-role', 'creative-entity', 'entity-candidate', 'asset', 'generated-asset'],
        partitions: ['story-symbols', 'creative-entities', 'asset-library'],
      }),
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        type: 'entity',
        label: '小橘',
        entityType: 'character',
      }),
      expect.objectContaining({
        type: 'asset',
        label: '小橘参考图',
        entityType: 'character',
      }),
    ]);
  });

  it('contracts media library absolute paths before exposing path-backed mention candidates', async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(
      createAssetsExtension({
        mediaLibraryRoots: ['/Users/feng/Assets/epub'],
        pathVariables: [['EPUBS', '/Users/feng/Assets/epub']],
      }),
    );
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === PROJECT_SEARCH_QUERY_COMMAND) {
        return {
          items: [
            {
              id: 'media:/Users/feng/Assets/epub/Blame/book.epub',
              kind: 'document',
              label: 'book.epub',
              description: 'Media: EPUBS',
              source: {
                partition: 'media-library',
                sourceId: '/Users/feng/Assets/epub/Blame/book.epub',
                sourceKind: 'document',
                filePath: '/Users/feng/Assets/epub/Blame/book.epub',
              },
              projectRoot: '/workspace',
              filePath: '/Users/feng/Assets/epub/Blame/book.epub',
              searchText: 'book.epub EPUBS document',
              freshness: 'fresh',
              metadata: { mediaType: 'document' },
              navigationData: {
                filePath: '/Users/feng/Assets/epub/Blame/book.epub',
                libraryName: 'EPUBS',
              },
            },
          ],
          partitions: [],
          freshness: 'fresh',
          context: { projectRoot: '/workspace' },
          query: { text: 'book' },
        };
      }
      return undefined;
    });

    const candidates = await searchProjectMentionCandidates(
      {
        includePattern: '**/*book*',
        excludePattern: '**/node_modules/**',
        limit: 30,
      },
      { projectRoot: '/workspace' },
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        type: 'media',
        label: 'book.epub',
        source: 'media-library',
        mediaType: 'document',
        filePath: '${EPUBS}/Blame/book.epub',
        navigationData: expect.objectContaining({
          partition: 'media-library',
          filePath: '${EPUBS}/Blame/book.epub',
          portablePath: '${EPUBS}/Blame/book.epub',
          resolvedPath: '/Users/feng/Assets/epub/Blame/book.epub',
          sourceId: '${EPUBS}/Blame/book.epub',
          variable: 'EPUBS',
        }),
      }),
    ]);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.contractPath',
      expect.anything(),
      expect.anything(),
    );
  });

  it('uses media library portable paths emitted by project search without re-contracting', async () => {
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(
      createAssetsExtension({
        mediaLibraryRoots: ['/Users/feng/Assets'],
        pathVariables: [['A', '/Users/feng/Assets']],
      }),
    );
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === PROJECT_SEARCH_QUERY_COMMAND) {
        return {
          items: [
            {
              id: 'media:${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
              kind: 'document',
              label: '[Kmoe][浪客行]卷01.epub',
              description: 'Media: 素材',
              source: {
                partition: 'media-library',
                sourceId: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
                sourceKind: 'document',
                filePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
              },
              projectRoot: '/workspace',
              filePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
              searchText:
                '[Kmoe][浪客行]卷01.epub ${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
              freshness: 'fresh',
              metadata: { mediaType: 'document' },
              navigationData: {
                filePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
                portablePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
                resolvedPath: '/Users/feng/Assets/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
                libraryName: '素材',
              },
            },
          ],
          partitions: [],
          freshness: 'fresh',
          context: { projectRoot: '/workspace' },
          query: { text: '浪客' },
        };
      }
      return undefined;
    });

    const candidates = await searchProjectMentionCandidates(
      {
        includePattern: '**/*浪客*',
        excludePattern: '**/node_modules/**',
        limit: 30,
      },
      { projectRoot: '/workspace' },
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        type: 'media',
        label: '[Kmoe][浪客行]卷01.epub',
        source: 'media-library',
        mediaType: 'document',
        filePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
        navigationData: expect.objectContaining({
          filePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          portablePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          resolvedPath: '/Users/feng/Assets/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          sourceId: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          variable: 'A',
        }),
      }),
    ]);
  });

  it('filters media library portable paths whose variable is unavailable', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      items: [
        {
          id: 'media:${A}/epub/book.epub',
          kind: 'document',
          label: 'book.epub',
          description: 'Media: missing variable',
          source: {
            partition: 'media-library',
            sourceId: '${A}/epub/book.epub',
            sourceKind: 'document',
            filePath: '${A}/epub/book.epub',
          },
          projectRoot: '/workspace',
          filePath: '${A}/epub/book.epub',
          searchText: 'book.epub ${A}/epub/book.epub',
          freshness: 'fresh',
          metadata: { mediaType: 'document' },
        },
      ],
      partitions: [],
      freshness: 'fresh',
      context: { projectRoot: '/workspace' },
      query: { text: 'book' },
    });

    const candidates = await searchProjectMentionCandidates(
      {
        includePattern: '**/*book*',
        excludePattern: '**/node_modules/**',
        limit: 30,
      },
      { projectRoot: '/workspace' },
    );

    expect(candidates).toEqual([]);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
  });

  it('does not rewrite media-library absolute paths to host built-in variables', async () => {
    const homeMediaPath = '/Users/feng/Assets/epub/Blame/book.epub';

    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === PROJECT_SEARCH_QUERY_COMMAND) {
        return {
          items: [
            {
              id: `media:${homeMediaPath}`,
              kind: 'document',
              label: 'book.epub',
              source: {
                partition: 'media-library',
                sourceId: homeMediaPath,
                sourceKind: 'document',
                filePath: homeMediaPath,
              },
              projectRoot: '/workspace',
              filePath: homeMediaPath,
              searchText: 'book.epub',
              freshness: 'fresh',
              metadata: { mediaType: 'document' },
              navigationData: { filePath: homeMediaPath, libraryName: 'EPUBS' },
            },
          ],
          partitions: [],
          freshness: 'fresh',
          context: { projectRoot: '/workspace' },
          query: { text: 'book' },
        };
      }
      return undefined;
    });

    const candidates = await searchProjectMentionCandidates(
      {
        includePattern: '**/*book*',
        excludePattern: '**/node_modules/**',
        limit: 30,
      },
      { projectRoot: '/workspace' },
    );

    expect(candidates).toEqual([]);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Filtered 1 media item(s)'),
    );
  });

  it('does not expose unmanaged absolute paths as successful file mention paths', async () => {
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === PROJECT_SEARCH_QUERY_COMMAND) {
        return {
          items: [
            {
              id: 'media:/tmp/random.png',
              kind: 'media',
              label: 'random.png',
              source: {
                partition: 'media-library',
                sourceId: '/tmp/random.png',
                sourceKind: 'image',
                filePath: '/tmp/random.png',
              },
              projectRoot: '/workspace',
              filePath: '/tmp/random.png',
              searchText: 'random.png',
              freshness: 'fresh',
              metadata: { mediaType: 'image' },
              navigationData: { filePath: '/tmp/random.png' },
            },
          ],
          partitions: [],
          freshness: 'fresh',
          context: { projectRoot: '/workspace' },
          query: { text: 'random' },
        };
      }
      return undefined;
    });

    const candidates = await searchProjectMentionCandidates(
      {
        includePattern: '**/*random*',
        excludePattern: '**/node_modules/**',
        limit: 30,
      },
      { projectRoot: '/workspace' },
    );

    expect(candidates).toEqual([]);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.contractPath',
      expect.anything(),
      expect.anything(),
    );
  });
});

function createAssetsExtension(options: {
  readonly mediaLibraryRoots: readonly string[];
  readonly pathVariables: ReadonlyArray<readonly [string, string]>;
}): vscode.Extension<unknown> {
  return {
    isActive: true,
    exports: {
      getMediaLibraryRoots: vi.fn(async () => [...options.mediaLibraryRoots]),
      getPathVariables: vi.fn(async () => [...options.pathVariables]),
    },
    activate: vi.fn(),
  } as unknown as vscode.Extension<unknown>;
}
