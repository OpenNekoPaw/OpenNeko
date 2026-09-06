import { LocalMetadataError, type LocalMetadataStore } from '@neko/local-metadata';

import type { ConversationDshSessionBindingRecord } from './conversation-dsh-session-binding';
import { CONVERSATION_DSH_SESSION_BINDING_TABLE } from './conversation-dsh-session-binding-repository';

export interface DshStaleConversationCleanup {
  discard(binding: ConversationDshSessionBindingRecord): Promise<void>;
  discardMissingBinding(conversationId: string): Promise<void>;
}

export function createPersistentDshStaleConversationCleanup(options: {
  readonly metadataStore: LocalMetadataStore;
}): DshStaleConversationCleanup {
  return Object.freeze({
    discard(input: ConversationDshSessionBindingRecord) {
      const conversationId = requireIdentity(input.conversationId, 'Conversation');
      const dshSessionId = requireIdentity(input.dshSessionId, 'DSH Session');
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'discard-stale-dsh-conversation' },
        async ({ sql }) => {
          const binding = await sql.run(
            `DELETE FROM ${CONVERSATION_DSH_SESSION_BINDING_TABLE}
              WHERE conversation_id = ? AND dsh_session_id = ?`,
            [conversationId, dshSessionId],
          );
          if (binding.changes !== 1) {
            throw cleanupError(
              `Agent Conversation '${conversationId}' stale binding changed before cleanup.`,
            );
          }
          await discardOwnedConversationRows(sql, conversationId, 'discard-stale-dsh-conversation');
        },
      );
    },

    discardMissingBinding(conversationIdValue: string) {
      const conversationId = requireIdentity(conversationIdValue, 'Conversation');
      return options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'discard-unbound-dsh-conversation',
        },
        async ({ sql }) => {
          const bindings = await sql.all(
            `SELECT dsh_session_id
               FROM ${CONVERSATION_DSH_SESSION_BINDING_TABLE}
              WHERE conversation_id = ?`,
            [conversationId],
          );
          if (bindings.length !== 0) {
            throw cleanupError(
              `Agent Conversation '${conversationId}' gained a DSH Session binding before cleanup.`,
              'discard-unbound-dsh-conversation',
            );
          }
          await discardOwnedConversationRows(
            sql,
            conversationId,
            'discard-unbound-dsh-conversation',
          );
        },
      );
    },
  });
}

async function discardOwnedConversationRows(
  sql: {
    run(statement: string, parameters?: readonly unknown[]): Promise<{ readonly changes: number }>;
  },
  conversationId: string,
  operation: string,
): Promise<void> {
  await sql.run(`DELETE FROM agent_conversation_canvas_selection WHERE conversation_id = ?`, [
    conversationId,
  ]);
  const catalog = await sql.run(
    `DELETE FROM agent_dsh_conversation_catalog WHERE conversation_id = ?`,
    [conversationId],
  );
  if (catalog.changes !== 1) {
    throw cleanupError(
      `Agent Conversation '${conversationId}' catalog record is not present.`,
      operation,
    );
  }
  const context = await sql.run(
    `DELETE FROM agent_conversation_authority WHERE conversation_id = ?`,
    [conversationId],
  );
  if (context.changes !== 1) {
    throw cleanupError(`Agent Conversation '${conversationId}' context is not present.`, operation);
  }
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) throw cleanupError(`${label} identity is required.`);
  return value;
}

function cleanupError(
  message: string,
  operation = 'discard-stale-dsh-conversation',
): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
  });
}
