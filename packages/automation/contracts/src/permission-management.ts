import type { AutomationPermission } from './index';

export const AUTOMATION_PERMISSION_MANAGEMENT_HOST_CHANNEL =
  'neko:automation:permission-management' as const;

export type AutomationPermissionStatus =
  'granted' | 'denied' | 'not-determined' | 'unsupported' | 'error';

export type AutomationPermissionRequestAction = 'open-system-settings' | 'prompt' | 'unsupported';

export interface AutomationPermissionProjection {
  readonly permission: AutomationPermission;
  readonly status: AutomationPermissionStatus;
  readonly requestAction: AutomationPermissionRequestAction;
  readonly diagnostics: readonly 'query-failed'[];
}

export interface AutomationPermissionManagementProjection {
  readonly identity: { readonly windowId: string };
  readonly permissions: readonly AutomationPermissionProjection[];
}

export interface AutomationPermissionManagementRuntime {
  readonly identity: { readonly windowId: string };
  getSnapshot(): Promise<AutomationPermissionManagementProjection>;
  request(permission: AutomationPermission): Promise<AutomationPermissionManagementProjection>;
  dispose(): void;
}

interface RequestBase {
  readonly requestId: string;
  readonly identity: { readonly windowId: string };
}

export type AutomationPermissionManagementHostRequest =
  | (RequestBase & { readonly route: 'snapshot.get' })
  | (RequestBase & {
      readonly route: 'permission.request';
      readonly permission: AutomationPermission;
    });

export interface AutomationPermissionManagementHostResult {
  readonly requestId: string;
  readonly route: AutomationPermissionManagementHostRequest['route'];
  readonly projection: AutomationPermissionManagementProjection;
}

export interface OpenNekoAutomationPermissionManagementBridge {
  readonly automationPermissions: {
    execute(
      request: AutomationPermissionManagementHostRequest,
    ): Promise<AutomationPermissionManagementHostResult>;
  };
}

export function parseAutomationPermissionManagementHostRequest(
  value: unknown,
): AutomationPermissionManagementHostRequest {
  const record = recordValue(value, 'Automation permission management request');
  const route = record['route'];
  const base = {
    requestId: identity(record['requestId'], 'Automation permission management request'),
    identity: parseOwner(record['identity']),
  } as const;
  switch (route) {
    case 'snapshot.get':
      exactRecord(
        record,
        ['requestId', 'identity', 'route'],
        'Automation permission management request',
      );
      return { ...base, route };
    case 'permission.request':
      exactRecord(
        record,
        ['requestId', 'identity', 'route', 'permission'],
        'Automation permission management request',
      );
      return { ...base, route, permission: parsePermission(record['permission']) };
    default:
      throw new Error('Automation permission management route is invalid.');
  }
}

export function parseAutomationPermissionManagementHostResult(
  value: unknown,
  request: AutomationPermissionManagementHostRequest,
): AutomationPermissionManagementHostResult {
  const record = exactRecord(
    value,
    ['requestId', 'route', 'projection'],
    'Automation permission management result',
  );
  if (record['requestId'] !== request.requestId || record['route'] !== request.route) {
    throw new Error('Automation permission management result identity is stale.');
  }
  return {
    requestId: request.requestId,
    route: request.route,
    projection: parseAutomationPermissionManagementProjection(record['projection']),
  };
}

export function parseAutomationPermissionManagementProjection(
  value: unknown,
): AutomationPermissionManagementProjection {
  const record = exactRecord(
    value,
    ['identity', 'permissions'],
    'Automation permission management projection',
  );
  if (!Array.isArray(record['permissions'])) {
    throw new Error('Automation permission projections are invalid.');
  }
  const permissions = record['permissions'].map(parsePermissionProjection);
  if (new Set(permissions.map((item) => item.permission)).size !== permissions.length) {
    throw new Error('Automation permission projections contain duplicate permissions.');
  }
  return { identity: parseOwner(record['identity']), permissions };
}

function parsePermissionProjection(value: unknown): AutomationPermissionProjection {
  const record = exactRecord(
    value,
    ['permission', 'status', 'requestAction', 'diagnostics'],
    'Automation permission projection',
  );
  if (!Array.isArray(record['diagnostics'])) {
    throw new Error('Automation permission diagnostics are invalid.');
  }
  const diagnostics = record['diagnostics'].map((diagnostic) => {
    if (diagnostic !== 'query-failed') {
      throw new Error('Automation permission diagnostic is invalid.');
    }
    return diagnostic;
  });
  if (new Set(diagnostics).size !== diagnostics.length) {
    throw new Error('Automation permission diagnostics contain duplicates.');
  }
  const status = oneOf(
    record['status'],
    ['granted', 'denied', 'not-determined', 'unsupported', 'error'] as const,
    'Automation permission status',
  );
  if ((status === 'error') !== diagnostics.includes('query-failed')) {
    throw new Error('Automation permission diagnostic state is inconsistent.');
  }
  return {
    permission: parsePermission(record['permission']),
    status,
    requestAction: oneOf(
      record['requestAction'],
      ['open-system-settings', 'prompt', 'unsupported'] as const,
      'Automation permission request action',
    ),
    diagnostics,
  };
}

function parsePermission(value: unknown): AutomationPermission {
  return oneOf(
    value,
    ['screen-recording', 'accessibility', 'input-control'] as const,
    'Automation permission',
  );
}

function parseOwner(value: unknown): { readonly windowId: string } {
  const record = exactRecord(value, ['windowId'], 'Automation permission management owner');
  return { windowId: identity(record['windowId'], 'Automation permission Window') };
}

function identity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function recordValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, label);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
  return record;
}

function oneOf<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  label: string,
): Value {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as Value;
}
