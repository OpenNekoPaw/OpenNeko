import {
  parseWorldProject,
  parseWorldRun,
  parseWorldSave,
  parseWorldVersion,
  type WorldVersion,
} from '@neko/world/contracts';
import {
  LocalMetadataError,
  initializeLocalMetadataTables,
  serializeLocalMetadataJson,
  type LocalMetadataSqlExecutor,
  type LocalMetadataSqlRow,
  type LocalMetadataStore,
} from '@neko/local-metadata';
import type {
  WorldAuthoringRepository,
  WorldDurableCatalogPort,
  WorldRuntimeAggregate,
  WorldRuntimeRepository,
} from '@neko/world/application';

export interface WorldPersistentRepository
  extends WorldAuthoringRepository, WorldRuntimeRepository, WorldDurableCatalogPort {}

export function initializeWorldPersistenceTables(store: LocalMetadataStore): Promise<void> {
  return initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-world-persistence-tables',
    statements: [
      `CREATE TABLE IF NOT EXISTS world_projects (
        world_project_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS world_versions (
        world_version_id TEXT PRIMARY KEY,
        world_project_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS world_runtime_aggregates (
        world_run_id TEXT PRIMARY KEY,
        world_version_id TEXT NOT NULL,
        world_state_revision INTEGER NOT NULL CHECK (world_state_revision >= 0),
        run_json TEXT NOT NULL,
        save_json TEXT NOT NULL
      ) STRICT`,
    ],
  });
}

