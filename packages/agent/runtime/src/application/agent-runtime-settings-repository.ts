import type {
  AssistantRuntimeSettingsDiagnostic,
  AssistantRuntimeSettingsPort,
  AssistantSettingsSnapshot,
} from '@neko/host/settings';
import {
  LocalMetadataError,
  initializeLocalMetadataTables,
  serializeLocalMetadataJson,
  type LocalMetadataSqlExecutor,
  type LocalMetadataStore,
} from '@neko/local-metadata';

export type AgentRuntimeSettingsState = Readonly<Partial<AssistantSettingsSnapshot>>;

export type AgentRuntimeSettingsReadResult =
  | { readonly status: 'ok'; readonly settings: AgentRuntimeSettingsState }
  | { readonly status: 'invalid'; readonly diagnostic: AssistantRuntimeSettingsDiagnostic };

export interface AgentRuntimeSettingsRepository {
  prepare(): Promise<void>;
  read(): Promise<AgentRuntimeSettingsReadResult>;
  commit(settings: AgentRuntimeSettingsState): Promise<void>;
  clear(): Promise<void>;
}

export interface AgentRuntimeSettingsAuthority extends AssistantRuntimeSettingsPort {
  readonly scopeId: string;
}

const AGENT_RUNTIME_SETTINGS_TABLES = [
  `CREATE TABLE IF NOT EXISTS agent_runtime_settings (
    scope_id TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
] as const;

export function createAgentRuntimeSettingsRepository(options: {
  readonly metadataStore: LocalMetadataStore;
  readonly scopeId: string;
  readonly now?: () => string;
}): AgentRuntimeSettingsRepository {
  const scopeId = parseScopeId(options.scopeId);
  const now = options.now ?? (() => new Date().toISOString());
  return {
    prepare: () =>
      initializeLocalMetadataTables(options.metadataStore, {
        ownership: 'state',
        operation: 'initialize-agent-runtime-settings-table',
        statements: AGENT_RUNTIME_SETTINGS_TABLES,
      }),
    read: () =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-agent-runtime-settings' },
        async ({ sql }) => readSettings(sql, scopeId),
      ),
    commit: async (settings) => {
      const parsed = parseAgentRuntimeSettingsState(settings);
      const settingsJson = serializeLocalMetadataJson(parsed, 'serialize-agent-runtime-settings');
      await options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'commit-agent-runtime-settings' },
        async ({ sql }) => {
          const current = await readSettings(sql, scopeId);
          if (current.status === 'invalid') {
            throw settingsError(
              'commit-agent-runtime-settings',
              `Agent runtime settings '${scopeId}' are invalid and require explicit removal before replacement.`,
            );
          }
          await sql.run(
            `INSERT INTO agent_runtime_settings(scope_id, settings_json, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(scope_id) DO UPDATE SET
               settings_json = excluded.settings_json,
               updated_at = excluded.updated_at`,
            [scopeId, settingsJson, now()],
          );
        },
      );
    },
    clear: async () => {
      await options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'clear-agent-runtime-settings' },
        async ({ sql }) => {
          await sql.run('DELETE FROM agent_runtime_settings WHERE scope_id = ?', [scopeId]);
        },
      );
    },
  };
}

export async function createAgentRuntimeSettingsAuthority(options: {
  readonly scopeId: string;
  readonly repository: AgentRuntimeSettingsRepository;
}): Promise<AgentRuntimeSettingsAuthority> {
  await options.repository.prepare();
  const initial = await options.repository.read();
  let settings: AgentRuntimeSettingsState =
    initial.status === 'ok' ? initial.settings : Object.freeze({});
  let rejection = initial.status === 'invalid' ? initial.diagnostic : undefined;
  let tail = Promise.resolve();

  const mutate = (operation: () => Promise<void>): Promise<void> => {
    const pending = tail.then(operation);
    tail = pending.catch(() => undefined);
    return pending;
  };

  return Object.freeze({
    scopeId: options.scopeId,
    snapshot: () => settings,
    diagnostic: () => rejection,
    commit: (nextSettings: AgentRuntimeSettingsState) =>
      mutate(async () => {
        if (rejection) throw settingsError('commit-agent-runtime-settings', rejection.message);
        const next = parseAgentRuntimeSettingsState(nextSettings);
        await options.repository.commit(next);
        settings = next;
      }),
    reset: () =>
      mutate(async () => {
        await options.repository.clear();
        settings = Object.freeze({});
        rejection = undefined;
      }),
  });
}

export function parseAgentRuntimeSettingsState(value: unknown): AgentRuntimeSettingsState {
  if (!isRecord(value)) throw new TypeError('Agent runtime settings must be a record.');
  const allowed = new Set([
    'selectedProviderId',
    'selectedModelId',
    'customSystemPrompt',
    'autoExecuteTools',
    'streamResponses',
    'showToolCalls',
    'temperature',
    'maxTokens',
    'executionMode',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`Unknown Agent runtime setting '${key}'.`);
  }

  const parsed: Partial<AssistantSettingsSnapshot> = {};
  assignNullableString(value, parsed, 'selectedProviderId');
  assignNullableString(value, parsed, 'selectedModelId');
  assignString(value, parsed, 'customSystemPrompt');
  assignBoolean(value, parsed, 'autoExecuteTools');
  assignBoolean(value, parsed, 'streamResponses');
  assignBoolean(value, parsed, 'showToolCalls');
  if ('temperature' in value) {
    const temperature = value['temperature'];
    if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0) {
      throw new TypeError('Agent runtime temperature must be a finite non-negative number.');
    }
    parsed.temperature = temperature;
  }
  if ('maxTokens' in value) {
    const maxTokens = value['maxTokens'];
    if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens <= 0) {
      throw new TypeError('Agent runtime maxTokens must be a positive integer.');
    }
    parsed.maxTokens = maxTokens;
  }
  if ('executionMode' in value) {
    const executionMode = value['executionMode'];
    if (executionMode !== 'plan' && executionMode !== 'ask' && executionMode !== 'auto') {
      throw new TypeError('Agent runtime executionMode must be plan, ask, or auto.');
    }
    parsed.executionMode = executionMode;
  }
  return Object.freeze(parsed);
}

async function readSettings(
  sql: LocalMetadataSqlExecutor,
  scopeId: string,
): Promise<AgentRuntimeSettingsReadResult> {
  const rows = await sql.all(
    'SELECT settings_json FROM agent_runtime_settings WHERE scope_id = ?',
    [scopeId],
  );
  if (rows.length === 0) return { status: 'ok', settings: Object.freeze({}) };
  if (rows.length !== 1 || typeof rows[0]?.['settings_json'] !== 'string') {
    return invalidSettings(scopeId, 'Agent runtime settings row is malformed.');
  }
  try {
    const decoded: unknown = JSON.parse(rows[0]['settings_json']);
    return { status: 'ok', settings: parseAgentRuntimeSettingsState(decoded) };
  } catch (error) {
    return invalidSettings(
      scopeId,
      error instanceof Error ? error.message : 'Agent runtime settings JSON is invalid.',
    );
  }
}

function invalidSettings(scopeId: string, detail: string): AgentRuntimeSettingsReadResult {
  return {
    status: 'invalid',
    diagnostic: {
      authority: `neko.db#agent.runtime-settings:${scopeId}`,
      message: `Agent runtime settings '${scopeId}' were rejected: ${detail}`,
    },
  };
}

