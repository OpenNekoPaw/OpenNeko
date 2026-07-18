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

  it('projects asset aliases, media files, documents, confirmed entities, and entity requirements', async () => {
    const adapters = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      contractPath: async (filePath) =>
        filePath.startsWith('/media/') ? filePath.replace('/media', '${MEDIA}') : filePath,
      queryMediaLibrary: async () => [
        {
          filePath: '/media/cat-school.mp4',
          fileName: 'cat-school.mp4',
          mediaType: 'video',
        },
      ],
      jsonReader: makeJsonReader({
        '/workspace/neko/assets/library.json': {
          entities: [
            {
              id: 'asset-1',
              name: '橘猫参考图',
              aliases: ['小橘'],
              category: 'character',
              variants: [
                { id: 'v1', files: [{ id: 'f1', path: 'assets/xiaoju.png', mediaType: 'image' }] },
              ],
            },
            {
              id: 'asset-doc-1',
              name: '世界观设定集',
              aliases: ['设定集'],
              category: 'document',
              variants: [
                {
                  id: 'v1',
                  files: [{ id: 'doc-file', path: 'docs/world.pdf', mediaType: 'document' }],
                },
              ],
            },
          ],
        },
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

    const assetItems = await adapters
      .find((item) => item.partition === 'asset-library')!
      .query({ text: '小橘', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const mediaItems = await adapters
      .find((item) => item.partition === 'media-library')!
      .query({ text: 'cat-school', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
    const documentItems = await adapters
      .find((item) => item.partition === 'asset-library')!
      .query({ text: '设定集', projectRoot: '/workspace' }, { projectRoot: '/workspace' });
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

    expect(assetItems[0]).toEqual(expect.objectContaining({ kind: 'asset', label: '橘猫参考图' }));
    expect(mediaItems[0]).toEqual(
      expect.objectContaining({
        kind: 'media',
        label: 'cat-school.mp4',
        filePath: '${MEDIA}/cat-school.mp4',
        source: expect.objectContaining({ sourceId: '${MEDIA}/cat-school.mp4' }),
        navigationData: expect.objectContaining({
          filePath: '${MEDIA}/cat-school.mp4',
          portablePath: '${MEDIA}/cat-school.mp4',
          resolvedPath: '/media/cat-school.mp4',
        }),
      }),
    );
    expect(documentItems[0]).toEqual(
      expect.objectContaining({ kind: 'document', label: '世界观设定集' }),
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
        filePath: '/library/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
        fileName: '[Kmoe][浪客行]卷01.epub',
        libraryName: '素材',
        mediaType: 'document' as const,
      },
    ]);
    const adapters = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: makeJsonReader({}),
      contractPath: async (filePath) =>
        filePath.startsWith('/library/') ? filePath.replace('/library', '${A}') : filePath,
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
        filePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
        source: expect.objectContaining({
          partition: 'media-library',
          sourceId: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
        }),
        navigationData: expect.objectContaining({
          filePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          portablePath: '${A}/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
          resolvedPath: '/library/epub/animation/浪客行/[Kmoe][浪客行]卷01.epub',
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
      contractPath: async () => '${MEDIA}/cat-school.mp4',
      searchProjection: {
        partition: {
          scope: 'workspace',
          workspaceId: '1888f0bf-ed92-440b-8cd6-03107358380a',
          domain: 'project-search',
        },
        hasProjection: async () => true,
        resolveFileKey: async () => '/media/cat-school.mp4',
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
                sourceId: '${MEDIA}/cat-school.mp4',
                filePath: '${MEDIA}/cat-school.mp4',
              },
              fileKey: '${MEDIA}/cat-school.mp4',
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
        filePath: '${MEDIA}/cat-school.mp4',
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
        filePath: '/library/浪客行.epub',
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

  it('logs malformed compatibility JSON without failing provider queries', async () => {
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async (uri: { fsPath?: string }) => {
      if (uri.fsPath === '/workspace/neko/assets/library.json') {
        return new TextEncoder().encode('{bad json');
      }
      return new Uint8Array();
    });
    const logger = { warn: vi.fn() };
    const adapter = createCompatibilityProjectSearchAdapters({
      logger,
      workspaceFileFinder: { findFiles: async () => [] },
    }).find((item) => item.partition === 'asset-library');

    await expect(
      adapter!.query({ text: 'xiaoju', projectRoot: '/workspace' }, { projectRoot: '/workspace' }),
    ).resolves.toEqual([]);

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to parse project search compatibility JSON',
      expect.objectContaining({ filePath: '/workspace/neko/assets/library.json' }),
    );
  });

  it('projects Live2D and model asset dimensions through the asset-library partition', async () => {
    const adapters = createCompatibilityProjectSearchAdapters({
      workspaceFileFinder: { findFiles: async () => [] },
      jsonReader: makeJsonReader({
        '/workspace/neko/assets/library.json': {
          entities: [
            {
              id: 'asset-puppet',
              name: 'Sakura Live2D',
              category: 'character',
              variants: [
                {
                  id: 'variant-model',
                  files: [
                    {
                      id: 'file-model',
                      path: '.neko/imports/puppets/sakura.zip',
                      mediaType: 'document',
                      characterAsset: {
                        assetDimension: 'model',
                        mediaKind: 'live2d-model',
                        storageMode: 'bundle-memory',
                        bundleLocator: {
                          bundlePath: './sakura.zip',
                          entryPath: 'avatars/sakura/sakura.moc3',
                          fragmentRef: './sakura.zip#avatars/sakura/sakura.moc3',
                        },
                        sourceHash: 'sha256:sakura',
                      },
                    },
                  ],
                },
              ],
            },
            {
              id: 'asset-model',
              name: 'Hero VRM',
              category: 'character',
              variants: [
                {
                  id: 'variant-vrm',
                  files: [
                    {
                      id: 'file-vrm',
                      path: '.neko/imports/models/hero.vrm',
                      mediaType: 'document',
                      characterAsset: {
                        assetDimension: 'model',
                        mediaKind: 'model-3d',
                        storageMode: 'disk',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    });
    expect(adapters.filter((adapter) => adapter.partition === 'asset-library')).toHaveLength(1);

    const assetAdapter = adapters.find((adapter) => adapter.partition === 'asset-library')!;
    const live2dItems = await assetAdapter.query(
      { text: 'live2d-model', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );
    const modelItems = await assetAdapter.query(
      { text: 'model-3d', projectRoot: '/workspace' },
      { projectRoot: '/workspace' },
    );

    expect(live2dItems[0]).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ partition: 'asset-library' }),
        metadata: expect.objectContaining({
          assetDimension: 'model',
          mediaKind: 'live2d-model',
          storageMode: 'bundle-memory',
          bundleLocator: expect.objectContaining({
            fragmentRef: './sakura.zip#avatars/sakura/sakura.moc3',
          }),
          sourceHash: 'sha256:sakura',
        }),
        navigationData: expect.objectContaining({
          assetDimension: 'model',
          mediaKind: 'live2d-model',
          storageMode: 'bundle-memory',
        }),
      }),
    );
    expect(modelItems[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          assetDimension: 'model',
          mediaKind: 'model-3d',
          storageMode: 'disk',
        }),
      }),
    );
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
