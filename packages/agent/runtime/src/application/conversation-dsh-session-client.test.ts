import { describe, expect, it, vi } from 'vitest';

import { createConversationId } from '../session/conversation-id';
import {
  createConversationDshSessionBoundClient,
  type ConversationDshSessionAcpClient,
} from './conversation-dsh-session-client';
import {
  createConversationDshSessionBindingService,
  type ConversationDshSessionBindingRecord,
  type ConversationDshSessionBindingStore,
  type DshSessionResolvabilityPort,
} from './conversation-dsh-session-binding';

describe('Conversation DSH Session bound client', () => {
  it('resolves the exact binding before delegating loadSession to the ACP client', async () => {
    const conversationId = createConversationId('/workspace/a');
    const dshSessionId = 'dsh-session-a';
    const fixture = createFixture({ resolvableSessions: [dshSessionId] });
    await fixture.binding.bind({ conversationId, dshSessionId });
    const bound = createConversationDshSessionBoundClient({
      client: fixture.client,
      binding: fixture.binding,
      resolveCwd: resolveTestCwd,
    });

    await bound.loadSession({
      conversationId,
      mcpServers: [],
    });

    expect(fixture.client.loadSession).toHaveBeenCalledWith({
      mcpServers: [],
      sessionId: dshSessionId,
      cwd: '/workspace',
    });
  });

  it.each([
    {
      name: 'loadSession',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.loadSession({ conversationId, mcpServers: [] }),
      expectedMethod: 'loadSession' as const,
      expectedArgs: { mcpServers: [], sessionId: 'dsh-session-table', cwd: '/workspace' },
    },
    {
      name: 'resumeSession',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.resumeSession({ conversationId, mcpServers: [] }),
      expectedMethod: 'resumeSession' as const,
      expectedArgs: { mcpServers: [], sessionId: 'dsh-session-table', cwd: '/workspace' },
    },
    {
      name: 'closeSession',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.closeSession(conversationId),
      expectedMethod: 'closeSession' as const,
      expectedArgs: 'dsh-session-table',
    },
    {
      name: 'setSessionMode',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.setSessionMode(conversationId, 'auto'),
      expectedMethod: 'setSessionMode' as const,
      expectedArgs: { sessionId: 'dsh-session-table', modeId: 'auto' },
    },
    {
      name: 'setSessionConfigOption',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) =>
        bound.setSessionConfigOption(
          conversationId,
          'model',
          '["deepseek-official","deepseek-v4",8192]',
        ),
      expectedMethod: 'setSessionConfigOption' as const,
      expectedArgs: {
        sessionId: 'dsh-session-table',
        configId: 'model',
        value: '["deepseek-official","deepseek-v4",8192]',
      },
    },
    {
      name: 'prompt',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.prompt({ conversationId, prompt: [{ type: 'text', text: 'hi' }] }),
      expectedMethod: 'prompt' as const,
      expectedArgs: { prompt: [{ type: 'text', text: 'hi' }], sessionId: 'dsh-session-table' },
    },
    {
      name: 'cancel',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.cancel(conversationId),
      expectedMethod: 'cancel' as const,
      expectedArgs: 'dsh-session-table',
    },
    {
      name: 'readInbox',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.readInbox(conversationId),
      expectedMethod: 'readInbox' as const,
      expectedArgs: 'dsh-session-table',
    },
    {
      name: 'readImageAttachment',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.readImageAttachment(conversationId, 'attachment-1'),
      expectedMethod: 'readImageAttachment' as const,
      expectedArgs: { sessionId: 'dsh-session-table', attachmentId: 'attachment-1' },
    },
    {
      name: 'enqueueInboxMessage',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) =>
        bound.enqueueInboxMessage({
          conversationId,
          prompt: [{ type: 'text', text: 'next' }],
          displayContent: [{ type: 'text', text: 'next' }],
          contextText: 'workspace context',
        }),
      expectedMethod: 'enqueueInboxMessage' as const,
      expectedArgs: {
        sessionId: 'dsh-session-table',
        prompt: [{ type: 'text', text: 'next' }],
        displayContent: [{ type: 'text', text: 'next' }],
        contextText: 'workspace context',
      },
    },
    {
      name: 'replaceInboxMessage',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) =>
        bound.replaceInboxMessage({
          conversationId,
          messageId: 'message-1',
          content: [{ type: 'text', text: 'x' }],
        }),
      expectedMethod: 'replaceInboxMessage' as const,
      expectedArgs: {
        messageId: 'message-1',
        content: [{ type: 'text', text: 'x' }],
        sessionId: 'dsh-session-table',
      },
    },
    {
      name: 'removeInboxMessage',
      invoke: (
        bound: ReturnType<typeof createConversationDshSessionBoundClient>,
        conversationId: string,
      ) => bound.removeInboxMessage({ conversationId, messageId: 'message-1' }),
      expectedMethod: 'removeInboxMessage' as const,
      expectedArgs: { messageId: 'message-1', sessionId: 'dsh-session-table' },
    },
  ])(
    'delegates $name with the exact bound session id and preserved arguments',
    async ({ invoke, expectedMethod, expectedArgs }) => {
      const conversationId = createConversationId('/workspace/table');
      const dshSessionId = 'dsh-session-table';
      const fixture = createFixture({ resolvableSessions: [dshSessionId] });
      await fixture.binding.bind({ conversationId, dshSessionId });
      const bound = createConversationDshSessionBoundClient({
        client: fixture.client,
        binding: fixture.binding,
        resolveCwd: resolveTestCwd,
      });

      await invoke(bound, conversationId);

      expect(fixture.client[expectedMethod]).toHaveBeenCalledWith(expectedArgs);
    },
  );

  it('fails before transport when the Conversation has no binding', async () => {
    const conversationId = createConversationId('/workspace/missing');
    const fixture = createFixture({ resolvableSessions: ['dsh-session-other'] });
    const bound = createConversationDshSessionBoundClient({
      client: fixture.client,
      binding: fixture.binding,
      resolveCwd: resolveTestCwd,
    });

    await expect(bound.loadSession({ conversationId, mcpServers: [] })).rejects.toThrow(
      /CONVERSATION_BINDING_MISSING/,
    );
    expect(fixture.client.loadSession).not.toHaveBeenCalled();
  });

  it('fails before transport when the bound DSH Session is not resolvable', async () => {
    const conversationId = createConversationId('/workspace/stale');
    const dshSessionId = 'dsh-session-stale';
    const resolvable = new Set([dshSessionId]);
    const fixture = createFixture({
      resolvableSessions: resolvable,
      statusPort: {
        async isResolvable(candidate: string) {
          return resolvable.has(candidate);
        },
      },
    });
    await fixture.binding.bind({ conversationId, dshSessionId });
    resolvable.delete(dshSessionId);
    const bound = createConversationDshSessionBoundClient({
      client: fixture.client,
      binding: fixture.binding,
      resolveCwd: resolveTestCwd,
    });

    await expect(bound.loadSession({ conversationId, mcpServers: [] })).rejects.toThrow(
      /DSH_SESSION_STALE/,
    );
    expect(fixture.client.loadSession).not.toHaveBeenCalled();
  });

  it('fails before transport on a cross-Conversation store record', async () => {
    const conversationId = createConversationId('/workspace/cross');
    const otherConversation = createConversationId('/workspace/other');
    const fixture = createFixture({ resolvableSessions: ['dsh-session-cross'] });
    await fixture.store.bind({
      conversationId: otherConversation,
      dshSessionId: 'dsh-session-cross',
    });
    fixture.store.byConversation.set(conversationId, {
      conversationId: otherConversation,
      dshSessionId: 'dsh-session-cross',
    });
    const bound = createConversationDshSessionBoundClient({
      client: fixture.client,
      binding: fixture.binding,
      resolveCwd: resolveTestCwd,
    });

    await expect(bound.loadSession({ conversationId, mcpServers: [] })).rejects.toThrow(
      /CONVERSATION_BINDING_CROSS_CONVERSATION/,
    );
    expect(fixture.client.loadSession).not.toHaveBeenCalled();
  });

  it('keeps a sibling Conversation usable when another binding is stale', async () => {
    const firstConversation = createConversationId('/workspace/a');
    const secondConversation = createConversationId('/workspace/b');
    const firstSession = 'dsh-session-a';
    const secondSession = 'dsh-session-b';
    const resolvable = new Set([firstSession, secondSession]);
    const fixture = createFixture({
      resolvableSessions: resolvable,
      statusPort: {
        async isResolvable(dshSessionId: string) {
          return resolvable.has(dshSessionId);
        },
      },
    });
    await fixture.binding.bind({ conversationId: firstConversation, dshSessionId: firstSession });
    await fixture.binding.bind({ conversationId: secondConversation, dshSessionId: secondSession });
    const bound = createConversationDshSessionBoundClient({
      client: fixture.client,
      binding: fixture.binding,
      resolveCwd: resolveTestCwd,
    });

    resolvable.delete(firstSession);
    await expect(
      bound.loadSession({ conversationId: firstConversation, mcpServers: [] }),
    ).rejects.toThrow(/DSH_SESSION_STALE/);
    await bound.loadSession({
      conversationId: secondConversation,
      mcpServers: [],
    });
    expect(fixture.client.loadSession).toHaveBeenCalledWith({
      mcpServers: [],
      sessionId: secondSession,
      cwd: '/workspace',
    });
  });

  it('does not fall back to any active/current session when binding is missing', async () => {
    const conversationId = createConversationId('/workspace/no-fallback');
    const fixture = createFixture({ resolvableSessions: ['dsh-session-other'] });
    const bound = createConversationDshSessionBoundClient({
      client: fixture.client,
      binding: fixture.binding,
      resolveCwd: resolveTestCwd,
    });

    await expect(
      bound.prompt({ conversationId, prompt: [{ type: 'text', text: 'hello' }] }),
    ).rejects.toThrow(/CONVERSATION_BINDING_MISSING/);
    expect(fixture.client.prompt).not.toHaveBeenCalled();
  });
});

