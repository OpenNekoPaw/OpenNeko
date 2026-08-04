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
