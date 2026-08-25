export const DSH_RUNTIME_HOST_CHANNEL = 'openneko:dsh:runtime';
export const DSH_RUNTIME_CHANGED_CHANNEL = 'openneko:dsh:runtime:changed';

export type DshRuntimeHostProjection =
  | { readonly status: 'running'; readonly sessionConfigurationPending?: true }
  | { readonly status: 'restarting' }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: {
        readonly code: 'desktop-dsh-runtime-unavailable' | 'desktop-dsh-runtime-restart-failed';
        readonly message: string;
      };
    };

export interface DshRuntimeHostRequest {
  readonly requestId: string;
  readonly operation: 'status' | 'prepare-session' | 'restart';
  readonly windowId: string;
  readonly rendererSessionId: string;
}

export interface DshRuntimeHostResult {
  readonly requestId: string;
  readonly projection: DshRuntimeHostProjection;
}

export interface OpenNekoDshRuntimeBridge {
  readonly dshRuntime: {
    getStatus(): Promise<DshRuntimeHostProjection>;
    prepareSession(): Promise<DshRuntimeHostProjection>;
    restart(): Promise<DshRuntimeHostProjection>;
    subscribe(listener: (projection: DshRuntimeHostProjection) => void): () => void;
  };
}

export function parseDshRuntimeHostRequest(value: unknown): DshRuntimeHostRequest {
  const record = requireRecord(value, 'DSH runtime request');
  requireExactKeys(record, ['requestId', 'operation', 'windowId', 'rendererSessionId']);
  if (
    record.operation !== 'status' &&
    record.operation !== 'prepare-session' &&
    record.operation !== 'restart'
  ) {
    throw new Error(`DSH runtime operation '${String(record.operation)}' is unsupported.`);
  }
  return {
    requestId: requireIdentity(record.requestId, 'requestId'),
    operation: record.operation,
    windowId: requireIdentity(record.windowId, 'windowId'),
    rendererSessionId: requireIdentity(record.rendererSessionId, 'rendererSessionId'),
  };
}

export function parseDshRuntimeHostResult(
  value: unknown,
  expectedRequestId: string,
): DshRuntimeHostResult {
  const record = requireRecord(value, 'DSH runtime result');
  requireExactKeys(record, ['requestId', 'projection']);
  const requestId = requireIdentity(record.requestId, 'requestId');
  if (requestId !== expectedRequestId) {
    throw new Error(`DSH runtime result '${requestId}' does not match '${expectedRequestId}'.`);
  }
  return { requestId, projection: parseDshRuntimeHostProjection(record.projection) };
}

export function parseDshRuntimeHostProjection(value: unknown): DshRuntimeHostProjection {
  const record = requireRecord(value, 'DSH runtime projection');
  if (record.status === 'running') {
    if (Object.hasOwn(record, 'sessionConfigurationPending')) {
      requireExactKeys(record, ['status', 'sessionConfigurationPending']);
      if (record.sessionConfigurationPending !== true) {
        throw new Error('DSH runtime sessionConfigurationPending must be true when present.');
      }
      return { status: 'running', sessionConfigurationPending: true };
    }
    requireExactKeys(record, ['status']);
    return { status: 'running' };
  }
  if (record.status === 'restarting') {
    requireExactKeys(record, ['status']);
    return { status: 'restarting' };
  }
  if (record.status !== 'unavailable') {
    throw new Error(`DSH runtime status '${String(record.status)}' is unsupported.`);
  }
  requireExactKeys(record, ['status', 'diagnostic']);
  const diagnostic = requireRecord(record.diagnostic, 'DSH runtime diagnostic');
  requireExactKeys(diagnostic, ['code', 'message']);
  if (
    diagnostic.code !== 'desktop-dsh-runtime-unavailable' &&
    diagnostic.code !== 'desktop-dsh-runtime-restart-failed'
  ) {
    throw new Error(`DSH runtime diagnostic '${String(diagnostic.code)}' is unsupported.`);
  }
  return {
    status: 'unavailable',
    diagnostic: {
      code: diagnostic.code,
      message: requireIdentity(diagnostic.message, 'diagnostic.message'),
    },
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`DSH runtime ${field} must be a non-empty string.`);
  }
  return value;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(record, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `DSH runtime contract keys mismatch; missing=${missing.join(',')}; unexpected=${unexpected.join(',')}.`,
    );
  }
}
