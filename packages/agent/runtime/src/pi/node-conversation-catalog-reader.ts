import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { PiConversationCatalogRecord } from './node-conversation-authority';
import { openNodePiConversationStorage } from './node-conversation-storage';

export interface CreateNodePiConversationCatalogReaderOptions {
  readonly userDataRoot: string;
}

export interface PiConversationCatalogReader {
  listConversations(workspaceIds: readonly string[]): readonly PiConversationCatalogRecord[];
  findConversation(conversationId: string): PiConversationCatalogRecord | undefined;
  dispose(): void;
}

type DatabaseSyncConstructor = new (
  location: string,
  options?: {
    readonly readOnly?: boolean;
    readonly timeout?: number;
  },
) => DatabaseSync;

export class NodePiConversationCatalogReader implements PiConversationCatalogReader {
  private disposed = false;

  private constructor(
    private readonly databasePath: string,
    private readonly Database: DatabaseSyncConstructor,
  ) {}

  static async create(
    options: CreateNodePiConversationCatalogReaderOptions,
  ): Promise<NodePiConversationCatalogReader> {
    const storage = await openNodePiConversationStorage(options.userDataRoot);
    storage.database.close();
    const sqlite = await import('node:sqlite');
    return new NodePiConversationCatalogReader(
      join(options.userDataRoot, 'neko.db'),
      sqlite.DatabaseSync,
    );
  }

  listConversations(workspaceIds: readonly string[]): readonly PiConversationCatalogRecord[] {
    this.requireActive();
    const scope = [...new Set(workspaceIds.map(requireWorkspaceId))];
    if (scope.length === 0 || !existsSync(this.databasePath)) return [];
    const database = new this.Database(this.databasePath, {
      readOnly: true,
      timeout: 5_000,
    });
    try {
      const placeholders = scope.map(() => '?').join(', ');
      return database
        .prepare(
          `SELECT workspace_id, conversation_id, title, active_branch_id, created_at, updated_at
             FROM pi_conversations
            WHERE workspace_id IN (${placeholders})
            ORDER BY updated_at DESC`,
        )
        .all(...scope)
        .map(parseConversationRecord);
    } finally {
      database.close();
    }
  }

  findConversation(conversationId: string): PiConversationCatalogRecord | undefined {
    this.requireActive();
    const exactConversationId = requireConversationId(conversationId);
    if (!existsSync(this.databasePath)) return undefined;
    const database = new this.Database(this.databasePath, {
      readOnly: true,
      timeout: 5_000,
    });
    try {
      const rows = database
        .prepare(
          `SELECT workspace_id, conversation_id, title, active_branch_id, created_at, updated_at
             FROM pi_conversations
            WHERE conversation_id = ?`,
        )
        .all(exactConversationId);
      if (rows.length > 1) {
        throw new Error(`Pi Conversation '${exactConversationId}' resolves to multiple records.`);
      }
      return rows.length === 0 ? undefined : parseConversationRecord(rows[0]);
    } finally {
      database.close();
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Pi conversation catalog reader is disposed.');
  }
}

function parseConversationRecord(value: unknown): PiConversationCatalogRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Pi conversation catalog row must be an object.');
  }
  return Object.freeze({
    workspaceId: readRequiredString(value, 'workspace_id'),
    conversationId: readRequiredString(value, 'conversation_id'),
    title: readRequiredString(value, 'title'),
    activeBranchId: readRequiredString(value, 'active_branch_id'),
    createdAt: readRequiredString(value, 'created_at'),
    updatedAt: readRequiredString(value, 'updated_at'),
  });
}

function readRequiredString(value: object, key: string): string {
  const field = (value as Record<string, unknown>)[key];
  if (typeof field !== 'string' || field.length === 0) {
    throw new TypeError(`Pi conversation catalog row has invalid ${key}.`);
  }
  return field;
}

function requireWorkspaceId(workspaceId: string): string {
  if (workspaceId.trim().length === 0) {
    throw new TypeError('Pi conversation catalog workspaceId is required.');
  }
  return workspaceId;
}

function requireConversationId(conversationId: string): string {
  if (conversationId.trim().length === 0) {
    throw new TypeError('Pi conversation catalog conversationId is required.');
  }
  return conversationId;
}
