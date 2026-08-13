export const AGENT_ENTRY_MODES = [
  'assistant',
  'authoring',
  'character-dialogue',
  'world-experience',
] as const;

export type AgentEntryMode = (typeof AGENT_ENTRY_MODES)[number];

export type AgentAuthoringTargetRef =
  | { readonly kind: 'content-project'; readonly contentProjectId: string }
  | { readonly kind: 'character-project'; readonly characterProjectId: string }
  | { readonly kind: 'world-project'; readonly worldProjectId: string };

export type AgentAuthoringAuthority =
  | { readonly kind: 'content-project'; readonly contentProjectId: string }
  | { readonly kind: 'standalone-library'; readonly library: 'character' | 'world' };

export interface AgentAuthoringBinding {
  readonly kind: 'authoring';
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly authority: AgentAuthoringAuthority;
  readonly target: AgentAuthoringTargetRef;
}

export const AGENT_AUTHORING_BINDING_METADATA_KEY = 'agentAuthoringBinding';

export function readAgentAuthoringBindingMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): AgentAuthoringBinding {
  if (metadata === undefined || !(AGENT_AUTHORING_BINDING_METADATA_KEY in metadata)) {
    throw new Error('Agent authoring Tool execution is missing its exact target binding.');
  }
  const binding = parseAgentEntryTargetBinding(metadata[AGENT_AUTHORING_BINDING_METADATA_KEY]);
  if (binding.kind !== 'authoring') {
    throw new Error('Agent authoring Tool execution received a non-authoring target binding.');
  }
  return binding;
}

export interface AgentCompanionCharacterDialogueParticipant {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly roleProfileId?: string;
}

export interface AgentNarrativeStorylineNodeSelection {
  readonly characterStorylineId: string;
  readonly characterStorylineVersionId: string;
  readonly storylineNodeId: string;
}

export interface AgentNarrativeCharacterDialogueParticipant {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly storyline?: AgentNarrativeStorylineNodeSelection;
  readonly roleProfileId?: string;
}

export type AgentCharacterDialogueParticipant =
  AgentCompanionCharacterDialogueParticipant | AgentNarrativeCharacterDialogueParticipant;

export interface AgentCharacterDialogueStorylineOption {
  readonly storylineVersionId: string;
  readonly label: string;
}

export interface AgentCharacterDialogueLineageSegment {
  readonly characterVersionId: string;
  readonly label: string;
}

export type AgentCharacterDialogueLineage =
  | {
      readonly coverage: 'complete';
      readonly state: 'declared-root' | 'linked' | 'unlinked';
      readonly isHead: boolean;
      readonly path: readonly AgentCharacterDialogueLineageSegment[];
    }
  | {
      readonly coverage: 'unavailable';
      readonly message: string;
    };

export interface AgentCharacterDialogueTargetOption {
  readonly characterProjectId: string;
  readonly characterVersionId: string;
  readonly displayName: string;
  readonly versionLabel: string;
  readonly lineage: AgentCharacterDialogueLineage;
  readonly storylines: readonly AgentCharacterDialogueStorylineOption[];
}

export type AgentCharacterDialogueLaunchBinding =
  | {
      readonly kind: 'character-dialogue';
      readonly mode: 'companion';
      readonly participants: readonly AgentCompanionCharacterDialogueParticipant[];
    }
  | {
      readonly kind: 'character-dialogue';
      readonly mode: 'narrative';
      readonly participants: readonly AgentNarrativeCharacterDialogueParticipant[];
    };

export type AgentWorldExperienceLaunch =
  | {
      readonly kind: 'new';
      readonly participantId: string;
      readonly roleScopeId: string;
    }
  | {
      readonly kind: 'continue';
      readonly worldRunId: string;
      readonly worldSaveId: string;
      readonly branchId?: string;
    };

export interface AgentWorldExperienceLaunchBinding {
  readonly kind: 'world-experience';
  readonly worldExperienceId: string;
  readonly worldExperienceVersionId: string;
  readonly launch: AgentWorldExperienceLaunch;
}

