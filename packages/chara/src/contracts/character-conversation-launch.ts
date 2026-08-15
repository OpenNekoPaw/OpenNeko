import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';

export interface CharacterConversationLaunchStorylineOption {
  readonly characterStorylineVersionId: string;
  readonly label: string;
}

export interface CharacterConversationLaunchLineageSegment {
  readonly characterVersionId: string;
  readonly label: string;
}

export type CharacterConversationLaunchLineage =
  | {
      readonly coverage: 'complete';
      readonly state: 'declared-root' | 'linked' | 'unlinked';
      readonly isHead: boolean;
      readonly path: readonly CharacterConversationLaunchLineageSegment[];
    }
  | {
      readonly coverage: 'unavailable';
      readonly message: string;
    };

export interface CharacterConversationLaunchTarget {
  readonly globalCharacterId: string;
  readonly characterVersionId: string;
  readonly displayName: string;
  readonly versionLabel: string;
  readonly lineage: CharacterConversationLaunchLineage;
  readonly storylines: readonly CharacterConversationLaunchStorylineOption[];
}

export interface CharacterConversationLaunchCatalogDiagnostic {
  readonly characterVersionId: string;
  readonly message: string;
}

export interface CharacterConversationLaunchCatalog {
  readonly targets: readonly CharacterConversationLaunchTarget[];
  readonly diagnostics: readonly CharacterConversationLaunchCatalogDiagnostic[];
}

export interface CompanionCharacterLaunchParticipantSelection {
  readonly characterVersionId: string;
  readonly roleProfileId?: string;
}

export interface NarrativeStorylineNodeSelection {
  readonly characterStorylineId: string;
  readonly characterStorylineVersionId: string;
  readonly storylineNodeId: string;
}

export interface NarrativeCharacterLaunchParticipantSelection {
  readonly characterVersionId: string;
  readonly storyline?: NarrativeStorylineNodeSelection;
  readonly roleProfileId?: string;
}

export type CharacterLaunchParticipantSelection =
  CompanionCharacterLaunchParticipantSelection | NarrativeCharacterLaunchParticipantSelection;

export type CharacterConversationLaunchSelection =
  | {
      readonly mode: 'companion';
      readonly characters: readonly CompanionCharacterLaunchParticipantSelection[];
    }
  | {
      readonly mode: 'narrative';
      readonly characters: readonly NarrativeCharacterLaunchParticipantSelection[];
    };

export interface CharacterConversationLaunchInput {
  readonly requestId: string;
  readonly userId: string;
  readonly userDisplayName: string;
  readonly selection: CharacterConversationLaunchSelection;
}

export function parseCharacterConversationLaunchCatalog(
  value: unknown,
): CharacterConversationLaunchCatalog {
  const record = requireExactRecord(
    value,
    ['targets', 'diagnostics'],
    'Character conversation launch catalog',
  );
  const targets = requireUniqueIdentities(
    requireArray(
      record['targets'],
      parseCharacterConversationLaunchTarget,
      'Character conversation launch targets',
    ),
    (target) => target.characterVersionId,
    'Character conversation launch targets',
  );
  const diagnostics = requireUniqueIdentities(
    requireArray(
      record['diagnostics'],
      (item) => {
        const diagnostic = requireExactRecord(
          item,
          ['characterVersionId', 'message'],
          'Character conversation launch catalog diagnostic',
        );
        return {
          characterVersionId: requireIdentity(
            diagnostic['characterVersionId'],
            'Character conversation launch diagnostic CharacterVersion',
          ),
          message: requireIdentity(
            diagnostic['message'],
            'Character conversation launch diagnostic message',
          ),
        };
      },
      'Character conversation launch catalog diagnostics',
    ),
    (diagnostic) => diagnostic.characterVersionId,
    'Character conversation launch catalog diagnostics',
  );
  return { targets, diagnostics };
}

function parseCharacterConversationLaunchTarget(value: unknown): CharacterConversationLaunchTarget {
  const record = requireExactRecord(
    value,
    [
      'globalCharacterId',
      'characterVersionId',
      'displayName',
      'versionLabel',
      'lineage',
      'storylines',
    ],
    'Character conversation launch target',
  );
  return {
    globalCharacterId: requireIdentity(
      record['globalCharacterId'],
      'Character conversation launch GlobalCharacter',
    ),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Character conversation launch CharacterVersion',
    ),
    displayName: requireIdentity(
      record['displayName'],
      'Character conversation launch display name',
    ),
    versionLabel: requireIdentity(
      record['versionLabel'],
      'Character conversation launch version label',
    ),
    lineage: parseCharacterConversationLaunchLineage(record['lineage']),
    storylines: requireUniqueIdentities(
      requireArray(
        record['storylines'],
        (item) => {
          const storyline = requireExactRecord(
            item,
            ['characterStorylineVersionId', 'label'],
            'Character conversation launch storyline option',
          );
          return {
            characterStorylineVersionId: requireIdentity(
              storyline['characterStorylineVersionId'],
              'Character conversation launch StorylineVersion',
            ),
            label: requireIdentity(
              storyline['label'],
              'Character conversation launch storyline label',
            ),
          };
        },
        'Character conversation launch storylines',
      ),
      (storyline) => storyline.characterStorylineVersionId,
      'Character conversation launch storylines',
    ),
  };
}

