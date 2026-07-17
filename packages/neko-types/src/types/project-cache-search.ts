// =============================================================================
// Project Cache/Search Contracts
// =============================================================================

import {
  isContentSourceRef,
  isWebviewLikeRuntimeValue,
  type ContentSourceRef,
} from './content-access';
import {
  isResourceRef,
  isResourceCacheStatus,
  isResourceVariantRef,
  type ResourceCacheStatus,
  type ResourceVariantRef,
} from './resource-cache';
import {
  validateMediaTextRangeForSourceRef,
  type ContributionDiagnostic,
  type MediaSemanticIndex,
  type MediaSemanticSourceRef,
  type MediaTextRange,
  type MediaTextSegment,
  type MediaTextSourceKind,
  type MediaTextSegmentKind,
} from './media-semantic-index';
import type { CharacterObservation } from './character-memory';

export type ProjectSearchItemKind =
  | 'story-scene'
  | 'story-section'
  | 'script-role'
  | 'creative-entity'
  | 'entity-candidate'
  | 'asset'
  | 'media'
  | 'document'
  | 'generated-asset'
  | 'semantic-evidence'
  | 'character-memory-evidence';

export type ProjectSearchPartitionKind =
  | 'story-symbols'
  | 'creative-entities'
  | 'asset-library'
  | 'media-library'
  | 'documents'
  | 'generated-assets'
  | 'semantic-evidence'
  | 'character-memory';

export type ProjectIndexFreshness = 'fresh' | 'stale' | 'building' | 'partial' | 'failed';

export type ProjectSemanticCoverageStatus = 'fresh' | 'stale' | 'missing' | 'partial' | 'failed';

export type ProjectSemanticCoverageAnalysisKind =
  | 'ocr'
  | 'asr'
  | 'subtitle'
  | 'vision'
  | 'entity-mention'
  | 'character-observation'
  | 'storyboard';

export type ProjectSemanticCoverageStaleReason =
  | 'provider-version'
  | 'schema-version'
  | 'source-fingerprint'
  | 'skill-version'
  | 'missing-provider'
  | 'index-stale'
  | 'range-partial'
  | 'cache-rebuilding'
  | 'provider-failed';

export type ProjectIndexPartitionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'building'
  | 'stale'
  | 'failed';

export type ProjectSearchFreshnessPolicy = 'allow-stale' | 'fresh-only';

export type ProjectSearchMode =
  | 'mention'
  | 'global'
  | 'asset-picker'
  | 'entity-picker'
  | 'document'
  | 'agent-tool';

export type ProjectSearchScopeKind =
  | 'project'
  | 'workspace'
  | 'media-library'
  | 'document'
  | 'current-file';

export interface ProjectSearchScope {
  readonly kind: ProjectSearchScopeKind;
  readonly id?: string;
  readonly filePath?: string;
  readonly uri?: string;
}

export interface ProjectSemanticProviderMetadata {
  readonly providerId: string;
  readonly model?: string;
  readonly modelVersion?: string;
  readonly chunkingVersion?: string;
  readonly sourceIdentity?: string;
  readonly indexVersion?: string;
  readonly schemaVersion?: string;
  readonly skillId?: string;
  readonly skillVersion?: string;
}

export interface ProjectSearchProviderCapabilities {
  readonly providerId?: string;
  readonly semantic?: boolean;
  readonly vector?: boolean;
  readonly rag?: boolean;
  readonly modes?: readonly ProjectSearchMode[];
  readonly itemKinds?: readonly ProjectSearchItemKind[];
  readonly partitions?: readonly ProjectSearchPartitionKind[];
}

export type ProjectIndexUpdateReason =
  | 'project-open'
  | 'manual-refresh'
  | 'document-change'
  | 'file-create'
  | 'file-change'
  | 'file-delete'
  | 'settings-change'
  | 'asset-change'
  | 'entity-change'
  | 'generated-index-change'
  | 'cache-load'
  | 'cache-rebuild';

export type ProjectSemanticIndexingWorkKind =
  | 'sidecar-projection'
  | 'ledger-projection'
  | 'ocr'
  | 'asr'
  | 'embedding'
  | 'perception-refresh';

export type ProjectSemanticIndexingTrigger =
  | 'project-open'
  | 'idle'
  | 'import'
  | 'on-demand'
  | 'manual-refresh';

