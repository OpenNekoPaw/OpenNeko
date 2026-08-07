import type { NekoMetadataOwnership } from './storage';
import { LocalMetadataError, type LocalMetadataStore } from './contracts';

const SEARCH_FTS_ENGINE_TABLES = new Set([
  'search_documents_fts',
  'search_documents_fts_config',
  'search_documents_fts_content',
  'search_documents_fts_data',
  'search_documents_fts_docsize',
  'search_documents_fts_idx',
]);

export interface LocalMetadataTableInitialization {
  readonly ownership: NekoMetadataOwnership | 'system';
  readonly operation: string;
  readonly statements: readonly string[];
}

export async function initializeLocalMetadataTables(
  store: LocalMetadataStore,
  initialization: LocalMetadataTableInitialization,
): Promise<void> {
  if (!initialization.operation.trim() || initialization.statements.length === 0) {
    throw new Error('Local metadata table initialization requires an operation and statements.');
  }
  await store.transaction(
    {
      mode: 'system-write',
      ownership: initialization.ownership,
      operation: initialization.operation,
    },
    async ({ sql }) => {
      for (const statement of initialization.statements) {
        const normalized = statement.trimStart().toUpperCase();
        if (
          !normalized.startsWith('CREATE TABLE IF NOT EXISTS ') &&
          !normalized.startsWith('CREATE INDEX IF NOT EXISTS ') &&
          !normalized.startsWith('CREATE VIRTUAL TABLE IF NOT EXISTS ') &&
          !normalized.startsWith('CREATE TRIGGER IF NOT EXISTS ')
        ) {
          throw new Error(
            `Local metadata initialization '${initialization.operation}' contains non-additive SQL.`,
          );
        }
        await sql.run(statement);
      }
      const columns = await sql.all(
        `SELECT schema.name AS table_name,
                columns.name AS column_name,
                columns.type AS declared_type
           FROM sqlite_schema AS schema
           JOIN pragma_table_info(schema.name) AS columns
          WHERE schema.type = 'table'
            AND schema.name NOT LIKE 'sqlite_%'
          ORDER BY schema.name, columns.cid`,
      );
      for (const column of columns) {
        const tableName = readSchemaText(column['table_name'], initialization.operation);
        if (SEARCH_FTS_ENGINE_TABLES.has(tableName)) continue;
        const columnName = readSchemaText(column['column_name'], initialization.operation);
        const declaredType = readSchemaText(column['declared_type'], initialization.operation);
        if (!declaredType.trim() || declaredType.trim().toUpperCase() === 'BLOB') {
          throw new LocalMetadataError({
            code: 'metadata-schema-forbidden',
            operation: initialization.operation,
            message: `Local metadata application column cannot accept binary values: ${tableName}.${columnName}`,
          });
        }
      }
    },
  );
}

function readSchemaText(value: unknown, operation: string): string {
  if (typeof value === 'string') return value;
  throw new LocalMetadataError({
    code: 'metadata-integrity-failed',
    operation,
    message: `SQLite schema metadata is invalid for ${operation}`,
  });
}
