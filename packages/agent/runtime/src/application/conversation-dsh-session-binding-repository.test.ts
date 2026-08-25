import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';

import { createConversationId } from '../session/conversation-id';
import {
  createPersistentConversationDshSessionBindingStore,
  initializeConversationDshSessionBindingTables,
} from './conversation-dsh-session-binding-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent Conversation-to-DSH Session binding store', () => {
  it('persists one exact binding and treats the same pair as idempotent', async () => {
    const fixture = await createFixture();
    const binding = {
      conversationId: createConversationId('/workspace/persistent'),
      dshSessionId: 'dsh-session-persistent',
    };

    await expect(fixture.bindings.bind(binding)).resolves.toEqual({
      ok: true,
      binding,
      created: true,
    });
    await expect(fixture.bindings.bind(binding)).resolves.toEqual({
      ok: true,
      binding,
      created: false,
    });
    await expect(fixture.bindings.get(binding.conversationId)).resolves.toEqual(binding);
    await expect(fixture.bindings.getByDshSessionId(binding.dshSessionId)).resolves.toEqual(
      binding,
    );
  });

  it('restores the exact binding after reopening the metadata store', async () => {
    const fixture = await createFixture();
    const binding = {
      conversationId: createConversationId('/workspace/reopen'),
      dshSessionId: 'dsh-session-reopen',
    };
    await fixture.bindings.bind(binding);
    await fixture.store.dispose();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir: fixture.root });
    await reopened.open({ databasePath: fixture.databasePath, busyTimeoutMs: 1_000 });
    const bindings = createPersistentConversationDshSessionBindingStore({
      metadataStore: reopened,
    });
    await expect(bindings.get(binding.conversationId)).resolves.toEqual(binding);
    await expect(bindings.getByDshSessionId(binding.dshSessionId)).resolves.toEqual(binding);
    await reopened.dispose();
  });

  it('reports exact Conversation and DSH Session conflicts without replacing either record', async () => {
    const fixture = await createFixture();
    const first = {
      conversationId: createConversationId('/workspace/first'),
      dshSessionId: 'dsh-session-first',
    };
    const secondConversation = createConversationId('/workspace/second');
    await fixture.bindings.bind(first);

    await expect(
      fixture.bindings.bind({ ...first, dshSessionId: 'dsh-session-replacement' }),
    ).resolves.toMatchObject({ ok: false, code: 'CONVERSATION_ALREADY_BOUND' });
    await expect(
      fixture.bindings.bind({
        conversationId: secondConversation,
        dshSessionId: first.dshSessionId,
      }),
    ).resolves.toMatchObject({ ok: false, code: 'DSH_SESSION_ALREADY_BOUND' });
    await expect(fixture.bindings.get(first.conversationId)).resolves.toEqual(first);
    await expect(fixture.bindings.get(secondConversation)).resolves.toBeUndefined();
  });

  it('compare-and-deletes only the exact binding', async () => {
    const fixture = await createFixture();
    const binding = {
      conversationId: createConversationId('/workspace/unbind'),
      dshSessionId: 'dsh-session-unbind',
    };
    await fixture.bindings.bind(binding);

    await expect(
      fixture.bindings.unbind({ ...binding, dshSessionId: 'dsh-session-other' }),
    ).resolves.toMatchObject({ ok: false, code: 'CONVERSATION_BINDING_MISMATCH' });
    await expect(fixture.bindings.get(binding.conversationId)).resolves.toEqual(binding);
    await expect(fixture.bindings.unbind(binding)).resolves.toEqual({ ok: true });
    await expect(fixture.bindings.get(binding.conversationId)).resolves.toBeUndefined();
  });

  it('isolates an invalid stored record from a valid sibling binding', async () => {
    const fixture = await createFixture();
    const sibling = {
      conversationId: createConversationId('/workspace/sibling'),
      dshSessionId: 'dsh-session-sibling',
    };
    const invalidConversationId = createConversationId('/workspace/invalid');
    await fixture.bindings.bind(sibling);
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'inject-invalid-binding-fixture' },
      async ({ sql }) => {
        await sql.run(
          `INSERT INTO agent_conversation_dsh_session_bindings(conversation_id, dsh_session_id)
           VALUES (?, ?)`,
          [invalidConversationId, ''],
        );
      },
    );

    await expect(fixture.bindings.get(invalidConversationId)).rejects.toThrow(
      /Session identity is required/u,
    );
    await expect(fixture.bindings.getByDshSessionId('')).rejects.toThrow(
      /Session identity is required/u,
    );
    await expect(fixture.bindings.getByDshSessionId(sibling.dshSessionId)).resolves.toEqual(
      sibling,
    );
    await expect(fixture.bindings.get(sibling.conversationId)).resolves.toEqual(sibling);
  });

  it('returns missing for an unbound exact DSH Session without selecting a sibling', async () => {
    const fixture = await createFixture();
    const sibling = {
      conversationId: createConversationId('/workspace/reverse-sibling'),
      dshSessionId: 'dsh-session-reverse-sibling',
    };
    await fixture.bindings.bind(sibling);

    await expect(
      fixture.bindings.getByDshSessionId('dsh-session-missing'),
    ).resolves.toBeUndefined();
    await expect(fixture.bindings.getByDshSessionId(sibling.dshSessionId)).resolves.toEqual(
      sibling,
    );
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-dsh-binding-'));
  roots.push(root);
  const databasePath = join(root, '.neko', 'neko.db');
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath, busyTimeoutMs: 1_000 });
  await initializeConversationDshSessionBindingTables(store);
  return {
    root,
    databasePath,
    store,
    bindings: createPersistentConversationDshSessionBindingStore({ metadataStore: store }),
  };
}
