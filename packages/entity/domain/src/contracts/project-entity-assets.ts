import type {
  ProjectEntityFactValue,
  ProjectEntityAssetRevisionRef,
  ProjectEntityRepresentationBinding,
  ProjectEntitySemanticSnapshot,
} from './project-entity-document';
import type { CreativeEntityKind } from './creative-entity-identity';
import type { ContentLocator } from '@neko/content';

export interface ProjectEntityAssetSnapshot {
  readonly revision: ProjectEntityAssetRevisionRef;
  readonly semantic: ProjectEntitySemanticSnapshot;
}

/** Reads one immutable, installed Asset revision through the generic Asset lifecycle owner. */
export interface ProjectEntityAssetRevisionReader {
  readExact(
    revision: ProjectEntityAssetRevisionRef,
    signal?: AbortSignal,
  ): Promise<ProjectEntityAssetSnapshot | null>;
}

export type ProjectEntityAssetRepresentationPublicationPlan =
  | { readonly bindingId: string; readonly mode: 'embed'; readonly resourcePath: string }
  | { readonly bindingId: string; readonly mode: 'dependency' }
  | { readonly bindingId: string; readonly mode: 'omit' };

export interface ProjectEntityAssetPreparedResource {
  readonly resourceId: string;
  readonly resourcePath: string;
  readonly digest: string;
}

export interface ProjectEntityAssetPortableSnapshot {
  readonly schemaVersion: 1;
  readonly assetId: string;
  readonly revision: string;
  readonly semantic: ProjectEntitySemanticSnapshot;
  readonly dependencies: readonly ProjectEntityAssetRevisionRef[];
  readonly resources: readonly Omit<ProjectEntityAssetPreparedResource, 'resourceId'>[];
}

export interface ProjectEntityAssetPublicationAdapter {
  prepareResource(
    request: {
      readonly operationId: string;
      readonly source: ContentLocator;
      readonly resourcePath: string;
    },
    signal?: AbortSignal,
  ): Promise<ProjectEntityAssetPreparedResource>;
  publish(
    request: {
      readonly operationId: string;
      readonly snapshot: ProjectEntityAssetPortableSnapshot;
      readonly preparedResources: readonly ProjectEntityAssetPreparedResource[];
    },
    signal?: AbortSignal,
  ): Promise<ProjectEntityAssetRevisionRef>;
  abort(operationId: string): Promise<void>;
}

export type ProjectEntitySemanticField =
  | 'kind'
  | 'names.canonical'
  | 'names.display'
  | 'names.aliases'
  | 'representations'
  | `facts/${string}`;

export type ProjectEntitySemanticFieldValue =
  | CreativeEntityKind
  | string
  | readonly string[]
  | ProjectEntityFactValue
  | readonly ProjectEntityRepresentationBinding[]
  | undefined;

export type ProjectEntityAssetDiffStatus =
  'applicable' | 'conflict' | 'local-only' | 'already-applied';

export interface ProjectEntityAssetDiffEntry {
  readonly field: ProjectEntitySemanticField;
  readonly status: ProjectEntityAssetDiffStatus;
  readonly base: ProjectEntitySemanticFieldValue;
  readonly current: ProjectEntitySemanticFieldValue;
  readonly incoming: ProjectEntitySemanticFieldValue;
}

export interface ProjectEntityAssetUpdateDiff {
  readonly entityId: string;
  readonly currentRevision: ProjectEntityAssetRevisionRef;
  readonly availableRevision: ProjectEntityAssetRevisionRef;
  readonly entries: readonly ProjectEntityAssetDiffEntry[];
}

export interface ProjectEntityAssetUpdateAvailability {
  readonly entityId: string;
  readonly origin: ProjectEntityAssetRevisionRef;
  readonly applied: ProjectEntityAssetRevisionRef;
  readonly available: ProjectEntityAssetRevisionRef;
  readonly status: 'current' | 'update-available';
}

export interface ProjectEntityAssetConflictResolution {
  readonly field: ProjectEntitySemanticField;
  readonly resolution: 'current' | 'incoming';
}

export type ProjectEntityAssetLifecycleState = 'installed' | 'uninstalled' | 'remote-tombstone';

export interface ProjectEntityAssetLifecycleEvent {
  readonly asset: ProjectEntityAssetRevisionRef;
  readonly state: ProjectEntityAssetLifecycleState;
  readonly observedAt: string;
}

export interface ProjectEntityAssetProvenanceAvailabilityProjection {
  readonly entityId: string;
  readonly asset: ProjectEntityAssetRevisionRef;
  readonly relation: 'origin' | 'applied' | 'origin-and-applied';
  readonly availability: 'available' | 'unavailable' | 'remote-tombstone';
  readonly observedAt: string;
}

export function assertProjectEntityAssetLifecycleEvent(
  value: unknown,
): ProjectEntityAssetLifecycleEvent {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['asset', 'state', 'observedAt']) ||
    !isAssetRevision(value['asset']) ||
    (value['state'] !== 'installed' &&
      value['state'] !== 'uninstalled' &&
      value['state'] !== 'remote-tombstone') ||
    typeof value['observedAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['observedAt']))
  ) {
    throw new Error('Project Entity Asset lifecycle event is invalid.');
  }
  return {
    asset: value['asset'],
    state: value['state'],
    observedAt: value['observedAt'],
  };
}

function isAssetRevision(value: unknown): value is ProjectEntityAssetRevisionRef {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['assetId', 'revision', 'digest']) &&
    isIdentity(value['assetId']) &&
    isIdentity(value['revision']) &&
    typeof value['digest'] === 'string' &&
    /^[a-f0-9]{64}$/u.test(value['digest'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\\/\0]/u.test(value);
}
