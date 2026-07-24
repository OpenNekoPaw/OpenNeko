import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createCompatibilityProjectSearchAdapters } from '../host-vscode/compatAdapters';

vi.mock('vscode', async () => await import('../testing/vscode'));

const storyText = `Title: 猫猫上学记

# 第一幕

EXT. 猫猫家门口 - 清晨

@小橘
今天是上学的第一天！

@猫妈妈
围巾忘了！
`;

describe('compatibility project search adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        parseScript: (content: string) => ({
          elements: parseFixtureScript(content),
        }),
      },
    } as any);
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: { fsPath?: string }) => {
      if (uri.fsPath === '/workspace/cases/test.fountain') {
        return new TextEncoder().encode(storyText);
      }
      return new Uint8Array();
    });
  });

  it('projects script roles and scenes without requiring visual identity', async () => {
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: {
        findFiles: async () => [vscode.Uri.file('/workspace/cases/test.fountain')],
      },
      jsonReader: makeJsonReader({}),
    }).find((item) => item.partition === 'story-symbols');

    expect(adapter).toBeDefined();
    const roleItems = await adapter!.query(
      { text: '小橘', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );
    const sceneItems = await adapter!.query(
      { text: '猫猫家门口', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(roleItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'script-role', label: '小橘' })]),
    );
    expect(sceneItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'story-scene', label: 'EXT. 猫猫家门口 - 清晨' }),
      ]),
    );
  });

  it('projects media files, confirmed entities, entity requirements, and generated outputs', async () => {
    const adapters = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      queryMediaLibrary: async () => [
        {
          locator: { kind: 'workspace-file' as const, path: 'neko/assets/Media/cat-school.mp4' },
          fileName: 'cat-school.mp4',
          mediaType: 'video',
        },
      ],
      jsonReader: makeJsonReader({
        '/workspace/.neko/.cache/search-index.json': {
          entries: [
            { filePath: '/media/cat-school.mp4', fileName: 'cat-school.mp4', mediaType: 'video' },
          ],
        },
        '/workspace/.neko/.cache/asset-graph.json': {
          nodes: [{ id: 'node-1', kind: 'entity', refId: '小橘', label: '小橘' }],
        },
        '/workspace/characters.json': {
          characters: [
            {
              id: 'char-mom',
              canonicalName: '猫妈妈',
              displayName: '猫妈妈',
              aliases: ['妈妈猫'],
            },
          ],
        },
        '/workspace/neko/entity-asset-requirements.json': {
          requirements: [
            {
              id: 'req-1',
              entityId: '小灰',
              entityKind: 'character',
              source: 'story',
              sourceRef: 'cases/test.fountain',
              requiredKinds: ['portrait'],
              status: 'missing',
            },
          ],
        },
      }),
      queryGeneratedAssets: async () => [
        {
          id: 'gen-1',
          type: 'generated-image',
          path: '/workspace/.neko/.cache/generated/image/xiaoju.png',
          mimeType: 'image/png',
          prompt: '小橘角色参考',
          model: 'local-image',
          generatedAt: '2026-05-18T00:00:00.000Z',
          width: 1024,
          height: 1024,
          ratio: '1:1',
        },
      ],
      resolveThumbnailUri: (filePath) => `webview:${filePath}`,
    });

    const mediaItems = await adapters
      .find((item) => item.partition === 'media-library')!
      .query({ text: 'cat-school', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const confirmedEntityItems = await adapters
      .find((item) => item.partition === 'creative-entities')!
      .query({ text: '妈妈猫', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const candidateItems = await adapters
      .find((item) => item.partition === 'creative-entities')!
      .query({ text: '小灰', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const generatedItems = await adapters
      .find((item) => item.partition === 'generated-assets')!
      .query(
        { text: '小橘', projectRoot: '/workspace', partitions: ['generated-assets'] },
        { projectRoot: '/workspace' },
      );

    expect(mediaItems[0]).toEqual(
      expect.objectContaining({
        kind: 'media',
        label: 'cat-school.mp4',
        filePath: 'neko/assets/Media/cat-school.mp4',
        source: expect.objectContaining({ sourceId: 'neko/assets/Media/cat-school.mp4' }),
        navigationData: expect.objectContaining({
          filePath: 'neko/assets/Media/cat-school.mp4',
          portablePath: 'neko/assets/Media/cat-school.mp4',
          locator: { kind: 'workspace-file', path: 'neko/assets/Media/cat-school.mp4' },
        }),
      }),
    );
    expect(confirmedEntityItems[0]).toEqual(
      expect.objectContaining({ kind: 'creative-entity', label: '猫妈妈' }),
    );
    expect(candidateItems[0]).toEqual(
      expect.objectContaining({ kind: 'entity-candidate', label: '小灰' }),
    );
    expect(generatedItems[0]).toEqual(
      expect.objectContaining({
        kind: 'generated-asset',
        label: 'xiaoju.png · 小橘角色参考',
        thumbnailUri: 'webview:/workspace/.neko/.cache/generated/image/xiaoju.png',
        source: expect.objectContaining({
          partition: 'generated-assets',
          sourceId: 'gen-1',
          refId: 'generated-assets/gen-1.png',
        }),
      }),
    );
  });

  it('falls back to the Assets media library runtime query when media cache files are absent', async () => {
    const queryMediaLibrary = vi.fn(async () => [
      {
        locator: {
          kind: 'workspace-file' as const,
          path: 'neko/assets/素材/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
        },
        fileName: '[Kmoe][浪客行]卷01.epub',
        libraryName: '素材',
        mediaType: 'document' as const,
      },
    ]);
    const adapters = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: makeJsonReader({}),
      queryMediaLibrary,
    });

    const mediaItems = await adapters
      .find((item) => item.partition === 'media-library')!
      .query({ text: '浪客', projectRoot: '/workspace', limit: 30 }, { projectRoot: '/workspace' });

    expect(queryMediaLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: '浪客',
        limit: 30,
        projectRoot: '/workspace',
      }),
    );
    expect(mediaItems).toEqual([
      expect.objectContaining({
        kind: 'document',
        label: '[Kmoe][浪客行]卷01.epub',
        filePath: 'neko/assets/素材/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
        source: expect.objectContaining({
          partition: 'media-library',
          sourceId: 'neko/assets/素材/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
        }),
        navigationData: expect.objectContaining({
          filePath: 'neko/assets/素材/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          portablePath: 'neko/assets/素材/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          locator: {
            kind: 'workspace-file',
            path: 'neko/assets/素材/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          },
          libraryName: '素材',
        }),
      }),
    ]);
  });

  it('does not use a retired search-index JSON file as a normal query fallback', async () => {
    const reads: string[] = [];
    const queryMediaLibrary = vi.fn(async () => []);
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: {
        read: async <T>(filePath: string): Promise<T | null> => {
          reads.push(filePath);
          if (filePath.endsWith('/.neko/.cache/search-index.json')) {
            return {
              entries: [
                {
                  filePath: '/retired/legacy.mp4',
                  fileName: 'legacy.mp4',
                  mediaType: 'video',
                },
              ],
            } as T;
          }
          return null;
        },
      },
      queryMediaLibrary,
    }).find((item) => item.partition === 'media-library');

    const items = await adapter!.query(
      { text: 'legacy', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(items).toEqual([]);
    expect(queryMediaLibrary).toHaveBeenCalledOnce();
    expect(reads).not.toContain('/workspace/.neko/.cache/search-index.json');
  });

  it('does not use retired media-metadata JSON as a normal query fallback', async () => {
    const reads: string[] = [];
    const queryMediaLibrary = vi.fn(async () => []);
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: {
        read: async <T>(filePath: string): Promise<T | null> => {
          reads.push(filePath);
          if (filePath.endsWith('/.neko/.cache/media-metadata.json')) {
            return { entries: { '/retired/legacy.mp4': { duration: 1 } } } as T;
          }
          return null;
        },
      },
      queryMediaLibrary,
    }).find((item) => item.partition === 'media-library');

    const items = await adapter!.query(
      { text: 'legacy', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(items).toEqual([]);
    expect(queryMediaLibrary).toHaveBeenCalledOnce();
    expect(reads).not.toContain('/workspace/.neko/.cache/media-metadata.json');
  });

  it('does not use a retired generated asset index as a normal query fallback', async () => {
    const reads: string[] = [];
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: {
        read: async <T>(filePath: string): Promise<T | null> => {
          reads.push(filePath);
          if (filePath.endsWith('/.neko/.cache/generated/index.json')) {
            return {
              assets: [
                {
                  id: 'legacy-generated',
                  type: 'generated-image',
                  path: '/workspace/.neko/.cache/generated/legacy.png',
                  prompt: 'Legacy generated image',
                },
              ],
            } as T;
          }
          return null;
        },
      },
    }).find((item) => item.partition === 'generated-assets');

    const items = await adapter!.query(
      { text: 'Legacy generated', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(items).toEqual([]);
    expect(reads).not.toContain('/workspace/.neko/.cache/generated/index.json');
  });

  it('queries injected search_documents without reading the legacy media index', async () => {
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: {
        read: async () => {
          throw new Error('legacy JSON search index must not be read');
        },
      },
      searchProjection: {
        partition: {
          scope: 'workspace',
          workspaceId: '1888f0bf-ed92-440b-8cd6-03107358380a',
          domain: 'project-search',
        },
        hasProjection: async () => true,
        repository: {
          list: async () => [],
          query: async () => [
            {
              documentId: 'media:cat-school',
              partition: 'media-library',
              kind: 'media',
              label: 'cat-school.mp4',
              description: 'Media',
              source: {
                partition: 'media-library',
                sourceId: 'neko/assets/Media/cat-school.mp4',
                filePath: 'neko/assets/Media/cat-school.mp4',
              },
              fileKey: 'neko/assets/Media/cat-school.mp4',
              searchText: 'cat-school.mp4 Media video',
              freshness: 'fresh',
              metadata: { mediaType: 'video', libraryName: 'Media' },
              updatedAt: '2026-07-13T05:00:00.000Z',
            },
          ],
          replacePartition: async () => undefined,
          replaceSearchPartition: async () => undefined,
          insertMissingSearchPartition: async () => ({
            insertedDocumentIds: [],
            preservedDocumentIds: [],
          }),
        },
      },
    }).find((item) => item.partition === 'media-library');

    const items = await adapter!.query(
      { text: 'cat-school', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'media',
        label: 'cat-school.mp4',
        filePath: 'neko/assets/Media/cat-school.mp4',
      }),
    ]);
  });

  it('queries injected Entity/Asset projections without reading the legacy asset graph', async () => {
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: {
        read: async <T>(filePath: string): Promise<T | null> => {
          if (filePath.endsWith('asset-graph.json')) {
            throw new Error('legacy asset graph must not be read');
          }
          return null;
        },
      },
      entityAssetProjection: {
        partition: {
          scope: 'workspace',
          workspaceId: '1888f0bf-ed92-440b-8cd6-03107358380a',
          domain: 'entity-asset-projection',
        },
        readRevision: async () => ({
          partition: {
            scope: 'workspace',
            workspaceId: '1888f0bf-ed92-440b-8cd6-03107358380a',
            domain: 'entity-asset-projection',
          },
          revision: 1,
          freshness: 'stale',
          diagnostic: 'entity-asset-projections-not-fresh',
          updatedAt: '2026-07-13T08:00:00.000Z',
        }),
        repository: {
          list: async () => [
            {
              projectionId: 'node:rin',
              kind: 'asset-graph-node',
              sourceId: 'entity-runtime',
              entityId: 'char_rin',
              freshness: 'fresh',
              value: { id: 'node:rin', kind: 'entity', refId: 'char_rin', label: 'Rin' },
              updatedAt: '2026-07-13T08:00:00.000Z',
            },
            {
              projectionId: 'candidate:rin-alt',
              kind: 'entity-candidate',
              sourceId: 'entity-runtime',
              candidateId: 'candidate:rin-alt',
              freshness: 'fresh',
              value: {
                id: 'candidate:rin-alt',
                kind: 'character',
                name: 'Rin alternate',
                status: 'open',
                identityBasis: 'user-named',
                provenance: [{ providerId: 'story', sourceKind: 'story' }],
                sourceRefs: [],
              },
              updatedAt: '2026-07-13T08:00:00.000Z',
            },
          ],
          replaceSource: async () => undefined,
          insertMissing: async () => ({
            insertedProjectionKeys: [],
            preservedProjectionKeys: [],
          }),
        },
      },
    }).find((item) => item.partition === 'creative-entities');

    const items = await adapter?.query(
      { text: '', partitions: ['creative-entities'] },
      { projectRoot: '/workspace' },
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'creative-entity', label: 'Rin' }),
        expect.objectContaining({ kind: 'entity-candidate', label: 'Rin alternate' }),
      ]),
    );
    expect(adapter?.getStatus('/workspace')).toMatchObject({ freshness: 'stale' });
  });

  it('does not use a retired asset-graph JSON file as a normal entity query fallback', async () => {
    const reads: string[] = [];
    const adapter = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: {
        read: async <T>(filePath: string): Promise<T | null> => {
          reads.push(filePath);
          if (filePath.endsWith('/.neko/.cache/asset-graph.json')) {
            return {
              nodes: [
                {
                  id: 'legacy-node',
                  kind: 'entity',
                  refId: 'legacy-character',
                  label: 'Legacy Character',
                },
              ],
            } as T;
          }
          return null;
        },
      },
    }).find((item) => item.partition === 'creative-entities');

    const items = await adapter!.query(
      { text: 'Legacy Character', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(items).toEqual([]);
    expect(reads).not.toContain('/workspace/.neko/.cache/asset-graph.json');
  });

  it('queries the Assets media runtime even when a retired cache file exists', async () => {
    const queryMediaLibrary = vi.fn(async () => [
      {
        locator: { kind: 'workspace-file' as const, path: 'neko/assets/素材/浪客行.epub' },
        fileName: '浪客行.epub',
        libraryName: '素材',
        mediaType: 'document' as const,
      },
    ]);
    const adapters = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: makeJsonReader({
        '/workspace/.neko/.cache/search-index.json': {
          entries: [
            {
              filePath: '/library/other.epub',
              fileName: 'other.epub',
              libraryName: '素材',
              mediaType: 'document',
            },
          ],
        },
      }),
      queryMediaLibrary,
    });

    const mediaItems = await adapters
      .find((item) => item.partition === 'media-library')!
      .query({ text: '浪客', projectRoot: '/workspace', limit: 30 }, { projectRoot: '/workspace' });

    expect(mediaItems).toEqual([
      expect.objectContaining({ kind: 'document', label: '浪客行.epub' }),
    ]);
    expect(queryMediaLibrary).toHaveBeenCalledOnce();
  });

  it('does not register a runtime reader for legacy Asset catalog JSON', () => {
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: { fsPath?: string }) => {
      if (uri.fsPath === '/workspace/neko/assets/library.json') {
        return new TextEncoder().encode('{bad json');
      }
      return new Uint8Array();
    });
    const logger = { warn: vi.fn() };
    const adapters = createCompatibilityProjectSearchAdapters({
      logger,
      workspaceFileFinder: { findFiles: async () => [] },
    });

    expect(adapters.some((item) => String(item.partition) === 'asset-library')).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

function makeJsonReader(files: Record<string, unknown>) {
  return {
    async read<T>(filePath: string): Promise<T | null> {
      return (files[filePath] as T | undefined) ?? null;
    },
  };
}

function parseFixtureScript(content: string): ReadonlyArray<Record<string, unknown>> {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .flatMap((line) => {
      if (line.startsWith('@')) {
        return [{ type: 'character', text: line.slice(1), name: line.slice(1) }];
      }
      if (/^(INT|EXT|内景|外景)[.\s]/.test(line)) {
        return [{ type: 'scene_heading', text: line, raw: line }];
      }
      if (line.startsWith('#')) {
        return [{ type: 'section', text: line.replace(/^#+\s*/, '') }];
      }
      return [];
    });
}
