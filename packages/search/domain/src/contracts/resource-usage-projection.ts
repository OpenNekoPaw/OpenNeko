export const RESOURCE_USAGE_TARGET_OWNER_IDS = [
  'content',
  'media-library',
  'asset',
  'project-entity',
  'character-project',
  'character-version',
] as const;

export const RESOURCE_USAGE_CONSUMER_OWNER_IDS = [
  'canvas',
  'cut',
  'agent',
  'chara',
  'document',
  'project',
  'project-portability',
] as const;

export const RESOURCE_USAGE_AVAILABILITY_STATES = [
  'available',
  'needs-attention',
  'unavailable',
] as const;

export const RESOURCE_USAGE_FRESHNESS_STATES = ['fresh', 'stale', 'rebuilding'] as const;

export type ResourceUsageTargetOwnerId = (typeof RESOURCE_USAGE_TARGET_OWNER_IDS)[number];
export type ResourceUsageConsumerOwnerId = (typeof RESOURCE_USAGE_CONSUMER_OWNER_IDS)[number];
export type ResourceUsageAvailability = (typeof RESOURCE_USAGE_AVAILABILITY_STATES)[number];
export type ResourceUsageFreshness = (typeof RESOURCE_USAGE_FRESHNESS_STATES)[number];

export interface ResourceUsageTarget {
  readonly ownerId: ResourceUsageTargetOwnerId;
  readonly resourceId: string;
}

export interface ResourceUsageProjectionSource {
  readonly ownerId: ResourceUsageConsumerOwnerId;
  readonly sourceId: string;
}

export interface ResourceUsageOccurrence {
  readonly occurrenceId: string;
  readonly location: string;
}

export interface ResourceUsageDependencySummary {
  readonly targetOwnerId: ResourceUsageTargetOwnerId;
  readonly count: number;
}

export interface ResourceUsageProjectionRecord {
  readonly projectionId: string;
  readonly source: ResourceUsageProjectionSource;
  readonly target: ResourceUsageTarget;
  readonly occurrences: readonly ResourceUsageOccurrence[];
  readonly usageCount: number;
  readonly recentlyUsedAt?: string;
  readonly dependencies: readonly ResourceUsageDependencySummary[];
  readonly availability: ResourceUsageAvailability;
  readonly freshness: ResourceUsageFreshness;
  readonly sourceFingerprint: string;
  readonly updatedAt: string;
}

export interface ResourceUsageProjectionPartition {
  readonly scope: 'global' | 'workspace';
  readonly workspaceId: string | null;
  readonly domain: 'resource-usage-projection';
}

export interface ResourceUsageProjectionQuery {
  readonly partition: ResourceUsageProjectionPartition;
  readonly source?: ResourceUsageProjectionSource;
  readonly target?: ResourceUsageTarget;
}

export interface ResourceUsageProjectionReplaceSourceRequest {
  readonly partition: ResourceUsageProjectionPartition;
  readonly source: ResourceUsageProjectionSource;
  readonly records: readonly ResourceUsageProjectionRecord[];
  readonly updatedAt: string;
}

export interface ResourceUsageProjectionDiagnostic {
  readonly code: 'invalid-resource-usage-projection';
  readonly projectionId: string;
  readonly sourceOwnerId: string;
  readonly sourceId: string;
  readonly message: string;
}

export interface ResourceUsageProjectionQueryResult {
  readonly records: readonly ResourceUsageProjectionRecord[];
  readonly diagnostics: readonly ResourceUsageProjectionDiagnostic[];
}

export interface ResourceUsageProjectionRepository {
  list(query: ResourceUsageProjectionQuery): Promise<ResourceUsageProjectionQueryResult>;
  replaceSource(request: ResourceUsageProjectionReplaceSourceRequest): Promise<void>;
}

export function isResourceUsageProjectionRecord(
  value: unknown,
): value is ResourceUsageProjectionRecord {
  if (!isRecord(value) || !hasOnlyKeys(value, RESOURCE_USAGE_PROJECTION_KEYS)) return false;
  if (
    !isStableIdentity(value['projectionId']) ||
    !isResourceUsageProjectionSource(value['source']) ||
    !isResourceUsageTarget(value['target']) ||
    !Array.isArray(value['occurrences']) ||
    !value['occurrences'].every(isResourceUsageOccurrence) ||
    !isNonNegativeInteger(value['usageCount']) ||
    value['usageCount'] < value['occurrences'].length ||
    !isOptionalTimestamp(value['recentlyUsedAt']) ||
    !Array.isArray(value['dependencies']) ||
    !value['dependencies'].every(isResourceUsageDependencySummary) ||
    !isOneOf(value['availability'], RESOURCE_USAGE_AVAILABILITY_STATES) ||
    !isOneOf(value['freshness'], RESOURCE_USAGE_FRESHNESS_STATES) ||
    !isStableIdentity(value['sourceFingerprint']) ||
    !isTimestamp(value['updatedAt'])
  ) {
    return false;
  }
  const occurrenceIds = value['occurrences'].map((occurrence) => occurrence.occurrenceId);
  const dependencyOwners = value['dependencies'].map((dependency) => dependency.targetOwnerId);
  return (
    new Set(occurrenceIds).size === occurrenceIds.length &&
    new Set(dependencyOwners).size === dependencyOwners.length
  );
}

export function isResourceUsageProjectionSource(
  value: unknown,
): value is ResourceUsageProjectionSource {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RESOURCE_USAGE_SOURCE_KEYS) &&
    isOneOf(value['ownerId'], RESOURCE_USAGE_CONSUMER_OWNER_IDS) &&
    isStableIdentity(value['sourceId'])
  );
}

export function isResourceUsageTarget(value: unknown): value is ResourceUsageTarget {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RESOURCE_USAGE_TARGET_KEYS) &&
    isOneOf(value['ownerId'], RESOURCE_USAGE_TARGET_OWNER_IDS) &&
    isStableIdentity(value['resourceId'])
  );
}

function isResourceUsageOccurrence(value: unknown): value is ResourceUsageOccurrence {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RESOURCE_USAGE_OCCURRENCE_KEYS) &&
    isStableIdentity(value['occurrenceId']) &&
    isNonEmptyString(value['location'])
  );
}

function isResourceUsageDependencySummary(value: unknown): value is ResourceUsageDependencySummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, RESOURCE_USAGE_DEPENDENCY_KEYS) &&
    isOneOf(value['targetOwnerId'], RESOURCE_USAGE_TARGET_OWNER_IDS) &&
    isNonNegativeInteger(value['count'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStableIdentity(value: unknown): value is string {
  return isNonEmptyString(value) && !/[\\\0]/u.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isOptionalTimestamp(value: unknown): boolean {
  return value === undefined || isTimestamp(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.some((candidate) => candidate === value);
}

const RESOURCE_USAGE_PROJECTION_KEYS = [
  'projectionId',
  'source',
  'target',
  'occurrences',
  'usageCount',
  'recentlyUsedAt',
  'dependencies',
  'availability',
  'freshness',
  'sourceFingerprint',
  'updatedAt',
] as const;
const RESOURCE_USAGE_SOURCE_KEYS = ['ownerId', 'sourceId'] as const;
const RESOURCE_USAGE_TARGET_KEYS = ['ownerId', 'resourceId'] as const;
const RESOURCE_USAGE_OCCURRENCE_KEYS = ['occurrenceId', 'location'] as const;
const RESOURCE_USAGE_DEPENDENCY_KEYS = ['targetOwnerId', 'count'] as const;
