import {
  CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
  type CanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntime,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
  projectContentLocatorToCanvas,
} from '@neko-canvas/domain';
import { createProjectSourceAddClient, isValidNkc, type CanvasData } from '@neko/shared';
import { getVSCodeAPI } from '@neko/shared/vscode';

const VSCODE_CANVAS_IDENTITY: CanvasHostRuntimeIdentity = {
  projectId: 'vscode-project',
  workspaceId: 'vscode-workspace',
  windowId: 'vscode-window',
  viewId: 'vscode-canvas-view',
  viewEpoch: 1,
  documentId: 'vscode-custom-document',
  sessionId: 'vscode-custom-editor-session',
  endpointEpoch: 'vscode-webview',
};

export function createVscodeCanvasHostRuntime(): CanvasHostRuntime {
  const vscode = getVSCodeAPI();
  if (!vscode) {
    throw new Error('Canvas VS Code Host runtime requires the VS Code Webview API.');
  }
  const listeners = new Set<(event: CanvasHostProjectionEvent) => void>();
  const snapshotWaiters = new Set<{
    readonly resolve: (snapshot: CanvasHostSnapshot) => void;
    readonly reject: (error: Error) => void;
  }>();
  let snapshot: CanvasHostSnapshot | undefined;
  let sequence = 0;
  let disposed = false;
  const sourceClient = createProjectSourceAddClient({
    postMessage: (message) => vscode.postMessage(message),
    addMessageListener: (listener) => {
      const handler = (event: MessageEvent): void => listener(event.data);
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    },
  });

  const acceptDocument = (
    canvas: CanvasData,
    dirty = false,
    presentation = snapshot?.presentation,
  ): CanvasHostSnapshot => {
    snapshot = {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      identity: VSCODE_CANVAS_IDENTITY,
      revision: (snapshot?.revision ?? -1) + 1,
      dirty,
      canvas,
      presentation: presentation ?? {
        viewport: canvas.viewport ?? { pan: { x: 0, y: 0 }, zoom: 1 },
        selectedNodeIds: [],
      },
    };
    for (const waiter of snapshotWaiters) waiter.resolve(snapshot);
    snapshotWaiters.clear();
    sequence += 1;
    const event: CanvasHostProjectionEvent = {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      sequence,
      snapshot,
    };
    for (const listener of listeners) listener(event);
    return snapshot;
  };

  const handleMessage = (event: MessageEvent): void => {
    if (disposed) return;
    const message = event.data;
    if (!isRecord(message)) return;
    if (
      (message['type'] === 'update' || message['type'] === 'canvas.hostAppliedDocument') &&
      isValidNkc(message['data'])
    ) {
      acceptDocument(message['data']);
    }
    if (
      message['type'] === 'canvas.loadFailed' &&
      isRecord(message['diagnostic']) &&
      typeof message['diagnostic']['message'] === 'string'
    ) {
      const error = new Error(message['diagnostic']['message']);
      for (const waiter of snapshotWaiters) waiter.reject(error);
      snapshotWaiters.clear();
    }
  };
  window.addEventListener('message', handleMessage);

  return {
    identity: VSCODE_CANVAS_IDENTITY,
    async getSnapshot() {
      if (disposed) throw new Error('VS Code Canvas Host runtime is disposed.');
      if (snapshot) return snapshot;
      vscode.postMessage({ type: 'ready' });
      return new Promise<CanvasHostSnapshot>((resolve, reject) => {
        snapshotWaiters.add({ resolve, reject });
      });
    },
    subscribe(listener) {
      if (disposed) throw new Error('VS Code Canvas Host runtime is disposed.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async executeIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult> {
      if (disposed) return rejected(request, 'VS Code Canvas Host runtime is disposed.');
      if (!snapshot) {
        return rejected(request, 'VS Code Canvas intent requires a document snapshot.');
      }
      if (request.expectedRevision !== snapshot.revision) {
        return {
          schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
          requestId: request.requestId,
          commandId: request.commandId,
          status: 'rejected',
          diagnostic: {
            code: 'canvas-runtime-stale-revision',
            message: `VS Code Canvas revision ${request.expectedRevision} is stale; expected ${snapshot.revision}.`,
          },
        };
      }
      if (request.intent.type === 'request-source') {
        const sourceKind = request.intent.sourceKind;
        const result = await sourceClient.addSource({
          kind: 'file-picker',
          formatId: 'nkc',
          browserFile: {
            name:
              sourceKind === 'canvas'
                ? 'canvas.nkc'
                : sourceKind === 'document'
                  ? 'document'
                  : sourceKind,
          },
          target: {
            role:
              sourceKind === 'audio'
                ? 'audio'
                : sourceKind === 'image'
                  ? 'image'
                  : sourceKind === 'canvas'
                    ? 'project'
                    : sourceKind === 'document'
                      ? 'document'
                      : 'media',
          },
          assetDirectory:
            sourceKind === 'image' || sourceKind === 'video' || sourceKind === 'audio'
              ? 'media'
              : 'assets',
        });
        if (!result.ok || !result.durablePath) {
          return rejected(
            request,
            result.diagnostics[0]?.message ?? 'VS Code Canvas source selection was cancelled.',
            'canvas-runtime-source-cancelled',
          );
        }
        const canvas = projectContentLocatorToCanvas({
          canvas: snapshot.canvas,
          locator: { kind: 'workspace-file', path: result.durablePath },
          ...(request.intent.position ? { position: request.intent.position } : {}),
        });
        vscode.postMessage({ type: 'canvasStatus', data: canvas });
        return {
          schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
          requestId: request.requestId,
          commandId: request.commandId,
          status: 'accepted',
          snapshot: acceptDocument(canvas, true),
        };
      }
      if (request.intent.type === 'project-content') {
        const canvas = projectContentLocatorToCanvas({
          canvas: snapshot.canvas,
          locator: request.intent.locator,
          ...(request.intent.position ? { position: request.intent.position } : {}),
        });
        vscode.postMessage({ type: 'canvasStatus', data: canvas });
        return accepted(request, acceptDocument(canvas, true));
      }
      if (request.intent.type === 'save') {
        vscode.postMessage({ type: 'requestSave' });
        return accepted(request, acceptDocument(snapshot.canvas, false));
      }
      if (request.intent.type === 'update-presentation') {
        return accepted(
          request,
          acceptDocument(snapshot.canvas, snapshot.dirty, request.intent.presentation),
        );
      }
      if (request.intent.type === 'preview-resource' || request.intent.type === 'reveal-resource') {
        if (request.intent.locator.kind !== 'workspace-file') {
          return rejected(
            request,
            'VS Code Canvas document actions require a workspace-file ContentLocator.',
          );
        }
        vscode.postMessage({
          type: 'openDocument',
          docPath: request.intent.locator.path,
          ...(request.intent.type === 'reveal-resource' ? { reveal: true } : {}),
        });
        return accepted(request, snapshot);
      }
      if (request.intent.type !== 'replace-document') {
        return {
          schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
          requestId: request.requestId,
          commandId: request.commandId,
          status: 'rejected',
          diagnostic: {
            code: 'canvas-runtime-unsupported-intent',
            message: `VS Code Canvas adapter does not implement '${request.intent.type}' through this route.`,
          },
        };
      }
      vscode.postMessage({
        type: 'canvasStatus',
        data: request.intent.canvas,
      });
      return {
        schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
        requestId: request.requestId,
        commandId: request.commandId,
        status: 'accepted',
        snapshot: acceptDocument(request.intent.canvas, true),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('message', handleMessage);
      const error = new Error('VS Code Canvas Host runtime was disposed before loading.');
      for (const waiter of snapshotWaiters) waiter.reject(error);
      snapshotWaiters.clear();
      listeners.clear();
    },
  };
}

function accepted(
  request: CanvasHostIntentRequest,
  snapshot: CanvasHostSnapshot,
): CanvasHostIntentResult {
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    requestId: request.requestId,
    commandId: request.commandId,
    status: 'accepted',
    snapshot,
  };
}

function rejected(
  request: CanvasHostIntentRequest,
  message: string,
  code:
    | 'canvas-runtime-source-cancelled'
    | 'canvas-runtime-effect-failed' = 'canvas-runtime-effect-failed',
): CanvasHostIntentResult {
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    requestId: request.requestId,
    commandId: request.commandId,
    status: 'rejected',
    diagnostic: { code, message },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
