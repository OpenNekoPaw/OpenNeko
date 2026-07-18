import { describe, expect, it, vi } from 'vitest';
import {
  parseMediaSemanticIndexSidecar,
  type MediaSemanticIndex,
  type ProjectSemanticCoverageQuery,
  type SemanticProjectionRepository,
} from '@neko/shared';
import { createVSCodeSemanticCoverageProvider } from '../host-vscode/semanticCoverageProvider';

describe('VSCode semantic coverage provider', () => {
  it('does not scan retired semantic sidecars when the SQLite projection is unavailable', async () => {
    const readTextFile = vi.fn(async () => semanticIndexContent());
    const provider = createVSCodeSemanticCoverageProvider({
      readTextFile,
      resolveCharacterMemoryPath: (projectRoot) => `${projectRoot}/neko/character-memory.json`,
    });

    const result = await provider.querySemanticCoverage(makeQuery(), {
      projectRoot: '/workspace',
    });

    expect(result.coverage).toBe('missing');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'semantic-coverage-projection-unavailable' }),
      ]),
    );
    expect(readTextFile).not.toHaveBeenCalled();
  });

  it('reports fresh reusable ranges from the semantic projection', async () => {
    const provider = createVSCodeSemanticCoverageProvider({
      semanticProjection: createSemanticProjection(),
      readTextFile: async () => undefined,
      resolveCharacterMemoryPath: (projectRoot) => `${projectRoot}/neko/character-memory.json`,
    });

    const result = await provider.querySemanticCoverage(makeQuery(), {
      projectRoot: '/workspace',
    });

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'partial',
        freshness: 'partial',
        matchedRanges: [
          expect.objectContaining({
            coverage: 'fresh',
            freshness: 'fresh',
            range: { startLine: 1, endLine: 10 },
            segmentIds: ['segment-1'],
            evidenceIds: ['segment-1'],
          }),
          expect.objectContaining({
            coverage: 'missing',
            freshness: 'stale',
            range: { startLine: 11, endLine: 20 },
            staleReasons: ['range-partial'],
          }),
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('.neko/semantic-index');
  });

  it('marks matched evidence stale when the query asks for another schema version', async () => {
    const provider = createVSCodeSemanticCoverageProvider({
      semanticProjection: createSemanticProjection(),
      readTextFile: async () => undefined,
      resolveCharacterMemoryPath: (projectRoot) => `${projectRoot}/neko/character-memory.json`,
    });

    const result = await provider.querySemanticCoverage(
      {
        ...makeQuery(),
        range: { startLine: 1, endLine: 10 },
        schemaVersion: '2',
      },
      { projectRoot: '/workspace' },
    );

    expect(result.coverage).toBe('stale');
    expect(result.freshness).toBe('stale');
    expect(result.staleReasons).toEqual(['schema-version']);
    expect(result.matchedRanges?.[0]).toEqual(
      expect.objectContaining({
        staleReasons: ['schema-version'],
      }),
    );
  });

  it('reports character observation coverage from the project character memory ledger', async () => {
    const memoryPath = '/workspace/neko/character-memory.json';
    const provider = createVSCodeSemanticCoverageProvider({
      readTextFile: async (filePath) =>
        filePath === memoryPath ? characterMemoryContent() : undefined,
      resolveCharacterMemoryPath: () => memoryPath,
    });

    const result = await provider.querySemanticCoverage(
      {
        sourceRef: {
          kind: 'document',
          source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
        },
        range: { startLine: 3, endLine: 3 },
        analysisKind: 'character-observation',
        projectRoot: '/workspace',
      },
      { projectRoot: '/workspace' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'fresh',
        freshness: 'fresh',
        matchedRanges: [
          expect.objectContaining({
            observationIds: ['obs-rin-line-3'],
            evidenceIds: ['obs-rin-line-3'],
          }),
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('character-memory.json');
  });

  it('queries injected semantic projections without scanning sidecars and preserves stale freshness', async () => {
    const fixture = readSemanticProjectionFixture();
    const repository: SemanticProjectionRepository = {
      list: async () => [
        {
          sourceId: 'semantic:asset-page-1',
          sourceFingerprint: 'sha256:source-v1',
          provider: {
            providerId: 'ocr.local',
            indexVersion: 'semantic-index-v1',
            schemaVersion: '1',
          },
          coverage: ['ocr'],
          freshness: 'stale',
          ...fixture,
          updatedAt: '2026-07-13T04:00:00.000Z',
        },
      ],
      get: async () => null,
      replacePartition: async () => undefined,
      replaceSource: async () => undefined,
      deleteSource: async () => false,
      clearBodyBearingSources: async () => [],
      insertMissing: async () => ({ insertedSourceIds: [], preservedSourceIds: [] }),
    };
    const provider = createVSCodeSemanticCoverageProvider({
      semanticProjection: {
        repository,
        partition: {
          scope: 'workspace',
          workspaceId: '1888f0bf-ed92-440b-8cd6-03107358380a',
          domain: 'semantic-projection',
        },
      },
      readTextFile: async () => {
        throw new Error('legacy sidecar reads must not run');
      },
      resolveCharacterMemoryPath: (projectRoot) => `${projectRoot}/neko/character-memory.json`,
    });

    const result = await provider.querySemanticCoverage(
      { ...makeQuery(), range: { startLine: 1, endLine: 10 } },
      { projectRoot: '/workspace' },
    );

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'stale',
        freshness: 'stale',
        staleReasons: ['index-stale'],
        matchedRanges: [
          expect.objectContaining({
            evidenceIds: ['segment-1'],
            staleReasons: ['index-stale'],
          }),
        ],
      }),
    );
  });
});

