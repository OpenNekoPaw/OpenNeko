import type { CanvasViewport } from '@neko/canvas-domain';

export interface CanvasWebviewState {
  readonly canvasViewportSnapshots?: Record<string, CanvasViewport>;
}

export interface CanvasWebviewStateApi {
  readonly getState: () => unknown;
  readonly setState: (state: unknown) => void;
  readonly reportStateDiagnostic?: (diagnostic: CanvasWebviewStateDiagnostic) => void;
}

export interface CanvasWebviewStateDiagnostic {
  readonly code: 'invalid-webview-state' | 'invalid-viewport-map' | 'invalid-viewport-snapshot';
  readonly message: string;
  readonly documentId?: string;
}

export function createCanvasViewportSnapshotKey(documentId: string): string {
  if (documentId.length === 0) {
    throw new Error('Canvas viewport snapshot requires a document identity.');
  }
  return documentId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanvasViewport(value: unknown): value is CanvasViewport {
  if (!isRecord(value)) return false;
  const pan = value['pan'];
  return (
    isRecord(pan) &&
    typeof pan['x'] === 'number' &&
    Number.isFinite(pan['x']) &&
    typeof pan['y'] === 'number' &&
    Number.isFinite(pan['y']) &&
    typeof value['zoom'] === 'number' &&
    Number.isFinite(value['zoom'])
  );
}

export function readCanvasViewportSnapshot(
  api: CanvasWebviewStateApi | null,
  documentKey: string,
): CanvasViewport | undefined {
  if (!api) return undefined;
  const state = api.getState();
  if (state === undefined) return undefined;
  if (!isRecord(state)) {
    reportDiagnostic(api, {
      code: 'invalid-webview-state',
      message: 'Canvas Webview state must be an object.',
      documentId: documentKey,
    });
    return undefined;
  }
  const snapshots = state['canvasViewportSnapshots'];
  if (snapshots === undefined) return undefined;
  if (!isRecord(snapshots)) {
    reportDiagnostic(api, {
      code: 'invalid-viewport-map',
      message: 'Canvas viewport snapshot map must be an object.',
      documentId: documentKey,
    });
    return undefined;
  }
  const snapshot = snapshots[documentKey];
  if (snapshot === undefined) return undefined;
  if (!isCanvasViewport(snapshot)) {
    reportDiagnostic(api, {
      code: 'invalid-viewport-snapshot',
      message: `Canvas viewport snapshot '${documentKey}' is invalid.`,
      documentId: documentKey,
    });
    return undefined;
  }
  return snapshot;
}

export function writeCanvasViewportSnapshot(
  api: CanvasWebviewStateApi | null,
  documentKey: string,
  viewport: CanvasViewport,
): void {
  if (!api) return;
  const currentState = api.getState();
  if (currentState !== undefined && !isRecord(currentState)) {
    reportDiagnostic(api, {
      code: 'invalid-webview-state',
      message: 'Canvas Webview state must be an object.',
      documentId: documentKey,
    });
    return;
  }
  const baseState = currentState ?? {};
  const currentSnapshots = baseState['canvasViewportSnapshots'];
  if (currentSnapshots !== undefined && !isRecord(currentSnapshots)) {
    reportDiagnostic(api, {
      code: 'invalid-viewport-map',
      message: 'Canvas viewport snapshot map must be an object.',
      documentId: documentKey,
    });
    return;
  }
  api.setState({
    ...baseState,
    canvasViewportSnapshots: {
      ...currentSnapshots,
      [documentKey]: viewport,
    },
  });
}

function reportDiagnostic(
  api: CanvasWebviewStateApi,
  diagnostic: CanvasWebviewStateDiagnostic,
): void {
  api.reportStateDiagnostic?.(diagnostic);
}