export interface ProjectSearchSourceRef {
  readonly partition: ProjectSearchPartitionKind;
  readonly sourceId?: string;
  readonly sourceKind?: string;
  readonly refId?: string;
  readonly evidenceId?: string;
  readonly assetId?: string;
  readonly segmentId?: string;
  readonly observationId?: string;
  readonly textKind?: MediaTextSegmentKind;
  readonly semanticSourceKind?: MediaTextSourceKind;
  readonly confidence?: number;
  readonly filePath?: string;
  readonly uri?: string;
  readonly projectRelativePath?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProjectSearchScoreHints {
  readonly priority?: number;
  readonly exact?: boolean;
  readonly currentProject?: boolean;
  readonly sourceOrder?: number;
  readonly recentlyUsed?: boolean;
}

export interface ProjectSearchVisualResource {
  readonly resource?: ResourceVariantRef;
  readonly projectedUri?: string;
  readonly status?: ResourceCacheStatus;
  readonly alt?: string;
}

export interface ProjectSearchItem {
  readonly id: string;
  readonly kind: ProjectSearchItemKind;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly source: ProjectSearchSourceRef;
  readonly projectRoot: string;
  readonly filePath?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly searchText: string;
  readonly scoreHints?: ProjectSearchScoreHints;
  readonly navigationData?: Record<string, unknown>;
  readonly thumbnailUri?: string;
  readonly visualResource?: ProjectSearchVisualResource;
  readonly freshness: ProjectIndexFreshness;
  readonly metadata?: Record<string, unknown>;
}

export interface ProjectSearchQuery {
  readonly text: string;
  readonly mode?: ProjectSearchMode;
  readonly contextFilePath?: string;
  readonly contextUri?: string;
  readonly projectRoot?: string;
  readonly kinds?: readonly ProjectSearchItemKind[];
  readonly partitions?: readonly ProjectSearchPartitionKind[];
  readonly fileTypes?: readonly string[];
  readonly mediaTypes?: readonly string[];
  readonly scopes?: readonly ProjectSearchScope[];
  readonly limit?: number;
  readonly freshness?: ProjectSearchFreshnessPolicy;
}

export interface ProjectSearchQueryContext {
  readonly projectRoot?: string;
  readonly resolvedContextFilePath?: string;
  readonly contextUri?: string;
  readonly fallbackDerived?: boolean;
}

export interface ProjectNormalizedSearchQuery {
  readonly raw: string;
  readonly normalized: string;
  readonly tokens: readonly string[];
}

export interface ProjectSearchPartitionStatusSnapshot {
  readonly partition: ProjectSearchPartitionKind;
  readonly status: ProjectIndexPartitionStatus;
  readonly freshness: ProjectIndexFreshness;
  readonly itemCount?: number;
  readonly generation?: number;
  readonly updatedAt?: string;
  readonly error?: string;
  readonly provider?: ProjectSearchProviderCapabilities;
  readonly semantic?: ProjectSemanticProviderMetadata;
}

export interface ProjectSearchResult {
  readonly query: ProjectSearchQuery;
  readonly context: ProjectSearchQueryContext;
  readonly items: readonly ProjectSearchItem[];
  readonly partitions: readonly ProjectSearchPartitionStatusSnapshot[];
  readonly freshness: ProjectIndexFreshness;
  readonly generation?: number;
}

export interface ProjectSemanticCoverageQuery {
  readonly sourceRef: MediaSemanticSourceRef;
  readonly range?: MediaTextRange;
  readonly analysisKind: ProjectSemanticCoverageAnalysisKind;
  readonly skillId?: string;
  readonly skillVersion?: string;
  readonly providerId?: string;
  readonly schemaVersion?: string;
  readonly projectRoot?: string;
  readonly contextFilePath?: string;
  readonly contextUri?: string;
}

export interface ProjectSemanticCoverageMatchedRange {
  readonly range?: MediaTextRange;
  readonly coverage: ProjectSemanticCoverageStatus;
  readonly freshness: ProjectIndexFreshness;
  readonly sourceRef?: MediaSemanticSourceRef;
  readonly evidenceIds?: readonly string[];
  readonly segmentIds?: readonly string[];
  readonly observationIds?: readonly string[];
  readonly provider?: ProjectSemanticProviderMetadata;
  readonly staleReasons?: readonly ProjectSemanticCoverageStaleReason[];
  readonly diagnostics?: readonly ContributionDiagnostic[];
}

export interface ProjectSemanticCoverageResult {
  readonly query: ProjectSemanticCoverageQuery;
  readonly coverage: ProjectSemanticCoverageStatus;
  readonly freshness: ProjectIndexFreshness;
  readonly matchedRanges?: readonly ProjectSemanticCoverageMatchedRange[];
  readonly staleReasons?: readonly ProjectSemanticCoverageStaleReason[];
  readonly diagnostics?: readonly ContributionDiagnostic[];
  readonly provider?: ProjectSemanticProviderMetadata;
  readonly projectRoot?: string;
  readonly generation?: number;
}

export interface ProjectIndexChangedRef {
  readonly kind: ProjectSearchItemKind | ProjectSearchPartitionKind | 'file' | 'settings';
  readonly id?: string;
  readonly filePath?: string;
  readonly uri?: string;
}

export interface ProjectIndexChangeEvent {
  readonly projectRoot: string;
  readonly partition?: ProjectSearchPartitionKind;
  readonly reason: ProjectIndexUpdateReason;
  readonly changedRefs: readonly ProjectIndexChangedRef[];
  readonly generation: number;
  readonly freshness: ProjectIndexFreshness;
  readonly updatedAt: string;
}

export interface ProjectSearchCachePartitionManifest {
  readonly partition: ProjectSearchPartitionKind;
  readonly version: number;
  readonly generation: number;
  readonly freshness: ProjectIndexFreshness;
  readonly itemCount: number;
  readonly sourceIdentity?: string;
  readonly updatedAt: string;
}

export interface ProjectSearchCacheManifest {
  readonly version: 1;
  readonly projectRoot: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly generation: number;
  readonly sourceIdentity?: string;
  readonly partitions: readonly ProjectSearchCachePartitionManifest[];
}

export interface ProjectSearchAdapterRefreshOptions {
  readonly reason: ProjectIndexUpdateReason;
  readonly projectRoot: string;
  readonly changedRefs?: readonly ProjectIndexChangedRef[];
}

export interface ProjectSemanticIndexingPolicy {
  readonly workKind: ProjectSemanticIndexingWorkKind;
  readonly allowedTriggers: readonly ProjectSemanticIndexingTrigger[];
  readonly blocksProjectOpen: boolean;
  readonly providerId?: string;
}

export interface ProjectSemanticEvidenceSearchProjectionInput {
  readonly projectRoot: string;
  readonly index: MediaSemanticIndex;
  readonly freshness?: ProjectIndexFreshness;
}

export interface ProjectCharacterMemorySearchProjectionInput {
  readonly projectRoot: string;
  readonly observation: CharacterObservation;
  readonly freshness?: ProjectIndexFreshness;
}

export interface ProjectSearchAdapter {
  readonly partition: ProjectSearchPartitionKind;
  ensureInitialized(projectRoot: string): Promise<void>;
  query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]>;
  refresh?(options: ProjectSearchAdapterRefreshOptions): Promise<void>;
  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot;
  dispose?(): void;
}

