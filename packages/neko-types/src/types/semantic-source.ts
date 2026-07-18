import type { CharacterMemorySourceRange, EntityMention } from './character-memory';
import type {
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityKind,
  CreativeEntityOccurrenceProjection,
} from './creative-entity-asset-composition';
import type { MediaSemanticIndex } from './media-semantic-index';

export const SEMANTIC_SOURCE_ANALYSIS_MODES = [
  'off',
  'link-existing',
  'discover-candidates',
] as const;

export const SEMANTIC_SOURCE_FORMATS = ['markdown', 'plain', 'fountain', 'json', 'yaml'] as const;

export const SEMANTIC_SOURCE_ROOT_KINDS = ['workspace', 'media-library'] as const;

export const SEMANTIC_TEXT_SEGMENT_KINDS = [
  'heading',
  'paragraph',
  'list-item',
  'table-cell',
  'plain',
  'fountain-scene',
  'fountain-character',
  'fountain-dialogue',
  'fountain-action',
  'structured-string',
] as const;

export const AUTOMATIC_ENTITY_CANDIDATE_REVIEW_STATUSES = [
  'observed',
  'matched',
  'suggested',
  'ambiguous',
] as const;

export type SemanticSourceAnalysisMode = (typeof SEMANTIC_SOURCE_ANALYSIS_MODES)[number];
export type SemanticSourceFormat = (typeof SEMANTIC_SOURCE_FORMATS)[number];
export type SemanticSourceRootKind = (typeof SEMANTIC_SOURCE_ROOT_KINDS)[number];
export type SemanticTextSegmentKind = (typeof SEMANTIC_TEXT_SEGMENT_KINDS)[number];
export type AutomaticEntityCandidateReviewStatus =
  (typeof AUTOMATIC_ENTITY_CANDIDATE_REVIEW_STATUSES)[number];

export interface SemanticSourceScope {
  readonly workspaceId: string;
  readonly rootId: string;
  readonly rootKind: SemanticSourceRootKind;
  readonly portableRoot: string;
  readonly analysisMode: SemanticSourceAnalysisMode;
  readonly priority: number;
}

export interface SemanticSourceDescriptor {
  readonly sourceId: string;
  readonly workspaceId: string;
  readonly rootId: string;
  readonly rootKind: SemanticSourceRootKind;
  readonly relativePath: string;
  readonly portablePath: string;
  readonly format: SemanticSourceFormat;
  readonly analysisMode: SemanticSourceAnalysisMode;
  readonly fingerprint: string;
  readonly sizeBytes: number;
  readonly modifiedAtMs: number;
}

