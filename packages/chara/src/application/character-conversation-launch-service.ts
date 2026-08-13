import {
  parseCharacterConversationLaunchInput,
  parseCharacterConversationLaunchSelection,
  parseCharacterCompanionContinuity,
  parseCharacterRoom,
  parseCharacterRun,
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
  type CharacterCompanionContinuity,
  type CharacterStorylineVersion,
  type CharacterVersion,
  type DialogueRun,
  type RoomRun,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import type { CharacterAgentConversationPort } from './character-interaction-service';
import type { CharacterPublicationReader } from './character-authoring-service';

export type CharacterConversationLaunchAggregate =
  | {
      readonly topology: 'dialogue';
      readonly publications: readonly CharacterVersion[];
      readonly relationships: readonly UserCharacterRelationship[];
      readonly companionContinuities: readonly CharacterCompanionContinuity[];
      readonly characterRun: CharacterRun;
      readonly dialogueRun: DialogueRun;
    }
  | {
      readonly topology: 'chatroom';
      readonly publications: readonly CharacterVersion[];
      readonly relationships: readonly UserCharacterRelationship[];
      readonly companionContinuities: readonly CharacterCompanionContinuity[];
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
  readStorylineVersion(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion | undefined>;
  readCompanionContinuity(
    companionContinuityId: string,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity | undefined>;
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
  readonly relationshipId: (characterProjectId: string) => string;
  readonly companionContinuityId: (characterProjectId: string) => string;
  readonly characterRunId: (index: number) => string;
  readonly characterParticipantId: (index: number) => string;
  readonly userParticipantId: string;
  readonly dialogueRunId: string;
  readonly characterRoomId: string;
  readonly roomRunId: string;
}

interface CompanionLaunchAuthority {
  readonly relationship: UserCharacterRelationship;
  readonly companionContinuity: CharacterCompanionContinuity;
  readonly relationshipIsNew: boolean;
  readonly companionContinuityIsNew: boolean;
}

interface PreparedLaunchCharacter {
  readonly publication: CharacterVersion;
  readonly storyline?: {
    readonly version: CharacterStorylineVersion;
    readonly storylineNodeId: string;
  };
  readonly roleProfileId?: string;
}

export class CharacterConversationLaunchService {
  private readonly now: () => string;

  constructor(
    private readonly options: {
      readonly repository: CharacterConversationLaunchRepository;
      readonly publications: CharacterPublicationReader;
      readonly agentConversations: CharacterAgentConversationPort;
      readonly now?: () => string;
    },
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async launch(
    inputValue: unknown,
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
    const input = parseCharacterConversationLaunchInput(inputValue);
    const identities = createLaunchIdentities(input);
    const existing = await this.readExisting(input, identities, signal);
    if (existing) return existing;

    const characters = await this.prepareCharacters(input.selection, input.requestId, signal);
    if (
      new Set(characters.map((character) => character.publication.characterProjectId)).size !==
      characters.length
    ) {
      throw launchError(
        'character-launch-selection-invalid',
        'Character conversation launch must select at most one CharacterVersion per CharacterProject.',
        input.requestId,
      );
    }
    const companionAuthorities =
      input.selection.mode === 'companion'
        ? await this.resolveCompanionAuthorities(input, identities, characters, signal)
        : [];
    return characters.length === 1
      ? this.launchDialogue(
          input.selection.mode,
          identities,
          characters[0]!,
          companionAuthorities,
          signal,
        )
      : this.launchRoom(input, identities, characters, companionAuthorities, signal);
  }

  async validateSelection(selectionValue: unknown, signal?: AbortSignal): Promise<void> {
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
        const storylineSelection = 'storyline' in character ? character.storyline : undefined;
        if (storylineSelection === undefined) {
          return {
            publication,
            ...(character.roleProfileId === undefined
              ? {}
              : { roleProfileId: character.roleProfileId }),
          };
        }
        const storyline = await this.options.repository.readStorylineVersion(
          storylineSelection.characterStorylineVersionId,
          signal,
        );
        if (!storyline) {
          throw launchError(
            'character-launch-selection-invalid',
            `CharacterStorylineVersion '${storylineSelection.characterStorylineVersionId}' is unavailable.`,
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
        if (canonicalStoryline.characterStorylineId !== storylineSelection.characterStorylineId) {
          throw launchError(
            'character-launch-selection-invalid',
            `CharacterStorylineVersion '${canonicalStoryline.characterStorylineVersionId}' does not belong to CharacterStoryline '${storylineSelection.characterStorylineId}'.`,
            requestId,
          );
        }
        if (
          !canonicalStoryline.nodes.some(
            (node) => node.storylineNodeId === storylineSelection.storylineNodeId,
          )
        ) {
          throw launchError(
            'character-launch-selection-invalid',
            `StorylineNode '${storylineSelection.storylineNodeId}' is unavailable in CharacterStorylineVersion '${canonicalStoryline.characterStorylineVersionId}'.`,
            requestId,
          );
        }
        return {
          publication,
          storyline: {
            version: canonicalStoryline,
            storylineNodeId: storylineSelection.storylineNodeId,
          },
          ...(character.roleProfileId === undefined
            ? {}
            : { roleProfileId: character.roleProfileId }),
        };
      }),
    );
  }

  private async launchDialogue(
    mode: CharacterConversationLaunchSelection['mode'],
    identities: CharacterConversationLaunchIdentities,
    character: PreparedLaunchCharacter,
    companionAuthorities: readonly CompanionLaunchAuthority[],
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
    const publication = character.publication;
    const characterRunId = identities.characterRunId(0);
    const session = await this.options.agentConversations.createPrimarySession(
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
      const companionAuthority = companionAuthorities[0];
      const characterRun = parseCharacterRun({
        characterRunId,
        characterVersionId: publication.characterVersionId,
        participantId: identities.characterParticipantId(0),
        controller: { kind: 'agent', primaryAgentSessionId: session.primaryAgentSessionId },
        runtimeBinding:
          mode === 'companion'
            ? {
                kind: 'companion',
                companionContinuityId:
                  companionAuthority!.companionContinuity.companionContinuityId,
                relationshipId: companionAuthority!.relationship.relationshipId,
              }
            : {
                kind: 'narrative',
                ...(character.storyline === undefined
                  ? {}
                  : {
                      storyline: {
                        characterStorylineId: character.storyline.version.characterStorylineId,
                        characterStorylineVersionId:
                          character.storyline.version.characterStorylineVersionId,
                        storylineNodeId: character.storyline.storylineNodeId,
                      },
                    }),
              },
        createdAt: timestamp,
      });
      const dialogueRun = parseDialogueRun({
        topology: 'dialogue',
        dialogueRunId: identities.dialogueRunId,
        userParticipantId: identities.userParticipantId,
        characterParticipantId: identities.characterParticipantId(0),
        characterRunId,
        mode,
        ...(mode === 'companion'
          ? { relationshipIds: [companionAuthority!.relationship.relationshipId] }
          : {}),
        createdAt: timestamp,
      });
      await this.options.repository.commitLaunch(
        {
          topology: 'dialogue',
          publications: [publication],
          relationships: companionAuthorities
            .filter((authority) => authority.relationshipIsNew)
            .map((authority) => authority.relationship),
          companionContinuities: companionAuthorities
            .filter((authority) => authority.companionContinuityIsNew)
            .map((authority) => authority.companionContinuity),
          characterRun,
          dialogueRun,
        },
        signal,
      );
      return {
        topology: 'dialogue',
        mode,
        characterProjectId: publication.characterProjectId,
        characterVersionId: publication.characterVersionId,
        characterRunId,
        dialogueRunId: dialogueRun.dialogueRunId,
        primaryAgentSessionId: session.primaryAgentSessionId,
      };
    } catch (error) {
      await this.options.agentConversations.releaseUnboundSession(session.primaryAgentSessionId);
      throw error;
    }
  }

  private async launchRoom(
    input: CharacterConversationLaunchInput,
    identities: CharacterConversationLaunchIdentities,
    characters: readonly PreparedLaunchCharacter[],
    companionAuthorities: readonly CompanionLaunchAuthority[],
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchResult> {
    const createdSessions: string[] = [];
    try {
      const participantSessions = [];
      for (const [index, character] of characters.entries()) {
        const publication = character.publication;
        signal?.throwIfAborted();
        const characterRunId = identities.characterRunId(index);
        const session = await this.options.agentConversations.createPrimarySession(
          {
            characterRunId,
            characterVersionId: publication.characterVersionId,
            purpose: 'character.primary',
            owner: {
              kind: 'room',
              roomId: identities.characterRoomId,
              roomRunId: identities.roomRunId,
              participantId: identities.characterParticipantId(index),
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
        const companionAuthority = companionAuthorities[participant.index];
        return parseCharacterRun({
          characterRunId: participant.characterRunId,
          characterVersionId: participant.publication.characterVersionId,
          participantId: participant.participantId,
          controller: {
            kind: 'agent',
            primaryAgentSessionId: participant.primaryAgentSessionId,
          },
          runtimeBinding:
            input.selection.mode === 'companion'
              ? {
                  kind: 'companion',
                  companionContinuityId:
                    companionAuthority!.companionContinuity.companionContinuityId,
                  relationshipId: companionAuthority!.relationship.relationshipId,
                }
              : {
                  kind: 'narrative',
                  ...(participant.storyline === undefined
                    ? {}
                    : {
                        storyline: {
                          characterStorylineId: participant.storyline.version.characterStorylineId,
                          characterStorylineVersionId:
                            participant.storyline.version.characterStorylineVersionId,
                          storylineNodeId: participant.storyline.storylineNodeId,
                        },
                      }),
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
        mode: input.selection.mode,
        ...(input.selection.mode === 'companion'
          ? {
              relationshipIds: companionAuthorities.map(
                (authority) => authority.relationship.relationshipId,
              ),
            }
          : {}),
        createdAt: timestamp,
      });
      await this.options.repository.commitLaunch(
        {
          topology: 'chatroom',
          publications: characters.map((character) => character.publication),
          relationships: companionAuthorities
            .filter((authority) => authority.relationshipIsNew)
            .map((authority) => authority.relationship),
          companionContinuities: companionAuthorities
            .filter((authority) => authority.companionContinuityIsNew)
            .map((authority) => authority.companionContinuity),
          room,
          characterRuns,
          roomRun,
        },
        signal,
      );
      const firstParticipant = participantSessions[0]!;
      return {
        topology: 'chatroom',
        mode: input.selection.mode,
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
          this.options.agentConversations.releaseUnboundSession(sessionId),
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

  private async resolveCompanionAuthorities(
    input: CharacterConversationLaunchInput,
    identities: CharacterConversationLaunchIdentities,
    characters: readonly PreparedLaunchCharacter[],
    signal?: AbortSignal,
  ): Promise<readonly CompanionLaunchAuthority[]> {
    const timestamp = this.now();
    return Promise.all(
      characters.map(async ({ publication }) => {
        const relationshipId = identities.relationshipId(publication.characterProjectId);
        const companionContinuityId = identities.companionContinuityId(
          publication.characterProjectId,
        );
        const [storedRelationship, storedContinuity] = await Promise.all([
          this.options.repository.readRelationship(relationshipId, signal),
          this.options.repository.readCompanionContinuity(companionContinuityId, signal),
        ]);
        const relationship = storedRelationship
          ? parseUserCharacterRelationship(storedRelationship)
          : parseUserCharacterRelationship({
              relationshipId,
              userId: input.userId,
              characterProjectId: publication.characterProjectId,
              relationshipRevision: 0,
              memories: [],
              candidates: [],
              createdAt: timestamp,
              updatedAt: timestamp,
            });
        const companionContinuity = storedContinuity
          ? parseCharacterCompanionContinuity(storedContinuity)
          : parseCharacterCompanionContinuity({
              companionContinuityId,
              userId: input.userId,
              characterProjectId: publication.characterProjectId,
              continuityRevision: 0,
              candidates: [],
              entries: [],
              createdAt: timestamp,
              updatedAt: timestamp,
            });
        if (storedRelationship) {
          if (
            relationship.userId !== input.userId ||
            relationship.characterProjectId !== publication.characterProjectId
          ) {
            throw launchError(
              'character-launch-conflict',
              `Relationship '${relationshipId}' belongs to another Character launch authority.`,
              input.requestId,
            );
          }
        }
        if (
          storedContinuity &&
          (companionContinuity.userId !== input.userId ||
            companionContinuity.characterProjectId !== publication.characterProjectId)
        ) {
          throw launchError(
            'character-launch-conflict',
            `Companion continuity '${companionContinuityId}' belongs to another Character launch authority.`,
            input.requestId,
          );
        }
        return {
          relationship,
          companionContinuity,
          relationshipIsNew: storedRelationship === undefined,
          companionContinuityIsNew: storedContinuity === undefined,
        };
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
        exactDialogue.mode !== input.selection.mode ||
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
        mode: exactDialogue.mode,
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
      roomRun.mode !== input.selection.mode ||
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
      mode: roomRun.mode,
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
    if (!('storyline' in selection)) {
      if (run.runtimeBinding.kind !== 'companion') return false;
      const continuity = await this.options.repository.readCompanionContinuity(
        run.runtimeBinding.companionContinuityId,
        signal,
      );
      const relationship = await this.options.repository.readRelationship(
        run.runtimeBinding.relationshipId,
        signal,
      );
      return continuity !== undefined && relationship !== undefined;
    }
    if (run.runtimeBinding.kind !== 'narrative') return false;
    const selected = selection.storyline;
    const bound = run.runtimeBinding.storyline;
    if (selected === undefined || bound === undefined) return selected === bound;
    return (
      bound.characterStorylineId === selected.characterStorylineId &&
      bound.characterStorylineVersionId === selected.characterStorylineVersionId &&
      bound.storylineNodeId === selected.storylineNodeId
    );
  }
}

function createLaunchIdentities(
  input: CharacterConversationLaunchInput,
): CharacterConversationLaunchIdentities {
  const requestKey = encodeURIComponent(input.requestId);
  const userKey = encodeURIComponent(input.userId);
  return {
    relationshipId: (characterProjectId) =>
      `relationship:${userKey}:${encodeURIComponent(characterProjectId)}`,
    companionContinuityId: (characterProjectId) =>
      `companion-continuity:${userKey}:${encodeURIComponent(characterProjectId)}`,
    characterRunId: (index) => `character-run:launch:${requestKey}:${String(index + 1)}`,
    characterParticipantId: (index) => `participant:character:${String(index + 1)}`,
    userParticipantId: 'participant:user',
    dialogueRunId: `dialogue-run:launch:${requestKey}`,
    characterRoomId: `character-room:launch:${requestKey}`,
    roomRunId: `room-run:launch:${requestKey}`,
  };
}

function launchError(
  code: CharacterConversationLaunchDiagnosticCode,
  message: string,
  requestId?: string,
): CharacterConversationLaunchError {
  return new CharacterConversationLaunchError(code, message, requestId);
}
