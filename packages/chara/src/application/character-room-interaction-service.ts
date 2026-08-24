import {
  parseCharacterCompanionContinuity,
  parseCharacterRoom,
  parseCharacterRun,
  parseCharacterVersion,
  parseCreateCharacterRoomRunInput,
  parseRoomRun,
  parseUserCharacterRelationship,
  type CharacterRoom,
  type CharacterCompanionContinuity,
  type CharacterRun,
  type CharacterVersion,
  type CreateCharacterRoomRunInput,
  type RoomParticipant,
  type RoomRun,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import type { CharacterAgentConversationPort } from './character-interaction-service';
import type { CharacterDisplayNameReader } from './character-global-catalog-service';

export interface CharacterRoomInteractionRepository {
  readRoom(characterRoomId: string, signal?: AbortSignal): Promise<CharacterRoom | undefined>;
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  readRelationship(
    relationshipId: string,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship | undefined>;
  readCompanionContinuity(
    companionContinuityId: string,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity | undefined>;
}

export interface CharacterPreparedRoomRunPort {
  createPreparedRun(
    input: { readonly run: RoomRun; readonly characterRuns: readonly CharacterRun[] },
    signal?: AbortSignal,
  ): Promise<RoomRun>;
}

export type CharacterRoomInteractionDiagnosticCode =
  | 'character-room-unavailable'
  | 'character-room-binding-invalid'
  | 'character-version-unavailable'
  | 'companion-continuity-unavailable'
  | 'relationship-unavailable';

export class CharacterRoomInteractionError extends Error {
  constructor(
    readonly code: CharacterRoomInteractionDiagnosticCode,
    message: string,
    readonly roomRunId: string,
  ) {
    super(message);
    this.name = 'CharacterRoomInteractionError';
  }
}

export class CharacterRoomInteractionService {
  private readonly now: () => string;
  private readonly createCharacterRunId: (roomRunId: string, participantId: string) => string;

  constructor(
    private readonly options: {
      readonly repository: CharacterRoomInteractionRepository;
      readonly roomRuns: CharacterPreparedRoomRunPort;
      readonly agentConversations: CharacterAgentConversationPort;
      readonly displayNames: CharacterDisplayNameReader;
      readonly now?: () => string;
      readonly createCharacterRunId?: (roomRunId: string, participantId: string) => string;
    },
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createCharacterRunId =
      options.createCharacterRunId ??
      ((roomRunId, participantId) => `character-run:${roomRunId}:${participantId}`);
  }

  async createRun(input: CreateCharacterRoomRunInput, signal?: AbortSignal): Promise<RoomRun> {
    const command = parseCreateCharacterRoomRunInput(input);
    const storedRoom = await this.options.repository.readRoom(command.characterRoomId, signal);
    if (!storedRoom) {
      throw roomInteractionError(
        'character-room-unavailable',
        `CharacterRoom '${command.characterRoomId}' is unavailable.`,
        command.roomRunId,
      );
    }
    const room = parseCharacterRoom(storedRoom);
    const agentTemplates = room.participantTemplates.filter(
      (template) => template.controllerKind === 'agent',
    );
    validateParticipantBindings(
      agentTemplates.map((template) => template.participantTemplateId),
      command,
    );
    const authorities = await Promise.all(
      agentTemplates.map(async (template) => {
        const storedPublication = await this.options.repository.readPublication(
          template.characterVersionId,
          signal,
        );
        if (!storedPublication) {
          throw roomInteractionError(
            'character-version-unavailable',
            `CharacterVersion '${template.characterVersionId}' is unavailable.`,
            command.roomRunId,
          );
        }
        const publication = parseCharacterVersion(storedPublication);
        const binding = command.companionBindings.find(
          (candidate) => candidate.participantId === template.participantTemplateId,
        )!;
        const storedRelationship = await this.options.repository.readRelationship(
          binding.relationshipId,
          signal,
        );
        const relationship = storedRelationship
          ? parseUserCharacterRelationship(storedRelationship)
          : undefined;
        if (!relationship || relationship.characterProjectId !== publication.characterProjectId) {
          throw roomInteractionError(
            'relationship-unavailable',
            `Relationship '${binding.relationshipId}' does not bind CharacterProject '${publication.characterProjectId}'.`,
            command.roomRunId,
          );
        }
        const storedContinuity = await this.options.repository.readCompanionContinuity(
          binding.companionContinuityId,
          signal,
        );
        const continuity = storedContinuity
          ? parseCharacterCompanionContinuity(storedContinuity)
          : undefined;
        if (!continuity || continuity.characterProjectId !== publication.characterProjectId) {
          throw roomInteractionError(
            'companion-continuity-unavailable',
            `Companion continuity '${binding.companionContinuityId}' does not bind CharacterProject '${publication.characterProjectId}'.`,
            command.roomRunId,
          );
        }
        return {
          template,
          publication,
          companionContinuityId: continuity.companionContinuityId,
          relationshipId: relationship.relationshipId,
        };
      }),
    );

    const createdSessions: string[] = [];
    try {
      const characterRuns: CharacterRun[] = [];
      const agentParticipants = new Map<string, RoomParticipant>();
      for (const authority of authorities) {
        signal?.throwIfAborted();
        const characterRunId = this.createCharacterRunId(
          command.roomRunId,
          authority.template.participantTemplateId,
        );
        const session = await this.options.agentConversations.createPrimarySession(
          {
            characterRunId,
            characterVersionId: authority.publication.characterVersionId,
            displayName: await this.options.displayNames.requireDisplayName(
              authority.publication.characterVersionId,
              signal,
            ),
            purpose: 'character.primary',
            owner: {
              kind: 'room',
              roomId: room.characterRoomId,
              roomRunId: command.roomRunId,
              participantId: authority.template.participantTemplateId,
            },
          },
          signal,
        );
        createdSessions.push(session.primaryAgentSessionId);
        const characterRun = parseCharacterRun({
          characterRunId,
          characterVersionId: authority.publication.characterVersionId,
          participantId: authority.template.participantTemplateId,
          controller: { kind: 'agent', primaryAgentSessionId: session.primaryAgentSessionId },
          runtimeBinding: {
            kind: 'companion',
            companionContinuityId: authority.companionContinuityId,
            relationshipId: authority.relationshipId,
          },
          createdAt: this.now(),
        });
        characterRuns.push(characterRun);
        agentParticipants.set(authority.template.participantTemplateId, {
          participantId: authority.template.participantTemplateId,
          displayName: authority.template.displayName,
          characterVersionId: authority.publication.characterVersionId,
          controller: {
            kind: 'agent',
            characterRunId,
            primaryAgentSessionId: session.primaryAgentSessionId,
          },
        });
      }
      const run = parseRoomRun({
        topology: 'chatroom',
        roomRunId: command.roomRunId,
        characterRoomId: room.characterRoomId,
        roomRevision: 0,
        participants: room.participantTemplates.map((template) => {
          if (template.controllerKind === 'agent')
            return agentParticipants.get(template.participantTemplateId)!;
          if (template.controllerKind === 'human') {
            return {
              participantId: template.participantTemplateId,
              displayName: template.displayName,
              ...(template.characterVersionId === undefined
                ? {}
                : { characterVersionId: template.characterVersionId }),
              controller: { kind: 'human', userId: template.userId },
            };
          }
          return {
            participantId: template.participantTemplateId,
            displayName: template.displayName,
            controller: { kind: 'system', systemId: template.systemId },
          };
        }),
        schedulingPolicy: room.schedulingPolicy,
        events: [],
        mode: 'companion',
        relationshipIds: command.companionBindings.map((binding) => binding.relationshipId),
        createdAt: this.now(),
      });
      return await this.options.roomRuns.createPreparedRun({ run, characterRuns }, signal);
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
          'Character Room commit failed and published Agent Conversations were preserved.',
        );
      }
      throw error;
    }
  }
}

function validateParticipantBindings(
  agentParticipantIds: readonly string[],
  input: CreateCharacterRoomRunInput,
): void {
  const supplied = new Set(input.companionBindings.map((binding) => binding.participantId));
  if (
    supplied.size !== agentParticipantIds.length ||
    agentParticipantIds.some((participantId) => !supplied.has(participantId))
  ) {
    throw roomInteractionError(
      'character-room-binding-invalid',
      'RoomRun must bind relationship authority for every exact agent participant.',
      input.roomRunId,
    );
  }
}

function roomInteractionError(
  code: CharacterRoomInteractionDiagnosticCode,
  message: string,
  roomRunId: string,
): CharacterRoomInteractionError {
  return new CharacterRoomInteractionError(code, message, roomRunId);
}
