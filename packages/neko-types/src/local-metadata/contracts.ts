import type { NekoMetadataOwnership } from '../types/storage';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from './model';
import type { LocalMetadataRepositories } from './repositories';

export type LocalMetadataStoreState = 'closed' | 'open' | 'disposed';

export type LocalMetadataTransactionMode = 'read' | 'state-write' | 'cache-write' | 'system-write';

export type LocalMetadataDiagnosticCode =
  | 'metadata-store-not-open'
  | 'metadata-store-disposed'
  | 'metadata-store-open-failed'
  | 'metadata-transaction-failed'
  | 'metadata-migration-failed'
  | 'metadata-migration-checksum-mismatch'
  | 'metadata-integrity-failed'
  | 'metadata-backup-failed'
  | 'metadata-restore-failed'
  | 'metadata-unsupported-runtime'
  | 'metadata-secret-forbidden'
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

export interface LocalMetadataTransactionContext {
  readonly mode: LocalMetadataTransactionMode;
  readonly ownership: NekoMetadataOwnership | 'system';
  readonly repositories: LocalMetadataRepositories;
}

export interface LocalMetadataMigration {
  readonly namespace: string;
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly ownership: NekoMetadataOwnership | 'system';
  readonly destructive: boolean;
  readonly statements: readonly string[];
}

export interface LocalMetadataMigrationResult {
  readonly namespace: string;
  readonly previousVersion: number;
  readonly currentVersion: number;
  readonly appliedVersions: readonly number[];
}

export interface LocalMetadataMigrationOptions {
  readonly destructiveBackup?: LocalMetadataBackupRequest;
}

export interface LocalMetadataBackupRequest {
  readonly destinationPath: string;
  readonly reason: 'migration' | 'manual' | 'scheduled' | 'recovery';
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

  readPartitionRevision(
    partition: LocalMetadataPartition,
  ): Promise<LocalMetadataPartitionRevision | null>;

  migrateNamespace(
    migrations: readonly LocalMetadataMigration[],
    options?: LocalMetadataMigrationOptions,
  ): Promise<LocalMetadataMigrationResult>;

  backup(request: LocalMetadataBackupRequest): Promise<LocalMetadataBackupResult>;

  restore(request: LocalMetadataRestoreRequest): Promise<LocalMetadataRestoreResult>;

  integrityCheck(): Promise<LocalMetadataIntegrityReport>;

  dispose(): Promise<void>;
}

export function validateLocalMetadataMigrationSequence(
  migrations: readonly LocalMetadataMigration[],
): void {
  if (migrations.length === 0) return;
  const namespace = migrations[0]?.namespace;
  let previousVersion = 0;
  const seenVersions = new Set<number>();
  for (const migration of migrations) {
    if (!namespace || migration.namespace !== namespace) {
      throw new LocalMetadataError({
        code: 'metadata-migration-failed',
        operation: 'validate-migration-sequence',
        message: 'A migration sequence must contain exactly one namespace',
      });
    }
    if (!Number.isSafeInteger(migration.version) || migration.version <= previousVersion) {
      throw new LocalMetadataError({
        code: 'metadata-migration-failed',
        operation: 'validate-migration-sequence',
        message: `Migration versions must be positive and strictly increasing: ${migration.version}`,
      });
    }
    if (seenVersions.has(migration.version) || !migration.checksum.trim()) {
      throw new LocalMetadataError({
        code: 'metadata-migration-failed',
        operation: 'validate-migration-sequence',
        message: `Migration ${migration.namespace}/${migration.version} has a duplicate version or empty checksum`,
      });
    }
    if (migration.statements.length === 0) {
      throw new LocalMetadataError({
        code: 'metadata-migration-failed',
        operation: 'validate-migration-sequence',
        message: `Migration ${migration.namespace}/${migration.version} must contain schema statements`,
      });
    }
    seenVersions.add(migration.version);
    previousVersion = migration.version;
  }
}
