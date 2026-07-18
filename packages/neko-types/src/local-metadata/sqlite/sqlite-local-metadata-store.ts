import {
  LocalMetadataError,
  validateLocalMetadataMigrationSequence,
  type LocalMetadataBackupRequest,
  type LocalMetadataBackupResult,
  type LocalMetadataIntegrityReport,
  type LocalMetadataMigration,
  type LocalMetadataMigrationOptions,
  type LocalMetadataMigrationResult,
  type LocalMetadataOpenOptions,
  type LocalMetadataRestoreRequest,
  type LocalMetadataRestoreResult,
  type LocalMetadataStore,
  type LocalMetadataStoreState,
  type LocalMetadataTransactionContext,
  type LocalMetadataTransactionMode,
  type LocalMetadataTransactionOptions,
} from '../contracts';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from '../model';
import type {
  CatalogItemKind,
  CatalogItemQuery,
  CatalogItemRecord,
  CatalogItemSource,
  CatalogProjectionReplaceSliceRequest,
  CatalogProjectionRepository,
  ConversationCatalogQuery,
  ConversationCatalogRecord,
  ConversationCatalogRepository,
  ConversationProjectionReplaceRequest,
  EntityAssetProjectionQuery,
  EntityAssetProjectionRecord,
  EntityAssetProjectionInsertMissingResult,
  EntityBindingAvailabilityProjectionValue,
  EntityAssetProjectionReplaceSourceRequest,
  EntityAssetProjectionRepository,
  EntityAssetProjectionKind,
  LocalMetadataCacheMaintenanceRepository,
  LocalMetadataCachePartitionCleanupRequest,
  LocalMetadataCachePartitionCleanupResult,
  LocalMetadataOrphanCacheGcRequest,
  LocalMetadataOrphanCacheGcResult,
  LocalMetadataRepositories,
  MarketInstallationRecord,
  MarketInstallationRepository,
  MediaMetadataRecord,
  MediaMetadataRepository,
  MediaMetadataUpsertRequest,
  ProjectionVersionRepository,
  ProjectionVersionUpdate,
  ResourceCacheMetadataRepository,
  ResourceCacheProjectionReplaceRequest,
  SearchDocumentInsertMissingResult,
  SearchDocumentProjectionReplaceRequest,
  SearchDocumentPartitionReplaceRequest,
  SearchDocumentQuery,
  SearchDocumentRecord,
  SearchDocumentRepository,
  SemanticProjectionInsertMissingResult,
  SemanticProjectionRecord,
  SemanticProjectionReplaceRequest,
  SemanticProjectionReplaceSourceRequest,
  SemanticProjectionRepository,
  TaskCheckpointRecord,
  TaskCheckpointRepository,
  TaskStateQuery,
  TaskStateRecord,
  TaskStateRepository,
  WorkspaceBindRequest,
  WorkspaceRebindRequest,
  WorkspaceRegistryRecord,
  WorkspaceRegistryRepository,
} from '../repositories';
import { isAssetType, parseAssetManifest, type AssetManifest } from '../../types/asset/manifest';
import {
  isCreativeEntityCandidate,
  isCreativeEntityKind,
  isEntityAssetBindingAvailability,
  isEntityAssetBindingRole,
} from '../../types/creative-entity-asset-composition';
import type { MediaFileMetadata } from '../../types/asset/entity';
import {
  isResourceCacheEntry,
  isResourceCacheVariantEntry,
  type ResourceCacheEntry,
  type ResourceCacheVariantEntry,
} from '../../types/resource-cache';
import {
  isProjectIndexFreshness,
  isProjectSemanticCoverageAnalysisKind,
  isProjectSearchItemKind,
  isProjectSearchPartitionKind,
} from '../../types/project-cache-search';
import { isMediaSemanticIndex } from '../../types/media-semantic-index';
import {
  isCompactMediaSemanticIndex,
  isSemanticEvidenceProjection,
} from '../../types/semantic-source';
import {
  NekoStorageContractError,
  createWorkspacePortableLocator,
  type WorkspacePortableLocator,
} from '../../types/storage';
import type {
  SqliteBindingValue,
  SqliteConnection,
  SqliteConnectionFactory,
  SqliteRow,
} from './driver';

