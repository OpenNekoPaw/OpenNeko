import {
  parseAgentAvailabilityProjection,
  type AgentAvailabilityProjection,
} from './agent-availability';

export type AgentModelType = 'llm' | 'image' | 'video' | 'audio';

export interface AgentModelCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelType: AgentModelType;
  readonly contextWindow: number | null;
  readonly maximumOutputTokens: number | null;
  readonly purposeCapabilities: readonly string[];
  readonly availability: AgentAvailabilityProjection;
}

export interface AgentConfigurationRequest {
  readonly modelCatalogEntryId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly executionMode: 'plan' | 'ask' | 'auto';
  readonly temperature?: number;
  readonly maximumOutputTokens?: number;
  readonly thinkingBudget?: number;
}

export type AgentConfigurationFieldPolicy =
  | {
      readonly status: 'editable';
      readonly owner: string;
    }
  | {
      readonly status: 'locked' | 'unavailable';
      readonly owner: string;
      readonly reason: string;
    };

export type AgentConfigurationValueSource =
  'global-default' | 'draft-request' | 'conversation' | 'domain-policy' | 'provider-policy';

export interface AgentConfigurationFieldProjection<T> {
  readonly effectiveValue: T | null;
  readonly source: AgentConfigurationValueSource;
  readonly policy: AgentConfigurationFieldPolicy;
}

export interface AgentConfigurationPolicyProjection {
  readonly request: AgentConfigurationRequest | null;
  readonly fields: {
    readonly model: AgentConfigurationFieldProjection<{
      readonly modelCatalogEntryId: string;
      readonly providerId: string;
      readonly modelId: string;
    }>;
    readonly executionMode: AgentConfigurationFieldProjection<'plan' | 'ask' | 'auto'>;
    readonly temperature: AgentConfigurationFieldProjection<number>;
    readonly maximumOutputTokens: AgentConfigurationFieldProjection<number>;
    readonly thinkingBudget: AgentConfigurationFieldProjection<number>;
  };
}

/** Mutable future-turn configuration owned by one exact Conversation. */
export interface AgentConversationConfiguration {
  readonly conversationId: string;
  readonly request: AgentConfigurationRequest;
  readonly projection: AgentConfigurationPolicyProjection;
}

/** Immutable configuration receipt captured for one exact Turn. */
export interface AgentConversationTurnConfigurationSnapshot {
  readonly conversationId: string;
  readonly turnId: string;
  readonly request: AgentConfigurationRequest;
  readonly projection: AgentConfigurationPolicyProjection;
}

export function parseAgentModelCatalogEntry(value: unknown): AgentModelCatalogEntry {
  const record = requireRecord(value, 'Agent model catalog entry must be an object.');
  requireExactKeys(record, [
    'id',
    'label',
    'providerId',
    'modelId',
    'modelType',
    'contextWindow',
    'maximumOutputTokens',
    'purposeCapabilities',
    'availability',
  ]);
  const modelType = record['modelType'];
  if (
    modelType !== 'llm' &&
    modelType !== 'image' &&
    modelType !== 'video' &&
    modelType !== 'audio'
  ) {
    throw new Error(`Unknown Agent model type '${String(modelType)}'.`);
  }
  return {
    id: requireIdentity(record['id'], 'model catalog entry'),
    label: requireIdentity(record['label'], 'model label'),
    providerId: requireIdentity(record['providerId'], 'provider'),
    modelId: requireIdentity(record['modelId'], 'model'),
    modelType,
    contextWindow: requirePositiveIntegerOrNull(record['contextWindow'], 'context window'),
    maximumOutputTokens: requirePositiveIntegerOrNull(
      record['maximumOutputTokens'],
      'maximum output tokens',
    ),
    purposeCapabilities: requireIdentityArray(
      record['purposeCapabilities'],
      'model purpose capability',
    ),
    availability: parseAgentAvailabilityProjection(record['availability']),
  };
}

