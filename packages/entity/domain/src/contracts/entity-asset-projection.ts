import {
  isContentIoDiagnostic,
  isContentLocator,
  type ContentIoDiagnostic,
  type ContentLocator,
} from '@neko/content';
import type {
  CreativeEntityOccurrenceProjection,
  CreativeEntityRelationshipProjection,
} from './creative-entity-asset-composition';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';
import type { ProjectEntityCandidateProjection } from './project-entity-document';
import type { CreativeGraphNode, CreativeRelationEdge } from './creative-entity-graph';
import {
  isEntityRepresentationRole,
  type EntityRepresentationRole,
} from './entity-representation-binding';

export const PROJECT_ENTITY_BINDING_RESOURCE_OWNERS = [
  'workspace-file',
  'document',
  'generated-output',
  'asset',
] as const;
export const PROJECT_ENTITY_BINDING_AVAILABILITY_STATES = ['available', 'needs-attention'] as const;
export const PROJECT_ENTITY_BINDING_ATTENTION_ACTIONS = [
  'rebind',
  'reinstall',
  'reconnect',
  'retry',
] as const;

export type ProjectEntityBindingResourceOwner =
  (typeof PROJECT_ENTITY_BINDING_RESOURCE_OWNERS)[number];
export type ProjectEntityBindingAvailability =
  (typeof PROJECT_ENTITY_BINDING_AVAILABILITY_STATES)[number];
export type ProjectEntityBindingAttentionAction =
  (typeof PROJECT_ENTITY_BINDING_ATTENTION_ACTIONS)[number];

export interface ProjectEntityBindingAttention {
  readonly diagnostic: ContentIoDiagnostic;
  readonly action: ProjectEntityBindingAttentionAction;
}

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
  readonly owner: ProjectEntityBindingResourceOwner;
  readonly availability: ProjectEntityBindingAvailability;
  readonly attention?: ProjectEntityBindingAttention;
  readonly isDefault?: boolean;
  readonly checkedAt: string;
}

export function isEntityBindingAvailabilityProjectionValue(
  value: unknown,
): value is EntityBindingAvailabilityProjectionValue {
  if (!isRecord(value) || !hasOnlyKeys(value, BINDING_AVAILABILITY_KEYS)) return false;
  const needsAttention = value['availability'] === 'needs-attention';
  return (
    isStableIdentity(value['bindingId']) &&
    isStableIdentity(value['entityId']) &&
    isCreativeEntityKind(value['entityKind']) &&
    isContentLocator(value['representation']) &&
    isEntityRepresentationRole(value['role']) &&
    isOneOf(value['owner'], PROJECT_ENTITY_BINDING_RESOURCE_OWNERS) &&
    isOneOf(value['availability'], PROJECT_ENTITY_BINDING_AVAILABILITY_STATES) &&
    (value['isDefault'] === undefined || typeof value['isDefault'] === 'boolean') &&
    isTimestamp(value['checkedAt']) &&
    (needsAttention
      ? isProjectEntityBindingAttention(value['attention'])
      : value['attention'] === undefined)
  );
}

function isProjectEntityBindingAttention(value: unknown): value is ProjectEntityBindingAttention {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, BINDING_ATTENTION_KEYS) &&
    isContentIoDiagnostic(value['diagnostic']) &&
    isOneOf(value['action'], PROJECT_ENTITY_BINDING_ATTENTION_ACTIONS)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isStableIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\\/\0]/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.some((candidate) => candidate === value);
}

const BINDING_AVAILABILITY_KEYS = [
  'bindingId',
  'entityId',
  'entityKind',
  'representation',
  'role',
  'owner',
  'availability',
  'attention',
  'isDefault',
  'checkedAt',
] as const;
const BINDING_ATTENTION_KEYS = ['diagnostic', 'action'] as const;

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
      readonly value: ProjectEntityCandidateProjection;
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
