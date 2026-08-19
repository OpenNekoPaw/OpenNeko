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
  type AgentModelType,
} from './agent-model-catalog';
import type {
  MediaUnderstandingCategory,
  MediaUnderstandingModelStatus,
  MediaUnderstandingModels,
  MediaUnderstandingPurpose,
} from './ui';

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
  readonly defaultMediaModels: Readonly<Partial<Record<Exclude<AgentModelType, 'llm'>, string>>>;
  readonly mediaUnderstandingModels: MediaUnderstandingModels;
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
  requireExactKeys(record, [
    'connection',
    'interaction',
    'models',
    'defaultMediaModels',
    'mediaUnderstandingModels',
    'configuration',
    'inputs',
  ]);
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
    defaultMediaModels: parseDefaultMediaModels(record['defaultMediaModels']),
    mediaUnderstandingModels: parseMediaUnderstandingModels(record['mediaUnderstandingModels']),
    configuration: parseAgentConfigurationPolicyProjection(record['configuration']),
    inputs: parseAgentInputCatalog(record['inputs']),
  };
}

const MEDIA_UNDERSTANDING_PURPOSES = {
  image: 'image.understand',
  audio: 'audio.understand',
  video: 'video.understand',
} as const satisfies Record<MediaUnderstandingCategory, MediaUnderstandingPurpose>;

function parseMediaUnderstandingModels(value: unknown): MediaUnderstandingModels {
  const record = requireRecord(value, 'Agent launch media understanding models must be an object.');
  requireExactKeys(record, ['image', 'audio', 'video']);
  return {
    image: parseMediaUnderstandingModelStatus(record['image'], 'image'),
    audio: parseMediaUnderstandingModelStatus(record['audio'], 'audio'),
    video: parseMediaUnderstandingModelStatus(record['video'], 'video'),
  };
}

function parseMediaUnderstandingModelStatus(
  value: unknown,
  category: MediaUnderstandingCategory,
): MediaUnderstandingModelStatus {
  const record = requireRecord(
    value,
    `Agent launch ${category} understanding model status must be an object.`,
  );
  requireAllowedKeys(record, [
    'category',
    'purpose',
    'status',
    'providerId',
    'modelId',
    'optionId',
    'label',
    'providerLabel',
    'source',
  ]);
  if (
    record['category'] !== category ||
    record['purpose'] !== MEDIA_UNDERSTANDING_PURPOSES[category]
  ) {
    throw new Error(`Agent launch ${category} understanding model identity is invalid.`);
  }
  const status = record['status'];
  if (status !== 'configured' && status !== 'auto' && status !== 'missing') {
    throw new Error(`Agent launch ${category} understanding model status is invalid.`);
  }
  const source = record['source'];
  if (source !== undefined && source !== 'explicit-config') {
    throw new Error(`Agent launch ${category} understanding model source is invalid.`);
  }
  return {
    category,
    purpose: MEDIA_UNDERSTANDING_PURPOSES[category],
    status,
    ...optionalIdentities(record, ['providerId', 'modelId', 'optionId', 'label', 'providerLabel']),
    ...(source === undefined ? {} : { source }),
  };
}

function optionalIdentities<K extends string>(
  record: Readonly<Record<string, unknown>>,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined) result[key] = requireIdentity(value, key);
  }
  return result;
}

function parseDefaultMediaModels(
  value: unknown,
): AgentLaunchCatalogProjection['defaultMediaModels'] {
  const record = requireRecord(value, 'Agent launch media model defaults must be an object.');
  const supported = new Set(['image', 'video', 'audio']);
  if (Object.keys(record).some((key) => !supported.has(key))) {
    throw new Error('Agent launch media model defaults contain unsupported fields.');
  }
  return Object.fromEntries(
    Object.entries(record).map(([category, modelCatalogEntryId]) => [
      category,
      requireIdentity(modelCatalogEntryId, `${category} model catalog entry`),
    ]),
  );
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

function requireAllowedKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): void {
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error('Agent launch contract contains unsupported fields.');
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent launch ${label} identity is required.`);
  }
  return value;
}
