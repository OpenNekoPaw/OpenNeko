import { describe, expect, it, vi } from 'vitest';

import { createConversationDshSessionApplication } from './conversation-dsh-session-application';
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
    readInbox: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    replaceInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
    removeInboxMessage: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
  };
}
