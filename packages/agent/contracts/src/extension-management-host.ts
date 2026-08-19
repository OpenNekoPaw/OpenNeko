import {
  parseAgentExtensionManagementProjection,
  parseAgentExtensionManagementSessionIdentity,
  type AgentExtensionManagementProjection,
  type AgentExtensionManagementSessionIdentity,
} from './extension-management';

export const AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL = 'neko:agent:extension-management' as const;

interface RequestBase {
  readonly requestId: string;
  readonly identity: AgentExtensionManagementSessionIdentity;
}

export type AgentExtensionManagementHostRequest = RequestBase & { readonly route: 'snapshot.get' };

export interface AgentExtensionManagementHostResult {
  readonly requestId: string;
  readonly route: AgentExtensionManagementHostRequest['route'];
  readonly projection: AgentExtensionManagementProjection;
}

export interface OpenNekoAgentExtensionManagementBridge {
  readonly extensionManagement: {
    execute(
      request: AgentExtensionManagementHostRequest,
    ): Promise<AgentExtensionManagementHostResult>;
  };
}

export function createAgentExtensionManagementHostRequest(
  input: AgentExtensionManagementHostRequest,
): AgentExtensionManagementHostRequest {
  return parseAgentExtensionManagementHostRequest(input);
}

export function parseAgentExtensionManagementHostRequest(
  value: unknown,
): AgentExtensionManagementHostRequest {
  const record = requireRecord(value, 'DSH extension management request must be an object.');
  const route = record.route;
  if (route !== 'snapshot.get') {
    throw new Error(`Unknown DSH extension management route '${String(route)}'.`);
  }
  requireExactKeys(record, ['requestId', 'identity', 'route']);
  return {
    requestId: requireId(record.requestId, 'request'),
    identity: parseAgentExtensionManagementSessionIdentity(record.identity),
    route,
  };
}

export function parseAgentExtensionManagementHostResult(
  value: unknown,
  request: AgentExtensionManagementHostRequest,
): AgentExtensionManagementHostResult {
  const record = requireRecord(value, 'DSH extension management result must be an object.');
  requireExactKeys(record, ['requestId', 'route', 'projection']);
  if (record.requestId !== request.requestId || record.route !== request.route) {
    throw new Error('DSH extension management result identity is stale.');
  }
  const projection = parseAgentExtensionManagementProjection(record.projection);
  if (projection.identity.windowId !== request.identity.windowId) {
    throw new Error('DSH extension management projection owner identity is stale.');
  }
  return { requestId: request.requestId, route: request.route, projection };
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new Error('DSH extension management payload contains unsupported fields.');
  }
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`DSH extension management ${label} identity is required.`);
  }
  return value;
}