export type AgentEntryTargetBinding =
  AgentAuthoringBinding | AgentCharacterDialogueLaunchBinding | AgentWorldExperienceLaunchBinding;

export interface AgentEntryTargetReceipt {
  readonly targetReceiptId: string;
  readonly draftId: string;
  readonly connectionId: string;
  readonly mode: AgentEntryMode;
  readonly binding: AgentEntryTargetBinding;
}

export interface AgentEntryIntentProjection {
  readonly mode: AgentEntryMode;
  readonly targetReceipt: AgentEntryTargetReceipt | null;
}

export function isAgentEntryMode(value: unknown): value is AgentEntryMode {
  return AGENT_ENTRY_MODES.some((mode) => mode === value);
}

export function parseAgentEntryIntentProjection(value: unknown): AgentEntryIntentProjection {
  const record = requireRecord(value, 'Agent Entry intent');
  requireExactKeys(record, ['mode', 'targetReceipt'], 'Agent Entry intent');
  const mode = parseAgentEntryMode(record['mode']);
  const targetReceipt =
    record['targetReceipt'] === null ? null : parseAgentEntryTargetReceipt(record['targetReceipt']);
  if (targetReceipt !== null && targetReceipt.mode !== mode) {
    throw new Error('Agent Entry target receipt does not match the selected mode.');
  }
  return { mode, targetReceipt };
}

export function parseAgentEntryTargetReceipt(value: unknown): AgentEntryTargetReceipt {
  const record = requireRecord(value, 'Agent Entry target receipt');
  requireExactKeys(
    record,
    ['targetReceiptId', 'draftId', 'connectionId', 'mode', 'binding'],
    'Agent Entry target receipt',
  );
  const mode = parseAgentEntryMode(record['mode']);
  const binding = parseAgentEntryTargetBinding(record['binding']);
  if (!entryModeAcceptsTargetBinding(mode, binding)) {
    throw new Error('Agent Entry target receipt binding does not match its mode.');
  }
  return {
    targetReceiptId: requireIdentity(record['targetReceiptId'], 'target receipt'),
    draftId: requireIdentity(record['draftId'], 'Draft'),
    connectionId: requireIdentity(record['connectionId'], 'connection'),
    mode,
    binding,
  };
}

export function sameAgentEntryTargetReceipt(
  left: AgentEntryTargetReceipt | null,
  right: AgentEntryTargetReceipt | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.targetReceiptId === right.targetReceiptId &&
    left.draftId === right.draftId &&
    left.connectionId === right.connectionId &&
    left.mode === right.mode &&
    JSON.stringify(left.binding) === JSON.stringify(right.binding)
  );
}

export function parseAgentEntryTargetBinding(value: unknown): AgentEntryTargetBinding {
  const record = requireRecord(value, 'Agent Entry target binding');
  switch (record['kind']) {
    case 'authoring':
      requireExactKeys(
        record,
        ['kind', 'workspaceId', 'workspaceGrantId', 'authority', 'target'],
        'Agent authoring binding',
      );
      const authority = parseAgentAuthoringAuthority(record['authority']);
      const target = parseAgentAuthoringTargetRef(record['target']);
      requireCompatibleAuthoringAuthority(authority, target);
      return {
        kind: 'authoring',
        workspaceId: requireIdentity(record['workspaceId'], 'Workspace'),
        workspaceGrantId: requireIdentity(record['workspaceGrantId'], 'Workspace grant'),
        authority,
        target,
      };
    case 'character-dialogue': {
      requireExactKeys(
        record,
        ['kind', 'mode', 'participants'],
        'Agent Character Dialogue binding',
      );
      const mode = parseCharacterConversationMode(record['mode']);
      if (!Array.isArray(record['participants']) || record['participants'].length === 0) {
        throw new Error('Agent Character Dialogue requires at least one participant.');
      }
      if (mode === 'companion') {
        const participants = record['participants'].map(parseCompanionCharacterParticipant);
        requireUniqueCharacterVersions(participants);
        return { kind: 'character-dialogue', mode, participants };
      }
      const participants = record['participants'].map(parseNarrativeCharacterParticipant);
      requireUniqueCharacterVersions(participants);
      return { kind: 'character-dialogue', mode, participants };
    }
    case 'world-experience':
      requireExactKeys(
        record,
        ['kind', 'worldExperienceId', 'worldExperienceVersionId', 'launch'],
        'Agent World Experience binding',
      );
      return {
        kind: 'world-experience',
        worldExperienceId: requireIdentity(record['worldExperienceId'], 'World Experience'),
        worldExperienceVersionId: requireIdentity(
          record['worldExperienceVersionId'],
          'World Experience Version',
        ),
        launch: parseWorldLaunch(record['launch']),
      };
    default:
      throw new Error(`Unknown Agent Entry target binding '${String(record['kind'])}'.`);
  }
}

