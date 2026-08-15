import type { LocalMetadataSqlExecutor, LocalMetadataStore } from '@neko/local-metadata';

export type CharacterObsoleteRuntimeRecordKind =
  'storyline-run' | 'storyline-observation-candidate' | 'character-memory-scope';

export interface CharacterObsoleteRuntimeRecordSelection {
  readonly kind: CharacterObsoleteRuntimeRecordKind;
  readonly recordId: string;
}

export interface CharacterObsoleteRuntimeRecordInspection {
  readonly selection: CharacterObsoleteRuntimeRecordSelection;
  readonly originalPayload: Uint8Array;
}

export interface CharacterObsoleteRuntimeRecordExportPort {
  write(inspection: CharacterObsoleteRuntimeRecordInspection, signal?: AbortSignal): Promise<void>;
}

export class CharacterObsoleteRuntimeRecordService {
  constructor(
    private readonly options: {
      readonly metadataStore: LocalMetadataStore;
    },
  ) {}

  inspect(
    selection: CharacterObsoleteRuntimeRecordSelection,
    signal?: AbortSignal,
  ): Promise<CharacterObsoleteRuntimeRecordInspection> {
    signal?.throwIfAborted();
    const canonical = requireSelection(selection);
    const storage = storageFor(canonical.kind);
    return this.options.metadataStore.transaction(
      { mode: 'read', ownership: 'state', operation: 'inspect-obsolete-character-runtime-record' },
      async ({ sql }) => {
        const originalPayload = await readOriginalPayload(sql, storage, canonical.recordId);
        return {
          selection: canonical,
          originalPayload: Uint8Array.from(Buffer.from(originalPayload, 'utf8')),
        };
      },
    );
  }

  async export(
    selection: CharacterObsoleteRuntimeRecordSelection,
    destination: CharacterObsoleteRuntimeRecordExportPort,
    signal?: AbortSignal,
  ): Promise<CharacterObsoleteRuntimeRecordInspection> {
    const inspection = await this.inspect(selection, signal);
    await destination.write(inspection, signal);
    return inspection;
  }

  cleanup(
    inspection: CharacterObsoleteRuntimeRecordInspection,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const canonical = requireInspection(inspection);
    const storage = storageFor(canonical.selection.kind);
    const expectedPayload = Buffer.from(canonical.originalPayload).toString('utf8');
    return this.options.metadataStore.transaction(
      {
        mode: 'state-write',
        ownership: 'state',
        operation: 'cleanup-obsolete-character-runtime-record',
      },
      async ({ sql }) => {
        const currentPayload = await readOriginalPayload(
          sql,
          storage,
          canonical.selection.recordId,
        );
        if (currentPayload !== expectedPayload) {
          throw new Error(
            `Obsolete Character runtime record '${canonical.selection.recordId}' changed after inspection.`,
          );
        }
        const result = await sql.run(
          `DELETE FROM ${storage.tableName} WHERE ${storage.idColumn} = ? AND payload_json = ?`,
          [canonical.selection.recordId, expectedPayload],
        );
        if (result.changes !== 1) {
          throw new Error(
            `Obsolete Character runtime record '${canonical.selection.recordId}' changed after inspection.`,
          );
        }
      },
    );
  }
}

interface CharacterObsoleteRuntimeStorage {
  readonly tableName: string;
  readonly idColumn: string;
}

function storageFor(kind: CharacterObsoleteRuntimeRecordKind): CharacterObsoleteRuntimeStorage {
  switch (kind) {
    case 'storyline-run':
      return {
        tableName: 'chara_storyline_runs',
        idColumn: 'character_storyline_run_id',
      };
    case 'storyline-observation-candidate':
      return {
        tableName: 'chara_storyline_observation_candidates',
        idColumn: 'observation_candidate_id',
      };
    case 'character-memory-scope':
      return {
        tableName: 'chara_memory_scopes',
        idColumn: 'character_memory_scope_id',
      };
  }
}

async function readOriginalPayload(
  sql: LocalMetadataSqlExecutor,
  storage: CharacterObsoleteRuntimeStorage,
  recordId: string,
): Promise<string> {
  const rows = await sql.all(
    `SELECT payload_json FROM ${storage.tableName} WHERE ${storage.idColumn} = ?`,
    [recordId],
  );
  const row = rows[0];
  if (!row || rows.length !== 1 || typeof row['payload_json'] !== 'string') {
    throw new Error(`Obsolete Character runtime record '${recordId}' is unavailable.`);
  }
  return row['payload_json'];
}

function requireSelection(
  selection: CharacterObsoleteRuntimeRecordSelection,
): CharacterObsoleteRuntimeRecordSelection {
  if (
    selection.kind !== 'storyline-run' &&
    selection.kind !== 'storyline-observation-candidate' &&
    selection.kind !== 'character-memory-scope'
  ) {
    throw new Error(`Unknown obsolete Character runtime record kind '${String(selection.kind)}'.`);
  }
  if (selection.recordId.trim().length === 0) {
    throw new Error('Obsolete Character runtime record identity is required.');
  }
  return { kind: selection.kind, recordId: selection.recordId };
}

function requireInspection(
  inspection: CharacterObsoleteRuntimeRecordInspection,
): CharacterObsoleteRuntimeRecordInspection {
  const selection = requireSelection(inspection.selection);
  if (!(inspection.originalPayload instanceof Uint8Array)) {
    throw new Error('Obsolete Character runtime record original payload must be bytes.');
  }
  return { selection, originalPayload: Uint8Array.from(inspection.originalPayload) };
}
