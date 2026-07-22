import { describe, expect, it } from 'vitest';
import {
  PROJECT_SEARCH_PARTITION_KINDS,
  canRunSemanticIndexingWorkOnTrigger,
  canSemanticIndexingWorkBlockProjectOpen,
  isProjectIndexFreshness,
  isProjectSearchCacheManifest,
  isProjectSearchItem,
  isProjectSearchItemKind,
  isProjectSearchMode,
  isProjectSearchPartitionKind,
  isProjectSearchPartitionStatusSnapshot,
  isProjectSearchProviderCapabilities,
  isProjectSearchQuery,
  isProjectSearchScopeKind,
  isProjectSemanticCoverageAnalysisKind,
  isProjectSemanticCoverageQuery,
  isProjectSemanticCoverageResult,
  isProjectSemanticCoverageStaleReason,
  isProjectSemanticCoverageStatus,
  isProjectSemanticProviderMetadata,
  projectCharacterObservationToSearchItem,
  projectMediaSemanticIndexToSearchItems,
  validateProjectSemanticCoverageQuery,
  validateProjectSemanticCoverageResult,
  type ProjectSearchItem,
  type ProjectSearchQuery,
  type ProjectSemanticCoverageQuery,
  type ProjectSemanticCoverageResult,
} from '../project-cache-search';
import { createResourceFingerprint, createResourceRef } from '../resource-cache';

