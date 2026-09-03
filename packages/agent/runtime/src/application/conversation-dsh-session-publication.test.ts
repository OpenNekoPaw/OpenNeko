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
  it('reserves before session/new and publishes the binding before the resumed Session emits notifications', async () => {
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
      lookupCwd: testLookupCwd(),
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
      'session-list',
      'binding-write',
      'session-close',
      'session-resume',
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

  it('makes the reverse Conversation binding visible to notifications emitted by session/resume', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    const conversationId = createConversationId('/workspace/resume-notification', {
      now: 1,
      random: new Uint8Array(10),
    });
    const client = clientWith({
      onResume: async (dshSessionId) => {
        await expect(store.getByDshSessionId(dshSessionId)).resolves.toEqual({
          conversationId,
          dshSessionId,
        });
      },
    });
    const application = createConversationDshSessionApplication({
      client,
      store,
      catalog,
      staleConversations: memoryStaleCleanup(catalog, store),
      conversationIdentitySeed: '/workspace/resume-notification',
      activity: idleActivity(),
      lookupCwd: testLookupCwd(),
    });

    await expect(
      application.publication.publish({
        conversationId,
        title: 'Resume notification',
        context: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:one',
          baseGrantIds: [],
        },
      }),
    ).resolves.toEqual({ conversationId, dshSessionId: 'dsh-session-new' });
  });

  it('publishes a DSH-owned branch as a new Conversation with inherited context', async () => {
    const order: string[] = [];
    const catalog = memoryCatalog(order);
    const store = memoryBindingStore(order);
    const client = clientWith({
      order,
      onLoad: async (dshSessionId) => {
        await expect(store.getByDshSessionId(dshSessionId)).resolves.toMatchObject({
          dshSessionId,
        });
      },
    });
    const application = createConversationDshSessionApplication({
      client,
      store,
      catalog,
      staleConversations: memoryStaleCleanup(catalog, store),
      conversationIdentitySeed: '/workspace/branch',
      activity: idleActivity(),
      lookupCwd: testLookupCwd(),
    });
    const context = {
      kind: 'workspace' as const,
      workspaceId: 'workspace:one',
      workspaceGrantId: 'grant:one',
    };
    const source = await application.publication.publish({ title: 'Source', context });

    const branch = await application.branchConversation({
      sourceConversationId: source.conversationId,
      messageId: 'assistant-1',
    });

    expect(branch.conversationId).not.toBe(source.conversationId);
    expect(branch.dshSessionId).toBe('dsh-session-branch');
    expect(client.branchSession).toHaveBeenCalledWith({
      sessionId: source.dshSessionId,
      messageId: 'assistant-1',
    });
    expect(client.loadSession).toHaveBeenCalledWith({
      sessionId: 'dsh-session-branch',
      cwd: '/workspace',
      mcpServers: [],
    });
    await expect(application.catalog.get(branch.conversationId)).resolves.toMatchObject({
      title: 'Source',
      context,
    });
    expect(store.records.get(branch.conversationId)).toEqual({
      conversationId: branch.conversationId,
      dshSessionId: 'dsh-session-branch',
    });
  });

  it('does not expose a transient missing-binding record while publication is still running', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    let releaseCreate: (() => void) | undefined;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const application = createConversationDshSessionApplication({
      client: clientWith({ onCreate: () => createGate }),
      store,
      catalog,
      staleConversations: memoryStaleCleanup(catalog, store),
      conversationIdentitySeed: '/workspace/publication-visibility',
      activity: idleActivity(),
      lookupCwd: testLookupCwd(),
    });

    const publication = application.publication.publish({
      title: 'Publication in progress',
      context: { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] },
    });
    await vi.waitFor(() => expect(catalog.records).toHaveLength(1));
    expect(application.home.readHomeProjection().conversations).toEqual([]);

    releaseCreate?.();
    await publication;

    expect(application.home.readHomeProjection().conversations).toHaveLength(1);
    expect(application.home.readHomeProjection().conversations[0]?.unavailable).toBeUndefined();
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
      lookupCwd: testLookupCwd(),
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
      lookupCwd: testLookupCwd(),
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
      lookupCwd: testLookupCwd(),
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
      lookupCwd: testLookupCwd(),
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
      lookupCwd: testLookupCwd(),
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

  it('archives an unbound unavailable record through exact local cleanup', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    const client = clientWith({});
    const staleConversations = memoryStaleCleanup(catalog, store);
    const application = createConversationDshSessionApplication({
      client,
      store,
      catalog,
      staleConversations,
      conversationIdentitySeed: '/workspace/unbound-archive',
      activity: idleActivity(),
      lookupCwd: testLookupCwd(),
    });
    const conversationId = createConversationId('/workspace/unbound-archive');
    await catalog.reserve({
      conversationId,
      title: 'Unavailable conversation',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
      context: { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] },
    });
    await application.home.refresh();

    await application.archive.archiveConversation(conversationId);

    expect(staleConversations.discardMissingBinding).toHaveBeenCalledWith(conversationId);
    expect(client.archiveSession).not.toHaveBeenCalled();
    await expect(application.catalog.get(conversationId)).resolves.toBeUndefined();
    expect(application.home.readHomeProjection().conversations).toEqual([]);
  });

  it('deletes only an unavailable record and rejects a resolvable Conversation', async () => {
    const catalog = memoryCatalog([]);
    const store = memoryBindingStore([]);
    const client = clientWith({});
    const staleConversations = memoryStaleCleanup(catalog, store);
    const application = createConversationDshSessionApplication({
      client,
      store,
      catalog,
      staleConversations,
      conversationIdentitySeed: '/workspace/unavailable-delete',
      activity: idleActivity(),
      lookupCwd: testLookupCwd(),
    });
    const unavailableId = createConversationId('/workspace/unavailable-delete');
    await catalog.reserve({
      conversationId: unavailableId,
      title: 'Unavailable conversation',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
      context: { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] },
    });

    await application.archive.deleteUnavailableConversation(unavailableId);

    expect(staleConversations.discardMissingBinding).toHaveBeenCalledWith(unavailableId);
    const published = await application.publication.publish({
      title: 'Healthy conversation',
      context: { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] },
    });
    await expect(
      application.archive.deleteUnavailableConversation(published.conversationId),
    ).rejects.toThrow(/still resolvable/u);
    await expect(application.catalog.get(published.conversationId)).resolves.toBeDefined();
    expect(client.archiveSession).not.toHaveBeenCalled();
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
        kind: 'skills',
        invocations: [{ skillName: 'storyboard' }],
        displayText: '$storyboard Draft three beats',
        promptText: 'Draft three beats',
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
    discardMissingBinding: vi.fn(async (conversationId: string) => {
      if (store.records.has(conversationId)) {
        throw new Error('Conversation gained a binding before cleanup.');
      }
      const index = catalog.records.findIndex((record) => record.conversationId === conversationId);
      if (index < 0) throw new Error('Unbound catalog record is missing.');
      catalog.records.splice(index, 1);
    }),
  };
}

