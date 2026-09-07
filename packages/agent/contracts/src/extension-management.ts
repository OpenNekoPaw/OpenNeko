export interface AgentExtensionManagementSessionIdentity {
  readonly windowId: string;
}

export interface AgentManagedSkillItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly source: string;
  readonly provider: string;
  readonly userInvocable: boolean;
  readonly modelInvocable: boolean;
  readonly enabled: boolean;
  readonly manageable: boolean;
  readonly removable: boolean;
}

export interface AgentManagedSkillDetail {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly source: string;
  readonly provider: string;
  readonly userInvocable: boolean;
  readonly modelInvocable: boolean;
  readonly content: string;
  readonly fingerprint: string;
}

export interface AgentManagedMcpItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly transport: 'stdio' | 'streamable-http';
  readonly enabled: boolean;
  readonly status: 'ready' | 'disabled' | 'error';
  readonly diagnosticCode: string;
}

export type AgentMcpServerInput =
  | {
      readonly serverName: string;
      readonly description: string;
      readonly transport: 'stdio';
      readonly command: string;
      readonly args: readonly string[];
    }
  | {
      readonly serverName: string;
      readonly description: string;
      readonly transport: 'streamable-http';
      readonly url: string;
    };

export interface AgentExtensionManagementProjection {
  readonly identity: AgentExtensionManagementSessionIdentity;
  readonly catalogScope: 'global';
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
  getSkillDetail(input: {
    readonly name: string;
    readonly source: string;
  }): Promise<AgentManagedSkillDetail>;
  addSkill(): Promise<AgentExtensionManagementProjection>;
  setSkillEnabled(input: {
    readonly name: string;
    readonly source: string;
    readonly enabled: boolean;
  }): Promise<AgentExtensionManagementProjection>;
  removeSkill(input: {
    readonly name: string;
    readonly source: string;
  }): Promise<AgentExtensionManagementProjection>;
  addMcp(input: AgentMcpServerInput): Promise<AgentExtensionManagementProjection>;
  setMcpEnabled(input: {
    readonly id: string;
    readonly enabled: boolean;
  }): Promise<AgentExtensionManagementProjection>;
  removeMcp(id: string): Promise<AgentExtensionManagementProjection>;
  dispose(): void;
}

export function parseAgentManagedSkillDetail(value: unknown): AgentManagedSkillDetail {
  const skill = requireRecord(value, 'DSH Skill detail is invalid.');
  const keys =
    skill.whenToUse === undefined
      ? [
          'id',
          'name',
          'description',
          'source',
          'provider',
          'userInvocable',
          'modelInvocable',
          'content',
          'fingerprint',
        ]
      : [
          'id',
          'name',
          'description',
          'whenToUse',
          'source',
          'provider',
          'userInvocable',
          'modelInvocable',
          'content',
          'fingerprint',
        ];
  const record = requireExactRecord(value, keys, 'DSH Skill detail is invalid.');
  const fingerprint = requireNonEmptyString(record.fingerprint, 'DSH Skill detail fingerprint');
  if (!/^sha256:[a-f0-9]{64}$/u.test(fingerprint)) {
    throw new Error('DSH Skill detail fingerprint is invalid.');
  }
  return {
    id: requireNonEmptyString(record.id, 'DSH Skill detail id'),
    name: requireNonEmptyString(record.name, 'DSH Skill detail name'),
    description: requireString(record.description, 'DSH Skill detail description'),
    ...(skill.whenToUse === undefined
      ? {}
      : { whenToUse: requireNonEmptyString(record.whenToUse, 'DSH Skill detail whenToUse') }),
    source: requireNonEmptyString(record.source, 'DSH Skill detail source'),
    provider: requireNonEmptyString(record.provider, 'DSH Skill detail provider'),
    userInvocable: requireBoolean(record.userInvocable, 'DSH Skill detail user invocation flag'),
    modelInvocable: requireBoolean(record.modelInvocable, 'DSH Skill detail model invocation flag'),
    content: requireString(record.content, 'DSH Skill detail content'),
    fingerprint,
  };
}

export function parseAgentExtensionManagementProjection(
  value: unknown,
): AgentExtensionManagementProjection {
  const record = requireExactRecord(
    value,
    ['identity', 'catalogScope', 'skills', 'mcp', 'diagnostics'],
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
    catalogScope: requireGlobalCatalogScope(record.catalogScope),
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
  const skill = requireRecord(value, 'DSH Skill item is invalid.');
  const keys =
    skill.whenToUse === undefined
      ? [
          'id',
          'name',
          'description',
          'source',
          'provider',
          'userInvocable',
          'modelInvocable',
          'enabled',
          'manageable',
          'removable',
        ]
      : [
          'id',
          'name',
          'description',
          'whenToUse',
          'source',
          'provider',
          'userInvocable',
          'modelInvocable',
          'enabled',
          'manageable',
          'removable',
        ];
  const record = requireExactRecord(value, keys, 'DSH Skill item is invalid.');
  return {
    id: requireNonEmptyString(record.id, 'DSH Skill id'),
    name: requireNonEmptyString(record.name, 'DSH Skill name'),
    description: requireString(record.description, 'DSH Skill description'),
    ...(record.whenToUse === undefined
      ? {}
      : { whenToUse: requireNonEmptyString(record.whenToUse, 'DSH Skill whenToUse') }),
    source: requireNonEmptyString(record.source, 'DSH Skill source'),
    provider: requireNonEmptyString(record.provider, 'DSH Skill provider'),
    userInvocable: requireBoolean(record.userInvocable, 'DSH Skill user invocation flag'),
    modelInvocable: requireBoolean(record.modelInvocable, 'DSH Skill model invocation flag'),
    enabled: requireBoolean(record.enabled, 'DSH Skill enabled flag'),
    manageable: requireBoolean(record.manageable, 'DSH Skill manageable flag'),
    removable: requireBoolean(record.removable, 'DSH Skill removable flag'),
  };
}

function requireGlobalCatalogScope(value: unknown): 'global' {
  if (value !== 'global') throw new Error('DSH extension catalog scope is invalid.');
  return value;
}

function parseMcp(value: unknown): AgentManagedMcpItem {
  const record = requireExactRecord(
    value,
    ['id', 'name', 'description', 'transport', 'enabled', 'status', 'diagnosticCode'],
    'DSH MCP item is invalid.',
  );
  const status = record.status;
  if (status !== 'ready' && status !== 'disabled' && status !== 'error') {
    throw new Error('DSH MCP status is invalid.');
  }
  if (record.transport !== 'stdio' && record.transport !== 'streamable-http') {
    throw new Error('DSH MCP transport is invalid.');
  }
  return {
    id: requireNonEmptyString(record.id, 'DSH MCP id'),
    name: requireNonEmptyString(record.name, 'DSH MCP name'),
    description: requireString(record.description, 'DSH MCP description'),
    transport: record.transport,
    enabled: requireBoolean(record.enabled, 'DSH MCP enabled flag'),
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

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
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
