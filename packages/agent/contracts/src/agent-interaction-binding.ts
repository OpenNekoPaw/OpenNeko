export type AgentInteractionPhase = 'draft' | 'session';
export type AgentBindingKind =
  'unbound' | 'assistant' | 'workspace' | 'character' | 'room' | 'world';

export type AgentDomainBinding =
  | { readonly kind: 'unbound' }
  | {
      readonly kind: 'assistant';
      readonly assistantSpaceId: string;
      readonly baseGrantIds: readonly string[];
    }
  | {
      readonly kind: 'workspace';
      readonly workspaceId: string;
      readonly workspaceGrantId: string;
    }
  | {
      readonly kind: 'character';
      readonly characterId: string;
      readonly characterVersionId: string;
      readonly characterRunId?: string;
      readonly roleProfileId?: string;
      readonly dialogueRunId?: string;
    }
  | {
      readonly kind: 'room';
      readonly roomId: string;
      readonly roomRunId: string;
    }
  | {
      readonly kind: 'world';
      readonly worldExperienceId: string;
      readonly worldExperienceVersionId: string;
      readonly worldRunId?: string;
      readonly participantId: string;
      readonly roleScopeId: string;
    };

export type AgentBoundDomainBinding = Exclude<AgentDomainBinding, { readonly kind: 'unbound' }>;

export interface AgentDraftBindingReceipt {
  readonly bindingReceiptId: string;
  readonly draftId: string;
  readonly connectionId: string;
  readonly binding: AgentBoundDomainBinding;
}

export interface AgentDraftInteractionProjection {
  readonly phase: 'draft';
  readonly draftId: string;
  readonly binding: AgentDomainBinding;
  readonly bindingReceipt: AgentDraftBindingReceipt | null;
}

export interface AgentSessionInteractionProjection {
  readonly phase: 'session';
  readonly conversationId: string;
  readonly binding: AgentBoundDomainBinding;
}

export type AgentInteractionProjection =
  AgentDraftInteractionProjection | AgentSessionInteractionProjection;

export function createAgentDraftInteraction(input: {
  readonly draftId: string;
  readonly binding: AgentDomainBinding;
  readonly bindingReceipt?: AgentDraftBindingReceipt | null;
}): AgentDraftInteractionProjection {
  return parseAgentDraftInteractionProjection({
    phase: 'draft',
    draftId: input.draftId,
    binding: input.binding,
    bindingReceipt: input.bindingReceipt ?? null,
  });
}

export function createAgentSessionInteraction(input: {
  readonly conversationId: string;
  readonly binding: AgentBoundDomainBinding;
}): AgentSessionInteractionProjection {
  return parseAgentSessionInteractionProjection({
    phase: 'session',
    conversationId: input.conversationId,
    binding: input.binding,
  });
}

export function parseAgentInteractionProjection(value: unknown): AgentInteractionProjection {
  const record = requireRecord(value, 'Agent interaction projection must be an object.');
  if (record['phase'] === 'draft') return parseAgentDraftInteractionProjection(record);
  if (record['phase'] === 'session') return parseAgentSessionInteractionProjection(record);
  throw new Error(`Unknown Agent interaction phase '${String(record['phase'])}'.`);
}

export function parseAgentDraftInteractionProjection(
  value: unknown,
): AgentDraftInteractionProjection {
  const record = requireRecord(value, 'Agent Draft projection must be an object.');
  requireExactKeys(record, ['phase', 'draftId', 'binding', 'bindingReceipt'], 'Agent Draft');
  if (record['phase'] !== 'draft') throw new Error("Agent Draft phase must be 'draft'.");
  const draftId = requireIdentity(record['draftId'], 'Draft');
  const binding = parseAgentDomainBinding(record['binding']);
  const bindingReceipt =
    record['bindingReceipt'] === null
      ? null
      : parseAgentDraftBindingReceipt(record['bindingReceipt']);
  if (binding.kind === 'unbound' && bindingReceipt !== null) {
    throw new Error('Unbound Agent Draft cannot carry a binding receipt.');
  }
  if (bindingReceipt !== null) {
    if (bindingReceipt.draftId !== draftId) {
      throw new Error('Agent Draft binding receipt belongs to another Draft.');
    }
    if (!sameAgentDomainBinding(bindingReceipt.binding, binding)) {
      throw new Error('Agent Draft binding receipt does not match its binding.');
    }
  }
  return { phase: 'draft', draftId, binding, bindingReceipt };
}

export function parseAgentSessionInteractionProjection(
  value: unknown,
): AgentSessionInteractionProjection {
  const record = requireRecord(value, 'Agent Session projection must be an object.');
  requireExactKeys(record, ['phase', 'conversationId', 'binding'], 'Agent Session');
  if (record['phase'] !== 'session') throw new Error("Agent Session phase must be 'session'.");
  const binding = parseAgentDomainBinding(record['binding']);
  if (binding.kind === 'unbound') throw new Error('Agent Session requires a bound domain binding.');
  if (binding.kind === 'character' && binding.characterRunId === undefined) {
    throw new Error('Character Agent Session requires an exact Character Run identity.');
  }
  if (binding.kind === 'room' && binding.roomRunId.length === 0) {
    throw new Error('Room Agent Session requires an exact Room Run identity.');
  }
  if (binding.kind === 'world' && binding.worldRunId === undefined) {
    throw new Error('World Agent Session requires an exact World Run identity.');
  }
  return {
    phase: 'session',
    conversationId: requireIdentity(record['conversationId'], 'Conversation'),
    binding,
  };
}

