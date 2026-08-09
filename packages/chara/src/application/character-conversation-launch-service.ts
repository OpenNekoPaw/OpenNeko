import {
  parseCharacterConversationLaunchInput,
  parseCharacterRoom,
  parseCharacterRun,
  parseCharacterVersion,
  parseDialogueRun,
  parseRoomRun,
  parseUserCharacterRelationship,
  type CharacterConversationLaunchInput,
  type CharacterConversationLaunchResult,
  type CharacterRoom,
  type CharacterRun,
  type CharacterVersion,
  type CompanionWorldBinding,
  type DialogueRun,
  type NarrativeWorldBinding,
  type RoomRun,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import type { CharacterPrimaryAgentSessionPort } from './character-interaction-service';

export type CharacterConversationLaunchAggregate =
  | {
      readonly topology: 'dialogue';
      readonly relationships: readonly UserCharacterRelationship[];
      readonly characterRun: CharacterRun;
      readonly dialogueRun: DialogueRun;
    }
  | {
      readonly topology: 'chatroom';
      readonly relationships: readonly UserCharacterRelationship[];
      readonly room: CharacterRoom;
      readonly characterRuns: readonly CharacterRun[];
      readonly roomRun: RoomRun;
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
  readCharacterRun(characterRunId: string, signal?: AbortSignal): Promise<CharacterRun | undefined>;
  readDialogueRun(dialogueRunId: string, signal?: AbortSignal): Promise<DialogueRun | undefined>;
  readRoom(characterRoomId: string, signal?: AbortSignal): Promise<CharacterRoom | undefined>;
  readRun(roomRunId: string, signal?: AbortSignal): Promise<RoomRun | undefined>;
  commitLaunch(
    aggregate: CharacterConversationLaunchAggregate,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface CharacterConversationLaunchWorldPort {
  validateBinding(
    binding: CompanionWorldBinding | NarrativeWorldBinding,
    signal?: AbortSignal,
  ): Promise<void>;
}

export type CharacterConversationLaunchDiagnosticCode =
  | 'character-launch-version-unavailable'
  | 'character-launch-selection-invalid'
  | 'character-launch-world-unavailable'
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
  readonly characterParticipantId: (index: number) => string;
  readonly userParticipantId: string;
  readonly dialogueRunId: string;
  readonly characterRoomId: string;
  readonly roomRunId: string;
}

export class CharacterConversationLaunchService {
  private readonly now: () => string;

  constructor(
    private readonly options: {
      readonly repository: CharacterConversationLaunchRepository;
      readonly agentSessions: CharacterPrimaryAgentSessionPort;
      readonly world: CharacterConversationLaunchWorldPort;
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
    const identities = createLaunchIdentities(input);
    const existing = await this.readExisting(input, identities, signal);
    if (existing) return existing;

    const publications = await Promise.all(
      input.selection.characters.map(async (selection) => {
        const stored = await this.options.repository.readPublication(
          selection.characterVersionId,
          signal,
        );
        if (!stored) {
          throw launchError(
            'character-launch-version-unavailable',
            `CharacterVersion '${selection.characterVersionId}' is not published or available.`,
            input.requestId,
          );
        }
        return parseCharacterVersion(stored);
      }),
    );
    if (input.selection.worldBinding) {
      try {
        await this.options.world.validateBinding(input.selection.worldBinding, signal);
      } catch (error) {
        throw launchError(
          'character-launch-world-unavailable',
          error instanceof Error
            ? error.message
            : 'Character launch World authority is unavailable.',
          input.requestId,
        );
      }
    }
    const relationships =
      input.selection.runtimeKind === 'companion'
        ? await this.resolveRelationships(input, identities, signal)
        : [];
    return publications.length === 1
      ? this.launchDialogue(input, identities, publications[0]!, relationships, signal)
      : this.launchRoom(input, identities, publications, relationships, signal);
  }

  private async launchDialogue(
    input: CharacterConversationLaunchInput,
    identities: CharacterConversationLaunchIdentities,
    publication: CharacterVersion,
    relationships: readonly UserCharacterRelationship[],
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
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
        },
      },
      signal,
    );
    try {
      const timestamp = this.now();
      const characterRun = parseCharacterRun({
        characterRunId,
        characterVersionId: publication.characterVersionId,
        participantId: identities.characterParticipantId(0),
        controller: { kind: 'agent', primaryAgentSessionId: session.primaryAgentSessionId },
        runtimeBinding:
          input.selection.runtimeKind === 'companion'
            ? { kind: 'companion', relationshipId: relationships[0]!.relationshipId }
            : {
                kind: 'narrative',
                ...input.selection.worldBinding,
                actorId: requireActorId(input, 0),
              },
        createdAt: timestamp,
      });
      const dialogueRun = parseDialogueRun({
        topology: 'dialogue',
        dialogueRunId: identities.dialogueRunId,
        userParticipantId: identities.userParticipantId,
        characterParticipantId: identities.characterParticipantId(0),
        characterRunId,
        runtimeKind: input.selection.runtimeKind,
        ...(input.selection.runtimeKind === 'companion'
          ? {
              relationshipIds: [relationships[0]!.relationshipId],
              ...(input.selection.worldBinding
                ? { worldBinding: input.selection.worldBinding }
                : {}),
            }
          : { worldBinding: input.selection.worldBinding }),
        createdAt: timestamp,
      });
      await this.options.repository.commitLaunch(
        { topology: 'dialogue', relationships, characterRun, dialogueRun },
        signal,
      );
      return {
        topology: 'dialogue',
        runtimeKind: input.selection.runtimeKind,
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
    publications: readonly CharacterVersion[],
    relationships: readonly UserCharacterRelationship[],
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
    const createdSessions: string[] = [];
    try {
      const participantSessions = [];
      for (const [index, publication] of publications.entries()) {
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
          characterRunId,
          participantId: identities.characterParticipantId(index),
          primaryAgentSessionId: session.primaryAgentSessionId,
        });
      }
      const timestamp = this.now();
      const room = parseCharacterRoom({
        characterRoomId: identities.characterRoomId,
        title: publications.map((publication) => publication.label).join(', '),
        defaultRuntimeKind: input.selection.runtimeKind,
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
        ...(input.selection.worldBinding
          ? { worldVersionId: input.selection.worldBinding.worldVersionId }
          : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const characterRuns = participantSessions.map((participant) =>
        parseCharacterRun({
          characterRunId: participant.characterRunId,
          characterVersionId: participant.publication.characterVersionId,
          participantId: participant.participantId,
          controller: {
            kind: 'agent',
            primaryAgentSessionId: participant.primaryAgentSessionId,
          },
          runtimeBinding:
            input.selection.runtimeKind === 'companion'
              ? {
                  kind: 'companion',
                  relationshipId: relationships[participant.index]!.relationshipId,
                }
              : {
                  kind: 'narrative',
                  ...input.selection.worldBinding,
                  actorId: requireActorId(input, participant.index),
                },
          createdAt: timestamp,
        }),
      );
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
        runtimeKind: input.selection.runtimeKind,
        ...(input.selection.runtimeKind === 'companion'
          ? {
              relationshipIds: relationships.map((relationship) => relationship.relationshipId),
              ...(input.selection.worldBinding
                ? { worldBinding: input.selection.worldBinding }
                : {}),
            }
          : { worldBinding: input.selection.worldBinding }),
        createdAt: timestamp,
      });
      await this.options.repository.commitLaunch(
        { topology: 'chatroom', relationships, room, characterRuns, roomRun },
        signal,
      );
      const firstParticipant = participantSessions[0]!;
      return {
        topology: 'chatroom',
        runtimeKind: input.selection.runtimeKind,
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
      const publication = await this.options.repository.readPublication(
        exactRun.characterVersionId,
        signal,
      );
      if (
        !publication ||
        exactDialogue.runtimeKind !== input.selection.runtimeKind ||
        exactRun.characterVersionId !== input.selection.characters[0]!.characterVersionId ||
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
    const participants = agentParticipants.map((participant) => {
      if (participant.controller.kind !== 'agent' || !participant.characterVersionId) {
        throw launchError(
          'character-launch-conflict',
          `RoomRun '${roomRun.roomRunId}' contains an invalid Agent participant.`,
          input.requestId,
        );
      }
      return {
        participantId: participant.participantId,
        characterVersionId: participant.characterVersionId,
        characterRunId: participant.controller.characterRunId,
        primaryAgentSessionId: participant.controller.primaryAgentSessionId,
      };
    });
    return {
      topology: 'chatroom',
      runtimeKind: roomRun.runtimeKind,
      characterRoomId: roomRun.characterRoomId,
      roomRunId: roomRun.roomRunId,
      interactionAgentSessionId: participants[0]!.primaryAgentSessionId,
      participants,
    };
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
    characterParticipantId: (index) => `participant:character:${String(index + 1)}`,
    userParticipantId: 'participant:user',
    dialogueRunId: `dialogue-run:launch:${requestKey}`,
    characterRoomId: `character-room:launch:${requestKey}`,
    roomRunId: `room-run:launch:${requestKey}`,
  };
}

function requireActorId(input: CharacterConversationLaunchInput, index: number): string {
  const actorId = input.selection.characters[index]?.actorId;
  if (input.selection.runtimeKind !== 'narrative' || !actorId) {
    throw launchError(
      'character-launch-selection-invalid',
      `Narrative Character selection ${String(index + 1)} has no actor identity.`,
      input.requestId,
    );
  }
  return actorId;
}

function launchError(
  code: CharacterConversationLaunchDiagnosticCode,
  message: string,
  requestId?: string,
): CharacterConversationLaunchError {
  return new CharacterConversationLaunchError(code, message, requestId);
}
