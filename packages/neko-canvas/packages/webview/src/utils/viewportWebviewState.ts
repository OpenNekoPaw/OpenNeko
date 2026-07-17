import type { CanvasData, CanvasViewport } from '@neko/shared';

export interface CanvasWebviewState {
  readonly canvasViewportSnapshots?: Record<string, CanvasViewport>;
}

export interface CanvasWebviewStateApi {
  readonly getState: () => unknown;
  readonly setState: (state: unknown) => void;
}

export function createCanvasViewportSnapshotKey(canvasData: CanvasData): string {
  return `${canvasData.name}:${canvasData.version}`;
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

function readSnapshotMap(state: unknown): Record<string, CanvasViewport> {
  if (!isRecord(state) || !isRecord(state['canvasViewportSnapshots'])) {
    return {};
  }

  const snapshots: Record<string, CanvasViewport> = {};
  for (const [key, value] of Object.entries(state['canvasViewportSnapshots'])) {
    if (isCanvasViewport(value)) {
      snapshots[key] = value;
    }
  }
  return snapshots;
}

export function readCanvasViewportSnapshot(
  api: CanvasWebviewStateApi | null,
  documentKey: string,
): CanvasViewport | undefined {
  if (!api) return undefined;
  return readSnapshotMap(api.getState())[documentKey];
}

export function writeCanvasViewportSnapshot(
  api: CanvasWebviewStateApi | null,
  documentKey: string,
  viewport: CanvasViewport,
): void {
  if (!api) return;
  const currentState = api.getState();
  const baseState = isRecord(currentState) ? currentState : {};
  api.setState({
    ...baseState,
    canvasViewportSnapshots: {
      ...readSnapshotMap(currentState),
      [documentKey]: viewport,
    },
  });
}