const MIGRATION_REGISTRY_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  namespace TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  ownership TEXT NOT NULL CHECK (ownership IN ('system', 'state', 'cache')),
  applied_at TEXT NOT NULL,
  PRIMARY KEY (namespace, version)
) STRICT`;

export interface SqliteLocalMetadataStoreOptions {
  readonly expectedDatabasePath: string;
  readonly connectionFactory: SqliteConnectionFactory;
  readonly now?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(row: SqliteRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-row',
      message: `Expected string column ${column}`,
    });
  }
  return value;
}

function readNullableString(row: SqliteRow, column: string): string | null {
  const value = row[column];
  if (value === null) return null;
  return readString(row, column);
}

function readNumber(row: SqliteRow, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-row',
      message: `Expected numeric column ${column}`,
    });
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-row',
      message: `Column ${column} is outside the safe integer range`,
    });
  }
  return result;
}

function readFiniteNumber(row: SqliteRow, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-row',
      message: `Expected numeric column ${column}`,
    });
  }
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-row',
      message: `Column ${column} is not finite`,
    });
  }
  return result;
}

function requireRow(row: SqliteRow | undefined, operation: string): SqliteRow {
  if (row) return row;
  throw new LocalMetadataError({
    code: 'metadata-integrity-failed',
    operation,
    message: `Expected ${operation} to return a row`,
  });
}

function parseLocator(kind: string, value: string): WorkspacePortableLocator {
  const locator = createWorkspacePortableLocator(value);
  if (locator.kind !== kind) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-workspace-locator',
      message: `Stored workspace locator kind ${kind} does not match ${locator.kind}`,
    });
  }
  return locator;
}

function parseLocatorHistory(value: string): readonly WorkspacePortableLocator[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-workspace-locator-history',
      message: 'Workspace locator history is not valid JSON',
      cause: error,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-workspace-locator-history',
      message: 'Workspace locator history must be an array',
    });
  }
  return parsed.map((item) => {
    if (!isRecord(item) || typeof item.kind !== 'string' || typeof item.value !== 'string') {
      throw new LocalMetadataError({
        code: 'metadata-integrity-failed',
        operation: 'decode-workspace-locator-history',
        message: 'Workspace locator history contains an invalid locator',
      });
    }
    return parseLocator(item.kind, item.value);
  });
}

function parseJsonColumn(value: string, operation: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation,
      message: `Stored JSON payload is invalid for ${operation}`,
      cause: error,
    });
  }
}

function decodeWorkspace(row: SqliteRow): WorkspaceRegistryRecord {
  return {
    workspaceId: readString(row, 'workspace_id'),
    currentLocator: parseLocator(
      readString(row, 'current_locator_kind'),
      readString(row, 'current_locator_value'),
    ),
    locatorHistory: parseLocatorHistory(readString(row, 'locator_history_json')),
    lastSeenAt: readString(row, 'last_seen_at'),
    orphanedAt: readNullableString(row, 'orphaned_at'),
  };
}

function decodeConversation(row: SqliteRow): ConversationCatalogRecord {
  const source = readString(row, 'source');
  if (source !== 'vscode' && source !== 'tui' && source !== 'agent' && source !== 'import') {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-conversation',
      message: `Unknown conversation source: ${source}`,
    });
  }
  return {
    conversationId: readString(row, 'conversation_id'),
    workspaceId: readNullableString(row, 'workspace_id'),
    journalId: readString(row, 'journal_id'),
    title: readString(row, 'title'),
    source,
    model: readNullableString(row, 'model'),
    createdAt: readString(row, 'created_at'),
    updatedAt: readString(row, 'updated_at'),
  };
}

function decodeMarketInstallation(row: SqliteRow): MarketInstallationRecord {
  const value = parseJsonColumn(
    readString(row, 'receipt_json'),
    'decode-market-installation-receipt',
  );
  assertMarketInstallationRecord(value, 'metadata-integrity-failed');
  if (
    value.packageId !== readString(row, 'package_id') ||
    value.installLocation !== readString(row, 'install_location') ||
    value.updatedAt !== readNumber(row, 'updated_at')
  ) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-market-installation-receipt',
      message: `Stored Market installation columns do not match receipt: ${value.packageId}`,
    });
  }
  return value;
}

function assertMarketInstallationRecord(
  value: unknown,
  code: 'metadata-integrity-failed' | 'metadata-transaction-failed',
): asserts value is MarketInstallationRecord {
  const operation =
    code === 'metadata-integrity-failed'
      ? 'decode-market-installation-receipt'
      : 'upsert-market-installation';
  if (!isRecord(value)) {
    throw new LocalMetadataError({
      code,
      operation,
      message: 'Market installation receipt must be an object',
    });
  }
  const record = value;
  const fail = (message: string): never => {
    throw new LocalMetadataError({
      code,
      operation,
      message,
    });
  };
  if (typeof record['packageId'] !== 'string' || !record['packageId'].trim()) {
    fail('Market installation packageId must be non-empty');
  }
  if (typeof record['version'] !== 'string' || !record['version'].trim()) {
    fail(`Market installation version is invalid: ${record['packageId']}`);
  }
  if (!isAssetType(record['type'])) {
    fail(`Market installation asset type is invalid: ${record['packageId']}`);
  }
  assertNonNegativeInteger(record['installedAt'], 'installedAt', fail);
  assertPortableInstallLocation(record['installLocation'], fail);
  let manifest: AssetManifest;
  try {
    manifest = parseAssetManifest(record['manifest']);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Market installation manifest is invalid');
  }
  if (
    manifest.id !== record['packageId'] ||
    manifest.version !== record['version'] ||
    manifest.type !== record['type']
  ) {
    fail(`Market installation manifest identity does not match receipt: ${record['packageId']}`);
  }
  if (record['source'] !== null && !isInstalledPackageSource(record['source'])) {
    fail(`Market installation source is invalid: ${record['packageId']}`);
  }
  if (typeof record['enabled'] !== 'boolean' || typeof record['requested'] !== 'boolean') {
    fail(`Market installation flags are invalid: ${record['packageId']}`);
  }
  if (!isInstalledPackageStatus(record['status'])) {
    fail(`Market installation status is invalid: ${record['packageId']}`);
  }
  for (const field of ['expiresAt', 'graceEndsAt', 'lastUsedAt'] as const) {
    if (record[field] !== null) assertNonNegativeInteger(record[field], field, fail);
  }
  if (
    record['compatibilityIssue'] !== null &&
    !isCompatibilityIssue(record['compatibilityIssue'])
  ) {
    fail(`Market installation compatibility issue is invalid: ${record['packageId']}`);
  }
  if (record['largeAsset'] !== null && !isRecord(record['largeAsset'])) {
    fail(`Market installation large asset state is invalid: ${record['packageId']}`);
  }
  if (
    !Array.isArray(record['referenceOwners']) ||
    record['referenceOwners'].some((owner) => typeof owner !== 'string' || !owner.trim()) ||
    new Set(record['referenceOwners']).size !== record['referenceOwners'].length
  ) {
    fail(`Market installation reference owners are invalid: ${record['packageId']}`);
  }
  if (record['trustDecision'] !== null && !isMarketTrustDecision(record['trustDecision'])) {
    fail(`Market installation trust decision is invalid: ${record['packageId']}`);
  }
  assertNonNegativeInteger(record['updatedAt'], 'updatedAt', fail);
}

function assertPortableInstallLocation(
  value: unknown,
  fail: (message: string) => never,
): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    fail('Market installation location must be non-empty');
  }
  const normalized = value.replace(/\\/gu, '/');
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.startsWith('//')
  ) {
    fail(`Market installation location must be portable: ${value}`);
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
  fail: (message: string) => never,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`Market installation ${field} must be a non-negative safe integer`);
  }
}

function isInstalledPackageSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['kind'] === 'market' ||
      value['kind'] === 'local' ||
      value['kind'] === 'local-link' ||
      value['kind'] === 'ai-generated') &&
    (value['path'] === undefined ||
      (typeof value['path'] === 'string' && value['path'].trim().length > 0)) &&
    (value['originalPath'] === undefined ||
      (typeof value['originalPath'] === 'string' && value['originalPath'].trim().length > 0))
  );
}

function isInstalledPackageStatus(value: unknown): boolean {
  return (
    value === 'active' ||
    value === 'expiring-soon' ||
    value === 'expired' ||
    value === 'incompatible' ||
    value === 'deprecated'
  );
}

function isCompatibilityIssue(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value['detectedAt']) &&
    (value['detectedAt'] as number) >= 0 &&
    typeof value['reason'] === 'string' &&
    value['reason'].trim().length > 0 &&
    (value['suggestedAction'] === undefined || typeof value['suggestedAction'] === 'string')
  );
}

function isMarketTrustDecision(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['level'] === 'trusted' ||
      value['level'] === 'restricted' ||
      value['level'] === 'limited') &&
    (value['source'] === 'vscode-workspace' ||
      value['source'] === 'tui-policy' ||
      value['source'] === 'migration') &&
    Number.isSafeInteger(value['decidedAt']) &&
    (value['decidedAt'] as number) >= 0
  );
}

function decodeTaskState(row: SqliteRow): TaskStateRecord {
  return {
    workspaceId: readString(row, 'workspace_id'),
    taskKey: readString(row, 'task_key'),
    taskId: readString(row, 'task_id'),
    status: readString(row, 'status'),
    payload: parseJsonColumn(readString(row, 'payload_json'), 'decode-task-state'),
    createdAt: readNumber(row, 'created_at'),
    updatedAt: readNumber(row, 'updated_at'),
  };
}

function decodeTaskCheckpoint(row: SqliteRow): TaskCheckpointRecord {
  return {
    workspaceId: readString(row, 'workspace_id'),
    taskKey: readString(row, 'task_key'),
    taskId: readString(row, 'task_id'),
    payload: parseJsonColumn(readString(row, 'payload_json'), 'decode-task-checkpoint'),
    updatedAt: readNumber(row, 'updated_at'),
  };
}

function decodeResourceCacheEntry(
  row: SqliteRow,
  variants: readonly ResourceCacheVariantEntry[],
): ResourceCacheEntry {
  const metadata = parseJsonColumn(readString(row, 'entry_json'), 'decode-resource-cache-entry');
  const entry = isRecord(metadata) ? { ...metadata, variants } : metadata;
  if (!isResourceCacheEntry(entry)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-resource-cache-entry',
      message: `Stored ResourceCache entry is invalid: ${readString(row, 'resource_id')}`,
    });
  }
  if (entry.resource.id !== readString(row, 'resource_id')) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-resource-cache-entry',
      message: `Stored ResourceCache entry identity does not match its row: ${entry.resource.id}`,
    });
  }
  return entry;
}

function decodeResourceCacheVariant(row: SqliteRow): ResourceCacheVariantEntry {
  const variant = parseJsonColumn(readString(row, 'variant_json'), 'decode-resource-cache-variant');
  if (!isResourceCacheVariantEntry(variant)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-resource-cache-variant',
      message: `Stored ResourceCache variant is invalid: ${readString(row, 'variant_key')}`,
    });
  }
  if (variant.key !== readString(row, 'variant_key')) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-resource-cache-variant',
      message: `Stored ResourceCache variant identity does not match its row: ${variant.key}`,
    });
  }
  return variant;
}

function decodeSearchDocument(row: SqliteRow): SearchDocumentRecord {
  const document = parseJsonColumn(readString(row, 'document_json'), 'decode-search-document');
  if (!isSearchDocumentRecord(document)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-search-document',
      message: `Stored search document is invalid: ${readString(row, 'document_id')}`,
    });
  }
  if (document.documentId !== readString(row, 'document_id')) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-search-document',
      message: `Stored search document identity does not match its row: ${document.documentId}`,
    });
  }
  return document;
}

type SemanticEvidenceKind = 'text-segment' | 'entity-mention' | 'semantic-tag' | 'perception-ref';

interface EncodedSemanticEvidence {
  readonly kind: SemanticEvidenceKind;
  readonly evidenceId: string;
  readonly ordinal: number;
  readonly payload: unknown;
}

function decodeSemanticProjection(
  sourceRow: SqliteRow,
  evidenceRows: readonly SqliteRow[],
): SemanticProjectionRecord {
  const sourceId = readString(sourceRow, 'source_id');
  const indexMetadata = parseJsonColumn(
    readString(sourceRow, 'index_json'),
    'decode-semantic-source-index',
  );
  const sourceRef = parseJsonColumn(
    readString(sourceRow, 'source_ref_json'),
    'decode-semantic-source-ref',
  );
  const provider = parseJsonColumn(
    readString(sourceRow, 'provider_json'),
    'decode-semantic-provider',
  );
  const coverage = parseJsonColumn(
    readString(sourceRow, 'coverage_json'),
    'decode-semantic-coverage',
  );
  if (
    !isRecord(indexMetadata) ||
    JSON.stringify(indexMetadata['sourceRef']) !== JSON.stringify(sourceRef) ||
    !isSemanticProviderMetadata(provider) ||
    !Array.isArray(coverage) ||
    !coverage.every(isProjectSemanticCoverageAnalysisKind)
  ) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-semantic-projection',
      message: `Stored semantic source metadata is invalid: ${sourceId}`,
    });
  }
  const evidence = evidenceRows.map(decodeSemanticEvidence);
  const compactEvidence = evidence
    .filter((item) => item.kind === 'text-segment')
    .map((item) => item.payload);
  if (!compactEvidence.every(isSemanticEvidenceProjection)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-semantic-projection',
      message: `Stored semantic evidence contains an incompatible body-bearing payload: ${sourceId}`,
    });
  }
  const entityMentions = evidence
    .filter((item) => item.kind === 'entity-mention')
    .map((item) => item.payload);
  const semanticTags = evidence
    .filter((item) => item.kind === 'semantic-tag')
    .map((item) => item.payload);
  const perceptionRefs = evidence
    .filter((item) => item.kind === 'perception-ref')
    .map((item) => item.payload);
  const index: unknown = {
    ...indexMetadata,
    ...(entityMentions.length > 0 ? { entityMentions } : {}),
    ...(semanticTags.length > 0 ? { semanticTags } : {}),
    ...(perceptionRefs.length > 0 ? { perceptionRefs } : {}),
  };
  if (!isCompactMediaSemanticIndex(index)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-semantic-projection',
      message: `Stored semantic evidence does not reconstruct a valid compact index: ${sourceId}`,
    });
  }
  const freshness = readString(sourceRow, 'freshness');
  if (!isProjectIndexFreshness(freshness)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-semantic-projection',
      message: `Stored semantic freshness is invalid: ${freshness}`,
    });
  }
  return {
    sourceId,
    sourceFingerprint: readString(sourceRow, 'source_fingerprint'),
    provider,
    coverage,
    freshness,
    index,
    evidence: compactEvidence,
    updatedAt: readString(sourceRow, 'updated_at'),
  };
}

function decodeSemanticEvidence(row: SqliteRow): EncodedSemanticEvidence {
  const kind = readString(row, 'evidence_kind');
  if (!isSemanticEvidenceKind(kind)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-semantic-evidence',
      message: `Stored semantic evidence kind is invalid: ${kind}`,
    });
  }
  return {
    kind,
    evidenceId: readString(row, 'evidence_id'),
    ordinal: readNumber(row, 'ordinal'),
    payload: parseJsonColumn(readString(row, 'evidence_json'), 'decode-semantic-evidence'),
  };
}

function serializeJsonPayload(value: unknown, operation: string): string {
  const secretPath = findForbiddenSecretPath(value);
  if (secretPath) {
    throw new LocalMetadataError({
      code: 'metadata-secret-forbidden',
      operation,
      message: `Secret-bearing field cannot be persisted in local metadata: ${secretPath}`,
    });
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation,
      message: `JSON payload cannot be undefined for ${operation}`,
    });
  }
  return serialized;
}

const FORBIDDEN_SECRET_KEYS = new Set([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'authtoken',
  'sessiontoken',
  'enginetoken',
  'authorization',
  'clientsecret',
  'secret',
  'secretkey',
  'password',
  'credential',
  'credentials',
]);

function findForbiddenSecretPath(
  value: unknown,
  path = '$',
  visited = new Set<object>(),
): string | null {
  if (Array.isArray(value)) {
    if (visited.has(value)) return null;
    visited.add(value);
    for (const [index, item] of value.entries()) {
      const nested = findForbiddenSecretPath(item, `${path}[${index}]`, visited);
      if (nested) return nested;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (visited.has(value)) return null;
  visited.add(value);
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/gu, '').toLowerCase();
    if (FORBIDDEN_SECRET_KEYS.has(normalizedKey)) return nextPath;
    const nested = findForbiddenSecretPath(entry, nextPath, visited);
    if (nested) return nested;
  }
  return null;
}

function partitionKey(partition: LocalMetadataPartition): string {
  if (partition.scope === 'global' && partition.workspaceId !== null) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'partition-key',
      message: 'Global metadata partitions cannot carry a workspaceId',
    });
  }
  if (partition.scope === 'workspace' && partition.workspaceId === null) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'partition-key',
      message: 'Workspace metadata partitions require a workspaceId',
    });
  }
  return `${partition.scope}:${partition.workspaceId ?? 'global'}:${partition.domain}`;
}

function parseMetadataTimestamp(value: string | null, operation: string): number {
  const timestamp = value === null ? Number.NaN : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation,
      message: `Expected an ISO timestamp, received ${String(value)}`,
    });
  }
  return timestamp;
}

function decodeProjectionVersion(row: SqliteRow): LocalMetadataPartitionRevision {
  const scope = readString(row, 'partition_scope');
  const freshness = readString(row, 'freshness');
  if (scope !== 'global' && scope !== 'workspace') {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-projection-version',
      message: `Unknown partition scope: ${scope}`,
    });
  }
  if (freshness !== 'fresh' && freshness !== 'stale' && freshness !== 'rebuilding') {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-projection-version',
      message: `Unknown projection freshness: ${freshness}`,
    });
  }
  return {
    partition: {
      scope,
      workspaceId: readNullableString(row, 'workspace_id'),
      domain: readString(row, 'domain'),
    },
    revision: readNumber(row, 'revision'),
    freshness,
    diagnostic: readNullableString(row, 'diagnostic'),
    updatedAt: readString(row, 'updated_at'),
  };
}

class ExclusiveCoordinator {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

class RawWorkspaceRegistryRepository implements WorkspaceRegistryRepository {
  constructor(private readonly connection: () => SqliteConnection) {}

  async get(workspaceId: string): Promise<WorkspaceRegistryRecord | null> {
    const rows = await this.connection().all(
      `SELECT workspace_id, current_locator_kind, current_locator_value,
              locator_history_json, last_seen_at, orphaned_at
         FROM workspaces WHERE workspace_id = ?`,
      [workspaceId],
    );
    const row = rows[0];
    return row ? decodeWorkspace(row) : null;
  }

  async findByCurrentLocator(
    locator: WorkspacePortableLocator,
  ): Promise<readonly WorkspaceRegistryRecord[]> {
    const rows = await this.connection().all(
      `SELECT workspace_id, current_locator_kind, current_locator_value,
              locator_history_json, last_seen_at, orphaned_at
         FROM workspaces
        WHERE current_locator_kind = ? AND current_locator_value = ?
          AND orphaned_at IS NULL
        ORDER BY workspace_id`,
      [locator.kind, locator.value],
    );
    return rows.map(decodeWorkspace);
  }

  async listOrphans(): Promise<readonly WorkspaceRegistryRecord[]> {
    const rows = await this.connection().all(
      `SELECT workspace_id, current_locator_kind, current_locator_value,
              locator_history_json, last_seen_at, orphaned_at
         FROM workspaces WHERE orphaned_at IS NOT NULL ORDER BY orphaned_at`,
    );
    return rows.map(decodeWorkspace);
  }

  async bind(request: WorkspaceBindRequest): Promise<WorkspaceRegistryRecord> {
    const existing = await this.get(request.identity.workspaceId);
    const locatorConflict = (await this.findByCurrentLocator(request.locator)).find(
      (workspace) => workspace.workspaceId !== request.identity.workspaceId,
    );
    if (locatorConflict) {
      throw new NekoStorageContractError({
        code: 'duplicate-workspace-identity',
        message: `Workspace locator ${request.locator.value} is already registered to ${locatorConflict.workspaceId}`,
      });
    }
    if (existing) {
      if (
        existing.currentLocator.kind !== request.locator.kind ||
        existing.currentLocator.value !== request.locator.value ||
        existing.orphanedAt !== null
      ) {
        throw new NekoStorageContractError({
          code: 'duplicate-workspace-identity',
          message: `Workspace ${request.identity.workspaceId} requires an explicit rebind from ${existing.currentLocator.value} to ${request.locator.value}`,
        });
      }
      return this.markSeen(request.identity.workspaceId, request.seenAt);
    }
    await this.connection().run(
      `INSERT INTO workspaces (
        workspace_id, current_locator_kind, current_locator_value,
        locator_history_json, last_seen_at, orphaned_at
      ) VALUES (?, ?, ?, ?, ?, NULL)`,
      [
        request.identity.workspaceId,
        request.locator.kind,
        request.locator.value,
        JSON.stringify([request.locator]),
        request.seenAt,
      ],
    );
    return this.requireWorkspace(request.identity.workspaceId, 'bind-workspace');
  }

  async rebind(request: WorkspaceRebindRequest): Promise<WorkspaceRegistryRecord> {
    const existing = await this.requireWorkspace(request.workspaceId, 'rebind-workspace');
    const locatorConflict = (await this.findByCurrentLocator(request.locator)).find(
      (workspace) => workspace.workspaceId !== request.workspaceId,
    );
    if (locatorConflict) {
      throw new NekoStorageContractError({
        code: 'duplicate-workspace-identity',
        message: `Workspace locator ${request.locator.value} is already registered to ${locatorConflict.workspaceId}`,
      });
    }
    const locatorHistory = existing.locatorHistory.some(
      (locator) => locator.kind === request.locator.kind && locator.value === request.locator.value,
    )
      ? existing.locatorHistory
      : [...existing.locatorHistory, request.locator];
    await this.connection().run(
      `UPDATE workspaces
          SET current_locator_kind = ?, current_locator_value = ?, locator_history_json = ?,
              last_seen_at = ?, orphaned_at = NULL
        WHERE workspace_id = ?`,
      [
        request.locator.kind,
        request.locator.value,
        JSON.stringify(locatorHistory),
        request.reboundAt,
        request.workspaceId,
      ],
    );
    return this.requireWorkspace(request.workspaceId, 'rebind-workspace');
  }

  async markSeen(workspaceId: string, seenAt: string): Promise<WorkspaceRegistryRecord> {
    const result = await this.connection().run(
      'UPDATE workspaces SET last_seen_at = ?, orphaned_at = NULL WHERE workspace_id = ?',
      [seenAt, workspaceId],
    );
    if (result.changes !== 1) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'mark-workspace-seen',
        message: `Workspace ${workspaceId} does not exist`,
      });
    }
    return this.requireWorkspace(workspaceId, 'mark-workspace-seen');
  }

  async markOrphaned(workspaceId: string, orphanedAt: string): Promise<WorkspaceRegistryRecord> {
    const result = await this.connection().run(
      'UPDATE workspaces SET orphaned_at = ? WHERE workspace_id = ?',
      [orphanedAt, workspaceId],
    );
    if (result.changes !== 1) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'mark-workspace-orphaned',
        message: `Workspace ${workspaceId} does not exist`,
      });
    }
    return this.requireWorkspace(workspaceId, 'mark-workspace-orphaned');
  }

  private async requireWorkspace(
    workspaceId: string,
    operation: string,
  ): Promise<WorkspaceRegistryRecord> {
    const workspace = await this.get(workspaceId);
    if (workspace) return workspace;
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation,
      message: `Workspace ${workspaceId} does not exist`,
    });
  }
}

class RawConversationCatalogRepository implements ConversationCatalogRepository {
  constructor(private readonly connection: () => SqliteConnection) {}

  async get(conversationId: string): Promise<ConversationCatalogRecord | null> {
    const rows = await this.connection().all(
      `SELECT conversation_id, workspace_id, journal_id, title, source, model, created_at, updated_at
         FROM conversations WHERE conversation_id = ?`,
      [conversationId],
    );
    const row = rows[0];
    return row ? decodeConversation(row) : null;
  }

  async list(query: ConversationCatalogQuery): Promise<readonly ConversationCatalogRecord[]> {
    if (!Number.isSafeInteger(query.limit) || query.limit <= 0 || query.limit > 1_000) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'list-conversations',
        message: `Conversation query limit must be between 1 and 1000: ${query.limit}`,
      });
    }
    if (!Number.isSafeInteger(query.offset) || query.offset < 0) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'list-conversations',
        message: `Conversation query offset must be a non-negative integer: ${query.offset}`,
      });
    }
    const filters: string[] = [];
    const parameters: SqliteBindingValue[] = [];
    if (query.workspaceId === null) {
      filters.push('workspace_id IS NULL');
    } else {
      filters.push('workspace_id = ?');
      parameters.push(query.workspaceId);
    }
    if (query.text !== null) {
      filters.push("title LIKE ? ESCAPE '\\'");
      parameters.push(`%${query.text.replace(/[\\%_]/g, '\\$&')}%`);
    }
    parameters.push(query.limit, query.offset);
    const rows = await this.connection().all(
      `SELECT conversation_id, workspace_id, journal_id, title, source, model, created_at, updated_at
         FROM conversations
        WHERE ${filters.join(' AND ')}
        ORDER BY updated_at DESC, conversation_id
        LIMIT ? OFFSET ?`,
      parameters,
    );
    return rows.map(decodeConversation);
  }

  async upsert(record: ConversationCatalogRecord): Promise<void> {
    await this.connection().run(
      `INSERT INTO conversations (
        conversation_id, workspace_id, journal_id, title, source, model, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        journal_id = excluded.journal_id,
        title = excluded.title,
        source = excluded.source,
        model = excluded.model,
        updated_at = excluded.updated_at`,
      [
        record.conversationId,
        record.workspaceId,
        record.journalId,
        record.title,
        record.source,
        record.model,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async delete(conversationId: string): Promise<boolean> {
    const result = await this.connection().run(
      'DELETE FROM conversations WHERE conversation_id = ?',
      [conversationId],
    );
    return result.changes === 1;
  }

  async replaceProjection(request: ConversationProjectionReplaceRequest): Promise<void> {
    if (request.workspaceId === null) {
      await this.connection().run('DELETE FROM conversations WHERE workspace_id IS NULL');
    } else {
      await this.connection().run('DELETE FROM conversations WHERE workspace_id = ?', [
        request.workspaceId,
      ]);
    }
    for (const conversation of request.conversations) {
      await this.upsert(conversation);
    }
  }

  async deleteWorkspaceProjection(workspaceId: string): Promise<void> {
    await this.connection().run('DELETE FROM conversations WHERE workspace_id = ?', [workspaceId]);
  }
}

class RawTaskStateRepository implements TaskStateRepository {
  constructor(private readonly connection: () => SqliteConnection) {}

  async get(workspaceId: string, taskKey: string): Promise<TaskStateRecord | null> {
    const rows = await this.connection().all(
      `SELECT workspace_id, task_key, task_id, status, payload_json, created_at, updated_at
         FROM tasks WHERE workspace_id = ? AND task_key = ?`,
      [workspaceId, taskKey],
    );
    const row = rows[0];
    return row ? decodeTaskState(row) : null;
  }

  async list(query: TaskStateQuery): Promise<readonly TaskStateRecord[]> {
    if (query.statuses !== null && query.statuses.length === 0) return [];
    const parameters: SqliteBindingValue[] = [query.workspaceId];
    let statusFilter = '';
    if (query.statuses !== null) {
      for (const status of query.statuses) {
        if (!status.trim()) {
          throw new LocalMetadataError({
            code: 'metadata-transaction-failed',
            operation: 'list-task-state',
            message: 'Task status filters must be non-empty strings',
          });
        }
      }
      statusFilter = ` AND status IN (${query.statuses.map(() => '?').join(', ')})`;
      parameters.push(...query.statuses);
    }
    const rows = await this.connection().all(
      `SELECT workspace_id, task_key, task_id, status, payload_json, created_at, updated_at
         FROM tasks
        WHERE workspace_id = ?${statusFilter}
        ORDER BY updated_at DESC, task_key`,
      parameters,
    );
    return rows.map(decodeTaskState);
  }

  async upsert(record: TaskStateRecord): Promise<void> {
    await this.connection().run(
      `INSERT INTO tasks (
        workspace_id, task_key, task_id, status, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, task_key) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`,
      [
        record.workspaceId,
        record.taskKey,
        record.taskId,
        record.status,
        serializeJsonPayload(record.payload, 'upsert-task-state'),
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async delete(workspaceId: string, taskKey: string): Promise<boolean> {
    const result = await this.connection().run(
      'DELETE FROM tasks WHERE workspace_id = ? AND task_key = ?',
      [workspaceId, taskKey],
    );
    return result.changes === 1;
  }

  async deleteWorkspace(workspaceId: string): Promise<number> {
    const result = await this.connection().run('DELETE FROM tasks WHERE workspace_id = ?', [
      workspaceId,
    ]);
    return result.changes;
  }
}

class RawTaskCheckpointRepository implements TaskCheckpointRepository {
  constructor(private readonly connection: () => SqliteConnection) {}

  async get(workspaceId: string, taskKey: string): Promise<TaskCheckpointRecord | null> {
    const rows = await this.connection().all(
      `SELECT workspace_id, task_key, task_id, payload_json, updated_at
         FROM task_checkpoints WHERE workspace_id = ? AND task_key = ?`,
      [workspaceId, taskKey],
    );
    const row = rows[0];
    return row ? decodeTaskCheckpoint(row) : null;
  }

  async list(workspaceId: string): Promise<readonly TaskCheckpointRecord[]> {
    const rows = await this.connection().all(
      `SELECT workspace_id, task_key, task_id, payload_json, updated_at
         FROM task_checkpoints
        WHERE workspace_id = ?
        ORDER BY updated_at DESC, task_key`,
      [workspaceId],
    );
    return rows.map(decodeTaskCheckpoint);
  }

  async upsert(record: TaskCheckpointRecord): Promise<void> {
    await this.connection().run(
      `INSERT INTO task_checkpoints (
        workspace_id, task_key, task_id, payload_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, task_key) DO UPDATE SET
        task_id = excluded.task_id,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at`,
      [
        record.workspaceId,
        record.taskKey,
        record.taskId,
        serializeJsonPayload(record.payload, 'upsert-task-checkpoint'),
        record.updatedAt,
      ],
    );
  }

  async delete(workspaceId: string, taskKey: string): Promise<boolean> {
    const result = await this.connection().run(
      'DELETE FROM task_checkpoints WHERE workspace_id = ? AND task_key = ?',
      [workspaceId, taskKey],
    );
    return result.changes === 1;
  }

  async clearWorkspace(workspaceId: string): Promise<number> {
    const result = await this.connection().run(
      'DELETE FROM task_checkpoints WHERE workspace_id = ?',
      [workspaceId],
    );
    return result.changes;
  }
}

class RawResourceCacheMetadataRepository implements ResourceCacheMetadataRepository {
  constructor(
    private readonly connection: () => SqliteConnection,
    private readonly projectionVersions: ProjectionVersionRepository,
  ) {}

  async get(
    partition: LocalMetadataPartition,
    resourceId: string,
  ): Promise<ResourceCacheEntry | null> {
    const entries = await this.list(partition);
    return entries.find((entry) => entry.resource.id === resourceId) ?? null;
  }

  async list(partition: LocalMetadataPartition): Promise<readonly ResourceCacheEntry[]> {
    assertResourceCachePartition(partition);
    const key = partitionKey(partition);
    const entryRows = await this.connection().all(
      `SELECT resource_id, entry_json
         FROM resource_cache_entries
        WHERE partition_key = ?
        ORDER BY resource_id`,
      [key],
    );
    const variantRows = await this.connection().all(
      `SELECT resource_id, variant_key, variant_json
         FROM resource_cache_variants
        WHERE partition_key = ?
        ORDER BY resource_id, variant_key`,
      [key],
    );
    const variantsByResource = new Map<string, ResourceCacheVariantEntry[]>();
    for (const row of variantRows) {
      const resourceId = readString(row, 'resource_id');
      const variants = variantsByResource.get(resourceId) ?? [];
      variants.push(decodeResourceCacheVariant(row));
      variantsByResource.set(resourceId, variants);
    }
    return entryRows.map((row) =>
      decodeResourceCacheEntry(row, variantsByResource.get(readString(row, 'resource_id')) ?? []),
    );
  }

  async replacePartition(request: ResourceCacheProjectionReplaceRequest): Promise<void> {
    assertResourceCachePartition(request.partition);
    const key = partitionKey(request.partition);
    await this.connection().run('DELETE FROM resource_cache_entries WHERE partition_key = ?', [
      key,
    ]);
    const resourceIds = new Set<string>();
    for (const entry of request.entries) {
      assertResourceCacheEntryForPartition(entry, request.partition, resourceIds);
      const { variants, ...metadata } = entry;
      await this.connection().run(
        `INSERT INTO resource_cache_entries (
          partition_key, partition_scope, workspace_id, resource_id,
          entry_json, status, created_at, updated_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          request.partition.scope,
          request.partition.workspaceId,
          entry.resource.id,
          serializeJsonPayload(metadata, 'replace-resource-cache-entry'),
          entry.status,
          entry.createdAt,
          entry.updatedAt,
          entry.lastAccessedAt ?? null,
        ],
      );
      const variantKeys = new Set<string>();
      for (const variant of variants) {
        assertResourceCacheVariant(variant, entry.resource.id, variantKeys);
        await this.connection().run(
          `INSERT INTO resource_cache_variants (
            partition_key, partition_scope, workspace_id, resource_id, variant_key,
            variant_json, status, role, size_bytes, last_accessed_at,
            pinned, session_active, promoted, rebuildable
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            key,
            request.partition.scope,
            request.partition.workspaceId,
            entry.resource.id,
            variant.key,
            serializeJsonPayload(variant, 'replace-resource-cache-variant'),
            variant.status,
            variant.role,
            variant.sizeBytes ?? null,
            variant.lastAccessedAt ?? null,
            variant.pinned ? 1 : 0,
            variant.sessionActive ? 1 : 0,
            variant.promoted ? 1 : 0,
            variant.rebuildable === false ? 0 : 1,
          ],
        );
      }
    }
    await this.projectionVersions.increment({
      partition: request.partition,
      freshness: 'fresh',
      diagnostic: null,
      updatedAt: request.updatedAt,
    });
  }
}

class RawMediaMetadataRepository implements MediaMetadataRepository {
  constructor(
    private readonly connection: () => SqliteConnection,
    private readonly projectionVersions: ProjectionVersionRepository,
  ) {}

  async get(
    partition: LocalMetadataPartition,
    sourceKey: string,
  ): Promise<MediaMetadataRecord | null> {
    assertMediaMetadataPartition(partition);
    assertPortableMediaSourceKey(sourceKey);
    const rows = await this.connection().all(
      `SELECT source_key, source_mtime_ms, metadata_json, updated_at
         FROM media_metadata
        WHERE partition_key = ? AND source_key = ?`,
      [partitionKey(partition), sourceKey],
    );
    return rows[0] ? decodeMediaMetadataRecord(rows[0]) : null;
  }

  async list(partition: LocalMetadataPartition): Promise<readonly MediaMetadataRecord[]> {
    assertMediaMetadataPartition(partition);
    const rows = await this.connection().all(
      `SELECT source_key, source_mtime_ms, metadata_json, updated_at
         FROM media_metadata
        WHERE partition_key = ?
        ORDER BY source_key`,
      [partitionKey(partition)],
    );
    return rows.map(decodeMediaMetadataRecord);
  }

  async upsert(request: MediaMetadataUpsertRequest): Promise<void> {
    assertMediaMetadataPartition(request.partition);
    assertMediaMetadataRecord(request.record);
    await this.connection().run(
      `INSERT INTO media_metadata (
        partition_key, partition_scope, workspace_id, source_key,
        source_mtime_ms, metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(partition_key, source_key) DO UPDATE SET
        source_mtime_ms = excluded.source_mtime_ms,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
      [
        partitionKey(request.partition),
        request.partition.scope,
        request.partition.workspaceId,
        request.record.sourceKey,
        request.record.sourceMtimeMs,
        serializeJsonPayload(request.record.metadata, 'upsert-media-metadata'),
        request.record.updatedAt,
      ],
    );
    await this.projectionVersions.increment({
      partition: request.partition,
      freshness: 'fresh',
      diagnostic: null,
      updatedAt: request.record.updatedAt,
    });
  }

  async delete(partition: LocalMetadataPartition, sourceKey: string): Promise<boolean> {
    assertMediaMetadataPartition(partition);
    assertPortableMediaSourceKey(sourceKey);
    const result = await this.connection().run(
      'DELETE FROM media_metadata WHERE partition_key = ? AND source_key = ?',
      [partitionKey(partition), sourceKey],
    );
    if (result.changes > 0) {
      await this.projectionVersions.increment({
        partition,
        freshness: 'fresh',
        diagnostic: null,
        updatedAt: new Date().toISOString(),
      });
    }
    return result.changes === 1;
  }
}

