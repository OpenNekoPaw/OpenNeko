import type { WorkspaceIdentityDescriptor, WorkspacePortableLocator } from '../types/storage';
import type { ResourceCacheEntry } from '../types/resource-cache';
import type { MediaFileMetadata } from '../types/asset/entity';
import type {
  CompactMediaSemanticIndex,
  SemanticEvidenceProjection,
} from '../types/semantic-source';
import type {
  CreativeEntityCandidate,
  CreativeEntityKind,
  CreativeEntityOccurrenceProjection,
  CreativeEntityRelationshipProjection,
  EntityAssetBindingAvailability,
  EntityAssetBindingRole,
  EntityAssetBindingStatus,
} from '../types/creative-entity-asset-composition';
import type { CreativeGraphNode, CreativeRelationEdge } from '../types/creative-entity-graph';
import type {
  ProjectIndexFreshness,
  ProjectSemanticCoverageAnalysisKind,
  ProjectSemanticProviderMetadata,
  ProjectSearchItemKind,
  ProjectSearchPartitionKind,
  ProjectSearchSourceRef,
} from '../types/project-cache-search';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from './model';

export interface WorkspaceRegistryRecord {
  readonly workspaceId: string;
  readonly currentLocator: WorkspacePortableLocator;
  readonly locatorHistory: readonly WorkspacePortableLocator[];
  readonly lastSeenAt: string;
  readonly orphanedAt: string | null;
}

export interface WorkspaceBindRequest {
  readonly identity: WorkspaceIdentityDescriptor;
  readonly locator: WorkspacePortableLocator;
  readonly seenAt: string;
}

export interface WorkspaceRebindRequest {
  readonly workspaceId: string;
  readonly locator: WorkspacePortableLocator;
  readonly reboundAt: string;
}

export interface WorkspaceRegistryRepository {
  get(workspaceId: string): Promise<WorkspaceRegistryRecord | null>;
  findByCurrentLocator(
    locator: WorkspacePortableLocator,
  ): Promise<readonly WorkspaceRegistryRecord[]>;
  listOrphans(): Promise<readonly WorkspaceRegistryRecord[]>;
  bind(request: WorkspaceBindRequest): Promise<WorkspaceRegistryRecord>;
  rebind(request: WorkspaceRebindRequest): Promise<WorkspaceRegistryRecord>;
  markSeen(workspaceId: string, seenAt: string): Promise<WorkspaceRegistryRecord>;
  markOrphaned(workspaceId: string, orphanedAt: string): Promise<WorkspaceRegistryRecord>;
}

export type ConversationCatalogSource = 'vscode' | 'tui' | 'agent' | 'import';

