import {
  createResourceBrowserSnapshotRequest,
  type ResourceBrowserHostRuntime,
  type ResourceBrowserIdentity,
} from '@neko-assets/domain/resource-browser/contract';
import type { OpenNekoDesktopResourceBrowserBridge } from '../shared/resource-browser-bridge-contract';

export function createElectronResourceBrowserHostRuntime(input: {
  readonly bridge: OpenNekoDesktopResourceBrowserBridge;
  readonly identity: ResourceBrowserIdentity;
}): ResourceBrowserHostRuntime {
  let requestSequence = 0;
  return {
    identity: input.identity,
    getSnapshot() {
      requestSequence += 1;
      return input.bridge.resources.getSnapshot(
        createResourceBrowserSnapshotRequest({
          requestId: `desktop-resource-snapshot-${requestSequence}`,
          identity: input.identity,
        }),
      );
    },
    resolveThumbnail(request) {
      return input.bridge.resources.resolveThumbnail(request);
    },
    resolveQuickPreview(request) {
      return input.bridge.resources.resolveQuickPreview(request);
    },
    releaseQuickPreview(request) {
      return input.bridge.resources.releaseQuickPreview(request);
    },
    planRecovery(request) {
      return input.bridge.resources.planRecovery(request);
    },
    applyRecovery(request) {
      return input.bridge.resources.applyRecovery(request);
    },
    cancelRecovery(request) {
      return input.bridge.resources.cancelRecovery(request);
    },
    subscribe(listener) {
      return input.bridge.resources.subscribe((event) => {
        if (isSameIdentity(event.projection.identity, input.identity)) listener(event);
      });
    },
    children(request) {
      return input.bridge.resources.children(request);
    },
    search(request) {
      return input.bridge.resources.search(request);
    },
    execute(request) {
      return input.bridge.resources.execute(request);
    },
  };
}

function isSameIdentity(left: ResourceBrowserIdentity, right: ResourceBrowserIdentity): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewEpoch === right.viewEpoch &&
    left.endpointEpoch === right.endpointEpoch
  );
}
