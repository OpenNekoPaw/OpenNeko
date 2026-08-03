import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentConversationLifecycleRecord } from './agent-conversation-lifecycle-service';
import {
  AGENT_CONVERSATION_LIFECYCLE_MIGRATIONS,
  createPersistentAgentConversationLifecycleRepository,
} from './agent-conversation-lifecycle-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent Agent conversation lifecycle repository', () => {
  it('recovers the exact first-submit record and provider lease after repository replacement', async () => {
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
    await fixture.store.dispose();
  });

  it('recovers scratch metadata and deletes only the matching Conversation', async () => {
    const fixture = await createFixture();
    const first = createRecord('conversation:1', 'request:1', 'turn:1');
    const second = createRecord('conversation:2', 'request:2', 'turn:2');
    await fixture.repository.commitFirstSubmit(first);
    await fixture.repository.commitFirstSubmit(second);
    const artifact = {
      schemaVersion: 1 as const,
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
    await fixture.store.dispose();
  });

  it('rejects an unknown persisted snapshot version', async () => {
    const fixture = await createFixture();
    const record = createRecord('conversation:1', 'request:1', 'turn:1');
    await fixture.repository.commitFirstSubmit(record);
    await fixture.store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'corrupt-agent-snapshot-version' },
      async ({ sql }) => {
        await sql.run(
          `UPDATE agent_conversation_lifecycle SET snapshot_version = 99 WHERE conversation_id = ?`,
          [record.conversationId],
        );
      },
    );

    await expect(fixture.repository.readConversation(record.conversationId)).rejects.toThrow(
      "Unsupported Agent Conversation lifecycle snapshot version '99'",
    );
    await fixture.store.dispose();
  });

  it('persists one exact migrated Workspace context without manufacturing lifecycle state', async () => {
    const fixture = await createFixture();
    const context = {
      schemaVersion: 1 as const,
      kind: 'workspace' as const,
      workspaceId: 'workspace-legacy',
      workspaceGrantId: 'workspace-grant:legacy:conversation-legacy',
    };
    await expect(
      fixture.repository.commitMigratedConversationContext('conversation-legacy', context),
    ).resolves.toEqual(context);
    const replacement = createPersistentAgentConversationLifecycleRepository({
      metadataStore: fixture.store,
    });
    await expect(replacement.readConversationContext('conversation-legacy')).resolves.toEqual(
      context,
    );
    await expect(replacement.readConversation('conversation-legacy')).resolves.toBeUndefined();
    await expect(
      replacement.commitMigratedConversationContext('conversation-legacy', {
        ...context,
        workspaceId: 'workspace-other',
      }),
    ).rejects.toThrow("Conversation 'conversation-legacy' context changed");
    await fixture.store.dispose();
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-lifecycle-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await store.migrateNamespace(AGENT_CONVERSATION_LIFECYCLE_MIGRATIONS);
  return {
    store,
    repository: createPersistentAgentConversationLifecycleRepository({ metadataStore: store }),
  };
}

function createRecord(
  conversationId: string,
  requestId: string,
  turnId: string,
): AgentConversationLifecycleRecord {
  return {
    schemaVersion: 1,
    conversationId,
    context: {
      schemaVersion: 1,
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
