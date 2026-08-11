import {
  parseCharacterMemoryScope,
  parseCharacterRun,
  parseCharacterStorylineRun,
  parseCharacterStorylineVersion,
  parseCharacterVersion,
  parseDialogueRun,
  parseRoomRun,
  parseRoomView,
  parseUserCharacterRelationship,
  type CharacterMemoryScope,
  type CharacterRun,
  type CharacterRunPresentationConfiguration,
  type CharacterStorylineRun,
  type CharacterStorylineVersion,
  type CharacterVersion,
  type DialogueRun,
  type RoomRun,
  type RoomView,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';

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
  readStorylineRun(
    characterStorylineRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineRun | undefined>;
  readStorylineVersion(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion | undefined>;
  readMemoryScope(
    characterMemoryScopeId: string,
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope | undefined>;
}

export interface CharacterPrimaryAgentSessionPort {
  createPrimarySession(
    input: {
      readonly characterRunId: string;
      readonly characterVersionId: string;
      readonly purpose: 'character.primary';
      readonly owner:
        | {
            readonly kind: 'character';
            readonly characterId: string;
            readonly characterRunId: string;
            readonly dialogueRunId: string;
            readonly roleProfileId?: string;
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
      readonly onTurnStarted?: (turnId: string) => Promise<void>;
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

export interface CharacterAgentTurnContext {
  readonly characterVersion: CharacterVersion;
  readonly characterStorylineRun?: CharacterStorylineRun;
  readonly characterMemoryScope?: CharacterMemoryScope;
  readonly relationship?: UserCharacterRelationship;
  readonly roomView?: RoomView;
  readonly presentationConfiguration?: CharacterRunPresentationConfiguration;
}

export interface CharacterAgentTurnResult {
  readonly turnId: string;
  readonly content: string;
}

export interface CharacterInteractionServiceOptions {
  readonly repository: CharacterInteractionRepository;
  readonly agentSessions: CharacterPrimaryAgentSessionPort;
  readonly roomViews: CharacterRoomViewPort;
  readonly presentationTurns?: {
    prepareNextTurn(
      characterRunId: string,
      signal?: AbortSignal,
    ): Promise<CharacterRunPresentationConfiguration | undefined>;
    freezePreparedTurn(
      input: {
        readonly turnId: string;
        readonly configuration: CharacterRunPresentationConfiguration;
      },
      signal?: AbortSignal,
    ): Promise<unknown>;
  };
  readonly now?: () => string;
}

export type CharacterInteractionDiagnosticCode =
  | 'character-version-unavailable'
  | 'character-run-unavailable'
  | 'dialogue-run-unavailable'
  | 'room-run-unavailable'
  | 'relationship-unavailable'
  | 'character-storyline-run-unavailable'
  | 'character-memory-scope-unavailable'
  | 'character-run-authority-mismatch'
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

export type CreateDialogueInput = CreateDialogueInputBase & {
  readonly runtimeKind: 'companion';
  readonly relationshipId: string;
};

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

  async validateDialogueBinding(
    input: {
      readonly characterProjectId: string;
      readonly characterVersionId: string;
      readonly characterRunId: string;
      readonly dialogueRunId: string;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    const [storedRun, storedPublication, storedDialogue] = await Promise.all([
      this.options.repository.readCharacterRun(input.characterRunId, signal),
      this.options.repository.readPublication(input.characterVersionId, signal),
      this.options.repository.readDialogueRun(input.dialogueRunId, signal),
    ]);
    const run = storedRun ? parseCharacterRun(storedRun) : undefined;
    const publication = storedPublication ? parseCharacterVersion(storedPublication) : undefined;
    const dialogue = storedDialogue ? parseDialogueRun(storedDialogue) : undefined;
    if (
      !run ||
      !publication ||
      !dialogue ||
      publication.characterProjectId !== input.characterProjectId ||
      run.characterVersionId !== input.characterVersionId ||
      run.controller.kind !== 'agent' ||
      dialogue.characterRunId !== input.characterRunId ||
      dialogue.dialogueRunId !== input.dialogueRunId
    ) {
      throw interactionError(
        'character-run-authority-mismatch',
        'Character Dialogue binding does not match the exact Character publication, Run and Dialogue authority.',
        input.characterRunId,
      );
    }
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

    let primaryAgentSessionId: string | undefined;
    if (input.controller.kind === 'agent') {
      const created = await this.options.agentSessions.createPrimarySession(
        {
          characterRunId: input.characterRunId,
          characterVersionId: publication.characterVersionId,
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
        runtimeBinding: { kind: 'companion', relationshipId: input.relationshipId },
        createdAt: this.now(),
      });
      const dialogueRun = parseDialogueRun({
        topology: 'dialogue',
        dialogueRunId: input.dialogueRunId,
        userParticipantId: input.userParticipantId,
        characterParticipantId: input.characterParticipantId,
        characterRunId: input.characterRunId,
        runtimeKind: 'companion',
        relationshipIds: [input.relationshipId],
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
        ...this.presentationTurnHook(prepared, signal),
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
        ...this.presentationTurnHook(prepared, signal),
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
    const presentationConfiguration = await this.options.presentationTurns?.prepareNextTurn(
      agentCharacterRun.characterRunId,
      signal,
    );
    return {
      primaryAgentSessionId: agentCharacterRun.controller.primaryAgentSessionId,
      characterRunId: agentCharacterRun.characterRunId,
      context: deepFreeze({
        ...context,
        ...(presentationConfiguration === undefined ? {} : { presentationConfiguration }),
      }),
    };
  }

  private presentationTurnHook(
    prepared: PreparedCharacterAgentTurn,
    signal?: AbortSignal,
  ): { readonly onTurnStarted?: (turnId: string) => Promise<void> } {
    const configuration = prepared.context.presentationConfiguration;
    const presentationTurns = this.options.presentationTurns;
    if (configuration === undefined || presentationTurns === undefined) return {};
    return {
      onTurnStarted: async (turnId) => {
        await presentationTurns.freezePreparedTurn({ turnId, configuration }, signal);
      },
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
    }

    const storedRelationship = await this.options.repository.readRelationship(
      characterRun.runtimeBinding.relationshipId,
      signal,
    );
    const relationship = storedRelationship
      ? parseUserCharacterRelationship(storedRelationship)
      : undefined;
    if (!relationship || relationship.characterVersionId !== characterRun.characterVersionId) {
      throw interactionError(
        'relationship-unavailable',
        'CharacterRun relationship memory authority is unavailable.',
        characterRun.characterRunId,
      );
    }
    const characterStorylineRun = characterRun.characterStorylineRunId
      ? await this.requireStorylineRun(characterRun, publication, signal)
      : undefined;
    const characterMemoryScope = characterRun.characterMemoryScopeId
      ? await this.requireMemoryScope(characterRun, characterStorylineRun, signal)
      : undefined;
    return {
      characterVersion: structuredClone(publication),
      ...(characterStorylineRun === undefined
        ? {}
        : { characterStorylineRun: structuredClone(characterStorylineRun) }),
      ...(characterMemoryScope === undefined
        ? {}
        : { characterMemoryScope: structuredClone(characterMemoryScope) }),
      relationship: structuredClone(relationship),
      ...(roomView === undefined ? {} : { roomView: structuredClone(roomView) }),
    };
  }

  private async requireStorylineRun(
    characterRun: CharacterRun,
    publication: CharacterVersion,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineRun> {
    const storylineRunId = characterRun.characterStorylineRunId!;
    const stored = await this.options.repository.readStorylineRun(storylineRunId, signal);
    const storylineRun = stored ? parseCharacterStorylineRun(stored) : undefined;
    const storedVersion = storylineRun
      ? await this.options.repository.readStorylineVersion(
          storylineRun.characterStorylineVersionId,
          signal,
        )
      : undefined;
    const storylineVersion = storedVersion
      ? parseCharacterStorylineVersion(storedVersion)
      : undefined;
    if (
      !storylineRun ||
      storylineRun.characterRunId !== characterRun.characterRunId ||
      !storylineVersion ||
      storylineVersion.characterVersionId !== publication.characterVersionId
    ) {
      throw interactionError(
        'character-storyline-run-unavailable',
        `CharacterStorylineRun '${storylineRunId}' does not bind the exact CharacterRun.`,
        characterRun.characterRunId,
      );
    }
    return storylineRun;
  }

  private async requireMemoryScope(
    characterRun: CharacterRun,
    storylineRun: CharacterStorylineRun | undefined,
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    const memoryScopeId = characterRun.characterMemoryScopeId!;
    const stored = await this.options.repository.readMemoryScope(memoryScopeId, signal);
    const memoryScope = stored ? parseCharacterMemoryScope(stored) : undefined;
    if (
      !memoryScope ||
      memoryScope.characterRunId !== characterRun.characterRunId ||
      (memoryScope.characterStorylineRunId !== undefined &&
        memoryScope.characterStorylineRunId !== storylineRun?.characterStorylineRunId)
    ) {
      throw interactionError(
        'character-memory-scope-unavailable',
        `CharacterMemoryScope '${memoryScopeId}' does not bind the exact CharacterRun context.`,
        characterRun.characterRunId,
      );
    }
    return memoryScope;
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
