import { describe, expect, it, vi } from 'vitest';

import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';
import { createDshConversationHomeProjection } from './dsh-conversation-home-projection';
import { DshAcpProjection } from '../acp/dsh-acp-projection';

describe('DSH Conversation Home projection', () => {
  it('projects bound and unpublished records while isolating an invalid sibling', async () => {
    const catalog = catalogWith([
      record('conversation-workspace', {
        kind: 'workspace',
        workspaceId: 'workspace:one',
        workspaceGrantId: 'grant:one',
      }),
      record('conversation-assistant', {
        kind: 'assistant',
        assistantSpaceId: 'assistant:one',
        baseGrantIds: [],
      }),
      record('conversation-invalid', {
        kind: 'character',
        characterId: 'character:one',
        characterVersionId: 'character-version:one',
      }),
    ]);
    const home = createDshConversationHomeProjection({
      catalog,
      bindings: {
        async get(conversationId) {
          return conversationId === 'conversation-workspace'
            ? { conversationId, dshSessionId: 'dsh-session-one' }
            : undefined;
        },
      },
      archivedSessions: unarchivedSessions(),
      activity: idleActivity(),
    });
    const listener = vi.fn();
    home.subscribeHomeProjection(listener);

    await home.refresh();

    expect(home.readHomeProjection().conversations).toEqual([
      expect.objectContaining({
        navigation: {
          conversationId: 'conversation-workspace',
          owner: { kind: 'workspace', workspaceId: 'workspace:one' },
        },
      }),
      expect.objectContaining({
        navigation: {
          conversationId: 'conversation-assistant',
          owner: { kind: 'assistant', assistantSpaceId: 'assistant:one' },
        },
        unavailable: expect.objectContaining({ fieldNames: ['dshSessionId'] }),
      }),
    ]);
    expect(home.readHomeProjection().diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-conversation-record',
        conversationId: 'conversation-invalid',
      }),
    ]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('keeps a sibling visible when one binding read fails', async () => {
    const home = createDshConversationHomeProjection({
      catalog: catalogWith([
        record('conversation-failed', {
          kind: 'workspace',
          workspaceId: 'workspace:failed',
          workspaceGrantId: 'grant:failed',
        }),
        record('conversation-sibling', {
          kind: 'workspace',
          workspaceId: 'workspace:sibling',
          workspaceGrantId: 'grant:sibling',
        }),
      ]),
      bindings: {
        async get(conversationId) {
          if (conversationId === 'conversation-failed') throw new Error('Binding row is invalid.');
          return { conversationId, dshSessionId: 'dsh-session-sibling' };
        },
      },
      archivedSessions: unarchivedSessions(),
      activity: idleActivity(),
    });

    await home.refresh();

    expect(home.readHomeProjection().conversations).toHaveLength(2);
    expect(home.readHomeProjection().conversations[0]?.unavailable?.message).toBe(
      'Binding row is invalid.',
    );
    expect(home.readHomeProjection().conversations[1]?.unavailable).toBeUndefined();
  });

  it('projects the live DSH turn and its terminal outcome for sidebar status', async () => {
    const activity = new DshAcpProjection();
    activity.acceptSessionEvent({
      sessionId: 'dsh-session-one',
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 4 },
      replay: false,
    });
    const home = createDshConversationHomeProjection({
      catalog: catalogWith([
        record('conversation-workspace', {
          kind: 'workspace',
          workspaceId: 'workspace:one',
          workspaceGrantId: 'grant:one',
        }),
      ]),
      bindings: {
        async get(conversationId) {
          return { conversationId, dshSessionId: 'dsh-session-one' };
        },
      },
      archivedSessions: unarchivedSessions(),
      activity,
    });

    await home.refresh();
    expect(home.readHomeProjection()).toMatchObject({
      attention: { running: 1 },
      conversations: [
        {
          attention: 'running',
          lastActivity: { kind: 'turn-running', dshSessionId: 'dsh-session-one', turn: 4 },
        },
      ],
    });

    activity.acceptSessionEvent({
      sessionId: 'dsh-session-one',
      sequence: 1,
      time: 2_000,
      type: 'turn/end',
      data: { turn: 4, reason: { kind: 'completed' } },
      replay: false,
    });
    await home.refresh();
    expect(home.readHomeProjection()).toMatchObject({
      attention: { running: 0 },
      conversations: [
        {
          attention: 'none',
          lastActivity: { kind: 'turn-completed', dshSessionId: 'dsh-session-one', turn: 4 },
        },
      ],
    });
  });

  it('filters only records whose exact DSH Session is archived', async () => {
    const home = createDshConversationHomeProjection({
      catalog: catalogWith([
        record('conversation-archived', {
          kind: 'assistant',
          assistantSpaceId: 'assistant:one',
          baseGrantIds: [],
        }),
        record('conversation-visible', {
          kind: 'assistant',
          assistantSpaceId: 'assistant:one',
          baseGrantIds: [],
        }),
      ]),
      bindings: {
        async get(conversationId) {
          return {
            conversationId,
            dshSessionId:
              conversationId === 'conversation-archived' ? 'dsh-archived' : 'dsh-visible',
          };
        },
      },
      archivedSessions: {
        readArchivedSessions: async () => ({ sessionIds: ['dsh-archived'] }),
      },
      activity: idleActivity(),
    });

    await home.refresh();

    expect(
      home.readHomeProjection().conversations.map((item) => item.navigation.conversationId),
    ).toEqual(['conversation-visible']);
  });
});

function unarchivedSessions() {
  return { readArchivedSessions: async () => ({ sessionIds: [] }) };
}

function idleActivity() {
  return {
    snapshot(sessionId: string) {
      return { sessionId, currentTurn: undefined, events: [], tools: [] };
    },
  };
}

function catalogWith(
  records: Awaited<ReturnType<DshConversationCatalogStore['read']>>['records'],
): DshConversationCatalogStore {
  return {
    reserve: vi.fn(async () => undefined),
    get: vi.fn(async (conversationId: string) =>
      records.find((record) => record.conversationId === conversationId),
    ),
    read: vi.fn(async () => ({ records, diagnostics: [] })),
  };
}

function record(
  conversationId: string,
  context: Awaited<ReturnType<DshConversationCatalogStore['read']>>['records'][number]['context'],
) {
  return {
    conversationId,
    title: conversationId,
    createdAt: '2026-08-19T01:00:00.000Z',
    updatedAt: '2026-08-19T01:00:00.000Z',
    context,
  };
}
