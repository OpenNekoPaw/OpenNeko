import { describe, expect, it, vi } from 'vitest';

import { createConversationId } from '../session/conversation-id';
import { createConversationDshSessionApplication } from './conversation-dsh-session-application';
import { projectDshConversationTitle } from './conversation-dsh-session-publication';
import type { ConversationDshSessionBindingStore } from './conversation-dsh-session-binding';
import type {
  DshConversationCatalogRecord,
  DshConversationCatalogStore,
} from './dsh-conversation-catalog-repository';

describe('Conversation DSH Session publication', () => {
  it('reserves before session/new and publishes only after complete session/list verification', async () => {
    const order: string[] = [];
    const catalog = memoryCatalog(order);
    const store = memoryBindingStore(order);
    const client = clientWith({ order });
    const application = createConversationDshSessionApplication({
      client,
      store,
      catalog,
      staleConversations: memoryStaleCleanup(catalog, store),
      conversationIdentitySeed: '/workspace/publication',
      activity: idleActivity(),
    });

    const result = await application.publication.publish({
      title: 'New conversation',
      context: {
        kind: 'workspace',
        workspaceId: 'workspace:one',
        workspaceGrantId: 'grant:one',
      },
    });

    expect(result.dshSessionId).toBe('dsh-session-new');
    expect(order.filter((entry) => entry !== 'catalog-read')).toEqual([
      'catalog-reserve',
      'session-new',
      'session-close',
      'session-resume',
      'session-list',
      'binding-write',
    ]);
    expect(catalog.records).toHaveLength(1);
    await expect(application.catalog.get(result.conversationId)).resolves.toMatchObject({
      title: 'New conversation',
    });
    expect(store.records.get(result.conversationId)).toEqual({
      conversationId: result.conversationId,
      dshSessionId: 'dsh-session-new',
    });
  });

  it('keeps the Host catalog record unavailable when session/new fails', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    const application = createConversationDshSessionApplication({
      client: clientWith({ createError: new Error('session/new failed') }),
      store,
      catalog,
      staleConversations: memoryStaleCleanup(catalog, store),
      conversationIdentitySeed: '/workspace/create-failure',
      activity: idleActivity(),
    });

    await expect(
      application.publication.publish({
        title: 'Failed conversation',
        context: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:one',
          baseGrantIds: [],
        },
      }),
    ).rejects.toThrow('session/new failed');
    expect(catalog.records).toHaveLength(1);
    expect(application.home.readHomeProjection().conversations[0]?.unavailable).toEqual(
      expect.objectContaining({ fieldNames: ['dshSessionId'] }),
    );
  });

  it('keeps the Host catalog record unavailable when binding publication is rejected', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    store.bind = vi.fn(async () => ({
      ok: false as const,
      code: 'DSH_SESSION_ALREADY_BOUND' as const,
      message: 'Session already belongs to a sibling.',
    }));
    const application = createConversationDshSessionApplication({
      client: clientWith({}),
      store,
      catalog,
      staleConversations: memoryStaleCleanup(catalog, store),
      conversationIdentitySeed: '/workspace/bind-failure',
      activity: idleActivity(),
    });

    await expect(
      application.publication.publish({
        title: 'Rejected conversation',
        context: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:one',
          baseGrantIds: [],
        },
      }),
    ).rejects.toThrow(/DSH_SESSION_ALREADY_BOUND/u);
    expect(catalog.records).toHaveLength(1);
    expect(application.home.readHomeProjection().conversations[0]?.unavailable).toBeDefined();
  });

  it('publishes a caller-owned exact Conversation identity without generating another one', async () => {
    const conversationId = createConversationId('/workspace/character', {
      now: 1,
      random: new Uint8Array(10),
    });
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    const application = createConversationDshSessionApplication({
      client: clientWith({}),
      store,
      catalog,
      staleConversations: memoryStaleCleanup(catalog, store),
      conversationIdentitySeed: '/workspace/exact',
      activity: idleActivity(),
    });

    await expect(
      application.publication.publish({
        conversationId,
        title: 'Neko',
        context: {
          kind: 'character',
          characterId: 'character-1',
          characterVersionId: 'version-1',
          characterRunId: 'run-1',
          dialogueRunId: 'dialogue-1',
        },
      }),
    ).resolves.toEqual({
      conversationId,
      dshSessionId: 'dsh-session-new',
    });
    expect(catalog.records[0]?.conversationId).toBe(conversationId);
  });

  it('archives the exact bound Session and removes only its Home projection', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    const client = clientWith({});
    const staleConversations = memoryStaleCleanup(catalog, store);
    const application = createConversationDshSessionApplication({
      client,
      store,
      catalog,
      staleConversations,
      conversationIdentitySeed: '/workspace/archive',
      activity: idleActivity(),
    });
    const published = await application.publication.publish({
      title: 'Archive me',
      context: { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] },
    });

    await application.archive.archiveConversation(published.conversationId);
    await application.archive.archiveConversation(published.conversationId);

    expect(client.archiveSession).toHaveBeenNthCalledWith(1, published.dshSessionId);
    expect(client.archiveSession).toHaveBeenNthCalledWith(2, published.dshSessionId);
    await expect(client.readArchivedSessions()).resolves.toEqual({
      sessionIds: [published.dshSessionId],
    });
    expect(application.home.readHomeProjection().conversations).toEqual([]);
    await expect(application.catalog.get(published.conversationId)).resolves.toBeDefined();
    expect(staleConversations.discard).not.toHaveBeenCalled();
  });

  it('discards an exact stale old record without invoking DSH archive', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    const client = clientWith({});
    const staleConversations = memoryStaleCleanup(catalog, store);
    const application = createConversationDshSessionApplication({
      client,
      store,
      catalog,
      staleConversations,
      conversationIdentitySeed: '/workspace/stale',
      activity: idleActivity(),
    });
    const published = await application.publication.publish({
      title: 'Stale conversation',
      context: { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] },
    });
    client.sessionIds.clear();

    await application.archive.archiveConversation(published.conversationId);

    expect(staleConversations.discard).toHaveBeenCalledWith({
      conversationId: published.conversationId,
      dshSessionId: published.dshSessionId,
    });
    expect(client.archiveSession).not.toHaveBeenCalled();
    await expect(application.catalog.get(published.conversationId)).resolves.toBeUndefined();
    expect(store.records.has(published.conversationId)).toBe(false);
    expect(application.home.readHomeProjection().conversations).toEqual([]);
  });

  it('derives a bounded title from the canonical first Composer input', () => {
    expect(
      projectDshConversationTitle({
        kind: 'message',
        text: '  请分析\n当前工作区的角色设定  ',
        references: [],
        images: [],
        contextPayloads: [],
      }),
    ).toBe('请分析 当前工作区的角色设定');
    expect(
      projectDshConversationTitle({
        kind: 'message',
        text: '',
        references: [
          {
            label: '角色设定.md',
            contentLocator: { file: { authority: 'workspace', path: '角色设定.md' } },
          },
        ],
        images: [],
        contextPayloads: [],
      }),
    ).toBe('角色设定.md');
    expect(projectDshConversationTitle({ kind: 'command', line: '/goal clear' })).toBe(
      '/goal clear',
    );
    expect(
      projectDshConversationTitle({
        kind: 'skill',
        skillName: 'storyboard',
        displayText: '$storyboard Draft three beats',
        args: 'Draft three beats',
      }),
    ).toBe('$storyboard Draft three beats');
    expect(
      projectDshConversationTitle({
        kind: 'message',
        text: 'Create a storyboard shot list for the rainy rooftop chase with lighting notes',
        references: [],
        images: [],
        contextPayloads: [],
      }),
    ).toBe('Create a storyboard shot list for the rainy...');
  });
});

