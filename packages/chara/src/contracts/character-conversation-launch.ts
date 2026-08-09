import type { CharacterRuntimeKind } from './character';
import {
  parseCompanionWorldBinding,
  parseNarrativeWorldBinding,
  type CompanionWorldBinding,
  type NarrativeWorldBinding,
} from './room';
import {
  optionalIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireOneOf,
  requireUniqueIdentities,
} from './codec';

export interface CharacterLaunchParticipantSelection {
  readonly characterVersionId: string;
  readonly actorId?: string;
}

interface CharacterConversationLaunchSelectionBase {
  readonly characters: readonly CharacterLaunchParticipantSelection[];
}

export type CharacterConversationLaunchSelection =
  | (CharacterConversationLaunchSelectionBase & {
      readonly runtimeKind: 'companion';
      readonly worldBinding?: CompanionWorldBinding;
    })
  | (CharacterConversationLaunchSelectionBase & {
      readonly runtimeKind: 'narrative';
      readonly worldBinding: NarrativeWorldBinding;
    });

export interface CharacterConversationLaunchInput {
  readonly requestId: string;
  readonly userId: string;
  readonly userDisplayName: string;
  readonly selection: CharacterConversationLaunchSelection;
}

export type CharacterConversationLaunchResult =
  | {
      readonly topology: 'dialogue';
      readonly runtimeKind: CharacterRuntimeKind;
      readonly characterProjectId: string;
      readonly characterVersionId: string;
      readonly characterRunId: string;
      readonly dialogueRunId: string;
      readonly primaryAgentSessionId: string;
    }
  | {
      readonly topology: 'chatroom';
      readonly runtimeKind: CharacterRuntimeKind;
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
    ['runtimeKind', 'characters', 'worldBinding'],
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
  if (runtimeKind === 'companion') {
    const worldBinding =
      record['worldBinding'] === undefined
        ? undefined
        : parseCompanionWorldBinding(record['worldBinding']);
    if (characters.some((character) => character.actorId !== undefined)) {
      throw new Error('Companion Character launch participants cannot declare narrative actors.');
    }
    return {
      runtimeKind,
      characters,
      ...(worldBinding === undefined ? {} : { worldBinding }),
    };
  }
  if (characters.some((character) => character.actorId === undefined)) {
    throw new Error('Narrative Character launch requires one actor identity per CharacterVersion.');
  }
  return {
    runtimeKind,
    characters,
    worldBinding: parseNarrativeWorldBinding(record['worldBinding']),
  };
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

function parseCharacterLaunchParticipantSelection(
  value: unknown,
): CharacterLaunchParticipantSelection {
  const record = requireExactRecord(
    value,
    ['characterVersionId', 'actorId'],
    'Character launch participant selection',
  );
  const actorId = optionalIdentity(record['actorId'], 'Character launch participant actorId');
  return {
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'Character launch participant characterVersionId',
    ),
    ...(actorId === undefined ? {} : { actorId }),
  };
}
