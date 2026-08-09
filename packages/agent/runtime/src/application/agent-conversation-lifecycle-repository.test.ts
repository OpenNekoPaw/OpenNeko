import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentConversationLifecycleRecord } from './agent-conversation-lifecycle-service';
import {
  createPersistentAgentConversationContextAuthority,
  createPersistentAgentConversationLifecycleRepository,
  initializeAgentConversationLifecycleTables,
} from './agent-conversation-lifecycle-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent Agent conversation lifecycle repository', () => {
  it('binds exact Character and Room contexts without a second owner store', async () => {
    const fixture = await createFixture();
    const character = {
      kind: 'character' as const,
      characterId: 'character:neko',
      characterRunId: 'character-run:neko:1',
      workspaceId: 'assistant-space:local-user',
    };
    const room = {
      kind: 'room' as const,
      roomId: 'room:studio',
      roomRunId: 'room-run:studio:1',
      workspaceId: 'assistant-space:local-user',
    };

    await fixture.contexts.bindContext('conversation:character', character);
    await fixture.contexts.bindContext('conversation:room', room);
    await expect(fixture.contexts.readContext('conversation:character')).resolves.toEqual(
      character,
    );
    await expect(fixture.contexts.readContext('conversation:room')).resolves.toEqual(room);
    await expect(
      fixture.contexts.bindContext('conversation:character', {
        ...character,
        characterId: 'other',
      }),
    ).rejects.toThrow('context changed');
    await fixture.contexts.releaseContext('conversation:character');
    await expect(fixture.contexts.readContext('conversation:character')).resolves.toBeUndefined();
    await expect(fixture.contexts.readContext('conversation:room')).resolves.toEqual(room);
    await fixture.store.dispose();
  });

  it('recovers the exact canonical first-submit record, context and provider claim', async () => {
    const fixture = await createFixture();
    const record = createRecord('conversation:1', 'request:1', 'turn:1');

    await expect(fixture.repository.commitFirstSubmit(record)).resolves.toEqual({
      record,
      created: true,
    });
    await expect(fixture.repository.claimProviderExecution('turn:1')).resolves.toBe(true);

    const replacement = createPersistentAgentConversationLifecycleRepository({
      metadataStore: fixture.store,
    });
    await expect(
      replacement.commitFirstSubmit(createRecord('conversation:other', 'request:1', 'turn:other')),
    ).resolves.toEqual({ record, created: false });
    await expect(replacement.claimProviderExecution('turn:1')).resolves.toBe(false);
    await expect(replacement.readConversation('conversation:1')).resolves.toEqual(record);
    await expect(replacement.readConversationContext('conversation:1')).resolves.toEqual(
      record.context,
    );
    await fixture.store.dispose();
  });

  it('isolates an invalid canonical context from a valid sibling Conversation', async () => {
    const fixture = await createFixture();
    const valid = createRecord('conversation:valid', 'request:valid', 'turn:valid');
    await fixture.repository.commitFirstSubmit(valid);
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'insert-invalid-agent-context' },
      async ({ sql }) => {
        await sql.run(
          `INSERT INTO agent_conversation_authority(conversation_id, context_json)
           VALUES (?, ?)`,
          [
            'conversation:invalid',
            JSON.stringify({
              unexpectedField: true,
              kind: 'assistant',
              assistantSpaceId: 'assistant-space:invalid',
              baseGrantIds: [],
            }),
          ],
        );
      },
    );

    await expect(
      fixture.repository.readConversationContext('conversation:invalid'),
    ).rejects.toThrow("unknown field 'unexpectedField'");
    await expect(fixture.repository.readConversationContext(valid.conversationId)).resolves.toEqual(
      valid.context,
    );
    await fixture.store.dispose();
  });

  it('recovers scratch metadata and deletes only the matching Conversation', async () => {
    const fixture = await createFixture();
    const first = createRecord('conversation:1', 'request:1', 'turn:1');
    const second = createRecord('conversation:2', 'request:2', 'turn:2');
    await fixture.repository.commitFirstSubmit(first);
    await fixture.repository.commitFirstSubmit(second);
    const artifact = {
      scratchArtifactId: 'scratch:1',
      assistantSpaceId: 'assistant-space:local-user',
      conversationId: first.conversationId,
      label: 'draft.png',
      mediaType: 'image/png',
      state: 'recoverable' as const,
    };
    await fixture.repository.addScratchArtifact(first.conversationId, artifact);

    const replacement = createPersistentAgentConversationLifecycleRepository({
      metadataStore: fixture.store,
    });
    await expect(replacement.readConversation(first.conversationId)).resolves.toMatchObject({
      scratchArtifacts: [artifact],
    });
    await replacement.deleteConversation(first.conversationId);
    await expect(replacement.readConversation(first.conversationId)).resolves.toBeUndefined();
    await expect(replacement.readConversation(second.conversationId)).resolves.toEqual(second);
    await expect(replacement.readConversationContext(second.conversationId)).resolves.toEqual(
      second.context,
    );
    await fixture.store.dispose();
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-lifecycle-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await initializeAgentConversationLifecycleTables(store);
  return {
    store,
    repository: createPersistentAgentConversationLifecycleRepository({ metadataStore: store }),
    contexts: createPersistentAgentConversationContextAuthority({ metadataStore: store }),
  };
}

function createRecord(
  conversationId: string,
  requestId: string,
  turnId: string,
): AgentConversationLifecycleRecord {
  return {
    conversationId,
    context: {
      kind: 'assistant',
      assistantSpaceId: 'assistant-space:local-user',
      baseGrantIds: [],
    },
    createdAt: '2026-08-03T00:00:00.000Z',
    initialMessage: { messageId: `message:${conversationId}`, text: 'Hello', resourceGrantIds: [] },
    configuration: { providerId: 'openai', modelId: 'gpt-5', executionMode: 'ask' },
    pendingTurn: { requestId, turnId, status: 'pending' },
    scratchArtifacts: [],
  };
}
