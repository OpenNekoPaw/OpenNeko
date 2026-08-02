import {
  LocalMetadataError,
  type LocalMetadataMigration,
  type LocalMetadataSqlExecutor,
  type LocalMetadataStore,
} from './contracts';
import { serializeLocalMetadataJson } from './secret-boundary';

export const DESKTOP_STATE_AUTHORITY_KEYS = {
  shell: 'desktop.shell',
  applicationSettings: 'desktop.application-settings',
} as const;

export type DesktopStateAuthorityKey =
  (typeof DESKTOP_STATE_AUTHORITY_KEYS)[keyof typeof DESKTOP_STATE_AUTHORITY_KEYS];

export interface VersionedJsonStateCodec<TState> {
  createEmpty(): TState;
  parse(value: unknown): TState;
  readStorageRevision(state: TState): number;
}

export interface VersionedJsonStateRepository<TState> {
  read(): Promise<TState>;
  commit(expectedRevision: number, next: TState): Promise<TState>;
}

export interface SqliteVersionedJsonStateRepositoryOptions<TState> {
  readonly store: LocalMetadataStore;
  readonly authorityKey: DesktopStateAuthorityKey;
  readonly codec: VersionedJsonStateCodec<TState>;
  readonly now?: () => string;
}

export const DESKTOP_APPLICATION_STATE_MIGRATIONS: readonly LocalMetadataMigration[] = [
  {
    namespace: 'desktop-application-state',
    version: 1,
    name: 'create desktop application state authorities',
    checksum: 'sha256:desktop-application-state-v1-archive-state-20260803',
    ownership: 'state',
    destructive: false,
    statements: [
      `CREATE TABLE IF NOT EXISTS desktop_application_state (
        authority_key TEXT PRIMARY KEY,
        storage_revision INTEGER NOT NULL CHECK (storage_revision >= 0),
        document_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS desktop_application_state_migrations (
        migration_id TEXT PRIMARY KEY,
        shell_digest TEXT NOT NULL,
        settings_digest TEXT NOT NULL,
        shell_archived INTEGER NOT NULL CHECK (shell_archived IN (0, 1)),
        settings_archived INTEGER NOT NULL CHECK (settings_archived IN (0, 1)),
        committed_at TEXT NOT NULL
      ) STRICT`,
    ],
  },
];

export class SqliteVersionedJsonStateRepository<
  TState,
> implements VersionedJsonStateRepository<TState> {
  private readonly now: () => string;

  constructor(private readonly options: SqliteVersionedJsonStateRepositoryOptions<TState>) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async prepare(): Promise<void> {
    await this.options.store.migrateNamespace(DESKTOP_APPLICATION_STATE_MIGRATIONS);
  }

  read(): Promise<TState> {
    return this.options.store.transaction(
      {
        mode: 'read',
        ownership: 'state',
        operation: `read-${this.options.authorityKey}`,
      },
      ({ sql }) => this.readWith(sql),
    );
  }

  async commit(expectedRevision: number, next: TState): Promise<TState> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw stateError('commit-desktop-application-state', 'Expected revision is invalid.');
    }
    const parsed = this.options.codec.parse(next);
    const nextRevision = this.options.codec.readStorageRevision(parsed);
    if (nextRevision !== expectedRevision + 1) {
      throw stateError(
        'commit-desktop-application-state',
        `State commit must advance revision from ${expectedRevision} to ${expectedRevision + 1}.`,
      );
    }
    const serialized = serializeLocalMetadataJson(parsed, `serialize-${this.options.authorityKey}`);
    return this.options.store.transaction(
      {
        mode: 'state-write',
        ownership: 'state',
        operation: `commit-${this.options.authorityKey}`,
      },
      async ({ sql }) => {
        const current = await this.readWith(sql);
        const currentRevision = this.options.codec.readStorageRevision(current);
        if (currentRevision !== expectedRevision) {
          throw stateError(
            `commit-${this.options.authorityKey}`,
            `State revision ${expectedRevision} is stale; current revision is ${currentRevision}.`,
          );
        }
        const result = await sql.run(
          `INSERT INTO desktop_application_state(
             authority_key, storage_revision, document_json, updated_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(authority_key) DO UPDATE SET
             storage_revision = excluded.storage_revision,
             document_json = excluded.document_json,
             updated_at = excluded.updated_at
           WHERE desktop_application_state.storage_revision = ?`,
          [this.options.authorityKey, nextRevision, serialized, this.now(), expectedRevision],
        );
        if (result.changes !== 1) {
          throw stateError(
            `commit-${this.options.authorityKey}`,
            `State revision ${expectedRevision} lost its compare-and-swap race.`,
          );
        }
        return parsed;
      },
    );
  }

  private async readWith(sql: LocalMetadataSqlExecutor): Promise<TState> {
    const rows = await sql.all(
      `SELECT storage_revision, document_json
         FROM desktop_application_state
        WHERE authority_key = ?`,
      [this.options.authorityKey],
    );
    const row = rows[0];
    if (!row) return this.options.codec.createEmpty();
    const serialized = row['document_json'];
    const revisionValue = row['storage_revision'];
    if (typeof serialized !== 'string') {
      throw stateError(`read-${this.options.authorityKey}`, 'State JSON column is invalid.');
    }
    const revision = typeof revisionValue === 'bigint' ? Number(revisionValue) : revisionValue;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
      throw stateError(`read-${this.options.authorityKey}`, 'State revision column is invalid.');
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(serialized);
    } catch (error) {
      throw stateError(`read-${this.options.authorityKey}`, 'State JSON is corrupt.', error);
    }
    const parsed = this.options.codec.parse(decoded);
    if (this.options.codec.readStorageRevision(parsed) !== revision) {
      throw stateError(
        `read-${this.options.authorityKey}`,
        'State row revision does not match its encoded document.',
      );
    }
    return parsed;
  }
}

function stateError(operation: string, message: string, cause?: unknown): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