function createSemanticProjection(): {
  readonly repository: SemanticProjectionRepository;
  readonly partition: {
    readonly scope: 'workspace';
    readonly workspaceId: string;
    readonly domain: 'semantic-projection';
  };
} {
  return {
    repository: {
      list: async () => [
        {
          sourceId: 'semantic:asset-page-1',
          sourceFingerprint: 'sha256:source-v1',
          provider: {
            providerId: 'ocr.local',
            indexVersion: 'semantic-index-v1',
            schemaVersion: '1',
          },
          coverage: ['ocr'],
          freshness: 'fresh',
          ...readSemanticProjectionFixture(),
          updatedAt: '2026-07-13T04:00:00.000Z',
        },
      ],
      get: async () => null,
      replacePartition: async () => undefined,
      replaceSource: async () => undefined,
      deleteSource: async () => false,
      clearBodyBearingSources: async () => [],
      insertMissing: async () => ({ insertedSourceIds: [], preservedSourceIds: [] }),
    },
    partition: {
      scope: 'workspace',
      workspaceId: '1888f0bf-ed92-440b-8cd6-03107358380a',
      domain: 'semantic-projection',
    },
  };
}

function makeQuery(): ProjectSemanticCoverageQuery {
  return {
    sourceRef: {
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
    },
    range: { startLine: 1, endLine: 20 },
    analysisKind: 'ocr',
    projectRoot: '/workspace',
    skillId: 'storyboard',
    skillVersion: '2026-06-12',
    schemaVersion: '1',
  };
}

function semanticIndexContent(): string {
  return JSON.stringify({
    version: 1,
    assetId: 'asset-page-1',
    sourceRef: {
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
    },
    textSegments: [
      {
        segmentId: 'segment-1',
        kind: 'ocr',
        text: 'Rin: We have to go.',
        sourceRef: {
          kind: 'document',
          source: { filePath: 'docs/comic.pdf', format: 'pdf' },
          range: { startLine: 1, endLine: 10 },
        },
        provenance: {
          providerId: 'ocr.local',
          sourceKind: 'comic',
        },
        range: { startLine: 1, endLine: 10 },
      },
    ],
  });
}

function readSemanticIndexFixture(): MediaSemanticIndex {
  const parsed = parseMediaSemanticIndexSidecar(semanticIndexContent());
  if (!parsed.record) throw new Error('Semantic index test fixture must be valid.');
  return parsed.record.index;
}

function readSemanticProjectionFixture() {
  const index = readSemanticIndexFixture();
  const segment = index.textSegments?.[0];
  if (!segment) throw new Error('Semantic index test fixture must contain one segment.');
  const { textSegments: _textSegments, ...compactIndex } = index;
  return {
    index: compactIndex,
    evidence: [
      {
        evidenceId: segment.segmentId,
        unitId: 'page-1',
        kind: segment.kind,
        sourceRef: segment.sourceRef,
        locator: { kind: 'page' as const, pageNumber: 1, pageIndex: 0 },
        range: segment.range,
        contentHash: 'sha256:segment-1',
        provenance: segment.provenance,
      },
    ],
  };
}

function characterMemoryContent(): string {
  return JSON.stringify({
    version: 1,
    ledger: {
      version: 1,
      projectRoot: '/workspace',
      observations: [
        {
          observationId: 'obs-rin-line-3',
          sourceRef: {
            kind: 'document',
            source: { filePath: 'docs/comic.pdf', format: 'pdf' },
            range: { startLine: 3, endLine: 3 },
          },
          provenance: {
            source: 'comic',
            providerId: 'vision.local',
          },
          reviewStatus: 'draft',
          entityRef: { entityId: 'char-rin', entityKind: 'character' },
          confidence: 0.82,
          dimensions: [
            {
              dimension: 'dialogue',
              value: 'We have to go.',
            },
          ],
        },
      ],
    },
  });
}
