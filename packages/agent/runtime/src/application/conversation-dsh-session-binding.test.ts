import { describe, expect, it } from 'vitest';

import { createConversationId } from '../session/conversation-id';
import {
  createConversationDshSessionBindingService,
  type ConversationDshSessionBindingRecord,
  type ConversationDshSessionBindingStore,
  type DshSessionResolvabilityPort,
} from './conversation-dsh-session-binding';

describe('Conversation-to-DSH Session binding', () => {
  it('binds and resolves the exact Conversation and DSH Session identities', async () => {
    const conversationId = createConversationId('/workspace/a');
    const dshSessionId = 'dsh-session-a';
    const { service } = createService({ resolvableSessions: [dshSessionId] });

    await expect(service.bind({ conversationId, dshSessionId })).resolves.toEqual({
      ok: true,
      binding: { conversationId, dshSessionId },
    });
    await expect(service.resolve(conversationId)).resolves.toEqual({
      ok: true,
      binding: { conversationId, dshSessionId },
    });
  });

  it('rejects missing bindings without falling back to any resolvable session', async () => {
    const conversationId = createConversationId('/workspace/missing');
    const { service } = createService({ resolvableSessions: ['dsh-session-other'] });

    await expect(service.resolve(conversationId)).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_MISSING',
      conversationId,
    });
  });

  it('rejects stale DSH Session identity on resolve and on bind', async () => {
    const conversationId = createConversationId('/workspace/stale');
    const dshSessionId = 'dsh-session-stale';
    const created = createService({ resolvableSessions: [] });
    const { service } = created;
    created.store.bind({ conversationId, dshSessionId });

    await expect(service.resolve(conversationId)).resolves.toMatchObject({
      ok: false,
      code: 'DSH_SESSION_STALE',
    });
    await expect(service.bind({ conversationId, dshSessionId })).resolves.toMatchObject({
      ok: false,
      code: 'DSH_SESSION_STALE',
    });
  });

  it('rejects binding one DSH Session to a second Conversation', async () => {
    const firstConversation = createConversationId('/workspace/first');
    const secondConversation = createConversationId('/workspace/second');
    const dshSessionId = 'dsh-session-shared';
    const { service } = createService({ resolvableSessions: [dshSessionId] });

    await service.bind({ conversationId: firstConversation, dshSessionId });
    await expect(
      service.bind({ conversationId: secondConversation, dshSessionId }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'DSH_SESSION_ALREADY_BOUND',
    });
  });

  it('rejects rebinding a Conversation to a different resolvable DSH Session without unbind', async () => {
    const conversationId = createConversationId('/workspace/rebind');
    const firstSession = 'dsh-session-first';
    const secondSession = 'dsh-session-second';
    const { service } = createService({
      resolvableSessions: [firstSession, secondSession],
    });

    await service.bind({ conversationId, dshSessionId: firstSession });
    await expect(
      service.bind({ conversationId, dshSessionId: secondSession }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_ALREADY_BOUND',
    });
  });

  it('keeps sibling bindings usable when one DSH Session becomes unresolvable', async () => {
    const firstConversation = createConversationId('/workspace/a');
    const secondConversation = createConversationId('/workspace/b');
    const firstSession = 'dsh-session-a';
    const secondSession = 'dsh-session-b';
    const resolvable = new Set([firstSession, secondSession]);
    const { service } = createService({
      resolvableSessions: resolvable,
      statusPort: {
        async isResolvable(dshSessionId: string) {
          return resolvable.has(dshSessionId);
        },
      },
    });

    await service.bind({ conversationId: firstConversation, dshSessionId: firstSession });
    await service.bind({ conversationId: secondConversation, dshSessionId: secondSession });

    resolvable.delete(firstSession);
    await expect(service.resolve(firstConversation)).resolves.toMatchObject({
      ok: false,
      code: 'DSH_SESSION_STALE',
    });
    await expect(service.resolve(secondConversation)).resolves.toMatchObject({
      ok: true,
      binding: { conversationId: secondConversation, dshSessionId: secondSession },
    });
  });

  it('unbinds only the exact Conversation binding', async () => {
    const conversationId = createConversationId('/workspace/unbind');
    const { service } = createService({ resolvableSessions: ['dsh-session-unbind'] });
    await service.bind({ conversationId, dshSessionId: 'dsh-session-unbind' });

    await expect(service.unbind(conversationId)).resolves.toEqual({ ok: true });
    await expect(service.resolve(conversationId)).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_MISSING',
    });
    await expect(service.unbind(conversationId)).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_MISSING',
    });
  });

  it('rejects non-canonical Conversation identities', async () => {
    const { service } = createService({ resolvableSessions: ['dsh-session'] });
    await expect(service.resolve('not-a-conversation')).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_INVALID',
    });
    await expect(
      service.bind({ conversationId: 'not-a-conversation', dshSessionId: 'dsh' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_INVALID',
    });
  });

  it('atomically prevents a DSH Session from binding to two Conversations', async () => {
    const firstConversation = createConversationId('/workspace/concurrent-a');
    const secondConversation = createConversationId('/workspace/concurrent-b');
    const dshSessionId = 'dsh-session-concurrent';
    const { service } = createService({ resolvableSessions: [dshSessionId] });

    const results = await Promise.all([
      service.bind({ conversationId: firstConversation, dshSessionId }),
      service.bind({ conversationId: secondConversation, dshSessionId }),
    ]);

    const okCount = results.filter((result) => result.ok).length;
    const conflictCount = results.filter(
      (result) => !result.ok && result.code === 'DSH_SESSION_ALREADY_BOUND',
    ).length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);
  });

  it('atomically prevents a Conversation from binding to two DSH Sessions', async () => {
    const conversationId = createConversationId('/workspace/concurrent-session');
    const firstSession = 'dsh-session-first';
    const secondSession = 'dsh-session-second';
    const { service } = createService({
      resolvableSessions: [firstSession, secondSession],
    });

    const results = await Promise.all([
      service.bind({ conversationId, dshSessionId: firstSession }),
      service.bind({ conversationId, dshSessionId: secondSession }),
    ]);

    const okCount = results.filter((result) => result.ok).length;
    const conflictCount = results.filter(
      (result) => !result.ok && result.code === 'CONVERSATION_BINDING_ALREADY_BOUND',
    ).length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);
  });

  it('rejects a cross-Conversation record returned by the store', async () => {
    const conversationId = createConversationId('/workspace/cross');
    const otherConversation = createConversationId('/workspace/other');
    const created = createService({ resolvableSessions: ['dsh-session-cross'] });
    const { service } = created;
    created.store.bind({
      conversationId: otherConversation,
      dshSessionId: 'dsh-session-cross',
    });
    created.store.byConversation.set(conversationId, {
      conversationId: otherConversation,
      dshSessionId: 'dsh-session-cross',
    });

    await expect(service.resolve(conversationId)).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_CROSS_CONVERSATION',
    });
  });

  it('is idempotent for the exact same Conversation and DSH Session pair', async () => {
    const conversationId = createConversationId('/workspace/idempotent');
    const dshSessionId = 'dsh-session-idempotent';
    const { service, store } = createService({ resolvableSessions: [dshSessionId] });

    const first = await service.bind({ conversationId, dshSessionId });
    const second = await service.bind({ conversationId, dshSessionId });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    await expect(store.bind({ conversationId, dshSessionId })).resolves.toMatchObject({
      ok: true,
      created: false,
    });
    expect(store.byConversation.size).toBe(1);
    expect(store.bySession.size).toBe(1);
  });

  it('rejects a store bind success that returns a mismatched binding', async () => {
    const conversationId = createConversationId('/workspace/mismatch');
    const otherConversation = createConversationId('/workspace/other');
    const dshSessionId = 'dsh-session-mismatch';
    const store = createMemoryStore();
    const originalBind = store.bind.bind(store);
    store.bind = async (record) => {
      if (record.conversationId !== conversationId) return originalBind(record);
      return {
        ok: true,
        created: true,
        binding: { conversationId: otherConversation, dshSessionId: record.dshSessionId },
      };
    };
    const service = createConversationDshSessionBindingService({
      store,
      sessions: {
        async isResolvable() {
          return true;
        },
      },
    });

    await expect(service.bind({ conversationId, dshSessionId })).resolves.toMatchObject({
      ok: false,
      code: 'STORE_BINDING_MISMATCH',
    });
    expect(store.byConversation.has(conversationId)).toBe(false);
  });

  it('does not delete a replacement binding when unbind observes a mismatch', async () => {
    const conversationId = createConversationId('/workspace/unbind-race');
    const oldSession = 'dsh-session-old';
    const replacementSession = 'dsh-session-replacement';
    const store = createMemoryStore();
    const sessions: DshSessionResolvabilityPort = {
      async isResolvable() {
        return true;
      },
    };
    const service = createConversationDshSessionBindingService({ store, sessions });
    await service.bind({ conversationId, dshSessionId: oldSession });
    store.byConversation.set(conversationId, {
      conversationId,
      dshSessionId: replacementSession,
    });
    store.bySession.set(replacementSession, {
      conversationId,
      dshSessionId: replacementSession,
    });

    const raceStore: ConversationDshSessionBindingStore = {
      get: async () => ({ conversationId, dshSessionId: oldSession }),
      getByDshSessionId: (sessionId) => store.getByDshSessionId(sessionId),
      bind: (record) => store.bind(record),
      unbind: (expected) => store.unbind(expected),
    };
    const raceService = createConversationDshSessionBindingService({
      store: raceStore,
      sessions,
    });

    await expect(raceService.unbind(conversationId)).resolves.toMatchObject({
      ok: false,
      code: 'CONVERSATION_BINDING_MISMATCH',
    });
    expect(store.byConversation.get(conversationId)?.dshSessionId).toBe(replacementSession);
    expect(store.bySession.has(replacementSession)).toBe(true);
  });
});

function createService(
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
  const statusPort =
    options.statusPort ??
    ({
      async isResolvable(dshSessionId: string) {
        return resolvable.has(dshSessionId);
      },
    } satisfies DshSessionResolvabilityPort);
  return {
    store,
    service: createConversationDshSessionBindingService({ store, sessions: statusPort }),
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
