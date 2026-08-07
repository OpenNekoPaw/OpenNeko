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

export type AgentExtensionManagementHostRequest =
  | (RequestBase & { readonly route: 'snapshot.get' })
  | (RequestBase & {
      readonly route: 'plugin.install' | 'plugin.remove';
      readonly pluginId: string;
    })
  | (RequestBase & {
      readonly route: 'marketplaces.refresh' | 'skill.install';
    })
  | (RequestBase & {
      readonly route: 'skill.remove';
      readonly managementId: string;
    });

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

type RequestInput = AgentExtensionManagementHostRequest;

export function createAgentExtensionManagementHostRequest(
  input: RequestInput,
): AgentExtensionManagementHostRequest {
  return parseAgentExtensionManagementHostRequest(input);
}

export function parseAgentExtensionManagementHostRequest(
  value: unknown,
): AgentExtensionManagementHostRequest {
  const record = requireRecord(value, 'Agent Extension Management request must be an object.');
  const base = {
    requestId: requireId(record['requestId'], 'request'),
    identity: parseIdentity(record['identity']),
  } as const;
  switch (record['route']) {
    case 'snapshot.get':
      requireExactKeys(record, BASE_KEYS);
      return { ...base, route: 'snapshot.get' };
    case 'plugin.install':
    case 'plugin.remove':
      requireExactKeys(record, [...BASE_KEYS, 'pluginId']);
      return {
        ...base,
        route: record['route'],
        pluginId: requireId(record['pluginId'], 'plugin'),
      };
    case 'marketplaces.refresh':
    case 'skill.install':
      requireExactKeys(record, BASE_KEYS);
      return {
        ...base,
        route: record['route'],
      };
    case 'skill.remove':
      requireExactKeys(record, [...BASE_KEYS, 'managementId']);
      return {
        ...base,
        route: 'skill.remove',
        managementId: requireId(record['managementId'], 'Skill management'),
      };
    default:
      throw new Error(`Unknown Agent Extension Management route '${String(record['route'])}'.`);
  }
}

export function parseAgentExtensionManagementHostResult(
  value: unknown,
  request: AgentExtensionManagementHostRequest,
): AgentExtensionManagementHostResult {
  const record = requireRecord(value, 'Agent Extension Management result must be an object.');
  requireExactKeys(record, ['requestId', 'route', 'projection']);
  if (record['requestId'] !== request.requestId || record['route'] !== request.route) {
    throw new Error('Agent Extension Management result identity is stale.');
  }
  const projection = parseAgentExtensionManagementProjection(record['projection']);
  const identity = projection.identity;
  if (identity.windowId !== request.identity.windowId) {
    throw new Error('Agent Extension Management projection owner identity is stale.');
  }
  return {
    requestId: request.requestId,
    route: request.route,
    projection,
  };
}

const BASE_KEYS = ['requestId', 'identity', 'route'] as const;

function parseIdentity(value: unknown): AgentExtensionManagementSessionIdentity {
  return parseAgentExtensionManagementSessionIdentity(value);
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error('Agent Extension Management payload contains unsupported fields.');
  }
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Agent Extension Management ${label} identity is required.`);
  }
  return value;
}
