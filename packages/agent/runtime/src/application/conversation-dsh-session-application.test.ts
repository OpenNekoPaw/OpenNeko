import type { ListSessionsRequest, ListSessionsResponse } from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';

import { createConversationId } from '../session/conversation-id';
import type {
  ConversationDshSessionBindingRecord,
  ConversationDshSessionBindingStore,
} from './conversation-dsh-session-binding';
import type { ConversationDshSessionAcpClient } from './conversation-dsh-session-client';
import {
  createConversationDshSessionApplication,
  createDshSessionResolvabilityPort,
  type DshSessionCatalogAcpClient,
} from './conversation-dsh-session-application';

describe('Conversation DSH Session application composition', () => {
  it('binds only a Session proven by the complete ACP catalog and delegates by exact identity', async () => {
    const conversationId = createConversationId('/workspace/qualified');
    const client = createClient([
      {
        sessions: [{ sessionId: 'session-other', cwd: '/workspace' }],
        nextCursor: 'next',
      },
      { sessions: [{ sessionId: 'session-qualified', cwd: '/workspace' }] },
    ]);
    const application = createConversationDshSessionApplication({
      client,
      store: createMemoryStore(),
      ...applicationFixture(conversationId),
    });

    await expect(
      application.binding.bind({ conversationId, dshSessionId: 'session-qualified' }),
    ).resolves.toMatchObject({ ok: true });
    await application.conversations.prompt({
      conversationId,
      prompt: [{ type: 'text', text: 'hello' }],
    });

    expect(client.listSessions).toHaveBeenNthCalledWith(1, {});
    expect(client.listSessions).toHaveBeenNthCalledWith(2, { cursor: 'next' });
    expect(client.prompt).toHaveBeenCalledWith({
      sessionId: 'session-qualified',
      prompt: [{ type: 'text', text: 'hello' }],
    });
  });

  it('rejects an absent Session before the binding store can publish it', async () => {
    const conversationId = createConversationId('/workspace/missing');
    const store = createMemoryStore();
    const client = createClient([
      { sessions: [{ sessionId: 'session-other', cwd: '/workspace' }] },
    ]);
    const application = createConversationDshSessionApplication({
      client,
      store,
      ...applicationFixture(conversationId),
    });

    await expect(
      application.binding.bind({ conversationId, dshSessionId: 'session-missing' }),
    ).resolves.toMatchObject({ ok: false, code: 'DSH_SESSION_STALE' });
    expect(store.byConversation.size).toBe(0);
    expect(client.prompt).not.toHaveBeenCalled();
  });

  it('rejects duplicate Session identities instead of accepting ambiguous authority', async () => {
    const client = createClient([
      {
        sessions: [{ sessionId: 'session-duplicate', cwd: '/workspace' }],
        nextCursor: 'next',
      },
      { sessions: [{ sessionId: 'session-duplicate', cwd: '/workspace' }] },
    ]);
    const sessions = createDshSessionResolvabilityPort(client);

    await expect(sessions.isResolvable('session-duplicate')).rejects.toThrow(
      /duplicate Session session-duplicate/,
    );
  });

  it('rejects repeated and empty continuation cursors fail-locally', async () => {
    const repeated = createDshSessionResolvabilityPort(
      createClient([
        { sessions: [], nextCursor: 'same' },
        { sessions: [], nextCursor: 'same' },
      ]),
    );
    const empty = createDshSessionResolvabilityPort(
      createClient([{ sessions: [], nextCursor: '' }]),
    );

    await expect(repeated.isResolvable('session')).rejects.toThrow(/repeated continuation cursor/);
    await expect(empty.isResolvable('session')).rejects.toThrow(/empty continuation cursor/);
  });

  it('never substitutes a listed active or recent Session for the requested identity', async () => {
    const client = createClient([
      {
        sessions: [
          { sessionId: 'session-active', cwd: '/workspace', title: 'Active' },
          { sessionId: 'session-recent', cwd: '/workspace', title: 'Recent' },
        ],
      },
    ]);
    const sessions = createDshSessionResolvabilityPort(client);

    await expect(sessions.isResolvable('session-requested')).resolves.toBe(false);
  });
});

