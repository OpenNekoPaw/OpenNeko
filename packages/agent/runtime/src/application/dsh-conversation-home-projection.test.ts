import { describe, expect, it, vi } from 'vitest';

import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';
import { createDshConversationHomeProjection } from './dsh-conversation-home-projection';

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
    });

    await home.refresh();

    expect(home.readHomeProjection().conversations).toHaveLength(2);
    expect(home.readHomeProjection().conversations[0]?.unavailable?.message).toBe(
      'Binding row is invalid.',
    );
    expect(home.readHomeProjection().conversations[1]?.unavailable).toBeUndefined();
  });
});

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
