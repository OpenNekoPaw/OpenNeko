import type { ContentProjectId } from './project-target';

export interface ProjectCatalogItem {
  readonly projectId: ContentProjectId;
  readonly workspaceId: string;
  readonly profile: 'content';
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly unavailable?: {
    readonly fieldNames: readonly string[];
    readonly message: string;
  };
}

export interface ProjectCatalogProjection {
  readonly projects: readonly ProjectCatalogItem[];
}
