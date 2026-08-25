import {
  parseAgentConversationContext,
  type AgentConversationContext,
} from '@neko/agent-contracts';
import {
  LocalMetadataError,
  initializeLocalMetadataTables,
  serializeLocalMetadataJson,
  type LocalMetadataSqlExecutor,
  type LocalMetadataSqlRow,
  type LocalMetadataStore,
} from '@neko/local-metadata';

export function initializeAgentConversationContextAuthorityTable(
  store: LocalMetadataStore,
): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    statements: [
      `CREATE TABLE IF NOT EXISTS agent_conversation_authority (
        conversation_id TEXT PRIMARY KEY,
        context_json TEXT NOT NULL
      ) STRICT`,
    ],
    operation: 'initialize-agent-conversation-context-authority-table',
  });
}

export interface AgentConversationContextAuthorityPort {
  bindContext(conversationId: string, context: AgentConversationContext): Promise<void>;
  releaseContext(conversationId: string): Promise<void>;
  readContext(conversationId: string): Promise<AgentConversationContext | undefined>;
}

export function createPersistentAgentConversationContextAuthority(options: {
  readonly metadataStore: LocalMetadataStore;
}): AgentConversationContextAuthorityPort {
  return Object.freeze({
    bindContext: (conversationId: string, context: AgentConversationContext) =>
      options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'bind-agent-conversation-context' },
        async ({ sql }) => {
          await commitContext(
            sql,
            requireContextIdentity(conversationId),
            parseAgentConversationContext(context),
            'bind-agent-conversation-context',
          );
        },
      ),
    releaseContext: (conversationId: string) =>
      options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'release-agent-conversation-context',
        },
        async ({ sql }) => {
          const identity = requireContextIdentity(conversationId);
          const result = await sql.run(
            `DELETE FROM agent_conversation_authority WHERE conversation_id = ?`,
            [identity],
          );
          if (result.changes !== 1) {
            throw persistenceError(
              'release-agent-conversation-context',
              `Agent Conversation '${identity}' context is not present.`,
            );
          }
        },
      ),
    readContext: (conversationId: string) =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-agent-conversation-context' },
        async ({ sql }) => {
          const identity = requireContextIdentity(conversationId);
          const rows = await sql.all(
            `SELECT context_json FROM agent_conversation_authority WHERE conversation_id = ?`,
            [identity],
          );
          if (rows.length > 1) {
            throw persistenceError(
              'read-agent-conversation-context',
              `Agent Conversation '${identity}' resolves to multiple contexts.`,
            );
          }
          const row = rows.at(0);
          return row === undefined ? undefined : decodeContextRow(row);
        },
      ),
  });
}

async function commitContext(
  sql: LocalMetadataSqlExecutor,
  conversationId: string,
  context: AgentConversationContext,
  operation: string,
): Promise<void> {
  await sql.run(
    `INSERT INTO agent_conversation_authority(conversation_id, context_json)
     VALUES (?, ?)
     ON CONFLICT(conversation_id) DO NOTHING`,
    [conversationId, serializeLocalMetadataJson(context, operation)],
  );
  const rows = await sql.all(
    `SELECT context_json
       FROM agent_conversation_authority
      WHERE conversation_id = ?`,
    [conversationId],
  );
  const row = rows.at(0);
  if (rows.length !== 1 || row === undefined) {
    throw persistenceError(operation, `Agent Conversation '${conversationId}' context is missing.`);
  }
  const exact = decodeContextRow(row);
  if (JSON.stringify(exact) !== JSON.stringify(context)) {
    throw persistenceError(operation, `Agent Conversation '${conversationId}' context changed.`);
  }
}

function decodeContextRow(row: LocalMetadataSqlRow): AgentConversationContext {
  const source = readString(row, 'context_json');
  try {
    return parseAgentConversationContext(JSON.parse(source));
  } catch (error) {
    if (error instanceof LocalMetadataError) throw error;
    throw persistenceError(
      'decode-agent-conversation-context',
      error instanceof Error ? error.message : String(error),
      error,
    );
  }
}

function readString(row: LocalMetadataSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw persistenceError(
      'decode-agent-conversation-context',
      `Agent Conversation context column '${column}' must be a non-empty string.`,
    );
  }
  return value;
}

function requireContextIdentity(value: string): string {
  if (value.trim().length === 0) {
    throw persistenceError(
      'validate-agent-conversation-context-identity',
      'Agent Conversation identity is required.',
    );
  }
  return value;
}

function persistenceError(operation: string, message: string, cause?: unknown): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
