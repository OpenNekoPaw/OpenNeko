import { describe, expect, it, vi } from 'vitest';
import {
  createAssetSearchProviderContribution,
  createDocumentSearchProviderContribution,
  createProviderRegistration,
  createSearchProjectionAdapter,
  createStorySearchProviderContribution,
} from '../providers/providerRegistry';
import { createStaticProjectSearchAdapter } from '../testing/testAdapters';

describe('project search provider registry helpers', () => {
  it('describes story, asset, and document provider capabilities without domain imports', () => {
    const story = createStorySearchProviderContribution({
      providerId: 'story.workspace',
      adapters: [],
      replacesCompatibility: true,
    });
    const assets = createAssetSearchProviderContribution({
      providerId: 'assets.library',
      adapters: [],
      replacesCompatibility: true,
    });
    const documents = createDocumentSearchProviderContribution({
      providerId: 'documents.lightweight',
      adapters: [],
      semantic: true,
    });

    expect(story.capabilities).toEqual(
      expect.objectContaining({
        providerId: 'story.workspace',
        itemKinds: expect.arrayContaining(['script-role', 'creative-entity']),
      }),
    );
    expect(story.replacesCompatibilityPartitions).toEqual(['story-symbols', 'creative-entities']);
    expect(assets.capabilities).toEqual(
      expect.objectContaining({
        providerId: 'assets.library',
        itemKinds: expect.arrayContaining(['media', 'document', 'generated-asset']),
      }),
    );
    expect(assets.capabilities?.itemKinds).not.toContain('asset');
    expect(assets.capabilities?.partitions).not.toContain('asset-library');
    expect(documents.capabilities).toEqual(
      expect.objectContaining({
        providerId: 'documents.lightweight',
        semantic: true,
        itemKinds: ['document'],
      }),
    );
  });

  it('reports compatibility partitions replaced by first-class providers', () => {
    const registerAdapter = vi.fn(() => ({ dispose: vi.fn() }));
    const onCompatibilityPartitionReplaced = vi.fn();
    const registry = createProviderRegistration(registerAdapter, {
      onCompatibilityPartitionReplaced,
    });
    const adapter = createStaticProjectSearchAdapter('media-library', []);

    registry.registerProvider({
      providerId: 'assets.library',
      adapters: [adapter],
      replacesCompatibilityPartitions: ['media-library'],
    });

    expect(registerAdapter).toHaveBeenCalledWith(adapter);
    expect(onCompatibilityPartitionReplaced).toHaveBeenCalledWith(
      ['media-library'],
      expect.objectContaining({ providerId: 'assets.library' }),
    );
  });

  it('builds lightweight projection adapters for document range source refs', async () => {
    const adapter = createSearchProjectionAdapter({
      partition: 'documents',
      providerId: 'documents.lightweight',
      itemKind: 'document',
      load: async () => [
        {
          id: 'doc:chapter-1',
          label: '第一章',
          projectRoot: '/workspace',
          source: {
            partition: 'documents',
            sourceId: 'book',
            sourceKind: 'epub',
            refId: 'chapter-1',
            filePath: '/workspace/book.epub',
          },
          searchText: '第一章 小橘',
          metadata: { locator: { kind: 'chapter', chapterId: 'chapter-1' } },
        },
      ],
    });

    const items = await adapter.query({ text: '小橘' }, { projectRoot: '/workspace' });

    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 'doc:chapter-1',
        kind: 'document',
        source: expect.objectContaining({
          partition: 'documents',
          refId: 'chapter-1',
          filePath: '/workspace/book.epub',
        }),
      }),
    );
  });
});
