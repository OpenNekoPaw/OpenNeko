import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as characterContracts from '@neko/chara/contracts';
import type { CharacterAuthoringRepository } from '@neko/chara/application';
import type {
  LocalMetadataSqlExecutor,
  LocalMetadataSqlRow,
  LocalMetadataStore,
} from '@neko/local-metadata';

export interface CharacterAuthoringTransferBundle {
  readonly projects: readonly characterContracts.CharacterProject[];
  readonly versions: readonly characterContracts.CharacterVersion[];
  readonly authoringTestSnapshots: readonly characterContracts.CharacterAuthoringTestSnapshot[];
}

export interface CharacterAuthoringTransferDiagnostic {
  readonly recordKind: 'character-project' | 'character-version' | 'authoring-test-snapshot';
  readonly recordId: string;
  readonly message: string;
}

export interface CharacterAuthoringTransferExportReport {
  readonly exportedRecords: number;
  readonly diagnostics: readonly CharacterAuthoringTransferDiagnostic[];
}

export interface CharacterAuthoringTransferImportReport {
  readonly importedRecords: number;
  readonly unchangedRecords: number;
  readonly diagnostics: readonly CharacterAuthoringTransferDiagnostic[];
}

type CharacterAuthoringTransferRepository = CharacterAuthoringRepository & {
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<characterContracts.CharacterVersion | undefined>;
};

export async function exportCharacterAuthoringTransfer(options: {
  readonly metadataStore: LocalMetadataStore;
  readonly destinationFile: string;
  readonly signal?: AbortSignal;
}): Promise<CharacterAuthoringTransferExportReport> {
  requireAbsoluteFile(options.destinationFile);
  options.signal?.throwIfAborted();
  const diagnostics: CharacterAuthoringTransferDiagnostic[] = [];
  const bundle = await options.metadataStore.transaction(
    { mode: 'read', ownership: 'state', operation: 'export-character-authoring-transfer' },
    async ({ sql }) => ({
      projects: await readSourceRecords(
        sql,
        'chara_projects',
        'character_project_id',
        'character-project',
        characterContracts.parseCharacterProject,
        (record) => record.characterProjectId,
        diagnostics,
      ),
      versions: await readSourceRecords(
        sql,
        'chara_versions',
        'character_version_id',
        'character-version',
        characterContracts.parseCharacterVersion,
        (record) => record.characterVersionId,
        diagnostics,
      ),
      authoringTestSnapshots: await readSourceRecords(
        sql,
        'chara_authoring_test_snapshots',
        'authoring_test_snapshot_id',
        'authoring-test-snapshot',
        characterContracts.parseCharacterAuthoringTestSnapshot,
        (record) => record.authoringTestSnapshotId,
        diagnostics,
      ),
    }),
  );
  await writeAtomicJson(options.destinationFile, bundle, options.signal);
  return {
    exportedRecords:
      bundle.projects.length + bundle.versions.length + bundle.authoringTestSnapshots.length,
    diagnostics,
  };
}

