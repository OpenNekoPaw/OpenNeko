import type {
  ResourceBrowserChildrenRequest,
  ResourceBrowserIdentity,
  ResourceBrowserIntentRequest,
  ResourceBrowserProjection,
  ResourceBrowserProjectionEvent,
  ResourceBrowserSearchRequest,
  ResourceBrowserSnapshotRequest,
  ResourceBrowserThumbnailRequest,
  ResourceBrowserThumbnailResult,
} from 'neko-assets/resource-browser/contract';

export const DESKTOP_RESOURCE_BROWSER_CHANNELS = {
  snapshotGet: 'openneko:resources:snapshot:get',
  children: 'openneko:resources:children',
  thumbnailResolve: 'openneko:resources:thumbnail:resolve',
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
  readonly projectViewId: string;
  readonly projectViewEpoch: number;
  readonly endpointEpoch: string;
}): ResourceBrowserIdentity {
  return {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    windowId: input.windowId,
    viewId: resourceBrowserViewId(input.projectViewId),
    viewEpoch: input.projectViewEpoch,
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