export function parseAgentConfigurationRequest(value: unknown): AgentConfigurationRequest {
  const record = requireRecord(value, 'Agent configuration request must be an object.');
  requireAllowedKeys(
    record,
    [
      'modelCatalogEntryId',
      'providerId',
      'modelId',
      'executionMode',
      'temperature',
      'maximumOutputTokens',
      'thinkingBudget',
    ],
    ['modelCatalogEntryId', 'providerId', 'modelId', 'executionMode'],
  );
  const executionMode = record['executionMode'];
  if (executionMode !== 'plan' && executionMode !== 'ask' && executionMode !== 'auto') {
    throw new Error(`Unknown Agent execution mode '${String(executionMode)}'.`);
  }
  return {
    modelCatalogEntryId: requireIdentity(record['modelCatalogEntryId'], 'model catalog entry'),
    providerId: requireIdentity(record['providerId'], 'provider'),
    modelId: requireIdentity(record['modelId'], 'model'),
    executionMode,
    ...(record['temperature'] === undefined
      ? {}
      : { temperature: requireFiniteRange(record['temperature'], 'temperature', 0, 2) }),
    ...(record['maximumOutputTokens'] === undefined
      ? {}
      : {
          maximumOutputTokens: requirePositiveInteger(
            record['maximumOutputTokens'],
            'maximum output tokens',
          ),
        }),
    ...(record['thinkingBudget'] === undefined
      ? {}
      : { thinkingBudget: requireNonNegativeInteger(record['thinkingBudget'], 'thinking budget') }),
  };
}

export function parseAgentConfigurationPolicyProjection(
  value: unknown,
): AgentConfigurationPolicyProjection {
  const record = requireRecord(value, 'Agent configuration policy projection must be an object.');
  requireExactKeys(record, ['request', 'fields']);
  const fields = requireRecord(record['fields'], 'Agent configuration fields must be an object.');
  requireExactKeys(fields, [
    'model',
    'executionMode',
    'temperature',
    'maximumOutputTokens',
    'thinkingBudget',
  ]);
  const request =
    record['request'] === null ? null : parseAgentConfigurationRequest(record['request']);
  const model = parseConfigurationField(fields['model'], 'model', (fieldValue) => {
    if (fieldValue === null) return null;
    const binding = requireRecord(fieldValue, 'Agent model configuration value must be an object.');
    requireExactKeys(binding, ['modelCatalogEntryId', 'providerId', 'modelId']);
    return {
      modelCatalogEntryId: requireIdentity(binding['modelCatalogEntryId'], 'model catalog entry'),
      providerId: requireIdentity(binding['providerId'], 'provider'),
      modelId: requireIdentity(binding['modelId'], 'model'),
    };
  });
  const executionMode = parseConfigurationField(
    fields['executionMode'],
    'execution mode',
    (fieldValue) => {
      if (fieldValue === null) return null;
      if (fieldValue !== 'plan' && fieldValue !== 'ask' && fieldValue !== 'auto') {
        throw new Error(`Unknown Agent execution mode '${String(fieldValue)}'.`);
      }
      return fieldValue;
    },
  );
  return {
    request,
    fields: {
      model,
      executionMode,
      temperature: parseConfigurationField(fields['temperature'], 'temperature', (fieldValue) =>
        fieldValue === null ? null : requireFiniteRange(fieldValue, 'temperature', 0, 2),
      ),
      maximumOutputTokens: parseConfigurationField(
        fields['maximumOutputTokens'],
        'maximum output tokens',
        (fieldValue) =>
          fieldValue === null ? null : requirePositiveInteger(fieldValue, 'maximum output tokens'),
      ),
      thinkingBudget: parseConfigurationField(
        fields['thinkingBudget'],
        'thinking budget',
        (fieldValue) =>
          fieldValue === null ? null : requireNonNegativeInteger(fieldValue, 'thinking budget'),
      ),
    },
  };
}