function memoryCatalog(order: string[]): DshConversationCatalogStore & {
  readonly records: DshConversationCatalogRecord[];
} {
  const records: DshConversationCatalogRecord[] = [];
  return {
    records,
    async reserve(record) {
      order.push('catalog-reserve');
      records.push(record);
    },
    async get(conversationId) {
      return records.find((record) => record.conversationId === conversationId);
    },
    async read() {
      order.push('catalog-read');
      return { records, diagnostics: [] };
    },
  };
}

function memoryBindingStore(order: string[]): ConversationDshSessionBindingStore & {
  records: Map<string, { readonly conversationId: string; readonly dshSessionId: string }>;
} {
  const records = new Map<
    string,
    { readonly conversationId: string; readonly dshSessionId: string }
  >();
  return {
    records,
    async get(id) {
      return records.get(id);
    },
    async getByDshSessionId(id) {
      return [...records.values()].find((record) => record.dshSessionId === id);
    },
    async bind(record) {
      order.push('binding-write');
      records.set(record.conversationId, record);
      return { ok: true, binding: record, created: true };
    },
    async unbind(record) {
      records.delete(record.conversationId);
      return { ok: true };
    },
  };
}

function memoryStaleCleanup(
  catalog: ReturnType<typeof memoryCatalog>,
  store: ReturnType<typeof memoryBindingStore>,
) {
  return {
    discard: vi.fn(
      async (binding: { readonly conversationId: string; readonly dshSessionId: string }) => {
        const current = store.records.get(binding.conversationId);
        if (current?.dshSessionId !== binding.dshSessionId) {
          throw new Error('Stale binding changed before cleanup.');
        }
        const index = catalog.records.findIndex(
          (record) => record.conversationId === binding.conversationId,
        );
        if (index < 0) throw new Error('Stale catalog record is missing.');
        store.records.delete(binding.conversationId);
        catalog.records.splice(index, 1);
      },
    ),
  };
}

function idleActivity() {
  return {
    snapshot(sessionId: string) {
      return { sessionId, currentTurn: undefined, events: [], tools: [] };
    },
  };
}

function clientWith(options: { readonly order?: string[]; readonly createError?: Error }) {
  const order = options.order ?? [];
  const archived = new Set<string>();
  const sessionIds = new Set(['dsh-session-new']);
  return {
    sessionIds,
    async createSession() {
      order.push('session-new');
      if (options.createError) throw options.createError;
      return { sessionId: 'dsh-session-new' };
    },
    async listSessions() {
      order.push('session-list');
      return {
        sessions: [...sessionIds].map((sessionId) => ({ sessionId, cwd: '/workspace' })),
      };
    },
    loadSession: vi.fn(async () => ({})),
    async resumeSession() {
      order.push('session-resume');
      return {};
    },
    async closeSession() {
      order.push('session-close');
    },
    prompt: vi.fn(async () => ({ stopReason: 'end_turn' as const })),
    cancel: vi.fn(async () => undefined),
    archiveSession: vi.fn(async (sessionId: string) => {
      archived.add(sessionId);
      return { sessionIds: [...archived] };
    }),
    readArchivedSessions: vi.fn(async () => ({ sessionIds: [...archived] })),
    readInbox: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    replaceInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    removeInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
  };
}
