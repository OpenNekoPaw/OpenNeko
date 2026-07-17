import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NodePiConversationAuthority,
  type ConversationExecutionLease,
} from '../node-conversation-authority';

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
    const authority = await createAuthority('vscode');
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
    expect(await readdir(join(root, 'agent', 'pi'))).toEqual(
      expect.arrayContaining(['metadata.sqlite', 'sessions']),
    );

    await authority.dispose();
    authorities.splice(authorities.indexOf(authority), 1);
    const reopenedAuthority = await createAuthority('vscode-reopened');
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
    const authority = await createAuthority('tui');
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
    const vscode = await createAuthority('vscode');
    const tui = await createAuthority('tui');
    const vscodeLease = vscode.acquireLease('conversation-1');
    await vscode.createConversation({
      lease: vscodeLease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });

    expect(() => tui.acquireLease('conversation-1')).toThrowError(
      expect.objectContaining({ code: 'lease-held' }),
    );
    const tuiLease = tui.acquireLease('conversation-1', { takeover: true });
    expect(tuiLease.epoch).toBe(vscodeLease.epoch + 1);
    await expect(
      vscode.checkpointTurn({
        lease: vscodeLease,
        conversationId: 'conversation-1',
        branchId: 'branch-main',
        turnId: 'turn-stale',
        terminalState: 'failed',
        messages: [{ role: 'user', content: 'must not persist', timestamp: now }],
      }),
    ).rejects.toMatchObject({ code: 'lease-stale' });
    expect(vscode.getTurnDurability('conversation-1', 'turn-stale')).toBe('persistence-delayed');
    expect((await vscode.buildContext('conversation-1', 'branch-main')).messages).toHaveLength(0);

    const recoveredLease = vscode.acquireLease('conversation-1', { takeover: true });
    await vscode.backfillTurnCheckpoint({
      lease: recoveredLease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      turnId: 'turn-stale',
      terminalState: 'failed',
    });
    expect(vscode.getTurnDurability('conversation-1', 'turn-stale')).toBe('durable');
    expect(vscode.readCheckpoint('conversation-1', 'turn-stale')?.writerEpoch).toBe(
      recoveredLease.epoch,
    );
  });

  it('keeps terminal checkpoints idempotent without duplicating Pi messages', async () => {
    const authority = await createAuthority('tui');
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
    const authority = await createAuthority('tui');
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
    const sabotage = new sqlite.DatabaseSync(join(root, 'agent', 'pi', 'metadata.sqlite'));
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
    const authority = await createAuthority('vscode', 100);
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
    const authority = await createAuthority('tui');
    const lease = authority.acquireLease('missing-conversation');

    expect(() =>
      authority.updateConversationTitle(lease, 'missing-conversation', 'Missing'),
    ).toThrowError(expect.objectContaining({ code: 'conversation-not-found' }));
  });

  it('deletes catalog metadata and every mapped Pi Session through the fenced writer', async () => {
    const authority = await createAuthority('vscode');
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

  async function createAuthority(hostId: string, leaseTtlMs = 30_000) {
    const authority = await NodePiConversationAuthority.create({
      userDataRoot: root,
      workspaceId: 'workspace-1',
      hostId,
      leaseTtlMs,
      now: () => now,
    });
    authorities.push(authority);
    return authority;
  }
});