export function parseAgentConversationConfiguration(
  value: unknown,
): AgentConversationConfiguration {
  const record = requireRecord(value, 'Agent Conversation configuration must be an object.');
  requireExactKeys(record, ['conversationId', 'request', 'projection']);
  const request = parseAgentConfigurationRequest(record['request']);
  const projection = parseAgentConfigurationPolicyProjection(record['projection']);
  assertProjectionRequest(projection, request);
  return {
    conversationId: requireIdentity(record['conversationId'], 'Conversation'),
    request,
    projection,
  };
}

export function parseAgentConversationTurnConfigurationSnapshot(
  value: unknown,
): AgentConversationTurnConfigurationSnapshot {
  const record = requireRecord(value, 'Agent Turn configuration snapshot must be an object.');
  requireExactKeys(record, ['conversationId', 'turnId', 'request', 'projection']);
  const request = parseAgentConfigurationRequest(record['request']);
  const projection = parseAgentConfigurationPolicyProjection(record['projection']);
  assertProjectionRequest(projection, request);
  return {
    conversationId: requireIdentity(record['conversationId'], 'Conversation'),
    turnId: requireIdentity(record['turnId'], 'Turn'),
    request,
    projection,
  };
}

function parseConfigurationField<T>(
  value: unknown,
  label: string,
  parseValue: (value: unknown) => T | null,
): AgentConfigurationFieldProjection<T> {
  const record = requireRecord(value, `Agent ${label} field projection must be an object.`);
  requireExactKeys(record, ['effectiveValue', 'source', 'policy']);
  const source = record['source'];
  if (
    source !== 'global-default' &&
    source !== 'draft-request' &&
    source !== 'conversation' &&
    source !== 'domain-policy' &&
    source !== 'provider-policy'
  ) {
    throw new Error(`Unknown Agent ${label} value source '${String(source)}'.`);
  }
  return {
    effectiveValue: parseValue(record['effectiveValue']),
    source,
    policy: parseConfigurationFieldPolicy(record['policy'], label),
  };
}

function parseConfigurationFieldPolicy(
  value: unknown,
  label: string,
): AgentConfigurationFieldPolicy {
  const record = requireRecord(value, `Agent ${label} field policy must be an object.`);
  const status = record['status'];
  if (status === 'editable') {
    requireExactKeys(record, ['status', 'owner']);
    return { status, owner: requireIdentity(record['owner'], `${label} policy owner`) };
  }
  if (status === 'locked' || status === 'unavailable') {
    requireExactKeys(record, ['status', 'owner', 'reason']);
    return {
      status,
      owner: requireIdentity(record['owner'], `${label} policy owner`),
      reason: requireIdentity(record['reason'], `${label} policy reason`),
    };
  }
  throw new Error(`Unknown Agent ${label} field policy '${String(status)}'.`);
}

function assertProjectionRequest(
  projection: AgentConfigurationPolicyProjection,
  request: AgentConfigurationRequest,
): void {
  if (JSON.stringify(projection.request) !== JSON.stringify(request)) {
    throw new Error('Agent configuration projection does not match its exact request.');
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent ${label} identity is required.`);
  }
  return value;
}

function requireIdentityArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Agent ${label} identities must be an array.`);
  const identities = value.map((entry) => requireIdentity(entry, label));
  if (new Set(identities).size !== identities.length) {
    throw new Error(`Agent ${label} identities must not contain duplicates.`);
  }
  return identities;
}

function requirePositiveIntegerOrNull(value: unknown, label: string): number | null {
  return value === null ? null : requirePositiveInteger(value, label);
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`Agent ${label} must be a positive integer.`);
  }
  return value as number;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Agent ${label} must be a non-negative integer.`);
  }
  return value as number;
}

function requireFiniteRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`Agent ${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  requireAllowedKeys(record, keys, keys);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): void {
  const unknown = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unknown) throw new Error(`Agent model contract contains unsupported field '${unknown}'.`);
  const missing = requiredKeys.find((key) => !(key in record));
  if (missing) throw new Error(`Agent model contract is missing field '${missing}'.`);
}
