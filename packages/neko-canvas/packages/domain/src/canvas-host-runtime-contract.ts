import {
  isValidNkc,
  validateContentLocator,
  type CanvasData,
  type ContentLocator,
} from '@neko/shared';

export const CANVAS_HOST_RUNTIME_CONTRACT_VERSION = 1 as const;

export const CANVAS_HOST_RUNTIME_ROUTES = {
  snapshotGet: 'snapshot.get',
  intentExecute: 'intent.execute',
  projectionEvent: 'projection.event',
} as const;

export type CanvasHostRuntimeRoute =
  (typeof CANVAS_HOST_RUNTIME_ROUTES)[keyof typeof CANVAS_HOST_RUNTIME_ROUTES];

export interface CanvasHostRuntimeIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewEpoch: number;
  readonly documentId: string;
  readonly sessionId: string;
  readonly endpointEpoch: string;
}

export interface CanvasHostPresentationState {
  readonly viewport: {
    readonly pan: { readonly x: number; readonly y: number };
    readonly zoom: number;
  };
  readonly selectedNodeIds: readonly string[];
}

export interface CanvasHostSnapshot {
  readonly schemaVersion: typeof CANVAS_HOST_RUNTIME_CONTRACT_VERSION;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly revision: number;
  readonly dirty: boolean;
  readonly canvas: CanvasData;
  readonly presentation: CanvasHostPresentationState;
}

export type CanvasHostIntent =
  | {
      readonly type: 'replace-document';
      readonly canvas: CanvasData;
    }
  | {
      readonly type: 'save' | 'undo' | 'redo';
    }
  | {
      readonly type: 'project-content';
      readonly locator: ContentLocator;
      readonly position?: { readonly x: number; readonly y: number };
    }
  | {
      readonly type: 'request-source';
      readonly sourceKind: 'image' | 'video' | 'audio' | 'document' | 'canvas';
      readonly position?: { readonly x: number; readonly y: number };
    }
  | {
      readonly type: 'preview-resource' | 'reveal-resource';
      readonly locator: ContentLocator;
    }
  | {
      readonly type: 'update-presentation';
      readonly presentation: CanvasHostPresentationState;
    };

export interface CanvasHostIntentRequest {
  readonly schemaVersion: typeof CANVAS_HOST_RUNTIME_CONTRACT_VERSION;
  readonly requestId: string;
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly intent: CanvasHostIntent;
}

export type CanvasHostIntentResult =
  | {
      readonly schemaVersion: typeof CANVAS_HOST_RUNTIME_CONTRACT_VERSION;
      readonly requestId: string;
      readonly commandId: string;
      readonly status: 'accepted';
      readonly snapshot: CanvasHostSnapshot;
    }
  | {
      readonly schemaVersion: typeof CANVAS_HOST_RUNTIME_CONTRACT_VERSION;
      readonly requestId: string;
      readonly commandId: string;
      readonly status: 'rejected';
      readonly diagnostic: {
        readonly code:
          | 'canvas-runtime-stale-identity'
          | 'canvas-runtime-stale-revision'
          | 'canvas-runtime-unsupported-intent'
          | 'canvas-runtime-source-cancelled'
          | 'canvas-runtime-effect-failed';
        readonly message: string;
      };
    };

export interface CanvasHostProjectionEvent {
  readonly schemaVersion: typeof CANVAS_HOST_RUNTIME_CONTRACT_VERSION;
  readonly sequence: number;
  readonly snapshot: CanvasHostSnapshot;
}

export interface CanvasHostRuntime {
  readonly identity: CanvasHostRuntimeIdentity;
  getSnapshot(): Promise<CanvasHostSnapshot>;
  subscribe(listener: (event: CanvasHostProjectionEvent) => void): () => void;
  executeIntent(request: CanvasHostIntentRequest): Promise<CanvasHostIntentResult>;
  /** Releases runtime-local listeners. Owner-managed remote sessions may omit this hook. */
  dispose?(): void;
}

export class CanvasHostRuntimeContractError extends Error {
  readonly code:
    | 'invalid-canvas-host-runtime-payload'
    | 'unsupported-canvas-host-runtime-version'
    | 'canvas-host-runtime-stale-identity';

  constructor(code: CanvasHostRuntimeContractError['code'], message: string) {
    super(message);
    this.name = 'CanvasHostRuntimeContractError';
    this.code = code;
  }
}

export function createCanvasHostIntentRequest(input: {
  readonly requestId: string;
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly intent: CanvasHostIntent;
}): CanvasHostIntentRequest {
  return parseCanvasHostIntentRequest({
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    ...input,
  });
}

export function parseCanvasHostIntentRequest(value: unknown): CanvasHostIntentRequest {
  const record = requireRecord(value, 'Canvas Host intent request must be an object.');
  requireVersion(record['schemaVersion']);
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    requestId: requireNonEmptyString(
      record['requestId'],
      'Canvas Host request identity is required.',
    ),
    commandId: requireOpaqueIdentity(
      record['commandId'],
      'Canvas Host command identity is required.',
    ),
    expectedRevision: requireNonNegativeInteger(
      record['expectedRevision'],
      'Canvas Host expected revision must be a non-negative integer.',
    ),
    identity: parseCanvasHostRuntimeIdentity(record['identity']),
    intent: parseCanvasHostIntent(record['intent']),
  };
}