class RawSearchDocumentRepository implements SearchDocumentRepository {
  constructor(
    private readonly connection: () => SqliteConnection,
    private readonly projectionVersions: ProjectionVersionRepository,
  ) {}

  async list(partition: LocalMetadataPartition): Promise<readonly SearchDocumentRecord[]> {
    assertSearchDocumentPartition(partition);
    const rows = await this.connection().all(
      `SELECT document_id, document_json
         FROM search_documents
        WHERE partition_key = ?
        ORDER BY document_id`,
      [partitionKey(partition)],
    );
    return rows.map(decodeSearchDocument);
  }

  async query(query: SearchDocumentQuery): Promise<readonly SearchDocumentRecord[]> {
    assertSearchDocumentPartition(query.partition);
    if (!Number.isSafeInteger(query.limit) || query.limit <= 0 || query.limit > 1_000) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'query-search-documents',
        message: `Search document query limit must be between 1 and 1000: ${query.limit}`,
      });
    }
    const match = createFtsMatchQuery(query.text);
    if (!match) return (await this.list(query.partition)).slice(0, query.limit);
    const rows = await this.connection().all(
      `SELECT documents.document_id, documents.document_json
         FROM search_documents AS documents
         JOIN search_documents_fts ON search_documents_fts.rowid = documents.rowid
        WHERE documents.partition_key = ?
          AND search_documents_fts MATCH ?
        ORDER BY bm25(search_documents_fts), documents.document_id
        LIMIT ?`,
      [partitionKey(query.partition), match, query.limit],
    );
    return rows.map(decodeSearchDocument);
  }

  async replacePartition(request: SearchDocumentProjectionReplaceRequest): Promise<void> {
    assertSearchDocumentPartition(request.partition);
    parseMetadataTimestamp(request.updatedAt, 'replace-search-document-projection');
    const key = partitionKey(request.partition);
    const documentIds = new Set<string>();
    for (const document of request.documents) {
      assertSearchDocumentRecord(document, documentIds);
    }
    await this.connection().run('DELETE FROM search_documents WHERE partition_key = ?', [key]);
    for (const document of request.documents) {
      await this.connection().run(
        `INSERT INTO search_documents (
          partition_key, partition_scope, workspace_id, document_id,
          search_partition, item_kind, label, search_text,
          freshness, document_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          request.partition.scope,
          request.partition.workspaceId,
          document.documentId,
          document.partition,
          document.kind,
          document.label,
          document.searchText,
          document.freshness,
          serializeJsonPayload(document, 'replace-search-document'),
          document.updatedAt,
        ],
      );
    }
    await this.projectionVersions.increment({
      partition: request.partition,
      ...projectionFreshnessUpdate(request.documents, 'search-documents-not-fresh'),
      updatedAt: request.updatedAt,
    });
  }

  async replaceSearchPartition(request: SearchDocumentPartitionReplaceRequest): Promise<void> {
    assertSearchDocumentPartition(request.partition);
    parseMetadataTimestamp(request.updatedAt, 'replace-search-document-partition');
    const documentIds = new Set<string>();
    for (const document of request.documents) {
      assertSearchDocumentRecord(document, documentIds);
      if (document.partition !== request.searchPartition) {
        throw new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: 'replace-search-document-partition',
          message: `Search document ${document.documentId} does not belong to ${request.searchPartition}`,
        });
      }
    }
    const key = partitionKey(request.partition);
    await this.connection().run(
      'DELETE FROM search_documents WHERE partition_key = ? AND search_partition = ?',
      [key, request.searchPartition],
    );
    for (const document of request.documents) {
      await this.insertDocument(request.partition, document);
    }
    await this.projectionVersions.increment({
      partition: request.partition,
      ...projectionFreshnessUpdate(request.documents, 'search-documents-not-fresh'),
      updatedAt: request.updatedAt,
    });
  }

  async insertMissingSearchPartition(
    request: SearchDocumentPartitionReplaceRequest,
  ): Promise<SearchDocumentInsertMissingResult> {
    assertSearchDocumentPartition(request.partition);
    parseMetadataTimestamp(request.updatedAt, 'insert-missing-search-document-partition');
    const documentIds = new Set<string>();
    for (const document of request.documents) {
      assertSearchDocumentRecord(document, documentIds);
      if (document.partition !== request.searchPartition) {
        throw new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: 'insert-missing-search-document-partition',
          message: `Search document ${document.documentId} does not belong to ${request.searchPartition}`,
        });
      }
    }
    const insertedDocumentIds: string[] = [];
    const preservedDocumentIds: string[] = [];
    for (const document of request.documents) {
      const inserted = await this.insertDocument(request.partition, document, true);
      (inserted ? insertedDocumentIds : preservedDocumentIds).push(document.documentId);
    }
    if (insertedDocumentIds.length > 0) {
      const currentDocuments = await this.list(request.partition);
      await this.projectionVersions.increment({
        partition: request.partition,
        ...projectionFreshnessUpdate(currentDocuments, 'search-documents-not-fresh'),
        updatedAt: request.updatedAt,
      });
    }
    return { insertedDocumentIds, preservedDocumentIds };
  }

  private async insertDocument(
    partition: LocalMetadataPartition,
    document: SearchDocumentRecord,
    preserveExisting = false,
  ): Promise<boolean> {
    const result = await this.connection().run(
      `INSERT INTO search_documents (
        partition_key, partition_scope, workspace_id, document_id,
        search_partition, item_kind, label, search_text,
        freshness, document_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ${preserveExisting ? 'ON CONFLICT(partition_key, document_id) DO NOTHING' : ''}`,
      [
        partitionKey(partition),
        partition.scope,
        partition.workspaceId,
        document.documentId,
        document.partition,
        document.kind,
        document.label,
        document.searchText,
        document.freshness,
        serializeJsonPayload(document, 'replace-search-document'),
        document.updatedAt,
      ],
    );
    return result.changes === 1;
  }
}

class RawSemanticProjectionRepository implements SemanticProjectionRepository {
  constructor(
    private readonly connection: () => SqliteConnection,
    private readonly projectionVersions: ProjectionVersionRepository,
  ) {}

  async list(partition: LocalMetadataPartition): Promise<readonly SemanticProjectionRecord[]> {
    assertSemanticProjectionPartition(partition);
    const key = partitionKey(partition);
    const sourceRows = await this.connection().all(
      `SELECT source_id, source_ref_json, source_fingerprint, provider_json,
              coverage_json, freshness, index_json, updated_at
         FROM semantic_sources
        WHERE partition_key = ?
        ORDER BY source_id`,
      [key],
    );
    const evidenceRows = await this.connection().all(
      `SELECT source_id, evidence_kind, evidence_id, ordinal, evidence_json
         FROM semantic_evidence
        WHERE partition_key = ?
        ORDER BY source_id, ordinal, evidence_kind, evidence_id`,
      [key],
    );
    const evidenceBySource = new Map<string, SqliteRow[]>();
    for (const row of evidenceRows) {
      const sourceId = readString(row, 'source_id');
      const rows = evidenceBySource.get(sourceId) ?? [];
      rows.push(row);
      evidenceBySource.set(sourceId, rows);
    }
    return sourceRows.map((row) =>
      decodeSemanticProjection(row, evidenceBySource.get(readString(row, 'source_id')) ?? []),
    );
  }

  async get(
    partition: LocalMetadataPartition,
    sourceId: string,
  ): Promise<SemanticProjectionRecord | null> {
    assertSemanticProjectionPartition(partition);
    assertNonEmptyProjectionFilter(sourceId, 'sourceId');
    const key = partitionKey(partition);
    const sourceRows = await this.connection().all(
      `SELECT source_id, source_ref_json, source_fingerprint, provider_json,
              coverage_json, freshness, index_json, updated_at
         FROM semantic_sources
        WHERE partition_key = ? AND source_id = ?`,
      [key, sourceId],
    );
    const sourceRow = sourceRows[0];
    if (!sourceRow) return null;
    const evidenceRows = await this.connection().all(
      `SELECT source_id, evidence_kind, evidence_id, ordinal, evidence_json
         FROM semantic_evidence
        WHERE partition_key = ? AND source_id = ?
        ORDER BY ordinal, evidence_kind, evidence_id`,
      [key, sourceId],
    );
    return decodeSemanticProjection(sourceRow, evidenceRows);
  }

  async replacePartition(request: SemanticProjectionReplaceRequest): Promise<void> {
    assertSemanticProjectionPartition(request.partition);
    parseMetadataTimestamp(request.updatedAt, 'replace-semantic-projection');
    const sourceIds = new Set<string>();
    const prepared = request.sources.map((source) => {
      assertSemanticProjectionRecord(source, sourceIds);
      return { source, ...splitSemanticProjection(source) };
    });
    await this.connection().run('DELETE FROM semantic_sources WHERE partition_key = ?', [
      partitionKey(request.partition),
    ]);
    for (const item of prepared) {
      await this.insertSource(request.partition, item);
    }
    await this.projectionVersions.increment({
      partition: request.partition,
      ...projectionFreshnessUpdate(request.sources, 'semantic-sources-not-fresh'),
      updatedAt: request.updatedAt,
    });
  }

  async replaceSource(request: SemanticProjectionReplaceSourceRequest): Promise<void> {
    assertSemanticProjectionPartition(request.partition);
    parseMetadataTimestamp(request.updatedAt, 'replace-semantic-projection-source');
    if (request.source.updatedAt !== request.updatedAt) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'replace-semantic-projection-source',
        message: 'Semantic source replacement timestamp must match its source record',
      });
    }
    const prepared = {
      source: request.source,
      ...splitSemanticProjection(request.source),
    };
    assertSemanticProjectionRecord(request.source, new Set<string>());
    await this.connection().run(
      'DELETE FROM semantic_sources WHERE partition_key = ? AND source_id = ?',
      [partitionKey(request.partition), request.source.sourceId],
    );
    await this.insertSource(request.partition, prepared);
    const currentSources = await this.list(request.partition);
    await this.projectionVersions.increment({
      partition: request.partition,
      ...projectionFreshnessUpdate(currentSources, 'semantic-sources-not-fresh'),
      updatedAt: request.updatedAt,
    });
  }

  async deleteSource(
    partition: LocalMetadataPartition,
    sourceId: string,
    updatedAt: string,
  ): Promise<boolean> {
    assertSemanticProjectionPartition(partition);
    assertNonEmptyProjectionFilter(sourceId, 'sourceId');
    parseMetadataTimestamp(updatedAt, 'delete-semantic-projection-source');
    const result = await this.connection().run(
      'DELETE FROM semantic_sources WHERE partition_key = ? AND source_id = ?',
      [partitionKey(partition), sourceId],
    );
    if (result.changes === 0) return false;
    const currentSources = await this.list(partition);
    await this.projectionVersions.increment({
      partition,
      ...projectionFreshnessUpdate(currentSources, 'semantic-sources-not-fresh'),
      updatedAt,
    });
    return true;
  }

  async clearBodyBearingSources(
    partition: LocalMetadataPartition,
    updatedAt: string,
  ): Promise<readonly string[]> {
    assertSemanticProjectionPartition(partition);
    parseMetadataTimestamp(updatedAt, 'clear-body-bearing-semantic-sources');
    const rows = await this.connection().all(
      `SELECT source_id
         FROM semantic_sources
        WHERE partition_key = ?
          AND EXISTS (
            SELECT 1
              FROM semantic_evidence
             WHERE semantic_evidence.partition_key = semantic_sources.partition_key
               AND semantic_evidence.source_id = semantic_sources.source_id
               AND semantic_evidence.evidence_kind = 'text-segment'
               AND json_type(semantic_evidence.evidence_json, '$.text') IS NOT NULL
          )
        ORDER BY source_id`,
      [partitionKey(partition)],
    );
    const sourceIds = rows.map((row) => readString(row, 'source_id'));
    if (sourceIds.length === 0) return [];
    const result = await this.connection().run(
      `DELETE FROM semantic_sources
        WHERE partition_key = ?
          AND EXISTS (
            SELECT 1
              FROM semantic_evidence
             WHERE semantic_evidence.partition_key = semantic_sources.partition_key
               AND semantic_evidence.source_id = semantic_sources.source_id
               AND semantic_evidence.evidence_kind = 'text-segment'
               AND json_type(semantic_evidence.evidence_json, '$.text') IS NOT NULL
          )`,
      [partitionKey(partition)],
    );
    if (result.changes !== sourceIds.length) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'clear-body-bearing-semantic-sources',
        message: 'Body-bearing semantic cache cleanup changed an unexpected number of sources',
      });
    }
    const currentSources = await this.list(partition);
    await this.projectionVersions.increment({
      partition,
      ...projectionFreshnessUpdate(currentSources, 'semantic-sources-not-fresh'),
      updatedAt,
    });
    return sourceIds;
  }

  async insertMissing(
    request: SemanticProjectionReplaceRequest,
  ): Promise<SemanticProjectionInsertMissingResult> {
    assertSemanticProjectionPartition(request.partition);
    parseMetadataTimestamp(request.updatedAt, 'insert-missing-semantic-projection');
    const sourceIds = new Set<string>();
    const prepared = request.sources.map((source) => {
      assertSemanticProjectionRecord(source, sourceIds);
      return { source, ...splitSemanticProjection(source) };
    });
    const insertedSourceIds: string[] = [];
    const preservedSourceIds: string[] = [];
    for (const item of prepared) {
      if (!(await this.insertSource(request.partition, item, true))) {
        preservedSourceIds.push(item.source.sourceId);
        continue;
      }
      insertedSourceIds.push(item.source.sourceId);
    }
    if (insertedSourceIds.length > 0) {
      const currentSources = await this.list(request.partition);
      await this.projectionVersions.increment({
        partition: request.partition,
        ...projectionFreshnessUpdate(currentSources, 'semantic-sources-not-fresh'),
        updatedAt: request.updatedAt,
      });
    }
    return { insertedSourceIds, preservedSourceIds };
  }

  private async insertSource(
    partition: LocalMetadataPartition,
    item: { readonly source: SemanticProjectionRecord } & ReturnType<
      typeof splitSemanticProjection
    >,
    preserveExisting = false,
  ): Promise<boolean> {
    const key = partitionKey(partition);
    const result = await this.connection().run(
      `INSERT INTO semantic_sources (
        partition_key, partition_scope, workspace_id, source_id, asset_id,
        source_ref_json, source_fingerprint, provider_json, coverage_json,
        freshness, index_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ${preserveExisting ? 'ON CONFLICT(partition_key, source_id) DO NOTHING' : ''}`,
      [
        key,
        partition.scope,
        partition.workspaceId,
        item.source.sourceId,
        item.source.index.assetId,
        serializeJsonPayload(item.source.index.sourceRef, 'write-semantic-source-ref'),
        item.source.sourceFingerprint,
        serializeJsonPayload(item.source.provider, 'write-semantic-provider'),
        serializeJsonPayload(item.source.coverage, 'write-semantic-coverage'),
        item.source.freshness,
        serializeJsonPayload(item.indexMetadata, 'write-semantic-source-index'),
        item.source.updatedAt,
      ],
    );
    if (result.changes === 0) return false;
    for (const evidence of item.evidence) {
      await this.connection().run(
        `INSERT INTO semantic_evidence (
          partition_key, partition_scope, workspace_id, source_id,
          evidence_kind, evidence_id, ordinal, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          partition.scope,
          partition.workspaceId,
          item.source.sourceId,
          evidence.kind,
          evidence.evidenceId,
          evidence.ordinal,
          serializeJsonPayload(evidence.payload, 'write-semantic-evidence'),
        ],
      );
    }
    return true;
  }
}

class RawEntityAssetProjectionRepository implements EntityAssetProjectionRepository {
  constructor(
    private readonly connection: () => SqliteConnection,
    private readonly projectionVersions: ProjectionVersionRepository,
  ) {}

  async list(query: EntityAssetProjectionQuery): Promise<readonly EntityAssetProjectionRecord[]> {
    assertEntityAssetProjectionPartition(query.partition);
    const clauses = ['partition_key = ?'];
    const parameters: SqliteBindingValue[] = [partitionKey(query.partition)];
    if (query.kinds) {
      const kinds = [...new Set(query.kinds)];
      if (kinds.length === 0 || !kinds.every(isEntityAssetProjectionKind)) {
        throw new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: 'query-entity-asset-projections',
          message: 'Entity/Asset projection kind filter is empty or invalid',
        });
      }
      clauses.push(`projection_kind IN (${kinds.map(() => '?').join(', ')})`);
      parameters.push(...kinds);
    }
    appendProjectionStringFilter(clauses, parameters, 'source_id', query.sourceId);
    appendProjectionStringFilter(clauses, parameters, 'projection_id', query.projectionId);
    appendProjectionStringFilter(clauses, parameters, 'candidate_id', query.candidateId);
    appendProjectionStringFilter(clauses, parameters, 'asset_ref', query.assetRef);
    if (query.entityId !== undefined) {
      assertNonEmptyProjectionFilter(query.entityId, 'entityId');
      clauses.push('(entity_id = ? OR related_entity_id = ?)');
      parameters.push(query.entityId, query.entityId);
    }
    const rows = await this.connection().all(
      `SELECT projection_kind, projection_id, source_id, entity_id,
              related_entity_id, candidate_id, asset_ref, freshness,
              projection_json, updated_at
         FROM entity_asset_projections
        WHERE ${clauses.join(' AND ')}
        ORDER BY projection_kind, projection_id`,
      parameters,
    );
    return rows.map(decodeEntityAssetProjection);
  }

  async replaceSource(request: EntityAssetProjectionReplaceSourceRequest): Promise<void> {
    assertEntityAssetProjectionPartition(request.partition);
    assertNonEmptyProjectionFilter(request.sourceId, 'sourceId');
    parseMetadataTimestamp(request.updatedAt, 'replace-entity-asset-projection-source');
    const identities = new Set<string>();
    for (const record of request.records) {
      assertEntityAssetProjectionRecord(record, identities);
      if (record.sourceId !== request.sourceId) {
        throw new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: 'replace-entity-asset-projection-source',
          message: `Projection ${record.projectionId} does not belong to source ${request.sourceId}`,
        });
      }
    }
    const key = partitionKey(request.partition);
    await this.connection().run(
      'DELETE FROM entity_asset_projections WHERE partition_key = ? AND source_id = ?',
      [key, request.sourceId],
    );
    for (const record of request.records) {
      await this.connection().run(
        `INSERT INTO entity_asset_projections (
          partition_key, partition_scope, workspace_id, projection_kind,
          projection_id, source_id, entity_id, related_entity_id,
          candidate_id, asset_ref, freshness, projection_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          request.partition.scope,
          request.partition.workspaceId,
          record.kind,
          record.projectionId,
          record.sourceId,
          record.entityId ?? null,
          record.relatedEntityId ?? null,
          record.candidateId ?? null,
          record.assetRef ?? null,
          record.freshness,
          serializeJsonPayload(record, 'replace-entity-asset-projection'),
          record.updatedAt,
        ],
      );
    }
    const current = await this.list({ partition: request.partition });
    await this.projectionVersions.increment({
      partition: request.partition,
      ...projectionFreshnessUpdate(current, 'entity-asset-projections-not-fresh'),
      updatedAt: request.updatedAt,
    });
  }

  async insertMissing(
    request: EntityAssetProjectionReplaceSourceRequest,
  ): Promise<EntityAssetProjectionInsertMissingResult> {
    assertEntityAssetProjectionPartition(request.partition);
    assertNonEmptyProjectionFilter(request.sourceId, 'sourceId');
    parseMetadataTimestamp(request.updatedAt, 'insert-missing-entity-asset-projections');
    const identities = new Set<string>();
    for (const record of request.records) {
      assertEntityAssetProjectionRecord(record, identities);
      if (record.sourceId !== request.sourceId) {
        throw new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: 'insert-missing-entity-asset-projections',
          message: `Projection ${record.projectionId} does not belong to source ${request.sourceId}`,
        });
      }
    }
    const key = partitionKey(request.partition);
    const insertedProjectionKeys: string[] = [];
    const preservedProjectionKeys: string[] = [];
    for (const record of request.records) {
      const result = await this.connection().run(
        `INSERT INTO entity_asset_projections (
          partition_key, partition_scope, workspace_id, projection_kind,
          projection_id, source_id, entity_id, related_entity_id,
          candidate_id, asset_ref, freshness, projection_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(partition_key, projection_kind, projection_id) DO NOTHING`,
        [
          key,
          request.partition.scope,
          request.partition.workspaceId,
          record.kind,
          record.projectionId,
          record.sourceId,
          record.entityId ?? null,
          record.relatedEntityId ?? null,
          record.candidateId ?? null,
          record.assetRef ?? null,
          record.freshness,
          serializeJsonPayload(record, 'insert-entity-asset-projection'),
          record.updatedAt,
        ],
      );
      const projectionKey = `${record.kind}:${record.projectionId}`;
      (result.changes === 0 ? preservedProjectionKeys : insertedProjectionKeys).push(projectionKey);
    }
    if (insertedProjectionKeys.length > 0) {
      const current = await this.list({ partition: request.partition });
      await this.projectionVersions.increment({
        partition: request.partition,
        ...projectionFreshnessUpdate(current, 'entity-asset-projections-not-fresh'),
        updatedAt: request.updatedAt,
      });
    }
    return { insertedProjectionKeys, preservedProjectionKeys };
  }
}

class RawCatalogProjectionRepository implements CatalogProjectionRepository {
  constructor(
    private readonly connection: () => SqliteConnection,
    private readonly projectionVersions: ProjectionVersionRepository,
  ) {}

  async list(query: CatalogItemQuery): Promise<readonly CatalogItemRecord[]> {
    assertCatalogPartition(query.partition);
    const clauses = ['partition_key = ?'];
    const parameters: SqliteBindingValue[] = [partitionKey(query.partition)];
    appendCatalogFilter(clauses, parameters, 'item_kind', query.kinds, isCatalogItemKind);
    appendCatalogFilter(clauses, parameters, 'source_scope', query.sources, isCatalogItemSource);
    const rows = await this.connection().all(
      `SELECT item_kind, source_scope, catalog_id, name, display_name,
              description, version, root_id, relative_path, fingerprint,
              enabled, diagnostic_codes_json, updated_at
         FROM catalog_items
        WHERE ${clauses.join(' AND ')}
        ORDER BY item_kind, source_scope, name, catalog_id`,
      parameters,
    );
    return rows.map(decodeCatalogItem);
  }

  async replaceSlice(request: CatalogProjectionReplaceSliceRequest): Promise<void> {
    assertCatalogPartition(request.partition);
    assertCatalogKindSourcePartition(request.kind, request.source, request.partition);
    parseMetadataTimestamp(request.updatedAt, 'replace-catalog-slice');
    const catalogIds = new Set<string>();
    for (const item of request.items) {
      assertCatalogItem(item, catalogIds);
      if (item.kind !== request.kind || item.source !== request.source) {
        throw new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: 'replace-catalog-slice',
          message: `Catalog item ${item.catalogId} does not belong to ${request.source}/${request.kind}`,
        });
      }
      assertCatalogKindSourcePartition(item.kind, item.source, request.partition);
    }
    const key = partitionKey(request.partition);
    await this.connection().run(
      `DELETE FROM catalog_items
        WHERE partition_key = ? AND item_kind = ? AND source_scope = ?`,
      [key, request.kind, request.source],
    );
    for (const item of request.items) {
      await this.connection().run(
        `INSERT INTO catalog_items (
          partition_key, partition_scope, workspace_id, item_kind, source_scope,
          catalog_id, name, display_name, description, version, root_id,
          relative_path, fingerprint, enabled, diagnostic_codes_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          request.partition.scope,
          request.partition.workspaceId,
          item.kind,
          item.source,
          item.catalogId,
          item.name,
          item.displayName,
          item.description,
          item.version,
          item.rootId,
          item.relativePath,
          item.fingerprint,
          item.enabled ? 1 : 0,
          JSON.stringify(item.diagnosticCodes),
          item.updatedAt,
        ],
      );
    }
    await this.projectionVersions.increment({
      partition: request.partition,
      freshness: 'fresh',
      diagnostic: null,
      updatedAt: request.updatedAt,
    });
  }
}

