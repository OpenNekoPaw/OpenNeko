import * as path from 'path';
import * as vscode from 'vscode';
import {
  validateCharacterMemoryFile,
  type CharacterMemoryFile,
  type CharacterMemorySourceRef,
  type ContributionDiagnostic,
  type MediaSemanticIndex,
  type MediaTextRange,
  type LocalMetadataPartition,
  type ProjectIndexFreshness,
  type ProjectSearchQueryContext,
  type ProjectSemanticCoverageMatchedRange,
  type ProjectSemanticCoverageQuery,
  type ProjectSemanticCoverageResult,
  type ProjectSemanticCoverageStaleReason,
  type ProjectSemanticCoverageStatus,
  type ProjectSemanticProviderMetadata,
  type SemanticProjectionRepository,
  type SemanticEvidenceProjection,
} from '@neko/shared';
import type { ProjectSearchLogger, ProjectSemanticCoverageProvider } from '../core/ports';

const PROVIDER_ID = 'neko-search.semantic-coverage';
const PROVIDER_SCHEMA_VERSION = '1';
const PROVIDER_INDEX_VERSION = 'semantic-coverage-v1';
export interface VSCodeSemanticCoverageProviderOptions {
  readonly logger?: ProjectSearchLogger;
  readonly readTextFile?: (filePath: string) => Promise<string | undefined>;
  readonly resolveCharacterMemoryPath?: (projectRoot: string) => string;
  readonly semanticProjection?: {
    readonly repository: SemanticProjectionRepository;
    readonly partition: LocalMetadataPartition;
  };
}

interface CoverageEvidence {
  readonly range?: MediaTextRange;
  readonly segmentIds?: readonly string[];
  readonly evidenceIds?: readonly string[];
  readonly observationIds?: readonly string[];
  readonly provider?: ProjectSemanticProviderMetadata;
  readonly staleReasons?: readonly ProjectSemanticCoverageStaleReason[];
}

export function createVSCodeSemanticCoverageProvider(
  options: VSCodeSemanticCoverageProviderOptions = {},
): ProjectSemanticCoverageProvider {
  return new VSCodeSemanticCoverageProvider({
    readTextFile: options.readTextFile ?? readVSCodeTextFile,
    resolveCharacterMemoryPath: options.resolveCharacterMemoryPath ?? resolveCharacterMemoryPath,
    semanticProjection: options.semanticProjection,
    logger: options.logger,
  });
}

class VSCodeSemanticCoverageProvider implements ProjectSemanticCoverageProvider {
  readonly providerId = PROVIDER_ID;

  constructor(
    private readonly options: Required<
      Pick<VSCodeSemanticCoverageProviderOptions, 'readTextFile' | 'resolveCharacterMemoryPath'>
    > & {
      readonly logger?: ProjectSearchLogger;
      readonly semanticProjection?: VSCodeSemanticCoverageProviderOptions['semanticProjection'];
    },
  ) {}

  async querySemanticCoverage(
    query: ProjectSemanticCoverageQuery,
    context: ProjectSearchQueryContext,
  ): Promise<ProjectSemanticCoverageResult> {
    const projectRoot = query.projectRoot ?? context.projectRoot;
    if (!projectRoot) {
      return failedResult(query, 'semantic-coverage-missing-project-root', ['missing-provider']);
    }

    const diagnostics: ContributionDiagnostic[] = [];
    const evidence = [
      ...(await this.loadSemanticIndexEvidence(query, diagnostics)),
      ...(await this.loadCharacterMemoryEvidence(projectRoot, query, diagnostics)),
    ];

    return coverageResultFromEvidence(query, projectRoot, evidence, diagnostics);
  }