export function parseCanvasHostSnapshot(value: unknown): CanvasHostSnapshot {
  const record = requireRecord(value, 'Canvas Host snapshot must be an object.');
  requireVersion(record['schemaVersion']);
  const canvas = record['canvas'];
  if (!isValidNkc(canvas)) {
    throw invalidPayload('Canvas Host snapshot does not contain a valid .nkc document.');
  }
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    identity: parseCanvasHostRuntimeIdentity(record['identity']),
    revision: requireNonNegativeInteger(
      record['revision'],
      'Canvas Host snapshot revision must be a non-negative integer.',
    ),
    dirty: requireBoolean(record['dirty'], 'Canvas Host dirty state is invalid.'),
    canvas,
    presentation: parseCanvasHostPresentationState(record['presentation']),
  };
}

export function parseCanvasHostProjectionEvent(value: unknown): CanvasHostProjectionEvent {
  const record = requireRecord(value, 'Canvas Host projection event must be an object.');
  requireVersion(record['schemaVersion']);
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    sequence: requirePositiveInteger(
      record['sequence'],
      'Canvas Host projection event sequence must be a positive integer.',
    ),
    snapshot: parseCanvasHostSnapshot(record['snapshot']),
  };
}

export function parseCanvasHostIntentResult(
  value: unknown,
  expectedRequestId: string,
  expectedCommandId: string,
): CanvasHostIntentResult {
  const record = requireRecord(value, 'Canvas Host intent result must be an object.');
  requireVersion(record['schemaVersion']);
  const requestId = requireMatchingIdentity(
    record['requestId'],
    expectedRequestId,
    'Canvas Host response request identity does not match.',
  );
  const commandId = requireMatchingIdentity(
    record['commandId'],
    expectedCommandId,
    'Canvas Host response command identity does not match.',
  );
  if (record['status'] === 'accepted') {
    return {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      requestId,
      commandId,
      status: 'accepted',
      snapshot: parseCanvasHostSnapshot(record['snapshot']),
    };
  }
  if (record['status'] !== 'rejected') {
    throw invalidPayload('Canvas Host intent result status is invalid.');
  }
  const diagnostic = requireRecord(
    record['diagnostic'],
    'Canvas Host rejected result diagnostic is required.',
  );
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    requestId,
    commandId,
    status: 'rejected',
    diagnostic: {
      code: requireDiagnosticCode(diagnostic['code']),
      message: requireNonEmptyString(
        diagnostic['message'],
        'Canvas Host diagnostic message is required.',
      ),
    },
  };
}

export function assertCanvasHostRuntimeIdentity(
  expected: CanvasHostRuntimeIdentity,
  actual: CanvasHostRuntimeIdentity,
): void {
  const matches =
    expected.projectId === actual.projectId &&
    expected.workspaceId === actual.workspaceId &&
    expected.windowId === actual.windowId &&
    expected.viewId === actual.viewId &&
    expected.viewEpoch === actual.viewEpoch &&
    expected.documentId === actual.documentId &&
    expected.sessionId === actual.sessionId &&
    expected.endpointEpoch === actual.endpointEpoch;
  if (!matches) {
    throw new CanvasHostRuntimeContractError(
      'canvas-host-runtime-stale-identity',
      'Canvas Host identity is stale or belongs to another document session.',
    );
  }
}

function parseCanvasHostRuntimeIdentity(value: unknown): CanvasHostRuntimeIdentity {
  const record = requireRecord(value, 'Canvas Host runtime identity is required.');
  return {
    projectId: requireOpaqueIdentity(
      record['projectId'],
      'Canvas Host Project identity is required.',
    ),
    workspaceId: requireOpaqueIdentity(
      record['workspaceId'],
      'Canvas Host Workspace identity is required.',
    ),
    windowId: requireOpaqueIdentity(record['windowId'], 'Canvas Host Window identity is required.'),
    viewId: requireOpaqueIdentity(record['viewId'], 'Canvas Host View identity is required.'),
    viewEpoch: requireNonNegativeInteger(
      record['viewEpoch'],
      'Canvas Host View epoch must be a non-negative integer.',
    ),
    documentId: requireOpaqueIdentity(
      record['documentId'],
      'Canvas Host document identity is required.',
    ),
    sessionId: requireOpaqueIdentity(
      record['sessionId'],
      'Canvas Host session identity is required.',
    ),
    endpointEpoch: requireOpaqueIdentity(
      record['endpointEpoch'],
      'Canvas Host endpoint epoch is required.',
    ),
  };
}

