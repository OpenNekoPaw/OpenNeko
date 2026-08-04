import {
  AGENT_CONVERSATION_CONTEXT_VERSION,
  parseAgentConversationContext,
  parseAgentScratchArtifactRef,
} from '@neko/agent-contracts';
import {
  LocalMetadataError,
  serializeLocalMetadataJson,
  type LocalMetadataMigration,
  type LocalMetadataSqlRow,
  type LocalMetadataSqlExecutor,
  type LocalMetadataStore,
} from '@neko/local-metadata';
import type {
  AgentConversationLifecycleRecord,
  AgentConversationLifecycleRepositoryPort,
} from './agent-conversation-lifecycle-service';

const AGENT_CONVERSATION_LIFECYCLE_SNAPSHOT_VERSION = 1;

export const AGENT_CONVERSATION_LIFECYCLE_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'agent-conversation-lifecycle',
    version: 1,
    name: 'create Agent conversation lifecycle authority',
    checksum: 'sha256:agent-conversation-lifecycle-v1-20260803',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE IF NOT EXISTS agent_conversation_lifecycle (
        conversation_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        turn_id TEXT NOT NULL UNIQUE,
        snapshot_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        provider_claimed INTEGER NOT NULL CHECK (provider_claimed IN (0, 1))
      ) STRICT`,
    ],
  },
  {
    namespace: 'agent-conversation-lifecycle',
    version: 2,
    name: 'create exact Agent conversation context authority',
    checksum: 'sha256:agent-conversation-context-v2-20260803',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE IF NOT EXISTS agent_conversation_context (
        conversation_id TEXT PRIMARY KEY,
        context_version INTEGER NOT NULL,
        context_json TEXT NOT NULL
      ) STRICT`,
    ],
  },
];

