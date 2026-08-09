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

  it('enumerates every stable Workspace without acquiring an execution lease', async () => {
    const workspaceA = await createConversation('workspace-a', 'conversation-a');
    await createConversation('workspace-b', 'conversation-b');
    const reader = await NodePiConversationCatalogReader.create({ userDataRoot: root });
    readers.push(reader);

    expect(reader.listConversations()).toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: 'workspace-a',
          conversationId: 'conversation-a',
        }),
        expect.objectContaining({
          workspaceId: 'workspace-b',
          conversationId: 'conversation-b',
        }),
      ]),
      diagnostics: [],
    });
    expect(reader.listConversations().records).toHaveLength(2);
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

    expect(reader.listConversations()).toEqual({ records: [], diagnostics: [] });
    expect(reader.findConversation('conversation-a')).toBeUndefined();
    reader.dispose();
    expect(() => reader.listConversations()).toThrow('Pi conversation catalog reader is disposed');
  });

  it('joins the exact persisted conversation context from the canonical SQLite snapshot', async () => {
    await createConversation('assistant-space:local-user', 'conversation-assistant');
    await writeConversationContext('conversation-assistant', {
      kind: 'assistant',
      assistantSpaceId: 'assistant-space:local-user',
      baseGrantIds: [],
    });
    const reader = await NodePiConversationCatalogReader.create({ userDataRoot: root });
    readers.push(reader);

    expect(reader.findConversation('conversation-assistant')).toMatchObject({
      conversationId: 'conversation-assistant',
      context: {
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
      },
    });
  });

  it('isolates an invalid context from a valid sibling Conversation', async () => {
    await createConversation('workspace-a', 'conversation-invalid');
    await createConversation('workspace-a', 'conversation-valid');
    await writeConversationContext('conversation-invalid', {
      unexpectedField: 1,
      kind: 'workspace',
      workspaceId: 'workspace-a',
      workspaceGrantId: 'grant-a',
    });
    await writeConversationContext('conversation-valid', {
      kind: 'workspace',
      workspaceId: 'workspace-a',
      workspaceGrantId: 'grant-valid',
    });
    const reader = await NodePiConversationCatalogReader.create({ userDataRoot: root });
    readers.push(reader);

    expect(() => reader.findConversation('conversation-invalid')).toThrow(
      "unsupported field 'unexpectedField'",
    );
    expect(reader.findConversation('conversation-valid')).toMatchObject({
      context: { workspaceGrantId: 'grant-valid' },
    });
    expect(reader.listConversations()).toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({
          conversationId: 'conversation-invalid',
        }),
        expect.objectContaining({
          conversationId: 'conversation-valid',
          context: expect.objectContaining({ workspaceGrantId: 'grant-valid' }),
        }),
      ]),
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-conversation-record',
          workspaceId: 'workspace-a',
          conversationId: 'conversation-invalid',
          message: expect.stringContaining("unsupported field 'unexpectedField'"),
        }),
      ],
    });
    expect(
      reader
        .listConversations()
        .records.find((record) => record.conversationId === 'conversation-invalid'),
    ).not.toHaveProperty('context');
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

  async function writeConversationContext(conversationId: string, context: object): Promise<void> {
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(root, 'neko.db'));
    try {
      database.exec(`CREATE TABLE IF NOT EXISTS agent_conversation_authority (
        conversation_id TEXT PRIMARY KEY,
        context_json TEXT NOT NULL
      ) STRICT`);
      database
        .prepare(
          `INSERT INTO agent_conversation_authority(conversation_id, context_json)
           VALUES (?, ?)`,
        )
        .run(conversationId, JSON.stringify(context));
    } finally {
      database.close();
    }
  }
});