class RawMarketInstallationRepository implements MarketInstallationRepository {
  constructor(private readonly connection: () => SqliteConnection) {}

  async get(packageId: string): Promise<MarketInstallationRecord | null> {
    const rows = await this.connection().all(
      `SELECT package_id, install_location, receipt_json, updated_at
         FROM market_installations WHERE package_id = ?`,
      [packageId],
    );
    return rows[0] ? decodeMarketInstallation(rows[0]) : null;
  }

  async list(): Promise<readonly MarketInstallationRecord[]> {
    const rows = await this.connection().all(
      `SELECT package_id, install_location, receipt_json, updated_at
         FROM market_installations ORDER BY updated_at DESC, package_id`,
    );
    return rows.map(decodeMarketInstallation);
  }

  async upsert(record: MarketInstallationRecord): Promise<void> {
    assertMarketInstallationRecord(record, 'metadata-transaction-failed');
    await this.connection().run(
      `INSERT INTO market_installations (
        package_id, install_location, receipt_json, updated_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(package_id) DO UPDATE SET
        install_location = excluded.install_location,
        receipt_json = excluded.receipt_json,
        updated_at = excluded.updated_at`,
      [
        record.packageId,
        record.installLocation,
        serializeJsonPayload(record, 'upsert-market-installation'),
        record.updatedAt,
      ],
    );
  }