export interface ConversationCatalogRecord {
  readonly conversationId: string;
  readonly workspaceId: string | null;
  readonly journalId: string;
  readonly title: string;
  readonly source: ConversationCatalogSource;
  readonly model: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConversationCatalogQuery {
  readonly workspaceId: string | null;
  readonly text: string | null;
  readonly limit: number;
  readonly offset: number;
}

export interface ConversationProjectionReplaceRequest {
  readonly workspaceId: string | null;
  readonly conversations: readonly ConversationCatalogRecord[];
  readonly authorityRevision: string;
}

export interface ConversationCatalogRepository {
  get(conversationId: string): Promise<ConversationCatalogRecord | null>;
  list(query: ConversationCatalogQuery): Promise<readonly ConversationCatalogRecord[]>;
  upsert(record: ConversationCatalogRecord): Promise<void>;
  delete(conversationId: string): Promise<boolean>;
  replaceProjection(request: ConversationProjectionReplaceRequest): Promise<void>;
  deleteWorkspaceProjection(workspaceId: string): Promise<void>;
}

export interface ProjectionVersionUpdate {
  readonly partition: LocalMetadataPartition;
  readonly freshness: LocalMetadataPartitionRevision['freshness'];
  readonly diagnostic: string | null;
  readonly updatedAt: string;
}

export interface ProjectionVersionRepository {
  get(partition: LocalMetadataPartition): Promise<LocalMetadataPartitionRevision | null>;
  increment(update: ProjectionVersionUpdate): Promise<LocalMetadataPartitionRevision>;
  markStale(update: ProjectionVersionUpdate): Promise<LocalMetadataPartitionRevision>;
}

export interface TaskStateRecord {
  readonly workspaceId: string;
  readonly taskKey: string;
  readonly taskId: string;
  readonly status: string;
  readonly payload: unknown;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface TaskStateQuery {
  readonly workspaceId: string;
  readonly statuses: readonly string[] | null;
}

export interface TaskStateRepository {
  get(workspaceId: string, taskKey: string): Promise<TaskStateRecord | null>;
  list(query: TaskStateQuery): Promise<readonly TaskStateRecord[]>;
  upsert(record: TaskStateRecord): Promise<void>;
  delete(workspaceId: string, taskKey: string): Promise<boolean>;
  deleteWorkspace(workspaceId: string): Promise<number>;
}

export interface TaskCheckpointRecord {
  readonly workspaceId: string;
  readonly taskKey: string;
  readonly taskId: string;
  readonly payload: unknown;
  readonly updatedAt: number;
}

export interface TaskCheckpointRepository {
  get(workspaceId: string, taskKey: string): Promise<TaskCheckpointRecord | null>;
  list(workspaceId: string): Promise<readonly TaskCheckpointRecord[]>;
  upsert(record: TaskCheckpointRecord): Promise<void>;
  delete(workspaceId: string, taskKey: string): Promise<boolean>;
  clearWorkspace(workspaceId: string): Promise<number>;
}

export interface ResourceCacheProjectionReplaceRequest {
  readonly partition: LocalMetadataPartition;
  readonly entries: readonly ResourceCacheEntry[];
  readonly updatedAt: string;
}

export interface ResourceCacheMetadataRepository {
  get(partition: LocalMetadataPartition, resourceId: string): Promise<ResourceCacheEntry | null>;
  list(partition: LocalMetadataPartition): Promise<readonly ResourceCacheEntry[]>;
  replacePartition(request: ResourceCacheProjectionReplaceRequest): Promise<void>;
}

export interface MediaMetadataRecord {
  readonly sourceKey: string;
  readonly sourceMtimeMs: number;
  readonly metadata: MediaFileMetadata;
  readonly updatedAt: string;
}

export interface MediaMetadataUpsertRequest {
  readonly partition: LocalMetadataPartition;
  readonly record: MediaMetadataRecord;
}

export interface MediaMetadataRepository {
  get(partition: LocalMetadataPartition, sourceKey: string): Promise<MediaMetadataRecord | null>;
  list(partition: LocalMetadataPartition): Promise<readonly MediaMetadataRecord[]>;
  upsert(request: MediaMetadataUpsertRequest): Promise<void>;
  delete(partition: LocalMetadataPartition, sourceKey: string): Promise<boolean>;
}

export interface SearchDocumentRecord {
  readonly documentId: string;
  readonly partition: ProjectSearchPartitionKind;
  readonly kind: ProjectSearchItemKind;
  readonly label: string;
  readonly description?: string;
  readonly source: ProjectSearchSourceRef;
  readonly fileKey?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly searchText: string;
  readonly freshness: ProjectIndexFreshness;
  readonly metadata?: Record<string, unknown>;
  readonly updatedAt: string;
}

export interface SearchDocumentProjectionReplaceRequest {
  readonly partition: LocalMetadataPartition;
  readonly documents: readonly SearchDocumentRecord[];
  readonly updatedAt: string;
}

export interface SearchDocumentPartitionReplaceRequest {
  readonly partition: LocalMetadataPartition;
  readonly searchPartition: ProjectSearchPartitionKind;
  readonly documents: readonly SearchDocumentRecord[];
  readonly updatedAt: string;
}

export interface SearchDocumentQuery {
  readonly partition: LocalMetadataPartition;
  readonly text: string;
  readonly limit: number;
}

export interface SearchDocumentInsertMissingResult {
  readonly insertedDocumentIds: readonly string[];
  readonly preservedDocumentIds: readonly string[];
}

export interface SearchDocumentRepository {
  list(partition: LocalMetadataPartition): Promise<readonly SearchDocumentRecord[]>;
  query(query: SearchDocumentQuery): Promise<readonly SearchDocumentRecord[]>;
  replacePartition(request: SearchDocumentProjectionReplaceRequest): Promise<void>;
  replaceSearchPartition(request: SearchDocumentPartitionReplaceRequest): Promise<void>;
  insertMissingSearchPartition(
    request: SearchDocumentPartitionReplaceRequest,
  ): Promise<SearchDocumentInsertMissingResult>;
}

export interface SemanticProjectionRecord {
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly provider: ProjectSemanticProviderMetadata;
  readonly coverage: readonly ProjectSemanticCoverageAnalysisKind[];
  readonly freshness: ProjectIndexFreshness;
  readonly index: CompactMediaSemanticIndex;
  readonly evidence: readonly SemanticEvidenceProjection[];
  readonly updatedAt: string;
}

export interface SemanticProjectionReplaceRequest {
  readonly partition: LocalMetadataPartition;
  readonly sources: readonly SemanticProjectionRecord[];
  readonly updatedAt: string;
}

export interface SemanticProjectionReplaceSourceRequest {
  readonly partition: LocalMetadataPartition;
  readonly source: SemanticProjectionRecord;
  readonly updatedAt: string;
}

export interface SemanticProjectionInsertMissingResult {
  readonly insertedSourceIds: readonly string[];
  readonly preservedSourceIds: readonly string[];
}

export interface SemanticProjectionRepository {
  list(partition: LocalMetadataPartition): Promise<readonly SemanticProjectionRecord[]>;
  get(
    partition: LocalMetadataPartition,
    sourceId: string,
  ): Promise<SemanticProjectionRecord | null>;
  replacePartition(request: SemanticProjectionReplaceRequest): Promise<void>;
  replaceSource(request: SemanticProjectionReplaceSourceRequest): Promise<void>;
  deleteSource(
    partition: LocalMetadataPartition,
    sourceId: string,
    updatedAt: string,
  ): Promise<boolean>;
  clearBodyBearingSources(
    partition: LocalMetadataPartition,
    updatedAt: string,
  ): Promise<readonly string[]>;
  insertMissing(
    request: SemanticProjectionReplaceRequest,
  ): Promise<SemanticProjectionInsertMissingResult>;
}

export type EntityAssetProjectionKind =
  | 'asset-graph-node'
  | 'asset-graph-edge'
  | 'entity-occurrence'
  | 'entity-relationship'
  | 'entity-candidate'
  | 'binding-availability';

export interface EntityBindingAvailabilityProjectionValue {
  readonly bindingId: string;
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly assetRef: string;
  readonly role: EntityAssetBindingRole;
  readonly status: EntityAssetBindingStatus;
  readonly availability: EntityAssetBindingAvailability;
  readonly orphanedAt?: string;
  readonly isDefault?: boolean;
}

interface EntityAssetProjectionRecordBase {
  readonly projectionId: string;
  readonly sourceId: string;
  readonly entityId?: string;
  readonly relatedEntityId?: string;
  readonly candidateId?: string;
  readonly assetRef?: string;
  readonly freshness: LocalMetadataPartitionRevision['freshness'];
  readonly updatedAt: string;
}

export type EntityAssetProjectionRecord =
  | (EntityAssetProjectionRecordBase & {
      readonly kind: 'asset-graph-node';
      readonly value: CreativeGraphNode;
    })
  | (EntityAssetProjectionRecordBase & {
      readonly kind: 'asset-graph-edge';
      readonly value: CreativeRelationEdge;
    })
  | (EntityAssetProjectionRecordBase & {
      readonly kind: 'entity-occurrence';
      readonly value: CreativeEntityOccurrenceProjection;
    })
  | (EntityAssetProjectionRecordBase & {
      readonly kind: 'entity-relationship';
      readonly value: CreativeEntityRelationshipProjection;
    })
  | (EntityAssetProjectionRecordBase & {
      readonly kind: 'entity-candidate';
      readonly value: CreativeEntityCandidate;
    })
  | (EntityAssetProjectionRecordBase & {
      readonly kind: 'binding-availability';
      readonly value: EntityBindingAvailabilityProjectionValue;
    });

export interface EntityAssetProjectionQuery {
  readonly partition: LocalMetadataPartition;
  readonly projectionId?: string;
  readonly kinds?: readonly EntityAssetProjectionKind[];
  readonly sourceId?: string;
  readonly entityId?: string;
  readonly candidateId?: string;
  readonly assetRef?: string;
}

export interface EntityAssetProjectionReplaceSourceRequest {
  readonly partition: LocalMetadataPartition;
  readonly sourceId: string;
  readonly records: readonly EntityAssetProjectionRecord[];
  readonly updatedAt: string;
}

export interface EntityAssetProjectionInsertMissingResult {
  readonly insertedProjectionKeys: readonly string[];
  readonly preservedProjectionKeys: readonly string[];
}

export interface EntityAssetProjectionRepository {
  list(query: EntityAssetProjectionQuery): Promise<readonly EntityAssetProjectionRecord[]>;
  replaceSource(request: EntityAssetProjectionReplaceSourceRequest): Promise<void>;
  insertMissing(
    request: EntityAssetProjectionReplaceSourceRequest,
  ): Promise<EntityAssetProjectionInsertMissingResult>;
}

export type CatalogItemKind = 'skill' | 'command' | 'processor';

export type CatalogItemSource =
  'builtin' | 'personal' | 'project' | 'market' | 'plugin' | 'extension';

export interface CatalogItemRecord {
  readonly catalogId: string;
  readonly kind: CatalogItemKind;
  readonly source: CatalogItemSource;
  readonly name: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly version: string | null;
  readonly rootId: string;
  readonly relativePath: string;
  readonly fingerprint: string;
  readonly enabled: boolean;
  readonly diagnosticCodes: readonly string[];
  readonly updatedAt: string;
}

export interface CatalogItemQuery {
  readonly partition: LocalMetadataPartition;
  readonly kinds?: readonly CatalogItemKind[];
  readonly sources?: readonly CatalogItemSource[];
}

export interface CatalogProjectionReplaceSliceRequest {
  readonly partition: LocalMetadataPartition;
  readonly kind: CatalogItemKind;
  readonly source: CatalogItemSource;
  readonly items: readonly CatalogItemRecord[];
  readonly updatedAt: string;
}

export interface CatalogProjectionRepository {
  list(query: CatalogItemQuery): Promise<readonly CatalogItemRecord[]>;
  replaceSlice(request: CatalogProjectionReplaceSliceRequest): Promise<void>;
}

export type LocalMetadataCacheTable =
  | 'conversations'
  | 'resource_cache_entries'
  | 'media_metadata'
  | 'search_documents'
  | 'semantic_sources'
  | 'entity_asset_projections'
  | 'catalog_items';
export type LocalMetadataCacheCleanupReason = 'rebuild' | 'quota' | 'orphan-gc' | 'manual';

export interface LocalMetadataCachePartitionCleanupRequest {
  readonly table: LocalMetadataCacheTable;
  readonly partition: LocalMetadataPartition;
  readonly reason: LocalMetadataCacheCleanupReason;
  readonly updatedAt: string;
}

export interface LocalMetadataCachePartitionCleanupResult {
  readonly deletedRows: number;
}

export interface LocalMetadataOrphanCacheGcRequest {
  readonly table: LocalMetadataCacheTable;
  readonly orphanRetentionMs: number;
  readonly collectedAt: string;
}

export interface LocalMetadataOrphanCacheGcResult {
  readonly scannedOrphans: number;
  readonly clearedWorkspaceIds: readonly string[];
  readonly deletedRows: number;
}

export interface LocalMetadataCacheMaintenanceRepository {
  clearPartition(
    request: LocalMetadataCachePartitionCleanupRequest,
  ): Promise<LocalMetadataCachePartitionCleanupResult>;
  collectOrphanedPartitions(
    request: LocalMetadataOrphanCacheGcRequest,
  ): Promise<LocalMetadataOrphanCacheGcResult>;
  vacuum(): Promise<void>;
}

export interface LocalMetadataCacheQuotaPolicy {
  readonly maximumBytes: number;
  readonly targetBytes: number;
  readonly orphanRetentionMs: number;
}

export interface LocalMetadataCacheQuotaDecision {
  readonly overBudget: boolean;
  readonly reclaimBytes: number;
}

export function evaluateLocalMetadataCacheQuota(
  policy: LocalMetadataCacheQuotaPolicy,
  currentBytes: number,
): LocalMetadataCacheQuotaDecision {
  if (
    !Number.isSafeInteger(policy.maximumBytes) ||
    !Number.isSafeInteger(policy.targetBytes) ||
    !Number.isSafeInteger(policy.orphanRetentionMs) ||
    policy.maximumBytes <= 0 ||
    policy.targetBytes < 0 ||
    policy.targetBytes > policy.maximumBytes ||
    policy.orphanRetentionMs < 0 ||
    !Number.isSafeInteger(currentBytes) ||
    currentBytes < 0
  ) {
    throw new RangeError('Local metadata cache quota values must be non-negative safe integers');
  }
  const overBudget = currentBytes > policy.maximumBytes;
  return {
    overBudget,
    reclaimBytes: overBudget ? currentBytes - policy.targetBytes : 0,
  };
}

export interface LocalMetadataRepositories {
  readonly workspaces: WorkspaceRegistryRepository;
  readonly projectionVersions: ProjectionVersionRepository;
  readonly conversations: ConversationCatalogRepository;
  readonly tasks: TaskStateRepository;
  readonly taskCheckpoints: TaskCheckpointRepository;
  readonly resourceCache: ResourceCacheMetadataRepository;
  readonly mediaMetadata: MediaMetadataRepository;
  readonly searchDocuments: SearchDocumentRepository;
  readonly semanticProjections: SemanticProjectionRepository;
  readonly entityAssetProjections: EntityAssetProjectionRepository;
  readonly catalogItems: CatalogProjectionRepository;
  readonly cacheMaintenance: LocalMetadataCacheMaintenanceRepository;
}
