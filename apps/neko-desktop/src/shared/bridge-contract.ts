import type { NekoApplicationIdentity } from '@neko/host/application';
import type { NekoHostIdentity } from '@neko/host/ports';

export const DESKTOP_BRIDGE_CONTRACT_VERSION = 1 as const;

export const DESKTOP_BRIDGE_CHANNELS = {
  bootstrapGet: 'openneko:desktop:bootstrap:get',
  lifecycleEvent: 'openneko:desktop:lifecycle:event',
} as const;

export type DesktopBridgeChannel =
  (typeof DESKTOP_BRIDGE_CHANNELS)[keyof typeof DESKTOP_BRIDGE_CHANNELS];

export interface DesktopBootstrapRequest {
  readonly schemaVersion: typeof DESKTOP_BRIDGE_CONTRACT_VERSION;
  readonly requestId: string;
}

export interface DesktopWindowProjection {
  readonly windowId: string;
  readonly rendererEpoch: number;
}

export interface DesktopRuntimeProjection {
  readonly platform: 'darwin' | 'linux' | 'win32' | 'browser' | 'unknown';
  readonly arch?: string;
  readonly locale?: string;
}

export interface DesktopBootstrapProjection {
  readonly schemaVersion: typeof DESKTOP_BRIDGE_CONTRACT_VERSION;
  readonly requestId: string;
  readonly application: NekoApplicationIdentity;
  readonly window: DesktopWindowProjection;
  readonly host: NekoHostIdentity;
  readonly runtime: DesktopRuntimeProjection;
  readonly status: 'foundation-ready';
}

export type DesktopLifecycleEventType =
  | 'renderer-loading'
  | 'renderer-ready'
  | 'window-closing';

export interface DesktopLifecycleEvent {
  readonly schemaVersion: typeof DESKTOP_BRIDGE_CONTRACT_VERSION;
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly rendererEpoch: number;
  readonly sequence: number;
  readonly type: DesktopLifecycleEventType;
}

export interface OpenNekoDesktopBridge {
  readonly bootstrap: {
    get(): Promise<DesktopBootstrapProjection>;
  };
  readonly lifecycle: {
    subscribe(listener: (event: DesktopLifecycleEvent) => void): () => void;
  };
}

export class DesktopBridgeContractError extends Error {
  readonly code:
    | 'invalid-desktop-bridge-payload'
    | 'unsupported-desktop-bridge-version'
    | 'desktop-bridge-request-mismatch';

  constructor(
    code: DesktopBridgeContractError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'DesktopBridgeContractError';
    this.code = code;
  }
}

export function createDesktopBootstrapRequest(requestId: string): DesktopBootstrapRequest {
  return {
    schemaVersion: DESKTOP_BRIDGE_CONTRACT_VERSION,
    requestId: requireNonEmptyString(requestId, 'Desktop bootstrap requestId is required.'),
  };
}

export function parseDesktopBootstrapRequest(value: unknown): DesktopBootstrapRequest {
  const record = requireRecord(value, 'Desktop bootstrap request must be an object.');
  requireVersion(record['schemaVersion']);
  return createDesktopBootstrapRequest(
    requireNonEmptyString(record['requestId'], 'Desktop bootstrap requestId is required.'),
  );
}

