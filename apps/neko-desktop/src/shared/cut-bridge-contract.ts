import {
  parseCutHostRuntimeIdentity,
  type CutHostRuntimeIdentity,
  type CutHostRuntimeProjectionEvent,
  type CutHostRuntimeRequest,
  type CutHostRuntimeResult,
  type CutHostRuntimeSnapshot,
} from '@neko/cut-domain';
import {
  parseDesktopShellProjection,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';

export const DESKTOP_CUT_CHANNELS = {
  snapshotGet: 'open-neko:cut:snapshot-get',
  requestExecute: 'open-neko:cut:request-execute',
  projectionEvent: 'open-neko:cut:projection-event',
  draftCreate: 'open-neko:cut:draft-create',
  viewClose: 'open-neko:cut:view-close',
} as const;

export interface DesktopCutViewMutationRequest {
  readonly requestId: string;
  readonly windowId: string;
  readonly rendererSessionId: string;
  readonly workbenchInstanceId: string;
  readonly identity?: CutHostRuntimeIdentity;
}

export interface DesktopCutViewMutationResult {
  readonly requestId: string;
  readonly status: 'updated' | 'cancelled';
  readonly projection: DesktopShellProjection;
}

export function parseDesktopCutViewMutationResult(value: unknown): DesktopCutViewMutationResult {
  if (!isRecord(value)) {
    throw new Error('Desktop Cut View mutation result must be an object.');
  }
  const record = value;
  if (
    Object.keys(record).some((key) => !['requestId', 'status', 'projection'].includes(key)) ||
    typeof record['requestId'] !== 'string' ||
    (record['status'] !== 'updated' && record['status'] !== 'cancelled')
  ) {
    throw new Error('Desktop Cut View mutation result is invalid.');
  }
  return {
    requestId: record['requestId'],
    status: record['status'],
    projection: parseDesktopShellProjection(record['projection']),
  };
}

export function parseDesktopCutViewMutationRequest(value: unknown): DesktopCutViewMutationRequest {
  if (!isRecord(value)) {
    throw new Error('Desktop Cut View mutation request must be an object.');
  }
  const record = value;
  const allowed = new Set([
    'requestId',
    'windowId',
    'rendererSessionId',
    'workbenchInstanceId',
    ...(record['identity'] === undefined ? [] : ['identity']),
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error('Desktop Cut View mutation request contains unknown fields.');
  }
  const readIdentity = (key: string): string => {
    const candidate = record[key];
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      throw new Error(`Desktop Cut ${key} is required.`);
    }
    return candidate;
  };
  return {
    requestId: readIdentity('requestId'),
    windowId: readIdentity('windowId'),
    rendererSessionId: readIdentity('rendererSessionId'),
    workbenchInstanceId: readIdentity('workbenchInstanceId'),
    ...(record['identity'] === undefined
      ? {}
      : { identity: parseCutHostRuntimeIdentity(record['identity']) }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    left.viewInstanceId === right.viewInstanceId &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId &&
    left.rendererSessionId === right.rendererSessionId
  );
}

export function isSameCutHostSession(
  left: CutHostRuntimeIdentity,
  right: CutHostRuntimeIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.viewId === right.viewId &&
    left.viewInstanceId === right.viewInstanceId &&
    left.sessionId === right.sessionId &&
    left.rendererSessionId === right.rendererSessionId
  );
}

export function desktopCutIdentityKey(identity: CutHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    identity.viewInstanceId,
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
  ].join(':');
}

export function rebindDesktopCutProjectionState<T>(input: {
  readonly identities: Map<string, CutHostRuntimeIdentity>;
  readonly eventSequences: Map<string, number>;
  readonly listeners: Set<{ readonly identity: CutHostRuntimeIdentity; readonly listener: T }>;
  readonly previousIdentity: CutHostRuntimeIdentity;
  readonly nextIdentity: CutHostRuntimeIdentity;
  readonly eventSequence: number;
}): void {
  if (!isSameCutHostSession(input.previousIdentity, input.nextIdentity)) {
    throw new Error('Desktop Cut projection rebind requires the same runtime session.');
  }
  if (!Number.isSafeInteger(input.eventSequence) || input.eventSequence < 1) {
    throw new Error('Desktop Cut projection rebind requires a positive event sequence.');
  }
  const previousKey = desktopCutIdentityKey(input.previousIdentity);
  const nextKey = desktopCutIdentityKey(input.nextIdentity);
  input.identities.delete(previousKey);
  input.eventSequences.delete(previousKey);
  input.identities.set(nextKey, input.nextIdentity);
  input.eventSequences.set(nextKey, input.eventSequence);
  for (const entry of [...input.listeners]) {
    if (!isSameCutHostIdentity(entry.identity, input.previousIdentity)) continue;
    input.listeners.delete(entry);
    input.listeners.add({ identity: input.nextIdentity, listener: entry.listener });
  }
}

export interface OpenNekoDesktopCutBridge {
  readonly cut: {
    createDraft(request: DesktopCutViewMutationRequest): Promise<DesktopCutViewMutationResult>;
    closeView(request: DesktopCutViewMutationRequest): Promise<DesktopCutViewMutationResult>;
    getSnapshot(identity: CutHostRuntimeIdentity): Promise<CutHostRuntimeSnapshot>;
    execute(request: CutHostRuntimeRequest): Promise<CutHostRuntimeResult>;
    subscribe(
      identity: CutHostRuntimeIdentity,
      listener: (event: CutHostRuntimeProjectionEvent) => void,
    ): () => void;
  };
}
