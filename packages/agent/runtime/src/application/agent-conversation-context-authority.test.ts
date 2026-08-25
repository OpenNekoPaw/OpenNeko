import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createPersistentAgentConversationContextAuthority,
  initializeAgentConversationContextAuthorityTable,
} from './agent-conversation-context-authority';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persistent Agent Conversation context authority', () => {
  it('binds exact Character and Room contexts without a second owner store', async () => {
    const fixture = await createFixture();
    const character = {
      kind: 'character' as const,
      characterId: 'character:neko',
      characterVersionId: 'character-version:neko:1',
      characterRunId: 'character-run:neko:1',
      dialogueRunId: 'dialogue-run:neko:1',
    };
    const room = {
      kind: 'room' as const,
      scope: 'interaction' as const,
      roomId: 'room:studio',
      roomRunId: 'room-run:studio:1',
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

  it('reopens exact sibling CharacterVersion contexts independently', async () => {
    const fixture = await createFixture();
    const original = {
      kind: 'character' as const,
      characterId: 'character:neko',
      characterVersionId: 'character-version:original',
      characterRunId: 'character-run:original',
      dialogueRunId: 'dialogue-run:original',
    };
    const sibling = {
      ...original,
      characterVersionId: 'character-version:sibling',
      characterRunId: 'character-run:sibling',
      dialogueRunId: 'dialogue-run:sibling',
    };
    await fixture.contexts.bindContext('conversation:original', original);
    await fixture.contexts.bindContext('conversation:sibling', sibling);
    await fixture.store.dispose();

    const reopenedStore = createNodeSqliteLocalMetadataStore({ homedir: fixture.root });
    await reopenedStore.open({ databasePath: fixture.databasePath, busyTimeoutMs: 1_000 });
    const reopened = createPersistentAgentConversationContextAuthority({
      metadataStore: reopenedStore,
    });
    await expect(reopened.readContext('conversation:original')).resolves.toEqual(original);
    await expect(reopened.readContext('conversation:sibling')).resolves.toEqual(sibling);
    await reopenedStore.dispose();
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-context-'));
  roots.push(root);
  const databasePath = join(root, '.neko', 'neko.db');
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath, busyTimeoutMs: 1_000 });
  await initializeAgentConversationContextAuthorityTable(store);
  return {
    root,
    databasePath,
    store,
    contexts: createPersistentAgentConversationContextAuthority({ metadataStore: store }),
  };
}