export function entryModeAcceptsTargetBinding(
  mode: AgentEntryMode,
  binding: AgentEntryTargetBinding,
): boolean {
  return mode === 'assistant' ? binding.kind === 'authoring' : binding.kind === mode;
}

export function parseAgentCharacterDialogueTargetOptions(
  value: unknown,
): readonly AgentCharacterDialogueTargetOption[] {
  if (!Array.isArray(value)) {
    throw new Error('Agent Character Dialogue target options must be an array.');
  }
  const options = value.map((item) => {
    const record = requireRecord(item, 'Agent Character Dialogue target option');
    requireExactKeys(
      record,
      [
        'characterProjectId',
        'characterVersionId',
        'displayName',
        'versionLabel',
        'lineage',
        'storylines',
      ],
      'Agent Character Dialogue target option',
    );
    if (!Array.isArray(record['storylines'])) {
      throw new Error('Agent Character Dialogue storyline options must be an array.');
    }
    const storylines = record['storylines'].map((storylineValue) => {
      const storyline = requireRecord(storylineValue, 'Agent Character Dialogue storyline option');
      requireExactKeys(
        storyline,
        ['storylineVersionId', 'label'],
        'Agent Character Dialogue storyline option',
      );
      return {
        storylineVersionId: requireIdentity(storyline['storylineVersionId'], 'Storyline Version'),
        label: requireIdentity(storyline['label'], 'storyline label'),
      };
    });
    if (
      new Set(storylines.map((storyline) => storyline.storylineVersionId)).size !==
      storylines.length
    ) {
      throw new Error('Agent Character Dialogue storyline options must use unique versions.');
    }
    return {
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
      characterVersionId: requireIdentity(record['characterVersionId'], 'CharacterVersion'),
      displayName: requireIdentity(record['displayName'], 'Character display name'),
      versionLabel: requireIdentity(record['versionLabel'], 'Character version label'),
      lineage: parseAgentCharacterDialogueLineage(record['lineage']),
      storylines,
    };
  });
  if (new Set(options.map((option) => option.characterVersionId)).size !== options.length) {
    throw new Error('Agent Character Dialogue target options must use unique CharacterVersions.');
  }
  return options;
}

function parseAgentCharacterDialogueLineage(value: unknown): AgentCharacterDialogueLineage {
  const record = requireRecord(value, 'Agent Character Dialogue lineage');
  if (record['coverage'] === 'unavailable') {
    requireExactKeys(
      record,
      ['coverage', 'message'],
      'Unavailable Agent Character Dialogue lineage',
    );
    return {
      coverage: 'unavailable',
      message: requireIdentity(record['message'], 'Character lineage diagnostic'),
    };
  }
  requireExactKeys(
    record,
    ['coverage', 'state', 'isHead', 'path'],
    'Complete Agent Character Dialogue lineage',
  );
  if (record['coverage'] !== 'complete') {
    throw new Error(`Unknown Agent Character Dialogue lineage '${String(record['coverage'])}'.`);
  }
  if (
    record['state'] !== 'declared-root' &&
    record['state'] !== 'linked' &&
    record['state'] !== 'unlinked'
  ) {
    throw new Error(`Unknown Agent Character Dialogue lineage state '${String(record['state'])}'.`);
  }
  if (typeof record['isHead'] !== 'boolean') {
    throw new Error('Agent Character Dialogue lineage head state must be boolean.');
  }
  if (!Array.isArray(record['path'])) {
    throw new Error('Agent Character Dialogue lineage path must be an array.');
  }
  const path = record['path'].map((value) => {
    const segment = requireRecord(value, 'Agent Character Dialogue lineage path segment');
    requireExactKeys(
      segment,
      ['characterVersionId', 'label'],
      'Agent Character Dialogue lineage path segment',
    );
    return {
      characterVersionId: requireIdentity(
        segment['characterVersionId'],
        'Character lineage path version',
      ),
      label: requireIdentity(segment['label'], 'Character lineage path label'),
    };
  });
  if (
    path.length === 0 ||
    new Set(path.map((segment) => segment.characterVersionId)).size !== path.length
  ) {
    throw new Error('Agent Character Dialogue lineage path must be non-empty and unique.');
  }
  return {
    coverage: 'complete',
    state: record['state'],
    isHead: record['isHead'],
    path,
  };
}