export function parseAgentDraftBindingReceipt(value: unknown): AgentDraftBindingReceipt {
  const record = requireRecord(value, 'Agent Draft binding receipt must be an object.');
  requireExactKeys(
    record,
    ['bindingReceiptId', 'draftId', 'connectionId', 'binding'],
    'Agent Draft binding receipt',
  );
  const binding = parseAgentDomainBinding(record['binding']);
  if (binding.kind === 'unbound') throw new Error('Agent Draft binding receipt must be bound.');
  return {
    bindingReceiptId: requireIdentity(record['bindingReceiptId'], 'binding receipt'),
    draftId: requireIdentity(record['draftId'], 'Draft'),
    connectionId: requireIdentity(record['connectionId'], 'launch connection'),
    binding,
  };
}

export function parseAgentDomainBinding(value: unknown): AgentDomainBinding {
  const record = requireRecord(value, 'Agent domain binding must be an object.');
  switch (record['kind']) {
    case 'unbound':
      requireExactKeys(record, ['kind'], 'Unbound Agent binding');
      return { kind: 'unbound' };
    case 'assistant':
      requireExactKeys(
        record,
        ['kind', 'assistantSpaceId', 'baseGrantIds'],
        'Assistant Agent binding',
      );
      return {
        kind: 'assistant',
        assistantSpaceId: requireIdentity(record['assistantSpaceId'], 'Assistant Space'),
        baseGrantIds: requireIdentityArray(record['baseGrantIds'], 'Assistant base grant'),
      };
    case 'workspace':
      requireExactKeys(
        record,
        ['kind', 'workspaceId', 'workspaceGrantId'],
        'Workspace Agent binding',
      );
      return {
        kind: 'workspace',
        workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
        workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
      };
    case 'character':
      requireAllowedKeys(
        record,
        [
          'kind',
          'characterId',
          'characterVersionId',
          'characterRunId',
          'roleProfileId',
          'dialogueRunId',
        ],
        ['kind', 'characterId', 'characterVersionId'],
        'Character Agent binding',
      );
      const character = {
        kind: 'character' as const,
        characterId: requireIdentity(record['characterId'], 'Character'),
        characterVersionId: requireIdentity(record['characterVersionId'], 'Character Version'),
        ...(record['characterRunId'] === undefined
          ? {}
          : { characterRunId: requireIdentity(record['characterRunId'], 'Character Run') }),
        ...(record['roleProfileId'] === undefined
          ? {}
          : { roleProfileId: requireIdentity(record['roleProfileId'], 'Character role profile') }),
        ...(record['dialogueRunId'] === undefined
          ? {}
          : { dialogueRunId: requireIdentity(record['dialogueRunId'], 'Dialogue Run') }),
      };
      if (character.roleProfileId === undefined && character.dialogueRunId === undefined) {
        throw new Error('Character Agent binding requires a role profile or Dialogue Run.');
      }
      return character;
    case 'room':
      requireExactKeys(record, ['kind', 'roomId', 'roomRunId'], 'Room Agent binding');
      return {
        kind: 'room',
        roomId: requireIdentity(record['roomId'], 'Room'),
        roomRunId: requireIdentity(record['roomRunId'], 'Room Run'),
      };
    case 'world':
      requireAllowedKeys(
        record,
        [
          'kind',
          'worldExperienceId',
          'worldExperienceVersionId',
          'worldRunId',
          'participantId',
          'roleScopeId',
        ],
        ['kind', 'worldExperienceId', 'worldExperienceVersionId', 'participantId', 'roleScopeId'],
        'World Agent binding',
      );
      return {
        kind: 'world',
        worldExperienceId: requireIdentity(record['worldExperienceId'], 'World Experience'),
        worldExperienceVersionId: requireIdentity(
          record['worldExperienceVersionId'],
          'World Experience Version',
        ),
        ...(record['worldRunId'] === undefined
          ? {}
          : { worldRunId: requireIdentity(record['worldRunId'], 'World Run') }),
        participantId: requireIdentity(record['participantId'], 'World participant'),
        roleScopeId: requireIdentity(record['roleScopeId'], 'World role scope'),
      };
    default:
      throw new Error(`Unknown Agent domain binding '${String(record['kind'])}'.`);
  }
}

export function parseAgentBoundDomainBinding(value: unknown): AgentBoundDomainBinding {
  const binding = parseAgentDomainBinding(value);
  if (binding.kind === 'unbound') {
    throw new Error('Agent Conversation requires a bound domain binding.');
  }
  return binding;
}

export function sameAgentDomainBinding(
  left: AgentDomainBinding,
  right: AgentDomainBinding,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
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

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[], label: string) {
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
