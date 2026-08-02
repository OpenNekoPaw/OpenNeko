import type { LocalMetadataSqlExecutor, LocalMetadataStore } from './contracts';
import { serializeLocalMetadataJson } from './secret-boundary';
import {
  DESKTOP_APPLICATION_STATE_MIGRATIONS,
  DESKTOP_STATE_AUTHORITY_KEYS,
  type VersionedJsonStateCodec,
} from './versioned-json-state-repository';

const MIGRATION_ID = 'desktop-json-to-sqlite-v1';
const ABSENT_DIGEST = 'absent';

export interface DesktopRetiredJsonStatePort {
  read(authority: 'shell' | 'application-settings'): Promise<string | null>;
  archive(authority: 'shell' | 'application-settings'): Promise<void>;
  publishPair(input: {
    readonly shell: string;
    readonly applicationSettings: string;
  }): Promise<void>;
}

export interface DesktopStateMigrationResult {
  readonly status: 'imported' | 'verified';
  readonly archived: readonly ('shell' | 'application-settings')[];
}

export interface DesktopStateMigrationOptions<TShell, TSettings> {
  readonly store: LocalMetadataStore;
  readonly retiredJson: DesktopRetiredJsonStatePort;
  readonly shellCodec: VersionedJsonStateCodec<TShell>;
  readonly settingsCodec: VersionedJsonStateCodec<TSettings>;
  readonly digest: (content: string) => string;
  readonly now?: () => string;
}

export async function migrateDesktopStateToSqlite<TShell, TSettings>(
  options: DesktopStateMigrationOptions<TShell, TSettings>,
): Promise<DesktopStateMigrationResult> {
  await options.store.migrateNamespace(DESKTOP_APPLICATION_STATE_MIGRATIONS);
  const existingMarker = await readMarker(options.store);
  if (existingMarker?.shellArchived && existingMarker.settingsArchived) {
    await verifyState(options, {});
    return Object.freeze({ status: 'verified', archived: Object.freeze([]) });
  }
  const [shellSource, settingsSource] = await Promise.all([
    existingMarker?.shellArchived ? null : options.retiredJson.read('shell'),
    existingMarker?.settingsArchived ? null : options.retiredJson.read('application-settings'),
  ]);
  const source = {
    shell: preflight(shellSource, options.shellCodec, 'Desktop shell state'),
    settings: preflight(settingsSource, options.settingsCodec, 'Desktop application settings'),
  };
  const digests = {
    shell: shellSource === null ? ABSENT_DIGEST : options.digest(shellSource),
    settings: settingsSource === null ? ABSENT_DIGEST : options.digest(settingsSource),
  };
  let status: DesktopStateMigrationResult['status'] = 'verified';
  if (existingMarker) {
    assertSourceMatchesMarker('shell', shellSource, digests.shell, existingMarker.shellDigest);
    assertSourceMatchesMarker(
      'application-settings',
      settingsSource,
      digests.settings,
      existingMarker.settingsDigest,
    );
  } else {
    await importState(options, source, digests);
    status = 'imported';
  }
  await verifyState(options, {
    shell: status === 'imported' || shellSource !== null ? source.shell : undefined,
    settings: status === 'imported' || settingsSource !== null ? source.settings : undefined,
  });
  const archived: ('shell' | 'application-settings')[] = [];
  if (!existingMarker?.shellArchived) {
    if (shellSource !== null) {
      await options.retiredJson.archive('shell');
      archived.push('shell');
    }
    await markArchived(options.store, 'shell');
  }
  if (!existingMarker?.settingsArchived) {
    if (settingsSource !== null) {
      await options.retiredJson.archive('application-settings');
      archived.push('application-settings');
    }
    await markArchived(options.store, 'application-settings');
  }
  return Object.freeze({ status, archived: Object.freeze(archived) });
}

