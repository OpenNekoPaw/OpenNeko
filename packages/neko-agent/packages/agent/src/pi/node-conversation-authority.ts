import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  JsonlSessionRepo,
  uuidv7,
  type AgentMessage,
  type JsonlSessionMetadata,
  type Session,
  type SessionContext,
  type SessionTreeEntry,
} from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';

export interface ConversationExecutionLease {
  readonly conversationId: string;
  readonly holderId: string;
  readonly epoch: number;
  readonly expiresAt: number;
}

export interface PiConversationCatalogRecord {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly title: string;
  readonly activeBranchId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PiConversationBranchRecord {
  readonly conversationId: string;
  readonly branchId: string;
  readonly parentBranchId?: string;
  readonly state: 'active' | 'historical';
  readonly session: JsonlSessionMetadata;
  readonly leafId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PiTurnDurabilityState = 'volatile' | 'persisting' | 'durable' | 'persistence-delayed';

export interface PiTurnCheckpointRecord {
  readonly conversationId: string;
  readonly turnId: string;
  readonly branchId: string;
  readonly piSessionId: string;
  readonly leafId: string | null;
  readonly writerEpoch: number;
  readonly terminalState: 'completed' | 'cancelled' | 'failed';
  readonly committedAt: string;
}

export interface PiConversationCatalogProjector {
  replace(input: {
    readonly workspaceId: string;
    readonly conversations: readonly PiConversationCatalogRecord[];
    readonly branches: readonly PiConversationBranchRecord[];
  }): void | Promise<void>;
}

export type PiConversationTranscriptEntry = SessionTreeEntry;

export type PiConversationAuthorityErrorCode =
  | 'conversation-not-found'
  | 'branch-not-found'
  | 'conversation-exists'
  | 'branch-exists'
  | 'lease-held'
  | 'lease-stale'
  | 'workspace-mismatch'
  | 'invalid-identity';

export class PiConversationAuthorityError extends Error {
  readonly code: PiConversationAuthorityErrorCode;

  constructor(code: PiConversationAuthorityErrorCode, message: string) {
    super(message);
    this.name = 'PiConversationAuthorityError';
    this.code = code;
  }
}

export interface CreateNodePiConversationAuthorityOptions {
  readonly userDataRoot: string;
  readonly workspaceId: string;
  readonly hostId: string;
  readonly leaseTtlMs?: number;
  readonly now?: () => number;
}

export interface CreatePiConversationInput {
  readonly lease: ConversationExecutionLease;
  readonly conversationId: string;
  readonly branchId: string;
  readonly title?: string;
}

export interface ForkPiConversationBranchInput {
  readonly lease: ConversationExecutionLease;
  readonly conversationId: string;
  readonly sourceBranchId: string;
  readonly branchId: string;
  readonly entryId?: string;
  readonly position?: 'before' | 'at';
}

export interface CheckpointPiTurnInput {
  readonly lease: ConversationExecutionLease;
  readonly conversationId: string;
  readonly branchId: string;
  readonly turnId: string;
  readonly terminalState: PiTurnCheckpointRecord['terminalState'];
  readonly messages?: readonly AgentMessage[];
}

export interface AppendPiCompactionInput {
  readonly lease: ConversationExecutionLease;
  readonly conversationId: string;
  readonly branchId: string;
  readonly summary: string;
  readonly firstKeptEntryId: string;
  readonly tokensBefore: number;
  readonly details?: unknown;
}

const DEFAULT_LEASE_TTL_MS = 30_000;

export class NodePiConversationAuthority {
  private readonly durability = new Map<string, PiTurnDurabilityState>();

  private constructor(
    private readonly database: DatabaseSync,
    private readonly env: NodeExecutionEnv,
    private readonly sessions: JsonlSessionRepo,
    readonly workspaceId: string,
    readonly hostId: string,
    private readonly leaseTtlMs: number,
    private readonly now: () => number,
  ) {}

  static async create(
    options: CreateNodePiConversationAuthorityOptions,
  ): Promise<NodePiConversationAuthority> {
    validateIdentity('workspaceId', options.workspaceId);
    validateIdentity('hostId', options.hostId);
    const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    if (!Number.isInteger(leaseTtlMs) || leaseTtlMs <= 0) {
      throw new PiConversationAuthorityError(
        'invalid-identity',
        'leaseTtlMs must be a positive integer.',
      );
    }
    const root = join(options.userDataRoot, 'agent', 'pi');
    const sessionsRoot = join(root, 'sessions');
    await mkdir(sessionsRoot, { recursive: true });
    const sqlite = await import('node:sqlite');
    const database = new sqlite.DatabaseSync(join(root, 'metadata.sqlite'), {
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
    `);
    migrate(database);
    const env = new NodeExecutionEnv({ cwd: root });
    return new NodePiConversationAuthority(
      database,
      env,
      new JsonlSessionRepo({ fs: env, sessionsRoot }),
      options.workspaceId,
      options.hostId,
      leaseTtlMs,
      options.now ?? Date.now,
    );
  }

  virtualWorkspaceCwd(): string {
    return `/__neko_workspaces/${encodeURIComponent(this.workspaceId)}`;
  }

  acquireLease(
    conversationId: string,
    options?: { readonly takeover?: boolean },
  ): ConversationExecutionLease {
    validateIdentity('conversationId', conversationId);
    const now = this.now();
    const expiresAt = now + this.leaseTtlMs;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const current = readLeaseRow(
        this.database
          .prepare('SELECT * FROM pi_execution_leases WHERE conversation_id = ?')
          .get(conversationId),
      );
      let epoch: number;
      if (current === undefined) {
        epoch = 1;
        this.database
          .prepare(
            'INSERT INTO pi_execution_leases (conversation_id, holder_id, epoch, expires_at) VALUES (?, ?, ?, ?)',
          )
          .run(conversationId, this.hostId, epoch, expiresAt);
      } else if (current.holderId === this.hostId && current.expiresAt > now) {
        epoch = current.epoch;
        this.database
          .prepare('UPDATE pi_execution_leases SET expires_at = ? WHERE conversation_id = ?')
          .run(expiresAt, conversationId);
      } else if (current.expiresAt <= now || options?.takeover === true) {
        epoch = current.epoch + 1;
        this.database
          .prepare(
            'UPDATE pi_execution_leases SET holder_id = ?, epoch = ?, expires_at = ? WHERE conversation_id = ?',
          )
          .run(this.hostId, epoch, expiresAt, conversationId);
      } else {
        throw new PiConversationAuthorityError(
          'lease-held',
          `Conversation ${conversationId} is currently owned by another Host.`,
        );
      }
      this.database.exec('COMMIT');
      return Object.freeze({ conversationId, holderId: this.hostId, epoch, expiresAt });
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  renewLease(lease: ConversationExecutionLease): ConversationExecutionLease {
    const now = this.now();
    const expiresAt = now + this.leaseTtlMs;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(lease, now);
      this.database
        .prepare('UPDATE pi_execution_leases SET expires_at = ? WHERE conversation_id = ?')
        .run(expiresAt, lease.conversationId);
      this.database.exec('COMMIT');
      return Object.freeze({ ...lease, expiresAt });
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  leaseRenewalDelay(lease: ConversationExecutionLease): number {
    if (lease.holderId !== this.hostId) {
      throw new PiConversationAuthorityError(
        'lease-stale',
        `Conversation writer lease ${lease.conversationId}@${lease.epoch} belongs to another Host.`,
      );
    }
    const remaining = lease.expiresAt - this.now();
    return Math.max(100, Math.min(Math.floor(remaining / 2), Math.floor(this.leaseTtlMs / 2)));
  }

  releaseLease(lease: ConversationExecutionLease): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(lease, this.now(), false);
      this.database
        .prepare(
          'DELETE FROM pi_execution_leases WHERE conversation_id = ? AND holder_id = ? AND epoch = ?',
        )
        .run(lease.conversationId, lease.holderId, lease.epoch);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async createConversation(
    input: CreatePiConversationInput,
  ): Promise<Session<JsonlSessionMetadata>> {
    this.assertInputLease(input.lease, input.conversationId);
    validateIdentity('branchId', input.branchId);
    if (this.readConversation(input.conversationId) !== undefined) {
      throw new PiConversationAuthorityError(
        'conversation-exists',
        `Conversation ${input.conversationId} already exists.`,
      );
    }
    const now = new Date(this.now()).toISOString();
    const session = await this.sessions.create({
      cwd: this.virtualWorkspaceCwd(),
      id: uuidv7(),
      metadata: {
        workspaceId: this.workspaceId,
        conversationId: input.conversationId,
        branchId: input.branchId,
      },
    });
    const metadata = await session.getMetadata();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(input.lease, this.now());
      this.database
        .prepare(
          `INSERT INTO pi_conversations
            (workspace_id, conversation_id, title, active_branch_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.workspaceId,
          input.conversationId,
          input.title ?? 'New conversation',
          input.branchId,
          now,
          now,
        );
      insertBranch(this.database, {
        conversationId: input.conversationId,
        branchId: input.branchId,
        state: 'active',
        session: metadata,
        leafId: null,
        createdAt: now,
        updatedAt: now,
      });
      this.database.exec('COMMIT');
      return session;
    } catch (error) {
      this.database.exec('ROLLBACK');
      await this.sessions.delete(metadata);
      throw error;
    }
  }

  async openBranch(
    conversationId: string,
    branchId: string,
  ): Promise<Session<JsonlSessionMetadata>> {
    const branch = this.requireBranch(conversationId, branchId);
    return this.sessions.open(branch.session);
  }

  async forkBranch(input: ForkPiConversationBranchInput): Promise<Session<JsonlSessionMetadata>> {
    this.assertInputLease(input.lease, input.conversationId);
    validateIdentity('branchId', input.branchId);
    if (this.readBranch(input.conversationId, input.branchId) !== undefined) {
      throw new PiConversationAuthorityError(
        'branch-exists',
        `Branch ${input.branchId} already exists in conversation ${input.conversationId}.`,
      );
    }
    const source = this.requireBranch(input.conversationId, input.sourceBranchId);
    const session = await this.sessions.fork(source.session, {
      cwd: this.virtualWorkspaceCwd(),
      id: uuidv7(),
      parentSessionPath: source.session.path,
      metadata: {
        workspaceId: this.workspaceId,
        conversationId: input.conversationId,
        branchId: input.branchId,
      },
      ...(input.entryId === undefined ? {} : { entryId: input.entryId }),
      ...(input.position === undefined ? {} : { position: input.position }),
    });
    const metadata = await session.getMetadata();
    const leafId = await session.getLeafId();
    const now = new Date(this.now()).toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(input.lease, this.now());
      insertBranch(this.database, {
        conversationId: input.conversationId,
        branchId: input.branchId,
        parentBranchId: input.sourceBranchId,
        state: 'historical',
        session: metadata,
        leafId,
        createdAt: now,
        updatedAt: now,
      });
      this.database.exec('COMMIT');
      return session;
    } catch (error) {
      this.database.exec('ROLLBACK');
      await this.sessions.delete(metadata);
      throw error;
    }
  }

  activateBranch(
    lease: ConversationExecutionLease,
    conversationId: string,
    branchId: string,
  ): void {
    this.assertInputLease(lease, conversationId);
    this.requireBranch(conversationId, branchId);
    const updatedAt = new Date(this.now()).toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(lease, this.now());
      this.database
        .prepare(
          "UPDATE pi_branches SET state = 'historical', updated_at = ? WHERE conversation_id = ?",
        )
        .run(updatedAt, conversationId);
      this.database
        .prepare(
          "UPDATE pi_branches SET state = 'active', updated_at = ? WHERE conversation_id = ? AND branch_id = ?",
        )
        .run(updatedAt, conversationId, branchId);
      this.database
        .prepare(
          'UPDATE pi_conversations SET active_branch_id = ?, updated_at = ? WHERE conversation_id = ?',
        )
        .run(branchId, updatedAt, conversationId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  updateConversationTitle(
    lease: ConversationExecutionLease,
    conversationId: string,
    title: string,
  ): void {
    this.assertInputLease(lease, conversationId);
    if (this.readConversation(conversationId) === undefined) {
      throw new PiConversationAuthorityError(
        'conversation-not-found',
        `Conversation ${conversationId} does not exist.`,
      );
    }
    const normalized = title.trim();
    if (normalized.length === 0) {
      throw new PiConversationAuthorityError(
        'invalid-identity',
        'Conversation title must not be empty.',
      );
    }
    const updatedAt = new Date(this.now()).toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(lease, this.now());
      this.database
        .prepare('UPDATE pi_conversations SET title = ?, updated_at = ? WHERE conversation_id = ?')
        .run(normalized, updatedAt, conversationId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async deleteConversation(
    lease: ConversationExecutionLease,
    conversationId: string,
  ): Promise<void> {
    this.assertInputLease(lease, conversationId);
    if (this.readConversation(conversationId) === undefined) {
      throw new PiConversationAuthorityError(
        'conversation-not-found',
        `Conversation ${conversationId} does not exist.`,
      );
    }
    const sessions = this.listBranches(conversationId).map((branch) => branch.session);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(lease, this.now());
      this.database
        .prepare('DELETE FROM pi_conversations WHERE conversation_id = ?')
        .run(conversationId);
      this.database
        .prepare(
          'DELETE FROM pi_execution_leases WHERE conversation_id = ? AND holder_id = ? AND epoch = ?',
        )
        .run(conversationId, lease.holderId, lease.epoch);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }

    for (const key of this.durability.keys()) {
      if (key.startsWith(`${conversationId}\u0000`)) this.durability.delete(key);
    }
    const results = await Promise.allSettled(
      sessions.map((session) => this.sessions.delete(session)),
    );
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Conversation ${conversationId} metadata was deleted, but ${failures.length} orphan Pi Session file(s) require garbage collection.`,
      );
    }
  }

  async rollbackBranch(
    lease: ConversationExecutionLease,
    conversationId: string,
    branchId: string,
    entryId: string | null,
  ): Promise<void> {
    this.assertInputLease(lease, conversationId);
    const session = await this.openBranch(conversationId, branchId);
    await session.moveTo(entryId);
    this.updateBranchLeaf(lease, conversationId, branchId, await session.getLeafId());
  }

  async buildContext(conversationId: string, branchId: string): Promise<SessionContext> {
    const session = await this.openBranch(conversationId, branchId);
    return session.buildContext();
  }

  async readBranchEntries(
    conversationId: string,
    branchId: string,
  ): Promise<readonly PiConversationTranscriptEntry[]> {
    const session = await this.openBranch(conversationId, branchId);
    return session.getBranch();
  }

  async appendCompaction(input: AppendPiCompactionInput): Promise<void> {
    this.assertInputLease(input.lease, input.conversationId);
    const branch = this.requireBranch(input.conversationId, input.branchId);
    const session = await this.sessions.open(branch.session);
    const previousLeafId = await session.getLeafId();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(input.lease, this.now());
      await session.appendCompaction(
        input.summary,
        input.firstKeptEntryId,
        input.tokensBefore,
        input.details,
      );
      const updatedAt = new Date(this.now()).toISOString();
      this.database
        .prepare(
          'UPDATE pi_branches SET leaf_id = ?, updated_at = ? WHERE conversation_id = ? AND branch_id = ?',
        )
        .run(await session.getLeafId(), updatedAt, input.conversationId, input.branchId);
      this.database
        .prepare('UPDATE pi_conversations SET updated_at = ? WHERE conversation_id = ?')
        .run(updatedAt, input.conversationId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      try {
        if ((await session.getLeafId()) !== previousLeafId) {
          await session.moveTo(previousLeafId);
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Failed to append and roll back Pi compaction for ${input.conversationId}/${input.branchId}.`,
        );
      }
      throw error;
    }
  }

  async checkpointTurn(input: CheckpointPiTurnInput): Promise<PiTurnCheckpointRecord> {
    validateIdentity('turnId', input.turnId);
    const key = checkpointKey(input.conversationId, input.turnId);
    this.durability.set(key, 'persisting');
    try {
      this.assertInputLease(input.lease, input.conversationId);
      const branch = this.requireBranch(input.conversationId, input.branchId);
      const session = await this.sessions.open(branch.session);
      const previousLeafId = await session.getLeafId();
      this.database.exec('BEGIN IMMEDIATE');
      try {
        this.assertLease(input.lease, this.now());
        const existing = this.readCheckpoint(input.conversationId, input.turnId);
        if (existing !== undefined) {
          if (existing.branchId !== input.branchId || existing.piSessionId !== branch.session.id) {
            throw new PiConversationAuthorityError(
              'invalid-identity',
              `Turn checkpoint ${input.conversationId}/${input.turnId} targets a different branch or Pi Session.`,
            );
          }
          this.database.exec('COMMIT');
          this.durability.set(key, 'durable');
          return existing;
        }
        for (const message of input.messages ?? []) {
          await session.appendMessage(message);
        }
        const leafId = await session.getLeafId();
        const committedAt = new Date(this.now()).toISOString();
        const record: PiTurnCheckpointRecord = {
          conversationId: input.conversationId,
          turnId: input.turnId,
          branchId: input.branchId,
          piSessionId: branch.session.id,
          leafId,
          writerEpoch: input.lease.epoch,
          terminalState: input.terminalState,
          committedAt,
        };
        this.database
          .prepare(
            `INSERT INTO pi_turn_checkpoints
              (conversation_id, turn_id, branch_id, pi_session_id, leaf_id, writer_epoch, terminal_state, committed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            record.conversationId,
            record.turnId,
            record.branchId,
            record.piSessionId,
            record.leafId,
            record.writerEpoch,
            record.terminalState,
            record.committedAt,
          );
        this.database
          .prepare(
            'UPDATE pi_branches SET leaf_id = ?, updated_at = ? WHERE conversation_id = ? AND branch_id = ?',
          )
          .run(leafId, committedAt, input.conversationId, input.branchId);
        this.database.exec('COMMIT');
        this.durability.set(key, 'durable');
        return Object.freeze(record);
      } catch (error) {
        this.database.exec('ROLLBACK');
        try {
          if ((await session.getLeafId()) !== previousLeafId) {
            await session.moveTo(previousLeafId);
          }
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            `Failed to checkpoint and roll back Pi turn ${input.conversationId}/${input.turnId}.`,
          );
        }
        throw error;
      }
    } catch (error) {
      this.durability.set(key, 'persistence-delayed');
      throw error;
    }
  }

  startTurnDurability(conversationId: string, turnId: string): void {
    validateIdentity('conversationId', conversationId);
    validateIdentity('turnId', turnId);
    const key = checkpointKey(conversationId, turnId);
    if (this.durability.has(key) || this.readCheckpoint(conversationId, turnId) !== undefined) {
      throw new PiConversationAuthorityError(
        'invalid-identity',
        `Turn durability ${conversationId}/${turnId} already exists.`,
      );
    }
    this.durability.set(key, 'volatile');
  }

  backfillTurnCheckpoint(input: CheckpointPiTurnInput): Promise<PiTurnCheckpointRecord> {
    return this.checkpointTurn(input);
  }

  getTurnDurability(conversationId: string, turnId: string): PiTurnDurabilityState | undefined {
    return this.durability.get(checkpointKey(conversationId, turnId));
  }

  readCheckpoint(conversationId: string, turnId: string): PiTurnCheckpointRecord | undefined {
    return readCheckpointRow(
      this.database
        .prepare('SELECT * FROM pi_turn_checkpoints WHERE conversation_id = ? AND turn_id = ?')
        .get(conversationId, turnId),
    );
  }

  readConversation(conversationId: string): PiConversationCatalogRecord | undefined {
    const record = readConversationRow(
      this.database
        .prepare('SELECT * FROM pi_conversations WHERE conversation_id = ?')
        .get(conversationId),
    );
    if (record !== undefined && record.workspaceId !== this.workspaceId) {
      throw new PiConversationAuthorityError(
        'workspace-mismatch',
        `Conversation ${conversationId} belongs to workspace ${record.workspaceId}.`,
      );
    }
    return record;
  }

  readBranch(conversationId: string, branchId: string): PiConversationBranchRecord | undefined {
    return readBranchRow(
      this.database
        .prepare('SELECT * FROM pi_branches WHERE conversation_id = ? AND branch_id = ?')
        .get(conversationId, branchId),
    );
  }

  listConversations(): readonly PiConversationCatalogRecord[] {
    return this.database
      .prepare('SELECT * FROM pi_conversations WHERE workspace_id = ? ORDER BY updated_at DESC')
      .all(this.workspaceId)
      .map((row) => requireParsed(readConversationRow(row), 'conversation'));
  }

  listBranches(conversationId: string): readonly PiConversationBranchRecord[] {
    return this.database
      .prepare('SELECT * FROM pi_branches WHERE conversation_id = ? ORDER BY created_at')
      .all(conversationId)
      .map((row) => requireParsed(readBranchRow(row), 'branch'));
  }

  async projectCatalog(projector: PiConversationCatalogProjector): Promise<void> {
    const conversations = this.listConversations();
    const branches = conversations.flatMap((record) => this.listBranches(record.conversationId));
    await projector.replace({ workspaceId: this.workspaceId, conversations, branches });
  }

  async dispose(): Promise<void> {
    this.database.close();
    await this.env.cleanup();
  }

  private requireBranch(conversationId: string, branchId: string): PiConversationBranchRecord {
    const conversation = this.readConversation(conversationId);
    if (conversation === undefined) {
      throw new PiConversationAuthorityError(
        'conversation-not-found',
        `Conversation ${conversationId} does not exist.`,
      );
    }
    const branch = this.readBranch(conversationId, branchId);
    if (branch === undefined) {
      throw new PiConversationAuthorityError(
        'branch-not-found',
        `Branch ${branchId} does not exist in conversation ${conversationId}.`,
      );
    }
    return branch;
  }

  private assertInputLease(lease: ConversationExecutionLease, conversationId: string): void {
    if (lease.conversationId !== conversationId) {
      throw new PiConversationAuthorityError(
        'lease-stale',
        `Lease for ${lease.conversationId} cannot write conversation ${conversationId}.`,
      );
    }
    this.assertLease(lease, this.now());
  }

  private assertLease(
    lease: ConversationExecutionLease,
    now: number,
    requireUnexpired = true,
  ): void {
    const current = readLeaseRow(
      this.database
        .prepare('SELECT * FROM pi_execution_leases WHERE conversation_id = ?')
        .get(lease.conversationId),
    );
    if (
      current === undefined ||
      current.holderId !== lease.holderId ||
      current.epoch !== lease.epoch ||
      lease.holderId !== this.hostId ||
      (requireUnexpired && current.expiresAt <= now)
    ) {
      throw new PiConversationAuthorityError(
        'lease-stale',
        `Conversation writer lease ${lease.conversationId}@${lease.epoch} is stale.`,
      );
    }
  }

  private updateBranchLeaf(
    lease: ConversationExecutionLease,
    conversationId: string,
    branchId: string,
    leafId: string | null,
  ): void {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.assertLease(lease, this.now());
      this.database
        .prepare(
          'UPDATE pi_branches SET leaf_id = ?, updated_at = ? WHERE conversation_id = ? AND branch_id = ?',
        )
        .run(leafId, new Date(this.now()).toISOString(), conversationId, branchId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS pi_conversations (
      workspace_id TEXT NOT NULL,
      conversation_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      active_branch_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pi_conversations_workspace_updated
      ON pi_conversations(workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS pi_branches (
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

    CREATE TABLE IF NOT EXISTS pi_execution_leases (
      conversation_id TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pi_turn_checkpoints (
      conversation_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      pi_session_id TEXT NOT NULL,
      leaf_id TEXT,
      writer_epoch INTEGER NOT NULL,
      terminal_state TEXT NOT NULL CHECK(terminal_state IN ('completed', 'cancelled', 'failed')),
      committed_at TEXT NOT NULL,
      PRIMARY KEY(conversation_id, turn_id),
      FOREIGN KEY(conversation_id, branch_id) REFERENCES pi_branches(conversation_id, branch_id)
        ON DELETE CASCADE
    );
  `);
}

function insertBranch(database: DatabaseSync, branch: PiConversationBranchRecord): void {
  database
    .prepare(
      `INSERT INTO pi_branches
        (conversation_id, branch_id, parent_branch_id, state, pi_session_id,
         pi_session_created_at, pi_session_cwd, pi_session_path, pi_parent_session_path,
         pi_metadata_json, leaf_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      branch.conversationId,
      branch.branchId,
      branch.parentBranchId ?? null,
      branch.state,
      branch.session.id,
      branch.session.createdAt,
      branch.session.cwd,
      branch.session.path,
      branch.session.parentSessionPath ?? null,
      branch.session.metadata === undefined ? null : JSON.stringify(branch.session.metadata),
      branch.leafId,
      branch.createdAt,
      branch.updatedAt,
    );
}

function readConversationRow(value: unknown): PiConversationCatalogRecord | undefined {
  if (value === undefined) return undefined;
  const row = requireRow(value);
  return Object.freeze({
    workspaceId: requireString(row, 'workspace_id'),
    conversationId: requireString(row, 'conversation_id'),
    title: requireString(row, 'title'),
    activeBranchId: requireString(row, 'active_branch_id'),
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
  });
}

function readBranchRow(value: unknown): PiConversationBranchRecord | undefined {
  if (value === undefined) return undefined;
  const row = requireRow(value);
  const parentBranchId = optionalString(row, 'parent_branch_id');
  const parentSessionPath = optionalString(row, 'pi_parent_session_path');
  const metadataJson = optionalString(row, 'pi_metadata_json');
  const state = requireString(row, 'state');
  if (state !== 'active' && state !== 'historical') {
    throw new TypeError(`Invalid Pi branch state: ${state}`);
  }
  return Object.freeze({
    conversationId: requireString(row, 'conversation_id'),
    branchId: requireString(row, 'branch_id'),
    ...(parentBranchId === undefined ? {} : { parentBranchId }),
    state,
    session: Object.freeze({
      id: requireString(row, 'pi_session_id'),
      createdAt: requireString(row, 'pi_session_created_at'),
      cwd: requireString(row, 'pi_session_cwd'),
      path: requireString(row, 'pi_session_path'),
      ...(parentSessionPath === undefined ? {} : { parentSessionPath }),
      ...(metadataJson === undefined ? {} : { metadata: parseMetadata(metadataJson) }),
    }),
    leafId: optionalString(row, 'leaf_id') ?? null,
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
  });
}

function readLeaseRow(value: unknown): ConversationExecutionLease | undefined {
  if (value === undefined) return undefined;
  const row = requireRow(value);
  return Object.freeze({
    conversationId: requireString(row, 'conversation_id'),
    holderId: requireString(row, 'holder_id'),
    epoch: requireInteger(row, 'epoch'),
    expiresAt: requireInteger(row, 'expires_at'),
  });
}

function readCheckpointRow(value: unknown): PiTurnCheckpointRecord | undefined {
  if (value === undefined) return undefined;
  const row = requireRow(value);
  const terminalState = requireString(row, 'terminal_state');
  if (
    terminalState !== 'completed' &&
    terminalState !== 'cancelled' &&
    terminalState !== 'failed'
  ) {
    throw new TypeError(`Invalid Pi checkpoint terminal state: ${terminalState}`);
  }
  return Object.freeze({
    conversationId: requireString(row, 'conversation_id'),
    turnId: requireString(row, 'turn_id'),
    branchId: requireString(row, 'branch_id'),
    piSessionId: requireString(row, 'pi_session_id'),
    leafId: optionalString(row, 'leaf_id') ?? null,
    writerEpoch: requireInteger(row, 'writer_epoch'),
    terminalState,
    committedAt: requireString(row, 'committed_at'),
  });
}

function requireRow(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new TypeError('node:sqlite returned a non-record row.');
  }
  return value;
}

function requireString(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new TypeError(`SQLite column ${key} must be text.`);
  return value;
}

function optionalString(row: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`SQLite column ${key} must be text or null.`);
  return value;
}

function requireInteger(row: Readonly<Record<string, unknown>>, key: string): number {
  const value = row[key];
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new TypeError(`SQLite column ${key} must be an integer.`);
}

function parseMetadata(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new TypeError('Pi Session metadata must be a JSON object.');
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireParsed<T>(value: T | undefined, kind: string): T {
  if (value === undefined) throw new TypeError(`Failed to parse SQLite ${kind} row.`);
  return value;
}

function validateIdentity(field: string, value: string): void {
  if (value.trim().length === 0 || value.includes('\u0000')) {
    throw new PiConversationAuthorityError(
      'invalid-identity',
      `${field} must be a non-empty identifier without NUL characters.`,
    );
  }
}

function checkpointKey(conversationId: string, turnId: string): string {
  return `${conversationId}\u0000${turnId}`;
}
