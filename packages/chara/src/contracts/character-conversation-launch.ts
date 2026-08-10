import {
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';

export const CHARACTER_CONVERSATION_LAUNCH_HOST_CHANNEL =
  'neko:character:conversation-launch' as const;

export interface CharacterLaunchParticipantSelection {
  readonly characterVersionId: string;
  readonly characterStorylineVersionId?: string;
}

interface CharacterConversationLaunchSelectionBase {
  readonly characters: readonly CharacterLaunchParticipantSelection[];
}

export type CharacterConversationLaunchSelection = CharacterConversationLaunchSelectionBase & {
  readonly runtimeKind: 'companion' | 'narrative';
};

export interface CharacterConversationLaunchInput {
  readonly requestId: string;
  readonly userId: string;
  readonly userDisplayName: string;
  readonly selection: CharacterConversationLaunchSelection;
}

export type CharacterConversationLaunchResult =
  | {
      readonly topology: 'dialogue';
      readonly runtimeKind: 'companion';
      readonly characterProjectId: string;
      readonly characterVersionId: string;
      readonly characterRunId: string;
      readonly dialogueRunId: string;
      readonly primaryAgentSessionId: string;
    }
  | {
      readonly topology: 'chatroom';
      readonly runtimeKind: 'companion';
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

export interface CharacterConversationLaunchHostRequest {
  readonly requestId: string;
  readonly rendererSessionId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly agentViewId: string;
  readonly draftId: string;
  readonly message: string;
  readonly selection: CharacterConversationLaunchSelection;
}

export interface CharacterConversationLaunchHostResult {
  readonly requestId: string;
  readonly launch: CharacterConversationLaunchResult;
}

export interface OpenNekoDesktopCharacterConversationBridge {
  readonly characterConversations: {
    launch(input: {
      readonly workbenchInstanceId: string;
      readonly agentSurfaceId: string;
      readonly agentViewId: string;
      readonly draftId: string;
      readonly message: string;
      readonly selection: CharacterConversationLaunchSelection;
    }): Promise<CharacterConversationLaunchResult>;
  };
}

export function parseCharacterConversationLaunchSelection(
  value: unknown,
): CharacterConversationLaunchSelection {
  const record = requireExactRecord(
    value,
    ['runtimeKind', 'characters'],
    'Character conversation launch selection',
  );
  const runtimeKind = requireOneOf(
    record['runtimeKind'],
    ['companion', 'narrative'] as const,
    'Character conversation launch runtimeKind',
  );
  const characters = requireUniqueIdentities(
    requireArray(
      record['characters'],
      parseCharacterLaunchParticipantSelection,
      'Character conversation launch characters',
    ),
    (character) => character.characterVersionId,
    'Character conversation launch characters',
  );
  if (characters.length === 0) {
    throw new Error('Character conversation launch requires at least one CharacterVersion.');
  }
  return { runtimeKind, characters };
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

export function createCharacterConversationLaunchHostRequest(
  input: CharacterConversationLaunchHostRequest,
): CharacterConversationLaunchHostRequest {
  return parseCharacterConversationLaunchHostRequest(input);
}

export function parseCharacterConversationLaunchHostRequest(
  value: unknown,
): CharacterConversationLaunchHostRequest {
  const record = requireExactRecord(
    value,
    [
      'requestId',
      'rendererSessionId',
      'workbenchInstanceId',
      'agentSurfaceId',
      'agentViewId',
      'draftId',
      'message',
      'selection',
    ],
    'Character conversation launch Host request',
  );
  return {
    requestId: requireIdentity(record['requestId'], 'Character launch Host request'),
    rendererSessionId: requireIdentity(
      record['rendererSessionId'],
      'Character launch renderer session',
    ),
    workbenchInstanceId: requireIdentity(
      record['workbenchInstanceId'],
      'Character launch Workbench',
    ),
    agentSurfaceId: requireIdentity(record['agentSurfaceId'], 'Character launch Agent Surface'),
    agentViewId: requireIdentity(record['agentViewId'], 'Character launch Agent View'),
    draftId: requireIdentity(record['draftId'], 'Character launch Draft'),
    message: requireIdentity(record['message'], 'Character launch message'),
    selection: parseCharacterConversationLaunchSelection(record['selection']),
  };
}

export function parseCharacterConversationLaunchHostResult(
  value: unknown,
  expectedRequestId: string,
): CharacterConversationLaunchHostResult {
  const record = requireExactRecord(
    value,
    ['requestId', 'launch'],
    'Character conversation launch Host result',
  );
  const requestId = requireIdentity(record['requestId'], 'Character launch response request');
  if (requestId !== expectedRequestId) {
    throw new Error('Character conversation launch response request identity mismatch.');
  }
  return {
    requestId,
    launch: parseCharacterConversationLaunchResult(record['launch']),
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
    if (record['runtimeKind'] !== 'companion') {
      throw new Error('Character Dialogue launch runtimeKind must be companion.');
    }
    return {
      topology: 'dialogue',
      runtimeKind: 'companion',
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
  if (record['topology'] !== 'chatroom' || record['runtimeKind'] !== 'companion') {
    throw new Error('Character conversation launch result has an unsupported topology.');
  }
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
    runtimeKind: 'companion',
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
        'runtimeKind',
        'characterProjectId',
        'characterVersionId',
        'characterRunId',
        'dialogueRunId',
        'primaryAgentSessionId',
      ]
    : [
        'topology',
        'runtimeKind',
        'characterRoomId',
        'roomRunId',
        'interactionAgentSessionId',
        'participants',
      ];
}

function parseCharacterLaunchParticipantSelection(
  value: unknown,
): CharacterLaunchParticipantSelection {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'characterStorylineVersionId'],
    'Character launch participant selection',
  );
  const characterStorylineVersionId =
    record['characterStorylineVersionId'] === undefined
      ? undefined
      : requireIdentity(
          record['characterStorylineVersionId'],
          'Character launch participant characterStorylineVersionId',
        );
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Character launch participant characterVersionId',
    ),
    ...(characterStorylineVersionId === undefined ? {} : { characterStorylineVersionId }),
  };
}