  async delete(packageId: string): Promise<boolean> {
    const result = await this.connection().run(
      'DELETE FROM market_installations WHERE package_id = ?',
      [packageId],
    );
    return result.changes > 0;
  }
}

function decodeCatalogItem(row: SqliteRow): CatalogItemRecord {
  const kind = readString(row, 'item_kind');
  const source = readString(row, 'source_scope');
  const diagnosticCodes = parseJsonColumn(
    readString(row, 'diagnostic_codes_json'),
    'decode-catalog-diagnostic-codes',
  );
  const item: CatalogItemRecord = {
    catalogId: readString(row, 'catalog_id'),
    kind: isCatalogItemKind(kind) ? kind : failCatalogColumn('kind', kind),
    source: isCatalogItemSource(source) ? source : failCatalogColumn('source', source),
    name: readString(row, 'name'),
    displayName: readString(row, 'display_name'),
    description: readNullableString(row, 'description'),
    version: readNullableString(row, 'version'),
    rootId: readString(row, 'root_id'),
    relativePath: readString(row, 'relative_path'),
    fingerprint: readString(row, 'fingerprint'),
    enabled: readNumber(row, 'enabled') === 1,
    diagnosticCodes: Array.isArray(diagnosticCodes)
      ? diagnosticCodes.filter((code): code is string => typeof code === 'string')
      : [],
    updatedAt: readString(row, 'updated_at'),
  };
  const catalogIds = new Set<string>();
  assertCatalogItem(item, catalogIds, 'metadata-integrity-failed');
  if (
    !Array.isArray(diagnosticCodes) ||
    diagnosticCodes.length !== item.diagnosticCodes.length ||
    readNumber(row, 'enabled') < 0 ||
    readNumber(row, 'enabled') > 1
  ) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-catalog-item',
      message: `Stored catalog item is invalid: ${item.catalogId}`,
    });
  }
  return item;
}

function failCatalogColumn(field: string, value: string): never {
  throw new LocalMetadataError({
    code: 'metadata-integrity-failed',
    operation: 'decode-catalog-item',
    message: `Stored catalog ${field} is invalid: ${value}`,
  });
}

function appendCatalogFilter<T extends string>(
  clauses: string[],
  parameters: SqliteBindingValue[],
  column: string,
  values: readonly T[] | undefined,
  guard: (value: unknown) => value is T,
): void {
  if (values === undefined) return;
  const unique = [...new Set(values)];
  if (unique.length === 0 || !unique.every(guard)) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'query-catalog-items',
      message: `Catalog ${column} filter is empty or invalid`,
    });
  }
  clauses.push(`${column} IN (${unique.map(() => '?').join(', ')})`);
  parameters.push(...unique);
}

function assertCatalogPartition(partition: LocalMetadataPartition): void {
  if (partition.domain !== 'catalog') {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'catalog-partition',
      message: `Catalog repository requires the catalog domain: ${partition.domain}`,
    });
  }
  partitionKey(partition);
}

function assertCatalogKindSourcePartition(
  kind: CatalogItemKind,
  source: CatalogItemSource,
  partition: LocalMetadataPartition,
): void {
  if (!isCatalogItemKind(kind) || !isCatalogItemSource(source)) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-catalog-slice',
      message: `Catalog kind/source is invalid: ${String(source)}/${String(kind)}`,
    });
  }
  const requiresWorkspace = source === 'project';
  if (requiresWorkspace !== (partition.scope === 'workspace')) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-catalog-slice',
      message: `Catalog source ${source} does not match ${partition.scope} partition`,
    });
  }
}

function assertCatalogItem(
  item: CatalogItemRecord,
  catalogIds: Set<string>,
  code: 'metadata-transaction-failed' | 'metadata-integrity-failed' = 'metadata-transaction-failed',
): void {
  const diagnosticCodes = new Set(item.diagnosticCodes);
  if (
    !item.catalogId.trim() ||
    catalogIds.has(item.catalogId) ||
    !isCatalogItemKind(item.kind) ||
    !isCatalogItemSource(item.source) ||
    !item.name.trim() ||
    !item.displayName.trim() ||
    (item.description !== null && !item.description.trim()) ||
    (item.version !== null && !item.version.trim()) ||
    !item.rootId.trim() ||
    !item.relativePath.trim() ||
    !isPortableCatalogPath(item.relativePath) ||
    !item.fingerprint.trim() ||
    typeof item.enabled !== 'boolean' ||
    diagnosticCodes.size !== item.diagnosticCodes.length ||
    item.diagnosticCodes.some((diagnosticCode) => !diagnosticCode.trim()) ||
    !Number.isFinite(Date.parse(item.updatedAt))
  ) {
    throw new LocalMetadataError({
      code,
      operation:
        code === 'metadata-integrity-failed' ? 'decode-catalog-item' : 'replace-catalog-slice',
      message: `Catalog item is invalid or duplicated: ${item.catalogId}`,
    });
  }
  catalogIds.add(item.catalogId);
}

function isPortableCatalogPath(value: string): boolean {
  const normalized = value.replace(/\\/gu, '/');
  return (
    !normalized.startsWith('/') &&
    !/^[A-Za-z]:\//u.test(normalized) &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    !normalized.includes('/../') &&
    !normalized.startsWith('.neko/.cache/') &&
    !normalized.includes('/.neko/.cache/')
  );
}

function isCatalogItemKind(value: unknown): value is CatalogItemKind {
  return value === 'skill' || value === 'command' || value === 'processor';
}

function isCatalogItemSource(value: unknown): value is CatalogItemSource {
  return (
    value === 'builtin' ||
    value === 'personal' ||
    value === 'project' ||
    value === 'market' ||
    value === 'plugin' ||
    value === 'extension'
  );
}

function decodeMediaMetadataRecord(row: SqliteRow): MediaMetadataRecord {
  const metadata = parseJsonColumn(readString(row, 'metadata_json'), 'decode-media-metadata');
  if (!isMediaFileMetadata(metadata)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-media-metadata',
      message: 'Stored media metadata does not match the MediaFileMetadata contract',
    });
  }
  return {
    sourceKey: readString(row, 'source_key'),
    sourceMtimeMs: readFiniteNumber(row, 'source_mtime_ms'),
    metadata,
    updatedAt: readString(row, 'updated_at'),
  };
}

function assertMediaMetadataPartition(partition: LocalMetadataPartition): void {
  if (partition.domain !== 'media-metadata') {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'media-metadata-partition',
      message: `Media metadata repository requires the media-metadata domain: ${partition.domain}`,
    });
  }
  partitionKey(partition);
}

function assertMediaMetadataRecord(record: MediaMetadataRecord): void {
  assertPortableMediaSourceKey(record.sourceKey);
  if (
    !Number.isFinite(record.sourceMtimeMs) ||
    record.sourceMtimeMs < 0 ||
    !isMediaFileMetadata(record.metadata) ||
    !record.updatedAt.trim()
  ) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'upsert-media-metadata',
      message: 'Media metadata record is invalid',
    });
  }
}

function assertPortableMediaSourceKey(sourceKey: string): void {
  const normalized = sourceKey.replace(/\\/gu, '/');
  if (
    !normalized.trim() ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'media-metadata-source-key',
      message: `Media metadata source key must be portable: ${sourceKey}`,
    });
  }
}

function assertSearchDocumentPartition(partition: LocalMetadataPartition): void {
  if (partition.domain !== 'project-search') {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'search-document-partition',
      message: `Search document repository requires the project-search domain: ${partition.domain}`,
    });
  }
  partitionKey(partition);
}

function assertSearchDocumentRecord(record: SearchDocumentRecord, documentIds: Set<string>): void {
  if (!isSearchDocumentRecord(record) || documentIds.has(record.documentId)) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-search-document',
      message: `Search document is invalid or duplicated: ${record.documentId}`,
    });
  }
  if (record.fileKey) assertPortableProjectionPath(record.fileKey, 'search document fileKey');
  for (const [field, value] of [
    ['source.filePath', record.source.filePath],
    ['source.projectRelativePath', record.source.projectRelativePath],
  ] as const) {
    if (value) assertPortableProjectionPath(value, `search document ${field}`);
  }
  if (record.source.uri?.startsWith('file://')) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-search-document',
      message: 'Search documents cannot persist file URI runtime paths',
    });
  }
  documentIds.add(record.documentId);
}

function isSearchDocumentRecord(value: unknown): value is SearchDocumentRecord {
  if (!isRecord(value) || !isRecord(value['source'])) return false;
  const source = value['source'];
  return (
    typeof value['documentId'] === 'string' &&
    value['documentId'].trim().length > 0 &&
    isProjectSearchPartitionKind(value['partition']) &&
    isProjectSearchItemKind(value['kind']) &&
    typeof value['label'] === 'string' &&
    value['label'].trim().length > 0 &&
    optionalStringValue(value['description']) &&
    isProjectSearchPartitionKind(source['partition']) &&
    optionalStringValue(source['filePath']) &&
    optionalStringValue(source['projectRelativePath']) &&
    optionalStringValue(source['uri']) &&
    optionalStringValue(value['fileKey']) &&
    optionalStringValue(value['canonicalName']) &&
    (value['aliases'] === undefined ||
      (Array.isArray(value['aliases']) &&
        value['aliases'].every((alias) => typeof alias === 'string'))) &&
    typeof value['searchText'] === 'string' &&
    isProjectIndexFreshness(value['freshness']) &&
    (value['metadata'] === undefined || isRecord(value['metadata'])) &&
    typeof value['updatedAt'] === 'string' &&
    Number.isFinite(Date.parse(value['updatedAt']))
  );
}

function optionalStringValue(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function assertPortableProjectionPath(value: string, field: string): void {
  const normalized = value.replace(/\\/gu, '/');
  if (
    !normalized.trim() ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.includes('/.neko/.cache/') ||
    normalized.startsWith('.neko/.cache/')
  ) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'search-document-portable-path',
      message: `${field} must be a portable non-cache path: ${value}`,
    });
  }
}

function createFtsMatchQuery(text: string): string | null {
  const terms = text
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/gu, '""')}"*`);
  return terms.length > 0 ? terms.join(' AND ') : null;
}

function projectionFreshnessUpdate(
  records: readonly { readonly freshness: string }[],
  staleDiagnostic: string,
): {
  readonly freshness: 'fresh' | 'stale';
  readonly diagnostic: string | null;
} {
  return records.every((record) => record.freshness === 'fresh')
    ? { freshness: 'fresh', diagnostic: null }
    : { freshness: 'stale', diagnostic: staleDiagnostic };
}

