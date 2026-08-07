import type { NekoMetadataOwnership } from './storage';
import type { LocalMetadataRepositories } from './repositories';

export type LocalMetadataStoreState = 'closed' | 'open' | 'disposed';

export type LocalMetadataTransactionMode = 'read' | 'state-write' | 'cache-write' | 'system-write';

export type LocalMetadataDiagnosticCode =
  | 'metadata-store-not-open'
  | 'metadata-store-disposed'
  | 'metadata-store-open-failed'
  | 'metadata-transaction-failed'
  | 'metadata-integrity-failed'
  | 'metadata-backup-failed'
  | 'metadata-restore-failed'
  | 'metadata-unsupported-runtime'
  | 'metadata-secret-forbidden'
  | 'metadata-binary-forbidden'
  | 'metadata-record-too-large'
  | 'metadata-schema-forbidden'
  | 'metadata-stale-projection';

export interface LocalMetadataDiagnostic {
  readonly code: LocalMetadataDiagnosticCode;
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}

export class LocalMetadataError extends Error {
  readonly code: LocalMetadataDiagnosticCode;
  readonly operation: string;
  override readonly cause: unknown;

  constructor(diagnostic: LocalMetadataDiagnostic) {
    super(diagnostic.message);
    this.name = 'LocalMetadataError';
    this.code = diagnostic.code;
    this.operation = diagnostic.operation;
    this.cause = diagnostic.cause;
  }
}

export interface LocalMetadataOpenOptions {
  readonly databasePath: string;
  readonly busyTimeoutMs: number;
}

export interface LocalMetadataTransactionOptions {
  readonly mode: LocalMetadataTransactionMode;
  readonly ownership: NekoMetadataOwnership | 'system';
  readonly operation: string;
}

export type LocalMetadataSqlBindingValue = string | number | bigint | null;

export interface LocalMetadataSqlRunResult {
  readonly changes: number;
  readonly lastInsertRowid: number | bigint;
}

export interface LocalMetadataSqlRow {
  readonly [column: string]: unknown;
}

export interface LocalMetadataSqlExecutor {
  run(
    sql: string,
    parameters?: readonly LocalMetadataSqlBindingValue[],
  ): Promise<LocalMetadataSqlRunResult>;
  all(
    sql: string,
    parameters?: readonly LocalMetadataSqlBindingValue[],
  ): Promise<readonly LocalMetadataSqlRow[]>;
}

export interface LocalMetadataTransactionContext {
  readonly mode: LocalMetadataTransactionMode;
  readonly ownership: NekoMetadataOwnership | 'system';
  readonly repositories: LocalMetadataRepositories;
  readonly sql: LocalMetadataSqlExecutor;
}

export interface LocalMetadataBackupRequest {
  readonly destinationPath: string;
  readonly reason: 'manual' | 'scheduled' | 'recovery';
}

export interface LocalMetadataBackupResult {
  readonly destinationPath: string;
  readonly completedAt: string;
}

export interface LocalMetadataRestoreRequest {
  readonly sourcePath: string;
}

export interface LocalMetadataRestoreResult {
  readonly sourcePath: string;
  readonly restoredAt: string;
  readonly safetyBackupPath: string | null;
}

export interface LocalMetadataIntegrityReport {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly messages: readonly string[];
}

export interface LocalMetadataStore {
  readonly state: LocalMetadataStoreState;
  readonly repositories: LocalMetadataRepositories;

  open(options: LocalMetadataOpenOptions): Promise<void>;

  transaction<T>(
    options: LocalMetadataTransactionOptions,
    operation: (context: LocalMetadataTransactionContext) => Promise<T>,
  ): Promise<T>;

  backup(request: LocalMetadataBackupRequest): Promise<LocalMetadataBackupResult>;

  restore(request: LocalMetadataRestoreRequest): Promise<LocalMetadataRestoreResult>;

  integrityCheck(): Promise<LocalMetadataIntegrityReport>;

  dispose(): Promise<void>;
}