export function createPersistentWorldRepository(options: {
  readonly metadataStore: LocalMetadataStore;
}): WorldPersistentRepository {
  const repository: WorldPersistentRepository = {
    readCatalog: (signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-world-catalog' },
        async ({ sql }) => {
          const diagnostics: import('@neko/world/application').WorldDurableRecordDiagnostic[] = [];
          const projects = await readCatalogPayloads(
            sql,
            'world_projects',
            'world_project_id',
            'world-project',
            parseWorldProject,
            (record) => record.worldProjectId,
            diagnostics,
          );
          const versions = await readCatalogPayloads(
            sql,
            'world_versions',
            'world_version_id',
            'world-version',
            parseWorldVersion,
            (record) => record.worldVersionId,
            diagnostics,
          );
          const runtimeRows = await sql.all(
            `SELECT world_run_id FROM world_runtime_aggregates ORDER BY world_run_id`,
          );
          const runtimes = [];
          for (const row of runtimeRows) {
            const recordId = diagnosticText(row['world_run_id']);
            try {
              const aggregate = await readRuntime(sql, recordId, 'read-world-catalog');
              if (!aggregate) throw new Error(`WorldRun '${recordId}' is missing.`);
              runtimes.push({ run: aggregate.run, save: aggregate.save });
            } catch (error) {
              diagnostics.push({
                recordKind: 'world-runtime',
                recordId,
                message: error instanceof Error ? error.message : String(error),
              });
            }
          }
          return { projects, versions, runtimes, diagnostics };
        },
      );
    },
    readProject: (identity, signal) => {
      signal?.throwIfAborted();
      return readPayload(
        options.metadataStore,
        'read-world-project',
        'world_projects',
        'world_project_id',
        identity,
        parseWorldProject,
        (record) => record.worldProjectId,
      );
    },
    saveProject: (project, signal) => {
      signal?.throwIfAborted();
      const canonical = parseWorldProject(project);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'save-world-project' },
        async ({ sql }) => {
          await sql.run(
            `INSERT INTO world_projects(world_project_id, payload_json) VALUES (?, ?)
             ON CONFLICT(world_project_id) DO UPDATE SET payload_json = excluded.payload_json`,
            [canonical.worldProjectId, encode(canonical, 'save-world-project')],
          );
        },
      );
    },
    storePublication: (publication, signal) => {
      signal?.throwIfAborted();
      const canonical = parseWorldVersion(publication);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'store-world-version' },
        async ({ sql }) => {
          const payload = encode(canonical, 'store-world-version');
          await sql.run(
            `INSERT INTO world_versions(world_version_id, world_project_id, payload_json)
             VALUES (?, ?, ?) ON CONFLICT(world_version_id) DO NOTHING`,
            [canonical.worldVersionId, canonical.worldProjectId, payload],
          );
          const rows = await sql.all(
            `SELECT payload_json FROM world_versions WHERE world_version_id = ?`,
            [canonical.worldVersionId],
          );
          if (rows.length !== 1 || readText(rows[0]!, 'payload_json') !== payload) {
            throw metadataError(
              'store-world-version',
              `Immutable WorldVersion '${canonical.worldVersionId}' already exists with other content.`,
            );
          }
        },
      );
    },
    readPublication: (identity, signal) => {
      signal?.throwIfAborted();
      return readPayload(
        options.metadataStore,
        'read-world-version',
        'world_versions',
        'world_version_id',
        identity,
        parseWorldVersion,
        (record) => record.worldVersionId,
      );
    },
    createRuntime: (aggregate, signal) => {
      signal?.throwIfAborted();
      const canonical = parseAggregate(aggregate);
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-world-runtime' },
        async ({ sql }) => {
          const publication = await requirePublication(
            sql,
            canonical.publication.worldVersionId,
            'create-world-runtime',
          );
          if (
            encode(publication, 'create-world-runtime') !==
            encode(canonical.publication, 'create-world-runtime')
          ) {
            throw metadataError(
              'create-world-runtime',
              `WorldRun '${canonical.run.worldRunId}' publication does not match its WorldVersion authority.`,
            );
          }
          const result = await sql.run(
            `INSERT INTO world_runtime_aggregates(
               world_run_id, world_version_id, world_state_revision, run_json, save_json
             ) VALUES (?, ?, ?, ?, ?) ON CONFLICT(world_run_id) DO NOTHING`,
            [
              canonical.run.worldRunId,
              canonical.publication.worldVersionId,
              canonical.run.worldStateRevision,
              encode(canonical.run, 'create-world-runtime'),
              encode(canonical.save, 'create-world-runtime'),
            ],
          );
          if (result.changes !== 1) {
            throw metadataError(
              'create-world-runtime',
              `WorldRun '${canonical.run.worldRunId}' already exists.`,
            );
          }
        },
      );
    },
    readRuntime: (identity, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'read-world-runtime' },
        ({ sql }) => readRuntime(sql, identity, 'read-world-runtime'),
      );
    },
    mutateRuntime: (identity, mutation, signal) => {
      signal?.throwIfAborted();
      return options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'mutate-world-runtime' },
        async ({ sql }) => {
          const current = await readRuntime(sql, identity, 'mutate-world-runtime');
          if (!current) {
            throw metadataError('mutate-world-runtime', `WorldRun '${identity}' is not present.`);
          }
          const next = parseAggregate(mutation(structuredClone(current)));
          if (
            next.run.worldRunId !== current.run.worldRunId ||
            next.run.worldVersionId !== current.run.worldVersionId ||
            next.save.worldSaveId !== current.save.worldSaveId ||
            next.publication.worldVersionId !== current.publication.worldVersionId
          ) {
            throw metadataError(
              'mutate-world-runtime',
              `WorldRun '${identity}' mutation changed immutable authority identity.`,
            );
          }
          const result = await sql.run(
            `UPDATE world_runtime_aggregates
                SET world_state_revision = ?, run_json = ?, save_json = ?
              WHERE world_run_id = ? AND world_state_revision = ?`,
            [
              next.run.worldStateRevision,
              encode(next.run, 'mutate-world-runtime'),
              encode(next.save, 'mutate-world-runtime'),
              identity,
              current.run.worldStateRevision,
            ],
          );
          if (result.changes !== 1) {
            throw metadataError(
              'mutate-world-runtime',
              `WorldRun '${identity}' changed concurrently.`,
            );
          }
          return structuredClone(next);
        },
      );
    },
  };
  return Object.freeze(repository);
}