function parseAgentEntryMode(value: unknown): AgentEntryMode {
  if (!isAgentEntryMode(value)) {
    throw new Error(`Unknown Agent Entry mode '${String(value)}'.`);
  }
  return value;
}

export function parseAgentAuthoringTargetRef(value: unknown): AgentAuthoringTargetRef {
  const record = requireRecord(value, 'Agent authoring target');
  if (record['kind'] === 'content-project') {
    requireExactKeys(record, ['kind', 'contentProjectId'], 'Content authoring target');
    return {
      kind: 'content-project',
      contentProjectId: requireIdentity(record['contentProjectId'], 'Content Project'),
    };
  }
  if (record['kind'] === 'character-project') {
    requireExactKeys(record, ['kind', 'characterProjectId'], 'Character authoring target');
    return {
      kind: 'character-project',
      characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    };
  }
  if (record['kind'] === 'world-project') {
    requireExactKeys(record, ['kind', 'worldProjectId'], 'World authoring target');
    return {
      kind: 'world-project',
      worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject'),
    };
  }
  throw new Error(`Unknown Agent authoring target '${String(record['kind'])}'.`);
}

export function parseAgentAuthoringAuthority(value: unknown): AgentAuthoringAuthority {
  const record = requireRecord(value, 'Agent authoring authority');
  if (record['kind'] === 'content-project') {
    requireExactKeys(record, ['kind', 'contentProjectId'], 'Content Project authoring authority');
    return {
      kind: 'content-project',
      contentProjectId: requireIdentity(record['contentProjectId'], 'Content Project'),
    };
  }
  if (record['kind'] === 'standalone-library') {
    requireExactKeys(record, ['kind', 'library'], 'Standalone authoring authority');
    if (record['library'] !== 'character' && record['library'] !== 'world') {
      throw new Error(`Unknown standalone authoring library '${String(record['library'])}'.`);
    }
    return { kind: 'standalone-library', library: record['library'] };
  }
  throw new Error(`Unknown Agent authoring authority '${String(record['kind'])}'.`);
}

function requireCompatibleAuthoringAuthority(
  authority: AgentAuthoringAuthority,
  target: AgentAuthoringTargetRef,
): void {
  if (target.kind === 'content-project') {
    if (
      authority.kind !== 'content-project' ||
      authority.contentProjectId !== target.contentProjectId
    ) {
      throw new Error('Content Project target requires its exact Content Project authority.');
    }
    return;
  }
  if (authority.kind === 'standalone-library') {
    const expectedLibrary = target.kind === 'character-project' ? 'character' : 'world';
    if (authority.library !== expectedLibrary) {
      throw new Error(
        `Agent authoring target does not belong to the '${authority.library}' library.`,
      );
    }
  }
}

function parseCharacterConversationMode(value: unknown): 'companion' | 'narrative' {
  if (value !== 'companion' && value !== 'narrative') {
    throw new Error(`Unknown Character Conversation mode '${String(value)}'.`);
  }
  return value;
}

