import {
  createCanvasMaterialActionResolutionRequest,
  createCanvasHostIntentRequest,
  createCanvasTextFilePreviewRequest,
  parseCanvasTextFilePreviewResult,
  type CanvasHostAuthoringCapabilities,
  type CanvasHostIntent,
  type CanvasHostPresentationState,
  type CanvasHostRuntime,
  type CanvasHostSnapshot,
  type CanvasGenerationKind,
  type CanvasGenerationRecipe,
  type CanvasGenerationRuntimeProjection,
  type CanvasTextFilePreviewResult,
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
  createGenerationNode(
    kind: CanvasGenerationKind,
    position?: { readonly x: number; readonly y: number },
  ): Promise<CanvasHostSnapshot>;
  attachGenerationReference(
    nodeId: string,
    sourceKind: Extract<
      CanvasHostIntent,
      { readonly type: 'attach-generation-reference' }
    >['sourceKind'],
    sourceMode: Extract<
      CanvasHostIntent,
      { readonly type: 'attach-generation-reference' }
    >['sourceMode'],
  ): Promise<CanvasHostSnapshot>;
  attachGenerationReferenceMaterial(
    nodeId: string,
    input: {
      readonly locator: CanvasReferencedContentLocator;
      readonly mediaKind: CanvasMaterialMediaKind;
      readonly title: string;
    },
  ): Promise<CanvasHostSnapshot>;
  updateGenerationRecipe(
    nodeId: string,
    recipe: CanvasGenerationRecipe,
  ): Promise<CanvasHostSnapshot>;
  runGenerationNode(nodeId: string): Promise<CanvasHostSnapshot>;
  cancelGenerationNode(nodeId: string): Promise<CanvasHostSnapshot>;
  selectGenerationOutput(nodeId: string, outputId: string): Promise<CanvasHostSnapshot>;
  authorGenerationText(nodeId: string, text: string): Promise<CanvasHostSnapshot>;
  getGenerationProjection(nodeId: string): CanvasGenerationRuntimeProjection | undefined;
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
  readTextFilePreview(
    nodeId: string,
    locator: ContentLocator,
  ): Promise<CanvasTextFilePreviewResult>;
  getAuthoringCapabilities(): CanvasHostAuthoringCapabilities;
  executeMaterialAction(
    actionId: string,
    selectedNodeIds: readonly string[],
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<CanvasHostSnapshot>;
  dispose(): void;
}

export interface PreparedCanvasWebviewHostPort extends CanvasWebviewHostPort {
  prepare(): void;
}

export function createCanvasWebviewHost(
  runtime: CanvasHostRuntime,
  delegate?: CanvasWebviewDelegate,
): PreparedCanvasWebviewHostPort {
  const listeners = new Set<(message: unknown) => void>();
  let snapshot: CanvasHostSnapshot | undefined;
  let state: unknown = delegate?.getState();
  let disposed = false;
  let started = false;
  let commandSequence = 0;
  let materialActionRequestSequence = 0;
  let textFilePreviewRequestSequence = 0;
  let currentMaterialActionRequestId: string | undefined;
  let initialSnapshotRequest: Promise<CanvasHostSnapshot> | undefined;
  let initialSnapshotFailure: unknown;
  let runtimeEventObserved = false;
  let projectionSequence = 0;
  let operationTail: Promise<void> = Promise.resolve();
  const localCommandIds = new Set<string>();
  const localCommandOrder: string[] = [];
  const pendingRemovedNodeIds = new Set<string>();
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
    pendingRemovedNodeIds.clear();
    snapshot = next;
    updatePresentationState(next);
    emit({ type: 'update', data: next.canvas });
    emit({ type: 'canvas.hostPresentation', presentation: next.presentation });
  };

  const replaySnapshot = (listener: (message: unknown) => void, next: CanvasHostSnapshot): void => {
    listener({ type: 'update', data: next.canvas });
    listener({ type: 'canvas.hostPresentation', presentation: next.presentation });
  };

  const loadFailureMessage = (error: unknown): unknown => ({
    type: 'canvas.loadFailed',
    diagnostic: {
      code: 'canvas-runtime-effect-failed',
      message: error instanceof Error ? error.message : String(error),
    },
  });

  const emitLoadFailure = (error: unknown): void => {
    emit(loadFailureMessage(error));
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
        runtimeEventObserved = true;
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

  const readInitialSnapshot = (): Promise<CanvasHostSnapshot> => {
    if (disposed) return Promise.reject(new Error('Canvas Webview Host is disposed.'));
    if (snapshot) return Promise.resolve(snapshot);
    if (initialSnapshotRequest) return initialSnapshotRequest;
    initialSnapshotRequest = runtime.getSnapshot().then((next) => {
      if (!disposed && !runtimeEventObserved) publishSnapshot(next);
      return snapshot ?? next;
    });
    void initialSnapshotRequest.catch((error: unknown) => {
      if (disposed) return;
      initialSnapshotFailure = error;
      emitLoadFailure(error);
    });
    return initialSnapshotRequest;
  };

  const executeSave = async (): Promise<void> => {
    await executeIntent({
      type: 'save',
      removedNodeIds: [...pendingRemovedNodeIds],
    });
    pendingRemovedNodeIds.clear();
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

  const readTextFilePreview = (
    nodeId: string,
    locator: ContentLocator,
  ): Promise<CanvasTextFilePreviewResult> => {
    if (disposed) return Promise.reject(new Error('Canvas Webview Host is disposed.'));
    textFilePreviewRequestSequence += 1;
    const request = createCanvasTextFilePreviewRequest({
      requestId: `canvas-webview-text-preview:${textFilePreviewRequestSequence}`,
      identity: runtime.identity,
      nodeId,
      locator,
    });
    return runtime
      .readTextFilePreview(request)
      .then((result) => parseCanvasTextFilePreviewResult(result, request.requestId, nodeId));
  };

  const postMessage = (value: unknown): void => {
    if (disposed) throw new Error('Canvas Webview Host is disposed.');
    if (!isRecord(value) || typeof value['type'] !== 'string') {
      throw new Error('Canvas Webview emitted an invalid Host message.');
    }
    switch (value['type']) {
      case 'ready':
        void readInitialSnapshot().catch(() => undefined);
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
        return;
      case 'canvasContentNodeDeltaApplied': {
        applyContentNodeDelta(value, pendingRemovedNodeIds);
        return;
      }
      case 'canvasAction':
        if (
          delegate &&
          (value['action'] === 'openExport' || value['action'] === 'openPackage') &&
          supportsMessage('canvasAction')
        ) {
          delegate.postMessage(value);
        }
        return;
      case 'preview:resolveResource':
      case 'preview:releaseResource':
        if (!delegate || !supportsMessage(value['type'])) {
          throw new Error(`Canvas Host runtime does not implement message '${value['type']}'.`);
        }
        delegate.postMessage(value);
        return;
      default:
        throw new Error(`Canvas Host runtime does not implement message '${value['type']}'.`);
    }
  };

  const queueOperation = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationTail.then(operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const enqueue = (operation: () => Promise<void>): void => {
    void queueOperation(operation).catch(emitLoadFailure);
  };

  const waitForOperationQueueToSettle = async (): Promise<void> => {
    let observedTail: Promise<void>;
    do {
      observedTail = operationTail;
      await observedTail;
    } while (observedTail !== operationTail);
  };

  const supportsMessage = (messageType: string): boolean =>
    delegate !== undefined && (delegate.supportsMessage?.(messageType) ?? false);

  const rememberLocalCommand = (commandId: string): void => {
    localCommandIds.add(commandId);
    localCommandOrder.push(commandId);
    if (localCommandOrder.length <= 256) return;
    const oldest = localCommandOrder.shift();
    if (oldest) localCommandIds.delete(oldest);
  };

  return {
    documentId: runtime.identity.documentId,
    prepare() {
      start();
      void readInitialSnapshot().catch(() => undefined);
    },
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
      const preparedSnapshot = snapshot;
      const preparedFailure = initialSnapshotFailure;
      listeners.add(listener);
      try {
        start();
      } catch (error) {
        listeners.delete(listener);
        throw error;
      }
      if (preparedSnapshot) replaySnapshot(listener, preparedSnapshot);
      else if (preparedFailure) listener(loadFailureMessage(preparedFailure));
      return () => listeners.delete(listener);
    },
    async requestSource(sourceKind, sourceMode, position) {
      return queueOperation(async () => {
        const next = await executeIntent({
          type: 'request-source',
          sourceKind,
          sourceMode,
          ...(position ? { position } : {}),
        });
        publishSnapshot(next);
        return next;
      });
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
    readTextFilePreview,
    getAuthoringCapabilities: () =>
      structuredClone(
        snapshot?.authoringCapabilities ?? {
          sourceModes: [],
          generationKinds: [],
          generationModels: [],
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
      return queueOperation(() => executeIntent({ type: 'execute-material-action', action }));
    },
    async createGenerationNode(kind, position) {
      return queueOperation(async () => {
        const next = await executeIntent({
          type: 'create-generation-node',
          kind,
          ...(position ? { position } : {}),
        });
        publishSnapshot(next);
        return next;
      });
    },
    async attachGenerationReference(nodeId, sourceKind, sourceMode) {
      return queueOperation(async () => {
        const next = await executeIntent({
          type: 'attach-generation-reference',
          nodeId,
          sourceKind,
          sourceMode,
        });
        publishSnapshot(next);
        return next;
      });
    },
    async attachGenerationReferenceMaterial(nodeId, input) {
      return queueOperation(async () => {
        const current = snapshot ?? (await runtime.getSnapshot());
        const next = await executeIntent({
          type: 'attach-generation-reference-material',
          nodeId,
          request: {
            kind: 'direct-reference',
            identity: {
              projectId: current.identity.projectId,
              canvasId: current.identity.documentId,
              canvasSessionId: current.identity.sessionId,
            },
            locator: input.locator,
            mediaKind: input.mediaKind,
            title: input.title,
          },
        });
        publishSnapshot(next);
        return next;
      });
    },
    async updateGenerationRecipe(nodeId, recipe) {
      return queueOperation(async () => {
        const next = await executeIntent({ type: 'update-generation-recipe', nodeId, recipe });
        publishSnapshot(next);
        return next;
      });
    },
    async runGenerationNode(nodeId) {
      return queueOperation(async () => {
        const next = await executeIntent({ type: 'run-generation-node', nodeId });
        publishSnapshot(next);
        return next;
      });
    },
    async cancelGenerationNode(nodeId) {
      return queueOperation(async () => {
        const next = await executeIntent({ type: 'cancel-generation-node', nodeId });
        publishSnapshot(next);
        return next;
      });
    },
    async selectGenerationOutput(nodeId, outputId) {
      return queueOperation(async () => {
        const next = await executeIntent({ type: 'select-generation-output', nodeId, outputId });
        publishSnapshot(next);
        return next;
      });
    },
    async authorGenerationText(nodeId, text) {
      return queueOperation(async () => {
        const next = await executeIntent({ type: 'author-generation-text', nodeId, text });
        publishSnapshot(next);
        return next;
      });
    },
    getGenerationProjection(nodeId) {
      return snapshot?.generationNodes.find((projection) => projection.nodeId === nodeId);
    },
    async projectContent(locator, mediaKind, position, title) {
      return queueOperation(async () => {
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
      });
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

function applyContentNodeDelta(
  value: Record<string, unknown>,
  pendingRemovedNodeIds: Set<string>,
): void {
  const removedNodeIds = requireNodeIdentityArray(value['removedNodeIds'], 'removed');
  const restoredNodeIds = requireNodeIdentityArray(value['restoredNodeIds'], 'restored');
  for (const nodeId of removedNodeIds) pendingRemovedNodeIds.add(nodeId);
  for (const nodeId of restoredNodeIds) pendingRemovedNodeIds.delete(nodeId);
}

function requireNodeIdentityArray(value: unknown, kind: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Canvas Webview ${kind} node identities must be an array.`);
  }
  const identities = value.map((nodeId) => {
    if (typeof nodeId !== 'string' || nodeId.trim().length === 0) {
      throw new Error(`Canvas Webview ${kind} node identity is invalid.`);
    }
    return nodeId;
  });
  if (new Set(identities).size !== identities.length) {
    throw new Error(`Canvas Webview ${kind} node identities must be unique.`);
  }
  return identities;
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
