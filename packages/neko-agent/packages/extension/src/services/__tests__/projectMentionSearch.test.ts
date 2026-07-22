import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { PROJECT_SEARCH_QUERY_COMMAND } from '@neko/search/host-vscode';
import {
  resolveRoleplayCandidateSearchSelection,
  searchProjectMentionCandidates,
} from '../projectMentionSearch';

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
            id: 'media:neko/assets/Characters/xiaoju.png',
            kind: 'media',
            label: '橘猫参考图',
            description: 'Media: Characters',
            icon: '🎭',
            source: {
              partition: 'media-library',
              sourceId: 'neko/assets/Characters/xiaoju.png',
              sourceKind: 'image',
            },
            projectRoot: '/workspace',
            filePath: 'neko/assets/Characters/xiaoju.png',
            searchText: '橘猫参考图 小橘',
            freshness: 'fresh',
            metadata: { mediaType: 'image', entityType: 'character' },
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
          }),
        }),
        expect.objectContaining({
          type: 'media',
          label: '橘猫参考图',
          source: 'media-library',
          searchText: '橘猫参考图 小橘',
          mediaType: 'image',
          entityType: 'character',
          navigationData: expect.objectContaining({
            partition: 'media-library',
            sourceId: 'neko/assets/Characters/xiaoju.png',
            filePath: 'neko/assets/Characters/xiaoju.png',
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

  it('rejects legacy Asset Library search partitions instead of mapping an Asset id', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      items: [
        {
          id: 'legacy-asset-1',
          kind: 'media',
          label: 'Legacy portrait',
          source: {
            partition: 'asset-library',
            sourceId: 'legacy-asset-1',
            sourceKind: 'image',
          },
          projectRoot: '/workspace',
          searchText: 'Legacy portrait',
          freshness: 'fresh',
        },
      ],
      partitions: [],
      freshness: 'fresh',
      context: { projectRoot: '/workspace' },
      query: { text: 'portrait' },
    });

    await expect(
      searchProjectMentionCandidates({ includePattern: '**/*portrait*', limit: 30 }),
    ).rejects.toThrow('Legacy Asset Library search results require explicit inspection');
  });

  it('returns confirmed characters and explicitly confirmable character Candidates for roleplay', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      items: [
        {
          id: 'entity:character:char-xiaoju',
          kind: 'creative-entity',
          label: '小橘',
          description: 'Character',
          source: {
            partition: 'creative-entities',
            sourceId: 'neko-entity',
            sourceKind: 'registry',
            refId: 'char-xiaoju',
            metadata: { entityKind: 'character', status: 'confirmed' },
          },
          projectRoot: '/workspace',
          searchText: '小橘 character',
          freshness: 'fresh',
          metadata: { entityType: 'character' },
          navigationData: {
            entityId: 'char-xiaoju',
            entityKind: 'character',
            source: 'neko-entity',
          },
        },
        {
          id: 'creative-entity:legacy-character',
          kind: 'creative-entity',
          label: '旧角色投影',
          source: {
            partition: 'creative-entities',
            sourceId: 'legacy-character',
            sourceKind: 'character',
          },
          projectRoot: '/workspace',
          searchText: '旧角色投影 character',
          freshness: 'fresh',
          metadata: { entityType: 'character' },
        },
        {
          id: 'candidate:auto:character:小灰',
          kind: 'entity-candidate',
          label: '小灰',
          description: 'Automatic candidate',
          source: {
            partition: 'creative-entities',
            sourceId: 'candidate:auto:character:小灰',
            sourceKind: 'candidate',
            refId: 'candidate:auto:character:小灰',
            metadata: { entityKind: 'character', status: 'observed' },
          },
          projectRoot: '/workspace',
          searchText: '小灰 character candidate',
          freshness: 'fresh',
          metadata: { entityType: 'character' },
        },
        {
          id: 'context-script-entity:/workspace/cases/test.fountain:小灰',
          kind: 'entity-candidate',
          label: '小灰',
          source: {
            partition: 'creative-entities',
            sourceId: 'agent-context-script',
            sourceKind: 'script',
            projectRelativePath: 'cases/test.fountain',
            metadata: { entityKind: 'character', status: 'candidate' },
          },
          projectRoot: '/workspace',
          canonicalName: '小灰',
          searchText: '小灰 character candidate script',
          freshness: 'fresh',
          metadata: { entityType: 'character', status: 'candidate' },
          navigationData: { candidateId: '小灰', entityKind: 'character' },
        },
        {
          id: 'entity-projection:workspace:cases/test.fountain:candidate:candidate:auto:character:小灰',
          kind: 'entity-candidate',
          label: '小灰',
          description: 'character candidate',
          source: {
            partition: 'creative-entities',
            sourceId: 'workspace:cases/test.fountain',
            sourceKind: 'candidate',
            refId: 'candidate:auto:character:小灰',
          },
          projectRoot: '/workspace',
          searchText: '小灰 character open ${WORKSPACE}/cases/test.fountain',
          freshness: 'fresh',
          metadata: {
            entityType: 'character',
            status: 'open',
            identityBasis: 'user-named',
          },
          navigationData: {
            candidateId: 'candidate:auto:character:小灰',
            kind: 'character',
            source: 'workspace:cases/test.fountain',
          },
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
        kinds: ['creative-entity', 'entity-candidate'],
        partitions: ['creative-entities'],
      }),
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        type: 'entity',
        label: '小橘',
        entityType: 'character',
        navigationData: expect.objectContaining({
          entityId: 'char-xiaoju',
          refId: 'char-xiaoju',
          projectSearchItemId: 'entity:character:char-xiaoju',
        }),
      }),
      expect.objectContaining({
        type: 'entity',
        label: '小灰',
        entityType: 'character',
        navigationData: expect.objectContaining({
          candidateId: 'candidate:auto:character:小灰',
          projectSearchItemId:
            'entity-projection:workspace:cases/test.fountain:candidate:candidate:auto:character:小灰',
        }),
      }),
    ]);
  });

  it('re-resolves a selected roleplay Candidate from its stable Project Search identity', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      items: [
        {
          id: 'entity-projection:semantic-xiaoju',
          kind: 'entity-candidate',
          label: '小橘',
          source: {
            partition: 'creative-entities',
            sourceId: 'workspace:cases/test.fountain',
            sourceKind: 'candidate',
            refId: 'candidate:auto:character:小橘',
          },
          projectRoot: '/workspace',
          canonicalName: '小橘',
          aliases: ['橘仔'],
          searchText: '小橘 character open',
          freshness: 'fresh',
          metadata: { entityType: 'character', status: 'open' },
          navigationData: {
            candidateId: 'candidate:auto:character:小橘',
            kind: 'character',
            source: 'workspace:cases/test.fountain',
          },
        },
      ],
      partitions: [],
      freshness: 'fresh',
      context: { projectRoot: '/workspace' },
      query: { text: '' },
    });

    await expect(
      resolveRoleplayCandidateSearchSelection({
        projectSearchItemId: 'entity-projection:semantic-xiaoju',
        projectRoot: '/workspace',
      }),
    ).resolves.toEqual({
      projectSearchItemId: 'entity-projection:semantic-xiaoju',
      candidateId: 'candidate:auto:character:小橘',
      name: '小橘',
      kind: 'character',
      aliases: ['橘仔'],
      sourceRef: 'workspace:cases/test.fountain',
    });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      PROJECT_SEARCH_QUERY_COMMAND,
      expect.objectContaining({
        text: 'entity-projection:semantic-xiaoju',
        mode: 'entity-picker',
        limit: 1,
        kinds: ['entity-candidate'],
        partitions: ['creative-entities'],
        projectRoot: '/workspace',
      }),
    );

    await expect(
      resolveRoleplayCandidateSearchSelection({
        projectSearchItemId: 'entity-projection:forged',
        projectRoot: '/workspace',
      }),
    ).resolves.toBeNull();
  });

  it('offers a named context-script Candidate for explicit confirm-and-roleplay', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
      items: [
        {
          id: 'context-script-entity:/workspace/cases/test.fountain:小橘',
          kind: 'entity-candidate',
          label: '小橘',
          source: {
            partition: 'creative-entities',
            sourceId: 'agent-context-script',
            sourceKind: 'script',
            projectRelativePath: 'cases/test.fountain',
            metadata: {
              entityKind: 'character',
              status: 'candidate',
              identityBasis: 'user-named',
            },
          },
          projectRoot: '/workspace',
          canonicalName: '小橘',
          searchText: '小橘 character candidate script',
          freshness: 'fresh',
          metadata: {
            entityType: 'character',
            status: 'candidate',
            identityBasis: 'user-named',
          },
          navigationData: {
            candidateId: '小橘',
            entityKind: 'character',
            source: 'agent-context-script',
          },
        },
      ],
      partitions: [],
      freshness: 'fresh',
      context: { projectRoot: '/workspace' },
      query: { text: '' },
    });

    const candidates = await searchProjectMentionCandidates(
      { includePattern: '**/*', limit: 30, purpose: 'roleplay' },
      { projectRoot: '/workspace', contextFilePath: '/workspace/cases/test.fountain' },
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'context-script-entity:/workspace/cases/test.fountain:小橘',
        label: '小橘',
      }),
    ]);
    await expect(
      resolveRoleplayCandidateSearchSelection({
        projectSearchItemId: 'context-script-entity:/workspace/cases/test.fountain:小橘',
        projectRoot: '/workspace',
        contextFilePath: '/workspace/cases/test.fountain',
      }),
    ).resolves.toEqual({
      projectSearchItemId: 'context-script-entity:/workspace/cases/test.fountain:小橘',
      candidateId: '小橘',
      name: '小橘',
      kind: 'character',
      aliases: [],
      sourceRef: 'cases/test.fountain',
    });
  });

  it('preserves linked workspace paths for path-backed mention candidates', async () => {
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === PROJECT_SEARCH_QUERY_COMMAND) {
        return {
          items: [
            {
              id: 'media:neko/assets/EPUBS/Blame/book.epub',
              kind: 'document',
              label: 'book.epub',
              description: 'Media: EPUBS',
              source: {
                partition: 'media-library',
                sourceId: 'neko/assets/EPUBS/Blame/book.epub',
                sourceKind: 'document',
                filePath: 'neko/assets/EPUBS/Blame/book.epub',
              },
              projectRoot: '/workspace',
              filePath: 'neko/assets/EPUBS/Blame/book.epub',
              searchText: 'book.epub EPUBS document',
              freshness: 'fresh',
              metadata: { mediaType: 'document' },
              navigationData: {
                filePath: 'neko/assets/EPUBS/Blame/book.epub',
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
        filePath: 'neko/assets/EPUBS/Blame/book.epub',
        navigationData: expect.objectContaining({
          partition: 'media-library',
          filePath: 'neko/assets/EPUBS/Blame/book.epub',
          portablePath: 'neko/assets/EPUBS/Blame/book.epub',
          sourceId: 'neko/assets/EPUBS/Blame/book.epub',
        }),
      }),
    ]);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.contractPath',
      expect.anything(),
      expect.anything(),
    );
  });

  it('uses linked workspace paths emitted by project search without rewriting', async () => {
    const linkedPath = 'neko/assets/素材/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub';
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === PROJECT_SEARCH_QUERY_COMMAND) {
        return {
          items: [
            {
              id: `media:${linkedPath}`,
              kind: 'document',
              label: '[Kmoe][浪客行]卷01.epub',
              description: 'Media: 素材',
              source: {
                partition: 'media-library',
                sourceId: linkedPath,
                sourceKind: 'document',
                filePath: linkedPath,
              },
              projectRoot: '/workspace',
              filePath: linkedPath,
              searchText: `[Kmoe][浪客行]卷01.epub ${linkedPath}`,
              freshness: 'fresh',
              metadata: { mediaType: 'document' },
              navigationData: {
                filePath: linkedPath,
                portablePath: linkedPath,
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
        filePath: linkedPath,
        navigationData: expect.objectContaining({
          filePath: linkedPath,
          portablePath: linkedPath,
          sourceId: linkedPath,
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
