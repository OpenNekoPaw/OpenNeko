import type {
  ProjectEntityAssetRevisionRef,
  ProjectEntitySemanticSnapshot,
} from './project-entity-document';
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
