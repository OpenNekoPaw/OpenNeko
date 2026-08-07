import {
  parseDesktopWorkbenchSceneProjection,
  type DesktopWorkbenchSceneProjection,
} from './desktop-scene-contract';
import {
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from './desktop-workbench-contract';

export interface DesktopWindowCompositionProjection {
  readonly workbenchInstanceId: string;
  readonly windowId: string;
  readonly layout: DesktopWorkbenchLayoutProjection;
  readonly scene: DesktopWorkbenchSceneProjection;
}

export class DesktopWindowCompositionContractError extends Error {
  readonly code = 'desktop-window-composition-invalid' as const;

  constructor(message: string) {
    super(message);
    this.name = 'DesktopWindowCompositionContractError';
  }
}

export function createDesktopWindowComposition(input: {
  readonly workbenchInstanceId: string;
  readonly layout: DesktopWorkbenchLayoutProjection;
  readonly scene: DesktopWorkbenchSceneProjection;
}): DesktopWindowCompositionProjection {
  return parseDesktopWindowComposition({
    workbenchInstanceId: input.workbenchInstanceId,
    windowId: input.scene.windowId,
    layout: input.layout,
    scene: input.scene,
  });
}

export function parseDesktopWindowComposition(value: unknown): DesktopWindowCompositionProjection {
  const record = requireRecord(value, 'Desktop Window composition must be an object.');
  requireExactKeys(
    record,
    ['workbenchInstanceId', 'windowId', 'layout', 'scene'],
    'Desktop Window composition',
  );
  const workbenchInstanceId = requireIdentity(
    record['workbenchInstanceId'],
    'Desktop Workbench instance',
  );
  const windowId = requireIdentity(record['windowId'], 'Desktop Window');
  const layout = parseDesktopWorkbenchLayout(record['layout']);
  const scene = parseDesktopWorkbenchSceneProjection(record['scene']);
  if (layout.windowId !== windowId || scene.windowId !== windowId) {
    throw invalid(
      `Desktop Window composition '${workbenchInstanceId}' contains a cross-Window layout or Scene.`,
    );
  }
  return { workbenchInstanceId, windowId, layout, scene };
}

export function serializeDesktopWindowComposition(
  value: DesktopWindowCompositionProjection,
): unknown {
  const composition = parseDesktopWindowComposition(value);
  return {
    workbenchInstanceId: composition.workbenchInstanceId,
    windowId: composition.windowId,
    layout: composition.layout,
    scene: composition.scene,
  };
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw invalid(`${label} has unexpected fields: ${actualKeys.join(', ')}.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${label} identity is required.`);
  }
  return value;
}

function invalid(message: string): DesktopWindowCompositionContractError {
  return new DesktopWindowCompositionContractError(message);
}
