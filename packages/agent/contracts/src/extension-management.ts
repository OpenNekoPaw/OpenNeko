export interface AgentExtensionManagementSessionIdentity {
  readonly windowId: string;
}

export interface AgentManagedSkillItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly provider: string;
  readonly userInvocable: boolean;
  readonly modelInvocable: boolean;
}

export interface AgentManagedMcpItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: 'ready' | 'unsupported' | 'error';
  readonly diagnosticCode: string;
}

export interface AgentExtensionManagementProjection {
  readonly identity: AgentExtensionManagementSessionIdentity;
  readonly skills: readonly AgentManagedSkillItem[];
  readonly mcp: readonly AgentManagedMcpItem[];
  readonly diagnostics: readonly {
    readonly code: 'skill_catalog_incomplete' | 'runtime_unavailable';
    readonly count: number;
  }[];
}

export interface AgentExtensionManagementRuntime {
  readonly identity: AgentExtensionManagementSessionIdentity;
  getSnapshot(): Promise<AgentExtensionManagementProjection>;
  dispose(): void;
}

export function parseAgentExtensionManagementProjection(
  value: unknown,
): AgentExtensionManagementProjection {
  const record = requireExactRecord(
    value,
    ['identity', 'skills', 'mcp', 'diagnostics'],
    'DSH extension management projection is invalid.',
  );
  if (
    !Array.isArray(record.skills) ||
    !Array.isArray(record.mcp) ||
    !Array.isArray(record.diagnostics)
  ) {
    throw new Error('DSH extension management catalogs are invalid.');
  }
  return {
    identity: parseIdentity(record.identity),
    skills: record.skills.map(parseSkill),
    mcp: record.mcp.map(parseMcp),
    diagnostics: record.diagnostics.map(parseDiagnostic),
  };
}

export function parseAgentExtensionManagementSessionIdentity(
  value: unknown,
): AgentExtensionManagementSessionIdentity {
  const record = requireExactRecord(value, ['windowId'], 'DSH extension identity is invalid.');
  return { windowId: requireNonEmptyString(record.windowId, 'DSH extension Window identity') };
}

function parseIdentity(value: unknown): AgentExtensionManagementSessionIdentity {
  return parseAgentExtensionManagementSessionIdentity(value);
}

function parseSkill(value: unknown): AgentManagedSkillItem {
  const record = requireExactRecord(
    value,
    ['id', 'name', 'description', 'source', 'provider', 'userInvocable', 'modelInvocable'],
    'DSH Skill item is invalid.',
  );
  return {
    id: requireNonEmptyString(record.id, 'DSH Skill id'),
    name: requireNonEmptyString(record.name, 'DSH Skill name'),
    description: requireString(record.description, 'DSH Skill description'),
    source: requireNonEmptyString(record.source, 'DSH Skill source'),
    provider: requireNonEmptyString(record.provider, 'DSH Skill provider'),
    userInvocable: requireBoolean(record.userInvocable, 'DSH Skill user invocation flag'),
    modelInvocable: requireBoolean(record.modelInvocable, 'DSH Skill model invocation flag'),
  };
}

function parseMcp(value: unknown): AgentManagedMcpItem {
  const record = requireExactRecord(
    value,
    ['id', 'name', 'description', 'status', 'diagnosticCode'],
    'DSH MCP item is invalid.',
  );
  const status = record.status;
  if (status !== 'ready' && status !== 'unsupported' && status !== 'error') {
    throw new Error('DSH MCP status is invalid.');
  }
  return {
    id: requireNonEmptyString(record.id, 'DSH MCP id'),
    name: requireNonEmptyString(record.name, 'DSH MCP name'),
    description: requireString(record.description, 'DSH MCP description'),
    status,
    diagnosticCode: requireString(record.diagnosticCode, 'DSH MCP diagnostic code'),
  };
}

function parseDiagnostic(
  value: unknown,
): AgentExtensionManagementProjection['diagnostics'][number] {
  const record = requireExactRecord(
    value,
    ['code', 'count'],
    'DSH extension diagnostic is invalid.',
  );
  const code = record.code;
  if (code !== 'skill_catalog_incomplete' && code !== 'runtime_unavailable') {
    throw new Error('DSH extension diagnostic code is invalid.');
  }
  return { code, count: requirePositiveInteger(record.count, 'DSH extension diagnostic count') };
}

function requireExactRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  const record = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(record).length !== keys.length ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new Error(message);
  }
  return record;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`${label} is required.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}
