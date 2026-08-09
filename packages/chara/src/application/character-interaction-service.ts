import {
  parseCharacterRun,
  parseCharacterVersion,
  parseDialogueRun,
  parseRoomRun,
  parseRoomView,
  parseUserCharacterRelationship,
  type CharacterRun,
  type CharacterVersion,
  type CompanionWorldBinding,
  type DialogueRun,
  type NarrativeWorldBinding,
  type RoomRun,
  type RoomView,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import { parseWorldView, type WorldView } from '@neko/world/contracts';

export interface CharacterInteractionRepository {
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  readRelationship(
    relationshipId: string,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship | undefined>;
  createDialogue(
    input: { readonly characterRun: CharacterRun; readonly dialogueRun: DialogueRun },
    signal?: AbortSignal,
  ): Promise<void>;
  readCharacterRun(characterRunId: string, signal?: AbortSignal): Promise<CharacterRun | undefined>;
  readDialogueRun(dialogueRunId: string, signal?: AbortSignal): Promise<DialogueRun | undefined>;
  readRoomRun(roomRunId: string, signal?: AbortSignal): Promise<RoomRun | undefined>;
}

export interface CharacterPrimaryAgentSessionPort {
  createPrimarySession(
    input: {
      readonly characterRunId: string;
      readonly purpose: 'character.primary';
      readonly owner:
        | {
            readonly kind: 'character';
            readonly characterId: string;
            readonly characterRunId: string;
            readonly dialogueRunId: string;
          }
        | {
            readonly kind: 'room';
            readonly roomId: string;
            readonly roomRunId: string;
          };
    },
    signal?: AbortSignal,
  ): Promise<{ readonly primaryAgentSessionId: string }>;
  releaseUnboundSession(primaryAgentSessionId: string): Promise<void>;
  submitTurn(
    input: {
      readonly primaryAgentSessionId: string;
      readonly characterRunId: string;
      readonly message: string;
      readonly context: CharacterAgentTurnContext;
    },
    signal?: AbortSignal,
  ): Promise<CharacterAgentTurnResult>;
}

export interface CharacterRoomViewPort {
  materializeRoomView(
    roomRunId: string,
    participantId: string,
    signal?: AbortSignal,
  ): Promise<RoomView>;
}

export interface CharacterWorldViewPort {
  validateBinding(
    binding: CompanionWorldBinding | NarrativeWorldBinding,
    signal?: AbortSignal,
  ): Promise<void>;
  materializeWorldView(
    input: {
      readonly binding: CompanionWorldBinding | NarrativeWorldBinding;
      readonly participantId: string;
      readonly actorId?: string;
    },
    signal?: AbortSignal,
  ): Promise<WorldView>;
}

export interface CharacterAgentTurnContext {
  readonly characterVersion: CharacterVersion;
  readonly relationship?: UserCharacterRelationship;
  readonly roomView?: RoomView;
  readonly worldView?: WorldView;
}

export interface CharacterAgentTurnResult {
  readonly turnId: string;
  readonly content: string;
}

export interface CharacterInteractionServiceOptions {
  readonly repository: CharacterInteractionRepository;
  readonly agentSessions: CharacterPrimaryAgentSessionPort;
  readonly roomViews: CharacterRoomViewPort;
  readonly worldViews: CharacterWorldViewPort;
  readonly now?: () => string;
}

export type CharacterInteractionDiagnosticCode =
  | 'character-version-unavailable'
  | 'character-run-unavailable'
  | 'dialogue-run-unavailable'
  | 'room-run-unavailable'
  | 'relationship-unavailable'
  | 'character-run-authority-mismatch'
  | 'narrative-world-unavailable'
  | 'agent-session-invalid'
  | 'human-character-has-no-agent-session';

export class CharacterInteractionError extends Error {
  constructor(
    readonly code: CharacterInteractionDiagnosticCode,
    message: string,
    readonly characterRunId?: string,
  ) {
    super(message);
    this.name = 'CharacterInteractionError';
  }
}

type DialogueControllerInput =
  { readonly kind: 'agent' } | { readonly kind: 'human'; readonly userId: string };

type CreateDialogueInputBase = {
  readonly dialogueRunId: string;
  readonly characterRunId: string;
  readonly characterVersionId: string;
  readonly userParticipantId: string;
  readonly characterParticipantId: string;
  readonly controller: DialogueControllerInput;
};

export type CreateDialogueInput =
  | (CreateDialogueInputBase & {
      readonly runtimeKind: 'companion';
      readonly relationshipId: string;
      readonly worldBinding?: CompanionWorldBinding;
    })
  | (CreateDialogueInputBase & {
      readonly runtimeKind: 'narrative';
      readonly worldBinding: NarrativeWorldBinding;
      readonly actorId: string;
    });

export type CharacterTurnOwnerInput =
  | {
      readonly topology: 'dialogue';
      readonly dialogueRunId: string;
      readonly characterRunId: string;
    }
  | {
      readonly topology: 'chatroom';
      readonly roomRunId: string;
      readonly primaryAgentSessionId: string;
    };

export type SubmitCharacterTurnInput = CharacterTurnOwnerInput & {
  readonly message: string;
};

export interface PreparedCharacterAgentTurn {
  readonly primaryAgentSessionId: string;
  readonly characterRunId: string;
  readonly context: CharacterAgentTurnContext;
}

export class CharacterInteractionService {
  private readonly now: () => string;

  constructor(private readonly options: CharacterInteractionServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createDialogue(
    input: CreateDialogueInput,
    signal?: AbortSignal,
  ): Promise<{ readonly characterRun: CharacterRun; readonly dialogueRun: DialogueRun }> {
    const storedPublication = await this.options.repository.readPublication(
      input.characterVersionId,
      signal,
    );
    if (!storedPublication) {
      throw interactionError(
        'character-version-unavailable',
        `CharacterVersion '${input.characterVersionId}' is unavailable.`,
        input.characterRunId,
      );
    }
    const publication = parseCharacterVersion(storedPublication);
    if (input.runtimeKind === 'companion') {
      const storedRelationship = await this.options.repository.readRelationship(
        input.relationshipId,
        signal,
      );
      const relationship = storedRelationship
        ? parseUserCharacterRelationship(storedRelationship)
        : undefined;
      if (!relationship || relationship.characterVersionId !== publication.characterVersionId) {
        throw interactionError(
          'relationship-unavailable',
          `Relationship '${input.relationshipId}' does not bind the selected CharacterVersion.`,
          input.characterRunId,
        );
      }
      if (input.worldBinding) {
        await this.options.worldViews.validateBinding(input.worldBinding, signal);
      }
    } else {
      try {
        await this.options.worldViews.validateBinding(input.worldBinding, signal);
      } catch (error) {
        throw interactionError(
          'narrative-world-unavailable',
          error instanceof Error ? error.message : 'Narrative World authority is unavailable.',
          input.characterRunId,
        );
      }
    }

    let primaryAgentSessionId: string | undefined;
    if (input.controller.kind === 'agent') {
      const created = await this.options.agentSessions.createPrimarySession(
        {
          characterRunId: input.characterRunId,
          purpose: 'character.primary',
          owner: {
            kind: 'character',
            characterId: publication.characterProjectId,
            characterRunId: input.characterRunId,
            dialogueRunId: input.dialogueRunId,
          },
        },
        signal,
      );
      primaryAgentSessionId = created.primaryAgentSessionId;
    }
    try {
      const characterRun = parseCharacterRun({
        characterRunId: input.characterRunId,
        characterVersionId: publication.characterVersionId,
        participantId: input.characterParticipantId,
        controller:
          input.controller.kind === 'agent'
            ? { kind: 'agent', primaryAgentSessionId }
            : { kind: 'human', userId: input.controller.userId },
        runtimeBinding:
          input.runtimeKind === 'companion'
            ? { kind: 'companion', relationshipId: input.relationshipId }
            : { kind: 'narrative', ...input.worldBinding, actorId: input.actorId },
        createdAt: this.now(),
      });
      const dialogueRun = parseDialogueRun({
        topology: 'dialogue',
        dialogueRunId: input.dialogueRunId,
        userParticipantId: input.userParticipantId,
        characterParticipantId: input.characterParticipantId,
        characterRunId: input.characterRunId,
        runtimeKind: input.runtimeKind,
        ...(input.runtimeKind === 'companion'
          ? {
              relationshipIds: [input.relationshipId],
              ...(input.worldBinding ? { worldBinding: input.worldBinding } : {}),
            }
          : { worldBinding: input.worldBinding }),
        createdAt: this.now(),
      });
      await this.options.repository.createDialogue({ characterRun, dialogueRun }, signal);
      return { characterRun, dialogueRun };
    } catch (error) {
      if (primaryAgentSessionId) {
        await this.options.agentSessions.releaseUnboundSession(primaryAgentSessionId);
      }
      throw error;
    }
  }

  async submitTurn(
    input: SubmitCharacterTurnInput,
    signal?: AbortSignal,
  ): Promise<CharacterAgentTurnResult> {
    const prepared = await this.prepareTurn(input, signal);
    return this.options.agentSessions.submitTurn(
      {
        primaryAgentSessionId: prepared.primaryAgentSessionId,
        characterRunId: prepared.characterRunId,
        message: input.message,
        context: prepared.context,
      },
      signal,
    );
  }

  async submitPreparedTurn(
    prepared: PreparedCharacterAgentTurn,
    message: string,
    signal?: AbortSignal,
  ): Promise<CharacterAgentTurnResult> {
    return this.options.agentSessions.submitTurn(
      {
        primaryAgentSessionId: prepared.primaryAgentSessionId,
        characterRunId: prepared.characterRunId,
        message,
        context: prepared.context,
      },
      signal,
    );
  }

  async prepareTurn(
    input: CharacterTurnOwnerInput,
    signal?: AbortSignal,
  ): Promise<PreparedCharacterAgentTurn> {
    const owner =
      input.topology === 'dialogue'
        ? {
            characterRunId: input.characterRunId,
            participantId: undefined,
          }
        : await this.resolveRoomTurnOwner(input, signal);
    const characterRun = await this.requireCharacterRun(owner.characterRunId, signal);
    if (characterRun.controller.kind !== 'agent') {
      throw interactionError(
        'human-character-has-no-agent-session',
        `Human-controlled CharacterRun '${owner.characterRunId}' has no AgentSession.`,
        owner.characterRunId,
      );
    }
    const agentCharacterRun = { ...characterRun, controller: characterRun.controller };
    const storedPublication = await this.options.repository.readPublication(
      agentCharacterRun.characterVersionId,
      signal,
    );
    if (!storedPublication) {
      throw interactionError(
        'character-version-unavailable',
        `CharacterVersion '${agentCharacterRun.characterVersionId}' is unavailable.`,
        agentCharacterRun.characterRunId,
      );
    }
    const publication = parseCharacterVersion(storedPublication);
    const context = await this.materializeContext(
      input.topology === 'dialogue'
        ? input
        : {
            topology: 'chatroom',
            roomRunId: input.roomRunId,
            primaryAgentSessionId: input.primaryAgentSessionId,
            participantId: owner.participantId!,
          },
      agentCharacterRun,
      publication,
      signal,
    );
    return {
      primaryAgentSessionId: agentCharacterRun.controller.primaryAgentSessionId,
      characterRunId: agentCharacterRun.characterRunId,
      context: deepFreeze(context),
    };
  }

  private async materializeContext(
    input:
      | Extract<CharacterTurnOwnerInput, { readonly topology: 'dialogue' }>
      | {
          readonly topology: 'chatroom';
          readonly roomRunId: string;
          readonly primaryAgentSessionId: string;
          readonly participantId: string;
        },
    characterRun: CharacterRun & {
      readonly controller: Extract<CharacterRun['controller'], { readonly kind: 'agent' }>;
    },
    publication: CharacterVersion,
    signal?: AbortSignal,
  ): Promise<CharacterAgentTurnContext> {
    let roomView: RoomView | undefined;
    let interactionWorldBinding: CompanionWorldBinding | NarrativeWorldBinding | undefined;
    if (input.topology === 'dialogue') {
      const dialogue = await this.options.repository.readDialogueRun(input.dialogueRunId, signal);
      if (!dialogue) {
        throw interactionError(
          'dialogue-run-unavailable',
          `DialogueRun '${input.dialogueRunId}' is unavailable.`,
          characterRun.characterRunId,
        );
      }
      if (dialogue.characterRunId !== characterRun.characterRunId) {
        throw interactionError(
          'character-run-authority-mismatch',
          'DialogueRun does not own the requested CharacterRun.',
          characterRun.characterRunId,
        );
      }
      interactionWorldBinding = dialogue.worldBinding;
    } else {
      const room = await this.options.repository.readRoomRun(input.roomRunId, signal);
      if (!room) {
        throw interactionError(
          'room-run-unavailable',
          `RoomRun '${input.roomRunId}' is unavailable.`,
          characterRun.characterRunId,
        );
      }
      const participant = room.participants.find(
        (candidate) => candidate.participantId === input.participantId,
      );
      if (
        !participant ||
        participant.controller.kind !== 'agent' ||
        participant.controller.characterRunId !== characterRun.characterRunId ||
        participant.controller.primaryAgentSessionId !==
          characterRun.controller.primaryAgentSessionId
      ) {
        throw interactionError(
          'character-run-authority-mismatch',
          'Room participant does not own the requested CharacterRun and primary AgentSession.',
          characterRun.characterRunId,
        );
      }
      roomView = parseRoomView(
        await this.options.roomViews.materializeRoomView(
          room.roomRunId,
          input.participantId,
          signal,
        ),
      );
      interactionWorldBinding = room.worldBinding;
    }

    let relationship: UserCharacterRelationship | undefined;
    let actorId: string | undefined;
    if (characterRun.runtimeBinding.kind === 'companion') {
      const storedRelationship = await this.options.repository.readRelationship(
        characterRun.runtimeBinding.relationshipId,
        signal,
      );
      relationship = storedRelationship
        ? parseUserCharacterRelationship(storedRelationship)
        : undefined;
      if (!relationship || relationship.characterVersionId !== characterRun.characterVersionId) {
        throw interactionError(
          'relationship-unavailable',
          'CharacterRun relationship memory authority is unavailable.',
          characterRun.characterRunId,
        );
      }
    } else {
      actorId = characterRun.runtimeBinding.actorId;
      const narrativeBinding = characterRun.runtimeBinding;
      if (
        !interactionWorldBinding ||
        !('worldSaveId' in interactionWorldBinding) ||
        narrativeBinding.worldVersionId !== interactionWorldBinding.worldVersionId ||
        narrativeBinding.worldRunId !== interactionWorldBinding.worldRunId ||
        narrativeBinding.worldSaveId !== interactionWorldBinding.worldSaveId ||
        narrativeBinding.branchId !== interactionWorldBinding.branchId
      ) {
        throw interactionError(
          'narrative-world-unavailable',
          'CharacterRun narrative authority does not match its interaction run.',
          characterRun.characterRunId,
        );
      }
    }
    const worldView = interactionWorldBinding
      ? parseWorldView(
          await this.options.worldViews.materializeWorldView(
            {
              binding: interactionWorldBinding,
              participantId: characterRun.participantId,
              ...(actorId === undefined ? {} : { actorId }),
            },
            signal,
          ),
        )
      : undefined;
    return {
      characterVersion: structuredClone(publication),
      ...(relationship === undefined ? {} : { relationship: structuredClone(relationship) }),
      ...(roomView === undefined ? {} : { roomView: structuredClone(roomView) }),
      ...(worldView === undefined ? {} : { worldView: structuredClone(worldView) }),
    };
  }

  private async resolveRoomTurnOwner(
    input: Extract<CharacterTurnOwnerInput, { readonly topology: 'chatroom' }>,
    signal?: AbortSignal,
  ): Promise<{ readonly characterRunId: string; readonly participantId: string }> {
    const stored = await this.options.repository.readRoomRun(input.roomRunId, signal);
    if (!stored) {
      throw interactionError(
        'room-run-unavailable',
        `RoomRun '${input.roomRunId}' is unavailable.`,
      );
    }
    const room = parseRoomRun(stored);
    const participant = room.participants.find(
      (candidate) =>
        candidate.controller.kind === 'agent' &&
        candidate.controller.primaryAgentSessionId === input.primaryAgentSessionId,
    );
    if (!participant || participant.controller.kind !== 'agent') {
      throw interactionError(
        'character-run-authority-mismatch',
        `RoomRun '${input.roomRunId}' does not own primary AgentSession '${input.primaryAgentSessionId}'.`,
      );
    }
    return {
      characterRunId: participant.controller.characterRunId,
      participantId: participant.participantId,
    };
  }

  private async requireCharacterRun(
    characterRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterRun> {
    const run = await this.options.repository.readCharacterRun(characterRunId, signal);
    if (!run) {
      throw interactionError(
        'character-run-unavailable',
        `CharacterRun '${characterRunId}' is unavailable.`,
        characterRunId,
      );
    }
    return parseCharacterRun(run);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function interactionError(
  code: CharacterInteractionDiagnosticCode,
  message: string,
  characterRunId?: string,
): CharacterInteractionError {
  return new CharacterInteractionError(code, message, characterRunId);
}
