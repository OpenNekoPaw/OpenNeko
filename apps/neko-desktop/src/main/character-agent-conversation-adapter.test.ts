import { describe, expect, it, vi } from 'vitest';
import type { AgentDomainConversationService } from '@neko/agent-runtime/application';
import { createCharacterAgentConversationAdapter } from './character-agent-conversation-adapter';

describe('Character Agent Conversation adapter', () => {
  it('reserves exact Character and Room participant bindings through Agent application service', async () => {
    const conversations = createConversations();
    const adapter = createCharacterAgentConversationAdapter({ conversations });

    await expect(
      adapter.createPrimarySession({
        characterRunId: 'character-run:dialogue',
        characterVersionId: 'character-version:dialogue',
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

    expect(conversations.reserve).toHaveBeenNthCalledWith(1, {
      conversationId: 'conversation:character:character-run:dialogue',
      context: {
        kind: 'character',
        characterId: 'character:dialogue',
        characterVersionId: 'character-version:dialogue',
        characterRunId: 'character-run:dialogue',
        dialogueRunId: 'dialogue-run:one',
      },
    });
    expect(conversations.reserve).toHaveBeenNthCalledWith(2, {
      conversationId: 'conversation:character:character-run:room',
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
    const adapter = createCharacterAgentConversationAdapter({ conversations });

    await expect(
      adapter.submitTurn({
        requestId: 'request:one',
        primaryAgentSessionId: 'conversation:character:character-run:room',
        characterRunId: 'character-run:room',
        message: 'Respond to the Room.',
      }),
    ).resolves.toEqual({ turnId: 'turn:one', content: 'Agent response' });
    expect(conversations.submitTurn).toHaveBeenCalledWith({
      requestId: 'request:one',
      conversationId: 'conversation:character:character-run:room',
      message: 'Respond to the Room.',
    });
  });

  it('rejects a cross-Character Conversation before Agent submission', async () => {
    const conversations = createConversations();
    const adapter = createCharacterAgentConversationAdapter({ conversations });

    await expect(
      adapter.submitTurn({
        requestId: 'request:wrong',
        primaryAgentSessionId: 'conversation:character:character-run:other',
        characterRunId: 'character-run:room',
        message: 'Wrong owner.',
      }),
    ).rejects.toThrow('does not own Agent Conversation');
    expect(conversations.submitTurn).not.toHaveBeenCalled();
  });

  it('propagates an Agent operation denial without a Character fallback', async () => {
    const conversations = createConversations();
    vi.mocked(conversations.submitTurn).mockRejectedValueOnce(
      new Error('Agent Tool permission denied.'),
    );
    const adapter = createCharacterAgentConversationAdapter({ conversations });

    await expect(
      adapter.submitTurn({
        requestId: 'request:denied',
        primaryAgentSessionId: 'conversation:character:character-run:room',
        characterRunId: 'character-run:room',
        message: 'Use the denied operation.',
      }),
    ).rejects.toThrow('Agent Tool permission denied');
    expect(conversations.submitTurn).toHaveBeenCalledOnce();
  });
});

function createConversations(): AgentDomainConversationService {
  return {
    reserve: vi.fn(async () => undefined),
    releaseReservation: vi.fn(async () => undefined),
    submitTurn: vi.fn(async () => ({ turnId: 'turn:one', content: 'Agent response' })),
  };
}