export async function exportDesktopStateForDowngrade<TShell, TSettings>(
  options: DesktopStateMigrationOptions<TShell, TSettings>,
): Promise<void> {
  await options.store.migrateNamespace(DESKTOP_APPLICATION_STATE_MIGRATIONS);
  const [shell, settings] = await options.store.transaction(
    {
      mode: 'read',
      ownership: 'state',
      operation: 'export-desktop-state-for-downgrade',
    },
    async ({ sql }) =>
      Promise.all([
        readRequiredState(sql, DESKTOP_STATE_AUTHORITY_KEYS.shell, options.shellCodec),
        readRequiredState(
          sql,
          DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
          options.settingsCodec,
        ),
      ]),
  );
  const shellJson = `${JSON.stringify(options.shellCodec.parse(shell), null, 2)}\n`;
  const settingsJson = `${JSON.stringify(options.settingsCodec.parse(settings), null, 2)}\n`;
  await options.retiredJson.publishPair({ shell: shellJson, applicationSettings: settingsJson });
}

function preflight<T>(content: string | null, codec: VersionedJsonStateCodec<T>, label: string): T {
  if (content === null) return codec.createEmpty();
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`${label} legacy input is not valid JSON.`, { cause: error });
  }
  return codec.parse(value);
}

async function importState<TShell, TSettings>(
  options: DesktopStateMigrationOptions<TShell, TSettings>,
  source: { readonly shell: TShell; readonly settings: TSettings },
  digests: { readonly shell: string; readonly settings: string },
): Promise<void> {
  const shellJson = serializeLocalMetadataJson(source.shell, 'import-desktop-shell-state');
  const settingsJson = serializeLocalMetadataJson(
    source.settings,
    'import-desktop-application-settings',
  );
  await options.store.transaction(
    {
      mode: 'state-write',
      ownership: 'state',
      operation: 'import-desktop-application-state',
    },
    async ({ sql }) => {
      const existing = await sql.all(
        `SELECT authority_key FROM desktop_application_state
          WHERE authority_key IN (?, ?)`,
        [DESKTOP_STATE_AUTHORITY_KEYS.shell, DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings],
      );
      if (existing.length > 0) {
        throw new Error('Desktop SQLite state exists without a committed legacy migration marker.');
      }
      await insertState(
        sql,
        DESKTOP_STATE_AUTHORITY_KEYS.shell,
        options.shellCodec.readStorageRevision(source.shell),
        shellJson,
        options.now?.() ?? new Date().toISOString(),
      );
      await insertState(
        sql,
        DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
        options.settingsCodec.readStorageRevision(source.settings),
        settingsJson,
        options.now?.() ?? new Date().toISOString(),
      );
      await sql.run(
        `INSERT INTO desktop_application_state_migrations(
           migration_id, shell_digest, settings_digest,
           shell_archived, settings_archived, committed_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          MIGRATION_ID,
          digests.shell,
          digests.settings,
          digests.shell === ABSENT_DIGEST ? 1 : 0,
          digests.settings === ABSENT_DIGEST ? 1 : 0,
          options.now?.() ?? new Date().toISOString(),
        ],
      );
    },
  );
}

async function verifyState<TShell, TSettings>(
  options: DesktopStateMigrationOptions<TShell, TSettings>,
  expected: { readonly shell?: TShell; readonly settings?: TSettings },
): Promise<void> {
  await options.store.transaction(
    { mode: 'read', ownership: 'state', operation: 'verify-desktop-application-state' },
    async ({ sql }) => {
      const shell = await readRequiredState(
        sql,
        DESKTOP_STATE_AUTHORITY_KEYS.shell,
        options.shellCodec,
      );
      const settings = await readRequiredState(
        sql,
        DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
        options.settingsCodec,
      );
      const shellMismatch =
        expected.shell !== undefined &&
        serializeLocalMetadataJson(shell, 'verify-desktop-shell-state') !==
          serializeLocalMetadataJson(expected.shell, 'verify-legacy-desktop-shell-state');
      const settingsMismatch =
        expected.settings !== undefined &&
        serializeLocalMetadataJson(settings, 'verify-desktop-application-settings') !==
          serializeLocalMetadataJson(
            expected.settings,
            'verify-legacy-desktop-application-settings',
          );
      if (shellMismatch || settingsMismatch) {
        throw new Error('Desktop SQLite state does not match the validated legacy import.');
      }
    },
  );
}

async function readMarker(store: LocalMetadataStore): Promise<
  | {
      readonly shellDigest: string;
      readonly settingsDigest: string;
      readonly shellArchived: boolean;
      readonly settingsArchived: boolean;
    }
  | undefined
> {
  return store.transaction(
    { mode: 'read', ownership: 'state', operation: 'read-desktop-state-migration-marker' },
    async ({ sql }) => {
      const rows = await sql.all(
        `SELECT shell_digest, settings_digest, shell_archived, settings_archived
           FROM desktop_application_state_migrations
          WHERE migration_id = ?`,
        [MIGRATION_ID],
      );
      const row = rows[0];
      if (!row) return undefined;
      if (
        typeof row['shell_digest'] !== 'string' ||
        typeof row['settings_digest'] !== 'string' ||
        !isSqliteBoolean(row['shell_archived']) ||
        !isSqliteBoolean(row['settings_archived'])
      ) {
        throw new Error('Desktop state migration marker is corrupt.');
      }
      return {
        shellDigest: row['shell_digest'],
        settingsDigest: row['settings_digest'],
        shellArchived: toSqliteBoolean(row['shell_archived']),
        settingsArchived: toSqliteBoolean(row['settings_archived']),
      };
    },
  );
}

async function markArchived(
  store: LocalMetadataStore,
  authority: 'shell' | 'application-settings',
): Promise<void> {
  const column = authority === 'shell' ? 'shell_archived' : 'settings_archived';
  await store.transaction(
    { mode: 'state-write', ownership: 'state', operation: `archive-desktop-${authority}-state` },
    async ({ sql }) => {
      const result = await sql.run(
        `UPDATE desktop_application_state_migrations SET ${column} = 1 WHERE migration_id = ?`,
        [MIGRATION_ID],
      );
      if (result.changes !== 1) {
        throw new Error(`Desktop ${authority} archive marker is unavailable.`);
      }
    },
  );
}

function isSqliteBoolean(value: unknown): value is 0 | 1 | 0n | 1n {
  return value === 0 || value === 1 || value === 0n || value === 1n;
}

function toSqliteBoolean(value: 0 | 1 | 0n | 1n): boolean {
  return value === 1 || value === 1n;
}

function assertSourceMatchesMarker(
  authority: 'shell' | 'application-settings',
  content: string | null,
  actualDigest: string,
  expectedDigest: string,
): void {
  if (content === null) return;
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `Legacy Desktop ${authority} changed after SQLite migration commit; source was preserved.`,
    );
  }
}

async function insertState(
  sql: LocalMetadataSqlExecutor,
  authorityKey: string,
  revision: number,
  documentJson: string,
  updatedAt: string,
): Promise<void> {
  await sql.run(
    `INSERT INTO desktop_application_state(
       authority_key, storage_revision, document_json, updated_at
     ) VALUES (?, ?, ?, ?)`,
    [authorityKey, revision, documentJson, updatedAt],
  );
}

async function readRequiredState<T>(
  sql: LocalMetadataSqlExecutor,
  authorityKey: string,
  codec: VersionedJsonStateCodec<T>,
): Promise<T> {
  const rows = await sql.all(
    `SELECT storage_revision, document_json
       FROM desktop_application_state
      WHERE authority_key = ?`,
    [authorityKey],
  );
  const row = rows[0];
  if (!row || typeof row['document_json'] !== 'string') {
    throw new Error(`Desktop state authority '${authorityKey}' is unavailable.`);
  }
  const value: unknown = JSON.parse(row['document_json']);
  const parsed = codec.parse(value);
  const rowRevision = row['storage_revision'];
  const revision = typeof rowRevision === 'bigint' ? Number(rowRevision) : rowRevision;
  if (revision !== codec.readStorageRevision(parsed)) {
    throw new Error(`Desktop state authority '${authorityKey}' has a revision mismatch.`);
  }
  return parsed;
}