export async function importCharacterAuthoringTransfer(options: {
  readonly sourceFile: string;
  readonly repository: CharacterAuthoringTransferRepository;
  readonly signal?: AbortSignal;
}): Promise<CharacterAuthoringTransferImportReport> {
  requireAbsoluteFile(options.sourceFile);
  options.signal?.throwIfAborted();
  const bundle = parseBundle(JSON.parse(await readFile(options.sourceFile, 'utf8')));
  const diagnostics: CharacterAuthoringTransferDiagnostic[] = [];
  let importedRecords = 0;
  let unchangedRecords = 0;

  for (const project of bundle.projects) {
    options.signal?.throwIfAborted();
    try {
      const existing = await options.repository.readProject(
        project.characterProjectId,
        options.signal,
      );
      if (existing) {
        if (!isDeepStrictEqual(existing, project)) {
          throw new Error(
            `CharacterProject '${project.characterProjectId}' already exists with different facts.`,
          );
        }
        unchangedRecords += 1;
        continue;
      }
      await options.repository.saveProject(project, options.signal);
      importedRecords += 1;
    } catch (error) {
      diagnostics.push(diagnostic('character-project', project.characterProjectId, error));
    }
  }
  for (const publication of bundle.versions) {
    options.signal?.throwIfAborted();
    try {
      const existing = await options.repository.readPublication(
        publication.characterVersionId,
        options.signal,
      );
      if (existing) {
        if (!isDeepStrictEqual(existing, publication)) {
          throw new Error(
            `CharacterVersion '${publication.characterVersionId}' already exists with different facts.`,
          );
        }
        unchangedRecords += 1;
        continue;
      }
      await options.repository.storePublication(publication, options.signal);
      importedRecords += 1;
    } catch (error) {
      diagnostics.push(diagnostic('character-version', publication.characterVersionId, error));
    }
  }
  for (const snapshot of bundle.authoringTestSnapshots) {
    options.signal?.throwIfAborted();
    try {
      await options.repository.saveAuthoringTestSnapshot(snapshot, options.signal);
      importedRecords += 1;
    } catch (error) {
      diagnostics.push(
        diagnostic('authoring-test-snapshot', snapshot.authoringTestSnapshotId, error),
      );
    }
  }
  return { importedRecords, unchangedRecords, diagnostics };
}

async function readSourceRecords<T>(
  sql: LocalMetadataSqlExecutor,
  tableName: string,
  idColumn: string,
  recordKind: CharacterAuthoringTransferDiagnostic['recordKind'],
  parse: (value: unknown) => T,
  readIdentity: (record: T) => string,
  diagnostics: CharacterAuthoringTransferDiagnostic[],
): Promise<T[]> {
  const rows = await sql.all(
    `SELECT ${idColumn}, payload_json FROM ${tableName} ORDER BY ${idColumn}`,
  );
  const records: T[] = [];
  for (const row of rows) {
    const recordId = readRecordId(row, idColumn);
    try {
      const record = parse(JSON.parse(readPayload(row)));
      if (readIdentity(record) !== recordId) {
        throw new Error('SQLite row identity does not match its payload.');
      }
      records.push(record);
    } catch (error) {
      diagnostics.push(diagnostic(recordKind, recordId, error));
    }
  }
  return records;
}

function parseBundle(value: unknown): CharacterAuthoringTransferBundle {
  if (!isRecord(value))
    throw new Error('Character authoring transfer transfer file must be an object.');
  return {
    projects: parseArray(value['projects'], characterContracts.parseCharacterProject, 'projects'),
    versions: parseArray(value['versions'], characterContracts.parseCharacterVersion, 'versions'),
    authoringTestSnapshots: parseArray(
      value['authoringTestSnapshots'],
      characterContracts.parseCharacterAuthoringTestSnapshot,
      'authoringTestSnapshots',
    ),
  };
}

function parseArray<T>(value: unknown, parse: (item: unknown) => T, label: string): T[] {
  if (!Array.isArray(value))
    throw new Error(`Character authoring transfer '${label}' must be an array.`);
  return value.map((item) => parse(item));
}

async function writeAtomicJson(
  destinationFile: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<void> {
  await mkdir(dirname(destinationFile), { recursive: true });
  const temporary = join(dirname(destinationFile), `.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    await rename(temporary, destinationFile);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function diagnostic(
  recordKind: CharacterAuthoringTransferDiagnostic['recordKind'],
  recordId: string,
  error: unknown,
): CharacterAuthoringTransferDiagnostic {
  return {
    recordKind,
    recordId,
    message: error instanceof Error ? error.message : String(error),
  };
}

function readRecordId(row: LocalMetadataSqlRow, column: string): string {
  const value = row[column];
  return typeof value === 'string' && value.length > 0 ? value : '<invalid-identity>';
}

function readPayload(row: LocalMetadataSqlRow): string {
  const value = row['payload_json'];
  if (typeof value !== 'string' || value.length === 0) throw new Error('Payload JSON is missing.');
  return value;
}

function requireAbsoluteFile(filePath: string): void {
  if (!isAbsolute(filePath))
    throw new Error('Character authoring transfer transfer file must be absolute.');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