  private async loadSemanticIndexEvidence(
    query: ProjectSemanticCoverageQuery,
    diagnostics: ContributionDiagnostic[],
  ): Promise<readonly CoverageEvidence[]> {
    const projection = this.options.semanticProjection;
    if (!projection) {
      diagnostics.push(providerDiagnostic('warning', 'semantic-coverage-projection-unavailable'));
      return [];
    }
    try {
      const records = await projection.repository.list(projection.partition);
      return records.flatMap((record) => {
        if (!stableSourceRefsMatch(query.sourceRef, record.index.sourceRef)) return [];
        const staleReasons: readonly ProjectSemanticCoverageStaleReason[] | undefined =
          record.freshness === 'fresh' ? undefined : ['index-stale'];
        return semanticIndexEvidence(record.index, record.evidence, query).map((item) => ({
          ...item,
          provider: {
            ...record.provider,
            ...(item.provider?.model ? { model: item.provider.model } : {}),
          },
          ...(staleReasons ? { staleReasons } : {}),
        }));
      });
    } catch (error) {
      diagnostics.push(providerDiagnostic('warning', 'semantic-coverage-projection-read-failed'));
      this.options.logger?.warn('Semantic coverage projection read failed', {
        error: formatUnknownError(error),
      });
      return [];
    }
  }

  private async loadCharacterMemoryEvidence(
    projectRoot: string,
    query: ProjectSemanticCoverageQuery,
    diagnostics: ContributionDiagnostic[],
  ): Promise<readonly CoverageEvidence[]> {
    if (query.analysisKind !== 'character-observation' && query.analysisKind !== 'entity-mention') {
      return [];
    }

    const content = await this.readOptionalTextFile(
      this.options.resolveCharacterMemoryPath(projectRoot),
    );
    if (!content) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      diagnostics.push(providerDiagnostic('warning', 'semantic-coverage-invalid-character-memory'));
      return [];
    }

    const validation = validateCharacterMemoryFile(parsed);
    if (!validation.ok || !isCharacterMemoryFileLike(parsed)) {
      diagnostics.push(providerDiagnostic('warning', 'semantic-coverage-invalid-character-memory'));
      return [];
    }

    return parsed.ledger.observations.flatMap((observation) => {
      if (!sourceRefMatchesEvidenceRef(query.sourceRef, observation.sourceRef)) return [];
      if (query.analysisKind === 'entity-mention' && !observation.mention) return [];
      return [
        {
          range: observation.mention?.range ?? readEvidenceRange(observation.sourceRef),
          observationIds: [observation.observationId],
          evidenceIds: [observation.observationId],
          provider: providerMetadata(query),
        },
      ];
    });
  }

  private async readOptionalTextFile(filePath: string): Promise<string | undefined> {
    try {
      return await this.options.readTextFile(filePath);
    } catch {
      return undefined;
    }
  }
}

function semanticIndexEvidence(
  index: MediaSemanticIndex,
  evidence: readonly SemanticEvidenceProjection[],
  query: ProjectSemanticCoverageQuery,
): readonly CoverageEvidence[] {
  switch (query.analysisKind) {
    case 'ocr':
    case 'asr':
    case 'subtitle':
      return compactEvidence(evidence, query, (item) => item.kind === query.analysisKind);
    case 'vision':
      return [
        ...compactEvidence(
          evidence,
          query,
          (item) => item.kind === 'caption' || item.kind === 'agent',
        ),
        ...(index.semanticTags ?? []).map((tag) => ({
          range: tag.sourceRef ? readEvidenceRange(tag.sourceRef) : undefined,
          evidenceIds: [tag.tagId],
          provider: providerMetadata(query),
        })),
      ];
    case 'entity-mention':
      return [
        ...(index.entityMentions ?? []).map((mention) => ({
          range:
            mention.range ?? (mention.sourceRef ? readEvidenceRange(mention.sourceRef) : undefined),
          evidenceIds: [mention.mentionId],
          provider: providerMetadata(query),
        })),
        ...compactEvidence(evidence, query, (item) => (item.entityMentionIds?.length ?? 0) > 0),
      ];
    case 'storyboard':
      return compactEvidence(
        evidence,
        query,
        (item) =>
          item.kind === 'agent' && readString(item.metadata?.['artifactKind']) === 'storyboard',
      );
    case 'character-observation':
      return [];
  }
}

