import {
  parseAgentAuthorityScopeProjection,
  type AgentAuthorityScopeProjection,
} from './agent-root-presentation';

export type AgentLaunchScopeRequirement = 'any' | 'assistant' | 'workspace';
export type AgentLaunchResourceKind = 'file' | 'directory' | 'microphone';

export interface AgentLaunchConnectionIdentity {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly viewId: string;
  readonly connectionId: string;
  readonly scope: AgentAuthorityScopeProjection;
}

interface AgentLaunchCatalogEntryBase {
  readonly id: string;
  readonly label: string;
  readonly scopeRequirement: AgentLaunchScopeRequirement;
}

export interface AgentLaunchModelCatalogEntry extends AgentLaunchCatalogEntryBase {
  readonly kind: 'model';
  readonly providerId: string;
  readonly modelId: string;
  readonly modelType: 'llm' | 'image' | 'video' | 'audio';
}

export interface AgentLaunchCommandCatalogEntry extends AgentLaunchCatalogEntryBase {
  readonly kind: 'command';
  readonly command: string;
  readonly description: string;
}

export interface AgentLaunchSkillCatalogEntry extends AgentLaunchCatalogEntryBase {
  readonly kind: 'skill';
  readonly name: string;
  readonly description: string;
  readonly source: 'builtin' | 'personal' | 'plugin' | 'project';
}

export interface AgentLaunchResourceCatalogEntry extends AgentLaunchCatalogEntryBase {
  readonly kind: 'resource';
  readonly resourceGrantId: string;
  readonly resourceKind: AgentLaunchResourceKind;
}

export interface AgentLaunchCatalogProjection {
  readonly connection: AgentLaunchConnectionIdentity;
  readonly models: readonly AgentLaunchModelCatalogEntry[];
  readonly commands: readonly AgentLaunchCommandCatalogEntry[];
  readonly skills: readonly AgentLaunchSkillCatalogEntry[];
  readonly resources: readonly AgentLaunchResourceCatalogEntry[];
}

export function parseAgentLaunchConnectionIdentity(value: unknown): AgentLaunchConnectionIdentity {
  const record = requireRecord(value, 'Agent launch connection must be an object.');
  requireExactKeys(record, [
    'applicationInstanceId',
    'windowId',
    'workbenchInstanceId',
    'agentSurfaceId',
    'viewId',
    'connectionId',
    'scope',
  ]);
  return {
    applicationInstanceId: requireIdentity(record['applicationInstanceId'], 'application instance'),
    windowId: requireIdentity(record['windowId'], 'Window'),
    workbenchInstanceId: requireIdentity(record['workbenchInstanceId'], 'Workbench'),
    agentSurfaceId: requireIdentity(record['agentSurfaceId'], 'Agent Surface'),
    viewId: requireIdentity(record['viewId'], 'View'),
    connectionId: requireIdentity(record['connectionId'], 'connection'),
    scope: parseAgentAuthorityScopeProjection(record['scope']),
  };
}

export function parseAgentLaunchCatalogProjection(value: unknown): AgentLaunchCatalogProjection {
  const record = requireRecord(value, 'Agent launch catalog must be an object.');
  requireExactKeys(record, ['connection', 'models', 'commands', 'skills', 'resources']);
  return {
    connection: parseAgentLaunchConnectionIdentity(record['connection']),
    models: parseArray(record['models'], parseModel),
    commands: parseArray(record['commands'], parseCommand),
    skills: parseArray(record['skills'], parseSkill),
    resources: parseArray(record['resources'], parseResource),
  };
}

export function isAgentLaunchEntryAvailable(
  entry: { readonly scopeRequirement: AgentLaunchScopeRequirement },
  scope: AgentAuthorityScopeProjection,
): boolean {
  return entry.scopeRequirement === 'any' || entry.scopeRequirement === scope.kind;
}