function requireUniqueCharacterVersions(
  participants: readonly AgentCharacterDialogueParticipant[],
): void {
  const versionIds = participants.map((participant) => participant.characterVersionId);
  if (new Set(versionIds).size !== versionIds.length) {
    throw new Error('Agent Character Dialogue participants must use unique CharacterVersions.');
  }
  const projectIds = participants.map((participant) => participant.characterProjectId);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new Error(
      'Agent Character Dialogue participants must select at most one version of each Character.',
    );
  }
}

function parseCompanionCharacterParticipant(
  value: unknown,
): AgentCompanionCharacterDialogueParticipant {
  const record = requireRecord(value, 'Agent Character Dialogue participant');
  requireAllowedKeys(
    record,
    ['characterProjectId', 'characterVersionId', 'roleProfileId'],
    ['characterProjectId', 'characterVersionId'],
    'Agent Character Dialogue participant',
  );
  return {
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    characterVersionId: requireIdentity(record['characterVersionId'], 'CharacterVersion'),
    ...(record['roleProfileId'] === undefined
      ? {}
      : { roleProfileId: requireIdentity(record['roleProfileId'], 'role profile') }),
  };
}

function parseNarrativeCharacterParticipant(
  value: unknown,
): AgentNarrativeCharacterDialogueParticipant {
  const record = requireRecord(value, 'Agent Narrative Character participant');
  requireAllowedKeys(
    record,
    ['characterProjectId', 'characterVersionId', 'storyline', 'roleProfileId'],
    ['characterProjectId', 'characterVersionId'],
    'Agent Narrative Character participant',
  );
  return {
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    characterVersionId: requireIdentity(record['characterVersionId'], 'CharacterVersion'),
    ...(record['storyline'] === undefined
      ? {}
      : { storyline: parseNarrativeStorylineNodeSelection(record['storyline']) }),
    ...(record['roleProfileId'] === undefined
      ? {}
      : { roleProfileId: requireIdentity(record['roleProfileId'], 'role profile') }),
  };
}

function parseNarrativeStorylineNodeSelection(
  value: unknown,
): AgentNarrativeStorylineNodeSelection {
  const record = requireRecord(value, 'Agent Narrative Storyline node selection');
  requireExactKeys(
    record,
    ['characterStorylineId', 'characterStorylineVersionId', 'storylineNodeId'],
    'Agent Narrative Storyline node selection',
  );
  return {
    characterStorylineId: requireIdentity(record['characterStorylineId'], 'Character Storyline'),
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'Character Storyline Version',
    ),
    storylineNodeId: requireIdentity(record['storylineNodeId'], 'Storyline Node'),
  };
}

function parseWorldLaunch(value: unknown): AgentWorldExperienceLaunch {
  const record = requireRecord(value, 'Agent World Experience launch');
  if (record['kind'] === 'new') {
    requireExactKeys(record, ['kind', 'participantId', 'roleScopeId'], 'New World launch');
    return {
      kind: 'new',
      participantId: requireIdentity(record['participantId'], 'World participant'),
      roleScopeId: requireIdentity(record['roleScopeId'], 'World role scope'),
    };
  }
  if (record['kind'] === 'continue') {
    requireAllowedKeys(
      record,
      ['kind', 'worldRunId', 'worldSaveId', 'branchId'],
      ['kind', 'worldRunId', 'worldSaveId'],
      'Continue World launch',
    );
    return {
      kind: 'continue',
      worldRunId: requireIdentity(record['worldRunId'], 'World Run'),
      worldSaveId: requireIdentity(record['worldSaveId'], 'World Save'),
      ...(record['branchId'] === undefined
        ? {}
        : { branchId: requireIdentity(record['branchId'], 'World branch') }),
    };
  }
  throw new Error(`Unknown World Experience launch '${String(record['kind'])}'.`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}

function requireExactKeys(record: Record<string, unknown>, keys: readonly string[], label: string) {
  requireAllowedKeys(record, keys, keys, label);
}

function requireAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} contains unsupported field '${unknown}'.`);
  const missing = required.find((key) => !(key in record));
  if (missing) throw new Error(`${label} is missing field '${missing}'.`);
}
