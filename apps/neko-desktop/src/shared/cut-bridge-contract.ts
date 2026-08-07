import {
  parseCutHostRuntimeIdentity,
  type CutHostRuntimeIdentity,
  type CutHostRuntimeProjectionEvent,
  type CutHostRuntimeRequest,
  type CutHostRuntimeResult,
  type CutHostRuntimeSnapshot,
} from '@neko/cut-domain';

export const DESKTOP_CUT_CHANNELS = {
  snapshotGet: 'open-neko:cut:snapshot-get',
  requestExecute: 'open-neko:cut:request-execute',
  projectionEvent: 'open-neko:cut:projection-event',
} as const;

export function parseDesktopCutHostIdentity(value: unknown): CutHostRuntimeIdentity {
  return parseCutHostRuntimeIdentity(value);
}

export function isSameCutHostIdentity(
  left: CutHostRuntimeIdentity,
  right: CutHostRuntimeIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewInstanceId === right.viewInstanceId &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.rendererSessionId === right.rendererSessionId
  );
}

export interface OpenNekoDesktopCutBridge {
  readonly cut: {
    getSnapshot(identity: CutHostRuntimeIdentity): Promise<CutHostRuntimeSnapshot>;
    execute(request: CutHostRuntimeRequest): Promise<CutHostRuntimeResult>;
    subscribe(
      identity: CutHostRuntimeIdentity,
      listener: (event: CutHostRuntimeProjectionEvent) => void,
    ): () => void;
  };
}