function parseModel(value: unknown): AgentLaunchModelCatalogEntry {
  const record = parseBase(value, 'model', [
    'kind',
    'id',
    'label',
    'scopeRequirement',
    'providerId',
    'modelId',
    'modelType',
  ]);
  const modelType = record['modelType'];
  if (
    modelType !== 'llm' &&
    modelType !== 'image' &&
    modelType !== 'video' &&
    modelType !== 'audio'
  ) {
    throw new Error(`Unknown Agent launch model type '${String(modelType)}'.`);
  }
  return {
    kind: 'model',
    id: requireIdentity(record['id'], 'model'),
    label: requireIdentity(record['label'], 'model label'),
    scopeRequirement: parseScopeRequirement(record['scopeRequirement']),
    providerId: requireIdentity(record['providerId'], 'model provider'),
    modelId: requireIdentity(record['modelId'], 'model'),
    modelType,
  };
}

function parseCommand(value: unknown): AgentLaunchCommandCatalogEntry {
  const record = parseBase(value, 'command', [
    'kind',
    'id',
    'label',
    'scopeRequirement',
    'command',
    'description',
  ]);
  return {
    kind: 'command',
    id: requireIdentity(record['id'], 'command'),
    label: requireIdentity(record['label'], 'command label'),
    scopeRequirement: parseScopeRequirement(record['scopeRequirement']),
    command: requireIdentity(record['command'], 'command name'),
    description: requireString(record['description'], 'command description'),
  };
}

function parseSkill(value: unknown): AgentLaunchSkillCatalogEntry {
  const record = parseBase(value, 'skill', [
    'kind',
    'id',
    'label',
    'scopeRequirement',
    'name',
    'description',
    'source',
  ]);
  const source = record['source'];
  if (
    source !== 'builtin' &&
    source !== 'personal' &&
    source !== 'plugin' &&
    source !== 'project'
  ) {
    throw new Error(`Unknown Agent launch Skill source '${String(source)}'.`);
  }
  return {
    kind: 'skill',
    id: requireIdentity(record['id'], 'Skill'),
    label: requireIdentity(record['label'], 'Skill label'),
    scopeRequirement: parseScopeRequirement(record['scopeRequirement']),
    name: requireIdentity(record['name'], 'Skill name'),
    description: requireString(record['description'], 'Skill description'),
    source,
  };
}

function parseResource(value: unknown): AgentLaunchResourceCatalogEntry {
  const record = parseBase(value, 'resource', [
    'kind',
    'id',
    'label',
    'scopeRequirement',
    'resourceGrantId',
    'resourceKind',
  ]);
  const resourceKind = record['resourceKind'];
  if (resourceKind !== 'file' && resourceKind !== 'directory' && resourceKind !== 'microphone') {
    throw new Error(`Unknown Agent launch resource kind '${String(resourceKind)}'.`);
  }
  return {
    kind: 'resource',
    id: requireIdentity(record['id'], 'resource'),
    label: requireIdentity(record['label'], 'resource label'),
    scopeRequirement: parseScopeRequirement(record['scopeRequirement']),
    resourceGrantId: requireIdentity(record['resourceGrantId'], 'resource grant'),
    resourceKind,
  };
}

function parseBase(
  value: unknown,
  kind:
    | AgentLaunchModelCatalogEntry['kind']
    | AgentLaunchCommandCatalogEntry['kind']
    | AgentLaunchSkillCatalogEntry['kind']
    | AgentLaunchResourceCatalogEntry['kind'],
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  const record = requireRecord(value, `Agent launch ${kind} entry must be an object.`);
  requireExactKeys(record, keys);
  if (record['kind'] !== kind) throw new Error(`Agent launch catalog entry must be '${kind}'.`);
  return record;
}

function parseScopeRequirement(value: unknown): AgentLaunchScopeRequirement {
  if (value !== 'any' && value !== 'assistant' && value !== 'workspace') {
    throw new Error(`Unknown Agent launch scope requirement '${String(value)}'.`);
  }
  return value;
}

function parseArray<T>(value: unknown, parse: (entry: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error('Agent launch catalog collection must be an array.');
  return value.map(parse);
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Readonly<Record<string, unknown>>;
}

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error('Agent launch contract contains unsupported fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent launch ${label} identity is required.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Agent launch ${label} is required.`);
  return value;
}
