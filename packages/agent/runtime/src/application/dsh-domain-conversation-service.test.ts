import { describe, expect, it, vi } from 'vitest';

import { createDshDomainConversationService } from './dsh-domain-conversation-service';
import { createDshTurnCanvasTargetOwner } from './dsh-turn-canvas-target-owner';

describe('DSH domain Conversation service', () => {
  it('publishes an exact domain Conversation identity', async () => {
    const fixture = createFixture();

    await fixture.service.publish({
      conversationId: 'conversation:character:run-1',
      title: 'Neko',
      context: {
        kind: 'character',
        characterId: 'character-1',
        characterVersionId: 'version-1',
        characterRunId: 'run-1',
        dialogueRunId: 'dialogue-1',
      },
    });

    expect(fixture.publication.publish).toHaveBeenCalledWith({
      conversationId: 'conversation:character:run-1',
      title: 'Neko',
      context: {
        kind: 'character',
        characterId: 'character-1',
        characterVersionId: 'version-1',
        characterRunId: 'run-1',
        dialogueRunId: 'dialogue-1',
      },
    });
  });

  it('sets exact context before prompting and returns the new terminal DSH turn', async () => {
    const order: string[] = [];
    const fixture = createFixture(order);
    fixture.projection.snapshot
      .mockReturnValueOnce({
        sessionId: 'dsh-session-1',
        currentTurn: undefined,
        tools: [],
        events: [
          {
            kind: 'turn',
            sessionId: 'dsh-session-1',
            turn: 1,
            phase: 'end',
            startedAt: 1,
            completedAt: 2,
          },
        ],
      })
      .mockReturnValueOnce({
        sessionId: 'dsh-session-1',
        currentTurn: undefined,
        tools: [],
        events: [
          {
            kind: 'turn',
            sessionId: 'dsh-session-1',
            turn: 1,
            phase: 'end',
            startedAt: 1,
            completedAt: 2,
          },
          {
            kind: 'message',
            sessionId: 'dsh-session-1',
            role: 'assistant',
            turn: 2,
            step: 1,
            text: 'Character reply',
            messageId: 'message-2',
            state: 'final',
          },
          {
            kind: 'turn',
            sessionId: 'dsh-session-1',
            turn: 2,
            phase: 'end',
            startedAt: 3,
            completedAt: 4,
          },
        ],
      });

    await expect(
      fixture.service.submitTurn({
        requestId: 'request-2',
        conversationId: 'conversation:character:run-1',
        message: 'Keep original whitespace.  ',
        contextPayloads: [
          {
            type: 'character',
            id: 'run-1',
            label: 'Neko',
            summary: 'Frozen context',
            data: { text: '{}' },
          },
        ],
      }),
    ).resolves.toEqual({
      turnId: 'dsh-session-1:turn:2',
      content: 'Character reply',
    });
    expect(order).toEqual(['ensure-loaded', 'resolve-context', 'set-context', 'prompt']);
    expect(fixture.conversations.prompt).toHaveBeenCalledWith({
      conversationId: 'conversation:character:run-1',
      prompt: [{ type: 'text', text: 'Keep original whitespace.  ' }],
    });
  });

  it('rejects missing terminal content without using an earlier assistant message', async () => {
    const fixture = createFixture();
    fixture.projection.snapshot
      .mockReturnValueOnce({
        sessionId: 'dsh-session-1',
        currentTurn: undefined,
        tools: [],
        events: [],
      })
      .mockReturnValueOnce({
        sessionId: 'dsh-session-1',
        currentTurn: undefined,
        tools: [],
        events: [
          {
            kind: 'turn',
            sessionId: 'dsh-session-1',
            turn: 2,
            phase: 'end',
            startedAt: 3,
            completedAt: 4,
          },
        ],
      });

    await expect(
      fixture.service.submitTurn({
        requestId: 'request-2',
        conversationId: 'conversation:character:run-1',
        message: 'Hello',
        contextPayloads: [],
      }),
    ).rejects.toThrow(/without final assistant content/u);
  });

  it('archives a published record through the package-owned archive application', async () => {
    const fixture = createFixture();

    await expect(
      fixture.service.archivePublishedConversation('conversation:character:run-1'),
    ).resolves.toBeUndefined();
    expect(fixture.archive.archiveConversation).toHaveBeenCalledWith(
      'conversation:character:run-1',
    );
    expect(fixture.conversations.prompt).not.toHaveBeenCalled();
  });
});

function createFixture(order: string[] = []) {
  const turnCanvasTargets = createDshTurnCanvasTargetOwner();
  const publication = {
    publish: vi.fn(async (input: { readonly conversationId?: string }) => ({
      conversationId: input.conversationId ?? 'generated',
      dshSessionId: 'dsh-session-1',
    })),
  };
  const conversations = {
    ensureLoaded: vi.fn(async () => {
      order.push('ensure-loaded');
      return 'dsh-session-1';
    }),
    setSessionContext: vi.fn(async () => {
      order.push('set-context');
    }),
    prompt: vi.fn(async () => {
      order.push('prompt');
      turnCanvasTargets.bindStartedTurn('dsh-session-1', 2);
      return { stopReason: 'end_turn' as const };
    }),
  };
  const turnContext = {
    resolve: vi.fn(async () => {
      order.push('resolve-context');
      return 'Frozen product context';
    }),
  };
  const projection = {
    snapshot: vi.fn(() => ({
      sessionId: 'dsh-session-1',
      currentTurn: undefined,
      tools: [],
      events: [],
    })),
  };
  const archive = {
    archiveConversation: vi.fn(async () => undefined),
  };
  return {
    publication,
    archive,
    conversations,
    turnContext,
    projection,
    service: createDshDomainConversationService({
      publication,
      archive,
      conversations,
      turnContext,
      turnCanvasTargets,
      projection,
    }),
  };
}
