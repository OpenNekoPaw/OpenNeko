export const DESKTOP_WORKSPACE_GRANT_CHANNEL = 'openneko:desktop:workspace-grant:target' as const;

export interface DesktopWorkspaceGrantProjection {
  readonly workspaceGrantId: string;
  readonly windowId: string;
  readonly label: string;
}

interface DesktopWorkspaceGrantTargetRequestBase {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
}

export type DesktopWorkspaceGrantTargetRequest =
  | (DesktopWorkspaceGrantTargetRequestBase & {
      readonly operation: 'choose-directory';
    })
  | (DesktopWorkspaceGrantTargetRequestBase & {
      readonly operation: 'create-content-project';
    })
  | (DesktopWorkspaceGrantTargetRequestBase & {
      readonly operation: 'select-project';
      readonly projectId: string;
    })
  | (DesktopWorkspaceGrantTargetRequestBase & {
      readonly operation: 'select-authoring-library';
      readonly library: 'character' | 'world';
    });

export type DesktopWorkspaceGrantTargetResult =
  | {
      readonly requestId: string;
      readonly status: 'authorized';
      readonly workspaceId: string;
      readonly grant: DesktopWorkspaceGrantProjection;
    }
  | {
      readonly requestId: string;
      readonly status: 'cancelled';
    }
  | {
      readonly requestId: string;
      readonly status: 'authorized-project';
      readonly workspaceId: string;
      readonly projectId: string;
      readonly grant: DesktopWorkspaceGrantProjection;
    };

export interface OpenNekoDesktopWorkspaceGrantBridge {
  readonly workspaceGrants: {
    chooseDirectory(windowId: string): Promise<DesktopWorkspaceGrantTargetResult>;
    createContentProject(windowId: string): Promise<DesktopWorkspaceGrantTargetResult>;
    selectProject(windowId: string, projectId: string): Promise<DesktopWorkspaceGrantTargetResult>;
    selectAuthoringLibrary(
      windowId: string,
      library: 'character' | 'world',
    ): Promise<DesktopWorkspaceGrantTargetResult>;
  };
}

export class DesktopWorkspaceGrantContractError extends Error {
  readonly code: 'invalid-desktop-workspace-grant-payload';

  constructor(code: DesktopWorkspaceGrantContractError['code'], message: string) {
    super(message);
    this.name = 'DesktopWorkspaceGrantContractError';
    this.code = code;
  }
}

export function createDesktopWorkspaceDirectoryTargetRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
}): DesktopWorkspaceGrantTargetRequest {
  return parseDesktopWorkspaceGrantTargetRequest({ ...input, operation: 'choose-directory' });
}

export function createDesktopContentProjectTargetRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
}): DesktopWorkspaceGrantTargetRequest {
  return parseDesktopWorkspaceGrantTargetRequest({ ...input, operation: 'create-content-project' });
}

export function createDesktopWorkspaceProjectTargetRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly projectId: string;
}): DesktopWorkspaceGrantTargetRequest {
  return parseDesktopWorkspaceGrantTargetRequest({ ...input, operation: 'select-project' });
}

export function createDesktopWorkspaceAuthoringLibraryTargetRequest(input: {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly windowId: string;
  readonly library: 'character' | 'world';
}): DesktopWorkspaceGrantTargetRequest {
  return parseDesktopWorkspaceGrantTargetRequest({
    ...input,
    operation: 'select-authoring-library',
  });
}

export function parseDesktopWorkspaceGrantTargetRequest(
  value: unknown,
): DesktopWorkspaceGrantTargetRequest {
  const record = requireRecord(value, 'Desktop Workspace target request must be an object.');
  const operation = record['operation'];
  const base = {
    requestId: requireIdentity(record['requestId'], 'Desktop Workspace target request'),
    rendererSessionId: requireIdentity(
      record['rendererSessionId'],
      'Desktop Workspace target renderer session identity',
    ),
    windowId: requireIdentity(record['windowId'], 'Desktop Workspace target Window'),
  };
  if (operation === 'choose-directory' || operation === 'create-content-project') {
    requireExactKeys(
      record,
      ['requestId', 'rendererSessionId', 'windowId', 'operation'],
      'Desktop Workspace directory target request',
    );
    return { ...base, operation };
  }
  if (operation === 'select-project') {
    requireExactKeys(
      record,
      ['requestId', 'rendererSessionId', 'windowId', 'operation', 'projectId'],
      'Desktop Workspace Project target request',
    );
    return {
      ...base,
      operation,
      projectId: requireIdentity(record['projectId'], 'Desktop Workspace target Project'),
    };
  }
  if (operation === 'select-authoring-library') {
    requireExactKeys(
      record,
      ['requestId', 'rendererSessionId', 'windowId', 'operation', 'library'],
      'Desktop Workspace authoring library target request',
    );
    if (record['library'] !== 'character' && record['library'] !== 'world') {
      throw invalid(`Unknown Desktop authoring library '${String(record['library'])}'.`);
    }
    return { ...base, operation, library: record['library'] };
  }
  throw invalid(`Unknown Desktop Workspace target operation '${String(operation)}'.`);
}

export function parseDesktopWorkspaceGrantTargetResult(
  value: unknown,
  expectedRequestId?: string,
): DesktopWorkspaceGrantTargetResult {
  const record = requireRecord(value, 'Desktop Workspace target result must be an object.');
  const status = record['status'];
  const requestId = requireIdentity(record['requestId'], 'Desktop Workspace target request');
  if (expectedRequestId !== undefined && requestId !== expectedRequestId) {
    throw invalid('Desktop Workspace target result request identity does not match.');
  }
  if (status === 'cancelled') {
    requireExactKeys(record, ['requestId', 'status'], 'Desktop Workspace target result');
    return { requestId, status };
  }
  if (status === 'authorized-project') {
    requireExactKeys(
      record,
      ['requestId', 'status', 'workspaceId', 'projectId', 'grant'],
      'Desktop Content Project target result',
    );
    return {
      requestId,
      status,
      workspaceId: requireIdentity(record['workspaceId'], 'Desktop Workspace target Workspace'),
      projectId: requireIdentity(record['projectId'], 'Desktop Content Project target'),
      grant: parseDesktopWorkspaceGrantProjection(record['grant']),
    };
  }
  if (status !== 'authorized') {
    throw invalid(`Unknown Desktop Workspace target result status '${String(status)}'.`);
  }
  requireExactKeys(
    record,
    ['requestId', 'status', 'workspaceId', 'grant'],
    'Desktop Workspace target result',
  );
  return {
    requestId,
    status,
    workspaceId: requireIdentity(record['workspaceId'], 'Desktop Workspace target Workspace'),
    grant: parseDesktopWorkspaceGrantProjection(record['grant']),
  };
}

export function parseDesktopWorkspaceGrantProjection(
  value: unknown,
): DesktopWorkspaceGrantProjection {
  const record = requireRecord(value, 'Desktop Workspace grant must be an object.');
  requireExactKeys(record, ['workspaceGrantId', 'windowId', 'label'], 'Desktop Workspace grant');
  return {
    workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Desktop Workspace grant'),
    windowId: requireIdentity(record['windowId'], 'Desktop Workspace grant Window'),
    label: requireIdentity(record['label'], 'Desktop Workspace grant label'),
  };
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
