import type {
  ProjectEntityAssetRevisionRef,
  ProjectEntitySemanticSnapshot,
} from './project-entity-document';

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
