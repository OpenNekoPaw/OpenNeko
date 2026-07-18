import { Database } from 'bun:sqlite';
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  LocalMetadataError,
  type LocalMetadataOpenOptions,
  type LocalMetadataStore,
} from '@neko/shared';
import {
  createSqliteLocalMetadataStore,
  isSqliteCorruptionError,
  type SqliteBindingValue,
  type SqliteConnection,
  type SqliteConnectionFactory,
  type SqliteRow,
  type SqliteRunResult,
} from '@neko/shared/local-metadata/sqlite';
import { resolveGlobalStorageLayout } from '@neko/shared';

export interface BunSqliteLocalMetadataStoreOptions {
  readonly homedir: string;
}

function isRuntimeVersionAtLeast(current: string, minimum: readonly number[]): boolean {
  const currentParts = current.split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < minimum.length; index += 1) {
    const actual = currentParts[index] ?? 0;
    const required = minimum[index] ?? 0;
    if (actual > required) return true;
    if (actual < required) return false;
  }
  return true;
}

export function assertSupportedBunSqliteRuntimeVersion(current: string): void {
  if (isRuntimeVersionAtLeast(current, [1, 3, 10])) return;
  throw new LocalMetadataError({
    code: 'metadata-unsupported-runtime',
    operation: 'open-bun-sqlite',
    message: `bun:sqlite requires Bun 1.3.10 or newer; received ${current}`,
  });
}

function normalizeRows(rows: unknown): readonly SqliteRow[] {
  if (!Array.isArray(rows)) {
    throw new TypeError('bun:sqlite query did not return an array');
  }
  return rows.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new TypeError('bun:sqlite query returned a non-record row');
    }
    return row;
  });
}

function translateBunSqliteError(operation: string, error: unknown): LocalMetadataError {
  if (error instanceof LocalMetadataError) return error;
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message: `bun:sqlite operation failed: ${operation}`,
    cause: error,
  });
}

class BunSqliteConnection implements SqliteConnection {
  constructor(private readonly database: Database) {}

  async exec(sql: string): Promise<void> {
    try {
      this.database.exec(sql);
    } catch (error) {
      throw translateBunSqliteError('exec', error);
    }
  }

  async run(sql: string, parameters: readonly SqliteBindingValue[] = []): Promise<SqliteRunResult> {
    try {
      const result = this.database.query(sql).run(...parameters);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (error) {
      throw translateBunSqliteError('run', error);
    }
  }

  async all(
    sql: string,
    parameters: readonly SqliteBindingValue[] = [],
  ): Promise<readonly SqliteRow[]> {
    try {
      return normalizeRows(this.database.query(sql).all(...parameters));
    } catch (error) {
      throw translateBunSqliteError('query', error);
    }
  }

  async backup(destinationPath: string): Promise<void> {
    await mkdir(dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, this.database.serialize());
  }

  async close(): Promise<void> {
    this.database.close();
  }
}

class BunSqliteConnectionFactory implements SqliteConnectionFactory {
  async open(options: LocalMetadataOpenOptions): Promise<SqliteConnection> {
    assertSupportedBunSqliteRuntimeVersion(Bun.version);
    await mkdir(dirname(options.databasePath), { recursive: true });
    let database: Database | null = null;
    try {
      database = new Database(options.databasePath, { create: true, strict: true });
      database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA synchronous = FULL;
        PRAGMA busy_timeout = ${options.busyTimeoutMs};
      `);
      return new BunSqliteConnection(database);
    } catch (error) {
      database?.close();
      if (isSqliteCorruptionError(error)) {
        throw new LocalMetadataError({
          code: 'metadata-integrity-failed',
          operation: 'open-bun-sqlite',
          message: 'The local metadata database is corrupt or is not a SQLite database',
          cause: error,
        });
      }
      throw error;
    }
  }

  async restore(sourcePath: string, destinationPath: string): Promise<string | null> {
    await verifyBunSqliteDatabase(sourcePath);
    await mkdir(dirname(destinationPath), { recursive: true });
    const temporaryPath = `${destinationPath}.restore.tmp`;
    const safetyBackupPath = `${destinationPath}.pre-restore.bak`;
    await rm(temporaryPath, { force: true });
    await copyFile(sourcePath, temporaryPath);
    await verifyBunSqliteDatabase(temporaryPath);

    const destinationExists = await pathExists(destinationPath);
    if (destinationExists) {
      await rm(safetyBackupPath, { force: true });
      const current = new Database(destinationPath, { strict: true });
      try {
        await writeFile(safetyBackupPath, current.serialize());
      } finally {
        current.close();
      }
    }

    try {
      await rm(`${destinationPath}-wal`, { force: true });
      await rm(`${destinationPath}-shm`, { force: true });
      await rm(destinationPath, { force: true });
      await rename(temporaryPath, destinationPath);
      await verifyBunSqliteDatabase(destinationPath);
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

async function verifyBunSqliteDatabase(databasePath: string): Promise<void> {
  const file = await stat(databasePath);
  if (!file.isFile()) {
    throw new LocalMetadataError({
      code: 'metadata-restore-failed',
      operation: 'verify-restore-source',
      message: `SQLite restore source is not a file: ${databasePath}`,
    });
  }
  const database = new Database(databasePath, { strict: true });
  try {
    const rows = normalizeRows(database.query('PRAGMA integrity_check').all());
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

export function createBunSqliteLocalMetadataStore(
  options: BunSqliteLocalMetadataStoreOptions,
): LocalMetadataStore {
  return createSqliteLocalMetadataStore({
    expectedDatabasePath: resolveGlobalStorageLayout(options.homedir).database,
    connectionFactory: new BunSqliteConnectionFactory(),
  });
}
