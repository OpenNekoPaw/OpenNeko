import {
  parseAgentDraftInteractionProjection,
  parseAgentSessionInteractionProjection,
  type AgentDraftInteractionProjection,
  type AgentSessionInteractionProjection,
} from './agent-interaction-binding';
import {
  parseAgentConfigurationRequest,
  type AgentConfigurationRequest,
} from './agent-model-catalog';
import {
  parseAgentFlatPurposeModelRefs,
  type AgentFlatPurposeModelRefs,
} from './agent-purpose-model';
import { parseAgentEntryTargetReceipt, type AgentEntryTargetReceipt } from './agent-entry-intent';
import {
  parseCanvasWorkspaceTurnContext,
  type CanvasWorkspaceTurnSummary,
  type CanvasWorkspaceTurnTarget,
} from '@neko/canvas-domain';

export type AgentDraftInputIntent =
  | { readonly kind: 'message'; readonly text: string }
  | {
      readonly kind: 'command';
      readonly catalogEntryId: string;
      readonly commandId: string;
      readonly handlerId: string;
      readonly args?: string;
    }
  | {
      readonly kind: 'skill';
      readonly catalogEntryId: string;
      readonly skillName: string;
      readonly activationId: string;
      readonly args?: string;
    };

export type AgentInputInvocationIntent = Exclude<
  AgentDraftInputIntent,
  { readonly kind: 'message' }
>;

export function parseAgentInputInvocationIntent(value: unknown): AgentInputInvocationIntent {
  const intent = parseAgentDraftInputIntent(value);
  if (intent.kind === 'message') {
    throw new Error('Agent input invocation cannot be an ordinary message.');
  }
  return intent;
}

export interface AgentInputReferenceReceipt {
  readonly catalogEntryId: string;
  readonly referenceId: string;
  readonly ownerKind: 'assistant' | 'workspace' | 'character' | 'room' | 'world';
  readonly ownerId: string;
  readonly bindingReceiptId?: string;
}

export interface AgentCanvasTurnIntent {
  readonly workspaceId: string;
  readonly target: CanvasWorkspaceTurnTarget;
  /** Light summary only; full Canvas content must be requested on demand. */
  readonly summary?: CanvasWorkspaceTurnSummary;
}

export interface AgentDraftSubmitInput {
  readonly draft: AgentDraftInteractionProjection;
  readonly entryTargetReceipt: AgentEntryTargetReceipt | null;
  readonly input: AgentDraftInputIntent;
  readonly references: readonly AgentInputReferenceReceipt[];
  readonly resourceGrantIds: readonly string[];
  readonly configuration: AgentConfigurationRequest;
  readonly purposeModels?: AgentFlatPurposeModelRefs;
  readonly canvasTurnTarget?: AgentCanvasTurnIntent;
}

export interface AgentDraftSubmitProjection {
  readonly session: AgentSessionInteractionProjection;
  readonly turnId: string;
  readonly turnStatus: 'pending' | 'running' | 'completed' | 'failed';
  readonly diagnostic?: string;
}

export function parseAgentDraftSubmitInput(value: unknown): AgentDraftSubmitInput {
  const record = requireRecord(value, 'Agent Draft submit input must be an object.');
  requireAllowedKeys(
    record,
    [
      'draft',
      'entryTargetReceipt',
      'input',
      'references',
      'resourceGrantIds',
      'configuration',
      'purposeModels',
      'canvasTurnTarget',
    ],
    ['draft', 'entryTargetReceipt', 'input', 'references', 'resourceGrantIds', 'configuration'],
    'Agent Draft submit input',
  );
  const draft = parseAgentDraftInteractionProjection(record['draft']);
  if (draft.binding.kind !== 'unbound' && draft.bindingReceipt === null) {
    throw new Error('Bound Agent Draft submit requires an exact binding receipt.');
  }
  return {
    draft,
    entryTargetReceipt:
      record['entryTargetReceipt'] === null
        ? null
        : parseAgentEntryTargetReceipt(record['entryTargetReceipt']),
    input: parseAgentDraftInputIntent(record['input']),
    references: parseReferenceReceipts(record['references']),
    resourceGrantIds: requireIdentityArray(record['resourceGrantIds'], 'Resource grant'),
    configuration: parseAgentConfigurationRequest(record['configuration']),
    ...(record['purposeModels'] === undefined
      ? {}
      : { purposeModels: parseAgentFlatPurposeModelRefs(record['purposeModels']) }),
    ...(record['canvasTurnTarget'] === undefined
      ? {}
      : { canvasTurnTarget: parseAgentCanvasTurnIntent(record['canvasTurnTarget']) }),
  };
}

export function parseAgentDraftInputIntent(value: unknown): AgentDraftInputIntent {
  const record = requireRecord(value, 'Agent Draft input intent must be an object.');
  if (record['kind'] === 'message') {
    requireExactKeys(record, ['kind', 'text'], 'Agent message input intent');
    return { kind: 'message', text: requireIdentity(record['text'], 'message') };
  }
  if (record['kind'] === 'command') {
    requireInvocationKeys(record, ['kind', 'catalogEntryId', 'commandId', 'handlerId']);
    return {
      kind: 'command',
      catalogEntryId: requireIdentity(record['catalogEntryId'], 'catalog entry'),
      commandId: requireIdentity(record['commandId'], 'command'),
      handlerId: requireIdentity(record['handlerId'], 'command handler'),
      ...parseOptionalArgs(record['args']),
    };
  }
  if (record['kind'] === 'skill') {
    requireInvocationKeys(record, ['kind', 'catalogEntryId', 'skillName', 'activationId']);
    return {
      kind: 'skill',
      catalogEntryId: requireIdentity(record['catalogEntryId'], 'catalog entry'),
      skillName: requireIdentity(record['skillName'], 'Skill'),
      activationId: requireIdentity(record['activationId'], 'Skill selection'),
      ...parseOptionalArgs(record['args']),
    };
  }
  throw new Error(`Unknown Agent Draft input intent '${String(record['kind'])}'.`);
}