function assertSemanticProjectionPartition(partition: LocalMetadataPartition): void {
  if (partition.domain !== 'semantic-projection') {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'semantic-projection-partition',
      message: `Semantic repository requires the semantic-projection domain: ${partition.domain}`,
    });
  }
  partitionKey(partition);
}

function assertSemanticProjectionRecord(
  record: SemanticProjectionRecord,
  sourceIds: Set<string>,
): void {
  if (
    !record.sourceId.trim() ||
    sourceIds.has(record.sourceId) ||
    !record.sourceFingerprint.trim() ||
    !isSemanticProviderMetadata(record.provider) ||
    !record.coverage.every(isProjectSemanticCoverageAnalysisKind) ||
    !isProjectIndexFreshness(record.freshness) ||
    !isMediaSemanticIndex(record.index) ||
    Object.prototype.hasOwnProperty.call(record.index, 'textSegments') ||
    !Array.isArray(record.evidence) ||
    !record.evidence.every(isSemanticEvidenceProjection) ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-semantic-projection',
      message: `Semantic projection is invalid or duplicated: ${record.sourceId}`,
    });
  }
  sourceIds.add(record.sourceId);
}

function splitSemanticProjection(record: SemanticProjectionRecord): {
  readonly indexMetadata: Omit<
    SemanticProjectionRecord['index'],
    'entityMentions' | 'semanticTags' | 'perceptionRefs'
  >;
  readonly evidence: readonly EncodedSemanticEvidence[];
} {
  const { entityMentions, semanticTags, perceptionRefs, ...indexMetadata } = record.index;
  const evidence: EncodedSemanticEvidence[] = [];
  let ordinal = 0;
  for (const item of record.evidence) {
    evidence.push({
      kind: 'text-segment',
      evidenceId: item.evidenceId,
      ordinal: ordinal++,
      payload: item,
    });
  }
  for (const mention of entityMentions ?? []) {
    evidence.push({
      kind: 'entity-mention',
      evidenceId: mention.mentionId,
      ordinal: ordinal++,
      payload: mention,
    });
  }
  for (const tag of semanticTags ?? []) {
    evidence.push({
      kind: 'semantic-tag',
      evidenceId: tag.tagId,
      ordinal: ordinal++,
      payload: tag,
    });
  }
  for (const [refIndex, ref] of (perceptionRefs ?? []).entries()) {
    evidence.push({
      kind: 'perception-ref',
      evidenceId: ref.cacheKey ?? ref.sourceToolCallId ?? `${ref.assetId}:${refIndex}`,
      ordinal: ordinal++,
      payload: ref,
    });
  }
  const identities = new Set<string>();
  for (const item of evidence) {
    const identity = `${item.kind}:${item.evidenceId}`;
    if (!item.evidenceId.trim() || identities.has(identity)) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'replace-semantic-evidence',
        message: `Semantic evidence identity is empty or duplicated: ${identity}`,
      });
    }
    identities.add(identity);
  }
  return { indexMetadata, evidence };
}

function isSemanticProviderMetadata(value: unknown): value is SemanticProjectionRecord['provider'] {
  if (!isRecord(value) || typeof value['providerId'] !== 'string') return false;
  return [
    value['model'],
    value['modelVersion'],
    value['chunkingVersion'],
    value['sourceIdentity'],
    value['indexVersion'],
    value['schemaVersion'],
    value['skillId'],
    value['skillVersion'],
  ].every(optionalStringValue);
}

function isSemanticEvidenceKind(value: string): value is SemanticEvidenceKind {
  return (
    value === 'text-segment' ||
    value === 'entity-mention' ||
    value === 'semantic-tag' ||
    value === 'perception-ref'
  );
}

function assertEntityAssetProjectionPartition(partition: LocalMetadataPartition): void {
  if (partition.domain !== 'entity-asset-projection') {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'entity-asset-projection-partition',
      message: `Entity/Asset repository requires the entity-asset-projection domain: ${partition.domain}`,
    });
  }
  partitionKey(partition);
}

function appendProjectionStringFilter(
  clauses: string[],
  parameters: SqliteBindingValue[],
  column: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  assertNonEmptyProjectionFilter(value, column);
  clauses.push(`${column} = ?`);
  parameters.push(value);
}

function assertNonEmptyProjectionFilter(value: string, field: string): void {
  if (!value.trim()) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'query-entity-asset-projections',
      message: `Entity/Asset projection ${field} must not be empty`,
    });
  }
}

function decodeEntityAssetProjection(row: SqliteRow): EntityAssetProjectionRecord {
  const parsed = parseJsonColumn(
    readString(row, 'projection_json'),
    'decode-entity-asset-projection',
  );
  if (!isEntityAssetProjectionRecord(parsed)) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-entity-asset-projection',
      message: 'Stored Entity/Asset projection does not match its typed contract',
    });
  }
  const comparisons: ReadonlyArray<[unknown, unknown, string]> = [
    [parsed.kind, readString(row, 'projection_kind'), 'kind'],
    [parsed.projectionId, readString(row, 'projection_id'), 'projectionId'],
    [parsed.sourceId, readString(row, 'source_id'), 'sourceId'],
    [parsed.entityId ?? null, readNullableString(row, 'entity_id'), 'entityId'],
    [
      parsed.relatedEntityId ?? null,
      readNullableString(row, 'related_entity_id'),
      'relatedEntityId',
    ],
    [parsed.candidateId ?? null, readNullableString(row, 'candidate_id'), 'candidateId'],
    [parsed.assetRef ?? null, readNullableString(row, 'asset_ref'), 'assetRef'],
    [parsed.freshness, readString(row, 'freshness'), 'freshness'],
    [parsed.updatedAt, readString(row, 'updated_at'), 'updatedAt'],
  ];
  const mismatch = comparisons.find(([left, right]) => left !== right);
  if (mismatch) {
    throw new LocalMetadataError({
      code: 'metadata-integrity-failed',
      operation: 'decode-entity-asset-projection',
      message: `Stored Entity/Asset projection column does not match payload: ${mismatch[2]}`,
    });
  }
  return parsed;
}

function assertEntityAssetProjectionRecord(
  record: EntityAssetProjectionRecord,
  identities: Set<string>,
): void {
  const identity = `${record.kind}:${record.projectionId}`;
  if (!isEntityAssetProjectionRecord(record) || identities.has(identity)) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-entity-asset-projection',
      message: `Entity/Asset projection is invalid or duplicated: ${identity}`,
    });
  }
  identities.add(identity);
}

function isEntityAssetProjectionRecord(value: unknown): value is EntityAssetProjectionRecord {
  if (
    !isRecord(value) ||
    !isEntityAssetProjectionKind(value['kind']) ||
    typeof value['projectionId'] !== 'string' ||
    !value['projectionId'].trim() ||
    typeof value['sourceId'] !== 'string' ||
    !value['sourceId'].trim() ||
    !optionalNonEmptyString(value['entityId']) ||
    !optionalNonEmptyString(value['relatedEntityId']) ||
    !optionalNonEmptyString(value['candidateId']) ||
    !optionalPortableAssetRef(value['assetRef']) ||
    !isProjectIndexFreshness(value['freshness']) ||
    typeof value['updatedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['updatedAt']))
  ) {
    return false;
  }
  switch (value['kind']) {
    case 'asset-graph-node':
      return isCreativeGraphNode(value['value']);
    case 'asset-graph-edge':
      return isCreativeRelationEdge(value['value']);
    case 'entity-occurrence':
      return isCreativeEntityOccurrenceProjection(value['value']);
    case 'entity-relationship':
      return isCreativeEntityRelationshipProjection(value['value']);
    case 'entity-candidate':
      return (
        isCreativeEntityCandidate(value['value']) &&
        value['candidateId'] === value['value'].id &&
        isCandidateProjectionPortable(value['value'])
      );
    case 'binding-availability':
      return (
        isEntityBindingAvailabilityProjectionValue(value['value']) &&
        value['entityId'] === value['value'].entityId &&
        value['assetRef'] === value['value'].assetRef
      );
  }
}

function isEntityAssetProjectionKind(value: unknown): value is EntityAssetProjectionKind {
  return (
    value === 'asset-graph-node' ||
    value === 'asset-graph-edge' ||
    value === 'entity-occurrence' ||
    value === 'entity-relationship' ||
    value === 'entity-candidate' ||
    value === 'binding-availability'
  );
}

function isCreativeGraphNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].trim().length > 0 &&
    (value['kind'] === 'entity' ||
      value['kind'] === 'occurrence' ||
      value['kind'] === 'asset' ||
      value['kind'] === 'canvas-node' ||
      value['kind'] === 'script-range' ||
      value['kind'] === 'generated-asset') &&
    optionalPortableProjectionRef(value['refId']) &&
    optionalNonEmptyString(value['label'])
  );
}

function isCreativeRelationEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['from'] === 'string' &&
    value['from'].trim().length > 0 &&
    typeof value['to'] === 'string' &&
    value['to'].trim().length > 0 &&
    typeof value['type'] === 'string' &&
    value['type'].trim().length > 0 &&
    (value['strength'] === 'confirmed' || value['strength'] === 'inferred') &&
    (value['confidence'] === undefined ||
      (typeof value['confidence'] === 'number' && Number.isFinite(value['confidence']))) &&
    (value['provenance'] === undefined ||
      value['provenance'] === 'user' ||
      value['provenance'] === 'lineage' ||
      value['provenance'] === 'rule' ||
      value['provenance'] === 'ai' ||
      value['provenance'] === 'import')
  );
}

function isCreativeEntityOccurrenceProjection(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    optionalNonEmptyString(value['candidateId']) &&
    typeof value['label'] === 'string' &&
    value['label'].trim().length > 0 &&
    isCreativeEntitySourceMetadata(value['source']) &&
    (value['role'] === 'definition' || value['role'] === 'reference') &&
    typeof value['location'] === 'string' &&
    value['location'].trim().length > 0 &&
    isPortableProjectionRef(value['location']) &&
    optionalNonEmptyString(value['detail'])
  );
}

function isCreativeEntityRelationshipProjection(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCreativeEntityRef(value['from']) &&
    isCreativeEntityRef(value['to']) &&
    typeof value['type'] === 'string' &&
    value['type'].trim().length > 0 &&
    optionalNonEmptyString(value['strength']) &&
    isCreativeEntitySourceMetadata(value['source']) &&
    (value['confidence'] === undefined ||
      (typeof value['confidence'] === 'number' && Number.isFinite(value['confidence'])))
  );
}

function isCreativeEntityRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['entityId'] === 'string' &&
    value['entityId'].trim().length > 0 &&
    isCreativeEntityKind(value['entityKind']) &&
    optionalPortableProjectionRef(value['projectRoot']) &&
    optionalNonEmptyString(value['source'])
  );
}

function isCreativeEntitySourceMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['sourceId'] === 'string' &&
    value['sourceId'].trim().length > 0 &&
    (value['sourceKind'] === 'registry' ||
      value['sourceKind'] === 'candidate' ||
      value['sourceKind'] === 'story' ||
      value['sourceKind'] === 'canvas' ||
      value['sourceKind'] === 'asset' ||
      value['sourceKind'] === 'agent' ||
      value['sourceKind'] === 'document' ||
      value['sourceKind'] === 'importer' ||
      value['sourceKind'] === 'generated') &&
    optionalPortableProjectionRef(value['sourceRef']) &&
    optionalNonEmptyString(value['providerId']) &&
    (value['freshness'] === undefined || isProjectIndexFreshness(value['freshness'])) &&
    (value['updatedAt'] === undefined ||
      (typeof value['updatedAt'] === 'string' &&
        Number.isFinite(Date.parse(value['updatedAt'])))) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isEntityBindingAvailabilityProjectionValue(
  value: unknown,
): value is EntityBindingAvailabilityProjectionValue {
  return (
    isRecord(value) &&
    typeof value['bindingId'] === 'string' &&
    value['bindingId'].trim().length > 0 &&
    typeof value['entityId'] === 'string' &&
    value['entityId'].trim().length > 0 &&
    isCreativeEntityKind(value['entityKind']) &&
    typeof value['assetRef'] === 'string' &&
    optionalPortableAssetRef(value['assetRef']) &&
    isEntityAssetBindingRole(value['role']) &&
    (value['status'] === 'suggested' ||
      value['status'] === 'confirmed' ||
      value['status'] === 'rejected') &&
    isEntityAssetBindingAvailability(value['availability']) &&
    (value['orphanedAt'] === undefined ||
      (typeof value['orphanedAt'] === 'string' &&
        Number.isFinite(Date.parse(value['orphanedAt'])))) &&
    (value['isDefault'] === undefined || typeof value['isDefault'] === 'boolean')
  );
}

function optionalNonEmptyString(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0);
}

function optionalPortableAssetRef(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = value.replace(/\\/gu, '/');
  return (
    !/^([A-Za-z]:\/|\/)/u.test(normalized) &&
    !normalized.includes('/.neko/.cache/') &&
    !normalized.startsWith('.neko/.cache/')
  );
}

function optionalPortableProjectionRef(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && isPortableProjectionRef(value));
}

function isPortableProjectionRef(value: string): boolean {
  if (!value.trim()) return false;
  const normalized = value.replace(/\\/gu, '/');
  return (
    !/^([A-Za-z]:\/|\/)/u.test(normalized) &&
    !normalized.includes('/.neko/.cache/') &&
    !normalized.startsWith('.neko/.cache/')
  );
}

function isCandidateProjectionPortable(
  candidate: Extract<EntityAssetProjectionRecord, { readonly kind: 'entity-candidate' }>['value'],
): boolean {
  return (
    candidate.sourceRefs.every(isPortableProjectionRef) &&
    candidate.provenance.every(
      (item) =>
        (item.sourceRef === undefined || isPortableProjectionRef(item.sourceRef)) &&
        !containsForbiddenProjectionMetadataPath(item.metadata),
    ) &&
    (candidate.resolvedEntityRef?.projectRoot === undefined ||
      isPortableProjectionRef(candidate.resolvedEntityRef.projectRoot)) &&
    !containsForbiddenProjectionMetadataPath(candidate.metadata)
  );
}

function containsForbiddenProjectionMetadataPath(
  value: Record<string, unknown> | undefined,
): boolean {
  if (!value) return false;
  return Object.entries(value).some(([key, entry]) => {
    if (
      (key === 'projectRoot' || key === 'absolutePath' || key === 'cachePath') &&
      typeof entry === 'string' &&
      !isPortableProjectionRef(entry)
    ) {
      return true;
    }
    if (Array.isArray(entry)) {
      return entry.some((item) =>
        isRecord(item) ? containsForbiddenProjectionMetadataPath(item) : false,
      );
    }
    return isRecord(entry) ? containsForbiddenProjectionMetadataPath(entry) : false;
  });
}

function isMediaFileMetadata(value: unknown): value is MediaFileMetadata {
  return (
    isRecord(value) &&
    typeof value['fileSize'] === 'number' &&
    Number.isFinite(value['fileSize']) &&
    value['fileSize'] >= 0 &&
    typeof value['mimeType'] === 'string' &&
    value['mimeType'].trim().length > 0
  );
}

function assertResourceCachePartition(partition: LocalMetadataPartition): void {
  if (partition.domain !== 'resource-cache') {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'resource-cache-partition',
      message: `ResourceCache repository requires the resource-cache domain: ${partition.domain}`,
    });
  }
  partitionKey(partition);
}

