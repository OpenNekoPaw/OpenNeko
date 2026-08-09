import {
  parseAgentConversationContext,
  type AgentConversationContext,
} from './agent-conversation-context';
import {
  parseCharacterConversationLaunchSelection,
  type CharacterConversationLaunchSelection,
} from '@neko/chara/contracts';

export interface AgentDraftSubmitInput {
  readonly target: AgentDraftSubmitTarget;
  readonly messageText: string;
  readonly resourceGrantIds: readonly string[];
  readonly configuration: {
    readonly providerId: string;
    readonly modelId: string;
    readonly executionMode: 'plan' | 'ask' | 'auto';
  };
}

export type AgentDraftSubmitTarget =
  | {
      readonly kind: 'automatic-assistant';
      readonly draftId: string;
    }
  | {
      readonly kind: 'bound-context';
      readonly draftId: string;
      readonly context: AgentConversationContext;
    }
  | {
      readonly kind: 'character-launch';
      readonly draftId: string;
      readonly selection: CharacterConversationLaunchSelection;
    };

export interface AgentDraftSubmitProjection {
  readonly conversationId: string;
  readonly turnId: string;
  readonly turnStatus: 'pending' | 'running' | 'completed' | 'failed';
  readonly diagnostic?: string;
}

export function parseAgentDraftSubmitInput(value: unknown): AgentDraftSubmitInput {
  const record = requireRecord(value, 'Agent draft submit input must be an object.');
  requireExactKeys(
    record,
    ['target', 'messageText', 'resourceGrantIds', 'configuration'],
    'Agent draft submit input',
  );
  const configuration = requireRecord(
    record['configuration'],
    'Agent draft submit configuration must be an object.',
  );
  requireExactKeys(
    configuration,
    ['providerId', 'modelId', 'executionMode'],
    'Agent draft submit configuration',
  );
  const executionMode = configuration['executionMode'];
  if (executionMode !== 'plan' && executionMode !== 'ask' && executionMode !== 'auto') {
    throw new Error(`Unknown Agent draft execution mode '${String(executionMode)}'.`);
  }
  return {
    target: parseTarget(record['target']),
    messageText: requireIdentity(record['messageText'], 'message'),
    resourceGrantIds: requireIdentityArray(record['resourceGrantIds'], 'Resource grant'),
    configuration: {
      providerId: requireIdentity(configuration['providerId'], 'Provider'),
      modelId: requireIdentity(configuration['modelId'], 'Model'),
      executionMode,
    },
  };
}

function parseTarget(value: unknown): AgentDraftSubmitTarget {
  const record = requireRecord(value, 'Agent draft submit target must be an object.');
  if (record['kind'] === 'automatic-assistant') {
    requireExactKeys(record, ['kind', 'draftId'], 'Automatic Assistant draft target');
    return {
      kind: 'automatic-assistant',
      draftId: requireIdentity(record['draftId'], 'Draft'),
    };
  }
  if (record['kind'] === 'bound-context') {
    requireExactKeys(record, ['kind', 'draftId', 'context'], 'Bound Agent draft target');
    return {
      kind: 'bound-context',
      draftId: requireIdentity(record['draftId'], 'Draft'),
      context: parseAgentConversationContext(record['context']),
    };
  }
  if (record['kind'] === 'character-launch') {
    requireExactKeys(record, ['kind', 'draftId', 'selection'], 'Character launch draft target');
    return {
      kind: 'character-launch',
      draftId: requireIdentity(record['draftId'], 'Draft'),
      selection: parseCharacterConversationLaunchSelection(record['selection']),
    };
  }
  throw new Error(`Unknown Agent draft submit target '${String(record['kind'])}'.`);
}

export function parseAgentDraftSubmitProjection(value: unknown): AgentDraftSubmitProjection {
  const record = requireRecord(value, 'Agent draft submit projection must be an object.');
  const allowed = ['conversationId', 'turnId', 'turnStatus', 'diagnostic'];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown)
    throw new Error(`Agent draft submit projection contains unknown field '${unknown}'.`);
  for (const required of ['conversationId', 'turnId', 'turnStatus']) {
    if (!(required in record)) {
      throw new Error(`Agent draft submit projection is missing field '${required}'.`);
    }
  }
  const turnStatus = record['turnStatus'];
  if (
    turnStatus !== 'pending' &&
    turnStatus !== 'running' &&
    turnStatus !== 'completed' &&
    turnStatus !== 'failed'
  ) {
    throw new Error(`Unknown Agent draft turn status '${String(turnStatus)}'.`);
  }
  const diagnostic = record['diagnostic'];
  if (
    diagnostic !== undefined &&
    (typeof diagnostic !== 'string' || diagnostic.trim().length === 0)
  ) {
    throw new Error('Agent draft submit diagnostic must be a non-empty string.');
  }
  return {
    conversationId: requireIdentity(record['conversationId'], 'Conversation'),
    turnId: requireIdentity(record['turnId'], 'Turn'),
    turnStatus,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unsupported fields.`);
  }
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent draft ${label} identity is required.`);
  }
  return value;
}

function requireIdentityArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Agent draft ${label} list must be an array.`);
  const identities = value.map((entry) => requireIdentity(entry, label));
  if (new Set(identities).size !== identities.length) {
    throw new Error(`Agent draft ${label} list must not contain duplicates.`);
  }
  return identities;
}
