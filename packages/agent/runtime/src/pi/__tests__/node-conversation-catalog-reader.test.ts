import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodePiConversationAuthority } from '../node-conversation-authority';
import { NodePiConversationCatalogReader } from '../node-conversation-catalog-reader';

describe('NodePiConversationCatalogReader', () => {
  let root: string;
  const authorities: NodePiConversationAuthority[] = [];
  const readers: NodePiConversationCatalogReader[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'neko-pi-catalog-reader-'));
  });

  afterEach(async () => {
    for (const reader of readers.splice(0)) reader.dispose();
    await Promise.all(authorities.splice(0).map((authority) => authority.dispose()));
    await rm(root, { recursive: true, force: true });
  });

  it('lists only the requested workspaces without acquiring an execution lease', async () => {
    const workspaceA = await createConversation('workspace-a', 'conversation-a');
    await createConversation('workspace-b', 'conversation-b');
    const reader = await NodePiConversationCatalogReader.create({ userDataRoot: root });
    readers.push(reader);

    expect(reader.listConversations(['workspace-a'])).toEqual([
      expect.objectContaining({
        workspaceId: 'workspace-a',
        conversationId: 'conversation-a',
      }),
    ]);
    expect(reader.findConversation('conversation-a')).toMatchObject({
      workspaceId: 'workspace-a',
      conversationId: 'conversation-a',
    });
    expect(reader.findConversation('conversation-b')).toMatchObject({
      workspaceId: 'workspace-b',
      conversationId: 'conversation-b',
    });
    expect(reader.findConversation('conversation-missing')).toBeUndefined();

    const lease = workspaceA.acquireLease('conversation-a');
    expect(lease.holderId).toBe('host:workspace-a');
    workspaceA.releaseLease(lease);
  });

  it('returns an empty cold-start catalog before Pi storage exists and fails after disposal', async () => {
    const reader = await NodePiConversationCatalogReader.create({ userDataRoot: root });

    expect(reader.listConversations(['workspace-a'])).toEqual([]);
    expect(reader.findConversation('conversation-a')).toBeUndefined();
    reader.dispose();
    expect(() => reader.listConversations(['workspace-a'])).toThrow(
      'Pi conversation catalog reader is disposed',
    );
  });

  it('joins the exact persisted conversation context from the canonical SQLite snapshot', async () => {
    await createConversation('assistant-space:local-user', 'conversation-assistant');
    await writeConversationContext('conversation-assistant', 1, {
      schemaVersion: 1,
      kind: 'assistant',
      assistantSpaceId: 'assistant-space:local-user',
      baseGrantIds: [],
    });
    const reader = await NodePiConversationCatalogReader.create({ userDataRoot: root });
    readers.push(reader);

    expect(reader.findConversation('conversation-assistant')).toMatchObject({
      conversationId: 'conversation-assistant',
      context: {
        schemaVersion: 1,
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
      },
    });
  });

  it('fails visibly when persisted context metadata has a mismatched version', async () => {
    await createConversation('workspace-a', 'conversation-a');
    await writeConversationContext('conversation-a', 2, {
      schemaVersion: 1,
      kind: 'workspace',
      workspaceId: 'workspace-a',
      workspaceGrantId: 'grant-a',
    });
    const reader = await NodePiConversationCatalogReader.create({ userDataRoot: root });
    readers.push(reader);

    expect(() => reader.findConversation('conversation-a')).toThrow(
      "Pi conversation context version '2' does not match its payload.",
    );
  });

  async function createConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<NodePiConversationAuthority> {
    const authority = await NodePiConversationAuthority.create({
      userDataRoot: root,
      workspaceId,
      hostId: `host:${workspaceId}`,
    });
    authorities.push(authority);
    const lease = authority.acquireLease(conversationId);
    await authority.createConversation({
      lease,
      conversationId,
      branchId: 'main',
      title: conversationId,
    });
    authority.releaseLease(lease);
    return authority;
  }

  async function writeConversationContext(
    conversationId: string,
    contextVersion: number,
    context: object,
  ): Promise<void> {
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(root, 'neko.db'));
    try {
      database.exec(`CREATE TABLE IF NOT EXISTS agent_conversation_context (
        conversation_id TEXT PRIMARY KEY,
        context_version INTEGER NOT NULL,
        context_json TEXT NOT NULL
      ) STRICT`);
      database
        .prepare(
          `INSERT INTO agent_conversation_context(
             conversation_id, context_version, context_json
           ) VALUES (?, ?, ?)`,
        )
        .run(conversationId, contextVersion, JSON.stringify(context));
    } finally {
      database.close();
    }
  }
});
