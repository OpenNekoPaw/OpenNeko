import type { StateNamespaceId } from './feature-runtime-context';

export const STATE_LAYOUT_MARKER_KEY = 'openneko.state-layout';
export const STATE_LAYOUT_SCHEMA = 'openneko.state-layout.v1';
export const STATE_LAYOUT_VERSION = 1;

export interface StateLayoutEntry {
  readonly feature: 'tools' | 'preview' | 'assets' | 'cut' | 'canvas' | 'agent';
  readonly namespaceId: StateNamespaceId;
  readonly workspaceMementoPrefix: `${StateNamespaceId}:`;
  readonly globalStorageSegments: readonly ['features', StateNamespaceId];
  readonly disposition: 'identity-reuse';
}

export interface StateLayoutMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export type StateLayoutVerificationResult = 'recorded' | 'already-current';

export const STATE_LAYOUT: readonly StateLayoutEntry[] = Object.freeze([
  entry('tools', 'neko.neko-tools'),
  entry('preview', 'neko.neko-preview'),
  entry('assets', 'neko.neko-assets'),
  entry('cut', 'neko.neko-cut'),
  entry('canvas', 'neko.neko-canvas'),
  entry('agent', 'neko.neko-agent'),
]);

export async function verifyStateLayout(
  globalState: StateLayoutMemento,
  layout: readonly StateLayoutEntry[] = STATE_LAYOUT,
): Promise<StateLayoutVerificationResult> {
  validateStateLayout(layout);
  const existing = globalState.get<unknown>(STATE_LAYOUT_MARKER_KEY);
  if (existing !== undefined) {
    validateMarker(existing);
    return 'already-current';
  }
  await globalState.update(STATE_LAYOUT_MARKER_KEY, {
    schema: STATE_LAYOUT_SCHEMA,
    version: STATE_LAYOUT_VERSION,
  });
  return 'recorded';
}

export function validateStateLayout(layout: readonly StateLayoutEntry[]): void {
  const features = new Set<StateLayoutEntry['feature']>();
  const namespaces = new Set<StateNamespaceId>();
  for (const item of layout) {
    if (features.has(item.feature)) {
      throw new Error(`Duplicate state-layout feature owner: ${item.feature}`);
    }
    if (namespaces.has(item.namespaceId)) {
      throw new Error(`Duplicate state namespace: ${item.namespaceId}`);
    }
    features.add(item.feature);
    namespaces.add(item.namespaceId);
    if (item.workspaceMementoPrefix !== `${item.namespaceId}:`) {
      throw new Error(
        `State-layout prefix mismatch for ${item.feature}: expected ${item.namespaceId}:`,
      );
    }
    if (
      item.globalStorageSegments[0] !== 'features' ||
      item.globalStorageSegments[1] !== item.namespaceId
    ) {
      throw new Error(
        `State-layout global-storage mismatch for ${item.feature}: expected features/${item.namespaceId}`,
      );
    }
    if (item.disposition !== 'identity-reuse') {
      throw new Error(`Unsupported state-layout disposition for ${item.feature}.`);
    }
  }
  if (features.size !== 6) {
    throw new Error(`State layout must define all 6 retained features; received ${features.size}.`);
  }
}

function entry(
  feature: StateLayoutEntry['feature'],
  namespaceId: StateNamespaceId,
): StateLayoutEntry {
  const globalStorageSegments: readonly ['features', StateNamespaceId] = ['features', namespaceId];
  return Object.freeze({
    feature,
    namespaceId,
    workspaceMementoPrefix: `${namespaceId}:`,
    globalStorageSegments: Object.freeze(globalStorageSegments),
    disposition: 'identity-reuse',
  });
}

function validateMarker(marker: unknown): void {
  if (
    typeof marker !== 'object' ||
    marker === null ||
    !('schema' in marker) ||
    !('version' in marker) ||
    marker.schema !== STATE_LAYOUT_SCHEMA ||
    marker.version !== STATE_LAYOUT_VERSION
  ) {
    throw new Error(
      `State-layout marker ${STATE_LAYOUT_MARKER_KEY} is malformed or incompatible; expected ${STATE_LAYOUT_SCHEMA} version ${STATE_LAYOUT_VERSION}.`,
    );
  }
}