function assertResourceCacheEntryForPartition(
  entry: ResourceCacheEntry,
  partition: LocalMetadataPartition,
  resourceIds: Set<string>,
): void {
  if (!isResourceCacheEntry(entry) || !entry.resource.id.trim()) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-resource-cache-entry',
      message: 'ResourceCache replacement contains an invalid entry',
    });
  }
  if (resourceIds.has(entry.resource.id)) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-resource-cache-entry',
      message: `ResourceCache replacement contains duplicate resource ${entry.resource.id}`,
    });
  }
  if (
    (partition.scope === 'workspace' && entry.resource.scope !== 'project') ||
    (partition.scope === 'global' && entry.resource.scope === 'project')
  ) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-resource-cache-entry',
      message: `Resource ${entry.resource.id} scope does not match its metadata partition`,
    });
  }
  resourceIds.add(entry.resource.id);
}

function assertResourceCacheVariant(
  variant: ResourceCacheVariantEntry,
  resourceId: string,
  variantKeys: Set<string>,
): void {
  if (!variant.key.trim() || variantKeys.has(variant.key)) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-resource-cache-variant',
      message: `Resource ${resourceId} contains an empty or duplicate variant key`,
    });
  }
  if (
    variant.absolutePath !== undefined ||
    variant.relativePath?.startsWith('/') ||
    /^[A-Za-z]:[\\/]/u.test(variant.relativePath ?? '')
  ) {
    throw new LocalMetadataError({
      code: 'metadata-transaction-failed',
      operation: 'replace-resource-cache-variant',
      message: `Resource ${resourceId} variant ${variant.key} cannot persist an absolute cache path`,
    });
  }
  variantKeys.add(variant.key);
}

class RawProjectionVersionRepository implements ProjectionVersionRepository {
  constructor(private readonly connection: () => SqliteConnection) {}

  async get(partition: LocalMetadataPartition): Promise<LocalMetadataPartitionRevision | null> {
    const rows = await this.connection().all(
      `SELECT partition_scope, workspace_id, domain, revision, freshness, diagnostic, updated_at
         FROM projection_versions WHERE partition_key = ?`,
      [partitionKey(partition)],
    );
    const row = rows[0];
    return row ? decodeProjectionVersion(row) : null;
  }

  async increment(update: ProjectionVersionUpdate): Promise<LocalMetadataPartitionRevision> {
    return this.write(update);
  }

  async markStale(update: ProjectionVersionUpdate): Promise<LocalMetadataPartitionRevision> {
    if (update.freshness !== 'stale') {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'mark-projection-stale',
        message: 'markStale requires stale freshness',
      });
    }
    return this.write(update);
  }

  private async write(update: ProjectionVersionUpdate): Promise<LocalMetadataPartitionRevision> {
    const rows = await this.connection().all(
      `INSERT INTO projection_versions (
        partition_key, partition_scope, workspace_id, domain,
        revision, freshness, diagnostic, updated_at
      ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(partition_key) DO UPDATE SET
        revision = projection_versions.revision + 1,
        freshness = excluded.freshness,
        diagnostic = excluded.diagnostic,
        updated_at = excluded.updated_at
      RETURNING partition_scope, workspace_id, domain, revision, freshness, diagnostic, updated_at`,
      [
        partitionKey(update.partition),
        update.partition.scope,
        update.partition.workspaceId,
        update.partition.domain,
        update.freshness,
        update.diagnostic,
        update.updatedAt,
      ],
    );
    return decodeProjectionVersion(requireRow(rows[0], 'write-projection-version'));
  }
}

class RawCacheMaintenanceRepository implements LocalMetadataCacheMaintenanceRepository {
  constructor(
    private readonly connection: () => SqliteConnection,
    private readonly workspaces: WorkspaceRegistryRepository,
    private readonly projectionVersions: ProjectionVersionRepository,
  ) {}

  async clearPartition(
    request: LocalMetadataCachePartitionCleanupRequest,
  ): Promise<LocalMetadataCachePartitionCleanupResult> {
    if (
      request.table !== 'conversations' &&
      request.table !== 'resource_cache_entries' &&
      request.table !== 'media_metadata' &&
      request.table !== 'search_documents' &&
      request.table !== 'semantic_sources' &&
      request.table !== 'entity_asset_projections' &&
      request.table !== 'catalog_items'
    ) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'clear-cache-partition',
        message: `Cache table is not allowlisted for cleanup: ${String(request.table)}`,
      });
    }
    const result =
      request.table === 'conversations'
        ? request.partition.workspaceId === null
          ? await this.connection().run('DELETE FROM conversations WHERE workspace_id IS NULL')
          : await this.connection().run('DELETE FROM conversations WHERE workspace_id = ?', [
              request.partition.workspaceId,
            ])
        : request.table === 'resource_cache_entries'
          ? await this.connection().run(
              'DELETE FROM resource_cache_entries WHERE partition_key = ?',
              [partitionKey(request.partition)],
            )
          : request.table === 'media_metadata'
            ? await this.connection().run('DELETE FROM media_metadata WHERE partition_key = ?', [
                partitionKey(request.partition),
              ])
            : request.table === 'search_documents'
              ? await this.connection().run(
                  'DELETE FROM search_documents WHERE partition_key = ?',
                  [partitionKey(request.partition)],
                )
              : request.table === 'semantic_sources'
                ? await this.connection().run(
                    'DELETE FROM semantic_sources WHERE partition_key = ?',
                    [partitionKey(request.partition)],
                  )
                : request.table === 'entity_asset_projections'
                  ? await this.connection().run(
                      'DELETE FROM entity_asset_projections WHERE partition_key = ?',
                      [partitionKey(request.partition)],
                    )
                  : await this.connection().run(
                      'DELETE FROM catalog_items WHERE partition_key = ?',
                      [partitionKey(request.partition)],
                    );
    await this.projectionVersions.markStale({
      partition: request.partition,
      freshness: 'stale',
      diagnostic: `cache-cleared:${request.reason}`,
      updatedAt: request.updatedAt,
    });
    return { deletedRows: result.changes };
  }

  async collectOrphanedPartitions(
    request: LocalMetadataOrphanCacheGcRequest,
  ): Promise<LocalMetadataOrphanCacheGcResult> {
    if (!Number.isSafeInteger(request.orphanRetentionMs) || request.orphanRetentionMs < 0) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'collect-orphaned-cache-partitions',
        message: `Orphan retention must be a non-negative integer: ${request.orphanRetentionMs}`,
      });
    }
    const collectedAt = parseMetadataTimestamp(
      request.collectedAt,
      'collect-orphaned-cache-partitions',
    );
    const orphans = await this.workspaces.listOrphans();
    const clearedWorkspaceIds: string[] = [];
    let deletedRows = 0;
    for (const orphan of orphans) {
      const orphanedAt = parseMetadataTimestamp(
        orphan.orphanedAt,
        'collect-orphaned-cache-partitions',
      );
      if (orphanedAt > collectedAt) {
        throw new LocalMetadataError({
          code: 'metadata-integrity-failed',
          operation: 'collect-orphaned-cache-partitions',
          message: `Workspace ${orphan.workspaceId} has a future orphan timestamp`,
        });
      }
      if (collectedAt - orphanedAt < request.orphanRetentionMs) continue;
      const result = await this.clearPartition({
        table: request.table,
        partition: {
          scope: 'workspace',
          workspaceId: orphan.workspaceId,
          domain:
            request.table === 'resource_cache_entries'
              ? 'resource-cache'
              : request.table === 'media_metadata'
                ? 'media-metadata'
                : request.table === 'search_documents'
                  ? 'project-search'
                  : request.table === 'semantic_sources'
                    ? 'semantic-projection'
                    : request.table === 'entity_asset_projections'
                      ? 'entity-asset-projection'
                      : request.table === 'catalog_items'
                        ? 'catalog'
                        : 'conversations',
        },
        reason: 'orphan-gc',
        updatedAt: request.collectedAt,
      });
      clearedWorkspaceIds.push(orphan.workspaceId);
      deletedRows += result.deletedRows;
    }
    return { scannedOrphans: orphans.length, clearedWorkspaceIds, deletedRows };
  }

  async vacuum(): Promise<void> {
    await this.connection().exec('VACUUM');
  }
}

class ExclusiveWorkspaceRegistryRepository implements WorkspaceRegistryRepository {
  constructor(
    private readonly raw: WorkspaceRegistryRepository,
    private readonly exclusive: ExclusiveCoordinator,
  ) {}

  get(workspaceId: string): Promise<WorkspaceRegistryRecord | null> {
    return this.exclusive.run(() => this.raw.get(workspaceId));
  }
  findByCurrentLocator(
    locator: WorkspacePortableLocator,
  ): Promise<readonly WorkspaceRegistryRecord[]> {
    return this.exclusive.run(() => this.raw.findByCurrentLocator(locator));
  }
  listOrphans(): Promise<readonly WorkspaceRegistryRecord[]> {
    return this.exclusive.run(() => this.raw.listOrphans());
  }
  bind(request: WorkspaceBindRequest): Promise<WorkspaceRegistryRecord> {
    return this.exclusive.run(() => this.raw.bind(request));
  }
  rebind(request: WorkspaceRebindRequest): Promise<WorkspaceRegistryRecord> {
    return this.exclusive.run(() => this.raw.rebind(request));
  }
  markSeen(workspaceId: string, seenAt: string): Promise<WorkspaceRegistryRecord> {
    return this.exclusive.run(() => this.raw.markSeen(workspaceId, seenAt));
  }
  markOrphaned(workspaceId: string, orphanedAt: string): Promise<WorkspaceRegistryRecord> {
    return this.exclusive.run(() => this.raw.markOrphaned(workspaceId, orphanedAt));
  }
}

class ExclusiveConversationCatalogRepository implements ConversationCatalogRepository {
  constructor(
    private readonly raw: ConversationCatalogRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: (
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<void>,
    ) => Promise<void>,
  ) {}

  get(conversationId: string): Promise<ConversationCatalogRecord | null> {
    return this.exclusive.run(() => this.raw.get(conversationId));
  }
  list(query: ConversationCatalogQuery): Promise<readonly ConversationCatalogRecord[]> {
    return this.exclusive.run(() => this.raw.list(query));
  }
  upsert(record: ConversationCatalogRecord): Promise<void> {
    return this.exclusive.run(() => this.raw.upsert(record));
  }
  delete(conversationId: string): Promise<boolean> {
    return this.exclusive.run(() => this.raw.delete(conversationId));
  }
  replaceProjection(request: ConversationProjectionReplaceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replaceProjection(request)),
    );
  }
  deleteWorkspaceProjection(workspaceId: string): Promise<void> {
    return this.exclusive.run(() => this.raw.deleteWorkspaceProjection(workspaceId));
  }
}

class ExclusiveTaskStateRepository implements TaskStateRepository {
  constructor(
    private readonly raw: TaskStateRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  get(workspaceId: string, taskKey: string): Promise<TaskStateRecord | null> {
    return this.exclusive.run(() => this.raw.get(workspaceId, taskKey));
  }
  list(query: TaskStateQuery): Promise<readonly TaskStateRecord[]> {
    return this.exclusive.run(() => this.raw.list(query));
  }
  upsert(record: TaskStateRecord): Promise<void> {
    return this.exclusive.run(() => this.transaction('state-write', () => this.raw.upsert(record)));
  }
  delete(workspaceId: string, taskKey: string): Promise<boolean> {
    return this.exclusive.run(() =>
      this.transaction('state-write', () => this.raw.delete(workspaceId, taskKey)),
    );
  }
  deleteWorkspace(workspaceId: string): Promise<number> {
    return this.exclusive.run(() =>
      this.transaction('state-write', () => this.raw.deleteWorkspace(workspaceId)),
    );
  }
}

class ExclusiveTaskCheckpointRepository implements TaskCheckpointRepository {
  constructor(
    private readonly raw: TaskCheckpointRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  get(workspaceId: string, taskKey: string): Promise<TaskCheckpointRecord | null> {
    return this.exclusive.run(() => this.raw.get(workspaceId, taskKey));
  }
  list(workspaceId: string): Promise<readonly TaskCheckpointRecord[]> {
    return this.exclusive.run(() => this.raw.list(workspaceId));
  }
  upsert(record: TaskCheckpointRecord): Promise<void> {
    return this.exclusive.run(() => this.transaction('state-write', () => this.raw.upsert(record)));
  }
  delete(workspaceId: string, taskKey: string): Promise<boolean> {
    return this.exclusive.run(() =>
      this.transaction('state-write', () => this.raw.delete(workspaceId, taskKey)),
    );
  }
  clearWorkspace(workspaceId: string): Promise<number> {
    return this.exclusive.run(() =>
      this.transaction('state-write', () => this.raw.clearWorkspace(workspaceId)),
    );
  }
}

class ExclusiveResourceCacheMetadataRepository implements ResourceCacheMetadataRepository {
  constructor(
    private readonly raw: ResourceCacheMetadataRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  get(partition: LocalMetadataPartition, resourceId: string): Promise<ResourceCacheEntry | null> {
    return this.exclusive.run(() => this.raw.get(partition, resourceId));
  }

  list(partition: LocalMetadataPartition): Promise<readonly ResourceCacheEntry[]> {
    return this.exclusive.run(() => this.raw.list(partition));
  }

  replacePartition(request: ResourceCacheProjectionReplaceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replacePartition(request)),
    );
  }
}

class ExclusiveMediaMetadataRepository implements MediaMetadataRepository {
  constructor(
    private readonly raw: MediaMetadataRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  get(partition: LocalMetadataPartition, sourceKey: string): Promise<MediaMetadataRecord | null> {
    return this.exclusive.run(() => this.raw.get(partition, sourceKey));
  }

  list(partition: LocalMetadataPartition): Promise<readonly MediaMetadataRecord[]> {
    return this.exclusive.run(() => this.raw.list(partition));
  }

  upsert(request: MediaMetadataUpsertRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.upsert(request)),
    );
  }

  delete(partition: LocalMetadataPartition, sourceKey: string): Promise<boolean> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.delete(partition, sourceKey)),
    );
  }
}

class ExclusiveSearchDocumentRepository implements SearchDocumentRepository {
  constructor(
    private readonly raw: SearchDocumentRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  list(partition: LocalMetadataPartition): Promise<readonly SearchDocumentRecord[]> {
    return this.exclusive.run(() => this.raw.list(partition));
  }

  query(query: SearchDocumentQuery): Promise<readonly SearchDocumentRecord[]> {
    return this.exclusive.run(() => this.raw.query(query));
  }

  replacePartition(request: SearchDocumentProjectionReplaceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replacePartition(request)),
    );
  }

  replaceSearchPartition(request: SearchDocumentPartitionReplaceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replaceSearchPartition(request)),
    );
  }

  insertMissingSearchPartition(
    request: SearchDocumentPartitionReplaceRequest,
  ): Promise<SearchDocumentInsertMissingResult> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.insertMissingSearchPartition(request)),
    );
  }
}

class ExclusiveSemanticProjectionRepository implements SemanticProjectionRepository {
  constructor(
    private readonly raw: SemanticProjectionRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  list(partition: LocalMetadataPartition): Promise<readonly SemanticProjectionRecord[]> {
    return this.exclusive.run(() => this.raw.list(partition));
  }

  get(
    partition: LocalMetadataPartition,
    sourceId: string,
  ): Promise<SemanticProjectionRecord | null> {
    return this.exclusive.run(() => this.raw.get(partition, sourceId));
  }

  replacePartition(request: SemanticProjectionReplaceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replacePartition(request)),
    );
  }

  replaceSource(request: SemanticProjectionReplaceSourceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replaceSource(request)),
    );
  }

  deleteSource(
    partition: LocalMetadataPartition,
    sourceId: string,
    updatedAt: string,
  ): Promise<boolean> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.deleteSource(partition, sourceId, updatedAt)),
    );
  }

  clearBodyBearingSources(
    partition: LocalMetadataPartition,
    updatedAt: string,
  ): Promise<readonly string[]> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.clearBodyBearingSources(partition, updatedAt)),
    );
  }

  insertMissing(
    request: SemanticProjectionReplaceRequest,
  ): Promise<SemanticProjectionInsertMissingResult> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.insertMissing(request)),
    );
  }
}