export const PROJECT_SEARCH_ITEM_KINDS: readonly ProjectSearchItemKind[] = [
  'story-scene',
  'story-section',
  'script-role',
  'creative-entity',
  'entity-candidate',
  'asset',
  'media',
  'document',
  'generated-asset',
  'semantic-evidence',
  'character-memory-evidence',
] as const;

export const PROJECT_SEARCH_PARTITION_KINDS: readonly ProjectSearchPartitionKind[] = [
  'story-symbols',
  'creative-entities',
  'asset-library',
  'media-library',
  'documents',
  'generated-assets',
  'semantic-evidence',
  'character-memory',
] as const;

export const PROJECT_INDEX_FRESHNESS_VALUES: readonly ProjectIndexFreshness[] = [
  'fresh',
  'stale',
  'building',
  'partial',
  'failed',
] as const;

export const PROJECT_SEMANTIC_COVERAGE_STATUSES: readonly ProjectSemanticCoverageStatus[] = [
  'fresh',
  'stale',
  'missing',
  'partial',
  'failed',
] as const;

export const PROJECT_SEMANTIC_COVERAGE_ANALYSIS_KINDS: readonly ProjectSemanticCoverageAnalysisKind[] =
  [
    'ocr',
    'asr',
    'subtitle',
    'vision',
    'entity-mention',
    'character-observation',
    'storyboard',
  ] as const;

export const PROJECT_SEMANTIC_COVERAGE_STALE_REASONS: readonly ProjectSemanticCoverageStaleReason[] =
  [
    'provider-version',
    'schema-version',
    'source-fingerprint',
    'skill-version',
    'missing-provider',
    'index-stale',
    'range-partial',
    'cache-rebuilding',
    'provider-failed',
  ] as const;

