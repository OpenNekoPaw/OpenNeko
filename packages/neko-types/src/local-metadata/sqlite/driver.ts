import type {
  LocalMetadataOpenOptions,
  LocalMetadataSqlBindingValue,
  LocalMetadataSqlExecutor,
  LocalMetadataSqlRow,
  LocalMetadataSqlRunResult,
} from '../contracts';

export type SqliteBindingValue = LocalMetadataSqlBindingValue;

export interface SqliteRunResult extends LocalMetadataSqlRunResult {}

export interface SqliteRow extends LocalMetadataSqlRow {}

export interface SqliteConnection extends LocalMetadataSqlExecutor {
  exec(sql: string): Promise<void>;
  backup(destinationPath: string): Promise<void>;
  close(): Promise<void>;
}

export interface SqliteConnectionFactory {
  open(options: LocalMetadataOpenOptions): Promise<SqliteConnection>;
  restore(sourcePath: string, destinationPath: string): Promise<string | null>;
}
