export interface AgentAvailabilityDiagnostic {
  readonly code: string;
  readonly owner: string;
  readonly message: string;
}

export type AgentAvailabilityProjection =
  | { readonly status: 'available' }
  | {
      readonly status: 'unavailable';
      readonly diagnostic: AgentAvailabilityDiagnostic;
    };

export function parseAgentAvailabilityProjection(value: unknown): AgentAvailabilityProjection {
  const record = requireRecord(value, 'Agent availability must be an object.');
  if (record['status'] === 'available') {
    requireExactKeys(record, ['status']);
    return { status: 'available' };
  }
  if (record['status'] === 'unavailable') {
    requireExactKeys(record, ['status', 'diagnostic']);
    return {
      status: 'unavailable',
      diagnostic: parseAgentAvailabilityDiagnostic(record['diagnostic']),
    };
  }
  throw new Error(`Unknown Agent availability status '${String(record['status'])}'.`);
}

export function parseAgentAvailabilityDiagnostic(value: unknown): AgentAvailabilityDiagnostic {
  const record = requireRecord(value, 'Agent availability diagnostic must be an object.');
  requireExactKeys(record, ['code', 'owner', 'message']);
  return {
    code: requireText(record['code'], 'code'),
    owner: requireText(record['owner'], 'owner'),
    message: requireText(record['message'], 'message'),
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error('Agent availability contains unsupported fields.');
  }
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent availability ${label} is required.`);
  }
  return value;
}