function parseCharacterConversationLaunchLineage(
  value: unknown,
): CharacterConversationLaunchLineage {
  const record = requireExactRecord(
    value,
    value !== null && typeof value === 'object' && Reflect.get(value, 'coverage') === 'complete'
      ? ['coverage', 'state', 'isHead', 'path']
      : ['coverage', 'message'],
    'Character conversation launch lineage',
  );
  if (record['coverage'] === 'unavailable') {
    return {
      coverage: 'unavailable',
      message: requireIdentity(record['message'], 'Character launch lineage diagnostic'),
    };
  }
  if (record['coverage'] !== 'complete') {
    throw new Error(`Unknown Character launch lineage coverage '${String(record['coverage'])}'.`);
  }
  const state = requireOneOf(
    record['state'],
    ['declared-root', 'linked', 'unlinked'] as const,
    'Character launch lineage state',
  );
  const path = requireUniqueIdentities(
    requireArray(
      record['path'],
      (item) => {
        const segment = requireExactRecord(
          item,
          ['characterVersionId', 'label'],
          'Character launch lineage path segment',
        );
        return {
          characterVersionId: requireIdentity(
            segment['characterVersionId'],
            'Character launch lineage path CharacterVersion',
          ),
          label: requireIdentity(segment['label'], 'Character launch lineage path label'),
        };
      },
      'Character launch lineage path',
    ),
    (segment) => segment.characterVersionId,
    'Character launch lineage path',
  );
  if (path.length === 0) {
    throw new Error('Character launch lineage path must contain the selected CharacterVersion.');
  }
  return {
    coverage: 'complete',
    state,
    isHead: requireBooleanValue(record['isHead'], 'Character launch lineage head state'),
    path,
  };
}

function requireBooleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

export type CharacterConversationLaunchResult =
  | {
      readonly topology: 'dialogue';
      readonly mode: 'companion' | 'narrative';
      readonly characterProjectId: string;
      readonly characterVersionId: string;
      readonly characterRunId: string;
      readonly dialogueRunId: string;
      readonly primaryAgentSessionId: string;
    }
  | {
      readonly topology: 'chatroom';
      readonly mode: 'companion' | 'narrative';
      readonly characterRoomId: string;
      readonly roomRunId: string;
      readonly interactionAgentSessionId: string;
      readonly participants: readonly {
        readonly participantId: string;
        readonly characterVersionId: string;
        readonly characterRunId: string;
        readonly primaryAgentSessionId: string;
      }[];
    };

export function parseCharacterConversationLaunchSelection(
  value: unknown,
): CharacterConversationLaunchSelection {
  const record = requireExactRecord(
    value,
    ['mode', 'characters'],
    'Character conversation launch selection',
  );
  const mode = requireOneOf(
    record['mode'],
    ['companion', 'narrative'] as const,
    'Character conversation launch mode',
  );
  if (mode === 'companion') {
    const characters = parseLaunchCharacters(
      record['characters'],
      parseCompanionCharacterLaunchParticipantSelection,
    );
    return { mode, characters };
  }
  const characters = parseLaunchCharacters(
    record['characters'],
    parseNarrativeCharacterLaunchParticipantSelection,
  );
  return { mode, characters };
}

function parseLaunchCharacters<T extends CharacterLaunchParticipantSelection>(
  value: unknown,
  parser: (item: unknown) => T,
): readonly T[] {
  const characters = requireUniqueIdentities(
    requireArray(value, parser, 'Character conversation launch characters'),
    (character) => character.characterVersionId,
    'Character conversation launch characters',
  );
  if (characters.length === 0) {
    throw new Error('Character conversation launch requires at least one CharacterVersion.');
  }
  if (characters.length > 1 && characters.some((character) => character.roleProfileId)) {
    throw new Error(
      'Character Room launch does not support participant role profiles without exact Room authority.',
    );
  }
  return characters;
}

export function parseCharacterConversationLaunchInput(
  value: unknown,
): CharacterConversationLaunchInput {
  const record = requireExactRecord(
    value,
    ['requestId', 'userId', 'userDisplayName', 'selection'],
    'Character conversation launch input',
  );
  return {
    requestId: requireIdentity(record['requestId'], 'Character launch requestId'),
    userId: requireIdentity(record['userId'], 'Character launch userId'),
    userDisplayName: requireIdentity(record['userDisplayName'], 'Character launch userDisplayName'),
    selection: parseCharacterConversationLaunchSelection(record['selection']),
  };
}