function assignNullableString(
  source: Record<string, unknown>,
  target: Partial<AssistantSettingsSnapshot>,
  key: 'selectedProviderId' | 'selectedModelId',
): void {
  if (!(key in source)) return;
  const value = source[key];
  if (value !== null && (typeof value !== 'string' || value.trim().length === 0)) {
    throw new TypeError(`Agent runtime ${key} must be a non-empty string or null.`);
  }
  target[key] = value;
}

function assignString(
  source: Record<string, unknown>,
  target: Partial<AssistantSettingsSnapshot>,
  key: 'customSystemPrompt',
): void {
  if (!(key in source)) return;
  const value = source[key];
  if (typeof value !== 'string') throw new TypeError(`Agent runtime ${key} must be a string.`);
  target[key] = value;
}

function assignBoolean(
  source: Record<string, unknown>,
  target: Partial<AssistantSettingsSnapshot>,
  key: 'autoExecuteTools' | 'streamResponses' | 'showToolCalls',
): void {
  if (!(key in source)) return;
  const value = source[key];
  if (typeof value !== 'boolean') throw new TypeError(`Agent runtime ${key} must be boolean.`);
  target[key] = value;
}

function parseScopeId(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized !== value) {
    throw new TypeError('Agent runtime settings scopeId must be a non-empty trimmed string.');
  }
  return normalized;
}

function settingsError(operation: string, message: string): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