function compactEvidence(
  evidence: readonly SemanticEvidenceProjection[],
  query: ProjectSemanticCoverageQuery,
  predicate: (item: SemanticEvidenceProjection) => boolean,
): readonly CoverageEvidence[] {
  return evidence.filter(predicate).map((item) => ({
    range: item.range ?? readEvidenceRange(item.sourceRef),
    segmentIds: [item.evidenceId],
    evidenceIds: [item.evidenceId],
    provider: providerMetadata(query, item.provenance.providerId),
  }));
}

function coverageResultFromEvidence(
  query: ProjectSemanticCoverageQuery,
  projectRoot: string,
  evidence: readonly CoverageEvidence[],
  diagnostics: readonly ContributionDiagnostic[],
): ProjectSemanticCoverageResult {
  const matched = evidence.filter((item) => rangeMatchesQuery(query.range, item.range));
  const schemaReasons = schemaStaleReasons(query);
  const staleReasons = uniqueStaleReasons([
    ...schemaReasons,
    ...matched.flatMap((item) => item.staleReasons ?? []),
  ]);
  const evidenceStatus = staleReasons.length > 0 ? 'stale' : 'fresh';
  const evidenceFreshness = staleReasons.length > 0 ? 'stale' : 'fresh';
  const matchedRanges = matched.map((item) => {
    const itemStaleReasons = uniqueStaleReasons([...schemaReasons, ...(item.staleReasons ?? [])]);
    return matchedRangeFromEvidence(
      item,
      itemStaleReasons.length > 0 ? 'stale' : 'fresh',
      itemStaleReasons.length > 0 ? 'stale' : 'fresh',
      itemStaleReasons,
    );
  });
  const missingRanges = missingRangesForQuery(query.range, matched);

  if (matchedRanges.length === 0) {
    return {
      query,
      coverage: 'missing',
      freshness: 'stale',
      staleReasons: ['range-partial'],
      diagnostics: [
        ...diagnostics,
        providerDiagnostic('info', 'semantic-coverage-missing-evidence'),
      ],
      provider: providerMetadata(query),
      projectRoot,
    };
  }

  const hasMissingRange = missingRanges.length > 0;
  return {
    query,
    coverage: hasMissingRange ? 'partial' : evidenceStatus,
    freshness: hasMissingRange ? 'partial' : evidenceFreshness,
    matchedRanges: [
      ...matchedRanges,
      ...missingRanges.map((range) => ({
        range,
        coverage: 'missing' as const,
        freshness: 'stale' as const,
        staleReasons: ['range-partial' as const],
        diagnostics: [providerDiagnostic('info', 'semantic-coverage-missing-range')],
      })),
    ],
    ...(hasMissingRange || staleReasons.length > 0
      ? {
          staleReasons: uniqueStaleReasons([
            ...staleReasons,
            ...(hasMissingRange ? (['range-partial'] as const) : []),
          ]),
        }
      : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    provider: matched[0]?.provider ?? providerMetadata(query),
    projectRoot,
  };
}

function matchedRangeFromEvidence(
  evidence: CoverageEvidence,
  coverage: ProjectSemanticCoverageStatus,
  freshness: ProjectIndexFreshness,
  staleReasons: readonly ProjectSemanticCoverageStaleReason[],
): ProjectSemanticCoverageMatchedRange {
  return {
    ...(evidence.range ? { range: evidence.range } : {}),
    coverage,
    freshness,
    ...(evidence.segmentIds ? { segmentIds: evidence.segmentIds } : {}),
    ...(evidence.evidenceIds ? { evidenceIds: evidence.evidenceIds } : {}),
    ...(evidence.observationIds ? { observationIds: evidence.observationIds } : {}),
    ...(evidence.provider ? { provider: evidence.provider } : {}),
    ...(staleReasons.length > 0 ? { staleReasons } : {}),
  };
}

function missingRangesForQuery(
  queryRange: MediaTextRange | undefined,
  matched: readonly CoverageEvidence[],
): readonly MediaTextRange[] {
  if (!queryRange || matched.some((item) => rangeCoversQuery(queryRange, item.range))) {
    return [];
  }
  const lineGaps = subtractNumericRanges(
    queryRange,
    matched.map((item) => item.range),
    'startLine',
    'endLine',
  );
  if (lineGaps) return lineGaps;
  const timeGaps = subtractNumericRanges(
    queryRange,
    matched.map((item) => item.range),
    'startMs',
    'endMs',
  );
  if (timeGaps) return timeGaps;
  const frameGaps = subtractNumericRanges(
    queryRange,
    matched.map((item) => item.range),
    'frameStart',
    'frameEnd',
  );
  if (frameGaps) return frameGaps;
  return matched.length > 0 ? [queryRange] : [];
}

function subtractNumericRanges(
  queryRange: MediaTextRange,
  evidenceRanges: readonly (MediaTextRange | undefined)[],
  startKey: 'startLine' | 'startMs' | 'frameStart',
  endKey: 'endLine' | 'endMs' | 'frameEnd',
): readonly MediaTextRange[] | undefined {
  const queryStart = queryRange[startKey];
  const queryEnd = queryRange[endKey];
  if (typeof queryStart !== 'number' || typeof queryEnd !== 'number') return undefined;

  const intervals = evidenceRanges
    .flatMap((range) => {
      const start = range?.[startKey];
      const end = range?.[endKey] ?? start;
      if (typeof start !== 'number' || typeof end !== 'number') return [];
      if (!exactRangeFieldsMatch(queryRange, range)) return [];
      return [{ start: Math.max(queryStart, start), end: Math.min(queryEnd, end) }];
    })
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.start - b.start);

  const gaps: MediaTextRange[] = [];
  let cursor = queryStart;
  for (const interval of intervals) {
    if (interval.start > cursor) {
      gaps.push({ ...queryRange, [startKey]: cursor, [endKey]: interval.start - 1 });
    }
    cursor = Math.max(cursor, interval.end + 1);
  }
  if (cursor <= queryEnd) {
    gaps.push({ ...queryRange, [startKey]: cursor, [endKey]: queryEnd });
  }
  return gaps;
}

