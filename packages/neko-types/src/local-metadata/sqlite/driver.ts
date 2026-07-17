import type { LocalMetadataOpenOptions } from '../contracts';

export type SqliteBindingValue = string | number | bigint | Uint8Array | null;

export interface SqliteRunResult {
  readonly changes: number;
  readonly lastInsertRowid: number | bigint;
}

export interface SqliteRow {
  readonly [column: string]: unknown;
}

export interface SqliteConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, parameters?: readonly SqliteBindingValue[]): Promise<SqliteRunResult>;
  all(sql: string, parameters?: readonly SqliteBindingValue[]): Promise<readonly SqliteRow[]>;
  backup(destinationPath: string): Promise<void>;
  close(): Promise<void>;
}

export interface SqliteConnectionFactory {
  open(options: LocalMetadataOpenOptions): Promise<SqliteConnection>;
  restore(sourcePath: string, destinationPath: string): Promise<string | null>;
}
