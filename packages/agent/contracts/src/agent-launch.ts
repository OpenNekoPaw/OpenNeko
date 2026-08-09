import {
  parseAgentDraftInteractionProjection,
  type AgentDraftInteractionProjection,
} from './agent-interaction-binding';
import { parseAgentInputCatalog, type AgentInputCatalogEntry } from './agent-input-trigger';
import {
  parseAgentConfigurationPolicyProjection,
  parseAgentModelCatalogEntry,
  type AgentConfigurationPolicyProjection,
  type AgentModelCatalogEntry,
} from './agent-model-catalog';

export type AgentLaunchResourceKind = 'file' | 'directory' | 'microphone';

export interface AgentLaunchConnectionIdentity {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly viewId: string;
  readonly draftId: string;
  readonly connectionId: string;
}

export interface AgentLaunchCatalogProjection {
  readonly connection: AgentLaunchConnectionIdentity;
  readonly interaction: AgentDraftInteractionProjection;
  readonly models: readonly AgentModelCatalogEntry[];
  readonly configuration: AgentConfigurationPolicyProjection;
  readonly inputs: readonly AgentInputCatalogEntry[];
}

export function parseAgentLaunchConnectionIdentity(value: unknown): AgentLaunchConnectionIdentity {
  const record = requireRecord(value, 'Agent launch connection must be an object.');
  requireExactKeys(record, [
    'applicationInstanceId',
    'windowId',
    'workbenchInstanceId',
    'agentSurfaceId',
    'viewId',
    'draftId',
    'connectionId',
  ]);
  return {
    applicationInstanceId: requireIdentity(record['applicationInstanceId'], 'application instance'),
    windowId: requireIdentity(record['windowId'], 'Window'),
    workbenchInstanceId: requireIdentity(record['workbenchInstanceId'], 'Workbench'),
    agentSurfaceId: requireIdentity(record['agentSurfaceId'], 'Agent Surface'),
    viewId: requireIdentity(record['viewId'], 'View'),
    draftId: requireIdentity(record['draftId'], 'Draft'),
    connectionId: requireIdentity(record['connectionId'], 'connection'),
  };
}

export function parseAgentLaunchCatalogProjection(value: unknown): AgentLaunchCatalogProjection {
  const record = requireRecord(value, 'Agent launch catalog must be an object.');
  requireExactKeys(record, ['connection', 'interaction', 'models', 'configuration', 'inputs']);
  const connection = parseAgentLaunchConnectionIdentity(record['connection']);
  const interaction = parseAgentDraftInteractionProjection(record['interaction']);
  if (interaction.draftId !== connection.draftId) {
    throw new Error('Agent launch catalog Draft identity does not match its connection.');
  }
  if (
    interaction.bindingReceipt !== null &&
    interaction.bindingReceipt.connectionId !== connection.connectionId
  ) {
    throw new Error('Agent launch binding receipt belongs to another connection.');
  }
  return {
    connection,
    interaction,
    models: parseArray(record['models'], parseAgentModelCatalogEntry),
    configuration: parseAgentConfigurationPolicyProjection(record['configuration']),
    inputs: parseAgentInputCatalog(record['inputs']),
  };
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
