import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSearchAdapter, ProjectSearchItem } from '@neko/shared';
import { ProjectIndexCoordinator } from '../core/ProjectIndexCoordinator';

describe('ProjectIndexCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fans out queries, ranks results, and keeps partition failures isolated', async () => {
    const coordinator = createCoordinator();
    coordinator.registerAdapter(
      makeAdapter('documents', [makeItem('document-1', 'document', '小橘 notes', 'documents', 5)]),
    );
    coordinator.registerAdapter(makeFailingAdapter('media-library'));

    const result = await coordinator.query({
      text: '小橘',
      projectRoot: '/mock/workspace',
      limit: 10,
      freshness: 'allow-stale',
    });

    expect(result.items.map((item) => item.id)).toEqual(['document-1']);
    expect(result.freshness).toBe('partial');
    expect(result.partitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partition: 'documents', status: 'ready' }),
        expect.objectContaining({ partition: 'media-library', status: 'failed' }),
      ]),
    );
  });

  it('supports fresh-only queries', async () => {
    const coordinator = createCoordinator();
    coordinator.registerAdapter(
      makeAdapter('media-library', [
        { ...makeItem('media-1', 'media', 'stale clip', 'media-library', 0), freshness: 'stale' },
        makeItem('media-2', 'media', 'fresh clip', 'media-library', 0),
      ]),
    );

    const result = await coordinator.query({
      text: 'clip',
      projectRoot: '/mock/workspace',
      freshness: 'fresh-only',
    });

    expect(result.items.map((item) => item.id)).toEqual(['media-2']);
  });

  it('replaces an existing partition adapter when a first-class provider registers', async () => {
    const coordinator = createCoordinator();
    const compatibilityAdapter = makeAdapter('media-library', [
      makeItem('media:compat', 'media', '小橘 old projection', 'media-library', 0),
    ]);
    const disposeCompatibility = vi.fn();
    coordinator.registerAdapter({ ...compatibilityAdapter, dispose: disposeCompatibility });
    coordinator.registerAdapter(
      makeAdapter('media-library', [
        makeItem('media:first-class', 'media', '小橘 source file', 'media-library', 5),
      ]),
    );

    const result = await coordinator.query({
      text: '小橘',
      projectRoot: '/mock/workspace',
      partitions: ['media-library'],
    });

    expect(disposeCompatibility).toHaveBeenCalledTimes(1);
    expect(result.items.map((item) => item.id)).toEqual(['media:first-class']);
  });

  it('works without a semantic provider and preserves source refs for semantic results', async () => {
    const textOnlyCoordinator = createCoordinator();
    textOnlyCoordinator.registerAdapter(
      makeAdapter('documents', [
        makeItem('document:text', 'document', '猫猫设定集', 'documents', 0),
      ]),
    );

    await expect(
      textOnlyCoordinator.query({
        text: '猫猫',
        projectRoot: '/mock/workspace',
        partitions: ['documents'],
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'document:text' })],
      freshness: 'fresh',
    });

    const semanticCoordinator = createCoordinator();
    semanticCoordinator.registerAdapter({
      ...makeAdapter('documents', [
        {
          ...makeItem('document:semantic', 'document', '猫猫语义命中', 'documents', 0),
          source: {
            partition: 'documents',
            sourceId: 'doc-1',
            sourceKind: 'epub',
            refId: 'chapter-2',
            filePath: '/mock/workspace/docs/cat.epub',
            metadata: { locator: { kind: 'chapter', chapterId: 'chapter-2' } },
          },
        },
      ]),
      getStatus: () => ({
        partition: 'documents',
        status: 'ready',
        freshness: 'fresh',
        provider: {
          providerId: 'semantic.test',
          semantic: true,
          vector: true,
          rag: true,
          partitions: ['documents'],
        },
        semantic: {
          providerId: 'semantic.test',
          modelVersion: 'm1',
          chunkingVersion: 'c1',
          sourceIdentity: 'doc-1',
          indexVersion: 'i1',
        },
      }),
    });

    const semanticResult = await semanticCoordinator.query({
      text: '猫猫',
      projectRoot: '/mock/workspace',
      partitions: ['documents'],
    });

    expect(semanticResult.items[0]?.source).toEqual(
      expect.objectContaining({
        sourceId: 'doc-1',
        refId: 'chapter-2',
        filePath: '/mock/workspace/docs/cat.epub',
      }),
    );
    expect(semanticResult.partitions[0]).toEqual(
      expect.objectContaining({
        provider: expect.objectContaining({ semantic: true, rag: true }),
        semantic: expect.objectContaining({
          modelVersion: 'm1',
          chunkingVersion: 'c1',
          sourceIdentity: 'doc-1',
          indexVersion: 'i1',
        }),
      }),
    );
  });
});

function makeAdapter(
  partition: ProjectSearchAdapter['partition'],
  items: readonly ProjectSearchItem[],
): ProjectSearchAdapter {
  return {
    partition,
    ensureInitialized: vi.fn(async () => undefined),
    query: vi.fn(async () => items),
    getStatus: () => ({
      partition,
      status: 'ready',
      freshness: 'fresh',
      itemCount: items.length,
    }),
  };
}

function createCoordinator(): ProjectIndexCoordinator {
  return new ProjectIndexCoordinator({
    resolveContext: async (query) => ({
      projectRoot: query.projectRoot ?? '/mock/workspace',
      fallbackDerived: !query.projectRoot,
    }),
    getWorkspaceRoots: () => ['/mock/workspace'],
    logger: { warn: vi.fn() },
  });
}

function makeFailingAdapter(partition: ProjectSearchAdapter['partition']): ProjectSearchAdapter {
  return {
    partition,
    ensureInitialized: vi.fn(async () => undefined),
    query: vi.fn(async () => {
      throw new Error('boom');
    }),
    getStatus: () => ({
      partition,
      status: 'failed',
      freshness: 'failed',
      error: 'boom',
    }),
  };
}

function makeItem(
  id: string,
  kind: ProjectSearchItem['kind'],
  label: string,
  partition: ProjectSearchAdapter['partition'],
  priority: number,
): ProjectSearchItem {
  return {
    id,
    kind,
    label,
    source: { partition },
    projectRoot: '/mock/workspace',
    searchText: label,
    scoreHints: { priority },
    freshness: 'fresh',
  };
}
