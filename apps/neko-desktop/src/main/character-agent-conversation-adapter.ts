import { createHash } from 'node:crypto';

import type { AgentContextPayload } from '@neko/agent-contracts';
import type { DshDomainConversationService } from '@neko/agent-runtime/application';
import { createConversationId as createCanonicalConversationId } from '@neko/agent-runtime/session/conversation-id';
import type {
  CharacterAgentConversationPort,
  CharacterAgentTurnContext,
} from '@neko/chara/application';

export function createCharacterAgentConversationAdapter(options: {
  readonly conversations: DshDomainConversationService;
  readonly createConversationId?: (characterRunId: string) => string;
}): CharacterAgentConversationPort {
  const createConversationId = options.createConversationId ?? createCharacterConversationId;
  return {
    async createPrimarySession(input, signal) {
      signal?.throwIfAborted();
      const conversationId = requireIdentity(
        createConversationId(input.characterRunId),
        'Character Agent Conversation',
      );
      await options.conversations.publish({
        conversationId,
        title: input.displayName,
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
      return options.conversations.archivePublishedConversation(primaryAgentSessionId);
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
        contextPayloads: [
          projectCharacterAgentContextPayload(input.characterRunId, input.mode, input.context),
        ],
      });
    },
  };
}

function createCharacterConversationId(characterRunId: string): string {
  const identity = requireIdentity(characterRunId, 'Character Run');
  const entropy = createHash('sha256').update(identity).digest().subarray(0, 10);
  return createCanonicalConversationId(`character:${identity}`, { now: 0, random: entropy });
}

function projectCharacterAgentContextPayload(
  characterRunId: string,
  mode: 'companion' | 'narrative',
  context: CharacterAgentTurnContext,
): AgentContextPayload {
  return {
    type: 'character',
    id: characterRunId,
    label: context.characterVersion.label,
    summary: `Frozen Character context for ${context.characterVersion.label}.`,
    data: {
      text: JSON.stringify({
        kind: 'character-primary-turn-context',
        characterRunId,
        mode,
        instruction:
          mode === 'narrative'
            ? 'Respond only as this Character within the selected narrative context and knowledge boundary.'
            : 'Respond as this Character while acting as an identity-bearing companion assistant.',
        characterPublication: context.characterVersion,
        ...(context.narrative === undefined ? {} : { narrative: context.narrative }),
        ...(context.companionContinuity === undefined
          ? {}
          : { companionContinuity: context.companionContinuity }),
        ...(context.relationship === undefined ? {} : { relationship: context.relationship }),
        ...(context.roomView === undefined ? {} : { roomView: context.roomView }),
        ...(context.presentationConfiguration === undefined
          ? {}
          : { presentationConfiguration: context.presentationConfiguration }),
      }),
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
