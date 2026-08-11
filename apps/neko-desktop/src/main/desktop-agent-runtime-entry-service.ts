import type {
  AgentBoundDomainBinding,
  AgentCharacterDialogueLaunchBinding,
  AgentDraftInputIntent,
} from '@neko/agent-contracts';
import type { AgentEntryRuntimeMaterializationPort } from '@neko/agent-runtime/application';
import type {
  CharacterConversationLaunchResult,
  CharacterConversationLaunchSelection,
  CharacterVersion,
} from '@neko/chara/contracts';

interface DesktopCharacterConversationLaunchPort {
  validateSelection(selection: CharacterConversationLaunchSelection): Promise<void>;
  launch(input: {
    readonly requestId: string;
    readonly userId: string;
    readonly userDisplayName: string;
    readonly selection: CharacterConversationLaunchSelection;
  }): Promise<CharacterConversationLaunchResult>;
}

interface DesktopCharacterPublicationReader {
  readPublication(characterVersionId: string): Promise<CharacterVersion | undefined>;
}

interface DesktopCharacterInteractionPort {
  validateDialogueBinding(input: {
    readonly characterProjectId: string;
    readonly characterVersionId: string;
    readonly characterRunId: string;
    readonly dialogueRunId: string;
  }): Promise<void>;
  submitTurn(input: {
    readonly topology: 'dialogue';
    readonly dialogueRunId: string;
    readonly characterRunId: string;
    readonly message: string;
  }): Promise<unknown>;
}

interface DesktopCharacterRoomPort {
  readRun(roomRunId: string): Promise<{ readonly characterRoomId: string }>;
}

interface DesktopCharacterRoomConversationPort {
  submitUserMessage(input: {
    readonly submissionId: string;
    readonly roomRunId: string;
    readonly userId: string;
    readonly message: string;
  }): Promise<{ readonly outcomes: readonly { readonly status: string }[] }>;
}

export interface DesktopAgentRuntimeEntryService extends AgentEntryRuntimeMaterializationPort {
  validateContext(
    context: Extract<AgentBoundDomainBinding, { readonly kind: 'character' | 'room' }>,
  ): Promise<void>;
  executeInitialInput(input: {
    readonly requestId: string;
    readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'character' | 'room' }>;
    readonly intent: AgentDraftInputIntent;
  }): Promise<void>;
}

export function createDesktopAgentCharacterDialogueTargetValidator(options: {
  readonly conversations: Pick<DesktopCharacterConversationLaunchPort, 'validateSelection'>;
  readonly publications: DesktopCharacterPublicationReader;
}) {
  return async (binding: AgentCharacterDialogueLaunchBinding): Promise<void> => {
    const selection = projectCharacterSelection(binding);
    await options.conversations.validateSelection(selection);
    for (const participant of binding.participants) {
      const publication = await options.publications.readPublication(
        participant.characterVersionId,
      );
      if (!publication || publication.characterProjectId !== participant.characterProjectId) {
        throw new Error(
          `CharacterVersion '${participant.characterVersionId}' does not belong to exact CharacterProject '${participant.characterProjectId}'.`,
        );
      }
    }
  };
}

