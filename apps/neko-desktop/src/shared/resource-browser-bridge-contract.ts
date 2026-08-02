import {
  createResourceBrowserViewId,
  type ResourceBrowserChildrenRequest,
  ResourceBrowserIdentity,
  ResourceBrowserIntentRequest,
  ResourceBrowserProjection,
  ResourceBrowserProjectionEvent,
  ResourceBrowserQuickPreviewReleaseRequest,
  ResourceBrowserQuickPreviewReleaseResult,
  ResourceBrowserQuickPreviewRequest,
  ResourceBrowserQuickPreviewResult,
  ResourceBrowserRecoveryApplyRequest,
  ResourceBrowserRecoveryCancelRequest,
  ResourceBrowserRecoveryCancelResult,
  ResourceBrowserRecoveryPlanRequest,
  ResourceBrowserRecoveryPlanResult,
  ResourceBrowserSearchRequest,
  ResourceBrowserSnapshotRequest,
  ResourceBrowserThumbnailRequest,
  ResourceBrowserThumbnailResult,
} from '@neko-assets/domain/resource-browser/contract';

export const DESKTOP_RESOURCE_BROWSER_CHANNELS = {
  snapshotGet: 'openneko:resources:snapshot:get',
  children: 'openneko:resources:children',
  thumbnailResolve: 'openneko:resources:thumbnail:resolve',
  quickPreviewResolve: 'openneko:resources:quick-preview:resolve',
  quickPreviewRelease: 'openneko:resources:quick-preview:release',
  recoveryPlan: 'openneko:resources:recovery:plan',
  recoveryApply: 'openneko:resources:recovery:apply',
  recoveryCancel: 'openneko:resources:recovery:cancel',
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
    planRecovery(
      request: ResourceBrowserRecoveryPlanRequest,
    ): Promise<ResourceBrowserRecoveryPlanResult>;
    applyRecovery(request: ResourceBrowserRecoveryApplyRequest): Promise<ResourceBrowserProjection>;
    cancelRecovery(
      request: ResourceBrowserRecoveryCancelRequest,
    ): Promise<ResourceBrowserRecoveryCancelResult>;
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
    viewId: createResourceBrowserViewId(input.projectViewId),
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