export function parseAgentDraftSubmitProjection(value: unknown): AgentDraftSubmitProjection {
  const record = requireRecord(value, 'Agent Draft submit projection must be an object.');
  requireAllowedKeys(
    record,
    ['session', 'turnId', 'turnStatus', 'diagnostic'],
    ['session', 'turnId', 'turnStatus'],
    'Agent Draft submit projection',
  );
  const turnStatus = record['turnStatus'];
  if (
    turnStatus !== 'pending' &&
    turnStatus !== 'running' &&
    turnStatus !== 'completed' &&
    turnStatus !== 'failed'
  ) {
    throw new Error(`Unknown Agent Draft turn status '${String(turnStatus)}'.`);
  }
  const diagnostic = record['diagnostic'];
  if (
    diagnostic !== undefined &&
    (typeof diagnostic !== 'string' || diagnostic.trim().length === 0)
  ) {
    throw new Error('Agent Draft submit diagnostic must be a non-empty string.');
  }
  return {
    session: parseAgentSessionInteractionProjection(record['session']),
    turnId: requireIdentity(record['turnId'], 'Turn'),
    turnStatus,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

function parseReferenceReceipts(value: unknown): readonly AgentInputReferenceReceipt[] {
  if (!Array.isArray(value)) throw new Error('Agent input reference receipts must be an array.');
  const receipts = value.map(parseAgentInputReferenceReceipt);
  const duplicate = receipts.find(
    (receipt, index) =>
      receipts.findIndex((candidate) => candidate.referenceId === receipt.referenceId) !== index,
  );
  if (duplicate) throw new Error(`Duplicate Agent reference receipt '${duplicate.referenceId}'.`);
  return receipts;
}

export function parseAgentInputReferenceReceipt(value: unknown): AgentInputReferenceReceipt {
  const record = requireRecord(value, 'Agent input reference receipt must be an object.');
  requireAllowedKeys(
    record,
    ['catalogEntryId', 'referenceId', 'ownerKind', 'ownerId', 'bindingReceiptId'],
    ['catalogEntryId', 'referenceId', 'ownerKind', 'ownerId'],
    'Agent input reference receipt',
  );
  const ownerKind = parseReferenceOwnerKind(record['ownerKind']);
  return {
    catalogEntryId: requireIdentity(record['catalogEntryId'], 'catalog entry'),
    referenceId: requireIdentity(record['referenceId'], 'reference'),
    ownerKind,
    ownerId: requireIdentity(record['ownerId'], 'reference owner'),
    ...(record['bindingReceiptId'] === undefined
      ? {}
      : { bindingReceiptId: requireIdentity(record['bindingReceiptId'], 'binding receipt') }),
  };
}

function parseReferenceOwnerKind(value: unknown): AgentInputReferenceReceipt['ownerKind'] {
  if (
    value !== 'assistant' &&
    value !== 'workspace' &&
    value !== 'character' &&
    value !== 'room' &&
    value !== 'world'
  ) {
    throw new Error(`Unknown Agent reference owner '${String(value)}'.`);
  }
  return value;
}

export function parseAgentCanvasTurnIntent(value: unknown): AgentCanvasTurnIntent {
  const record = requireRecord(value, 'Agent Canvas turn intent must be an object.');
  requireAllowedKeys(
    record,
    ['workspaceId', 'target', 'summary'],
    ['workspaceId', 'target'],
    'Agent Canvas turn intent',
  );
  const workspaceId = requireIdentity(record['workspaceId'], 'Workspace');
  const context = parseCanvasWorkspaceTurnContext({
    target: record['target'],
    ...(record['summary'] === undefined ? {} : { summary: record['summary'] }),
  });
  if (context.target.workspaceId !== workspaceId) {
    throw new Error('Agent Canvas turn intent Workspace does not match its target.');
  }
  return Object.freeze({
    workspaceId,
    target: context.target,
    ...(context.summary === undefined ? {} : { summary: context.summary }),
  });
}

function requireInvocationKeys(record: Record<string, unknown>, required: readonly string[]): void {
  requireAllowedKeys(record, [...required, 'args'], required, 'Agent invocation input intent');
}

function parseOptionalArgs(value: unknown): { readonly args?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'string') throw new Error('Agent invocation args must be a string.');
  return value.length === 0 ? {} : { args: value };
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
  requireAllowedKeys(record, keys, keys, label);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(record).find((key) => !allowedKeys.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field '${unknown}'.`);
  const missing = requiredKeys.find((key) => !(key in record));
  if (missing) throw new Error(`${label} is missing field '${missing}'.`);
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Agent Draft ${label} identity is required.`);
  }
  return value;
}

function requireIdentityArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} identities must be an array.`);
  const identities = value.map((entry) => requireIdentity(entry, label));
  if (new Set(identities).size !== identities.length) {
    throw new Error(`${label} identities must not contain duplicates.`);
  }
  return identities;
}
