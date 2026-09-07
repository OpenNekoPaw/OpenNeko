import {
  type AgentMcpServerInput,
  parseAgentExtensionManagementProjection,
  parseAgentExtensionManagementSessionIdentity,
  type AgentExtensionManagementProjection,
  type AgentExtensionManagementSessionIdentity,
  parseAgentManagedSkillDetail,
  type AgentManagedSkillDetail,
} from './extension-management';

export const AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL = 'neko:agent:extension-management' as const;

interface RequestBase {
  readonly requestId: string;
  readonly identity: AgentExtensionManagementSessionIdentity;
}

export type AgentExtensionManagementHostRequest =
  | (RequestBase & { readonly route: 'snapshot.get' | 'skill.add' })
  | (RequestBase & {
      readonly route: 'skill.detail.get';
      readonly name: string;
      readonly source: string;
    })
  | (RequestBase & {
      readonly route: 'skill.enablement.update';
      readonly name: string;
      readonly source: string;
      readonly enabled: boolean;
    })
  | (RequestBase & {
      readonly route: 'skill.remove';
      readonly name: string;
      readonly source: string;
    })
  | (RequestBase & { readonly route: 'mcp.add'; readonly server: AgentMcpServerInput })
  | (RequestBase & {
      readonly route: 'mcp.enablement.update';
      readonly id: string;
      readonly enabled: boolean;
    })
  | (RequestBase & { readonly route: 'mcp.remove'; readonly id: string });

export type AgentExtensionManagementHostResult =
  | {
      readonly requestId: string;
      readonly route: 'skill.detail.get';
      readonly detail: AgentManagedSkillDetail;
    }
  | {
      readonly requestId: string;
      readonly route: Exclude<AgentExtensionManagementHostRequest['route'], 'skill.detail.get'>;
      readonly projection: AgentExtensionManagementProjection;
    };

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
  const base = {
    requestId: requireId(record.requestId, 'request'),
    identity: parseAgentExtensionManagementSessionIdentity(record.identity),
  };
  if (route === 'snapshot.get' || route === 'skill.add') {
    requireExactKeys(record, ['requestId', 'identity', 'route']);
    return { ...base, route };
  }
  if (route === 'skill.detail.get') {
    requireExactKeys(record, ['requestId', 'identity', 'route', 'name', 'source']);
    return {
      ...base,
      route,
      name: requireId(record.name, 'Skill'),
      source: requireId(record.source, 'Skill source'),
    };
  }
  if (route === 'skill.enablement.update') {
    requireExactKeys(record, ['requestId', 'identity', 'route', 'name', 'source', 'enabled']);
    return {
      ...base,
      route,
      name: requireId(record.name, 'Skill'),
      source: requireId(record.source, 'Skill source'),
      enabled: requireBoolean(record.enabled, 'Skill enabled'),
    };
  }
  if (route === 'skill.remove') {
    requireExactKeys(record, ['requestId', 'identity', 'route', 'name', 'source']);
    return {
      ...base,
      route,
      name: requireId(record.name, 'Skill'),
      source: requireId(record.source, 'Skill source'),
    };
  }
  if (route === 'mcp.add') {
    requireExactKeys(record, ['requestId', 'identity', 'route', 'server']);
    return { ...base, route, server: parseMcpServer(record.server) };
  }
  if (route === 'mcp.enablement.update') {
    requireExactKeys(record, ['requestId', 'identity', 'route', 'id', 'enabled']);
    return {
      ...base,
      route,
      id: requireId(record.id, 'MCP'),
      enabled: requireBoolean(record.enabled, 'MCP enabled'),
    };
  }
  if (route === 'mcp.remove') {
    requireExactKeys(record, ['requestId', 'identity', 'route', 'id']);
    return { ...base, route, id: requireId(record.id, 'MCP') };
  }
  throw new Error(`Unknown DSH extension management route '${String(route)}'.`);
}

export function parseAgentExtensionManagementHostResult(
  value: unknown,
  request: AgentExtensionManagementHostRequest,
): AgentExtensionManagementHostResult {
  const record = requireRecord(value, 'DSH extension management result must be an object.');
  if (record.requestId !== request.requestId || record.route !== request.route) {
    throw new Error('DSH extension management result identity is stale.');
  }
  if (request.route === 'skill.detail.get') {
    requireExactKeys(record, ['requestId', 'route', 'detail']);
    const detail = parseAgentManagedSkillDetail(record.detail);
    if (detail.name !== request.name || detail.source !== request.source) {
      throw new Error('DSH Skill detail identity is stale.');
    }
    return { requestId: request.requestId, route: request.route, detail };
  }
  requireExactKeys(record, ['requestId', 'route', 'projection']);
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

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`DSH extension management ${label} is invalid.`);
  return value;
}

function parseMcpServer(value: unknown): AgentMcpServerInput {
  const record = requireRecord(value, 'DSH extension management MCP server must be an object.');
  if (record.transport === 'stdio') {
    requireExactKeys(record, ['serverName', 'description', 'transport', 'command', 'args']);
    if (!Array.isArray(record.args) || record.args.some((item) => typeof item !== 'string')) {
      throw new Error('DSH extension management MCP arguments are invalid.');
    }
    return {
      serverName: requireId(record.serverName, 'MCP server'),
      description: requireString(record.description, 'MCP description'),
      transport: 'stdio',
      command: requireId(record.command, 'MCP command'),
      args: record.args,
    };
  }
  if (record.transport === 'streamable-http') {
    requireExactKeys(record, ['serverName', 'description', 'transport', 'url']);
    return {
      serverName: requireId(record.serverName, 'MCP server'),
      description: requireString(record.description, 'MCP description'),
      transport: 'streamable-http',
      url: requireId(record.url, 'MCP URL'),
    };
  }
  throw new Error('DSH extension management MCP transport is invalid.');
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`DSH extension management ${label} is invalid.`);
  return value;
}