export function parseCharacterConversationLaunchResult(
  value: unknown,
): CharacterConversationLaunchResult {
  const record = requireExactRecord(
    value,
    recordKeysForLaunchResult(value),
    'Character conversation launch result',
  );
  if (record['topology'] === 'dialogue') {
    const mode = requireOneOf(
      record['mode'],
      ['companion', 'narrative'] as const,
      'Character Dialogue launch mode',
    );
    return {
      topology: 'dialogue',
      mode,
      characterProjectId: requireIdentity(
        record['characterProjectId'],
        'Character launch CharacterProject',
      ),
      characterVersionId: requireIdentity(
        record['characterVersionId'],
        'Character launch CharacterVersion',
      ),
      characterRunId: requireIdentity(record['characterRunId'], 'Character launch CharacterRun'),
      dialogueRunId: requireIdentity(record['dialogueRunId'], 'Character launch DialogueRun'),
      primaryAgentSessionId: requireIdentity(
        record['primaryAgentSessionId'],
        'Character launch primary AgentSession',
      ),
    };
  }
  if (record['topology'] !== 'chatroom') {
    throw new Error('Character conversation launch result has an unsupported topology.');
  }
  const mode = requireOneOf(
    record['mode'],
    ['companion', 'narrative'] as const,
    'Character Room launch mode',
  );
  const participants = requireUniqueIdentities(
    requireArray(
      record['participants'],
      (item) => {
        const participant = requireExactRecord(
          item,
          ['participantId', 'characterVersionId', 'characterRunId', 'primaryAgentSessionId'],
          'Character Room launch participant',
        );
        return {
          participantId: requireIdentity(
            participant['participantId'],
            'Character Room launch participant',
          ),
          characterVersionId: requireIdentity(
            participant['characterVersionId'],
            'Character Room launch CharacterVersion',
          ),
          characterRunId: requireIdentity(
            participant['characterRunId'],
            'Character Room launch CharacterRun',
          ),
          primaryAgentSessionId: requireIdentity(
            participant['primaryAgentSessionId'],
            'Character Room launch primary AgentSession',
          ),
        };
      },
      'Character Room launch participants',
    ),
    (participant) => participant.participantId,
    'Character Room launch participants',
  );
  if (participants.length < 2) {
    throw new Error('Character Room launch requires at least two Character participants.');
  }
  return {
    topology: 'chatroom',
    mode,
    characterRoomId: requireIdentity(record['characterRoomId'], 'Character launch Room'),
    roomRunId: requireIdentity(record['roomRunId'], 'Character launch RoomRun'),
    interactionAgentSessionId: requireIdentity(
      record['interactionAgentSessionId'],
      'Character launch interaction AgentSession',
    ),
    participants,
  };
}

function recordKeysForLaunchResult(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Character conversation launch result must be an object.');
  }
  return (value as Record<string, unknown>)['topology'] === 'dialogue'
    ? [
        'topology',
        'mode',
        'characterProjectId',
        'characterVersionId',
        'characterRunId',
        'dialogueRunId',
        'primaryAgentSessionId',
      ]
    : [
        'topology',
        'mode',
        'characterRoomId',
        'roomRunId',
        'interactionAgentSessionId',
        'participants',
      ];
}

function parseCompanionCharacterLaunchParticipantSelection(
  value: unknown,
): CompanionCharacterLaunchParticipantSelection {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'roleProfileId'],
    'Companion Character launch participant selection',
  );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Character launch participant characterVersionId',
    ),
    ...(record['roleProfileId'] === undefined
      ? {}
      : { roleProfileId: requireIdentity(record['roleProfileId'], 'Character role profile') }),
  };
}

function parseNarrativeCharacterLaunchParticipantSelection(
  value: unknown,
): NarrativeCharacterLaunchParticipantSelection {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'storyline', 'roleProfileId'],
    'Narrative Character launch participant selection',
  );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Narrative Character launch participant characterVersionId',
    ),
    ...(record['storyline'] === undefined
      ? {}
      : { storyline: parseNarrativeStorylineNodeSelection(record['storyline']) }),
    ...(record['roleProfileId'] === undefined
      ? {}
      : { roleProfileId: requireIdentity(record['roleProfileId'], 'Character role profile') }),
  };
}

export function parseNarrativeStorylineNodeSelection(
  value: unknown,
): NarrativeStorylineNodeSelection {
  const record = requireExactRecord(
    value,
    ['characterStorylineId', 'characterStorylineVersionId', 'storylineNodeId'],
    'Narrative Storyline node selection',
  );
  return {
    characterStorylineId: requireIdentity(
      record['characterStorylineId'],
      'Narrative Storyline identity',
    ),
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'Narrative StorylineVersion identity',
    ),
    storylineNodeId: requireIdentity(record['storylineNodeId'], 'Narrative StorylineNode identity'),
  };
}
