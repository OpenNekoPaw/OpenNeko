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

export function createDesktopCutSessionId(viewId: string, viewEpoch: number): string {
  return `cut-session:${viewId}:${viewEpoch}`;
}

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
    left.viewEpoch === right.viewEpoch &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.endpointEpoch === right.endpointEpoch
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