function rangeMatchesQuery(
  queryRange: MediaTextRange | undefined,
  evidenceRange: MediaTextRange | undefined,
): boolean {
  if (!queryRange) return true;
  if (!evidenceRange) return false;
  if (!exactRangeFieldsMatch(queryRange, evidenceRange)) return false;
  return (
    intervalFieldsOverlap(queryRange, evidenceRange, 'startLine', 'endLine') &&
    intervalFieldsOverlap(queryRange, evidenceRange, 'startMs', 'endMs') &&
    intervalFieldsOverlap(queryRange, evidenceRange, 'frameStart', 'frameEnd')
  );
}

function rangeCoversQuery(
  queryRange: MediaTextRange,
  evidenceRange: MediaTextRange | undefined,
): boolean {
  if (!evidenceRange || !exactRangeFieldsMatch(queryRange, evidenceRange)) return false;
  return (
    intervalFieldsCover(queryRange, evidenceRange, 'startLine', 'endLine') &&
    intervalFieldsCover(queryRange, evidenceRange, 'startMs', 'endMs') &&
    intervalFieldsCover(queryRange, evidenceRange, 'frameStart', 'frameEnd') &&
    !isNarrowerPanelRange(queryRange, evidenceRange)
  );
}

function exactRangeFieldsMatch(
  queryRange: MediaTextRange,
  evidenceRange: MediaTextRange | undefined,
): boolean {
  if (!evidenceRange) return false;
  for (const field of ['sceneId', 'shotId', 'pageId', 'panelId', 'nodeId', 'assetId'] as const) {
    const queryValue = queryRange[field];
    if (queryValue !== undefined && evidenceRange[field] !== queryValue) return false;
  }
  return true;
}

