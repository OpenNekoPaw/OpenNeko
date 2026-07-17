import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DatabaseSync, SQLInputValue, backup as nodeSqliteBackup } from 'node:sqlite';
import {
  createSqliteLocalMetadataStore,
  isSqliteCorruptionError,
  type SqliteBindingValue,
  type SqliteConnection,
  type SqliteConnectionFactory,
  type SqliteRow,
  type SqliteRunResult,
} from '../../local-metadata/sqlite';
import { resolveGlobalStorageLayout } from '../../types/storage';
import {
  LocalMetadataError,
  type LocalMetadataOpenOptions,
  type LocalMetadataStore,
} from '../../local-metadata';

export interface NodeSqliteLocalMetadataStoreOptions {
  readonly homedir: string;
}

function normalizeRows(rows: unknown): readonly SqliteRow[] {
  if (!Array.isArray(rows)) {
    throw new TypeError('node:sqlite query did not return an array');
  }
  return rows.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new TypeError('node:sqlite query returned a non-record row');
    }
    return row;
  });
}

function toNodeParameters(parameters: readonly SqliteBindingValue[]): readonly SQLInputValue[] {
  return parameters;
}

function translateNodeSqliteError(operation: string, error: unknown): LocalMetadataError {
  if (error instanceof LocalMetadataError) return error;
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message: `node:sqlite operation failed: ${operation}`,
    cause: error,
  });
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(
    private readonly database: DatabaseSync,
    private readonly backupOperation: typeof nodeSqliteBackup,
  ) {}

  async exec(sql: string): Promise<void> {
    try {
      this.database.exec(sql);
    } catch (error) {
      throw translateNodeSqliteError('exec', error);
    }
  }

  async run(sql: string, parameters: readonly SqliteBindingValue[] = []): Promise<SqliteRunResult> {
    try {
      const result = this.database.prepare(sql).run(...toNodeParameters(parameters));
      return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
    } catch (error) {
      throw translateNodeSqliteError('run', error);
    }
  }

  async all(
    sql: string,
    parameters: readonly SqliteBindingValue[] = [],
  ): Promise<readonly SqliteRow[]> {
    try {
      return normalizeRows(this.database.prepare(sql).all(...toNodeParameters(parameters)));
    } catch (error) {
      throw translateNodeSqliteError('query', error);
    }
  }

  async backup(destinationPath: string): Promise<void> {
    await mkdir(dirname(destinationPath), { recursive: true });
    await this.backupOperation(this.database, destinationPath);
  }

  async close(): Promise<void> {
    this.database.close();
  }
}

class NodeSqliteConnectionFactory implements SqliteConnectionFactory {
  async open(options: LocalMetadataOpenOptions): Promise<SqliteConnection> {
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
    if (!Number.isSafeInteger(nodeMajor) || nodeMajor < 24) {
      throw new LocalMetadataError({
        code: 'metadata-unsupported-runtime',
        operation: 'open-node-sqlite',
        message: `node:sqlite requires Node 24 or newer; received ${process.versions.node}`,
      });
    }
    let sqlite: typeof import('node:sqlite');
    try {
      sqlite = await import('node:sqlite');
    } catch (error) {
      throw new LocalMetadataError({
        code: 'metadata-unsupported-runtime',
        operation: 'open-node-sqlite',
        message: 'The Extension Host does not expose the required node:sqlite module',
        cause: error,
      });
    }
    await mkdir(dirname(options.databasePath), { recursive: true });
    let database: DatabaseSync | null = null;
    try {
      database = new sqlite.DatabaseSync(options.databasePath, {
        enableForeignKeyConstraints: true,
        timeout: options.busyTimeoutMs,
      });
      database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = ${options.busyTimeoutMs};
      `);
      return new NodeSqliteConnection(database, sqlite.backup);
    } catch (error) {
      database?.close();
      if (isSqliteCorruptionError(error)) {
        throw new LocalMetadataError({
          code: 'metadata-integrity-failed',
          operation: 'open-node-sqlite',
          message: 'The local metadata database is corrupt or is not a SQLite database',
          cause: error,
        });
      }
      throw error;
    }
  }

  async restore(sourcePath: string, destinationPath: string): Promise<string | null> {
    const sqlite = await import('node:sqlite');
    await verifyNodeSqliteDatabase(sqlite.DatabaseSync, sourcePath);
    await mkdir(dirname(destinationPath), { recursive: true });
    const temporaryPath = `${destinationPath}.restore.tmp`;
    const safetyBackupPath = `${destinationPath}.pre-restore.bak`;
    await rm(temporaryPath, { force: true });
    await copyFile(sourcePath, temporaryPath);
    await verifyNodeSqliteDatabase(sqlite.DatabaseSync, temporaryPath);

    const destinationExists = await pathExists(destinationPath);
    if (destinationExists) {
      await rm(safetyBackupPath, { force: true });
      const current = new sqlite.DatabaseSync(destinationPath);
      try {
        await sqlite.backup(current, safetyBackupPath);
      } finally {
        current.close();
      }
    }

    try {
      await rm(`${destinationPath}-wal`, { force: true });
      await rm(`${destinationPath}-shm`, { force: true });
      await rm(destinationPath, { force: true });
      await rename(temporaryPath, destinationPath);
      await verifyNodeSqliteDatabase(sqlite.DatabaseSync, destinationPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (destinationExists && (await pathExists(safetyBackupPath))) {
        await copyFile(safetyBackupPath, destinationPath);
      }
      throw error;
    }
    return destinationExists ? safetyBackupPath : null;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function verifyNodeSqliteDatabase(
  Database: typeof DatabaseSync,
  databasePath: string,
): Promise<void> {
  const database = new Database(databasePath, { readOnly: true });
  try {
    const rows = normalizeRows(database.prepare('PRAGMA integrity_check').all());
    if (rows.length !== 1 || rows[0]?.['integrity_check'] !== 'ok') {
      throw new LocalMetadataError({
        code: 'metadata-restore-failed',
        operation: 'verify-restore-source',
        message: `SQLite restore source failed integrity_check: ${databasePath}`,
      });
    }
  } finally {
    database.close();
  }
}

export function createNodeSqliteLocalMetadataStore(
  options: NodeSqliteLocalMetadataStoreOptions,
): LocalMetadataStore {
  return createSqliteLocalMetadataStore({
    expectedDatabasePath: resolveGlobalStorageLayout(options.homedir).database,
    connectionFactory: new NodeSqliteConnectionFactory(),
  });
}