export const PROJECT_INDEX_PARTITION_STATUS_VALUES: readonly ProjectIndexPartitionStatus[] = [
  'idle',
  'loading',
  'ready',
  'building',
  'stale',
  'failed',
] as const;

export const PROJECT_SEARCH_MODES: readonly ProjectSearchMode[] = [
  'mention',
  'global',
  'asset-picker',
  'entity-picker',
  'document',
  'agent-tool',
] as const;

export const PROJECT_SEARCH_SCOPE_KINDS: readonly ProjectSearchScopeKind[] = [
  'project',
  'workspace',
  'media-library',
  'document',
  'current-file',
] as const;

export const PROJECT_SEMANTIC_INDEXING_WORK_KINDS: readonly ProjectSemanticIndexingWorkKind[] = [
  'sidecar-projection',
  'ledger-projection',
  'ocr',
  'asr',
  'embedding',
  'perception-refresh',
] as const;

export const PROJECT_SEMANTIC_INDEXING_TRIGGERS: readonly ProjectSemanticIndexingTrigger[] = [
  'project-open',
  'idle',
  'import',
  'on-demand',
  'manual-refresh',
] as const;

export const PROJECT_SEMANTIC_INDEXING_POLICIES: readonly ProjectSemanticIndexingPolicy[] = [
  {
    workKind: 'sidecar-projection',
    allowedTriggers: ['project-open', 'idle', 'import', 'on-demand', 'manual-refresh'],
    blocksProjectOpen: false,
  },
  {
    workKind: 'ledger-projection',
    allowedTriggers: ['project-open', 'idle', 'import', 'on-demand', 'manual-refresh'],
    blocksProjectOpen: false,
  },
  {
    workKind: 'ocr',
    allowedTriggers: ['idle', 'import', 'on-demand', 'manual-refresh'],
    blocksProjectOpen: false,
  },
  {
    workKind: 'asr',
    allowedTriggers: ['idle', 'import', 'on-demand', 'manual-refresh'],
    blocksProjectOpen: false,
  },
  {
    workKind: 'embedding',
    allowedTriggers: ['idle', 'import', 'on-demand', 'manual-refresh'],
    blocksProjectOpen: false,
  },
  {
    workKind: 'perception-refresh',
    allowedTriggers: ['idle', 'import', 'on-demand', 'manual-refresh'],
    blocksProjectOpen: false,
  },
] as const;

export function isProjectSearchItemKind(value: unknown): value is ProjectSearchItemKind {
  return includesString(PROJECT_SEARCH_ITEM_KINDS, value);
}

export function isProjectSearchPartitionKind(value: unknown): value is ProjectSearchPartitionKind {
  return includesString(PROJECT_SEARCH_PARTITION_KINDS, value);
}

export function isProjectIndexFreshness(value: unknown): value is ProjectIndexFreshness {
  return includesString(PROJECT_INDEX_FRESHNESS_VALUES, value);
}

export function isProjectSemanticCoverageStatus(
  value: unknown,
): value is ProjectSemanticCoverageStatus {
  return includesString(PROJECT_SEMANTIC_COVERAGE_STATUSES, value);
}

export function isProjectSemanticCoverageAnalysisKind(
  value: unknown,
): value is ProjectSemanticCoverageAnalysisKind {
  return includesString(PROJECT_SEMANTIC_COVERAGE_ANALYSIS_KINDS, value);
}

export function isProjectSemanticCoverageStaleReason(
  value: unknown,
): value is ProjectSemanticCoverageStaleReason {
  return includesString(PROJECT_SEMANTIC_COVERAGE_STALE_REASONS, value);
}

export function isProjectIndexPartitionStatus(
  value: unknown,
): value is ProjectIndexPartitionStatus {
  return includesString(PROJECT_INDEX_PARTITION_STATUS_VALUES, value);
}

export function isProjectSearchMode(value: unknown): value is ProjectSearchMode {
  return includesString(PROJECT_SEARCH_MODES, value);
}

export function isProjectSearchScopeKind(value: unknown): value is ProjectSearchScopeKind {
  return includesString(PROJECT_SEARCH_SCOPE_KINDS, value);
}

export function canRunSemanticIndexingWorkOnTrigger(
  workKind: ProjectSemanticIndexingWorkKind,
  trigger: ProjectSemanticIndexingTrigger,
): boolean {
  const policy = PROJECT_SEMANTIC_INDEXING_POLICIES.find((item) => item.workKind === workKind);
  return Boolean(policy?.allowedTriggers.includes(trigger));
}