function idleActivity() {
  return {
    snapshot(sessionId: string) {
      return { sessionId, currentTurn: undefined, events: [], tools: [] };
    },
  };
}

function testLookupCwd() {
  return { resolve: async () => '/workspace' };
}

function clientWith(options: {
  readonly order?: string[];
  readonly createError?: Error;
  readonly onCreate?: () => Promise<void>;
  readonly onLoad?: (dshSessionId: string) => Promise<void>;
  readonly onResume?: (dshSessionId: string) => Promise<void>;
}) {
  const order = options.order ?? [];
  const archived = new Set<string>();
  const sessionIds = new Set(['dsh-session-new']);
  return {
    sessionIds,
    async createSession() {
      order.push('session-new');
      await options.onCreate?.();
      if (options.createError) throw options.createError;
      return { sessionId: 'dsh-session-new' };
    },
    branchSession: vi.fn(async () => {
      order.push('session-branch');
      sessionIds.add('dsh-session-branch');
      return { sessionId: 'dsh-session-branch' };
    }),
    async listSessions() {
      order.push('session-list');
      return {
        sessions: [...sessionIds].map((sessionId) => ({ sessionId, cwd: '/workspace' })),
      };
    },
    loadSession: vi.fn(async (input: { readonly sessionId: string }) => {
      order.push('session-load');
      await options.onLoad?.(input.sessionId);
      return {};
    }),
    async resumeSession(input: { readonly sessionId: string }) {
      order.push('session-resume');
      await options.onResume?.(input.sessionId);
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
