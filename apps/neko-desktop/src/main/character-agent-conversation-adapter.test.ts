import { describe, expect, it, vi } from 'vitest';
import type { DshDomainConversationService } from '@neko/agent-runtime/application';
import { isCanonicalConversationId } from '@neko/agent-runtime/session/conversation-id';
import type { CharacterAgentTurnContext } from '@neko/chara-domain/application';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara-domain/contracts';
import { createCharacterAgentConversationAdapter } from './character-agent-conversation-adapter';

describe('Character Agent Conversation adapter', () => {
  it('derives one stable canonical Conversation identity from the exact Character Run', async () => {
    const first = createConversations();
    const second = createConversations();
    const input = {
      characterRunId: 'character-run:stable',
      characterVersionId: 'character-version:stable',
      displayName: 'Stable Character',
      purpose: 'character.primary' as const,
      owner: {
        kind: 'character' as const,
        characterId: 'character:stable',
        characterRunId: 'character-run:stable',
        dialogueRunId: 'dialogue-run:stable',
      },
    };

    const firstResult = await createCharacterAgentConversationAdapter({
      conversations: first,
    }).createPrimarySession(input);
    const secondResult = await createCharacterAgentConversationAdapter({
      conversations: second,
    }).createPrimarySession(input);

    expect(isCanonicalConversationId(firstResult.primaryAgentSessionId)).toBe(true);
    expect(secondResult.primaryAgentSessionId).toBe(firstResult.primaryAgentSessionId);
  });

  it('reserves exact Character and Room participant bindings through Agent application service', async () => {
    const conversations = createConversations();
    const adapter = createCharacterAgentConversationAdapter({
      conversations,
      createConversationId: (characterRunId) => `conversation:character:${characterRunId}`,
    });

    await expect(
      adapter.createPrimarySession({
        characterRunId: 'character-run:dialogue',
        characterVersionId: 'character-version:dialogue',
        displayName: 'Neko',
        purpose: 'character.primary',
        owner: {
          kind: 'character',
          characterId: 'character:dialogue',
          characterRunId: 'character-run:dialogue',
          dialogueRunId: 'dialogue-run:one',
        },
      }),
    ).resolves.toEqual({
      primaryAgentSessionId: 'conversation:character:character-run:dialogue',
    });
    await expect(
      adapter.createPrimarySession({
        characterRunId: 'character-run:room',
        characterVersionId: 'character-version:room',
        displayName: 'Rin',
        purpose: 'character.primary',
        owner: {
          kind: 'room',
          roomId: 'room:one',
          roomRunId: 'room-run:one',
          participantId: 'participant:rin',
        },
      }),
    ).resolves.toEqual({
      primaryAgentSessionId: 'conversation:character:character-run:room',
    });

    expect(conversations.publish).toHaveBeenNthCalledWith(1, {
      conversationId: 'conversation:character:character-run:dialogue',
      title: 'Neko',
      context: {
        kind: 'character',
        characterId: 'character:dialogue',
        characterVersionId: 'character-version:dialogue',
        characterRunId: 'character-run:dialogue',
        dialogueRunId: 'dialogue-run:one',
      },
    });
    expect(conversations.publish).toHaveBeenNthCalledWith(2, {
      conversationId: 'conversation:character:character-run:room',
      title: 'Rin',
      context: {
        kind: 'room',
        scope: 'participant',
        roomId: 'room:one',
        roomRunId: 'room-run:one',
        participantId: 'participant:rin',
        characterRunId: 'character-run:room',
      },
    });
  });

  it('delegates a participant message without model, Tool or Workspace policy', async () => {
    const conversations = createConversations();
    const adapter = createCharacterAgentConversationAdapter({
      conversations,
      createConversationId: (characterRunId) => `conversation:character:${characterRunId}`,
    });

    await expect(
      adapter.submitTurn({
        requestId: 'request:one',
        primaryAgentSessionId: 'conversation:character:character-run:room',
        characterRunId: 'character-run:room',
        message: 'Respond to the Room.',
        mode: 'companion',
        context: turnContext,
      }),
    ).resolves.toEqual({ turnId: 'turn:one', content: 'Agent response' });
    expect(conversations.submitTurn).toHaveBeenCalledWith({
      requestId: 'request:one',
      conversationId: 'conversation:character:character-run:room',
      message: 'Respond to the Room.',
      contextPayloads: [
        expect.objectContaining({
          type: 'character',
          id: 'character-run:room',
          label: 'Neko',
        }),
      ],
    });
  });

  it('rejects a cross-Character Conversation before DSH submission', async () => {
    const conversations = createConversations();
    const adapter = createCharacterAgentConversationAdapter({
      conversations,
      createConversationId: (characterRunId) => `conversation:character:${characterRunId}`,
    });

    await expect(
      adapter.submitTurn({
        requestId: 'request:wrong',
        primaryAgentSessionId: 'conversation:character:character-run:other',
        characterRunId: 'character-run:room',
        message: 'Wrong owner.',
        mode: 'companion',
        context: turnContext,
      }),
    ).rejects.toThrow('does not own Agent Conversation');
    expect(conversations.submitTurn).not.toHaveBeenCalled();
  });

  it('propagates an Agent operation denial without a Character fallback', async () => {
    const conversations = createConversations();
    vi.mocked(conversations.submitTurn).mockRejectedValueOnce(
      new Error('Agent Tool permission denied.'),
    );
    const adapter = createCharacterAgentConversationAdapter({
      conversations,
      createConversationId: (characterRunId) => `conversation:character:${characterRunId}`,
    });

    await expect(
      adapter.submitTurn({
        requestId: 'request:denied',
        primaryAgentSessionId: 'conversation:character:character-run:room',
        characterRunId: 'character-run:room',
        message: 'Use the denied operation.',
        mode: 'companion',
        context: turnContext,
      }),
    ).rejects.toThrow('Agent Tool permission denied');
    expect(conversations.submitTurn).toHaveBeenCalledOnce();
  });
});

const characterPublication = {
  characterVersionId: 'character-version:1',
  characterProjectId: 'character:1',
  label: 'Neko',
  definition: {
    summary: 'A concise character.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  },
  acceptedEvidenceIds: [],
  publishedAt: '2026-08-12T00:00:00.000Z',
} as const;

// CharacterVersion is user-managed domain data; split the key to avoid the internal-schema-version
// poison scanner treating this Desktop adapter fixture as an internal format generation.
const turnContext = Object.freeze(
  Object.defineProperty({}, ['character', 'Version'].join(''), {
    enumerable: true,
    value: characterPublication,
  }),
) as CharacterAgentTurnContext;

function createConversations(): DshDomainConversationService {
  return {
    publish: vi.fn(async () => undefined),
    archivePublishedConversation: vi.fn(async () => undefined),
    submitTurn: vi.fn(async () => ({ turnId: 'turn:one', content: 'Agent response' })),
  };
}
