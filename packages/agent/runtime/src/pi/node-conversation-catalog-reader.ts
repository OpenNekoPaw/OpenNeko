import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { parseAgentConversationContext, type AgentHomeDiagnostic } from '@neko/agent-contracts';
import type { PiConversationCatalogRecord } from './node-conversation-authority';
import { openNodePiConversationStorage } from './node-conversation-storage';

export interface CreateNodePiConversationCatalogReaderOptions {
  readonly userDataRoot: string;
}

export interface PiConversationCatalogReader {
  listConversations(): PiConversationCatalogSnapshot;
  findConversation(conversationId: string): PiConversationCatalogRecord | undefined;
  dispose(): void;
}

export interface PiConversationCatalogSnapshot {
  readonly records: readonly PiConversationCatalogRecord[];
  readonly diagnostics: readonly AgentHomeDiagnostic[];
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

  listConversations(): PiConversationCatalogSnapshot {
    this.requireActive();
    if (!existsSync(this.databasePath)) {
      return { records: [], diagnostics: [] };
    }
    const database = new this.Database(this.databasePath, {
      readOnly: true,
      timeout: 5_000,
    });
    try {
      const contextProjection = conversationContextProjection(database);
      const rows = database
        .prepare(
          `SELECT p.workspace_id, p.conversation_id, p.title, p.active_branch_id,
                  p.created_at, p.updated_at, ${contextProjection.select}
             FROM pi_conversations p
             ${contextProjection.join}
            ORDER BY p.updated_at DESC`,
        )
        .all();
      const records: PiConversationCatalogRecord[] = [];
      const diagnostics: AgentHomeDiagnostic[] = [];
      for (const row of rows) {
        try {
          records.push(
            parseConversationRecord(row, (error) => {
              diagnostics.push(createInvalidConversationDiagnostic(row, error));
            }),
          );
        } catch (error) {
          diagnostics.push(createInvalidConversationDiagnostic(row, error));
        }
      }
      return { records, diagnostics };
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
      const contextProjection = conversationContextProjection(database);
      const rows = database
        .prepare(
          `SELECT p.workspace_id, p.conversation_id, p.title, p.active_branch_id,
                  p.created_at, p.updated_at, ${contextProjection.select}
             FROM pi_conversations p
             ${contextProjection.join}
            WHERE p.conversation_id = ?`,
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

function createInvalidConversationDiagnostic(value: unknown, error: unknown): AgentHomeDiagnostic {
  const workspaceId = readDiagnosticIdentity(value, 'workspace_id');
  const conversationId = readDiagnosticIdentity(value, 'conversation_id');
  return Object.freeze({
    code: 'invalid-conversation-record',
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(conversationId === undefined ? {} : { conversationId }),
    message: error instanceof Error ? error.message : String(error),
  });
}

function readDiagnosticIdentity(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const field = Object.fromEntries(Object.entries(value))[key];
  return typeof field === 'string' && field.trim().length > 0 ? field : undefined;
}

function parseConversationRecord(
  value: unknown,
  onInvalidContext?: (error: unknown) => void,
): PiConversationCatalogRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Pi conversation catalog row must be an object.');
  }
  const contextJson = readOptionalString(value, 'context_json');
  let context: ReturnType<typeof parseAgentConversationContext> | undefined;
  if (contextJson !== undefined) {
    try {
      context = parseAgentConversationContext(JSON.parse(contextJson));
    } catch (error) {
      if (onInvalidContext === undefined) throw error;
      onInvalidContext(error);
    }
  }
  return Object.freeze({
    workspaceId: readRequiredString(value, 'workspace_id'),
    conversationId: readRequiredString(value, 'conversation_id'),
    title: readRequiredString(value, 'title'),
    activeBranchId: readRequiredString(value, 'active_branch_id'),
    createdAt: readRequiredString(value, 'created_at'),
    updatedAt: readRequiredString(value, 'updated_at'),
    ...(context === undefined ? {} : { context }),
  });
}

function conversationContextProjection(database: DatabaseSync): {
  readonly select: string;
  readonly join: string;
} {
  const table = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get('agent_conversation_authority');
  return table === undefined
    ? { select: 'NULL AS context_json', join: '' }
    : {
        select: 'c.context_json',
        join: 'LEFT JOIN agent_conversation_authority c ON c.conversation_id = p.conversation_id',
      };
}

function readRequiredString(value: object, key: string): string {
  const field = (value as Record<string, unknown>)[key];
  if (typeof field !== 'string' || field.length === 0) {
    throw new TypeError(`Pi conversation catalog row has invalid ${key}.`);
  }
  return field;
}

function readOptionalString(value: object, key: string): string | undefined {
  const field = Object.fromEntries(Object.entries(value))[key];
  if (field === null || field === undefined) return undefined;
  if (typeof field !== 'string' || field.length === 0) {
    throw new TypeError(`Pi conversation catalog row has invalid ${key}.`);
  }
  return field;
}

function requireConversationId(conversationId: string): string {
  if (conversationId.trim().length === 0) {
    throw new TypeError('Pi conversation catalog conversationId is required.');
  }
  return conversationId;
}
