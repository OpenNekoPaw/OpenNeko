import {
  parseAgentConversationContext,
  type AgentConversationContext,
} from '@neko/agent-contracts';
import {
  LocalMetadataError,
  initializeLocalMetadataTables,
  serializeLocalMetadataJson,
  type LocalMetadataSqlRow,
  type LocalMetadataStore,
} from '@neko/local-metadata';

export interface DshConversationCatalogRecord {
  readonly conversationId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly context: AgentConversationContext;
}

export interface DshConversationCatalogDiagnostic {
  readonly conversationId?: string;
  readonly message: string;
}

export interface DshConversationCatalogSnapshot {
  readonly records: readonly DshConversationCatalogRecord[];
  readonly diagnostics: readonly DshConversationCatalogDiagnostic[];
}

export interface DshConversationCatalogStore {
  reserve(input: DshConversationCatalogRecord): Promise<void>;
  get(conversationId: string): Promise<DshConversationCatalogRecord | undefined>;
  read(): Promise<DshConversationCatalogSnapshot>;
}

export function initializeDshConversationCatalogTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    statements: [
      `CREATE TABLE IF NOT EXISTS agent_dsh_conversation_catalog (
        conversation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
    ],
    operation: 'initialize-agent-dsh-conversation-catalog',
  });
}

export function createPersistentDshConversationCatalogStore(options: {
  readonly metadataStore: LocalMetadataStore;
}): DshConversationCatalogStore {
  return Object.freeze({
    reserve(input: DshConversationCatalogRecord) {
      const record = parseCatalogRecord(input);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'reserve-dsh-conversation' },
        async ({ sql }) => {
          const context = serializeLocalMetadataJson(
            record.context,
            'serialize-dsh-conversation-context',
          );
          const contextResult = await sql.run(
            `INSERT INTO agent_conversation_authority(conversation_id, context_json)
             VALUES (?, ?)
             ON CONFLICT(conversation_id) DO NOTHING`,
            [record.conversationId, context],
          );
          if (contextResult.changes !== 1) {
            throw persistenceError(
              'reserve-dsh-conversation',
              `Agent Conversation '${record.conversationId}' already has a domain context.`,
            );
          }
          const catalogResult = await sql.run(
            `INSERT INTO agent_dsh_conversation_catalog(
               conversation_id, title, created_at, updated_at
             ) VALUES (?, ?, ?, ?)`,
            [record.conversationId, record.title, record.createdAt, record.updatedAt],
          );
          if (catalogResult.changes !== 1) {
            throw persistenceError(
              'reserve-dsh-conversation',
              `Agent Conversation '${record.conversationId}' was not added to the catalog.`,
            );
          }
        },
      );
    },

    get(conversationId: string) {
      const identity = requireIdentity(conversationId, 'Conversation');
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'get-dsh-conversation' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT catalog.conversation_id,
                    catalog.title,
                    catalog.created_at,
                    catalog.updated_at,
                    authority.context_json
               FROM agent_dsh_conversation_catalog AS catalog
               LEFT JOIN agent_conversation_authority AS authority
                 ON authority.conversation_id = catalog.conversation_id
              WHERE catalog.conversation_id = ?`,
            [identity],
          );
          if (rows.length > 1) {
            throw persistenceError(
              'get-dsh-conversation',
              `Agent Conversation '${identity}' resolves to multiple catalog records.`,
            );
          }
          const [row] = rows;
          return row === undefined ? undefined : decodeCatalogRow(row);
        },
      );
    },

    read() {
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-dsh-conversation-catalog' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT catalog.conversation_id,
                    catalog.title,
                    catalog.created_at,
                    catalog.updated_at,
                    authority.context_json
               FROM agent_dsh_conversation_catalog AS catalog
               LEFT JOIN agent_conversation_authority AS authority
                 ON authority.conversation_id = catalog.conversation_id
              ORDER BY catalog.updated_at DESC, catalog.conversation_id ASC`,
          );
          const records: DshConversationCatalogRecord[] = [];
          const diagnostics: DshConversationCatalogDiagnostic[] = [];
          for (const row of rows) {
            try {
              records.push(decodeCatalogRow(row));
            } catch (error) {
              diagnostics.push({
                ...readOptionalConversationIdentity(row),
                message: error instanceof Error ? error.message : String(error),
              });
            }
          }
          return Object.freeze({
            records: Object.freeze(records),
            diagnostics: Object.freeze(diagnostics),
          });
        },
      );
    },
  });
}

function decodeCatalogRow(row: LocalMetadataSqlRow): DshConversationCatalogRecord {
  const contextJson = requireString(row['context_json'], 'context_json');
  let context: AgentConversationContext;
  try {
    context = parseAgentConversationContext(JSON.parse(contextJson));
  } catch (error) {
    throw persistenceError(
      'decode-dsh-conversation-catalog',
      'DSH Conversation context is invalid.',
      error,
    );
  }
  return parseCatalogRecord({
    conversationId: requireString(row['conversation_id'], 'conversation_id'),
    title: requireString(row['title'], 'title'),
    createdAt: requireString(row['created_at'], 'created_at'),
    updatedAt: requireString(row['updated_at'], 'updated_at'),
    context,
  });
}

function parseCatalogRecord(input: DshConversationCatalogRecord): DshConversationCatalogRecord {
  const createdAt = requireIsoDate(input.createdAt, 'createdAt');
  const updatedAt = requireIsoDate(input.updatedAt, 'updatedAt');
  if (updatedAt < createdAt) {
    throw persistenceError(
      'validate-dsh-conversation-catalog',
      'DSH Conversation updatedAt cannot precede createdAt.',
    );
  }
  return Object.freeze({
    conversationId: requireIdentity(input.conversationId, 'Conversation'),
    title: requireIdentity(input.title, 'Conversation title'),
    createdAt,
    updatedAt,
    context: parseAgentConversationContext(input.context),
  });
}

function readOptionalConversationIdentity(row: LocalMetadataSqlRow): {
  readonly conversationId?: string;
} {
  const value = row['conversation_id'];
  return typeof value === 'string' && value.trim().length > 0 ? { conversationId: value } : {};
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw persistenceError(
      'decode-dsh-conversation-catalog',
      `DSH Conversation catalog field '${field}' must be a non-empty string.`,
    );
  }
  return value;
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw persistenceError('validate-dsh-conversation-catalog', `${label} identity is required.`);
  }
  return value;
}

function requireIsoDate(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw persistenceError(
      'validate-dsh-conversation-catalog',
      `DSH Conversation ${field} must be a canonical ISO timestamp.`,
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
