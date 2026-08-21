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
      conversationIdentitySeed: '/workspace/publication',
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
    const application = createConversationDshSessionApplication({
      client: clientWith({ createError: new Error('session/new failed') }),
      store: memoryBindingStore([]),
      catalog,
      conversationIdentitySeed: '/workspace/create-failure',
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
      conversationIdentitySeed: '/workspace/bind-failure',
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
    const application = createConversationDshSessionApplication({
      client: clientWith({}),
      store: memoryBindingStore([]),
      catalog,
      conversationIdentitySeed: '/workspace/exact',
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
    const client = clientWith({});
    const application = createConversationDshSessionApplication({
      client,
      store: memoryBindingStore([]),
      catalog,
      conversationIdentitySeed: '/workspace/archive',
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
  });

  it('derives a bounded title from the canonical first Composer input', () => {
    expect(
      projectDshConversationTitle({
        kind: 'message',
        text: '  请分析\n当前工作区的角色设定  ',
        references: [],
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

function clientWith(options: { readonly order?: string[]; readonly createError?: Error }) {
  const order = options.order ?? [];
  const archived = new Set<string>();
  return {
    async createSession() {
      order.push('session-new');
      if (options.createError) throw options.createError;
      return { sessionId: 'dsh-session-new' };
    },
    async listSessions() {
      order.push('session-list');
      return { sessions: [{ sessionId: 'dsh-session-new', cwd: '/workspace' }] };
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