export function canSemanticIndexingWorkBlockProjectOpen(
  workKind: ProjectSemanticIndexingWorkKind,
): boolean {
  const policy = PROJECT_SEMANTIC_INDEXING_POLICIES.find((item) => item.workKind === workKind);
  return policy?.blocksProjectOpen ?? false;
}

export function isProjectSearchProviderCapabilities(
  value: unknown,
): value is ProjectSearchProviderCapabilities {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['providerId']) &&
    optionalBoolean(value['semantic']) &&
    optionalBoolean(value['vector']) &&
    optionalBoolean(value['rag']) &&
    optionalProjectSearchModes(value['modes']) &&
    optionalProjectSearchKinds(value['itemKinds']) &&
    optionalProjectSearchPartitions(value['partitions'])
  );
}

export function isProjectSemanticProviderMetadata(
  value: unknown,
): value is ProjectSemanticProviderMetadata {
  if (!isRecord(value) || typeof value['providerId'] !== 'string') return false;
  return (
    isSafeSemanticCoverageValue(value) &&
    optionalString(value['model']) &&
    optionalString(value['modelVersion']) &&
    optionalString(value['chunkingVersion']) &&
    optionalString(value['sourceIdentity']) &&
    optionalString(value['indexVersion']) &&
    optionalString(value['schemaVersion']) &&
    optionalString(value['skillId']) &&
    optionalString(value['skillVersion'])
  );
}

export function isProjectSearchPartitionStatusSnapshot(
  value: unknown,
): value is ProjectSearchPartitionStatusSnapshot {
  if (!isRecord(value)) return false;
  return (
    isProjectSearchPartitionKind(value['partition']) &&
    isProjectIndexPartitionStatus(value['status']) &&
    isProjectIndexFreshness(value['freshness']) &&
    optionalNumber(value['itemCount']) &&
    optionalNumber(value['generation']) &&
    optionalString(value['updatedAt']) &&
    optionalString(value['error']) &&
    optionalProjectSearchProviderCapabilities(value['provider']) &&
    optionalProjectSemanticProviderMetadata(value['semantic'])
  );
}

export function isProjectSearchQuery(value: unknown): value is ProjectSearchQuery {
  if (!isRecord(value) || typeof value['text'] !== 'string') return false;
  return (
    optionalString(value['contextFilePath']) &&
    optionalString(value['contextUri']) &&
    optionalString(value['projectRoot']) &&
    optionalProjectSearchMode(value['mode']) &&
    optionalProjectSearchKinds(value['kinds']) &&
    optionalProjectSearchPartitions(value['partitions']) &&
    optionalStringArray(value['fileTypes']) &&
    optionalStringArray(value['mediaTypes']) &&
    optionalProjectSearchScopes(value['scopes']) &&
    optionalNumber(value['limit']) &&
    optionalFreshnessPolicy(value['freshness'])
  );
}

export function validateProjectSemanticCoverageQuery(
  value: unknown,
): readonly ContributionDiagnostic[] {
  const diagnostics: ContributionDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      coverageDiagnostic(
        'error',
        'invalid-semantic-coverage-query',
        'Semantic coverage query must be an object.',
      ),
    ];
  }
  if (!isStableSemanticSourceRef(value['sourceRef'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-source-ref',
        'Semantic coverage requires a stable source reference.',
        ['sourceRef'],
      ),
    );
  }
  if (!isProjectSemanticCoverageAnalysisKind(value['analysisKind'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-analysis-kind',
        'Unsupported semantic coverage analysis kind.',
        ['analysisKind'],
        {
          expected: PROJECT_SEMANTIC_COVERAGE_ANALYSIS_KINDS.join(', '),
        },
      ),
    );
  }
  if (value['range'] !== undefined) {
    const rangeValidation = validateMediaTextRangeForSourceRef(value['range'], value['sourceRef']);
    diagnostics.push(
      ...rangeValidation.diagnostics.map((diagnostic) =>
        coverageDiagnostic(
          diagnostic.severity,
          diagnostic.code,
          diagnostic.message,
          ['range', ...diagnostic.path],
          {
            ...(diagnostic.expected ? { expected: diagnostic.expected } : {}),
            ...(diagnostic.actual !== undefined ? { actual: diagnostic.actual } : {}),
            ...(diagnostic.details ? { details: diagnostic.details } : {}),
          },
        ),
      ),
    );
  }
  for (const field of [
    'skillId',
    'skillVersion',
    'providerId',
    'schemaVersion',
    'projectRoot',
    'contextFilePath',
    'contextUri',
  ] as const) {
    if (!optionalString(value[field])) {
      diagnostics.push(
        coverageDiagnostic(
          'error',
          'invalid-required-field',
          `${field} must be a string when provided.`,
          [field],
        ),
      );
    }
  }
  if (!isSafeSemanticCoverageValue(value)) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'unsafe-runtime-handle',
        'Semantic coverage query cannot expose cache paths or runtime handles.',
      ),
    );
  }
  return diagnostics;
}

