import type {
  ResourceBrowserChildrenRequest,
  ResourceBrowserIdentity,
  ResourceBrowserIntentRequest,
  ResourceBrowserProjection,
  ResourceBrowserProjectionEvent,
  ResourceBrowserQuickPreviewReleaseRequest,
  ResourceBrowserQuickPreviewReleaseResult,
  ResourceBrowserQuickPreviewRequest,
  ResourceBrowserQuickPreviewResult,
  ResourceBrowserSearchRequest,
  ResourceBrowserSnapshotRequest,
  ResourceBrowserThumbnailRequest,
  ResourceBrowserThumbnailResult,
} from 'neko-assets/resource-browser/contract';

export const DESKTOP_RESOURCE_BROWSER_CHANNELS = {
  snapshotGet: 'openneko:resources:snapshot:get',
  children: 'openneko:resources:children',
  thumbnailResolve: 'openneko:resources:thumbnail:resolve',
  quickPreviewResolve: 'openneko:resources:quick-preview:resolve',
  quickPreviewRelease: 'openneko:resources:quick-preview:release',
  search: 'openneko:resources:search',
  execute: 'openneko:resources:execute',
  projectionEvent: 'openneko:resources:projection:event',
} as const;

export interface OpenNekoDesktopResourceBrowserBridge {
  readonly resources: {
    getSnapshot(request: ResourceBrowserSnapshotRequest): Promise<ResourceBrowserProjection>;
    resolveThumbnail(
      request: ResourceBrowserThumbnailRequest,
    ): Promise<ResourceBrowserThumbnailResult>;
    resolveQuickPreview(
      request: ResourceBrowserQuickPreviewRequest,
    ): Promise<ResourceBrowserQuickPreviewResult>;
    releaseQuickPreview(
      request: ResourceBrowserQuickPreviewReleaseRequest,
    ): Promise<ResourceBrowserQuickPreviewReleaseResult>;
    children(request: ResourceBrowserChildrenRequest): Promise<ResourceBrowserProjection>;
    search(request: ResourceBrowserSearchRequest): Promise<ResourceBrowserProjection>;
    execute(request: ResourceBrowserIntentRequest): Promise<ResourceBrowserProjection>;
    subscribe(listener: (event: ResourceBrowserProjectionEvent) => void): () => void;
  };
}

export function createDesktopResourceBrowserIdentity(input: {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly endpointEpoch: string;
}): ResourceBrowserIdentity {
  return {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    windowId: input.windowId,
    viewId: input.viewId,
    viewEpoch: input.viewEpoch,
    endpointEpoch: input.endpointEpoch,
  };
}

export function isSameResourceBrowserIdentity(
  left: ResourceBrowserIdentity,
  right: ResourceBrowserIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewEpoch === right.viewEpoch &&
    left.endpointEpoch === right.endpointEpoch
  );
}

export function resourceBrowserViewId(projectViewId: string): string {
  return `resource-browser:${projectViewId}`;
}
