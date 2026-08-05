import {
  LocalMetadataError,
  type LocalMetadataSqlExecutor,
  type LocalMetadataStore,
} from './contracts';
import { serializeLocalMetadataJson } from './secret-boundary';
import { initializeLocalMetadataTables } from './table-initialization';

export const DESKTOP_STATE_AUTHORITY_KEYS = {
  shell: 'desktop.shell',
  applicationSettings: 'desktop.application-settings',
} as const;

export type DesktopStateAuthorityKey =
  (typeof DESKTOP_STATE_AUTHORITY_KEYS)[keyof typeof DESKTOP_STATE_AUTHORITY_KEYS];

export interface JsonStateCodec<TState> {
  createEmpty(): TState;
  parse(value: unknown): TState;
  serialize?(state: TState): unknown;
}

export interface JsonStateRepository<TState> {
  read(): Promise<TState>;
  commit(next: TState): Promise<TState>;
}

export interface SqliteJsonStateRepositoryOptions<TState> {
  readonly store: LocalMetadataStore;
  readonly authorityKey: DesktopStateAuthorityKey;
  readonly codec: JsonStateCodec<TState>;
  readonly now?: () => string;
}

export interface InvalidJsonStateRejection {
  readonly rejectionId: number;
  readonly authorityKey: DesktopStateAuthorityKey;
  readonly diagnostic: string;
  readonly rejectedAt: string;
}

interface RawStateRow {
  readonly documentJson: string;
}

interface RejectedStateRow extends RawStateRow {
  readonly rejection: InvalidJsonStateRejection;
}

const DESKTOP_APPLICATION_STATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS desktop_application_state (
    authority_key TEXT PRIMARY KEY,
    document_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT`,
] as const;

export class SqliteJsonStateRepository<TState> implements JsonStateRepository<TState> {
  private readonly now: () => string;
  private rejectedState: RejectedStateRow | undefined;
  private isolatedState: { value: TState } | undefined;

  constructor(private readonly options: SqliteJsonStateRepositoryOptions<TState>) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  prepare(): Promise<void> {
    return initializeLocalMetadataTables(this.options.store, {
      ownership: 'state',
      operation: 'initialize-desktop-application-state-table',
      statements: DESKTOP_APPLICATION_STATE_TABLES,
    });
  }

  inspectInvalidState(): Promise<InvalidJsonStateRejection | undefined> {
    return this.options.store.transaction(
      {
        mode: 'read',
        ownership: 'state',
        operation: `inspect-${this.options.authorityKey}`,
      },
      async ({ sql }) => {
        const row = await this.readRawRow(sql);
        if (!row) {
          this.rejectedState = undefined;
          this.isolatedState = undefined;
          return undefined;
        }
        try {
          this.parseRawRow(row);
          this.rejectedState = undefined;
          this.isolatedState = undefined;
          return undefined;
        } catch (error) {
          const rejection = {
            rejectionId: 1,
            authorityKey: this.options.authorityKey,
            diagnostic: describeStateRejection(error),
            rejectedAt: this.now(),
          } as const;
          this.rejectedState = { ...row, rejection };
          this.isolatedState = { value: this.options.codec.createEmpty() };
          return rejection;
        }
      },
    );
  }

  read(): Promise<TState> {
    return this.options.store.transaction(
      {
        mode: 'read',
        ownership: 'state',
        operation: `read-${this.options.authorityKey}`,
      },
      async ({ sql }) => {
        const row = await this.readRawRow(sql);
        if (row && this.matchesRejectedState(row)) {
          return this.requireIsolatedState();
        }
        const state = row ? this.parseRawRow(row) : this.options.codec.createEmpty();
        this.rejectedState = undefined;
        this.isolatedState = undefined;
        return state;
      },
    );
  }

  async commit(next: TState): Promise<TState> {
    const parsed = this.options.codec.parse(next);
    const serialized = serializeLocalMetadataJson(
      this.options.codec.serialize?.(parsed) ?? parsed,
      `serialize-${this.options.authorityKey}`,
    );
    return this.options.store.transaction(
      {
        mode: 'state-write',
        ownership: 'state',
        operation: `commit-${this.options.authorityKey}`,
      },
      async ({ sql }) => {
        const row = await this.readRawRow(sql);
        if (row && this.matchesRejectedState(row)) {
          this.requireIsolatedState();
          this.isolatedState = { value: parsed };
          return parsed;
        }
        if (row) this.parseRawRow(row);
        await sql.run(
          `INSERT INTO desktop_application_state(
             authority_key, document_json, updated_at
           ) VALUES (?, ?, ?)
           ON CONFLICT(authority_key) DO UPDATE SET
             document_json = excluded.document_json,
             updated_at = excluded.updated_at`,
          [this.options.authorityKey, serialized, this.now()],
        );
        this.rejectedState = undefined;
        this.isolatedState = undefined;
        return parsed;
      },
    );
  }

  private matchesRejectedState(row: RawStateRow): boolean {
    const rejected = this.rejectedState;
    return rejected !== undefined && row.documentJson === rejected.documentJson;
  }

  private requireIsolatedState(): TState {
    const isolated = this.isolatedState;
    if (!isolated) {
      throw stateError(
        `read-${this.options.authorityKey}`,
        'Rejected state has no isolated session projection.',
      );
    }
    return isolated.value;
  }

  private async readRawRow(sql: LocalMetadataSqlExecutor): Promise<RawStateRow | undefined> {
    const rows = await sql.all(
      `SELECT document_json
         FROM desktop_application_state
        WHERE authority_key = ?`,
      [this.options.authorityKey],
    );
    const row = rows[0];
    if (!row) return undefined;
    const serialized = row['document_json'];
    if (typeof serialized !== 'string') {
      throw stateError(`read-${this.options.authorityKey}`, 'State JSON column is invalid.');
    }
    return { documentJson: serialized };
  }

  private parseRawRow(row: RawStateRow): TState {
    let decoded: unknown;
    try {
      decoded = JSON.parse(row.documentJson);
    } catch (error) {
      throw stateError(`read-${this.options.authorityKey}`, 'State JSON is corrupt.', error);
    }
    return this.options.codec.parse(decoded);
  }
}

function describeStateRejection(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stateError(operation: string, message: string, cause?: unknown): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