export function validateProjectSemanticCoverageResult(
  value: unknown,
): readonly ContributionDiagnostic[] {
  const diagnostics: ContributionDiagnostic[] = [];
  if (!isRecord(value)) {
    return [
      coverageDiagnostic(
        'error',
        'invalid-semantic-coverage-result',
        'Semantic coverage result must be an object.',
      ),
    ];
  }
  diagnostics.push(...validateProjectSemanticCoverageQuery(value['query']));
  if (!isProjectSemanticCoverageStatus(value['coverage'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-coverage-status',
        'Unsupported semantic coverage status.',
        ['coverage'],
      ),
    );
  }
  if (!isProjectIndexFreshness(value['freshness'])) {
    diagnostics.push(
      coverageDiagnostic('error', 'invalid-freshness', 'Unsupported freshness value.', [
        'freshness',
      ]),
    );
  }
  if (!optionalCoverageMatchedRanges(value['matchedRanges'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-matched-ranges',
        'Semantic coverage matched ranges must use shared DTOs.',
        ['matchedRanges'],
      ),
    );
  }
  if (!optionalCoverageStaleReasons(value['staleReasons'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-stale-reason',
        'Semantic coverage stale reasons must use shared codes.',
        ['staleReasons'],
      ),
    );
  }
  if (!optionalContributionDiagnostics(value['diagnostics'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-diagnostics',
        'Semantic coverage diagnostics must be serializable contribution diagnostics.',
        ['diagnostics'],
      ),
    );
  }
  if (!optionalProjectSemanticProviderMetadata(value['provider'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-provider',
        'Semantic coverage provider metadata is invalid.',
        ['provider'],
      ),
    );
  }
  if (!optionalString(value['projectRoot']) || !optionalNumber(value['generation'])) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'invalid-required-field',
        'Semantic coverage projectRoot and generation must use shared DTO shapes.',
      ),
    );
  }
  if (!isSafeSemanticCoverageValue(value)) {
    diagnostics.push(
      coverageDiagnostic(
        'error',
        'unsafe-runtime-handle',
        'Semantic coverage result cannot expose cache paths or runtime handles.',
      ),
    );
  }
  return diagnostics;
}

export function isProjectSemanticCoverageQuery(
  value: unknown,
): value is ProjectSemanticCoverageQuery {
  return validateProjectSemanticCoverageQuery(value).every(
    (diagnostic) => diagnostic.severity !== 'error',
  );
}

export function isProjectSemanticCoverageResult(
  value: unknown,
): value is ProjectSemanticCoverageResult {
  return validateProjectSemanticCoverageResult(value).every(
    (diagnostic) => diagnostic.severity !== 'error',
  );
}

export function isProjectSearchItem(value: unknown): value is ProjectSearchItem {
  if (!isRecord(value) || !isRecord(value['source'])) return false;
  return (
    typeof value['id'] === 'string' &&
    isProjectSearchItemKind(value['kind']) &&
    typeof value['label'] === 'string' &&
    isProjectSearchPartitionKind(value['source']['partition']) &&
    typeof value['projectRoot'] === 'string' &&
    typeof value['searchText'] === 'string' &&
    isProjectIndexFreshness(value['freshness']) &&
    optionalProjectSearchVisualResource(value['visualResource'])
  );
}

export function projectMediaSemanticIndexToSearchItems(
  input: ProjectSemanticEvidenceSearchProjectionInput,
): readonly ProjectSearchItem[] {
  return (input.index.textSegments ?? []).map((segment) =>
    projectMediaTextSegmentToSearchItem(
      input.projectRoot,
      input.index,
      segment,
      input.freshness ?? 'fresh',
    ),
  );
}