export function createPersistentAgentConversationLifecycleRepository(options: {
  readonly metadataStore: LocalMetadataStore;
}): AgentConversationLifecycleRepositoryPort {
  const writeRecord = async (
    operation: string,
    conversationId: string,
    update: (current: AgentConversationLifecycleRecord) => AgentConversationLifecycleRecord,
  ): Promise<AgentConversationLifecycleRecord> =>
    options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation },
      async ({ sql }) => {
        const rows = await sql.all(
          `SELECT conversation_id, request_id, turn_id, snapshot_version, snapshot_json
             FROM agent_conversation_lifecycle
            WHERE conversation_id = ?`,
          [conversationId],
        );
        const current = decodeRequiredRow(rows, conversationId);
        const next = parseAgentConversationLifecycleRecord(update(current));
        assertStableRecordIdentity(current, next);
        const result = await sql.run(
          `UPDATE agent_conversation_lifecycle
              SET snapshot_version = ?, snapshot_json = ?
            WHERE conversation_id = ? AND request_id = ? AND turn_id = ?`,
          [
            AGENT_CONVERSATION_LIFECYCLE_SNAPSHOT_VERSION,
            encodeRecord(next),
            current.conversationId,
            current.pendingTurn.requestId,
            current.pendingTurn.turnId,
          ],
        );
        if (result.changes !== 1) {
          throw persistenceError(
            operation,
            `Agent Conversation '${conversationId}' changed concurrently.`,
          );
        }
        return next;
      },
    );

  const repository: AgentConversationLifecycleRepositoryPort = {
    commitFirstSubmit: (record) =>
      options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'commit-agent-first-submit' },
        async ({ sql }) => {
          const parsed = parseAgentConversationLifecycleRecord(record);
          const result = await sql.run(
            `INSERT INTO agent_conversation_lifecycle(
               conversation_id, request_id, turn_id, snapshot_version, snapshot_json, provider_claimed
             ) VALUES (?, ?, ?, ?, ?, 0)
             ON CONFLICT(request_id) DO NOTHING`,
            [
              parsed.conversationId,
              parsed.pendingTurn.requestId,
              parsed.pendingTurn.turnId,
              AGENT_CONVERSATION_LIFECYCLE_SNAPSHOT_VERSION,
              encodeRecord(parsed),
            ],
          );
          const rows = await sql.all(
            `SELECT conversation_id, request_id, turn_id, snapshot_version, snapshot_json
               FROM agent_conversation_lifecycle
              WHERE request_id = ?`,
            [parsed.pendingTurn.requestId],
          );
          const exact = decodeRequiredRequestRow(rows, parsed.pendingTurn.requestId);
          await commitContext(
            sql,
            exact.conversationId,
            exact.context,
            'commit-agent-first-submit',
          );
          return { record: exact, created: result.changes === 1 };
        },
      ),
    claimProviderExecution: (turnId) =>
      options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'claim-agent-provider-execution' },
        async ({ sql }) => {
          const result = await sql.run(
            `UPDATE agent_conversation_lifecycle
                SET provider_claimed = 1
              WHERE turn_id = ? AND provider_claimed = 0`,
            [turnId],
          );
          if (result.changes === 1) return true;
          const rows = await sql.all(
            `SELECT provider_claimed FROM agent_conversation_lifecycle WHERE turn_id = ?`,
            [turnId],
          );
          if (rows.length !== 1 || readInteger(rows[0]!, 'provider_claimed') !== 1) {
            throw persistenceError(
              'claim-agent-provider-execution',
              `Agent Turn '${turnId}' is not present.`,
            );
          }
          return false;
        },
      ),
    updatePendingTurn: (conversationId, pendingTurn) =>
      writeRecord('update-agent-pending-turn', conversationId, (current) => ({
        ...current,
        pendingTurn,
      })),
    readConversation: (conversationId) =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-agent-conversation-lifecycle' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT conversation_id, request_id, turn_id, snapshot_version, snapshot_json
               FROM agent_conversation_lifecycle
              WHERE conversation_id = ?`,
            [conversationId],
          );
          if (rows.length === 0) return undefined;
          return decodeRequiredRow(rows, conversationId);
        },
      ),
    readFirstSubmitByRequest: (requestId) =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-agent-first-submit-request' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT conversation_id, request_id, turn_id, snapshot_version, snapshot_json
               FROM agent_conversation_lifecycle
              WHERE request_id = ?`,
            [requestId],
          );
          if (rows.length === 0) return undefined;
          return decodeRequiredRequestRow(rows, requestId);
        },
      ),
    readConversationContext: (conversationId) =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-agent-conversation-context' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT context_version, context_json
               FROM agent_conversation_context
              WHERE conversation_id = ?`,
            [conversationId],
          );
          if (rows.length > 1) {
            throw persistenceError(
              'read-agent-conversation-context',
              `Agent Conversation '${conversationId}' resolves to multiple contexts.`,
            );
          }
          if (rows.length === 1) return decodeContextRow(rows[0]!);
          const lifecycleRows = await sql.all(
            `SELECT conversation_id, request_id, turn_id, snapshot_version, snapshot_json
               FROM agent_conversation_lifecycle
              WHERE conversation_id = ?`,
            [conversationId],
          );
          return lifecycleRows.length === 0
            ? undefined
            : decodeRequiredRow(lifecycleRows, conversationId).context;
        },
      ),
    commitMigratedConversationContext: (conversationId, context) =>
      options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'migrate-agent-conversation-context',
        },
        async ({ sql }) =>
          commitContext(
            sql,
            conversationId,
            parseAgentConversationContext(context),
            'migrate-agent-conversation-context',
          ),
      ),
    addScratchArtifact: (conversationId, artifact) =>
      writeRecord('add-agent-scratch-artifact', conversationId, (current) => {
        if (
          current.scratchArtifacts.some(
            (entry) => entry.scratchArtifactId === artifact.scratchArtifactId,
          )
        ) {
          throw persistenceError(
            'add-agent-scratch-artifact',
            `Agent Scratch artifact '${artifact.scratchArtifactId}' already exists.`,
          );
        }
        return { ...current, scratchArtifacts: [...current.scratchArtifacts, artifact] };
      }),
    updateScratchArtifact: (conversationId, artifact) =>
      writeRecord('update-agent-scratch-artifact', conversationId, (current) => {
        if (
          !current.scratchArtifacts.some(
            (entry) => entry.scratchArtifactId === artifact.scratchArtifactId,
          )
        ) {
          throw persistenceError(
            'update-agent-scratch-artifact',
            `Agent Scratch artifact '${artifact.scratchArtifactId}' does not exist.`,
          );
        }
        return {
          ...current,
          scratchArtifacts: current.scratchArtifacts.map((entry) =>
            entry.scratchArtifactId === artifact.scratchArtifactId ? artifact : entry,
          ),
        };
      }),
    removeScratchArtifact: (conversationId, scratchArtifactId) =>
      writeRecord('remove-agent-scratch-artifact', conversationId, (current) => ({
        ...current,
        scratchArtifacts: current.scratchArtifacts.filter(
          (entry) => entry.scratchArtifactId !== scratchArtifactId,
        ),
      })),
    deleteConversation: (conversationId) =>
      options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'delete-agent-conversation-lifecycle',
        },
        async ({ sql }) => {
          const result = await sql.run(
            `DELETE FROM agent_conversation_lifecycle WHERE conversation_id = ?`,
            [conversationId],
          );
          if (result.changes !== 1) {
            throw persistenceError(
              'delete-agent-conversation-lifecycle',
              `Agent Conversation '${conversationId}' is not present.`,
            );
          }
          await sql.run(`DELETE FROM agent_conversation_context WHERE conversation_id = ?`, [
            conversationId,
          ]);
        },
      ),
  };
  return Object.freeze(repository);
}

async function commitContext(
  sql: LocalMetadataSqlExecutor,
  conversationId: string,
  context: ReturnType<typeof parseAgentConversationContext>,
  operation: string,
): Promise<ReturnType<typeof parseAgentConversationContext>> {
  await sql.run(
    `INSERT INTO agent_conversation_context(conversation_id, context_version, context_json)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id) DO NOTHING`,
    [
      conversationId,
      AGENT_CONVERSATION_CONTEXT_VERSION,
      serializeLocalMetadataJson(context, operation),
    ],
  );
  const rows = await sql.all(
    `SELECT context_version, context_json
       FROM agent_conversation_context
      WHERE conversation_id = ?`,
    [conversationId],
  );
  if (rows.length !== 1) {
    throw persistenceError(operation, `Agent Conversation '${conversationId}' context is missing.`);
  }
  const exact = decodeContextRow(rows[0]!);
  if (JSON.stringify(exact) !== JSON.stringify(context)) {
    throw persistenceError(operation, `Agent Conversation '${conversationId}' context changed.`);
  }
  return exact;
}

function decodeContextRow(
  row: LocalMetadataSqlRow,
): ReturnType<typeof parseAgentConversationContext> {
  const version = readInteger(row, 'context_version');
  if (version !== AGENT_CONVERSATION_CONTEXT_VERSION) {
    throw persistenceError(
      'decode-agent-conversation-context',
      `Unsupported Agent Conversation context version '${version}'.`,
    );
  }
  const source = readString(row, 'context_json');
  try {
    return parseAgentConversationContext(JSON.parse(source));
  } catch (error) {
    if (error instanceof LocalMetadataError) throw error;
    throw persistenceError(
      'decode-agent-conversation-context',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function parseAgentConversationLifecycleRecord(
  value: unknown,
): AgentConversationLifecycleRecord {
  const record = exactRecord(
    value,
    [
      'schemaVersion',
      'conversationId',
      'context',
      'createdAt',
      'initialMessage',
      'configuration',
      'pendingTurn',
      'scratchArtifacts',
    ],
    'Agent Conversation lifecycle record',
  );
  if (record['schemaVersion'] !== AGENT_CONVERSATION_CONTEXT_VERSION) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Unsupported Agent Conversation lifecycle version '${String(record['schemaVersion'])}'.`,
    );
  }
  const initialMessage = exactRecord(
    record['initialMessage'],
    ['messageId', 'text', 'resourceGrantIds'],
    'Agent initial message',
  );
  const configuration = exactRecord(
    record['configuration'],
    ['providerId', 'modelId', 'executionMode'],
    'Agent Conversation configuration',
  );
  const pendingRecord = requireRecord(
    record['pendingTurn'],
    'Agent pending turn must be an object.',
  );
  const pendingKeys = ['requestId', 'turnId', 'status'];
  if ('diagnostic' in pendingRecord) pendingKeys.push('diagnostic');
  const pendingTurn = exactRecord(pendingRecord, pendingKeys, 'Agent pending turn');
  const status = pendingTurn['status'];
  if (status !== 'pending' && status !== 'running' && status !== 'failed') {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Unknown Agent pending turn status '${String(status)}'.`,
    );
  }
  const diagnostic = pendingTurn['diagnostic'];
  if (
    diagnostic !== undefined &&
    (typeof diagnostic !== 'string' || diagnostic.trim().length === 0)
  ) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      'Agent pending turn diagnostic must be a non-empty string.',
    );
  }
  const executionMode = configuration['executionMode'];
  if (executionMode !== 'plan' && executionMode !== 'ask' && executionMode !== 'auto') {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Unknown Agent execution mode '${String(executionMode)}'.`,
    );
  }
  const resourceGrantIds = identityArray(initialMessage['resourceGrantIds'], 'Resource grant');
  const scratchArtifactsValue = record['scratchArtifacts'];
  if (!Array.isArray(scratchArtifactsValue)) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      'Agent Scratch artifacts must be an array.',
    );
  }
  return {
    schemaVersion: AGENT_CONVERSATION_CONTEXT_VERSION,
    conversationId: identity(record['conversationId'], 'Conversation'),
    context: parseAgentConversationContext(record['context']),
    createdAt: identity(record['createdAt'], 'createdAt'),
    initialMessage: {
      messageId: identity(initialMessage['messageId'], 'initial message'),
      text: identity(initialMessage['text'], 'initial message text'),
      resourceGrantIds,
    },
    configuration: {
      providerId: identity(configuration['providerId'], 'Provider'),
      modelId: identity(configuration['modelId'], 'Model'),
      executionMode,
    },
    pendingTurn: {
      requestId: identity(pendingTurn['requestId'], 'request'),
      turnId: identity(pendingTurn['turnId'], 'Turn'),
      status,
      ...(diagnostic === undefined ? {} : { diagnostic }),
    },
    scratchArtifacts: scratchArtifactsValue.map(parseAgentScratchArtifactRef),
  };
}

