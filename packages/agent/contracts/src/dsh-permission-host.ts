export const DSH_PERMISSION_HOST_CHANNEL = 'openneko:dsh:permission';
export const DSH_PERMISSION_CHANGED_CHANNEL = 'openneko:dsh:permission:changed';

export interface DshPermissionHostIdentity {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly toolCallId: string;
}

export interface DshPermissionHostProjection extends DshPermissionHostIdentity {
  readonly title: string;
  readonly options: readonly {
    readonly optionId: string;
    readonly name: string;
    readonly kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }[];
}

export type DshPermissionHostRequest =
  | {
      readonly requestId: string;
      readonly operation: 'list';
      readonly windowId: string;
      readonly rendererSessionId: string;
      readonly conversationId: string;
    }
  | ({
      readonly requestId: string;
      readonly operation: 'decide';
      readonly windowId: string;
      readonly rendererSessionId: string;
      readonly optionId: string;
    } & DshPermissionHostIdentity)
  | ({
      readonly requestId: string;
      readonly operation: 'cancel';
      readonly windowId: string;
      readonly rendererSessionId: string;
    } & DshPermissionHostIdentity);

export interface DshPermissionHostResult {
  readonly requestId: string;
  readonly conversationId: string;
  readonly pending: readonly DshPermissionHostProjection[];
}

export interface DshPermissionChangedEvent {
  readonly conversationId: string;
}

export interface OpenNekoDshPermissionBridge {
  readonly dshPermissions: {
    list(conversationId: string): Promise<readonly DshPermissionHostProjection[]>;
    decide(
      identity: DshPermissionHostIdentity,
      optionId: string,
    ): Promise<readonly DshPermissionHostProjection[]>;
    cancel(identity: DshPermissionHostIdentity): Promise<readonly DshPermissionHostProjection[]>;
    subscribe(listener: (event: DshPermissionChangedEvent) => void): () => void;
  };
}

export function parseDshPermissionHostRequest(value: unknown): DshPermissionHostRequest {
  const record = requireRecord(value, 'DSH permission request');
  const requestId = requireNonEmptyString(record.requestId, 'requestId');
  const operation = record.operation;
  const windowId = requireNonEmptyString(record.windowId, 'windowId');
  const rendererSessionId = requireNonEmptyString(record.rendererSessionId, 'rendererSessionId');
  const conversationId = requireNonEmptyString(record.conversationId, 'conversationId');
  if (operation === 'list') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'conversationId',
    ]);
    return { requestId, operation, windowId, rendererSessionId, conversationId };
  }
  const identity = {
    conversationId,
    dshSessionId: requireNonEmptyString(record.dshSessionId, 'dshSessionId'),
    turn: requireNonNegativeInteger(record.turn, 'turn'),
    toolCallId: requireNonEmptyString(record.toolCallId, 'toolCallId'),
  };
  if (operation === 'decide') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'conversationId',
      'dshSessionId',
      'turn',
      'toolCallId',
      'optionId',
    ]);
    return {
      requestId,
      operation,
      windowId,
      rendererSessionId,
      ...identity,
      optionId: requireNonEmptyString(record.optionId, 'optionId'),
    };
  }
  if (operation === 'cancel') {
    requireExactKeys(record, [
      'requestId',
      'operation',
      'windowId',
      'rendererSessionId',
      'conversationId',
      'dshSessionId',
      'turn',
      'toolCallId',
    ]);
    return { requestId, operation, windowId, rendererSessionId, ...identity };
  }
  throw new Error(`DSH permission operation '${String(operation)}' is unsupported.`);
}

export function parseDshPermissionHostResult(
  value: unknown,
  expectedRequestId: string,
): DshPermissionHostResult {
  const record = requireRecord(value, 'DSH permission result');
  requireExactKeys(record, ['requestId', 'conversationId', 'pending']);
  const requestId = requireNonEmptyString(record.requestId, 'requestId');
  if (requestId !== expectedRequestId) {
    throw new Error(`DSH permission result '${requestId}' does not match '${expectedRequestId}'.`);
  }
  if (!Array.isArray(record.pending)) throw new Error('DSH permission pending must be an array.');
  return {
    requestId,
    conversationId: requireNonEmptyString(record.conversationId, 'conversationId'),
    pending: record.pending.map(parseProjection),
  };
}

export function parseDshPermissionChangedEvent(value: unknown): DshPermissionChangedEvent {
  const record = requireRecord(value, 'DSH permission changed event');
  requireExactKeys(record, ['conversationId']);
  return { conversationId: requireNonEmptyString(record.conversationId, 'conversationId') };
}

function parseProjection(value: unknown): DshPermissionHostProjection {
  const record = requireRecord(value, 'DSH permission projection');
  requireExactKeys(record, [
    'conversationId',
    'dshSessionId',
    'turn',
    'toolCallId',
    'title',
    'options',
  ]);
  if (!Array.isArray(record.options)) throw new Error('DSH permission options must be an array.');
  return {
    conversationId: requireNonEmptyString(record.conversationId, 'conversationId'),
    dshSessionId: requireNonEmptyString(record.dshSessionId, 'dshSessionId'),
    turn: requireNonNegativeInteger(record.turn, 'turn'),
    toolCallId: requireNonEmptyString(record.toolCallId, 'toolCallId'),
    title: requireNonEmptyString(record.title, 'title'),
    options: record.options.map((value) => {
      const option = requireRecord(value, 'DSH permission option');
      requireExactKeys(option, ['optionId', 'name', 'kind']);
      const kind = option.kind;
      if (
        kind !== 'allow_once' &&
        kind !== 'allow_always' &&
        kind !== 'reject_once' &&
        kind !== 'reject_always'
      ) {
        throw new Error(`DSH permission option kind '${String(kind)}' is unsupported.`);
      }
      return {
        optionId: requireNonEmptyString(option.optionId, 'optionId'),
        name: requireNonEmptyString(option.name, 'name'),
        kind,
      };
    }),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const expected = new Set(keys);
  const unexpected = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(record, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `DSH permission contract keys mismatch; missing=${missing.join(',')}; unexpected=${unexpected.join(',')}.`,
    );
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`DSH permission ${field} must be a non-empty string.`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`DSH permission ${field} must be a non-negative safe integer.`);
  }
  return value as number;
}