function createClient(pages: readonly ListSessionsResponse[]): ConversationDshSessionAcpClient &
  DshSessionCatalogAcpClient & {
    readonly listSessions: ReturnType<typeof vi.fn>;
    readonly prompt: ReturnType<typeof vi.fn>;
  } {
  const listSessions = vi.fn(async (input: ListSessionsRequest = {}) => {
    const pageIndex =
      input.cursor === undefined || input.cursor === null
        ? 0
        : pages.findIndex((page) => page.nextCursor === input.cursor) + 1;
    const page = pages[pageIndex];
    if (page === undefined) throw new Error('Unexpected ACP session/list page request.');
    return page;
  });
  const prompt = vi.fn(async () => ({ stopReason: 'end_turn' as const }));
  return {
    listSessions,
    loadSession: vi.fn(async () => ({})),
    resumeSession: vi.fn(async () => ({})),
    closeSession: vi.fn(async () => undefined),
    prompt,
    cancel: vi.fn(async () => undefined),
    setSessionContext: vi.fn(async () => undefined),
    archiveSession: vi.fn(async (sessionId: string) => ({ sessionIds: [sessionId] })),
    readArchivedSessions: vi.fn(async () => ({ sessionIds: [] })),
    readInbox: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    replaceInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    removeInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
  };
}

function applicationFixture(conversationId: string) {
  const record = {
    conversationId,
    title: 'Test conversation',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    context: {
      kind: 'workspace' as const,
      workspaceId: 'workspace:test',
      workspaceGrantId: 'grant:test',
    },
  };
  return {
    catalog: {
      reserve: vi.fn(async () => undefined),
      readCanvasSelection: vi.fn(async () => undefined),
      selectCanvas: vi.fn(async () => undefined),
      get: vi.fn(async (requested: string) => (requested === conversationId ? record : undefined)),
      read: vi.fn(async () => ({ records: [record], diagnostics: [] })),
    },
    staleConversations: {
      discard: vi.fn(async () => undefined),
      discardMissingBinding: vi.fn(async () => undefined),
    },
    conversationIdentitySeed: '/workspace/test',
    activity: {
      snapshot: (sessionId: string) => ({
        sessionId,
        currentTurn: undefined,
        events: [],
        tools: [],
      }),
    },
    lookupCwd: { resolve: async () => '/workspace' },
  };
}

function createMemoryStore(): ConversationDshSessionBindingStore & {
  readonly byConversation: Map<string, ConversationDshSessionBindingRecord>;
  readonly bySession: Map<string, ConversationDshSessionBindingRecord>;
} {
  const byConversation = new Map<string, ConversationDshSessionBindingRecord>();
  const bySession = new Map<string, ConversationDshSessionBindingRecord>();
  return {
    byConversation,
    bySession,
    async get(conversationId) {
      return byConversation.get(conversationId);
    },
    async getByDshSessionId(dshSessionId) {
      return bySession.get(dshSessionId);
    },
    async bind(record) {
      const existingConversation = byConversation.get(record.conversationId);
      const existingSession = bySession.get(record.dshSessionId);
      if (existingConversation?.dshSessionId === record.dshSessionId) {
        return { ok: true, binding: existingConversation, created: false };
      }
      if (existingConversation !== undefined) {
        return {
          ok: false,
          code: 'CONVERSATION_ALREADY_BOUND',
          message: `Conversation is already bound to ${existingConversation.dshSessionId}.`,
        };
      }
      if (existingSession !== undefined) {
        return {
          ok: false,
          code: 'DSH_SESSION_ALREADY_BOUND',
          message: `DSH Session is already bound to ${existingSession.conversationId}.`,
        };
      }
      byConversation.set(record.conversationId, record);
      bySession.set(record.dshSessionId, record);
      return { ok: true, binding: record, created: true };
    },
    async unbind(expected) {
      const current = byConversation.get(expected.conversationId);
      if (current?.dshSessionId !== expected.dshSessionId) {
        return {
          ok: false,
          code:
            current === undefined
              ? 'CONVERSATION_BINDING_MISSING'
              : 'CONVERSATION_BINDING_MISMATCH',
          message: `Conversation binding cannot be removed: ${expected.conversationId}.`,
        };
      }
      byConversation.delete(expected.conversationId);
      bySession.delete(expected.dshSessionId);
      return { ok: true };
    },
  };
}
