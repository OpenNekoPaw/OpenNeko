import {
  createCanvasMaterialActionResolutionRequest,
  createCanvasHostIntentRequest,
  type CanvasHostAuthoringCapabilities,
  type CanvasHostIntent,
  type CanvasHostPresentationState,
  type CanvasHostRuntime,
  type CanvasHostSnapshot,
} from '@neko/canvas-domain';
import { isValidNkc, type CanvasData, type CanvasViewport } from '@neko/canvas-domain';
import type { ContentLocator } from '@neko/content';
import type {
  CanvasMaterialActionDescriptor,
  CanvasMaterialActionIntent,
  CanvasMaterialMediaKind,
  CanvasReferencedContentLocator,
} from '@neko/canvas-domain';
import type { CanvasHostMessagePort } from '../hooks/useCanvasHostMessages';
import {
  createCanvasViewportSnapshotKey,
  readCanvasViewportSnapshot,
  writeCanvasViewportSnapshot,
  type CanvasWebviewStateDiagnostic,
} from '../utils/viewportWebviewState';

export interface CanvasWebviewDelegate extends CanvasHostMessagePort {
  supportsMessage?(messageType: string): boolean;
}

export interface CanvasWebviewHostPort extends CanvasHostMessagePort {
  readonly documentId: string;
  supportsMessage(messageType: string): boolean;
  subscribe(listener: (message: unknown) => void): () => void;
  requestSource(
    sourceKind: Extract<CanvasHostIntent, { readonly type: 'request-source' }>['sourceKind'],
    sourceMode: Extract<CanvasHostIntent, { readonly type: 'request-source' }>['sourceMode'],
    position?: { readonly x: number; readonly y: number },
  ): Promise<CanvasHostSnapshot>;
  requestGenerationDraft(
    mediaKind: Extract<
      CanvasHostIntent,
      { readonly type: 'request-generation-draft' }
    >['mediaKind'],
    position?: { readonly x: number; readonly y: number },
    inputNodeIds?: readonly string[],
  ): Promise<CanvasHostSnapshot>;
  projectContent(
    locator: CanvasReferencedContentLocator,
    mediaKind: CanvasMaterialMediaKind,
    position: { readonly x: number; readonly y: number },
    title?: string,
  ): Promise<CanvasHostSnapshot>;
  previewResource(locator: ContentLocator): Promise<void>;
  revealResource(locator: ContentLocator): Promise<void>;
  resolveMaterialActions(
    selectedNodeIds: readonly string[],
  ): Promise<readonly CanvasMaterialActionDescriptor[]>;
  getAuthoringCapabilities(): CanvasHostAuthoringCapabilities;
  executeMaterialAction(
    actionId: string,
    selectedNodeIds: readonly string[],
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<CanvasHostSnapshot>;
  dispose(): void;
}

export function createCanvasWebviewHost(
  runtime: CanvasHostRuntime,
  delegate?: CanvasWebviewDelegate,
): CanvasWebviewHostPort {
  const listeners = new Set<(message: unknown) => void>();
  let snapshot: CanvasHostSnapshot | undefined;
  let state: unknown = delegate?.getState();
  let disposed = false;
  let started = false;
  let commandSequence = 0;
  let materialActionRequestSequence = 0;
  let currentMaterialActionRequestId: string | undefined;
  let snapshotRequestSequence = 0;
  let currentSnapshotRequestId: string | undefined;
  let projectionSequence = 0;
  let operationTail: Promise<void> = Promise.resolve();
  const localCommandIds = new Set<string>();
  const localCommandOrder: string[] = [];
  let unsubscribeDelegate: (() => void) | undefined;
  let unsubscribeRuntime: (() => void) | undefined;

  const emit = (message: unknown): void => {
    if (disposed) return;
    for (const listener of listeners) listener(message);
  };

  const reportStateDiagnostic = (diagnostic: CanvasWebviewStateDiagnostic): void => {
    delegate?.reportStateDiagnostic?.(diagnostic);
  };

  const updatePresentationState = (next: CanvasHostSnapshot): void => {
    const previousState = state;
    state = mergePresentationIntoWebviewState(state, next, reportStateDiagnostic);
    if (state !== previousState) {
      delegate?.setState(state);
    }
  };

  const publishSnapshot = (next: CanvasHostSnapshot): void => {
    snapshot = next;
    updatePresentationState(next);
    emit({ type: 'update', data: next.canvas });
    emit({ type: 'canvas.hostPresentation', presentation: next.presentation });
  };

  const adoptLocalSnapshot = (next: CanvasHostSnapshot): void => {
    snapshot = next;
    updatePresentationState(next);
  };

  const start = (): void => {
    if (started) return;
    started = true;
    unsubscribeDelegate = delegate?.subscribe?.(emit);
    try {
      unsubscribeRuntime = runtime.subscribe((event) => {
        if (event.snapshot.identity.sessionId !== runtime.identity.sessionId) {
          throw new Error('Canvas Host projection belongs to another document session.');
        }
        if (event.sequence <= projectionSequence) return;
        projectionSequence = event.sequence;
        currentSnapshotRequestId = undefined;
        if (event.originCommandId && localCommandIds.has(event.originCommandId)) {
          adoptLocalSnapshot(event.snapshot);
          return;
        }
        publishSnapshot(event.snapshot);
      });
    } catch (error) {
      unsubscribeDelegate?.();
      unsubscribeDelegate = undefined;
      started = false;
      throw error;
    }
  };

  const executeSave = async (): Promise<void> => {
    await executeIntent({ type: 'save' });
  };

  const executeCanvasStatus = async (value: unknown): Promise<void> => {
    let current = snapshot ?? (await runtime.getSnapshot());
    const canvas = mergeCanvasStatus(current.canvas, value);
    if (!areJsonValuesEqual(canvas, current.canvas)) {
      current = await executeIntent({
        type: 'replace-document',
        canvas,
      });
    }
    const presentation = parseCanvasPresentation(value);
    if (!areJsonValuesEqual(presentation, current.presentation)) {
      await executeIntent({
        type: 'update-presentation',
        presentation,
      });
    }
  };

  const executeViewportState = async (nextState: unknown): Promise<void> => {
    const current = snapshot ?? (await runtime.getSnapshot());
    const viewport = readViewportFromWebviewState(nextState, current, reportStateDiagnostic);
    if (!viewport) return;
    const presentation: CanvasHostPresentationState = {
      viewport,
      selectedNodeIds: current.presentation.selectedNodeIds,
    };
    if (areJsonValuesEqual(presentation, current.presentation)) return;
    await executeIntent({
      type: 'update-presentation',
      presentation,
    });
  };

  const executeIntent = async (intent: CanvasHostIntent): Promise<CanvasHostSnapshot> => {
    commandSequence += 1;
    const commandId = `canvas-webview-command:${commandSequence}`;
    rememberLocalCommand(commandId);
    const result = await runtime.executeIntent(
      createCanvasHostIntentRequest({
        requestId: `canvas-webview-request:${commandSequence}`,
        commandId,
        identity: runtime.identity,
        intent,
      }),
    );
    if (result.status === 'rejected') {
      throw new Error(result.diagnostic.message);
    }
    snapshot = result.snapshot;
    return result.snapshot;
  };

  const postMessage = (value: unknown): void => {
    if (disposed) throw new Error('Canvas Webview Host is disposed.');
    if (!isRecord(value) || typeof value['type'] !== 'string') {
      throw new Error('Canvas Webview emitted an invalid Host message.');
    }
    switch (value['type']) {
      case 'ready':
        snapshotRequestSequence += 1;
        currentSnapshotRequestId = `canvas-webview-snapshot:${snapshotRequestSequence}`;
        {
          const requestId = currentSnapshotRequestId;
          void runtime.getSnapshot().then(
            (next) => {
              if (currentSnapshotRequestId !== requestId) return;
              currentSnapshotRequestId = undefined;
              publishSnapshot(next);
            },
            (error: unknown) => {
              if (currentSnapshotRequestId !== requestId) return;
              currentSnapshotRequestId = undefined;
              emitLoadFailure(error);
            },
          );
        }
        return;
      case 'canvasStatus': {
        enqueue(() => executeCanvasStatus(value['data']));
        return;
      }
      case 'save':
      case 'requestSave': {
        enqueue(executeSave);
        return;
      }
      case 'canvasDataReady':
      case 'selectionChange':
      case 'webviewKeyboardFocus':
      case 'webviewKeyboardEditable':
      case 'canvasChanged':
      case 'operationApplied':
      case 'canvasContentNodeDeltaApplied':
        return;
      case 'canvasAction':
        if (
          (value['action'] === 'openExport' || value['action'] === 'openPackage') &&
          supportsMessage('canvasAction')
        ) {
          delegate!.postMessage(value);
        }
        return;
      default:
        if (delegate && supportsMessage(value['type'])) {
          delegate.postMessage(value);
          return;
        }
        throw new Error(`Canvas Host runtime does not implement message '${value['type']}'.`);
    }
  };

  const emitLoadFailure = (error: unknown): void => {
    emit({
      type: 'canvas.loadFailed',
      diagnostic: {
        code: 'canvas-runtime-effect-failed',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  };

  const enqueue = (operation: () => Promise<void>): void => {
    operationTail = operationTail.then(operation).catch((error: unknown) => {
      emitLoadFailure(error);
    });
  };

  const waitForOperationQueueToSettle = async (): Promise<void> => {
    let observedTail: Promise<void>;
    do {
      observedTail = operationTail;
      await observedTail;
    } while (observedTail !== operationTail);
  };

  const supportsMessage = (messageType: string): boolean =>
    delegate !== undefined && (delegate.supportsMessage?.(messageType) ?? true);

  const rememberLocalCommand = (commandId: string): void => {
    localCommandIds.add(commandId);
    localCommandOrder.push(commandId);
    if (localCommandOrder.length <= 256) return;
    const oldest = localCommandOrder.shift();
    if (oldest) localCommandIds.delete(oldest);
  };

  return {
    documentId: runtime.identity.documentId,
    postMessage,
    supportsMessage,
    getState: () => delegate?.getState() ?? state,
    setState: (next) => {
      state = next;
      delegate?.setState(next);
      enqueue(() => executeViewportState(next));
    },
    reportStateDiagnostic,
    subscribe(listener) {
      if (disposed) throw new Error('Canvas Webview Host is disposed.');
      listeners.add(listener);
      try {
        start();
      } catch (error) {
        listeners.delete(listener);
        throw error;
      }
      return () => listeners.delete(listener);
    },
    async requestSource(sourceKind, sourceMode, position) {
      const next = await executeIntent({
        type: 'request-source',
        sourceKind,
        sourceMode,
        ...(position ? { position } : {}),
      });
      publishSnapshot(next);
      return next;
    },
    async resolveMaterialActions(selectedNodeIds) {
      await waitForOperationQueueToSettle();
      materialActionRequestSequence += 1;
      const requestId = `canvas-webview-material-actions:${materialActionRequestSequence}`;
      currentMaterialActionRequestId = requestId;
      const resolution = await runtime.resolveMaterialActions(
        createCanvasMaterialActionResolutionRequest({
          requestId,
          identity: runtime.identity,
          selectedNodeIds: [...selectedNodeIds],
        }),
      );
      if (currentMaterialActionRequestId !== requestId) {
        throw new Error('Canvas material action resolution was superseded by another request.');
      }
      if (!areJsonValuesEqual(selectedNodeIds, resolution.selectedNodeIds)) {
        throw new Error('Canvas material action resolution returned another selection.');
      }
      return structuredClone(resolution.descriptors);
    },
    getAuthoringCapabilities: () =>
      structuredClone(
        snapshot?.authoringCapabilities ?? {
          sourceModes: [],
          generationMediaKinds: [],
        },
      ),
    async executeMaterialAction(actionId, selectedNodeIds, payload = {}) {
      const action: CanvasMaterialActionIntent = {
        identity: {
          projectId: runtime.identity.projectId,
          canvasId: runtime.identity.documentId,
          canvasSessionId: runtime.identity.sessionId,
        },
        actionId,
        selectedNodeIds: [...selectedNodeIds],
        payload,
      };
      return executeIntent({ type: 'execute-material-action', action });
    },
    async requestGenerationDraft(mediaKind, position, inputNodeIds = []) {
      const next = await executeIntent({
        type: 'request-generation-draft',
        mediaKind,
        inputNodeIds: [...inputNodeIds],
        ...(position ? { position } : {}),
      });
      publishSnapshot(next);
      return next;
    },
    async projectContent(locator, mediaKind, position, title) {
      const current = snapshot ?? (await runtime.getSnapshot());
      const next = await executeIntent({
        type: 'author-material',
        request: {
          kind: 'direct-reference',
          identity: {
            projectId: current.identity.projectId,
            canvasId: current.identity.documentId,
            canvasSessionId: current.identity.sessionId,
          },
          locator,
          mediaKind,
          position,
          ...(title ? { title } : {}),
        },
      });
      publishSnapshot(next);
      return next;
    },
    async previewResource(locator) {
      await executeIntent({ type: 'preview-resource', locator });
    },
    async revealResource(locator) {
      await executeIntent({ type: 'reveal-resource', locator });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeRuntime?.();
      unsubscribeDelegate?.();
      runtime.dispose?.();
      listeners.clear();
    },
  };
}

function mergeCanvasStatus(previous: CanvasData, value: unknown): CanvasData {
  if (!isRecord(value)) {
    throw new Error('Canvas status does not contain a document payload.');
  }
  const next: unknown = {
    ...previous,
    name: value['name'],
    viewport: previous.viewport,
    nodes: value['nodes'],
    connections: value['connections'],
  };
  if (!isValidNkc(next)) {
    throw new Error('Canvas status does not contain a valid .nkc document.');
  }
  return next;
}

function parseCanvasPresentation(value: unknown): CanvasHostPresentationState {
  if (!isRecord(value) || !isCanvasViewport(value['viewport'])) {
    throw new Error('Canvas status does not contain a valid presentation viewport.');
  }
  const selection = value['_selection'];
  if (
    !isRecord(selection) ||
    !Array.isArray(selection['nodeIds']) ||
    !selection['nodeIds'].every((nodeId) => typeof nodeId === 'string')
  ) {
    throw new Error('Canvas status does not contain a valid presentation selection.');
  }
  return {
    viewport: value['viewport'],
    selectedNodeIds: selection['nodeIds'],
  };
}

function mergePresentationIntoWebviewState(
  currentState: unknown,
  snapshot: CanvasHostSnapshot,
  reportStateDiagnostic: (diagnostic: CanvasWebviewStateDiagnostic) => void,
): unknown {
  let nextState = currentState;
  writeCanvasViewportSnapshot(
    {
      getState: () => currentState,
      setState: (value) => {
        nextState = value;
      },
      reportStateDiagnostic,
    },
    createCanvasViewportSnapshotKey(snapshot.identity.documentId),
    snapshot.presentation.viewport,
  );
  return nextState;
}

function readViewportFromWebviewState(
  value: unknown,
  snapshot: CanvasHostSnapshot,
  reportStateDiagnostic: (diagnostic: CanvasWebviewStateDiagnostic) => void,
): CanvasViewport | undefined {
  return readCanvasViewportSnapshot(
    {
      getState: () => value,
      setState: () => {
        throw new Error('Canvas viewport state reader cannot write state.');
      },
      reportStateDiagnostic,
    },
    createCanvasViewportSnapshotKey(snapshot.identity.documentId),
  );
}

function isCanvasViewport(value: unknown): value is CanvasViewport {
  if (!isRecord(value) || !isRecord(value['pan'])) return false;
  return (
    typeof value['pan']['x'] === 'number' &&
    Number.isFinite(value['pan']['x']) &&
    typeof value['pan']['y'] === 'number' &&
    Number.isFinite(value['pan']['y']) &&
    typeof value['zoom'] === 'number' &&
    Number.isFinite(value['zoom'])
  );
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