class ExclusiveEntityAssetProjectionRepository implements EntityAssetProjectionRepository {
  constructor(
    private readonly raw: EntityAssetProjectionRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  list(query: EntityAssetProjectionQuery): Promise<readonly EntityAssetProjectionRecord[]> {
    return this.exclusive.run(() => this.raw.list(query));
  }

  replaceSource(request: EntityAssetProjectionReplaceSourceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replaceSource(request)),
    );
  }

  insertMissing(
    request: EntityAssetProjectionReplaceSourceRequest,
  ): Promise<EntityAssetProjectionInsertMissingResult> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.insertMissing(request)),
    );
  }
}

class ExclusiveCatalogProjectionRepository implements CatalogProjectionRepository {
  constructor(
    private readonly raw: CatalogProjectionRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  list(query: CatalogItemQuery): Promise<readonly CatalogItemRecord[]> {
    return this.exclusive.run(() => this.raw.list(query));
  }

  replaceSlice(request: CatalogProjectionReplaceSliceRequest): Promise<void> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.replaceSlice(request)),
    );
  }
}

class ExclusiveMarketInstallationRepository implements MarketInstallationRepository {
  constructor(
    private readonly raw: MarketInstallationRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  get(packageId: string): Promise<MarketInstallationRecord | null> {
    return this.exclusive.run(() => this.raw.get(packageId));
  }

  list(): Promise<readonly MarketInstallationRecord[]> {
    return this.exclusive.run(() => this.raw.list());
  }

  upsert(record: MarketInstallationRecord): Promise<void> {
    return this.exclusive.run(() => this.transaction('state-write', () => this.raw.upsert(record)));
  }

  delete(packageId: string): Promise<boolean> {
    return this.exclusive.run(() =>
      this.transaction('state-write', () => this.raw.delete(packageId)),
    );
  }
}

class ExclusiveProjectionVersionRepository implements ProjectionVersionRepository {
  constructor(
    private readonly raw: ProjectionVersionRepository,
    private readonly exclusive: ExclusiveCoordinator,
  ) {}

  get(partition: LocalMetadataPartition): Promise<LocalMetadataPartitionRevision | null> {
    return this.exclusive.run(() => this.raw.get(partition));
  }
  increment(update: ProjectionVersionUpdate): Promise<LocalMetadataPartitionRevision> {
    return this.exclusive.run(() => this.raw.increment(update));
  }
  markStale(update: ProjectionVersionUpdate): Promise<LocalMetadataPartitionRevision> {
    return this.exclusive.run(() => this.raw.markStale(update));
  }
}

class ExclusiveCacheMaintenanceRepository implements LocalMetadataCacheMaintenanceRepository {
  constructor(
    private readonly raw: LocalMetadataCacheMaintenanceRepository,
    private readonly exclusive: ExclusiveCoordinator,
    private readonly transaction: <T>(
      mode: LocalMetadataTransactionMode,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}

  clearPartition(
    request: LocalMetadataCachePartitionCleanupRequest,
  ): Promise<LocalMetadataCachePartitionCleanupResult> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.clearPartition(request)),
    );
  }

  collectOrphanedPartitions(
    request: LocalMetadataOrphanCacheGcRequest,
  ): Promise<LocalMetadataOrphanCacheGcResult> {
    return this.exclusive.run(() =>
      this.transaction('cache-write', () => this.raw.collectOrphanedPartitions(request)),
    );
  }

  vacuum(): Promise<void> {
    return this.exclusive.run(() => this.raw.vacuum());
  }
}

export class SqliteLocalMetadataStore implements LocalMetadataStore {
  private connection: SqliteConnection | null = null;
  private readonly exclusive = new ExclusiveCoordinator();
  private readonly rawRepositories: LocalMetadataRepositories;
  readonly repositories: LocalMetadataRepositories;
  state: LocalMetadataStoreState = 'closed';

  constructor(private readonly options: SqliteLocalMetadataStoreOptions) {
    const getConnection = (): SqliteConnection => this.requireConnection('repository-operation');
    const workspaces = new RawWorkspaceRegistryRepository(getConnection);
    const conversations = new RawConversationCatalogRepository(getConnection);
    const tasks = new RawTaskStateRepository(getConnection);
    const taskCheckpoints = new RawTaskCheckpointRepository(getConnection);
    const projectionVersions = new RawProjectionVersionRepository(getConnection);
    const resourceCache = new RawResourceCacheMetadataRepository(getConnection, projectionVersions);
    const mediaMetadata = new RawMediaMetadataRepository(getConnection, projectionVersions);
    const searchDocuments = new RawSearchDocumentRepository(getConnection, projectionVersions);
    const semanticProjections = new RawSemanticProjectionRepository(
      getConnection,
      projectionVersions,
    );
    const entityAssetProjections = new RawEntityAssetProjectionRepository(
      getConnection,
      projectionVersions,
    );
    const catalogItems = new RawCatalogProjectionRepository(getConnection, projectionVersions);
    const marketInstallations = new RawMarketInstallationRepository(getConnection);
    const cacheMaintenance = new RawCacheMaintenanceRepository(
      getConnection,
      workspaces,
      projectionVersions,
    );
    this.rawRepositories = {
      workspaces,
      conversations,
      tasks,
      taskCheckpoints,
      resourceCache,
      mediaMetadata,
      searchDocuments,
      semanticProjections,
      entityAssetProjections,
      catalogItems,
      marketInstallations,
      projectionVersions,
      cacheMaintenance,
    };
    this.repositories = {
      workspaces: new ExclusiveWorkspaceRegistryRepository(workspaces, this.exclusive),
      conversations: new ExclusiveConversationCatalogRepository(
        conversations,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      tasks: new ExclusiveTaskStateRepository(tasks, this.exclusive, (mode, operation) =>
        this.executeTransaction(mode, operation),
      ),
      taskCheckpoints: new ExclusiveTaskCheckpointRepository(
        taskCheckpoints,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      resourceCache: new ExclusiveResourceCacheMetadataRepository(
        resourceCache,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      mediaMetadata: new ExclusiveMediaMetadataRepository(
        mediaMetadata,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      searchDocuments: new ExclusiveSearchDocumentRepository(
        searchDocuments,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      semanticProjections: new ExclusiveSemanticProjectionRepository(
        semanticProjections,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      entityAssetProjections: new ExclusiveEntityAssetProjectionRepository(
        entityAssetProjections,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      catalogItems: new ExclusiveCatalogProjectionRepository(
        catalogItems,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      marketInstallations: new ExclusiveMarketInstallationRepository(
        marketInstallations,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
      projectionVersions: new ExclusiveProjectionVersionRepository(
        projectionVersions,
        this.exclusive,
      ),
      cacheMaintenance: new ExclusiveCacheMaintenanceRepository(
        cacheMaintenance,
        this.exclusive,
        (mode, operation) => this.executeTransaction(mode, operation),
      ),
    };
  }

  async open(options: LocalMetadataOpenOptions): Promise<void> {
    if (this.state === 'disposed') {
      throw new LocalMetadataError({
        code: 'metadata-store-disposed',
        operation: 'open',
        message: 'Cannot reopen a disposed local metadata store',
      });
    }
    if (this.state === 'open') {
      throw new LocalMetadataError({
        code: 'metadata-store-open-failed',
        operation: 'open',
        message: 'Local metadata store is already open',
      });
    }
    if (options.databasePath !== this.options.expectedDatabasePath) {
      throw new NekoStorageContractError({
        code: 'retired-workspace-database',
        message: `Local metadata database must use ${this.options.expectedDatabasePath}`,
      });
    }
    if (!Number.isSafeInteger(options.busyTimeoutMs) || options.busyTimeoutMs <= 0) {
      throw new LocalMetadataError({
        code: 'metadata-store-open-failed',
        operation: 'open',
        message: `busyTimeoutMs must be a positive integer: ${options.busyTimeoutMs}`,
      });
    }
    try {
      this.connection = await this.options.connectionFactory.open(options);
      this.state = 'open';
    } catch (error) {
      if (
        error instanceof LocalMetadataError &&
        (error.code === 'metadata-unsupported-runtime' ||
          error.code === 'metadata-integrity-failed')
      ) {
        throw error;
      }
      throw new LocalMetadataError({
        code: 'metadata-store-open-failed',
        operation: 'open',
        message: `Failed to open local metadata database ${options.databasePath}`,
        cause: error,
      });
    }
  }

  transaction<T>(
    options: LocalMetadataTransactionOptions,
    operation: (context: LocalMetadataTransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.exclusive.run(() =>
      this.executeTransaction(options.mode, () =>
        operation({
          mode: options.mode,
          ownership: options.ownership,
          repositories: this.rawRepositories,
        }),
      ),
    );
  }

  readPartitionRevision(
    partition: LocalMetadataPartition,
  ): Promise<LocalMetadataPartitionRevision | null> {
    return this.repositories.projectionVersions.get(partition);
  }

  migrateNamespace(
    migrations: readonly LocalMetadataMigration[],
    options?: LocalMetadataMigrationOptions,
  ): Promise<LocalMetadataMigrationResult> {
    validateLocalMetadataMigrationSequence(migrations);
    return this.exclusive.run(async () => {
      const connection = this.requireConnection('migrate-namespace');
      await connection.exec(MIGRATION_REGISTRY_SQL);
      const namespace = migrations[0]?.namespace;
      if (!namespace) {
        return { namespace: '', previousVersion: 0, currentVersion: 0, appliedVersions: [] };
      }
      const appliedRows = await connection.all(
        `SELECT version, checksum FROM schema_migrations
          WHERE namespace = ? ORDER BY version`,
        [namespace],
      );
      const applied = new Map<number, string>();
      for (const row of appliedRows) {
        applied.set(readNumber(row, 'version'), readString(row, 'checksum'));
      }
      const previousVersion = Math.max(0, ...applied.keys());
      const pending = migrations.filter((migration) => {
        const checksum = applied.get(migration.version);
        if (checksum !== undefined && checksum !== migration.checksum) {
          throw new LocalMetadataError({
            code: 'metadata-migration-checksum-mismatch',
            operation: 'migrate-namespace',
            message: `Migration checksum mismatch for ${namespace}/${migration.version}`,
          });
        }
        return checksum === undefined;
      });
      const appliedVersions: number[] = [];
      if (pending.length > 0) {
        if (pending.some((migration) => migration.destructive)) {
          const backupRequest = options?.destructiveBackup;
          if (!backupRequest || backupRequest.reason !== 'migration') {
            throw new LocalMetadataError({
              code: 'metadata-backup-failed',
              operation: 'backup-before-destructive-migration',
              message: `Destructive migration for ${namespace} requires a migration backup`,
            });
          }
          await this.createBackup(backupRequest, connection);
        }
        try {
          await this.executeTransaction('system-write', async () => {
            for (const migration of pending) {
              for (const statement of migration.statements) {
                await connection.exec(statement);
              }
              await connection.run(
                `INSERT INTO schema_migrations (
                  namespace, version, name, checksum, ownership, applied_at
                ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  migration.namespace,
                  migration.version,
                  migration.name,
                  migration.checksum,
                  migration.ownership,
                  this.now(),
                ],
              );
              appliedVersions.push(migration.version);
            }
          });
        } catch (error) {
          throw new LocalMetadataError({
            code: 'metadata-migration-failed',
            operation: 'migrate-namespace',
            message: `Failed to migrate local metadata namespace ${namespace}`,
            cause: error,
          });
        }
      }
      return {
        namespace,
        previousVersion,
        currentVersion: Math.max(
          previousVersion,
          ...migrations.map((migration) => migration.version),
        ),
        appliedVersions,
      };
    });
  }

  backup(request: LocalMetadataBackupRequest): Promise<LocalMetadataBackupResult> {
    return this.exclusive.run(() => this.createBackup(request, this.requireConnection('backup')));
  }

  async restore(request: LocalMetadataRestoreRequest): Promise<LocalMetadataRestoreResult> {
    if (this.state !== 'closed') {
      throw new LocalMetadataError({
        code: 'metadata-restore-failed',
        operation: 'restore',
        message: `Local metadata restore requires a closed store; current state is ${this.state}`,
      });
    }
    try {
      const safetyBackupPath = await this.options.connectionFactory.restore(
        request.sourcePath,
        this.options.expectedDatabasePath,
      );
      return { sourcePath: request.sourcePath, restoredAt: this.now(), safetyBackupPath };
    } catch (error) {
      if (error instanceof LocalMetadataError && error.code === 'metadata-restore-failed') {
        throw error;
      }
      throw new LocalMetadataError({
        code: 'metadata-restore-failed',
        operation: 'restore',
        message: `Failed to restore local metadata from ${request.sourcePath}`,
        cause: error,
      });
    }
  }

  integrityCheck(): Promise<LocalMetadataIntegrityReport> {
    return this.exclusive.run(async () => {
      const rows = await this.requireConnection('integrity-check').all('PRAGMA integrity_check');
      const messages = rows.map((row) => readString(row, 'integrity_check'));
      return {
        ok: messages.length === 1 && messages[0] === 'ok',
        checkedAt: this.now(),
        messages,
      };
    });
  }

  async dispose(): Promise<void> {
    if (this.state === 'disposed') return;
    await this.exclusive.run(async () => {
      if (this.connection) await this.connection.close();
      this.connection = null;
      this.state = 'disposed';
    });
  }

  private async executeTransaction<T>(
    mode: LocalMetadataTransactionMode,
    operation: () => Promise<T>,
  ): Promise<T> {
    const connection = this.requireConnection('transaction');
    await connection.exec(mode === 'read' ? 'BEGIN DEFERRED' : 'BEGIN IMMEDIATE');
    try {
      const result = await operation();
      await connection.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        await connection.exec('ROLLBACK');
      } catch (rollbackError) {
        throw new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: 'rollback',
          message: 'Local metadata transaction and rollback both failed',
          cause: { error, rollbackError },
        });
      }
      throw error;
    }
  }

  private async createBackup(
    request: LocalMetadataBackupRequest,
    connection: SqliteConnection,
  ): Promise<LocalMetadataBackupResult> {
    try {
      await connection.backup(request.destinationPath);
      return { destinationPath: request.destinationPath, completedAt: this.now() };
    } catch (error) {
      throw new LocalMetadataError({
        code: 'metadata-backup-failed',
        operation: 'backup',
        message: `Failed to back up local metadata to ${request.destinationPath}`,
        cause: error,
      });
    }
  }

  private requireConnection(operation: string): SqliteConnection {
    if (this.state === 'disposed') {
      throw new LocalMetadataError({
        code: 'metadata-store-disposed',
        operation,
        message: 'Local metadata store is disposed',
      });
    }
    if (!this.connection || this.state !== 'open') {
      throw new LocalMetadataError({
        code: 'metadata-store-not-open',
        operation,
        message: 'Local metadata store is not open',
      });
    }
    return this.connection;
  }

  private now(): string {
    return this.options.now ? this.options.now() : new Date().toISOString();
  }
}

export function createSqliteLocalMetadataStore(
  options: SqliteLocalMetadataStoreOptions,
): LocalMetadataStore {
  return new SqliteLocalMetadataStore(options);
}
