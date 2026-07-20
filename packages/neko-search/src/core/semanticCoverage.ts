import {
  isProjectSemanticCoverageResult,
  type ContributionDiagnostic,
  type ProjectIndexFreshness,
  type ProjectSearchQueryContext,
  type ProjectSemanticCoverageQuery,
  type ProjectSemanticCoverageResult,
  type ProjectSemanticCoverageStaleReason,
  type ProjectSemanticCoverageStatus,
  type ProjectSemanticProviderMetadata,
} from '@neko/shared';

export interface ProjectSemanticCoverageAggregationInput {
  readonly query: ProjectSemanticCoverageQuery;
  readonly context: ProjectSearchQueryContext;
  readonly generation: number;
  readonly providerResults: readonly PromiseSettledResult<ProjectSemanticCoverageResult>[];
  readonly providerIds: readonly string[];
}

export function aggregateProjectSemanticCoverage(
  input: ProjectSemanticCoverageAggregationInput,
): ProjectSemanticCoverageResult {
  const validResults: ProjectSemanticCoverageResult[] = [];
  const diagnostics: ContributionDiagnostic[] = [];

  input.providerResults.forEach((settled, index) => {
    const providerId = input.providerIds[index] ?? 'unknown';
    if (settled.status === 'rejected') {
      diagnostics.push(providerFailureDiagnostic(providerId, settled.reason));
      return;
    }
    if (!isProjectSemanticCoverageResult(settled.value)) {
      diagnostics.push({
        severity: 'warning',
        code: 'semantic-coverage-invalid-provider-result',
        message: `Semantic coverage provider ${providerId} returned an invalid result.`,
      });
      return;
    }
    validResults.push(settled.value);
  });

  if (validResults.length === 0) {
    return {
      query: input.query,
      coverage: diagnostics.length > 0 ? 'failed' : 'missing',
      freshness: diagnostics.length > 0 ? 'failed' : 'stale',
      staleReasons: diagnostics.length > 0 ? ['provider-failed'] : ['missing-provider'],
      diagnostics:
        diagnostics.length > 0
          ? diagnostics
          : [
              {
                severity: 'info',
                code: 'semantic-coverage-missing-provider',
                message: 'No semantic coverage provider reported evidence for this query.',
              },
            ],
      ...(input.context.projectRoot ? { projectRoot: input.context.projectRoot } : {}),
      generation: input.generation,
    };
  }

  const matchedRanges = compact(validResults.flatMap((result) => result.matchedRanges ?? []));
  const staleReasons = uniqueStrings(
    validResults.flatMap((result) => result.staleReasons ?? []),
  ) as readonly ProjectSemanticCoverageStaleReason[];
  const mergedDiagnostics = [
    ...validResults.flatMap((result) => result.diagnostics ?? []),
    ...diagnostics,
  ];
  const provider = mergeProviderMetadata(validResults.map((result) => result.provider));
  const coverage = aggregateCoverageStatus(validResults, diagnostics.length > 0);
  const freshness = aggregateCoverageFreshness(validResults, diagnostics.length > 0);

  return {
    query: input.query,
    coverage,
    freshness,
    ...(matchedRanges.length > 0 ? { matchedRanges } : {}),
    ...(staleReasons.length > 0 ? { staleReasons } : {}),
    ...(mergedDiagnostics.length > 0 ? { diagnostics: mergedDiagnostics } : {}),
    ...(provider ? { provider } : {}),
    ...(input.context.projectRoot ? { projectRoot: input.context.projectRoot } : {}),
    generation: input.generation,
  };
}

function aggregateCoverageStatus(
  results: readonly ProjectSemanticCoverageResult[],
  hasProviderFailure: boolean,
): ProjectSemanticCoverageStatus {
  if (results.every((result) => result.coverage === 'failed')) return 'failed';
  if (hasProviderFailure) return 'partial';
  if (results.some((result) => result.coverage === 'partial')) return 'partial';
  if (results.some((result) => result.coverage === 'fresh')) {
    return results.every((result) => result.coverage === 'fresh') ? 'fresh' : 'partial';
  }
  if (results.some((result) => result.coverage === 'stale')) return 'stale';
  if (results.some((result) => result.coverage === 'missing')) return 'missing';
  return 'failed';
}

function aggregateCoverageFreshness(
  results: readonly ProjectSemanticCoverageResult[],
  hasProviderFailure: boolean,
): ProjectIndexFreshness {
  if (results.every((result) => result.freshness === 'failed')) return 'failed';
  if (hasProviderFailure) return 'partial';
  if (results.some((result) => result.freshness === 'partial')) return 'partial';
  if (results.some((result) => result.freshness === 'building')) return 'building';
  if (results.some((result) => result.freshness === 'stale')) return 'stale';
  return 'fresh';
}

function mergeProviderMetadata(
  providers: readonly (ProjectSemanticProviderMetadata | undefined)[],
): ProjectSemanticProviderMetadata | undefined {
  const present = providers.filter(
    (provider): provider is ProjectSemanticProviderMetadata => provider !== undefined,
  );
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return {
    providerId: uniqueStrings(present.map((provider) => provider.providerId)).join('+'),
    modelVersion: uniqueStrings(compact(present.map((provider) => provider.modelVersion))).join(
      '+',
    ),
    chunkingVersion: uniqueStrings(
      compact(present.map((provider) => provider.chunkingVersion)),
    ).join('+'),
    indexVersion: uniqueStrings(compact(present.map((provider) => provider.indexVersion))).join(
      '+',
    ),
    schemaVersion: uniqueStrings(compact(present.map((provider) => provider.schemaVersion))).join(
      '+',
    ),
  };
}

function providerFailureDiagnostic(providerId: string, reason: unknown): ContributionDiagnostic {
  return {
    severity: 'warning',
    code: 'semantic-coverage-provider-failed',
    message: `Semantic coverage provider ${providerId} failed.`,
    details: {
      providerId,
      reasonKind: reason instanceof Error ? reason.name : typeof reason,
    },
  };
}

function compact<T>(items: readonly (T | undefined)[]): T[] {
  return items.filter((item): item is T => item !== undefined);
}

function uniqueStrings(items: readonly string[]): string[] {
  return [...new Set(items.filter((item) => item.length > 0))];
}
