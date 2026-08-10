import { initializeLocalMetadataTables, type LocalMetadataStore } from '@neko/local-metadata';
import { GenerationJobError } from './contracts';

const GENERATION_JOB_COLUMNS = [
  { name: 'workspace_id', type: 'TEXT', notNull: 1, primaryKey: 1 },
  { name: 'job_id', type: 'TEXT', notNull: 1, primaryKey: 2 },
  { name: 'phase', type: 'TEXT', notNull: 1, primaryKey: 0 },
  { name: 'snapshot_json', type: 'TEXT', notNull: 1, primaryKey: 0 },
  { name: 'created_at', type: 'INTEGER', notNull: 1, primaryKey: 0 },
  { name: 'updated_at', type: 'INTEGER', notNull: 1, primaryKey: 0 },
] as const;

const GENERATION_JOB_TABLES = [
  `CREATE TABLE IF NOT EXISTS generation_jobs (
    workspace_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (
      phase IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome-unknown')
    ),
    snapshot_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    PRIMARY KEY (workspace_id, job_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS generation_jobs_workspace_phase_updated_idx
    ON generation_jobs(workspace_id, phase, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS assistant_generation_jobs (
    assistant_space_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (
      phase IN ('pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome-unknown')
    ),
    snapshot_json TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    PRIMARY KEY (assistant_space_id, job_id)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS assistant_generation_jobs_owner_phase_updated_idx
    ON assistant_generation_jobs(assistant_space_id, phase, updated_at DESC)`,
] as const;

export async function initializeGenerationJobTables(store: LocalMetadataStore): Promise<void> {
  await resetEmptyNonCanonicalGenerationJobTable(store);
  await initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-generation-job-tables',
    statements: GENERATION_JOB_TABLES,
  });
}

async function resetEmptyNonCanonicalGenerationJobTable(store: LocalMetadataStore): Promise<void> {
  await store.transaction(
    {
      mode: 'system-write',
      ownership: 'state',
      operation: 'validate-generation-job-table',
    },
    async ({ sql }) => {
      const columns = await sql.all(
        `SELECT name, type, "notnull" AS not_null, pk
           FROM pragma_table_info('generation_jobs')
          ORDER BY cid`,
      );
      if (columns.length === 0 || hasCanonicalColumns(columns)) return;

      const countRows = await sql.all('SELECT COUNT(*) AS row_count FROM generation_jobs');
      const rowCount = countRows[0]?.['row_count'];
      if (typeof rowCount !== 'number' || !Number.isSafeInteger(rowCount) || rowCount < 0) {
        throw invalidGenerationJobTable(
          'Generation Job persistence returned an invalid row count while validating its table.',
        );
      }
      if (rowCount > 0) {
        throw invalidGenerationJobTable(
          `Generation Job persistence uses a non-canonical table containing ${rowCount} record${rowCount === 1 ? '' : 's'}; the records were preserved and provider execution was not started.`,
        );
      }

      await sql.run('DROP TABLE generation_jobs');
      for (const statement of GENERATION_JOB_TABLES) {
        await sql.run(statement);
      }
    },
  );
}

function hasCanonicalColumns(rows: readonly Readonly<Record<string, unknown>>[]): boolean {
  if (rows.length !== GENERATION_JOB_COLUMNS.length) return false;
  return GENERATION_JOB_COLUMNS.every((expected, index) => {
    const row = rows[index];
    return (
      row?.['name'] === expected.name &&
      row['type'] === expected.type &&
      row['not_null'] === expected.notNull &&
      row['pk'] === expected.primaryKey
    );
  });
}

function invalidGenerationJobTable(message: string): GenerationJobError {
  return new GenerationJobError('generation-job-persistence-invalid', message);
}