function decodeRequiredRequestRow(
  rows: readonly LocalMetadataSqlRow[],
  requestId: string,
): AgentConversationLifecycleRecord {
  if (rows.length !== 1) {
    throw persistenceError(
      'read-agent-first-submit',
      `Agent first-submit request '${requestId}' does not resolve to exactly one Conversation.`,
    );
  }
  return decodeRow(rows[0]!);
}

function decodeRequiredRow(
  rows: readonly LocalMetadataSqlRow[],
  conversationId: string,
): AgentConversationLifecycleRecord {
  if (rows.length !== 1) {
    throw persistenceError(
      'read-agent-conversation-lifecycle',
      `Agent Conversation '${conversationId}' does not resolve to exactly one record.`,
    );
  }
  return decodeRow(rows[0]!);
}

function decodeRow(row: LocalMetadataSqlRow): AgentConversationLifecycleRecord {
  const version = readInteger(row, 'snapshot_version');
  if (version !== AGENT_CONVERSATION_LIFECYCLE_SNAPSHOT_VERSION) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Unsupported Agent Conversation lifecycle snapshot version '${version}'.`,
    );
  }
  const serialized = readString(row, 'snapshot_json');
  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized);
  } catch (error) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      'Agent Conversation lifecycle snapshot JSON is corrupt.',
      error,
    );
  }
  const record = parseAgentConversationLifecycleRecord(decoded);
  if (
    record.conversationId !== readString(row, 'conversation_id') ||
    record.pendingTurn.requestId !== readString(row, 'request_id') ||
    record.pendingTurn.turnId !== readString(row, 'turn_id')
  ) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      'Agent Conversation lifecycle row identities do not match its snapshot.',
    );
  }
  return record;
}

function encodeRecord(record: AgentConversationLifecycleRecord): string {
  return serializeLocalMetadataJson(
    parseAgentConversationLifecycleRecord(record),
    'serialize-agent-conversation-lifecycle',
  );
}

function assertStableRecordIdentity(
  current: AgentConversationLifecycleRecord,
  next: AgentConversationLifecycleRecord,
): void {
  if (
    current.conversationId !== next.conversationId ||
    current.pendingTurn.requestId !== next.pendingTurn.requestId ||
    current.pendingTurn.turnId !== next.pendingTurn.turnId
  ) {
    throw persistenceError(
      'update-agent-conversation-lifecycle',
      'Agent Conversation, request and Turn identities are immutable.',
    );
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = requireRecord(value, `${label} must be an object.`);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `${label} contains unsupported fields.`,
    );
  }
  return record;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw persistenceError('decode-agent-conversation-lifecycle', message);
  }
  return value as Record<string, unknown>;
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Agent ${label} identity is required.`,
    );
  }
  return value;
}

function identityArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Agent ${label} list is required.`,
    );
  }
  const values = value.map((entry) => identity(entry, label));
  if (new Set(values).size !== values.length) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Agent ${label} list must not contain duplicates.`,
    );
  }
  return values;
}

function readString(row: LocalMetadataSqlRow, column: string): string {
  return identity(row[column], column);
}

function readInteger(row: LocalMetadataSqlRow, column: string): number {
  const value = row[column];
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) {
    throw persistenceError(
      'decode-agent-conversation-lifecycle',
      `Agent Conversation lifecycle column '${column}' must be an integer.`,
    );
  }
  return parsed;
}

function persistenceError(operation: string, message: string, cause?: unknown): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
