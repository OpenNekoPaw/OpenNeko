export const DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION = 1 as const;
export const DESKTOP_WORKSPACE_GRANT_CHANNEL = 'openneko:desktop:workspace-grant:choose' as const;

export interface DesktopWorkspaceGrantProjection {
  readonly schemaVersion: typeof DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION;
  readonly workspaceGrantId: string;
  readonly windowId: string;
  readonly label: string;
}

export interface DesktopWorkspaceGrantChooseRequest {
  readonly schemaVersion: typeof DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION;
  readonly requestId: string;
  readonly expectedEndpointEpoch: string;
  readonly windowId: string;
  readonly expectedWindowRevision: number;
}

export type DesktopWorkspaceGrantChooseResult =
  | {
      readonly schemaVersion: typeof DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'authorized';
      readonly grant: DesktopWorkspaceGrantProjection;
    }
  | {
      readonly schemaVersion: typeof DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION;
      readonly requestId: string;
      readonly status: 'cancelled';
    };

export interface OpenNekoDesktopWorkspaceGrantBridge {
  readonly workspaceGrants: {
    choose(
      windowId: string,
      expectedWindowRevision: number,
    ): Promise<DesktopWorkspaceGrantChooseResult>;
  };
}

export class DesktopWorkspaceGrantContractError extends Error {
  readonly code:
    'invalid-desktop-workspace-grant-payload' | 'unsupported-desktop-workspace-grant-version';

  constructor(code: DesktopWorkspaceGrantContractError['code'], message: string) {
    super(message);
    this.name = 'DesktopWorkspaceGrantContractError';
    this.code = code;
  }
}

export function createDesktopWorkspaceGrantChooseRequest(input: {
  readonly requestId: string;
  readonly expectedEndpointEpoch: string;
  readonly windowId: string;
  readonly expectedWindowRevision: number;
}): DesktopWorkspaceGrantChooseRequest {
  return parseDesktopWorkspaceGrantChooseRequest({
    schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
    ...input,
  });
}

export function parseDesktopWorkspaceGrantChooseRequest(
  value: unknown,
): DesktopWorkspaceGrantChooseRequest {
  const record = requireRecord(value, 'Desktop Workspace grant request must be an object.');
  requireVersion(record['schemaVersion']);
  requireExactKeys(
    record,
    ['schemaVersion', 'requestId', 'expectedEndpointEpoch', 'windowId', 'expectedWindowRevision'],
    'Desktop Workspace grant request',
  );
  return {
    schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
    requestId: requireIdentity(record['requestId'], 'Desktop Workspace grant request'),
    expectedEndpointEpoch: requireIdentity(
      record['expectedEndpointEpoch'],
      'Desktop Workspace grant endpoint epoch',
    ),
    windowId: requireIdentity(record['windowId'], 'Desktop Workspace grant Window'),
    expectedWindowRevision: requireRevision(
      record['expectedWindowRevision'],
      'Desktop Workspace grant Window revision',
    ),
  };
}

export function parseDesktopWorkspaceGrantChooseResult(
  value: unknown,
  expectedRequestId?: string,
): DesktopWorkspaceGrantChooseResult {
  const record = requireRecord(value, 'Desktop Workspace grant result must be an object.');
  requireVersion(record['schemaVersion']);
  const status = record['status'];
  const requestId = requireIdentity(record['requestId'], 'Desktop Workspace grant request');
  if (expectedRequestId !== undefined && requestId !== expectedRequestId) {
    throw invalid('Desktop Workspace grant result request identity does not match.');
  }
  if (status === 'cancelled') {
    requireExactKeys(
      record,
      ['schemaVersion', 'requestId', 'status'],
      'Desktop Workspace grant result',
    );
    return {
      schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
      requestId,
      status,
    };
  }
  if (status !== 'authorized') {
    throw invalid(`Unknown Desktop Workspace grant result status '${String(status)}'.`);
  }
  requireExactKeys(
    record,
    ['schemaVersion', 'requestId', 'status', 'grant'],
    'Desktop Workspace grant result',
  );
  return {
    schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
    requestId,
    status,
    grant: parseDesktopWorkspaceGrantProjection(record['grant']),
  };
}

export function parseDesktopWorkspaceGrantProjection(
  value: unknown,
): DesktopWorkspaceGrantProjection {
  const record = requireRecord(value, 'Desktop Workspace grant must be an object.');
  requireVersion(record['schemaVersion']);
  requireExactKeys(
    record,
    ['schemaVersion', 'workspaceGrantId', 'windowId', 'label'],
    'Desktop Workspace grant',
  );
  return {
    schemaVersion: DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION,
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Desktop Workspace grant'),
    windowId: requireIdentity(record['windowId'], 'Desktop Workspace grant Window'),
    label: requireIdentity(record['label'], 'Desktop Workspace grant label'),
  };
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_WORKSPACE_GRANT_CONTRACT_VERSION) {
    throw new DesktopWorkspaceGrantContractError(
      'unsupported-desktop-workspace-grant-version',
      `Unsupported Desktop Workspace grant schema version '${String(value)}'.`,
    );
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(message);
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${label} identity is required.`);
  }
  return value;
}

function requireRevision(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalid(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function requireExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const allowed = new Set(expected);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw invalid(`${label} contains unknown field '${unknown}'.`);
  const missing = expected.find((key) => !(key in record));
  if (missing) throw invalid(`${label} is missing field '${missing}'.`);
}

function invalid(message: string): DesktopWorkspaceGrantContractError {
  return new DesktopWorkspaceGrantContractError('invalid-desktop-workspace-grant-payload', message);
}