function createFixture(
  options: {
    readonly resolvableSessions?: readonly string[] | Set<string>;
    readonly statusPort?: DshSessionResolvabilityPort;
  } = {},
) {
  const resolvable =
    options.resolvableSessions instanceof Set
      ? options.resolvableSessions
      : new Set(options.resolvableSessions ?? []);
  const store = createMemoryStore();
  const binding = createConversationDshSessionBindingService({
    store,
    sessions:
      options.statusPort ??
      ({
        async isResolvable(dshSessionId: string) {
          return resolvable.has(dshSessionId);
        },
      } satisfies DshSessionResolvabilityPort),
  });
  const client = {
    loadSession: vi.fn(async () => ({})),
    resumeSession: vi.fn(async () => ({})),
    closeSession: vi.fn(async () => undefined),
    setSessionMode: vi.fn(async () => ({})),
    setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
    prompt: vi.fn(async () => ({ stopReason: 'end_turn' })),
    cancel: vi.fn(async () => undefined),
    setSessionContext: vi.fn(async () => undefined),
    readInbox: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    readImageAttachment: vi.fn(async () => ({
      attachment: {
        attachmentId: 'attachment-1',
        mediaType: 'image/png' as const,
        bytes: 4,
        width: 1,
        height: 1,
      },
      data: 'YWJjZA==',
    })),
    enqueueInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    replaceInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    removeInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
  } satisfies ConversationDshSessionAcpClient;
  return { store, binding, client };
}

async function resolveTestCwd(): Promise<string> {
  return '/workspace';
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
      if (existingConversation?.dshSessionId === record.dshSessionId) {
        return { ok: true, binding: existingConversation, created: false };
      }
      const existingSession = bySession.get(record.dshSessionId);
      if (existingSession?.conversationId === record.conversationId) {
        return { ok: true, binding: existingSession, created: false };
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
      if (current === undefined) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_MISSING',
          message: `Conversation has no binding: ${expected.conversationId}`,
        };
      }
      if (current.dshSessionId !== expected.dshSessionId) {
        return {
          ok: false,
          code: 'CONVERSATION_BINDING_MISMATCH',
          message: `Conversation binding changed before unbind: ${expected.conversationId}`,
        };
      }
      byConversation.delete(expected.conversationId);
      bySession.delete(expected.dshSessionId);
      return { ok: true };
    },
  };
}
