import { describe, expect, it, vi } from 'vitest';
import type { ProjectSemanticCoverageQuery, ProjectSemanticCoverageResult } from '../contracts';
import { ProjectIndexCoordinator } from '../core/ProjectIndexCoordinator';
import type { ProjectSemanticCoverageProvider } from '../core';

describe('semantic coverage coordinator', () => {
  it('aggregates fresh matched ranges with missing ranges for incremental planning', async () => {
    const coordinator = createCoordinator();
    coordinator.registerSemanticCoverageProvider(
      makeProvider('semantic.sidecar', {
        coverage: 'fresh',
        freshness: 'fresh',
        matchedRanges: [
          {
            coverage: 'fresh',
            freshness: 'fresh',
            range: { startLine: 1, endLine: 10 },
            segmentIds: ['segment-1'],
            evidenceIds: ['evidence-1'],
            provider: { providerId: 'semantic.sidecar' },
          },
        ],
        provider: { providerId: 'semantic.sidecar' },
      }),
    );
    coordinator.registerSemanticCoverageProvider(
      makeProvider('semantic.gaps', {
        coverage: 'missing',
        freshness: 'stale',
        matchedRanges: [
          {
            coverage: 'missing',
            freshness: 'stale',
            range: { startLine: 11, endLine: 20 },
            staleReasons: ['range-partial'],
          },
        ],
        staleReasons: ['range-partial'],
        provider: { providerId: 'semantic.gaps' },
      }),
    );

    const result = await coordinator.querySemanticCoverage(makeQuery());

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'partial',
        freshness: 'stale',
        projectRoot: '/mock/workspace',
        matchedRanges: [
          expect.objectContaining({ range: { startLine: 1, endLine: 10 } }),
          expect.objectContaining({ range: { startLine: 11, endLine: 20 } }),
        ],
        staleReasons: ['range-partial'],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('.neko/.cache');
    expect(JSON.stringify(result)).not.toContain('.neko/semantic-index');
  });

  it('preserves stale metadata and isolates provider failures', async () => {
    const coordinator = createCoordinator();
    coordinator.registerSemanticCoverageProvider(
      makeProvider('semantic.stale', {
        coverage: 'stale',
        freshness: 'stale',
        staleReasons: ['source-fingerprint', 'index-stale'],
        matchedRanges: [
          {
            coverage: 'stale',
            freshness: 'stale',
            range: { startLine: 1, endLine: 5 },
            staleReasons: ['source-fingerprint'],
            provider: {
              providerId: 'semantic.stale',
              model: 'embedding-local',
              sourceIdentity: 'stale-source',
            },
          },
        ],
        provider: {
          providerId: 'semantic.stale',
          model: 'embedding-local',
          sourceIdentity: 'stale-source',
        },
      }),
    );
    coordinator.registerSemanticCoverageProvider({
      providerId: 'semantic.failing',
      querySemanticCoverage: vi.fn(async () => {
        throw new Error('/mock/workspace/.neko/.cache/private.db');
      }),
    });

    const result = await coordinator.querySemanticCoverage(makeQuery());

    expect(result.coverage).toBe('partial');
    expect(result.freshness).toBe('partial');
    expect(result.staleReasons).toEqual(['source-fingerprint', 'index-stale']);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'semantic-coverage-provider-failed',
          details: expect.objectContaining({ providerId: 'semantic.failing', reasonKind: 'Error' }),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('private.db');
    expect(JSON.stringify(result)).not.toContain('.neko/.cache');
  });

  it('reports missing coverage when no provider is registered', async () => {
    const result = await createCoordinator().querySemanticCoverage(makeQuery());

    expect(result).toEqual(
      expect.objectContaining({
        coverage: 'missing',
        freshness: 'stale',
        staleReasons: ['missing-provider'],
      }),
    );
  });

  it('routes provider-specific queries without invoking unrelated providers', async () => {
    const coordinator = createCoordinator();
    const selected = makeProvider('semantic.selected', {
      coverage: 'fresh',
      freshness: 'fresh',
      matchedRanges: [{ coverage: 'fresh', freshness: 'fresh', range: { startLine: 1 } }],
      provider: { providerId: 'semantic.selected' },
    });
    const skipped = makeProvider('semantic.skipped', {
      coverage: 'fresh',
      freshness: 'fresh',
      provider: { providerId: 'semantic.skipped' },
    });
    coordinator.registerSemanticCoverageProvider(selected);
    coordinator.registerSemanticCoverageProvider(skipped);

    const result = await coordinator.querySemanticCoverage({
      ...makeQuery(),
      providerId: 'semantic.selected',
    });

    expect(selected.querySemanticCoverage).toHaveBeenCalledTimes(1);
    expect(skipped.querySemanticCoverage).not.toHaveBeenCalled();
    expect(result.provider?.providerId).toBe('semantic.selected');
  });
});

function createCoordinator(): ProjectIndexCoordinator {
  return new ProjectIndexCoordinator({
    resolveContext: async (query) => ({
      projectRoot: query.projectRoot ?? '/mock/workspace',
      resolvedContextFilePath: query.contextFilePath,
      contextUri: query.contextUri,
      fallbackDerived: !query.projectRoot,
    }),
    getWorkspaceRoots: () => ['/mock/workspace'],
    logger: { warn: vi.fn() },
    now: () => new Date('2026-06-11T00:00:00.000Z'),
  });
}

function makeProvider(
  providerId: string,
  result: Omit<ProjectSemanticCoverageResult, 'query' | 'projectRoot'>,
): ProjectSemanticCoverageProvider {
  return {
    providerId,
    querySemanticCoverage: vi.fn(async (query, context) => ({
      query,
      ...result,
      ...(context.projectRoot ? { projectRoot: context.projectRoot } : {}),
    })),
  };
}

function makeQuery(): ProjectSemanticCoverageQuery {
  return {
    sourceRef: {
      kind: 'document',
      source: { filePath: '/mock/workspace/docs/comic.pdf', format: 'pdf' },
    },
    range: {
      startLine: 1,
      endLine: 20,
    },
    analysisKind: 'ocr',
    projectRoot: '/mock/workspace',
    skillId: 'storyboard',
  };
}
