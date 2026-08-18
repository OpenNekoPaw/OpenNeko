import {
  LocalMetadataError,
  initializeLocalMetadataTables,
  type LocalMetadataSqlRow,
  type LocalMetadataStore,
} from '@neko/local-metadata';

import { isCanonicalConversationId } from '../session/conversation-id';
import type {
  ConversationDshSessionBindingRecord,
  ConversationDshSessionBindingStore,
} from './conversation-dsh-session-binding';

const BINDING_TABLE = 'agent_conversation_dsh_session_bindings';

export function initializeConversationDshSessionBindingTables(
  store: LocalMetadataStore,
): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    statements: [
      `CREATE TABLE IF NOT EXISTS ${BINDING_TABLE} (
        conversation_id TEXT PRIMARY KEY,
        dsh_session_id TEXT NOT NULL UNIQUE
      ) STRICT`,
    ],
    operation: 'initialize-conversation-dsh-session-binding-tables',
  });
}

export function createPersistentConversationDshSessionBindingStore(options: {
  readonly metadataStore: LocalMetadataStore;
}): ConversationDshSessionBindingStore {
  const store: ConversationDshSessionBindingStore = {
    get: (conversationId) =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-conversation-dsh-session-binding' },
        async ({ sql }) => {
          requireConversationId(conversationId);
          const rows = await sql.all(
            `SELECT conversation_id, dsh_session_id
               FROM ${BINDING_TABLE}
              WHERE conversation_id = ?`,
            [conversationId],
          );
          if (rows.length > 1) {
            throw bindingError(
              'read-conversation-dsh-session-binding',
              `Conversation '${conversationId}' resolves to multiple DSH Sessions.`,
            );
          }
          return rows.length === 0 ? undefined : decodeBinding(rows[0]!);
        },
      ),

    getByDshSessionId: (dshSessionId) =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-dsh-session-conversation-binding' },
        async ({ sql }) => {
          requireDshSessionId(dshSessionId);
          const rows = await sql.all(
            `SELECT conversation_id, dsh_session_id
               FROM ${BINDING_TABLE}
              WHERE dsh_session_id = ?`,
            [dshSessionId],
          );
          if (rows.length > 1) {
            throw bindingError(
              'read-dsh-session-conversation-binding',
              `DSH Session '${dshSessionId}' resolves to multiple Conversations.`,
            );
          }
          return rows.length === 0 ? undefined : decodeBinding(rows[0]!);
        },
      ),

    bind: (record) =>
      options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'bind-conversation-dsh-session' },
        async ({ sql }) => {
          const binding = requireBinding(record);
          const inserted = await sql.run(
            `INSERT INTO ${BINDING_TABLE}(conversation_id, dsh_session_id)
             VALUES (?, ?)
             ON CONFLICT DO NOTHING`,
            [binding.conversationId, binding.dshSessionId],
          );
          const rows = await sql.all(
            `SELECT conversation_id, dsh_session_id
               FROM ${BINDING_TABLE}
              WHERE conversation_id = ? OR dsh_session_id = ?
              ORDER BY conversation_id`,
            [binding.conversationId, binding.dshSessionId],
          );
          const matches = rows.map(decodeBinding);
          const byConversation = matches.find(
            (candidate) => candidate.conversationId === binding.conversationId,
          );
          const bySession = matches.find(
            (candidate) => candidate.dshSessionId === binding.dshSessionId,
          );
          if (
            byConversation?.dshSessionId === binding.dshSessionId &&
            bySession?.conversationId === binding.conversationId
          ) {
            return { ok: true, binding: byConversation, created: inserted.changes === 1 };
          }
          if (byConversation !== undefined) {
            return {
              ok: false,
              code: 'CONVERSATION_ALREADY_BOUND',
              message: `Conversation is already bound to ${byConversation.dshSessionId}.`,
            };
          }
          if (bySession !== undefined) {
            return {
              ok: false,
              code: 'DSH_SESSION_ALREADY_BOUND',
              message: `DSH Session is already bound to ${bySession.conversationId}.`,
            };
          }
          throw bindingError(
            'bind-conversation-dsh-session',
            `Conversation '${binding.conversationId}' binding was not persisted.`,
          );
        },
      ),

    unbind: (expected) =>
      options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'unbind-conversation-dsh-session' },
        async ({ sql }) => {
          const binding = requireBinding(expected);
          const deleted = await sql.run(
            `DELETE FROM ${BINDING_TABLE}
              WHERE conversation_id = ? AND dsh_session_id = ?`,
            [binding.conversationId, binding.dshSessionId],
          );
          if (deleted.changes === 1) return { ok: true };

          const conversationRows = await sql.all(
            `SELECT conversation_id, dsh_session_id
               FROM ${BINDING_TABLE}
              WHERE conversation_id = ?`,
            [binding.conversationId],
          );
          if (conversationRows.length > 0) {
            const current = decodeSingleBinding(
              conversationRows,
              'unbind-conversation-dsh-session',
            );
            return {
              ok: false,
              code: 'CONVERSATION_BINDING_MISMATCH',
              message: `Conversation binding changed to ${current.dshSessionId} before unbind.`,
            };
          }

          const sessionRows = await sql.all(
            `SELECT conversation_id, dsh_session_id
               FROM ${BINDING_TABLE}
              WHERE dsh_session_id = ?`,
            [binding.dshSessionId],
          );
          if (sessionRows.length > 0) {
            const current = decodeSingleBinding(sessionRows, 'unbind-conversation-dsh-session');
            return {
              ok: false,
              code: 'CONVERSATION_BINDING_CROSS_CONVERSATION',
              message: `DSH Session is bound to ${current.conversationId}, not ${binding.conversationId}.`,
            };
          }
          return {
            ok: false,
            code: 'CONVERSATION_BINDING_MISSING',
            message: `Conversation has no binding: ${binding.conversationId}`,
          };
        },
      ),
  };
  return Object.freeze(store);
}

function decodeSingleBinding(
  rows: readonly LocalMetadataSqlRow[],
  operation: string,
): ConversationDshSessionBindingRecord {
  if (rows.length !== 1) {
    throw bindingError(operation, 'DSH Session binding identity is not unique.');
  }
  return decodeBinding(rows[0]!);
}

function decodeBinding(row: LocalMetadataSqlRow): ConversationDshSessionBindingRecord {
  return requireBinding({
    conversationId: readString(row, 'conversation_id'),
    dshSessionId: readString(row, 'dsh_session_id'),
  });
}

function requireBinding(
  record: ConversationDshSessionBindingRecord,
): ConversationDshSessionBindingRecord {
  requireConversationId(record.conversationId);
  requireDshSessionId(record.dshSessionId);
  return Object.freeze({
    conversationId: record.conversationId,
    dshSessionId: record.dshSessionId,
  });
}

function requireDshSessionId(dshSessionId: string): void {
  if (dshSessionId.trim().length === 0) {
    throw bindingError(
      'validate-conversation-dsh-session-binding',
      'DSH Session identity is required.',
    );
  }
}

function requireConversationId(conversationId: string): void {
  if (!isCanonicalConversationId(conversationId)) {
    throw bindingError(
      'validate-conversation-dsh-session-binding',
      `Conversation identity is not canonical: ${conversationId}`,
    );
  }
}

function readString(row: LocalMetadataSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw bindingError(
      'decode-conversation-dsh-session-binding',
      `DSH Session binding column '${column}' must be a string.`,
    );
  }
  return value;
}

function bindingError(operation: string, message: string): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-integrity-failed',
    operation,
    message,
  });
}
