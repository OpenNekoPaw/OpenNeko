import type { AgentDomainConversationService } from '@neko/agent-runtime/application';
import type { CharacterAgentConversationPort } from '@neko/chara/application';

export function createCharacterAgentConversationAdapter(options: {
  readonly conversations: AgentDomainConversationService;
  readonly createConversationId?: (characterRunId: string) => string;
}): CharacterAgentConversationPort {
  const createConversationId =
    options.createConversationId ??
    ((characterRunId: string) => `conversation:character:${characterRunId}`);
  return {
    async createPrimarySession(input, signal) {
      signal?.throwIfAborted();
      const conversationId = requireIdentity(
        createConversationId(input.characterRunId),
        'Character Agent Conversation',
      );
      await options.conversations.reserve({
        conversationId,
        context:
          input.owner.kind === 'character'
            ? {
                kind: 'character',
                characterId: input.owner.characterId,
                characterVersionId: input.characterVersionId,
                characterRunId: requireMatchingCharacterRunId(
                  input.characterRunId,
                  input.owner.characterRunId,
                ),
                dialogueRunId: input.owner.dialogueRunId,
                ...(input.owner.roleProfileId === undefined
                  ? {}
                  : { roleProfileId: input.owner.roleProfileId }),
              }
            : {
                kind: 'room',
                scope: 'participant',
                roomId: input.owner.roomId,
                roomRunId: input.owner.roomRunId,
                participantId: input.owner.participantId,
                characterRunId: input.characterRunId,
              },
      });
      return { primaryAgentSessionId: conversationId };
    },

    releaseUnboundSession(primaryAgentSessionId) {
      return options.conversations.releaseReservation(primaryAgentSessionId);
    },

    async submitTurn(input, signal) {
      signal?.throwIfAborted();
      const expected = requireIdentity(
        createConversationId(input.characterRunId),
        'Character Agent Conversation',
      );
      if (input.primaryAgentSessionId !== expected) {
        throw new Error(
          `CharacterRun '${input.characterRunId}' does not own Agent Conversation '${input.primaryAgentSessionId}'.`,
        );
      }
      return options.conversations.submitTurn({
        requestId: input.requestId,
        conversationId: input.primaryAgentSessionId,
        message: input.message,
      });
    },
  };
}

function requireMatchingCharacterRunId(characterRunId: string, ownerCharacterRunId: string) {
  if (characterRunId !== ownerCharacterRunId) {
    throw new Error(
      `Character owner Run '${ownerCharacterRunId}' does not match '${characterRunId}'.`,
    );
  }
  return ownerCharacterRunId;
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} identity is required.`);
  return value;
}