export function createDesktopAgentRuntimeEntryService(options: {
  readonly characterConversations: DesktopCharacterConversationLaunchPort;
  readonly characterInteractions: DesktopCharacterInteractionPort;
  readonly characterRooms: DesktopCharacterRoomPort;
  readonly characterRoomConversations: DesktopCharacterRoomConversationPort;
  readonly userId: string;
  readonly userDisplayName: string;
}): DesktopAgentRuntimeEntryService {
  return {
    async materialize({ requestId, connection, receipt, input }) {
      if (
        receipt.draftId !== connection.draftId ||
        receipt.connectionId !== connection.connectionId
      ) {
        throw new Error('Agent runtime Entry receipt belongs to another Draft or connection.');
      }
      if (receipt.binding.kind === 'world-experience') {
        throw new Error(
          '[world/agent-world-experience-provider-unavailable] Complete World Experience launch is unavailable until the WorldExperienceVersion owner is composed.',
        );
      }
      if (input.kind !== 'message') {
        throw new Error('Character Dialogue first submit requires an ordinary message input.');
      }
      const result = await options.characterConversations.launch({
        requestId,
        userId: options.userId,
        userDisplayName: options.userDisplayName,
        selection: projectCharacterSelection(receipt.binding),
      });
      return {
        conversationId:
          result.topology === 'dialogue'
            ? result.primaryAgentSessionId
            : `conversation:room:${result.roomRunId}`,
        context: projectCharacterContext(receipt.binding, result),
      };
    },
    async validateContext(context) {
      if (context.kind === 'character') {
        if (!context.characterRunId || !context.dialogueRunId) {
          throw new Error('Character Conversation has no exact Run and Dialogue authority.');
        }
        await options.characterInteractions.validateDialogueBinding({
          characterProjectId: context.characterId,
          characterVersionId: context.characterVersionId,
          characterRunId: context.characterRunId,
          dialogueRunId: context.dialogueRunId,
        });
        return;
      }
      const run = await options.characterRooms.readRun(context.roomRunId);
      if (run.characterRoomId !== context.roomId) {
        throw new Error('Room Conversation does not match the exact CharacterRoom authority.');
      }
    },
    async executeInitialInput({ requestId, context, intent }) {
      if (intent.kind !== 'message') {
        throw new Error('Character Dialogue and Room first submit require an ordinary message.');
      }
      await this.validateContext(context);
      if (context.kind === 'character') {
        await options.characterInteractions.submitTurn({
          topology: 'dialogue',
          dialogueRunId: context.dialogueRunId!,
          characterRunId: context.characterRunId!,
          message: intent.text,
        });
        return;
      }
      const result = await options.characterRoomConversations.submitUserMessage({
        submissionId: requestId,
        roomRunId: context.roomRunId,
        userId: options.userId,
        message: intent.text,
      });
      if (
        result.outcomes.length > 0 &&
        result.outcomes.every((outcome) => outcome.status === 'rejected')
      ) {
        throw new Error('Every scheduled Room participant response was rejected.');
      }
    },
  };
}

function projectCharacterSelection(
  binding: AgentCharacterDialogueLaunchBinding,
): CharacterConversationLaunchSelection {
  if (binding.storylineVersionId !== undefined && binding.participants.length !== 1) {
    throw new Error(
      'Character Dialogue storyline selection requires exactly one Character participant.',
    );
  }
  if (
    binding.participants.length > 1 &&
    binding.participants.some((participant) => participant.roleProfileId !== undefined)
  ) {
    throw new Error(
      'Character Room role profile selection is unavailable without participant-level Room authority.',
    );
  }
  return {
    runtimeKind: 'companion',
    characters: binding.participants.map((participant) => ({
      characterVersionId: participant.characterVersionId,
      ...(participant.roleProfileId === undefined
        ? {}
        : { roleProfileId: participant.roleProfileId }),
      ...(binding.storylineVersionId === undefined
        ? {}
        : { characterStorylineVersionId: binding.storylineVersionId }),
    })),
  };
}

function projectCharacterContext(
  binding: AgentCharacterDialogueLaunchBinding,
  result: CharacterConversationLaunchResult,
): Extract<AgentBoundDomainBinding, { readonly kind: 'character' | 'room' }> {
  if (binding.participants.length === 1) {
    const participant = binding.participants[0]!;
    if (
      result.topology !== 'dialogue' ||
      result.characterProjectId !== participant.characterProjectId ||
      result.characterVersionId !== participant.characterVersionId
    ) {
      throw new Error('Chara launch result does not match the exact Character Dialogue target.');
    }
    return {
      kind: 'character',
      characterId: result.characterProjectId,
      characterVersionId: result.characterVersionId,
      characterRunId: result.characterRunId,
      dialogueRunId: result.dialogueRunId,
      ...(participant.roleProfileId === undefined
        ? {}
        : { roleProfileId: participant.roleProfileId }),
    };
  }
  if (
    result.topology !== 'chatroom' ||
    result.participants.length !== binding.participants.length ||
    result.participants.some(
      (participant, index) =>
        participant.characterVersionId !== binding.participants[index]!.characterVersionId,
    )
  ) {
    throw new Error('Chara launch result does not match the exact Character Room target.');
  }
  return {
    kind: 'room',
    roomId: result.characterRoomId,
    roomRunId: result.roomRunId,
  };
}