describe('project cache/search contracts', () => {
  it('validates enum-like project search fields', () => {
    expect(isProjectSearchItemKind('script-role')).toBe(true);
    expect(isProjectSearchItemKind('semantic-evidence')).toBe(true);
    expect(isProjectSearchItemKind('character-memory-evidence')).toBe(true);
    expect(isProjectSearchItemKind('file')).toBe(false);
    expect(isProjectSearchPartitionKind('media-library')).toBe(true);
    expect(isProjectSearchPartitionKind('asset-library')).toBe(false);
    expect(isProjectSearchPartitionKind('semantic-evidence')).toBe(true);
    expect(isProjectSearchPartitionKind('character-memory')).toBe(true);
    expect(isProjectSearchPartitionKind('asset-cache')).toBe(false);
    expect(isProjectSearchMode('mention')).toBe(true);
    expect(isProjectSearchMode('everything')).toBe(false);
    expect(isProjectSearchScopeKind('current-file')).toBe(true);
    expect(isProjectSearchScopeKind('panel')).toBe(false);
    expect(isProjectIndexFreshness('fresh')).toBe(true);
    expect(isProjectIndexFreshness('unknown')).toBe(false);
  });

  it('keeps project search partitions local and excludes external research providers', () => {
    expect(PROJECT_SEARCH_PARTITION_KINDS).not.toContain('external-research' as never);
    expect(PROJECT_SEARCH_PARTITION_KINDS).not.toContain('web-search' as never);
    expect(isProjectSearchPartitionKind('external-research')).toBe(false);
    expect(isProjectSearchPartitionKind('web-search')).toBe(false);
  });

  it('accepts typed search queries with optional context and filters', () => {
    const query: ProjectSearchQuery = {
      text: '小橘',
      mode: 'mention',
      contextFilePath: '${PROJECT}/cases/test.fountain',
      kinds: ['script-role', 'entity-candidate'],
      partitions: ['story-symbols', 'creative-entities'],
      fileTypes: ['fountain'],
      mediaTypes: ['image'],
      scopes: [{ kind: 'current-file', filePath: '${PROJECT}/cases/test.fountain' }],
      limit: 20,
      freshness: 'allow-stale',
    };

    expect(isProjectSearchQuery(query)).toBe(true);
    expect(isProjectSearchQuery({ ...query, kinds: ['file'] })).toBe(false);
    expect(isProjectSearchQuery({ ...query, partitions: ['asset-cache'] })).toBe(false);
    expect(isProjectSearchQuery({ ...query, mode: 'everything' })).toBe(false);
    expect(isProjectSearchQuery({ ...query, scopes: [{ kind: 'panel' }] })).toBe(false);
    expect(isProjectSearchQuery({ text: 123 })).toBe(false);
  });

  it('represents normalized search items with source and freshness metadata', () => {
    const resource = createResourceRef({
      scope: 'project',
      provider: 'media-thumbnail',
      kind: 'media',
      source: { kind: 'file', filePath: '/workspace/assets/hero.png' },
      locator: { kind: 'file', path: '/workspace/assets/hero.png' },
      fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'hero.png' }),
    });
    const item: ProjectSearchItem = {
      id: 'script-role:/workspace/cases/test.fountain:小橘',
      kind: 'script-role',
      label: '小橘',
      description: 'Script role',
      source: {
        partition: 'story-symbols',
        sourceKind: 'fountain',
        filePath: '/workspace/cases/test.fountain',
      },
      projectRoot: '/workspace',
      filePath: '/workspace/cases/test.fountain',
      canonicalName: '小橘',
      aliases: [],
      searchText: '小橘 Script role /workspace/cases/test.fountain',
      visualResource: {
        resource: {
          resource,
          role: 'thumbnail',
          mimeType: 'image/png',
          width: 256,
          height: 256,
        },
        status: 'ready',
        alt: '小橘',
      },
      freshness: 'fresh',
    };

    expect(isProjectSearchItem(item)).toBe(true);
    expect(isProjectSearchItem({ ...item, freshness: 'old' })).toBe(false);
    expect(
      isProjectSearchItem({
        ...item,
        visualResource: { resource: { provider: 'bad' }, status: 'ready' },
      }),
    ).toBe(false);
    expect(isProjectSearchItem({ ...item, visualResource: { status: 'pending' } })).toBe(false);
  });

  it('represents semantic evidence search items with source refs and confidence', () => {
    const item: ProjectSearchItem = {
      id: 'semantic-evidence:asset-page-1:segment-panel-1',
      kind: 'semantic-evidence',
      label: 'Rin: We have to go.',
      description: 'OCR text from comic panel',
      source: {
        partition: 'semantic-evidence',
        sourceKind: 'comic',
        semanticSourceKind: 'comic',
        textKind: 'ocr',
        assetId: 'asset-page-1',
        segmentId: 'segment-panel-1',
        evidenceId: 'segment-panel-1',
        confidence: 0.82,
        metadata: {
          pageId: 'page-1',
          panelId: 'panel-1',
        },
      },
      projectRoot: '/workspace',
      searchText: 'Rin We have to go OCR comic panel',
      freshness: 'fresh',
    };

    expect(isProjectSearchItem(item)).toBe(true);
    expect(
      isProjectSearchQuery({
        text: 'Rin',
        kinds: ['semantic-evidence', 'character-memory-evidence'],
        partitions: ['semantic-evidence', 'character-memory'],
      }),
    ).toBe(true);
  });

  it('projects semantic indexes and character observations to search items', () => {
    const [semanticItem] = projectMediaSemanticIndexToSearchItems({
      projectRoot: '/workspace',
      index: {
        version: 1,
        assetId: 'asset-page-1',
        sourceRef: {
          kind: 'asset',
          assetId: 'asset-page-1',
          sourcePath: '${WORKSPACE}/comic/page-1.png',
        },
        textSegments: [
          {
            segmentId: 'segment-panel-1',
            kind: 'ocr',
            text: 'Rin: We have to go.',
            confidence: 0.82,
            sourceRef: {
              kind: 'tool-result',
              toolCallId: 'tool-1',
            },
            provenance: {
              providerId: 'ocr.local',
              sourceKind: 'comic',
            },
          },
        ],
      },
    });
    const observationItem = projectCharacterObservationToSearchItem({
      projectRoot: '/workspace',
      observation: {
        observationId: 'obs-rin-panel-1',
        sourceRef: {
          kind: 'tool-result',
          toolCallId: 'tool-1',
        },
        provenance: {
          source: 'comic',
          toolCallId: 'tool-1',
        },
        reviewStatus: 'draft',
        entityRef: { entityId: 'char-rin', entityKind: 'character' },
        confidence: 0.75,
        dimensions: [
          {
            dimension: 'dialogue',
            value: 'We have to go.',
          },
        ],
      },
    });

    expect(semanticItem).toMatchObject({
      kind: 'semantic-evidence',
      source: {
        partition: 'semantic-evidence',
        segmentId: 'segment-panel-1',
        confidence: 0.82,
      },
    });
    expect(isProjectSearchItem(semanticItem)).toBe(true);
    expect(observationItem).toMatchObject({
      kind: 'character-memory-evidence',
      source: {
        partition: 'character-memory',
        observationId: 'obs-rin-panel-1',
      },
    });
    expect(isProjectSearchItem(observationItem)).toBe(true);
  });

  it('validates cache manifests with partition generation metadata', () => {
    expect(
      isProjectSearchCacheManifest({
        version: 1,
        projectRoot: '/workspace',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
        generation: 3,
        sourceIdentity: 'workspace:123',
        partitions: [
          {
            partition: 'media-library',
            version: 1,
            generation: 3,
            freshness: 'fresh',
            itemCount: 12,
            sourceIdentity: 'media-library:mtime',
            updatedAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      }),
    ).toBe(true);
    expect(
      isProjectSearchCacheManifest({
        version: 1,
        projectRoot: '/workspace',
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z',
        generation: 3,
        partitions: [{ partition: 'unknown' }],
      }),
    ).toBe(false);
  });

  it('validates provider capabilities and semantic freshness metadata', () => {
    expect(
      isProjectSearchProviderCapabilities({
        providerId: 'rag.local',
        semantic: true,
        vector: true,
        rag: true,
        modes: ['global', 'agent-tool'],
        itemKinds: ['document', 'creative-entity', 'semantic-evidence'],
        partitions: ['documents', 'semantic-evidence'],
      }),
    ).toBe(true);
    expect(
      isProjectSearchProviderCapabilities({
        providerId: 'rag.local',
        modes: ['everything'],
      }),
    ).toBe(false);

    expect(
      isProjectSemanticProviderMetadata({
        providerId: 'rag.local',
        model: 'text-embedding-local',
        modelVersion: '2026-05-18',
        chunkingVersion: 'document-v1',
        sourceIdentity: 'workspace:abc',
        indexVersion: 'idx-1',
      }),
    ).toBe(true);
    expect(isProjectSemanticProviderMetadata({ model: 'missing-provider' })).toBe(false);

    expect(
      isProjectSearchPartitionStatusSnapshot({
        partition: 'documents',
        status: 'ready',
        freshness: 'fresh',
        itemCount: 3,
        provider: { providerId: 'rag.local', semantic: true, partitions: ['documents'] },
        semantic: {
          providerId: 'rag.local',
          modelVersion: '2026-05-18',
          chunkingVersion: 'document-v1',
          sourceIdentity: 'workspace:abc',
          indexVersion: 'idx-1',
        },
      }),
    ).toBe(true);
    expect(
      isProjectSearchPartitionStatusSnapshot({
        partition: 'semantic-evidence',
        status: 'building',
        freshness: 'stale',
        itemCount: 12,
        provider: {
          providerId: 'semantic-index.local',
          semantic: true,
          vector: true,
          partitions: ['semantic-evidence'],
          itemKinds: ['semantic-evidence'],
        },
        semantic: {
          providerId: 'semantic-index.local',
          sourceIdentity: 'semantic-index:mtime',
          indexVersion: 'semantic-index-v1',
        },
      }),
    ).toBe(true);
    expect(
      isProjectSearchPartitionStatusSnapshot({
        partition: 'documents',
        status: 'ready',
        freshness: 'fresh',
        provider: { modes: ['bad-mode'] },
      }),
    ).toBe(false);
  });

  it('keeps heavy semantic indexing work out of the blocking project-open path', () => {
    expect(canRunSemanticIndexingWorkOnTrigger('sidecar-projection', 'project-open')).toBe(true);
    expect(canRunSemanticIndexingWorkOnTrigger('ledger-projection', 'project-open')).toBe(true);
    expect(canRunSemanticIndexingWorkOnTrigger('ocr', 'project-open')).toBe(false);
    expect(canRunSemanticIndexingWorkOnTrigger('asr', 'project-open')).toBe(false);
    expect(canRunSemanticIndexingWorkOnTrigger('embedding', 'project-open')).toBe(false);
    expect(canRunSemanticIndexingWorkOnTrigger('perception-refresh', 'project-open')).toBe(false);
    expect(canRunSemanticIndexingWorkOnTrigger('ocr', 'on-demand')).toBe(true);
    expect(canSemanticIndexingWorkBlockProjectOpen('sidecar-projection')).toBe(false);
    expect(canSemanticIndexingWorkBlockProjectOpen('embedding')).toBe(false);
  });

  it('validates semantic coverage enum-like fields', () => {
    expect(isProjectSemanticCoverageStatus('fresh')).toBe(true);
    expect(isProjectSemanticCoverageStatus('unknown')).toBe(false);
    expect(isProjectSemanticCoverageAnalysisKind('ocr')).toBe(true);
    expect(isProjectSemanticCoverageAnalysisKind('workflow-route')).toBe(false);
    expect(isProjectSemanticCoverageStaleReason('schema-version')).toBe(true);
    expect(isProjectSemanticCoverageStaleReason('local-cache-row')).toBe(false);
  });

  it('accepts semantic coverage queries and results without cache internals', () => {
    const query = makeCoverageQuery();
    const result: ProjectSemanticCoverageResult = {
      query,
      coverage: 'partial',
      freshness: 'partial',
      matchedRanges: [
        {
          coverage: 'fresh',
          freshness: 'fresh',
          sourceRef: query.sourceRef,
          range: {
            startLine: 1,
            endLine: 10,
          },
          segmentIds: ['segment-1'],
          evidenceIds: ['evidence-1'],
          provider: {
            providerId: 'semantic-index.local',
            schemaVersion: '1',
            skillId: 'storyboard',
            skillVersion: '2026-06-11',
          },
        },
        {
          coverage: 'missing',
          freshness: 'stale',
          range: {
            startLine: 11,
            endLine: 20,
          },
          staleReasons: ['range-partial'],
          diagnostics: [
            {
              severity: 'info',
              code: 'semantic-coverage-missing-range',
              message: 'Pages 11-20 need normal tool analysis.',
            },
          ],
        },
      ],
      staleReasons: ['range-partial'],
      diagnostics: [
        {
          severity: 'info',
          code: 'semantic-coverage-partial',
          message: 'Fresh evidence exists for part of the requested range.',
        },
      ],
      provider: {
        providerId: 'semantic-index.local',
        schemaVersion: '1',
      },
      projectRoot: '/workspace',
      generation: 7,
    };

    expect(validateProjectSemanticCoverageQuery(query)).toEqual([]);
    expect(isProjectSemanticCoverageQuery(query)).toBe(true);
    expect(validateProjectSemanticCoverageResult(result)).toEqual([]);
    expect(isProjectSemanticCoverageResult(result)).toBe(true);
  });

  it('rejects invalid semantic coverage range/source combinations', () => {
    const diagnostics = validateProjectSemanticCoverageQuery({
      ...makeCoverageQuery(),
      sourceRef: {
        kind: 'document',
        source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
      },
      range: {
        pageId: 'page-1',
        panelId: 'panel-1',
      },
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-range', path: ['range', 'pageId'] }),
        expect.objectContaining({ code: 'invalid-range', path: ['range', 'panelId'] }),
      ]),
    );
    expect(isProjectSemanticCoverageQuery({ ...makeCoverageQuery(), analysisKind: 'route' })).toBe(
      false,
    );
  });

  it('rejects semantic coverage cache paths and runtime handles', () => {
    const badQuery = {
      ...makeCoverageQuery(),
      sourceRef: {
        kind: 'runtime',
        runtimeKind: 'cache-path',
        value: '${PROJECT}/.neko/.cache/semantic/pages.json',
      },
    };
    const badResult = {
      query: makeCoverageQuery(),
      coverage: 'fresh',
      freshness: 'fresh',
      provider: {
        providerId: 'semantic-index.local',
        sourceIdentity: '${PROJECT}/.neko/semantic-index/comic/page-1.json',
      },
    };

    expect(validateProjectSemanticCoverageQuery(badQuery).map((item) => item.code)).toEqual(
      expect.arrayContaining(['invalid-source-ref', 'unsafe-runtime-handle']),
    );
    expect(validateProjectSemanticCoverageResult(badResult).map((item) => item.code)).toEqual(
      expect.arrayContaining(['invalid-provider', 'unsafe-runtime-handle']),
    );
    expect(
      validateProjectSemanticCoverageResult({
        query: makeCoverageQuery(),
        coverage: 'fresh',
        freshness: 'fresh',
        matchedRanges: [
          {
            coverage: 'fresh',
            freshness: 'fresh',
            diagnostics: [
              {
                severity: 'warning',
                code: 'provider-private',
                message: 'bad',
                details: { uri: 'vscode-webview-resource://panel' },
              },
            ],
          },
        ],
      }).map((item) => item.code),
    ).toContain('invalid-matched-ranges');
  });
});

function makeCoverageQuery(): ProjectSemanticCoverageQuery {
  return {
    sourceRef: {
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
    },
    range: {
      startLine: 1,
      endLine: 20,
    },
    analysisKind: 'ocr',
    skillId: 'storyboard',
    skillVersion: '2026-06-11',
    schemaVersion: '1',
    projectRoot: '/workspace',
  };
}