function parseCanvasHostIntent(value: unknown): CanvasHostIntent {
  const record = requireRecord(value, 'Canvas Host intent must be an object.');
  const type = record['type'];
  if (type === 'replace-document') {
    const canvas = record['canvas'];
    if (!isValidNkc(canvas)) {
      throw invalidPayload('Canvas Host replace-document intent requires valid .nkc data.');
    }
    return { type, canvas };
  }
  if (type === 'save' || type === 'undo' || type === 'redo') {
    return { type };
  }
  if (type === 'project-content') {
    return {
      type,
      locator: requireContentLocator(record['locator']),
      ...readOptionalPosition(record['position']),
    };
  }
  if (type === 'request-source') {
    return {
      type,
      sourceKind: requireSourceKind(record['sourceKind']),
      ...readOptionalPosition(record['position']),
    };
  }
  if (type === 'preview-resource' || type === 'reveal-resource') {
    return { type, locator: requireContentLocator(record['locator']) };
  }
  if (type === 'update-presentation') {
    return {
      type,
      presentation: parseCanvasHostPresentationState(record['presentation']),
    };
  }
  throw invalidPayload('Canvas Host intent type is invalid.');
}

function readOptionalPosition(value: unknown): {
  readonly position?: { readonly x: number; readonly y: number };
} {
  if (value === undefined) return {};
  const position = requireRecord(value, 'Canvas Host intent position is invalid.');
  return {
    position: {
      x: requireFiniteNumber(position['x'], 'Canvas Host intent position x is invalid.'),
      y: requireFiniteNumber(position['y'], 'Canvas Host intent position y is invalid.'),
    },
  };
}

function parseCanvasHostPresentationState(value: unknown): CanvasHostPresentationState {
  const record = requireRecord(value, 'Canvas Host presentation state is required.');
  const viewport = requireRecord(
    record['viewport'],
    'Canvas Host presentation viewport is required.',
  );
  const pan = requireRecord(viewport['pan'], 'Canvas Host presentation pan is required.');
  const selectedNodeIds = requireArray(
    record['selectedNodeIds'],
    'Canvas Host selected node identities must be an array.',
  ).map((selectedNodeId) =>
    requireOpaqueIdentity(selectedNodeId, 'Canvas Host selected node identity is invalid.'),
  );
  if (new Set(selectedNodeIds).size !== selectedNodeIds.length) {
    throw invalidPayload('Canvas Host selected node identities must be unique.');
  }
  return {
    viewport: {
      pan: {
        x: requireFiniteNumber(pan['x'], 'Canvas Host viewport pan x is invalid.'),
        y: requireFiniteNumber(pan['y'], 'Canvas Host viewport pan y is invalid.'),
      },
      zoom: requirePositiveNumber(viewport['zoom'], 'Canvas Host viewport zoom must be positive.'),
    },
    selectedNodeIds,
  };
}

function requireContentLocator(value: unknown): ContentLocator {
  const result = validateContentLocator(value);
  if (!result.ok) {
    throw invalidPayload('Canvas Host intent ContentLocator is invalid or non-portable.');
  }
  return result.locator;
}

function requireSourceKind(
  value: unknown,
): Extract<CanvasHostIntent, { readonly type: 'request-source' }>['sourceKind'] {
  const allowed = ['image', 'video', 'audio', 'document', 'canvas'] as const;
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Canvas Host source kind is invalid.');
  }
  return match;
}

function requireDiagnosticCode(
  value: unknown,
): Extract<CanvasHostIntentResult, { readonly status: 'rejected' }>['diagnostic']['code'] {
  const allowed = [
    'canvas-runtime-stale-identity',
    'canvas-runtime-stale-revision',
    'canvas-runtime-unsupported-intent',
    'canvas-runtime-source-cancelled',
    'canvas-runtime-effect-failed',
  ] as const;
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    throw invalidPayload('Canvas Host diagnostic code is invalid.');
  }
  return match;
}

function requireVersion(value: unknown): void {
  if (value !== CANVAS_HOST_RUNTIME_CONTRACT_VERSION) {
    throw new CanvasHostRuntimeContractError(
      'unsupported-canvas-host-runtime-version',
      `Unsupported Canvas Host runtime contract version: ${String(value)}.`,
    );
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireOpaqueIdentity(value: unknown, message: string): string {
  const identity = requireNonEmptyString(value, message);
  if (
    identity.startsWith('/') ||
    /^[A-Za-z]:[\\/]/u.test(identity) ||
    identity.startsWith('file://') ||
    identity.includes('\\')
  ) {
    throw invalidPayload('Canvas Host identities must not expose a local path.');
  }
  return identity;
}

function requireMatchingIdentity(value: unknown, expected: string, message: string): string {
  const actual = requireOpaqueIdentity(value, message);
  if (actual !== expected) {
    throw invalidPayload(message);
  }
  return actual;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw invalidPayload(message);
  }
  return value;
}

function requireFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function requirePositiveNumber(value: unknown, message: string): number {
  const number = requireFiniteNumber(value, message);
  if (number <= 0) {
    throw invalidPayload(message);
  }
  return number;
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') {
    throw invalidPayload(message);
  }
  return value;
}

function invalidPayload(message: string): CanvasHostRuntimeContractError {
  return new CanvasHostRuntimeContractError('invalid-canvas-host-runtime-payload', message);
}