export interface SemanticTextSegment {
  readonly segmentId: string;
  readonly kind: SemanticTextSegmentKind;
  readonly text: string;
  readonly range: CharacterMemorySourceRange & {
    readonly startOffset: number;
    readonly endOffset: number;
    readonly startColumn?: number;
    readonly endColumn?: number;
    readonly structuredPath?: readonly (string | number)[];
  };
  readonly explicitEntityKind?: CreativeEntityKind;
  readonly explicitEntityName?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SemanticSourceDiagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly sourceId?: string;
  readonly relativePath?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SemanticEntitySnapshot {
  readonly revision: string;
  readonly entities: readonly CreativeEntity[];
}

export interface SemanticSourceAnalysisInput {
  readonly source: SemanticSourceDescriptor;
  readonly segments: readonly SemanticTextSegment[];
  readonly entities: SemanticEntitySnapshot;
  readonly analyzedAt: string;
  readonly signal?: AbortSignal;
}

export interface SemanticSourceAnalysisResult {
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly entityRevision: string;
  readonly index: MediaSemanticIndex;
  readonly mentions: readonly EntityMention[];
  readonly occurrences: readonly CreativeEntityOccurrenceProjection[];
  readonly candidates: readonly CreativeEntityCandidate[];
  readonly diagnostics: readonly SemanticSourceDiagnostic[];
}

export interface SemanticSourceAnalyzer {
  readonly analyzerId: string;
  supports(source: SemanticSourceDescriptor): boolean;
  analyze(input: SemanticSourceAnalysisInput): Promise<SemanticSourceAnalysisResult>;
}

export interface AutomaticEntityCandidateProjectionMetadata {
  readonly projectionKind: 'automatic-entity-candidate';
  readonly normalizedName: string;
  readonly reviewStatus: AutomaticEntityCandidateReviewStatus;
  readonly sourceOccurrenceCount: number;
  readonly explicitStructuralMentionCount: number;
  readonly mentionIds: readonly string[];
  readonly entityRevision: string;
  readonly matchedEntityId?: string;
}

export interface AutomaticEntityCandidateReviewItem {
  readonly candidate: CreativeEntityCandidate;
  readonly reviewStatus: AutomaticEntityCandidateReviewStatus;
  readonly distinctSourceCount: number;
  readonly occurrenceCount: number;
  readonly explicitStructuralMentionCount: number;
  readonly mentionIds: readonly string[];
}

export function isSemanticSourceAnalysisMode(value: unknown): value is SemanticSourceAnalysisMode {
  return includesString(SEMANTIC_SOURCE_ANALYSIS_MODES, value);
}

export function isSemanticSourceFormat(value: unknown): value is SemanticSourceFormat {
  return includesString(SEMANTIC_SOURCE_FORMATS, value);
}

export function isSemanticSourceRootKind(value: unknown): value is SemanticSourceRootKind {
  return includesString(SEMANTIC_SOURCE_ROOT_KINDS, value);
}

export function isSemanticTextSegmentKind(value: unknown): value is SemanticTextSegmentKind {
  return includesString(SEMANTIC_TEXT_SEGMENT_KINDS, value);
}

export function isAutomaticEntityCandidateReviewStatus(
  value: unknown,
): value is AutomaticEntityCandidateReviewStatus {
  return includesString(AUTOMATIC_ENTITY_CANDIDATE_REVIEW_STATUSES, value);
}

export function isSemanticSourceScope(value: unknown): value is SemanticSourceScope {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['workspaceId']) &&
    isNonEmptyString(value['rootId']) &&
    isSemanticSourceRootKind(value['rootKind']) &&
    isNonEmptyString(value['portableRoot']) &&
    isSemanticSourceAnalysisMode(value['analysisMode']) &&
    Number.isSafeInteger(value['priority']) &&
    Number(value['priority']) >= 0
  );
}

export function isSemanticSourceDescriptor(value: unknown): value is SemanticSourceDescriptor {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['sourceId']) &&
    isNonEmptyString(value['workspaceId']) &&
    isNonEmptyString(value['rootId']) &&
    isSemanticSourceRootKind(value['rootKind']) &&
    isNonEmptyString(value['relativePath']) &&
    isNonEmptyString(value['portablePath']) &&
    isSemanticSourceFormat(value['format']) &&
    isSemanticSourceAnalysisMode(value['analysisMode']) &&
    isNonEmptyString(value['fingerprint']) &&
    isNonNegativeSafeInteger(value['sizeBytes']) &&
    typeof value['modifiedAtMs'] === 'number' &&
    Number.isFinite(value['modifiedAtMs']) &&
    value['modifiedAtMs'] >= 0
  );
}

export function isAutomaticEntityCandidateProjectionMetadata(
  value: unknown,
): value is AutomaticEntityCandidateProjectionMetadata {
  if (!isRecord(value)) return false;
  return (
    value['projectionKind'] === 'automatic-entity-candidate' &&
    isNonEmptyString(value['normalizedName']) &&
    isAutomaticEntityCandidateReviewStatus(value['reviewStatus']) &&
    isNonNegativeSafeInteger(value['sourceOccurrenceCount']) &&
    isNonNegativeSafeInteger(value['explicitStructuralMentionCount']) &&
    Array.isArray(value['mentionIds']) &&
    value['mentionIds'].every(isNonEmptyString) &&
    isNonEmptyString(value['entityRevision']) &&
    (value['matchedEntityId'] === undefined || isNonEmptyString(value['matchedEntityId']))
  );
}

function includesString(values: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
