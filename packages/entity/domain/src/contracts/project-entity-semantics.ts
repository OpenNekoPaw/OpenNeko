import type { ContentLocator } from '@neko/content-domain';
import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';

export type CreativeEntitySourceFreshness = 'fresh' | 'stale' | 'building' | 'partial' | 'failed';

export interface CreativeEntitySourceRange {
  readonly sceneId?: string;
  readonly shotId?: string;
  readonly pageId?: string;
  readonly panelId?: string;
  readonly frameStart?: number;
  readonly frameEnd?: number;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly startColumn?: number;
  readonly endColumn?: number;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly structuredPath?: readonly (string | number)[];
  readonly nodeId?: string;
  readonly assetId?: string;
}

export interface CreativeEntityRef {
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly projectRoot?: string;
  readonly source?: string;
}

export type CreativeEntitySourceKind =
  | 'registry'
  | 'candidate'
  | 'story'
  | 'canvas'
  | 'asset'
  | 'workspace'
  | 'media-library'
  | 'managed-asset'
  | 'agent'
  | 'document'
  | 'importer'
  | 'generated';

export interface CreativeEntitySourceMetadata {
  readonly sourceId: string;
  readonly sourceKind: CreativeEntitySourceKind;
  readonly sourceRef?: string;
  readonly providerId?: string;
  readonly freshness?: CreativeEntitySourceFreshness;
  readonly updatedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CreativeEntityOccurrenceProjection {
  readonly occurrenceId?: string;
  readonly mentionId?: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly label: string;
  readonly source: CreativeEntitySourceMetadata;
  readonly role: 'definition' | 'reference';
  readonly location: string;
  readonly detail?: string;
  readonly locator?: ContentLocator;
  readonly range?: CreativeEntitySourceRange;
  readonly sourceFingerprint?: string;
}

export interface CreativeEntityRelationshipProjection {
  readonly from: CreativeEntityRef;
  readonly to: CreativeEntityRef;
  readonly type: string;
  readonly strength?: string;
  readonly source: CreativeEntitySourceMetadata;
  readonly confidence?: number;
}

export function isCreativeEntityRef(value: unknown): value is CreativeEntityRef {
  return (
    isRecord(value) &&
    isStableIdentity(value['entityId']) &&
    isCreativeEntityKind(value['entityKind']) &&
    (value['projectRoot'] === undefined || typeof value['projectRoot'] === 'string') &&
    (value['source'] === undefined || typeof value['source'] === 'string')
  );
}

function isStableIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\\/\0]/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
