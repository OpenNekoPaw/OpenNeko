import {
  parseCharacterConversationLaunchInput,
  parseCharacterConversationLaunchSelection,
  parseCharacterMemoryScope,
  parseCharacterRoom,
  parseCharacterRun,
  parseCharacterStorylineRun,
  parseCharacterStorylineVersion,
  parseCharacterVersion,
  parseDialogueRun,
  parseRoomRun,
  parseUserCharacterRelationship,
  type CharacterConversationLaunchInput,
  type CharacterConversationLaunchResult,
  type CharacterConversationLaunchSelection,
  type CharacterRoom,
  type CharacterRun,
  type CharacterMemoryScope,
  type CharacterStorylineRun,
  type CharacterStorylineVersion,
  type CharacterVersion,
  type DialogueRun,
  type RoomRun,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import type { CharacterPrimaryAgentSessionPort } from './character-interaction-service';
import type { CharacterPublicationReader } from './character-authoring-service';

export type CharacterConversationLaunchAggregate =
  | {
      readonly topology: 'dialogue';
      readonly publications: readonly CharacterVersion[];
      readonly relationships: readonly UserCharacterRelationship[];
      readonly characterRun: CharacterRun;
      readonly dialogueRun: DialogueRun;
      readonly storylineRuns: readonly CharacterStorylineRun[];
      readonly memoryScopes: readonly CharacterMemoryScope[];
    }
  | {
      readonly topology: 'chatroom';
      readonly publications: readonly CharacterVersion[];
      readonly relationships: readonly UserCharacterRelationship[];
      readonly room: CharacterRoom;
      readonly characterRuns: readonly CharacterRun[];
      readonly roomRun: RoomRun;
      readonly storylineRuns: readonly CharacterStorylineRun[];
      readonly memoryScopes: readonly CharacterMemoryScope[];
    };

export interface CharacterConversationLaunchRepository {
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  readRelationship(
    relationshipId: string,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship | undefined>;
  readStorylineVersion(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion | undefined>;
  readStorylineRun(
    characterStorylineRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineRun | undefined>;
  readMemoryScope(
    characterMemoryScopeId: string,
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope | undefined>;
  readCharacterRun(characterRunId: string, signal?: AbortSignal): Promise<CharacterRun | undefined>;
  readDialogueRun(dialogueRunId: string, signal?: AbortSignal): Promise<DialogueRun | undefined>;
  readRoom(characterRoomId: string, signal?: AbortSignal): Promise<CharacterRoom | undefined>;
  readRun(roomRunId: string, signal?: AbortSignal): Promise<RoomRun | undefined>;
  commitLaunch(
    aggregate: CharacterConversationLaunchAggregate,
    signal?: AbortSignal,
  ): Promise<void>;
}

export type CharacterConversationLaunchDiagnosticCode =
  | 'character-launch-version-unavailable'
  | 'character-launch-selection-invalid'
  | 'external-composition-unavailable'
  | 'character-launch-conflict';

export class CharacterConversationLaunchError extends Error {
  constructor(
    readonly code: CharacterConversationLaunchDiagnosticCode,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'CharacterConversationLaunchError';
  }
}

interface CharacterConversationLaunchIdentities {
  readonly relationshipId: (characterVersionId: string) => string;
  readonly characterRunId: (index: number) => string;
  readonly characterStorylineRunId: (index: number) => string;
  readonly characterMemoryScopeId: (index: number) => string;
  readonly characterParticipantId: (index: number) => string;
  readonly userParticipantId: string;
  readonly dialogueRunId: string;
  readonly characterRoomId: string;
  readonly roomRunId: string;
}

interface PreparedLaunchCharacter {
  readonly publication: CharacterVersion;
  readonly storyline?: CharacterStorylineVersion;
  readonly roleProfileId?: string;
}

export class CharacterConversationLaunchService {
  private readonly now: () => string;

  constructor(
    private readonly options: {
      readonly repository: CharacterConversationLaunchRepository;
      readonly publications: CharacterPublicationReader;
      readonly agentSessions: CharacterPrimaryAgentSessionPort;
      readonly now?: () => string;
    },
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async launch(
    inputValue: CharacterConversationLaunchInput,
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
    const input = parseCharacterConversationLaunchInput(inputValue);
    if (input.selection.runtimeKind === 'narrative') {
      throw launchError(
        'external-composition-unavailable',
        'Narrative Character launch requires an owning external Composition provider.',
        input.requestId,
      );
    }
    const identities = createLaunchIdentities(input);
    const existing = await this.readExisting(input, identities, signal);
    if (existing) return existing;

    const characters = await this.prepareCharacters(input.selection, input.requestId, signal);
    const relationships = await this.resolveRelationships(input, identities, signal);
    return characters.length === 1
      ? this.launchDialogue(identities, characters[0]!, relationships, signal)
      : this.launchRoom(input, identities, characters, relationships, signal);
  }

  async validateSelection(
    selectionValue: CharacterConversationLaunchSelection,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.prepareCharacters(
      parseCharacterConversationLaunchSelection(selectionValue),
      undefined,
      signal,
    );
  }

  private async prepareCharacters(
    selection: CharacterConversationLaunchSelection,
    requestId: string | undefined,
    signal?: AbortSignal,
  ): Promise<readonly PreparedLaunchCharacter[]> {
    return Promise.all(
      selection.characters.map(async (character) => {
        const stored = await this.options.publications.readPublication(
          character.characterVersionId,
          signal,
        );
        if (!stored) {
          throw launchError(
            'character-launch-version-unavailable',
            `CharacterVersion '${character.characterVersionId}' is not published or available.`,
            requestId,
          );
        }
        const publication = parseCharacterVersion(stored);
        if (character.characterStorylineVersionId === undefined) {
          return {
            publication,
            ...(character.roleProfileId === undefined
              ? {}
              : { roleProfileId: character.roleProfileId }),
          };
        }
        const storyline = await this.options.repository.readStorylineVersion(
          character.characterStorylineVersionId,
          signal,
        );
        if (!storyline) {
          throw launchError(
            'character-launch-selection-invalid',
            `CharacterStorylineVersion '${character.characterStorylineVersionId}' is unavailable.`,
            requestId,
          );
        }
        const canonicalStoryline = parseCharacterStorylineVersion(storyline);
        if (canonicalStoryline.characterVersionId !== publication.characterVersionId) {
          throw launchError(
            'character-launch-selection-invalid',
            `CharacterStorylineVersion '${canonicalStoryline.characterStorylineVersionId}' does not belong to CharacterVersion '${publication.characterVersionId}'.`,
            requestId,
          );
        }
        return {
          publication,
          storyline: canonicalStoryline,
          ...(character.roleProfileId === undefined
            ? {}
            : { roleProfileId: character.roleProfileId }),
        };
      }),
    );
  }

  private async launchDialogue(
    identities: CharacterConversationLaunchIdentities,
    character: PreparedLaunchCharacter,
    relationships: readonly UserCharacterRelationship[],
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
    const publication = character.publication;
    const characterRunId = identities.characterRunId(0);
    const session = await this.options.agentSessions.createPrimarySession(
      {
        characterRunId,
        characterVersionId: publication.characterVersionId,
        purpose: 'character.primary',
        owner: {
          kind: 'character',
          characterId: publication.characterProjectId,
          characterRunId,
          dialogueRunId: identities.dialogueRunId,
          ...(character.roleProfileId === undefined
            ? {}
            : { roleProfileId: character.roleProfileId }),
        },
      },
      signal,
    );
    try {
      const timestamp = this.now();
      const runtimeRecords = createRuntimeRecords(
        identities,
        0,
        characterRunId,
        character.storyline,
        timestamp,
      );
      const characterRun = parseCharacterRun({
        characterRunId,
        characterVersionId: publication.characterVersionId,
        ...(runtimeRecords.storylineRun === undefined
          ? {}
          : {
              characterStorylineRunId: runtimeRecords.storylineRun.characterStorylineRunId,
            }),
        characterMemoryScopeId: runtimeRecords.memoryScope.characterMemoryScopeId,
        participantId: identities.characterParticipantId(0),
        controller: { kind: 'agent', primaryAgentSessionId: session.primaryAgentSessionId },
        runtimeBinding: { kind: 'companion', relationshipId: relationships[0]!.relationshipId },
        createdAt: timestamp,
      });
      const dialogueRun = parseDialogueRun({
        topology: 'dialogue',
        dialogueRunId: identities.dialogueRunId,
        userParticipantId: identities.userParticipantId,
        characterParticipantId: identities.characterParticipantId(0),
        characterRunId,
        runtimeKind: 'companion',
        relationshipIds: [relationships[0]!.relationshipId],
        createdAt: timestamp,
      });
      await this.options.repository.commitLaunch(
        {
          topology: 'dialogue',
          publications: [publication],
          relationships,
          characterRun,
          dialogueRun,
          storylineRuns:
            runtimeRecords.storylineRun === undefined ? [] : [runtimeRecords.storylineRun],
          memoryScopes: [runtimeRecords.memoryScope],
        },
        signal,
      );
      return {
        topology: 'dialogue',
        runtimeKind: 'companion',
        characterProjectId: publication.characterProjectId,
        characterVersionId: publication.characterVersionId,
        characterRunId,
        dialogueRunId: dialogueRun.dialogueRunId,
        primaryAgentSessionId: session.primaryAgentSessionId,
      };
    } catch (error) {
      await this.options.agentSessions.releaseUnboundSession(session.primaryAgentSessionId);
      throw error;
    }
  }

  private async launchRoom(
    input: CharacterConversationLaunchInput,
    identities: CharacterConversationLaunchIdentities,
    characters: readonly PreparedLaunchCharacter[],
    relationships: readonly UserCharacterRelationship[],
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
    const createdSessions: string[] = [];
    try {
      const participantSessions = [];
      for (const [index, character] of characters.entries()) {
        const publication = character.publication;
        signal?.throwIfAborted();
        const characterRunId = identities.characterRunId(index);
        const session = await this.options.agentSessions.createPrimarySession(
          {
            characterRunId,
            characterVersionId: publication.characterVersionId,
            purpose: 'character.primary',
            owner: {
              kind: 'room',
              roomId: identities.characterRoomId,
              roomRunId: identities.roomRunId,
            },
          },
          signal,
        );
        createdSessions.push(session.primaryAgentSessionId);
        participantSessions.push({
          index,
          publication,
          storyline: character.storyline,
          characterRunId,
          participantId: identities.characterParticipantId(index),
          primaryAgentSessionId: session.primaryAgentSessionId,
        });
      }
      const timestamp = this.now();
      const runtimeRecords = participantSessions.map((participant) =>
        createRuntimeRecords(
          identities,
          participant.index,
          participant.characterRunId,
          participant.storyline,
          timestamp,
        ),
      );
      const room = parseCharacterRoom({
        characterRoomId: identities.characterRoomId,
        title: characters.map((character) => character.publication.label).join(', '),
        participantTemplates: [
          {
            participantTemplateId: identities.userParticipantId,
            displayName: input.userDisplayName,
            controllerKind: 'human',
            userId: input.userId,
          },
          ...participantSessions.map((participant) => ({
            participantTemplateId: participant.participantId,
            displayName: participant.publication.label,
            controllerKind: 'agent' as const,
            characterVersionId: participant.publication.characterVersionId,
          })),
        ],
        schedulingPolicy: {
          kind: 'bounded-autonomous',
          maxResponsesPerCycle: participantSessions.length,
          eligibleParticipantIds: participantSessions.map(
            (participant) => participant.participantId,
          ),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const characterRuns = participantSessions.map((participant) => {
        const records = runtimeRecords[participant.index]!;
        return parseCharacterRun({
          characterRunId: participant.characterRunId,
          characterVersionId: participant.publication.characterVersionId,
          ...(records.storylineRun === undefined
            ? {}
            : { characterStorylineRunId: records.storylineRun.characterStorylineRunId }),
          characterMemoryScopeId: records.memoryScope.characterMemoryScopeId,
          participantId: participant.participantId,
          controller: {
            kind: 'agent',
            primaryAgentSessionId: participant.primaryAgentSessionId,
          },
          runtimeBinding: {
            kind: 'companion',
            relationshipId: relationships[participant.index]!.relationshipId,
          },
          createdAt: timestamp,
        });
      });
      const roomRun = parseRoomRun({
        topology: 'chatroom',
        roomRunId: identities.roomRunId,
        characterRoomId: room.characterRoomId,
        roomRevision: 0,
        participants: [
          {
            participantId: identities.userParticipantId,
            displayName: input.userDisplayName,
            controller: { kind: 'human', userId: input.userId },
          },
          ...participantSessions.map((participant) => ({
            participantId: participant.participantId,
            displayName: participant.publication.label,
            characterVersionId: participant.publication.characterVersionId,
            controller: {
              kind: 'agent' as const,
              characterRunId: participant.characterRunId,
              primaryAgentSessionId: participant.primaryAgentSessionId,
            },
          })),
        ],
        schedulingPolicy: room.schedulingPolicy,
        events: [],
        runtimeKind: 'companion',
        relationshipIds: relationships.map((relationship) => relationship.relationshipId),
        createdAt: timestamp,
      });
      await this.options.repository.commitLaunch(
        {
          topology: 'chatroom',
          publications: characters.map((character) => character.publication),
          relationships,
          room,
          characterRuns,
          roomRun,
          storylineRuns: runtimeRecords.flatMap((records) =>
            records.storylineRun === undefined ? [] : [records.storylineRun],
          ),
          memoryScopes: runtimeRecords.map((records) => records.memoryScope),
        },
        signal,
      );
      const firstParticipant = participantSessions[0]!;
      return {
        topology: 'chatroom',
        runtimeKind: 'companion',
        characterRoomId: room.characterRoomId,
        roomRunId: roomRun.roomRunId,
        interactionAgentSessionId: firstParticipant.primaryAgentSessionId,
        participants: participantSessions.map((participant) => ({
          participantId: participant.participantId,
          characterVersionId: participant.publication.characterVersionId,
          characterRunId: participant.characterRunId,
          primaryAgentSessionId: participant.primaryAgentSessionId,
        })),
      };
    } catch (error) {
      const releases = await Promise.allSettled(
        createdSessions.map((sessionId) =>
          this.options.agentSessions.releaseUnboundSession(sessionId),
        ),
      );
      const releaseErrors = releases.flatMap((release) =>
        release.status === 'rejected' ? [release.reason] : [],
      );
      if (releaseErrors.length > 0) {
        throw new AggregateError(
          [error, ...releaseErrors],
          'Character Room launch cleanup failed.',
        );
      }
      throw error;
    }
  }

  private async resolveRelationships(
    input: CharacterConversationLaunchInput,
    identities: CharacterConversationLaunchIdentities,
    signal?: AbortSignal,
  ): Promise<readonly UserCharacterRelationship[]> {
    const timestamp = this.now();
    return Promise.all(
      input.selection.characters.map(async (selection) => {
        const relationshipId = identities.relationshipId(selection.characterVersionId);
        const stored = await this.options.repository.readRelationship(relationshipId, signal);
        if (stored) {
          const relationship = parseUserCharacterRelationship(stored);
          if (
            relationship.userId !== input.userId ||
            relationship.characterVersionId !== selection.characterVersionId
          ) {
            throw launchError(
              'character-launch-conflict',
              `Relationship '${relationshipId}' belongs to another Character launch authority.`,
              input.requestId,
            );
          }
          return relationship;
        }
        return parseUserCharacterRelationship({
          relationshipId,
          userId: input.userId,
          characterVersionId: selection.characterVersionId,
          memories: [],
          candidates: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }),
    );
  }

  private async readExisting(
    input: CharacterConversationLaunchInput,
    identities: CharacterConversationLaunchIdentities,
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult | undefined> {
    if (input.selection.characters.length === 1) {
      const dialogue = await this.options.repository.readDialogueRun(
        identities.dialogueRunId,
        signal,
      );
      if (!dialogue) return undefined;
      const exactDialogue = parseDialogueRun(dialogue);
      const characterRun = await this.options.repository.readCharacterRun(
        exactDialogue.characterRunId,
        signal,
      );
      if (!characterRun) {
        throw launchError(
          'character-launch-conflict',
          `DialogueRun '${exactDialogue.dialogueRunId}' has no CharacterRun.`,
          input.requestId,
        );
      }
      const exactRun = parseCharacterRun(characterRun);
      const selection = input.selection.characters[0]!;
      if (!(await this.runtimeSelectionMatches(exactRun, selection, signal))) {
        throw launchError(
          'character-launch-conflict',
          `Character launch request '${input.requestId}' conflicts with an existing Dialogue storyline.`,
          input.requestId,
        );
      }
      const publication = await this.options.repository.readPublication(
        exactRun.characterVersionId,
        signal,
      );
      if (
        !publication ||
        exactDialogue.runtimeKind !== input.selection.runtimeKind ||
        exactRun.characterVersionId !== selection.characterVersionId ||
        exactRun.controller.kind !== 'agent'
      ) {
        throw launchError(
          'character-launch-conflict',
          `Character launch request '${input.requestId}' conflicts with an existing Dialogue.`,
          input.requestId,
        );
      }
      const exactPublication = parseCharacterVersion(publication);
      return {
        topology: 'dialogue',
        runtimeKind: exactDialogue.runtimeKind,
        characterProjectId: exactPublication.characterProjectId,
        characterVersionId: exactRun.characterVersionId,
        characterRunId: exactRun.characterRunId,
        dialogueRunId: exactDialogue.dialogueRunId,
        primaryAgentSessionId: exactRun.controller.primaryAgentSessionId,
      };
    }
    const run = await this.options.repository.readRun(identities.roomRunId, signal);
    if (!run) return undefined;
    const roomRun = parseRoomRun(run);
    const room = await this.options.repository.readRoom(roomRun.characterRoomId, signal);
    const agentParticipants = roomRun.participants.filter(
      (participant) => participant.controller.kind === 'agent',
    );
    if (
      !room ||
      roomRun.runtimeKind !== input.selection.runtimeKind ||
      roomRun.characterRoomId !== identities.characterRoomId ||
      agentParticipants.length !== input.selection.characters.length ||
      agentParticipants.some(
        (participant, index) =>
          participant.characterVersionId !== input.selection.characters[index]!.characterVersionId,
      )
    ) {
      throw launchError(
        'character-launch-conflict',
        `Character launch request '${input.requestId}' conflicts with an existing Room.`,
        input.requestId,
      );
    }
    const participants = await Promise.all(
      agentParticipants.map(async (participant, index) => {
        if (participant.controller.kind !== 'agent' || !participant.characterVersionId) {
          throw launchError(
            'character-launch-conflict',
            `RoomRun '${roomRun.roomRunId}' contains an invalid Agent participant.`,
            input.requestId,
          );
        }
        const characterRun = await this.options.repository.readCharacterRun(
          participant.controller.characterRunId,
          signal,
        );
        if (
          !characterRun ||
          !(await this.runtimeSelectionMatches(
            parseCharacterRun(characterRun),
            input.selection.characters[index]!,
            signal,
          ))
        ) {
          throw launchError(
            'character-launch-conflict',
            `Character launch request '${input.requestId}' conflicts with an existing Room storyline.`,
            input.requestId,
          );
        }
        return {
          participantId: participant.participantId,
          characterVersionId: participant.characterVersionId,
          characterRunId: participant.controller.characterRunId,
          primaryAgentSessionId: participant.controller.primaryAgentSessionId,
        };
      }),
    );
    return {
      topology: 'chatroom',
      runtimeKind: roomRun.runtimeKind,
      characterRoomId: roomRun.characterRoomId,
      roomRunId: roomRun.roomRunId,
      interactionAgentSessionId: participants[0]!.primaryAgentSessionId,
      participants,
    };
  }

  private async runtimeSelectionMatches(
    run: CharacterRun,
    selection: CharacterConversationLaunchInput['selection']['characters'][number],
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (run.characterMemoryScopeId === undefined) return false;
    const memoryScope = await this.options.repository.readMemoryScope(
      run.characterMemoryScopeId,
      signal,
    );
    if (memoryScope === undefined) return false;
    const exactMemoryScope = parseCharacterMemoryScope(memoryScope);
    if (exactMemoryScope.characterRunId !== run.characterRunId) return false;
    if (selection.characterStorylineVersionId === undefined) {
      return (
        run.characterStorylineRunId === undefined &&
        exactMemoryScope.characterStorylineRunId === undefined
      );
    }
    if (
      run.characterStorylineRunId === undefined ||
      exactMemoryScope.characterStorylineRunId !== run.characterStorylineRunId
    ) {
      return false;
    }
    const storylineRun = await this.options.repository.readStorylineRun(
      run.characterStorylineRunId,
      signal,
    );
    if (storylineRun === undefined) return false;
    const exactStorylineRun = parseCharacterStorylineRun(storylineRun);
    return (
      exactStorylineRun.characterRunId === run.characterRunId &&
      exactStorylineRun.characterStorylineVersionId === selection.characterStorylineVersionId
    );
  }
}

function createLaunchIdentities(
  input: CharacterConversationLaunchInput,
): CharacterConversationLaunchIdentities {
  const requestKey = encodeURIComponent(input.requestId);
  const userKey = encodeURIComponent(input.userId);
  return {
    relationshipId: (characterVersionId) =>
      `relationship:${userKey}:${encodeURIComponent(characterVersionId)}`,
    characterRunId: (index) => `character-run:launch:${requestKey}:${String(index + 1)}`,
    characterStorylineRunId: (index) =>
      `character-storyline-run:launch:${requestKey}:${String(index + 1)}`,
    characterMemoryScopeId: (index) =>
      `character-memory-scope:launch:${requestKey}:${String(index + 1)}`,
    characterParticipantId: (index) => `participant:character:${String(index + 1)}`,
    userParticipantId: 'participant:user',
    dialogueRunId: `dialogue-run:launch:${requestKey}`,
    characterRoomId: `character-room:launch:${requestKey}`,
    roomRunId: `room-run:launch:${requestKey}`,
  };
}

function createRuntimeRecords(
  identities: CharacterConversationLaunchIdentities,
  index: number,
  characterRunId: string,
  storyline: CharacterStorylineVersion | undefined,
  timestamp: string,
): {
  readonly storylineRun?: CharacterStorylineRun;
  readonly memoryScope: CharacterMemoryScope;
} {
  const storylineRun =
    storyline === undefined
      ? undefined
      : parseCharacterStorylineRun({
          characterStorylineRunId: identities.characterStorylineRunId(index),
          characterStorylineVersionId: storyline.characterStorylineVersionId,
          characterRunId,
          currentStageId: storyline.stages[0]!.stageId,
          acceptedTransitions: [],
          storylineRevision: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
  const memoryScope = parseCharacterMemoryScope({
    characterMemoryScopeId: identities.characterMemoryScopeId(index),
    characterRunId,
    ...(storylineRun === undefined
      ? {}
      : { characterStorylineRunId: storylineRun.characterStorylineRunId }),
    memoryRevision: 0,
    candidates: [],
    entries: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return {
    ...(storylineRun === undefined ? {} : { storylineRun }),
    memoryScope,
  };
}

function launchError(
  code: CharacterConversationLaunchDiagnosticCode,
  message: string,
  requestId?: string,
): CharacterConversationLaunchError {
  return new CharacterConversationLaunchError(code, message, requestId);
}
