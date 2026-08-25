import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';

import { createConversationId } from '../session/conversation-id';
import {
  createPersistentAgentConversationContextAuthority,
  initializeAgentConversationContextAuthorityTable,
} from './agent-conversation-context-authority';
import {
  createPersistentConversationDshSessionBindingStore,
  initializeConversationDshSessionBindingTables,
} from './conversation-dsh-session-binding-repository';
import {
  createPersistentDshConversationCatalogStore,
  initializeDshConversationCatalogTables,
} from './dsh-conversation-catalog-repository';
import { createPersistentDshStaleConversationCleanup } from './dsh-stale-conversation-cleanup';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent stale DSH Conversation cleanup', () => {
  it('atomically removes the exact stale binding, catalog and context while preserving siblings', async () => {
    const fixture = await createFixture();
    const stale = record('/workspace/stale');
    const sibling = record('/workspace/sibling');
    await fixture.catalog.reserve(stale);
    await fixture.catalog.reserve(sibling);
    await fixture.bindings.bind({
      conversationId: stale.conversationId,
      dshSessionId: 'dsh-session-stale',
    });
    await fixture.bindings.bind({
      conversationId: sibling.conversationId,
      dshSessionId: 'dsh-session-sibling',
    });

    await fixture.cleanup.discard({
      conversationId: stale.conversationId,
      dshSessionId: 'dsh-session-stale',
    });

    await expect(fixture.catalog.get(stale.conversationId)).resolves.toBeUndefined();
    await expect(fixture.contexts.readContext(stale.conversationId)).resolves.toBeUndefined();
    await expect(fixture.bindings.get(stale.conversationId)).resolves.toBeUndefined();
    await expect(fixture.catalog.get(sibling.conversationId)).resolves.toEqual(sibling);
    await expect(fixture.bindings.get(sibling.conversationId)).resolves.toEqual({
      conversationId: sibling.conversationId,
      dshSessionId: 'dsh-session-sibling',
    });
  });

  it('rolls back without deleting user records when the expected binding changed', async () => {
    const fixture = await createFixture();
    const stale = record('/workspace/raced');
    await fixture.catalog.reserve(stale);
    await fixture.bindings.bind({
      conversationId: stale.conversationId,
      dshSessionId: 'dsh-session-current',
    });

    await expect(
      fixture.cleanup.discard({
        conversationId: stale.conversationId,
        dshSessionId: 'dsh-session-previous',
      }),
    ).rejects.toThrow(/stale binding changed before cleanup/u);

    await expect(fixture.catalog.get(stale.conversationId)).resolves.toEqual(stale);
    await expect(fixture.contexts.readContext(stale.conversationId)).resolves.toEqual(
      stale.context,
    );
    await expect(fixture.bindings.get(stale.conversationId)).resolves.toEqual({
      conversationId: stale.conversationId,
      dshSessionId: 'dsh-session-current',
    });
  });

  it('rolls back an already deleted binding when a later owned record is missing', async () => {
    const fixture = await createFixture();
    const stale = record('/workspace/partial-race');
    await fixture.catalog.reserve(stale);
    await fixture.bindings.bind({
      conversationId: stale.conversationId,
      dshSessionId: 'dsh-session-stale',
    });
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'remove-raced-catalog-record' },
      async ({ sql }) => {
        await sql.run(`DELETE FROM agent_dsh_conversation_catalog WHERE conversation_id = ?`, [
          stale.conversationId,
        ]);
      },
    );

    await expect(
      fixture.cleanup.discard({
        conversationId: stale.conversationId,
        dshSessionId: 'dsh-session-stale',
      }),
    ).rejects.toThrow(/catalog record is not present/u);

    await expect(fixture.bindings.get(stale.conversationId)).resolves.toEqual({
      conversationId: stale.conversationId,
      dshSessionId: 'dsh-session-stale',
    });
    await expect(fixture.contexts.readContext(stale.conversationId)).resolves.toEqual(
      stale.context,
    );
  });

  it('atomically removes an unavailable catalog record whose binding is missing', async () => {
    const fixture = await createFixture();
    const unavailable = record('/workspace/unbound');
    const sibling = record('/workspace/unbound-sibling');
    await fixture.catalog.reserve(unavailable);
    await fixture.catalog.reserve(sibling);
    await fixture.bindings.bind({
      conversationId: sibling.conversationId,
      dshSessionId: 'dsh-session-sibling',
    });

    await fixture.cleanup.discardMissingBinding(unavailable.conversationId);

    await expect(fixture.catalog.get(unavailable.conversationId)).resolves.toBeUndefined();
    await expect(fixture.contexts.readContext(unavailable.conversationId)).resolves.toBeUndefined();
    await expect(fixture.catalog.get(sibling.conversationId)).resolves.toEqual(sibling);
    await expect(fixture.bindings.get(sibling.conversationId)).resolves.toEqual({
      conversationId: sibling.conversationId,
      dshSessionId: 'dsh-session-sibling',
    });
  });

  it('rolls back unbound cleanup when a binding appeared before the transaction', async () => {
    const fixture = await createFixture();
    const conversation = record('/workspace/bound-before-delete');
    await fixture.catalog.reserve(conversation);
    await fixture.bindings.bind({
      conversationId: conversation.conversationId,
      dshSessionId: 'dsh-session-current',
    });

    await expect(
      fixture.cleanup.discardMissingBinding(conversation.conversationId),
    ).rejects.toThrow(/gained a DSH Session binding/u);

    await expect(fixture.catalog.get(conversation.conversationId)).resolves.toEqual(conversation);
    await expect(fixture.contexts.readContext(conversation.conversationId)).resolves.toEqual(
      conversation.context,
    );
  });
});

function record(seed: string) {
  return {
    conversationId: createConversationId(seed),
    title: seed,
    createdAt: '2026-08-21T02:00:00.000Z',
    updatedAt: '2026-08-21T02:00:00.000Z',
    context: {
      kind: 'workspace' as const,
      workspaceId: `workspace:${seed}`,
      workspaceGrantId: `grant:${seed}`,
    },
  };
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-stale-cleanup-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await initializeAgentConversationContextAuthorityTable(store);
  await initializeConversationDshSessionBindingTables(store);
  await initializeDshConversationCatalogTables(store);
  return {
    store,
    catalog: createPersistentDshConversationCatalogStore({ metadataStore: store }),
    contexts: createPersistentAgentConversationContextAuthority({ metadataStore: store }),
    bindings: createPersistentConversationDshSessionBindingStore({ metadataStore: store }),
    cleanup: createPersistentDshStaleConversationCleanup({ metadataStore: store }),
  };
}