export function projectCharacterObservationToSearchItem(
  input: ProjectCharacterMemorySearchProjectionInput,
): ProjectSearchItem {
  const observation = input.observation;
  const label =
    observation.entityRef?.entityId ??
    observation.candidate?.name ??
    observation.mention?.text ??
    observation.candidateId ??
    observation.observationId;
  const traitText = observation.dimensions
    .map((dimension) => `${dimension.dimension} ${stringifySearchValue(dimension.value)}`)
    .join(' ');
  return {
    id: `character-memory:${observation.observationId}`,
    kind: 'character-memory-evidence',
    label,
    description: observation.provenance.source,
    source: {
      partition: 'character-memory',
      sourceKind: observation.provenance.source,
      semanticSourceKind: observation.provenance.source,
      observationId: observation.observationId,
      evidenceId: observation.observationId,
      confidence: observation.confidence,
      metadata: {
        reviewStatus: observation.reviewStatus,
        sourceRef: observation.sourceRef,
      },
    },
    projectRoot: input.projectRoot,
    searchText: `${label} ${traitText}`.trim(),
    freshness: input.freshness ?? 'fresh',
  };
}

export function isProjectSearchCacheManifest(value: unknown): value is ProjectSearchCacheManifest {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    typeof value['projectRoot'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    typeof value['generation'] === 'number' &&
    optionalString(value['sourceIdentity']) &&
    Array.isArray(value['partitions']) &&
    value['partitions'].every((partition) => isProjectSearchCachePartitionManifest(partition))
  );
}

function isProjectSearchCachePartitionManifest(
  value: unknown,
): value is ProjectSearchCachePartitionManifest {
  if (!isRecord(value)) return false;
  return (
    isProjectSearchPartitionKind(value['partition']) &&
    typeof value['version'] === 'number' &&
    typeof value['generation'] === 'number' &&
    isProjectIndexFreshness(value['freshness']) &&
    typeof value['itemCount'] === 'number' &&
    optionalString(value['sourceIdentity']) &&
    typeof value['updatedAt'] === 'string'
  );
}

function projectMediaTextSegmentToSearchItem(
  projectRoot: string,
  index: MediaSemanticIndex,
  segment: MediaTextSegment,
  freshness: ProjectIndexFreshness,
): ProjectSearchItem {
  return {
    id: `semantic-evidence:${index.assetId}:${segment.segmentId}`,
    kind: 'semantic-evidence',
    label: segment.text,
    description: `${segment.kind} ${segment.provenance.sourceKind}`,
    source: {
      partition: 'semantic-evidence',
      sourceKind: segment.provenance.sourceKind,
      semanticSourceKind: segment.provenance.sourceKind,
      textKind: segment.kind,
      assetId: index.assetId,
      segmentId: segment.segmentId,
      evidenceId: segment.segmentId,
      confidence: segment.confidence,
      metadata: {
        sourceRef: segment.sourceRef,
        range: segment.range,
      },
    },
    projectRoot,
    searchText: `${segment.text} ${segment.kind} ${segment.provenance.sourceKind}`.trim(),
    freshness,
  };
}

function stringifySearchValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function optionalProjectSearchKinds(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchItemKind(item)))
  );
}

function optionalProjectSearchPartitions(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchPartitionKind(item)))
  );
}

function optionalProjectSearchMode(value: unknown): boolean {
  return value === undefined || isProjectSearchMode(value);
}

function optionalProjectSearchModes(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchMode(item)))
  );
}

function optionalProjectSearchScopes(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchScope(item)))
  );
}

function optionalProjectSearchProviderCapabilities(value: unknown): boolean {
  return value === undefined || isProjectSearchProviderCapabilities(value);
}

function optionalProjectSearchVisualResource(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return (
    (value['resource'] === undefined || isResourceVariantRef(value['resource'])) &&
    optionalString(value['projectedUri']) &&
    (value['status'] === undefined || isResourceCacheStatus(value['status'])) &&
    optionalString(value['alt'])
  );
}

function optionalProjectSemanticProviderMetadata(value: unknown): boolean {
  return value === undefined || isProjectSemanticProviderMetadata(value);
}

function optionalCoverageMatchedRanges(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSemanticCoverageMatchedRange(item)))
  );
}

function isProjectSemanticCoverageMatchedRange(
  value: unknown,
): value is ProjectSemanticCoverageMatchedRange {
  if (!isRecord(value)) return false;
  return (
    isProjectSemanticCoverageStatus(value['coverage']) &&
    isProjectIndexFreshness(value['freshness']) &&
    (value['range'] === undefined ||
      validateMediaTextRangeForSourceRef(value['range'], value['sourceRef']).ok) &&
    (value['sourceRef'] === undefined || isStableSemanticSourceRef(value['sourceRef'])) &&
    optionalStringArray(value['evidenceIds']) &&
    optionalStringArray(value['segmentIds']) &&
    optionalStringArray(value['observationIds']) &&
    optionalProjectSemanticProviderMetadata(value['provider']) &&
    optionalCoverageStaleReasons(value['staleReasons']) &&
    optionalContributionDiagnostics(value['diagnostics']) &&
    isSafeSemanticCoverageValue(value)
  );
}

