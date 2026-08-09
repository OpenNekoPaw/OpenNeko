import {
  parseCharacterRoom,
  parseCharacterRun,
  parseCharacterVersion,
  parseCreateCharacterRoomRunInput,
  parseRoomRun,
  parseUserCharacterRelationship,
  type CharacterRoom,
  type CharacterRun,
  type CharacterVersion,
  type CompanionWorldBinding,
  type CreateCharacterRoomRunInput,
  type NarrativeWorldBinding,
  type RoomParticipant,
  type RoomRun,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import type { CharacterPrimaryAgentSessionPort } from './character-interaction-service';

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
}

export interface CharacterPreparedRoomRunPort {
  createPreparedRun(
    input: { readonly run: RoomRun; readonly characterRuns: readonly CharacterRun[] },
    signal?: AbortSignal,
  ): Promise<RoomRun>;
}

export interface CharacterRoomInteractionWorldPort {
  validateBinding(
    binding: CompanionWorldBinding | NarrativeWorldBinding,
    signal?: AbortSignal,
  ): Promise<void>;
}

export type CharacterRoomInteractionDiagnosticCode =
  | 'character-room-unavailable'
  | 'character-room-runtime-mismatch'
  | 'character-room-binding-invalid'
  | 'character-version-unavailable'
  | 'relationship-unavailable'
  | 'narrative-world-unavailable';

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
      readonly agentSessions: CharacterPrimaryAgentSessionPort;
      readonly worldBindings: CharacterRoomInteractionWorldPort;
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
    if (room.defaultRuntimeKind !== command.runtimeKind) {
      throw roomInteractionError(
        'character-room-runtime-mismatch',
        'RoomRun runtime kind does not match its CharacterRoom template.',
        command.roomRunId,
      );
    }
    validateTemplateWorldBinding(room, command);
    if (command.worldBinding) {
      try {
        await this.options.worldBindings.validateBinding(command.worldBinding, signal);
      } catch (error) {
        throw roomInteractionError(
          command.runtimeKind === 'narrative'
            ? 'narrative-world-unavailable'
            : 'character-room-binding-invalid',
          error instanceof Error ? error.message : 'Room World authority is unavailable.',
          command.roomRunId,
        );
      }
    }

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
        if (command.runtimeKind === 'companion') {
          const binding = command.relationshipBindings.find(
            (candidate) => candidate.participantId === template.participantTemplateId,
          )!;
          const storedRelationship = await this.options.repository.readRelationship(
            binding.relationshipId,
            signal,
          );
          const relationship = storedRelationship
            ? parseUserCharacterRelationship(storedRelationship)
            : undefined;
          if (!relationship || relationship.characterVersionId !== publication.characterVersionId) {
            throw roomInteractionError(
              'relationship-unavailable',
              `Relationship '${binding.relationshipId}' does not bind CharacterVersion '${publication.characterVersionId}'.`,
              command.roomRunId,
            );
          }
          return { template, publication, relationshipId: relationship.relationshipId };
        }
        const actor = command.actorBindings.find(
          (candidate) => candidate.participantId === template.participantTemplateId,
        )!;
        return { template, publication, actorId: actor.actorId };
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
        const session = await this.options.agentSessions.createPrimarySession(
          {
            characterRunId,
            purpose: 'character.primary',
            owner: {
              kind: 'room',
              roomId: room.characterRoomId,
              roomRunId: command.roomRunId,
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
          runtimeBinding:
            command.runtimeKind === 'companion'
              ? { kind: 'companion', relationshipId: authority.relationshipId }
              : { kind: 'narrative', ...command.worldBinding, actorId: authority.actorId },
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
        runtimeKind: command.runtimeKind,
        ...(command.runtimeKind === 'companion'
          ? {
              relationshipIds: command.relationshipBindings.map(
                (binding) => binding.relationshipId,
              ),
              ...(command.worldBinding === undefined ? {} : { worldBinding: command.worldBinding }),
            }
          : { worldBinding: command.worldBinding }),
        createdAt: this.now(),
      });
      return await this.options.roomRuns.createPreparedRun({ run, characterRuns }, signal);
    } catch (error) {
      await Promise.allSettled(
        createdSessions.map((sessionId) =>
          this.options.agentSessions.releaseUnboundSession(sessionId),
        ),
      );
      throw error;
    }
  }
}

function validateParticipantBindings(
  agentParticipantIds: readonly string[],
  input: CreateCharacterRoomRunInput,
): void {
  const supplied = new Set(
    (input.runtimeKind === 'companion' ? input.relationshipBindings : input.actorBindings).map(
      (binding) => binding.participantId,
    ),
  );
  if (
    supplied.size !== agentParticipantIds.length ||
    agentParticipantIds.some((participantId) => !supplied.has(participantId))
  ) {
    throw roomInteractionError(
      'character-room-binding-invalid',
      'RoomRun must bind relationship or actor authority for every exact agent participant.',
      input.roomRunId,
    );
  }
}

function validateTemplateWorldBinding(
  room: CharacterRoom,
  input: CreateCharacterRoomRunInput,
): void {
  if (
    room.worldVersionId !== undefined &&
    input.worldBinding?.worldVersionId !== room.worldVersionId
  ) {
    throw roomInteractionError(
      'character-room-binding-invalid',
      `CharacterRoom '${room.characterRoomId}' requires WorldVersion '${room.worldVersionId}'.`,
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
