import {
  parseCanvasHostPresentationState,
  type CanvasHostPresentationState,
  type CanvasHostRuntimeIdentity,
} from './canvas-host-runtime-contract';

export interface CanvasHostPresentationSnapshotStore {
  read(identity: CanvasHostRuntimeIdentity): CanvasHostPresentationState | undefined;
  write(identity: CanvasHostRuntimeIdentity, presentation: CanvasHostPresentationState): void;
  deleteWindow(windowId: string): void;
  clear(): void;
}

export function createCanvasHostPresentationSnapshotStore(): CanvasHostPresentationSnapshotStore {
  const snapshots = new Map<
    string,
    { readonly windowId: string; readonly presentation: CanvasHostPresentationState }
  >();
  return {
    read(identity) {
      const snapshot = snapshots.get(presentationIdentity(identity));
      return snapshot ? clonePresentation(snapshot.presentation) : undefined;
    },
    write(identity, presentation) {
      snapshots.set(presentationIdentity(identity), {
        windowId: identity.windowId,
        presentation: clonePresentation(parseCanvasHostPresentationState(presentation)),
      });
    },
    deleteWindow(windowId) {
      for (const [key, snapshot] of snapshots) {
        if (snapshot.windowId === windowId) snapshots.delete(key);
      }
    },
    clear() {
      snapshots.clear();
    },
  };
}

function presentationIdentity(identity: CanvasHostRuntimeIdentity): string {
  return JSON.stringify([
    identity.projectId,
    identity.workspaceId,
    identity.windowId,
    identity.viewId,
    identity.viewInstanceId,
    identity.documentId,
    identity.sessionId,
  ]);
}

function clonePresentation(presentation: CanvasHostPresentationState): CanvasHostPresentationState {
  return {
    viewport: {
      pan: { ...presentation.viewport.pan },
      zoom: presentation.viewport.zoom,
    },
    selectedNodeIds: [...presentation.selectedNodeIds],
  };
}
