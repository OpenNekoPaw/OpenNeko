import {
  createCanvasHostIntentRequest,
  type CanvasHostIntent,
  type CanvasHostPresentationState,
  type CanvasHostRuntime,
  type CanvasHostSnapshot,
} from '@neko-canvas/domain';
import { isValidNkc, type CanvasData, type CanvasViewport } from '@neko/shared';
import type { ContentLocator } from '@neko/shared';
import type { VSCodeAPI } from '../hooks/useVSCodeMessages';
import { createCanvasViewportSnapshotKey } from '../utils/viewportWebviewState';

export interface CanvasWebviewDelegate extends NonNullable<VSCodeAPI> {
  supportsMessage?(messageType: string): boolean;
}

export interface CanvasWebviewHostPort extends NonNullable<VSCodeAPI> {
  supportsMessage(messageType: string): boolean;
  subscribe(listener: (message: unknown) => void): () => void;
  requestSource(
    sourceKind: Extract<CanvasHostIntent, { readonly type: 'request-source' }>['sourceKind'],
    position?: { readonly x: number; readonly y: number },
  ): Promise<CanvasHostSnapshot>;
  projectContent(
    locator: ContentLocator,
    position: { readonly x: number; readonly y: number },
  ): Promise<CanvasHostSnapshot>;
  previewResource(locator: ContentLocator): Promise<void>;
  revealResource(locator: ContentLocator): Promise<void>;
  dispose(): void;
}

export function createCanvasWebviewHost(
  runtime: CanvasHostRuntime,
  delegate?: CanvasWebviewDelegate,
): CanvasWebviewHostPort {
  const listeners = new Set<(message: unknown) => void>();
  let snapshot: CanvasHostSnapshot | undefined;
  let state: unknown;
  let disposed = false;
  let started = false;
  let commandSequence = 0;
  let operationTail: Promise<void> = Promise.resolve();
  let unsubscribeDelegate: (() => void) | undefined;
  let unsubscribeRuntime: (() => void) | undefined;

  const emit = (message: unknown): void => {
    if (disposed) return;
    for (const listener of listeners) listener(message);
  };

  const publishSnapshot = (next: CanvasHostSnapshot): void => {
    snapshot = next;
    state = mergePresentationIntoWebviewState(state, next);
    delegate?.setState(state);
    emit({ type: 'update', data: next.canvas });
    emit({ type: 'canvas.hostPresentation', presentation: next.presentation });
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
    const current = snapshot ?? (await runtime.getSnapshot());
    await executeIntent(current, { type: 'save' });
  };

  const executeCanvasStatus = async (value: unknown): Promise<void> => {
    let current = snapshot ?? (await runtime.getSnapshot());
    const canvas = mergeCanvasStatus(current.canvas, value);
    if (!areJsonValuesEqual(canvas, current.canvas)) {
      current = await executeIntent(current, {
        type: 'replace-document',
        canvas,
      });
    }
    const presentation = parseCanvasPresentation(value);
    if (!areJsonValuesEqual(presentation, current.presentation)) {
      await executeIntent(current, {
        type: 'update-presentation',
        presentation,
      });
    }
  };

  const executeViewportState = async (nextState: unknown): Promise<void> => {
    const current = snapshot ?? (await runtime.getSnapshot());
    const viewport = readViewportFromWebviewState(nextState, current.canvas);
    if (!viewport) return;
    const presentation: CanvasHostPresentationState = {
      viewport,
      selectedNodeIds: current.presentation.selectedNodeIds,
    };
    if (areJsonValuesEqual(presentation, current.presentation)) return;
    await executeIntent(current, {
      type: 'update-presentation',
      presentation,
    });
  };

  const executeIntent = async (
    current: CanvasHostSnapshot,
    intent: CanvasHostIntent,
  ): Promise<CanvasHostSnapshot> => {
    commandSequence += 1;
    const result = await runtime.executeIntent(
      createCanvasHostIntentRequest({
        requestId: `canvas-webview-request:${commandSequence}`,
        commandId: `canvas-webview-command:${commandSequence}`,
        expectedRevision: current.revision,
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
        void runtime.getSnapshot().then(publishSnapshot, (error: unknown) => {
          emitLoadFailure(error);
        });
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

  const supportsMessage = (messageType: string): boolean =>
    delegate !== undefined && (delegate.supportsMessage?.(messageType) ?? true);

  return {
    postMessage,
    supportsMessage,
    getState: () => delegate?.getState() ?? state,
    setState: (next) => {
      state = next;
      delegate?.setState(next);
      enqueue(() => executeViewportState(next));
    },
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
    async requestSource(sourceKind, position) {
      const current = snapshot ?? (await runtime.getSnapshot());
      const next = await executeIntent(current, {
        type: 'request-source',
        sourceKind,
        ...(position ? { position } : {}),
      });
      publishSnapshot(next);
      return next;
    },
    async projectContent(locator, position) {
      const current = snapshot ?? (await runtime.getSnapshot());
      const next = await executeIntent(current, {
        type: 'project-content',
        locator,
        position,
      });
      publishSnapshot(next);
      return next;
    },
    async previewResource(locator) {
      const current = snapshot ?? (await runtime.getSnapshot());
      await executeIntent(current, { type: 'preview-resource', locator });
    },
    async revealResource(locator) {
      const current = snapshot ?? (await runtime.getSnapshot());
      await executeIntent(current, { type: 'reveal-resource', locator });
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
    version: value['version'],
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
): unknown {
  const baseState = isRecord(currentState) ? currentState : {};
  const currentSnapshots = isRecord(baseState['canvasViewportSnapshots'])
    ? baseState['canvasViewportSnapshots']
    : {};
  return {
    ...baseState,
    canvasViewportSnapshots: {
      ...currentSnapshots,
      [createCanvasViewportSnapshotKey(snapshot.canvas)]: snapshot.presentation.viewport,
    },
  };
}

function readViewportFromWebviewState(
  value: unknown,
  canvas: CanvasData,
): CanvasViewport | undefined {
  if (!isRecord(value) || !isRecord(value['canvasViewportSnapshots'])) return undefined;
  const viewport = value['canvasViewportSnapshots'][createCanvasViewportSnapshotKey(canvas)];
  return isCanvasViewport(viewport) ? viewport : undefined;
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