export function parseDesktopBootstrapProjection(
  value: unknown,
  expectedRequestId?: string,
): DesktopBootstrapProjection {
  const record = requireRecord(value, 'Desktop bootstrap projection must be an object.');
  requireVersion(record['schemaVersion']);
  const requestId = requireNonEmptyString(
    record['requestId'],
    'Desktop bootstrap projection requestId is required.',
  );
  if (expectedRequestId !== undefined && requestId !== expectedRequestId) {
    throw new DesktopBridgeContractError(
      'desktop-bridge-request-mismatch',
      `Desktop bootstrap response '${requestId}' does not match request '${expectedRequestId}'.`,
    );
  }
  const application = requireRecord(
    record['application'],
    'Desktop bootstrap application identity is required.',
  );
  const window = requireRecord(record['window'], 'Desktop bootstrap window identity is required.');
  const host = requireRecord(record['host'], 'Desktop bootstrap host identity is required.');
  const runtime = requireRecord(record['runtime'], 'Desktop bootstrap runtime is required.');
  if (record['status'] !== 'foundation-ready') {
    throw invalidPayload('Desktop bootstrap status must be foundation-ready.');
  }
  const applicationId = application['applicationId'];
  if (applicationId !== 'neko-desktop') {
    throw invalidPayload('Desktop bootstrap applicationId must be neko-desktop.');
  }
  if (application['schemaVersion'] !== 1) {
    throw invalidPayload('Desktop bootstrap application schemaVersion must be 1.');
  }
  const hostKind = host['kind'];
  const hostUi = host['ui'];
  if (hostKind !== 'electron' || hostUi !== 'graphical') {
    throw invalidPayload('Desktop bootstrap host must be a graphical Electron host.');
  }
  return {
    schemaVersion: DESKTOP_BRIDGE_CONTRACT_VERSION,
    requestId,
    application: {
      schemaVersion: 1,
      applicationId,
      instanceId: requireNonEmptyString(
        application['instanceId'],
        'Application instanceId is required.',
      ),
      version: requireNonEmptyString(application['version'], 'Application version is required.'),
    },
    window: {
      windowId: requireNonEmptyString(window['windowId'], 'Desktop windowId is required.'),
      rendererEpoch: requireNonNegativeInteger(
        window['rendererEpoch'],
        'Desktop rendererEpoch must be a non-negative integer.',
      ),
    },
    host: {
      id: requireNonEmptyString(host['id'], 'Desktop host id is required.'),
      kind: hostKind,
      ui: hostUi,
      ...readOptionalString(host, 'displayName'),
      ...readOptionalString(host, 'version'),
    },
    runtime: {
      platform: requireRuntimePlatform(runtime['platform']),
      ...readOptionalString(runtime, 'arch'),
      ...readOptionalString(runtime, 'locale'),
    },
    status: 'foundation-ready',
  };
}

export function parseDesktopLifecycleEvent(value: unknown): DesktopLifecycleEvent {
  const record = requireRecord(value, 'Desktop lifecycle event must be an object.');
  requireVersion(record['schemaVersion']);
  const type = record['type'];
  if (type !== 'renderer-loading' && type !== 'renderer-ready' && type !== 'window-closing') {
    throw invalidPayload(`Unknown Desktop lifecycle event '${String(type)}'.`);
  }
  return {
    schemaVersion: DESKTOP_BRIDGE_CONTRACT_VERSION,
    applicationInstanceId: requireNonEmptyString(
      record['applicationInstanceId'],
      'Desktop lifecycle applicationInstanceId is required.',
    ),
    windowId: requireNonEmptyString(
      record['windowId'],
      'Desktop lifecycle windowId is required.',
    ),
    rendererEpoch: requireNonNegativeInteger(
      record['rendererEpoch'],
      'Desktop lifecycle rendererEpoch must be a non-negative integer.',
    ),
    sequence: requireNonNegativeInteger(
      record['sequence'],
      'Desktop lifecycle sequence must be a non-negative integer.',
    ),
    type,
  };
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_BRIDGE_CONTRACT_VERSION) {
    throw new DesktopBridgeContractError(
      'unsupported-desktop-bridge-version',
      `Unsupported Desktop bridge version '${String(value)}'.`,
    );
  }
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isUnknownRecord(value)) {
    throw invalidPayload(message);
  }
  return value;
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidPayload(message);
  }
  return value;
}

function requireRuntimePlatform(value: unknown): DesktopRuntimeProjection['platform'] {
  if (
    value !== 'darwin' &&
    value !== 'linux' &&
    value !== 'win32' &&
    value !== 'browser' &&
    value !== 'unknown'
  ) {
    throw invalidPayload(`Unknown Desktop runtime platform '${String(value)}'.`);
  }
  return value;
}

function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, string>> {
  const value = record[key];
  if (value === undefined) return {};
  return { [key]: requireNonEmptyString(value, `${key} must be a non-empty string.`) };
}

function invalidPayload(message: string): DesktopBridgeContractError {
  return new DesktopBridgeContractError('invalid-desktop-bridge-payload', message);
}
