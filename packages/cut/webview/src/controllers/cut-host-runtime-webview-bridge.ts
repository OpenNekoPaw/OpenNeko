import {
  CUT_HOST_RUNTIME_ROUTES,
  type CutCommand,
  type CutHostRuntime,
  type CutHostRuntimeRoute,
  type CutHostRuntimeSnapshot,
} from '@neko/cut-domain';
import type { CutWebviewIntent } from './CutOtioController';
import type { CutWebviewHostBridge } from './CutWebviewHostBridgeContext';

export interface PreparedCutWebviewHostBridge extends CutWebviewHostBridge {
  prepare(): void;
  dispose(): void;
}

export function createCutHostRuntimeWebviewBridge(
  runtime: CutHostRuntime,
): PreparedCutWebviewHostBridge {
  const listeners = new Set<(message: unknown) => void>();
  let disposeRuntimeSubscription: (() => void) | undefined;
  let requestSequence = 0;
  let projectedSnapshotKey: string | undefined;
  let currentSnapshot: CutHostRuntimeSnapshot | undefined;
  let initialSnapshotRequest: Promise<CutHostRuntimeSnapshot> | undefined;
  let initialSnapshotError = false;
  let runtimeEventObserved = false;
  let disposed = false;

  const publish = (message: unknown): void => {
    for (const listener of listeners) listener(message);
  };
  const publishSnapshot = (snapshot: CutHostRuntimeSnapshot): void => {
    currentSnapshot = snapshot;
    const snapshotKey = JSON.stringify([
      snapshot.document,
      snapshot.dirty,
      snapshot.presentation,
      snapshot.export,
    ]);
    if (snapshotKey === projectedSnapshotKey) return;
    projectedSnapshotKey = snapshotKey;
    publish({
      type: 'cut:runtime-snapshot',
      view: snapshot.document,
      dirty: snapshot.dirty,
      presentation: snapshot.presentation,
    });
    publish({ type: 'cut:export-tasks', tasks: snapshot.export.tasks });
  };

  const replaySnapshot = (
    listener: (message: unknown) => void,
    snapshot: CutHostRuntimeSnapshot,
  ): void => {
    listener({
      type: 'cut:runtime-snapshot',
      view: snapshot.document,
      dirty: snapshot.dirty,
      presentation: snapshot.presentation,
    });
    listener({ type: 'cut:export-tasks', tasks: snapshot.export.tasks });
  };

  const ensureRuntimeSubscription = (): void => {
    if (disposed) throw new Error('Cut Webview bridge is disposed.');
    if (disposeRuntimeSubscription) return;
    disposeRuntimeSubscription = runtime.subscribe((event) => {
      if (disposed) return;
      runtimeEventObserved = true;
      publishSnapshot(event.snapshot);
    });
  };

  const readInitialSnapshot = (): Promise<CutHostRuntimeSnapshot> => {
    if (currentSnapshot) return Promise.resolve(currentSnapshot);
    if (initialSnapshotRequest) return initialSnapshotRequest;
    initialSnapshotRequest = runtime.getSnapshot().then((snapshot) => {
      if (!disposed && !runtimeEventObserved) publishSnapshot(snapshot);
      return currentSnapshot ?? snapshot;
    });
    void initialSnapshotRequest.catch(() => {
      if (disposed) return;
      initialSnapshotError = true;
      publish({ type: 'cut:error', diagnostic: { code: 'operation-failed' } });
    });
    return initialSnapshotRequest;
  };

  return {
    prepare() {
      ensureRuntimeSubscription();
      void readInitialSnapshot();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeRuntimeSubscription?.();
      disposeRuntimeSubscription = undefined;
      listeners.clear();
    },
    postIntent(intent) {
      void dispatchIntent({
        intent,
        runtime,
        readInitialSnapshot,
        nextRequestId: () => `cut-webview-${++requestSequence}`,
        publish,
        publishSnapshot,
      });
    },
    subscribe(listener) {
      if (disposed) throw new Error('Cut Webview bridge is disposed.');
      listeners.add(listener);
      ensureRuntimeSubscription();
      if (currentSnapshot) replaySnapshot(listener, currentSnapshot);
      else if (initialSnapshotError) {
        listener({ type: 'cut:error', diagnostic: { code: 'operation-failed' } });
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

async function dispatchIntent(input: {
  readonly intent: CutWebviewIntent;
  readonly runtime: CutHostRuntime;
  readonly readInitialSnapshot: () => Promise<CutHostRuntimeSnapshot>;
  readonly nextRequestId: () => string;
  readonly publish: (message: unknown) => void;
  readonly publishSnapshot: (snapshot: CutHostRuntimeSnapshot) => void;
}): Promise<void> {
  const { intent, runtime } = input;
  if (intent.type === 'cut:ready') {
    try {
      input.publishSnapshot(await input.readInitialSnapshot());
    } catch {
      input.publish({ type: 'cut:error', diagnostic: { code: 'operation-failed' } });
    }
    return;
  }

  const clientMutationId = 'clientMutationId' in intent ? intent.clientMutationId : undefined;
  try {
    const snapshot = await runtime.getSnapshot();
    assertIntentIdentity(intent, snapshot);
    const requestId =
      intent.type === 'cut:request-representations' ? intent.requestId : input.nextRequestId();
    const route = routeForIntent(intent);
    const payload = payloadForIntent(intent);
    const result = await runtime.execute({
      requestId,
      commandId: clientMutationId ?? requestId,
      route,
      identity: runtime.identity,
      ...(payload === undefined ? {} : { payload }),
    });
    input.publishSnapshot(result.snapshot);
    if (result.output?.type === 'representations') {
      input.publish({
        type: 'cut:representations',
        documentUri: result.snapshot.identity.documentId,
        sessionId: result.snapshot.identity.sessionId,
        requestId: result.output.requestId,
        results: result.output.results,
      });
    } else if (result.output?.type === 'preview') {
      input.publish(result.output.message);
    }
    if (clientMutationId) {
      input.publish({
        type: 'cut:mutation-result',
        clientMutationId,
        succeeded: true,
      });
    }
  } catch {
    if (intent.type === 'cut:request-representations') {
      input.publish({
        type: 'cut:representation-failed',
        documentUri: intent.documentUri,
        sessionId: intent.sessionId,
        requestId: intent.requestId,
        diagnostic: { code: 'media-runtime-unavailable' },
      });
      return;
    }
    input.publish({
      type: 'cut:error',
      diagnostic: { code: 'operation-failed' },
      ...(clientMutationId ? { clientMutationId } : {}),
    });
    if (clientMutationId) {
      input.publish({
        type: 'cut:mutation-result',
        clientMutationId,
        succeeded: false,
      });
    }
  }
}

function routeForIntent(
  intent: Exclude<CutWebviewIntent, { readonly type: 'cut:ready' }>,
): CutHostRuntimeRoute {
  switch (intent.type) {
    case 'cut:command':
    case 'cut:add-track':
    case 'cut:split':
    case 'cut:duplicate':
    case 'cut:separate':
      return CUT_HOST_RUNTIME_ROUTES.commandExecute;
    case 'cut:batch':
      return CUT_HOST_RUNTIME_ROUTES.commandBatch;
    case 'cut:undo':
      return CUT_HOST_RUNTIME_ROUTES.undo;
    case 'cut:redo':
      return CUT_HOST_RUNTIME_ROUTES.redo;
    case 'cut:save':
      return CUT_HOST_RUNTIME_ROUTES.save;
    case 'cut:presentation-update':
      return CUT_HOST_RUNTIME_ROUTES.presentationUpdate;
    case 'cut:select-link-media':
      return CUT_HOST_RUNTIME_ROUTES.mediaSelect;
    case 'cut:drop-link-media':
      return CUT_HOST_RUNTIME_ROUTES.mediaDrop;
    case 'cut:paste':
      return CUT_HOST_RUNTIME_ROUTES.commandBatch;
    case 'cut:send-to-agent':
      return CUT_HOST_RUNTIME_ROUTES.agentSend;
    case 'cut:preview-start':
      return CUT_HOST_RUNTIME_ROUTES.previewStart;
    case 'cut:preview-prepare':
      return CUT_HOST_RUNTIME_ROUTES.previewPrepare;
    case 'cut:preview-activate':
      return CUT_HOST_RUNTIME_ROUTES.previewActivate;
    case 'cut:preview-pause':
      return CUT_HOST_RUNTIME_ROUTES.previewPause;
    case 'cut:preview-stop':
      return CUT_HOST_RUNTIME_ROUTES.previewStop;
    case 'cut:request-representations':
      return CUT_HOST_RUNTIME_ROUTES.representationResolve;
    case 'cut:export-query':
      return CUT_HOST_RUNTIME_ROUTES.exportGet;
    case 'cut:export-start':
      return CUT_HOST_RUNTIME_ROUTES.exportStart;
    case 'cut:export-cancel':
      return CUT_HOST_RUNTIME_ROUTES.exportCancel;
  }
}

function payloadForIntent(
  intent: Exclude<CutWebviewIntent, { readonly type: 'cut:ready' }>,
): unknown {
  switch (intent.type) {
    case 'cut:command':
      return intent.command;
    case 'cut:batch':
      return intent.commands;
    case 'cut:undo':
    case 'cut:redo':
    case 'cut:save':
      return undefined;
    case 'cut:presentation-update':
      return intent.presentation;
    case 'cut:add-track':
      return {
        type: 'add-track',
        trackId: `track-${globalThis.crypto.randomUUID()}`,
        trackKind: intent.trackKind,
        name: intent.trackKind,
      } satisfies CutCommand;
    case 'cut:split':
      return {
        type: 'split',
        clipId: intent.clipId,
        offsetFrames: intent.offsetFrames,
        rightClipId: `clip-${globalThis.crypto.randomUUID()}`,
      } satisfies CutCommand;
    case 'cut:duplicate':
      return intent.clipIds.map((clipId): CutCommand => ({
        type: 'duplicate-clip',
        clipId,
        duplicateClipId: `clip-${globalThis.crypto.randomUUID()}`,
      }));
    case 'cut:separate':
      return {
        type: 'separate-audio',
        videoClipId: intent.videoClipId,
        audioClipId: `clip-${globalThis.crypto.randomUUID()}`,
        audioTrackId: `track-${globalThis.crypto.randomUUID()}`,
      } satisfies CutCommand;
    default:
      return intent;
  }
}

function assertIntentIdentity(
  intent: Exclude<CutWebviewIntent, { readonly type: 'cut:ready' }>,
  snapshot: CutHostRuntimeSnapshot,
): void {
  if (
    intent.documentUri !== snapshot.identity.documentId ||
    intent.sessionId !== snapshot.identity.sessionId
  ) {
    throw new Error('Cut Webview intent does not match its owning Host runtime snapshot.');
  }
}