async function readCatalogPayloads<T>(
  sql: LocalMetadataSqlExecutor,
  tableName: string,
  idColumn: string,
  recordKind: import('@neko/world/application').WorldDurableRecordDiagnostic['recordKind'],
  parse: (value: unknown) => T,
  readIdentity: (value: T) => string,
  diagnostics: import('@neko/world/application').WorldDurableRecordDiagnostic[],
): Promise<T[]> {
  const rows = await sql.all(
    `SELECT ${idColumn}, payload_json FROM ${tableName} ORDER BY ${idColumn}`,
  );
  const records: T[] = [];
  for (const row of rows) {
    const recordId = diagnosticText(row[idColumn]);
    try {
      const record = parse(JSON.parse(readText(row, 'payload_json')));
      if (readIdentity(record) !== recordId)
        throw new Error('Row identity does not match its payload.');
      records.push(structuredClone(record));
    } catch (error) {
      diagnostics.push({
        recordKind,
        recordId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return records;
}

function diagnosticText(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : '<invalid-identity>';
}

function parseAggregate(value: WorldRuntimeAggregate): WorldRuntimeAggregate {
  const publication = parseWorldVersion(value.publication);
  const run = parseWorldRun(value.run);
  const save = parseWorldSave(value.save);
  if (
    run.worldVersionId !== publication.worldVersionId ||
    save.worldVersionId !== publication.worldVersionId ||
    save.worldRunId !== run.worldRunId ||
    save.worldSaveId !== run.worldSaveId ||
    save.activeBranchId !== run.branchId
  ) {
    throw metadataError(
      'parse-world-runtime-aggregate',
      `WorldRun '${run.worldRunId}' aggregate authority does not match.`,
    );
  }
  const active = save.branches.find((branch) => branch.branchId === run.branchId);
  if (
    !active ||
    active.state.worldStateRevision !== run.worldStateRevision ||
    active.state.timepoint !== run.timepoint
  ) {
    throw metadataError(
      'parse-world-runtime-aggregate',
      `WorldRun '${run.worldRunId}' active branch state does not match the Run.`,
    );
  }
  return { publication, run, save };
}

async function readRuntime(
  sql: LocalMetadataSqlExecutor,
  identity: string,
  operation: string,
): Promise<WorldRuntimeAggregate | undefined> {
  const rows = await sql.all(
    `SELECT world_run_id, world_version_id, world_state_revision, run_json, save_json
       FROM world_runtime_aggregates WHERE world_run_id = ?`,
    [requireIdentity(identity, operation)],
  );
  if (rows.length > 1) throw metadataError(operation, `WorldRun '${identity}' is not unique.`);
  if (rows.length === 0) return undefined;
  const row = rows[0]!;
  try {
    const run = parseWorldRun(JSON.parse(readText(row, 'run_json')));
    const save = parseWorldSave(JSON.parse(readText(row, 'save_json')));
    const publication = await requirePublication(sql, readText(row, 'world_version_id'), operation);
    if (
      run.worldRunId !== readText(row, 'world_run_id') ||
      run.worldStateRevision !== readInteger(row, 'world_state_revision')
    ) {
      throw new Error(
        `WorldRun '${identity}' row identity or CAS token does not match its payload.`,
      );
    }
    return structuredClone(parseAggregate({ publication, run, save }));
  } catch (error) {
    if (error instanceof LocalMetadataError) throw error;
    throw metadataError(operation, error instanceof Error ? error.message : String(error), error);
  }
}

async function requirePublication(
  sql: LocalMetadataSqlExecutor,
  worldVersionId: string,
  operation: string,
): Promise<WorldVersion> {
  const rows = await sql.all(
    `SELECT world_version_id, payload_json FROM world_versions WHERE world_version_id = ?`,
    [worldVersionId],
  );
  if (rows.length !== 1) {
    throw metadataError(operation, `WorldVersion '${worldVersionId}' is not present.`);
  }
  const publication = parseWorldVersion(JSON.parse(readText(rows[0]!, 'payload_json')));
  if (publication.worldVersionId !== readText(rows[0]!, 'world_version_id')) {
    throw metadataError(operation, `WorldVersion '${worldVersionId}' row identity does not match.`);
  }
  return publication;
}

async function readPayload<T>(
  store: LocalMetadataStore,
  operation: string,
  tableName: string,
  idColumn: string,
  identity: string,
  parse: (value: unknown) => T,
  readIdentity: (value: T) => string,
): Promise<T | undefined> {
  return store.transaction({ mode: 'read', ownership: 'state', operation }, async ({ sql }) => {
    const rows = await sql.all(
      `SELECT ${idColumn}, payload_json FROM ${tableName} WHERE ${idColumn} = ?`,
      [requireIdentity(identity, operation)],
    );
    if (rows.length > 1) throw metadataError(operation, `Record '${identity}' is not unique.`);
    if (rows.length === 0) return undefined;
    try {
      const record = parse(JSON.parse(readText(rows[0]!, 'payload_json')));
      if (readIdentity(record) !== readText(rows[0]!, idColumn)) {
        throw new Error(`Record '${identity}' row identity does not match its payload.`);
      }
      return structuredClone(record);
    } catch (error) {
      if (error instanceof LocalMetadataError) throw error;
      throw metadataError(operation, error instanceof Error ? error.message : String(error), error);
    }
  });
}

function encode(value: unknown, operation: string): string {
  return serializeLocalMetadataJson(value, operation);
}

function readText(row: LocalMetadataSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string' || value.length === 0) {
    throw metadataError('decode-world-record', `World column '${column}' is invalid.`);
  }
  return value;
}

function readInteger(row: LocalMetadataSqlRow, column: string): number {
  const value = row[column];
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) {
    throw metadataError('decode-world-record', `World column '${column}' is invalid.`);
  }
  return parsed;
}

function requireIdentity(value: string, operation: string): string {
  if (value.trim().length === 0) throw metadataError(operation, 'World identity is required.');
  return value;
}

function metadataError(operation: string, message: string, cause?: unknown): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