function optionalCoverageStaleReasons(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSemanticCoverageStaleReason(item)))
  );
}

function optionalContributionDiagnostics(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isContributionDiagnosticLike(item)))
  );
}

function isContributionDiagnosticLike(value: unknown): value is ContributionDiagnostic {
  if (!isRecord(value)) return false;
  return (
    isDiagnosticSeverity(value['severity']) &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    (value['path'] === undefined ||
      (Array.isArray(value['path']) &&
        value['path'].every(
          (segment) => typeof segment === 'string' || typeof segment === 'number',
        ))) &&
    (value['sourceRef'] === undefined || isRecord(value['sourceRef'])) &&
    optionalJsonRecord(value['details']) &&
    isSafeSemanticCoverageValue(value)
  );
}

function isDiagnosticSeverity(value: unknown): value is ContributionDiagnostic['severity'] {
  return value === 'error' || value === 'warning' || value === 'info' || value === 'suggestion';
}

function isProjectSearchScope(value: unknown): value is ProjectSearchScope {
  return (
    isRecord(value) &&
    isProjectSearchScopeKind(value['kind']) &&
    optionalString(value['id']) &&
    optionalString(value['filePath']) &&
    optionalString(value['uri'])
  );
}

function optionalFreshnessPolicy(value: unknown): boolean {
  return value === undefined || value === 'allow-stale' || value === 'fresh-only';
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalStringArray(value: unknown): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function optionalJsonRecord(value: unknown): boolean {
  return value === undefined || (isRecord(value) && isJsonValue(value));
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isStableSemanticSourceRef(value: unknown): value is MediaSemanticSourceRef {
  if (!isContentSourceRef(value)) return false;
  return !isCacheOrRuntimeSemanticSourceRef(value);
}

function isCacheOrRuntimeSemanticSourceRef(ref: ContentSourceRef): boolean {
  if (ref.kind === 'runtime') return true;
  if (isResourceRef(ref) && ref.scope === 'extension-private') return true;
  return !isSafeSemanticCoverageValue(ref);
}

function isSafeSemanticCoverageValue(value: unknown): boolean {
  if (!isJsonValue(value)) return false;
  return findUnsafeSemanticCoverageValue(value) === undefined;
}

function findUnsafeSemanticCoverageValue(value: JsonValue): string | undefined {
  if (typeof value === 'string') {
    return isUnsafeSemanticCoverageString(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const unsafe = findUnsafeSemanticCoverageValue(item);
      if (unsafe) return unsafe;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const unsafe = findUnsafeSemanticCoverageValue(item);
      if (unsafe) return unsafe;
    }
  }
  return undefined;
}

function isUnsafeSemanticCoverageString(value: string): boolean {
  const trimmed = value.trim();
  return (
    isWebviewLikeRuntimeValue(trimmed) ||
    trimmed.startsWith('vscode-webview://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('sqlite://') ||
    trimmed.startsWith('fts://') ||
    trimmed.startsWith('vector://') ||
    trimmed.startsWith('scratch://') ||
    trimmed.startsWith('data:') ||
    trimmed.includes('/.neko/.cache') ||
    trimmed.includes('\\.neko\\.cache') ||
    trimmed.includes('/.neko/semantic-index') ||
    trimmed.includes('\\.neko\\semantic-index') ||
    trimmed.includes('.sqlite') ||
    trimmed.includes('.db') ||
    trimmed.includes('vector-store') ||
    trimmed.includes('fts-index') ||
    trimmed.includes('provider-private')
  );
}

function coverageDiagnostic(
  severity: ContributionDiagnostic['severity'],
  code: string,
  message: string,
  path: readonly (string | number)[] = [],
  details?: Record<string, string | number | boolean | null | readonly JsonValue[] | JsonRecord>,
): ContributionDiagnostic {
  return {
    severity,
    code,
    message,
    ...(path.length > 0 ? { path } : {}),
    ...(details ? { details } : {}),
  };
}

type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonRecord;

type JsonRecord = {
  readonly [key: string]: JsonValue;
};

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
