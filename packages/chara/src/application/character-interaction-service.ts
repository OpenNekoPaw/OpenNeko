import {
  parseCharacterCompanionContinuity,
  parseCharacterNarrativeTurnReceipt,
  parseCharacterRun,
  parseCharacterStorylineVersion,
  parseCharacterVersion,
  parseDialogueRun,
  parseRoomRun,
  parseRoomView,
  parseUserCharacterRelationship,
  type CharacterCompanionContinuity,
  type CharacterNarrativeTurnReceipt,
  type CompanionContinuityProjection,
  type CharacterRun,
  type CharacterRunPresentationConfiguration,
  type CharacterStorylineVersion,
  type CharacterVersion,
  type DialogueRun,
  type RoomRun,
  type RoomView,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import { projectCompanionContinuity } from './character-companion-continuity-service';
import {
  projectCharacterAgentModeConstraint,
  type CharacterAgentModeConstraint,
} from './character-agent-mode-constraint';
import type { CharacterDisplayNameReader } from './character-global-catalog-service';

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
  readStorylineVersion(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion | undefined>;
  readCompanionContinuity(
    companionContinuityId: string,
    signal?: AbortSignal,
  ): Promise<CharacterCompanionContinuity | undefined>;
  freezeNarrativeTurnReceipt(
    receipt: CharacterNarrativeTurnReceipt,
    signal?: AbortSignal,
  ): Promise<void>;
  readNarrativeTurnReceipt(
    turnId: string,
    signal?: AbortSignal,
  ): Promise<CharacterNarrativeTurnReceipt | undefined>;
}

export interface CharacterAgentConversationPort {
  createPrimarySession(
    input: {
      readonly characterRunId: string;
      readonly characterVersionId: string;
      readonly displayName: string;
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
            readonly participantId: string;
          };
    },
    signal?: AbortSignal,
  ): Promise<{ readonly primaryAgentSessionId: string }>;
  releaseUnboundSession(primaryAgentSessionId: string): Promise<void>;
  submitTurn(
    input: {
      readonly requestId: string;
      readonly primaryAgentSessionId: string;
      readonly characterRunId: string;
      readonly message: string;
      readonly mode: 'companion' | 'narrative';
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

export interface CharacterAgentTurnContext {
  readonly characterVersion: CharacterVersion;
  readonly narrative?: CharacterNarrativeTurnContext;
  readonly companionContinuity?: CompanionContinuityProjection;
  readonly relationship?: UserCharacterRelationship;
  readonly roomView?: RoomView;
  readonly presentationConfiguration?: CharacterRunPresentationConfiguration;
}

export interface CharacterNarrativeTurnContext {
  readonly characterStorylineId: string;
  readonly characterStorylineVersionId: string;
  readonly storylineNodeId: string;
  readonly node: {
    readonly title: string;
    readonly situation: string;
    readonly time?: string;
    readonly location?: string;
    readonly characterState?: string;
    readonly relationshipState?: string;
    readonly allowedStoryFacts: readonly string[];
    readonly narrativeMemories: readonly string[];
    readonly knowledgeBoundary: readonly string[];
    readonly behaviorConstraints: readonly string[];
    readonly expressionConstraints: readonly string[];
  };
}

export interface CharacterAgentTurnResult {
  readonly turnId: string;
  readonly content: string;
}

export interface CharacterInteractionServiceOptions {
  readonly repository: CharacterInteractionRepository;
  readonly displayNames: CharacterDisplayNameReader;
  readonly agentConversations: CharacterAgentConversationPort;
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
  | 'character-storyline-context-unavailable'
  | 'companion-continuity-unavailable'
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
  readonly mode: 'companion';
  readonly companionContinuityId: string;
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
  readonly requestId: string;
  readonly message: string;
};

export interface PreparedCharacterAgentTurn {
  readonly primaryAgentSessionId: string;
  readonly characterRunId: string;
  readonly mode: 'companion' | 'narrative';
  readonly context: CharacterAgentTurnContext;
  readonly narrativeReceipt?: Omit<CharacterNarrativeTurnReceipt, 'turnId' | 'startedAt'>;
}

export class CharacterInteractionService {
  private readonly now: () => string;

  constructor(private readonly options: CharacterInteractionServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async resolveAgentModeConstraint(
    characterRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterAgentModeConstraint> {
    const run = await this.requireCharacterRun(characterRunId, signal);
    return projectCharacterAgentModeConstraint(run.runtimeBinding.kind);
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
    if (!relationship || relationship.characterProjectId !== publication.characterProjectId) {
      throw interactionError(
        'relationship-unavailable',
        `Relationship '${input.relationshipId}' does not bind the selected CharacterProject.`,
        input.characterRunId,
      );
    }
    const storedContinuity = await this.options.repository.readCompanionContinuity(
      input.companionContinuityId,
      signal,
    );
    const continuity = storedContinuity
      ? parseCharacterCompanionContinuity(storedContinuity)
      : undefined;
    if (!continuity || continuity.characterProjectId !== publication.characterProjectId) {
      throw interactionError(
        'companion-continuity-unavailable',
        `Companion continuity '${input.companionContinuityId}' does not bind the selected CharacterProject.`,
        input.characterRunId,
      );
    }

    let primaryAgentSessionId: string | undefined;
    if (input.controller.kind === 'agent') {
      const displayName = await this.options.displayNames.requireDisplayName(
        publication.characterVersionId,
        signal,
      );
      const created = await this.options.agentConversations.createPrimarySession(
        {
          characterRunId: input.characterRunId,
          characterVersionId: publication.characterVersionId,
          displayName,
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
        runtimeBinding: {
          kind: 'companion',
          companionContinuityId: continuity.companionContinuityId,
          relationshipId: input.relationshipId,
        },
        createdAt: this.now(),
      });
      const dialogueRun = parseDialogueRun({
        topology: 'dialogue',
        dialogueRunId: input.dialogueRunId,
        userParticipantId: input.userParticipantId,
        characterParticipantId: input.characterParticipantId,
        characterRunId: input.characterRunId,
        mode: 'companion',
        relationshipIds: [input.relationshipId],
        createdAt: this.now(),
      });
      await this.options.repository.createDialogue({ characterRun, dialogueRun }, signal);
      return { characterRun, dialogueRun };
    } catch (error) {
      if (primaryAgentSessionId) {
        try {
          await this.options.agentConversations.releaseUnboundSession(primaryAgentSessionId);
        } catch (releaseError) {
          throw new AggregateError(
            [error, releaseError],
            'Character Dialogue commit failed and the published Agent Conversation was preserved.',
          );
        }
      }
      throw error;
    }
  }

  async submitTurn(
    input: SubmitCharacterTurnInput,
    signal?: AbortSignal,
  ): Promise<CharacterAgentTurnResult> {
    const prepared = await this.prepareTurn(input, signal);
    const result = await this.options.agentConversations.submitTurn(
      {
        requestId: input.requestId,
        primaryAgentSessionId: prepared.primaryAgentSessionId,
        characterRunId: prepared.characterRunId,
        message: input.message,
        mode: prepared.mode,
        context: prepared.context,
      },
      signal,
    );
    await this.freezePreparedTurn(prepared, result.turnId, signal);
    return result;
  }

  async submitPreparedTurn(
    prepared: PreparedCharacterAgentTurn,
    requestId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<CharacterAgentTurnResult> {
    const result = await this.options.agentConversations.submitTurn(
      {
        requestId,
        primaryAgentSessionId: prepared.primaryAgentSessionId,
        characterRunId: prepared.characterRunId,
        message,
        mode: prepared.mode,
        context: prepared.context,
      },
      signal,
    );
    await this.freezePreparedTurn(prepared, result.turnId, signal);
    return result;
  }

  async freezePreparedTurn(
    prepared: PreparedCharacterAgentTurn,
    turnId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.presentationTurnHook(prepared, signal).onTurnStarted?.(turnId);
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
      mode: agentCharacterRun.runtimeBinding.kind,
      context: deepFreeze({
        ...context,
        ...(presentationConfiguration === undefined ? {} : { presentationConfiguration }),
      }),
      ...(agentCharacterRun.runtimeBinding.kind === 'narrative'
        ? {
            narrativeReceipt: {
              primaryAgentSessionId: agentCharacterRun.controller.primaryAgentSessionId,
              characterRunId: agentCharacterRun.characterRunId,
              characterVersionId: publication.characterVersionId,
              conversation:
                input.topology === 'dialogue'
                  ? { topology: 'dialogue' as const, dialogueRunId: input.dialogueRunId }
                  : { topology: 'chatroom' as const, roomRunId: input.roomRunId },
              ...(agentCharacterRun.runtimeBinding.storyline === undefined
                ? {}
                : { storyline: agentCharacterRun.runtimeBinding.storyline }),
            },
          }
        : {}),
    };
  }

  private presentationTurnHook(
    prepared: PreparedCharacterAgentTurn,
    signal?: AbortSignal,
  ): { readonly onTurnStarted?: (turnId: string) => Promise<void> } {
    const configuration = prepared.context.presentationConfiguration;
    const narrativeReceipt = prepared.narrativeReceipt;
    const presentationTurns = this.options.presentationTurns;
    if (
      narrativeReceipt === undefined &&
      (configuration === undefined || presentationTurns === undefined)
    ) {
      return {};
    }
    return {
      onTurnStarted: async (turnId) => {
        if (narrativeReceipt !== undefined) {
          await this.options.repository.freezeNarrativeTurnReceipt(
            parseCharacterNarrativeTurnReceipt({
              ...narrativeReceipt,
              turnId,
              startedAt: this.now(),
            }),
            signal,
          );
        }
        if (configuration !== undefined && presentationTurns !== undefined) {
          await presentationTurns.freezePreparedTurn({ turnId, configuration }, signal);
        }
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

    const relationship =
      characterRun.runtimeBinding.kind === 'companion'
        ? await this.requireRelationship(characterRun, publication, signal)
        : undefined;
    const narrative =
      characterRun.runtimeBinding.kind === 'narrative' &&
      characterRun.runtimeBinding.storyline !== undefined
        ? await this.requireNarrativeContext(characterRun, publication, signal)
        : undefined;
    const companionContinuity =
      characterRun.runtimeBinding.kind === 'companion'
        ? await this.requireCompanionContinuity(characterRun, publication, signal)
        : undefined;
    return {
      characterVersion: structuredClone(publication),
      ...(narrative === undefined ? {} : { narrative: structuredClone(narrative) }),
      ...(companionContinuity === undefined
        ? {}
        : { companionContinuity: structuredClone(companionContinuity) }),
      ...(relationship === undefined ? {} : { relationship: structuredClone(relationship) }),
      ...(roomView === undefined ? {} : { roomView: structuredClone(roomView) }),
    };
  }

  private async requireRelationship(
    characterRun: CharacterRun,
    publication: CharacterVersion,
    signal?: AbortSignal,
  ): Promise<UserCharacterRelationship> {
    if (characterRun.runtimeBinding.kind !== 'companion') {
      throw interactionError(
        'character-run-authority-mismatch',
        'Narrative CharacterRun has no Companion relationship authority.',
        characterRun.characterRunId,
      );
    }
    const stored = await this.options.repository.readRelationship(
      characterRun.runtimeBinding.relationshipId,
      signal,
    );
    const relationship = stored ? parseUserCharacterRelationship(stored) : undefined;
    if (!relationship || relationship.characterProjectId !== publication.characterProjectId) {
      throw interactionError(
        'relationship-unavailable',
        'CharacterRun relationship memory authority is unavailable.',
        characterRun.characterRunId,
      );
    }
    return relationship;
  }

  private async requireNarrativeContext(
    characterRun: CharacterRun,
    publication: CharacterVersion,
    signal?: AbortSignal,
  ): Promise<CharacterNarrativeTurnContext> {
    if (
      characterRun.runtimeBinding.kind !== 'narrative' ||
      characterRun.runtimeBinding.storyline === undefined
    ) {
      throw interactionError(
        'character-run-authority-mismatch',
        'CharacterRun does not own an exact Narrative Storyline selection.',
        characterRun.characterRunId,
      );
    }
    const selection = characterRun.runtimeBinding.storyline;
    const stored = await this.options.repository.readStorylineVersion(
      selection.characterStorylineVersionId,
      signal,
    );
    const version = stored ? parseCharacterStorylineVersion(stored) : undefined;
    const node = version?.nodes.find(
      (candidate) => candidate.storylineNodeId === selection.storylineNodeId,
    );
    if (
      !version ||
      version.characterStorylineId !== selection.characterStorylineId ||
      version.characterVersionId !== publication.characterVersionId ||
      node === undefined
    ) {
      throw interactionError(
        'character-storyline-context-unavailable',
        `Narrative StorylineNode '${selection.storylineNodeId}' is unavailable in the exact publication.`,
        characterRun.characterRunId,
      );
    }
    return {
      ...selection,
      node: {
        title: node.title,
        situation: node.context.situation,
        ...(node.context.time === undefined ? {} : { time: node.context.time }),
        ...(node.context.location === undefined ? {} : { location: node.context.location }),
        ...(node.context.characterState === undefined
          ? {}
          : { characterState: node.context.characterState }),
        ...(node.context.relationshipState === undefined
          ? {}
          : { relationshipState: node.context.relationshipState }),
        allowedStoryFacts: node.context.allowedStoryFacts,
        narrativeMemories: node.context.narrativeMemories,
        knowledgeBoundary: node.context.knowledgeBoundary,
        behaviorConstraints: node.context.behaviorConstraints,
        expressionConstraints: node.context.expressionConstraints,
      },
    };
  }

  private async requireCompanionContinuity(
    characterRun: CharacterRun,
    publication: CharacterVersion,
    signal?: AbortSignal,
  ): Promise<CompanionContinuityProjection> {
    if (characterRun.runtimeBinding.kind !== 'companion') {
      throw interactionError(
        'character-run-authority-mismatch',
        'Narrative CharacterRun has no Companion continuity authority.',
        characterRun.characterRunId,
      );
    }
    const continuityId = characterRun.runtimeBinding.companionContinuityId;
    const stored = await this.options.repository.readCompanionContinuity(continuityId, signal);
    if (!stored) {
      throw interactionError(
        'companion-continuity-unavailable',
        `CharacterCompanionContinuity '${continuityId}' is unavailable.`,
        characterRun.characterRunId,
      );
    }
    return projectCompanionContinuity(parseCharacterCompanionContinuity(stored), publication);
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