function isNarrowerPanelRange(queryRange: MediaTextRange, evidenceRange: MediaTextRange): boolean {
  return (
    queryRange.pageId !== undefined &&
    queryRange.panelId === undefined &&
    evidenceRange.panelId !== undefined
  );
}

function intervalFieldsOverlap(
  queryRange: MediaTextRange,
  evidenceRange: MediaTextRange,
  startKey: 'startLine' | 'startMs' | 'frameStart',
  endKey: 'endLine' | 'endMs' | 'frameEnd',
): boolean {
  const queryStart = queryRange[startKey];
  const queryEnd = queryRange[endKey] ?? queryStart;
  if (typeof queryStart !== 'number') return true;
  const evidenceStart = evidenceRange[startKey];
  const evidenceEnd = evidenceRange[endKey] ?? evidenceStart;
  if (typeof evidenceStart !== 'number' || typeof evidenceEnd !== 'number') return false;
  return evidenceStart <= (queryEnd ?? queryStart) && evidenceEnd >= queryStart;
}

function intervalFieldsCover(
  queryRange: MediaTextRange,
  evidenceRange: MediaTextRange,
  startKey: 'startLine' | 'startMs' | 'frameStart',
  endKey: 'endLine' | 'endMs' | 'frameEnd',
): boolean {
  const queryStart = queryRange[startKey];
  const queryEnd = queryRange[endKey] ?? queryStart;
  if (typeof queryStart !== 'number') return true;
  const evidenceStart = evidenceRange[startKey];
  const evidenceEnd = evidenceRange[endKey] ?? evidenceStart;
  if (typeof evidenceStart !== 'number' || typeof evidenceEnd !== 'number') return false;
  return evidenceStart <= queryStart && evidenceEnd >= (queryEnd ?? queryStart);
}

function readEvidenceRange(sourceRef: CharacterMemorySourceRef): MediaTextRange | undefined {
  if ('range' in sourceRef) return sourceRef.range;
  return undefined;
}

function stableSourceRefsMatch(left: unknown, right: unknown): boolean {
  return sourceKey(left) === sourceKey(right);
}

function sourceRefMatchesEvidenceRef(
  stableSourceRef: unknown,
  evidenceRef: CharacterMemorySourceRef,
): boolean {
  if (
    isRecord(stableSourceRef) &&
    stableSourceRef['kind'] === 'document' &&
    evidenceRef.kind === 'document'
  ) {
    return (
      documentSourceIdentity(stableSourceRef['source']) ===
      documentSourceIdentity(evidenceRef.source)
    );
  }
  if (
    isRecord(stableSourceRef) &&
    stableSourceRef['kind'] === 'generated-asset' &&
    evidenceRef.kind === 'generated-asset'
  ) {
    return stableSourceRef['assetId'] === evidenceRef.assetId;
  }
  return false;
}

function sourceKey(sourceRef: unknown): string {
  if (!isRecord(sourceRef)) return '';
  const kind = readString(sourceRef['kind']);
  if (kind === 'asset') return `asset:${readString(sourceRef['assetId']) ?? ''}`;
  if (kind === 'generated-asset')
    return `generated-asset:${readString(sourceRef['assetId']) ?? ''}`;
  if (kind === 'media-library') {
    return [
      'media-library',
      readString(sourceRef['libraryId']) ?? '',
      readString(sourceRef['path']) ?? '',
    ].join(':');
  }
  if (kind === 'file') return `file:${readString(sourceRef['path']) ?? ''}`;
  if (kind === 'document') {
    return [
      'document',
      documentSourceIdentity(sourceRef['source']),
      readString(sourceRef['entryPath']) ?? '',
    ].join(':');
  }
  return `${kind}:${stableStringify(sourceRef)}`;
}

