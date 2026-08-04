import { access, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NodePiConversationAuthority,
  type ConversationExecutionLease,
} from '../node-conversation-authority';
import { migratePiConversationSchema } from '../node-conversation-storage';

describe('NodePiConversationAuthority', () => {
  let root: string;
  let now: number;
  const authorities: NodePiConversationAuthority[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'neko-pi-conversations-'));
    now = 1_800_000_000_000;
  });

  afterEach(async () => {
    await Promise.all(authorities.splice(0).map((authority) => authority.dispose()));
    await rm(root, { recursive: true, force: true });
  });

  it('stores Pi JSONL and SQLite under the user root and reopens by product identities', async () => {
    const authority = await createAuthority('desktop-primary');
    const lease = authority.acquireLease('conversation-1');
    const session = await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      title: 'Fixture',
    });
    await session.appendMessage({ role: 'user', content: 'hello', timestamp: now });
    const checkpoint = await authority.checkpointTurn({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      turnId: 'turn-1',
      terminalState: 'completed',
    });
    authority.updateConversationTitle(lease, 'conversation-1', 'Renamed fixture');

    expect(authority.virtualWorkspaceCwd()).toBe('/__neko_workspaces/workspace-1');
    expect((await session.getMetadata()).cwd).toBe('/__neko_workspaces/workspace-1');
    expect(checkpoint.leafId).toBe(await session.getLeafId());
    expect(authority.getTurnDurability('conversation-1', 'turn-1')).toBe('durable');
    expect(authority.readCheckpoint('conversation-1', 'turn-1')).toEqual(checkpoint);
    expect(authority.readConversation('conversation-1')).toMatchObject({
      workspaceId: 'workspace-1',
      activeBranchId: 'branch-main',
      title: 'Renamed fixture',
    });
    await expect(stat(join(root, 'neko.db'))).resolves.toMatchObject({ size: expect.any(Number) });
    expect(await readdir(join(root, 'agent', 'pi'))).toEqual(expect.arrayContaining(['sessions']));
    await expect(access(join(root, 'agent', 'pi', 'metadata.sqlite'))).rejects.toThrow();

    await authority.dispose();
    authorities.splice(authorities.indexOf(authority), 1);
    const reopenedAuthority = await createAuthority('desktop-reopened');
    await expect(
      reopenedAuthority.readBranchEntries('conversation-1', 'branch-main'),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'message',
        message: expect.objectContaining({ role: 'user', content: 'hello' }),
      }),
    ]);
    const context = await reopenedAuthority.buildContext('conversation-1', 'branch-main');
    expect(context.messages).toEqual([expect.objectContaining({ role: 'user', content: 'hello' })]);
  });

  it('keeps conversation, branch, and Pi Session identities distinct across history', async () => {
    const authority = await createAuthority('desktop-secondary');
    const lease = authority.acquireLease('conversation-1');
    const main = await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const firstEntry = await main.appendMessage({
      role: 'user',
      content: 'first',
      timestamp: now,
    });
    await main.appendMessage({ role: 'user', content: 'second', timestamp: now + 1 });
    const branch = await authority.forkBranch({
      lease,
      conversationId: 'conversation-1',
      sourceBranchId: 'branch-main',
      branchId: 'branch-alt',
      entryId: firstEntry,
      position: 'at',
    });
    authority.activateBranch(lease, 'conversation-1', 'branch-alt');

    const records = authority.listBranches('conversation-1');
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ branchId: 'branch-main', state: 'historical' }),
        expect.objectContaining({
          branchId: 'branch-alt',
          parentBranchId: 'branch-main',
          state: 'active',
        }),
      ]),
    );
    expect((await main.getMetadata()).id).not.toBe((await branch.getMetadata()).id);
    expect((await branch.buildContext()).messages).toHaveLength(1);

    await branch.appendMessage({ role: 'user', content: 'alternate', timestamp: now + 2 });
    await authority.rollbackBranch(lease, 'conversation-1', 'branch-alt', firstEntry);
    expect((await authority.buildContext('conversation-1', 'branch-alt')).messages).toHaveLength(1);
  });

  it('fences stale cross-Host writers with monotonically increasing epochs', async () => {
    const primary = await createAuthority('desktop-primary');
    const secondary = await createAuthority('desktop-secondary');
    const primaryLease = primary.acquireLease('conversation-1');
    await primary.createConversation({
      lease: primaryLease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });

    expect(() => secondary.acquireLease('conversation-1')).toThrowError(
      expect.objectContaining({ code: 'lease-held' }),
    );
    const secondaryLease = secondary.acquireLease('conversation-1', { takeover: true });
    expect(secondaryLease.epoch).toBe(primaryLease.epoch + 1);
    await expect(
      primary.checkpointTurn({
        lease: primaryLease,
        conversationId: 'conversation-1',
        branchId: 'branch-main',
        turnId: 'turn-stale',
        terminalState: 'failed',
        messages: [{ role: 'user', content: 'must not persist', timestamp: now }],
      }),
    ).rejects.toMatchObject({ code: 'lease-stale' });
    expect(primary.getTurnDurability('conversation-1', 'turn-stale')).toBe('persistence-delayed');
    expect((await primary.buildContext('conversation-1', 'branch-main')).messages).toHaveLength(0);

    const recoveredLease = primary.acquireLease('conversation-1', { takeover: true });
    await primary.backfillTurnCheckpoint({
      lease: recoveredLease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      turnId: 'turn-stale',
      terminalState: 'failed',
    });
    expect(primary.getTurnDurability('conversation-1', 'turn-stale')).toBe('durable');
    expect(primary.readCheckpoint('conversation-1', 'turn-stale')?.writerEpoch).toBe(
      recoveredLease.epoch,
    );
  });

  it('keeps terminal checkpoints idempotent without duplicating Pi messages', async () => {
    const authority = await createAuthority('desktop-secondary');
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const input = {
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      turnId: 'turn-idempotent',
      terminalState: 'completed' as const,
      messages: [{ role: 'user' as const, content: 'persist once', timestamp: now }],
    };

    const first = await authority.checkpointTurn(input);
    const repeated = await authority.checkpointTurn({
      ...input,
      messages: [{ role: 'user', content: 'must be ignored', timestamp: now + 1 }],
    });

    expect(repeated).toEqual(first);
    expect((await authority.buildContext('conversation-1', 'branch-main')).messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'persist once' }),
    ]);
  });

  it('restores the active Pi leaf when compaction metadata cannot commit', async () => {
    const authority = await createAuthority('desktop-secondary');
    const lease = authority.acquireLease('conversation-1');
    const session = await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const firstEntryId = await session.appendMessage({
      role: 'user',
      content: 'first',
      timestamp: now,
    });
    await session.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'second' }],
      api: 'openai-completions',
      provider: 'fixture',
      model: 'fixture-model',
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: now + 1,
    });
    const checkpoint = await authority.checkpointTurn({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      turnId: 'turn-before-compaction',
      terminalState: 'completed',
    });

    const sqlite = await import('node:sqlite');
    const sabotage = new sqlite.DatabaseSync(join(root, 'neko.db'));
    sabotage.exec(`
      CREATE TRIGGER reject_compaction_leaf_update
      BEFORE UPDATE OF leaf_id ON pi_branches
      BEGIN
        SELECT RAISE(ABORT, 'forced compaction metadata failure');
      END;
    `);
    sabotage.close();

    await expect(
      authority.appendCompaction({
        lease,
        conversationId: 'conversation-1',
        branchId: 'branch-main',
        summary: 'must not become active',
        firstKeptEntryId: firstEntryId,
        tokensBefore: 2,
      }),
    ).rejects.toThrow('forced compaction metadata failure');

    expect(authority.readBranch('conversation-1', 'branch-main')?.leafId).toBe(checkpoint.leafId);
    expect((await authority.buildContext('conversation-1', 'branch-main')).messages).toHaveLength(
      2,
    );
  });

  it('expires leases and supports replaceable read-only catalog projections', async () => {
    const authority = await createAuthority('desktop-primary', 100);
    let lease: ConversationExecutionLease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    lease = authority.renewLease(lease);
    now = lease.expiresAt + 1;
    expect(() => authority.renewLease(lease)).toThrowError(
      expect.objectContaining({ code: 'lease-stale' }),
    );
    const next = authority.acquireLease('conversation-1');
    expect(next.epoch).toBe(lease.epoch + 1);

    const replace = vi.fn();
    await authority.projectCatalog({ replace });
    expect(replace).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      conversations: [expect.objectContaining({ conversationId: 'conversation-1' })],
      branches: [expect.objectContaining({ branchId: 'branch-main' })],
    });
  });

  it('fails visibly when a lease targets a missing conversation title', async () => {
    const authority = await createAuthority('desktop-secondary');
    const lease = authority.acquireLease('missing-conversation');

    expect(() =>
      authority.updateConversationTitle(lease, 'missing-conversation', 'Missing'),
    ).toThrowError(expect.objectContaining({ code: 'conversation-not-found' }));
  });

  it('transactionally imports and archives the retired Agent metadata database', async () => {
    const legacyRoot = join(root, 'agent', 'pi');
    await mkdir(legacyRoot, { recursive: true });
    const sqlite = await import('node:sqlite');
    const legacy = new sqlite.DatabaseSync(join(legacyRoot, 'metadata.sqlite'));
    migratePiConversationSchema(legacy);
    legacy
      .prepare(
        `INSERT INTO pi_conversations
          (workspace_id, conversation_id, title, active_branch_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'workspace-1',
        'legacy-conversation',
        'Legacy title',
        'legacy-branch',
        '2026-08-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z',
      );
    legacy.close();

    const authority = await createAuthority('desktop-migration');

    expect(authority.readConversation('legacy-conversation')).toMatchObject({
      workspaceId: 'workspace-1',
      title: 'Legacy title',
    });
    await expect(access(join(legacyRoot, 'metadata.sqlite'))).rejects.toThrow();
    await expect(stat(join(legacyRoot, 'metadata.sqlite.migrated-v1'))).resolves.toMatchObject({
      size: expect.any(Number),
    });
  });

  it('rebuilds the retired embedded-context table before creating a conversation', async () => {
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(root, 'neko.db'), {
      enableForeignKeyConstraints: true,
    });
    database.exec(`
      CREATE TABLE pi_conversations (
        context_schema_version INTEGER NOT NULL CHECK(context_schema_version = 1),
        context_kind TEXT NOT NULL CHECK(context_kind IN ('scratch', 'workspace-authoring')),
        context_id TEXT NOT NULL,
        project_id TEXT,
        workspace_id TEXT,
        conversation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        active_branch_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (context_kind = 'scratch' AND project_id IS NULL AND workspace_id IS NULL) OR
          (context_kind = 'workspace-authoring' AND project_id IS NOT NULL AND workspace_id = context_id)
        )
      );
      CREATE INDEX pi_conversations_context_updated
        ON pi_conversations(context_kind, context_id, updated_at DESC);
      CREATE INDEX pi_conversations_workspace_updated
        ON pi_conversations(workspace_id, updated_at DESC)
        WHERE workspace_id IS NOT NULL;
      CREATE TABLE pi_branches (
        conversation_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        parent_branch_id TEXT,
        state TEXT NOT NULL CHECK(state IN ('active', 'historical')),
        pi_session_id TEXT NOT NULL UNIQUE,
        pi_session_created_at TEXT NOT NULL,
        pi_session_cwd TEXT NOT NULL,
        pi_session_path TEXT NOT NULL,
        pi_parent_session_path TEXT,
        pi_metadata_json TEXT,
        leaf_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(conversation_id, branch_id),
        FOREIGN KEY(conversation_id) REFERENCES pi_conversations(conversation_id) ON DELETE CASCADE
      );
    `);
    const timestamp = '2026-08-05T00:00:00.000Z';
    database
      .prepare(
        `INSERT INTO pi_conversations VALUES
          (1, 'workspace-authoring', 'workspace-1', 'project-1', 'workspace-1',
           'legacy-workspace', 'Workspace', 'branch-main', ?, ?),
          (1, 'scratch', 'scratch-scope-1', NULL, NULL,
           'legacy-scratch', 'Scratch', 'branch-scratch', ?, ?)`,
      )
      .run(timestamp, timestamp, timestamp, timestamp);
    database
      .prepare(
        `INSERT INTO pi_branches (
           conversation_id, branch_id, parent_branch_id, state, pi_session_id,
           pi_session_created_at, pi_session_cwd, pi_session_path, pi_parent_session_path,
           pi_metadata_json, leaf_id, created_at, updated_at
         ) VALUES (?, ?, NULL, 'active', ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        'legacy-workspace',
        'branch-main',
        'session-legacy',
        timestamp,
        '/__neko_workspaces/workspace-1',
        '/sessions/legacy.jsonl',
        timestamp,
        timestamp,
      );
    database.close();

    const authority = await createAuthority('desktop-migrated');
    expect(authority.readConversation('legacy-workspace')).toMatchObject({
      workspaceId: 'workspace-1',
      conversationId: 'legacy-workspace',
    });
    expect(authority.listBranches('legacy-workspace')).toEqual([
      expect.objectContaining({
        branchId: 'branch-main',
        session: expect.objectContaining({ id: 'session-legacy' }),
      }),
    ]);
    const lease = authority.acquireLease('new-conversation');
    await expect(
      authority.createConversation({
        lease,
        conversationId: 'new-conversation',
        branchId: 'branch-new',
      }),
    ).resolves.toBeDefined();

    const scratch = await createAuthority('desktop-scratch', 30_000, 'scratch-scope-1');
    expect(scratch.readConversation('legacy-scratch')).toMatchObject({
      workspaceId: 'scratch-scope-1',
      conversationId: 'legacy-scratch',
    });
    const migrated = new sqlite.DatabaseSync(join(root, 'neko.db'), { readOnly: true });
    try {
      expect(
        migrated
          .prepare(`PRAGMA table_info(pi_conversations)`)
          .all()
          .map((row) => (row as { name: string }).name),
      ).toEqual([
        'workspace_id',
        'conversation_id',
        'title',
        'active_branch_id',
        'created_at',
        'updated_at',
      ]);
      expect(
        migrated
          .prepare(
            `SELECT COUNT(*) AS count FROM sqlite_master
              WHERE type = 'index' AND name = 'pi_conversations_context_updated'`,
          )
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      migrated.close();
    }
  });

  it('rejects an unknown Pi conversation table shape without rewriting it', async () => {
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(root, 'neko.db'));
    database.exec(`CREATE TABLE pi_conversations (
      workspace_id TEXT NOT NULL,
      conversation_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      active_branch_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      unknown_context TEXT
    )`);
    database.close();

    await expect(createAuthority('desktop-unknown')).rejects.toThrow(
      'Pi conversation table schema is unsupported',
    );
    const unchanged = new sqlite.DatabaseSync(join(root, 'neko.db'), { readOnly: true });
    try {
      expect(
        unchanged
          .prepare(`PRAGMA table_info(pi_conversations)`)
          .all()
          .map((row) => (row as { name: string }).name),
      ).toContain('unknown_context');
    } finally {
      unchanged.close();
    }
  });

  it('deletes catalog metadata and every mapped Pi Session through the fenced writer', async () => {
    const authority = await createAuthority('desktop-primary');
    const lease = authority.acquireLease('conversation-delete');
    const main = await authority.createConversation({
      lease,
      conversationId: 'conversation-delete',
      branchId: 'branch-main',
    });
    const mainPath = (await main.getMetadata()).path;
    const fork = await authority.forkBranch({
      lease,
      conversationId: 'conversation-delete',
      sourceBranchId: 'branch-main',
      branchId: 'branch-alt',
    });
    const forkPath = (await fork.getMetadata()).path;
    authority.startTurnDurability('conversation-delete', 'turn-volatile');

    await authority.deleteConversation(lease, 'conversation-delete');

    expect(authority.readConversation('conversation-delete')).toBeUndefined();
    expect(authority.listBranches('conversation-delete')).toEqual([]);
    expect(authority.getTurnDurability('conversation-delete', 'turn-volatile')).toBeUndefined();
    await expect(access(mainPath)).rejects.toThrow();
    await expect(access(forkPath)).rejects.toThrow();
    expect(() => authority.renewLease(lease)).toThrowError(
      expect.objectContaining({ code: 'lease-stale' }),
    );
  });

  async function createAuthority(hostId: string, leaseTtlMs = 30_000, workspaceId = 'workspace-1') {
    const authority = await NodePiConversationAuthority.create({
      userDataRoot: root,
      workspaceId,
      hostId,
      leaseTtlMs,
      now: () => now,
    });
    authorities.push(authority);
    return authority;
  }
});
