import type { NekoMetadataOwnership } from './storage';
import type { LocalMetadataStore } from './contracts';

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
    },
  );
}
