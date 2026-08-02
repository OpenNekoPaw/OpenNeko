import type { ContentLocator } from '@neko/content';
import type {
  CreativeEntityCandidate,
  CreativeEntityOccurrenceProjection,
  CreativeEntityRelationshipProjection,
} from './creative-entity-asset-composition';
import type { CreativeEntityKind } from './creative-entity-identity';
import type { CreativeGraphNode, CreativeRelationEdge } from './creative-entity-graph';
import type {
  EntityRepresentationBindingAvailability,
  EntityRepresentationBindingStatus,
  EntityRepresentationRole,
} from './entity-representation-binding';

export interface EntityAssetProjectionPartition {
  readonly scope: 'global' | 'workspace';
  readonly workspaceId: string | null;
  readonly domain: string;
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
  readonly representation: ContentLocator;
  readonly role: EntityRepresentationRole;
  readonly status: EntityRepresentationBindingStatus;
  readonly availability: EntityRepresentationBindingAvailability;
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
  readonly freshness: 'fresh' | 'stale' | 'rebuilding';
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
  readonly partition: EntityAssetProjectionPartition;
  readonly projectionId?: string;
  readonly kinds?: readonly EntityAssetProjectionKind[];
  readonly sourceId?: string;
  readonly entityId?: string;
  readonly candidateId?: string;
  readonly assetRef?: string;
}

export interface EntityAssetProjectionReplaceSourceRequest {
  readonly partition: EntityAssetProjectionPartition;
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