function documentSourceIdentity(source: unknown): string {
  if (!isRecord(source)) return stableStringify(source);
  const nestedDocument = source['document'];
  if (isRecord(nestedDocument)) {
    return documentSourceIdentity(nestedDocument);
  }
  const sourcePath =
    readString(source['projectRelativePath']) ??
    readString(source['filePath']) ??
    readString(source['uri']) ??
    readString(source['path']) ??
    stableStringify(source);
  return normalizePortablePath(sourcePath);
}

function normalizePortablePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^file:\/\//, '');
}

function schemaStaleReasons(
  query: ProjectSemanticCoverageQuery,
): readonly ProjectSemanticCoverageStaleReason[] {
  return query.schemaVersion && query.schemaVersion !== PROVIDER_SCHEMA_VERSION
    ? ['schema-version']
    : [];
}

function providerMetadata(
  query: ProjectSemanticCoverageQuery,
  modelProviderId?: string,
): ProjectSemanticProviderMetadata {
  return {
    providerId: PROVIDER_ID,
    ...(modelProviderId ? { model: modelProviderId } : {}),
    sourceIdentity: sourceKey(query.sourceRef),
    indexVersion: PROVIDER_INDEX_VERSION,
    schemaVersion: PROVIDER_SCHEMA_VERSION,
    ...(query.skillId ? { skillId: query.skillId } : {}),
    ...(query.skillVersion ? { skillVersion: query.skillVersion } : {}),
  };
}

function failedResult(
  query: ProjectSemanticCoverageQuery,
  code: string,
  staleReasons: readonly ProjectSemanticCoverageStaleReason[],
): ProjectSemanticCoverageResult {
  return {
    query,
    coverage: 'failed',
    freshness: 'failed',
    staleReasons,
    diagnostics: [providerDiagnostic('warning', code)],
    provider: providerMetadata(query),
  };
}

function providerDiagnostic(
  severity: ContributionDiagnostic['severity'],
  code: string,
): ContributionDiagnostic {
  return {
    severity,
    code,
    message: semanticCoverageDiagnosticMessage(code),
  };
}

function semanticCoverageDiagnosticMessage(code: string): string {
  switch (code) {
    case 'semantic-coverage-missing-project-root':
      return 'Semantic coverage requires a resolved project context.';
    case 'semantic-coverage-projection-unavailable':
      return 'Semantic coverage SQLite projection is unavailable.';
    case 'semantic-coverage-projection-read-failed':
      return 'Semantic coverage SQLite projection could not be read.';
    case 'semantic-coverage-index-discovery-failed':
      return 'Semantic coverage provider could not discover semantic index records.';
    case 'semantic-coverage-invalid-index-record':
      return 'Semantic coverage provider ignored an invalid semantic index record.';
    case 'semantic-coverage-invalid-character-memory':
      return 'Semantic coverage provider ignored an invalid character memory record.';
    case 'semantic-coverage-read-failed':
      return 'Semantic coverage provider could not read a semantic evidence record.';
    case 'semantic-coverage-missing-range':
      return 'The requested range still needs normal tool analysis.';
    case 'semantic-coverage-missing-evidence':
      return 'No reusable semantic evidence was found for the requested source and range.';
    default:
      return 'Semantic coverage provider reported a diagnostic.';
  }
}

function uniqueStaleReasons(
  values: readonly ProjectSemanticCoverageStaleReason[],
): readonly ProjectSemanticCoverageStaleReason[] {
  return [...new Set(values)];
}

async function readVSCodeTextFile(filePath: string): Promise<string | undefined> {
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return new TextDecoder().decode(raw);
}

function resolveCharacterMemoryPath(projectRoot: string): string {
  return path.join(projectRoot, 'neko', 'character-memory.json');
}

function isCharacterMemoryFileLike(value: unknown): value is CharacterMemoryFile {
  return (
    isRecord(value) && isRecord(value['ledger']) && Array.isArray(value['ledger']['observations'])
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
