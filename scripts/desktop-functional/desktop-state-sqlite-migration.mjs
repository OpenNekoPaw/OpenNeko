import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SHELL_STATE = Object.freeze({
  schemaVersion: 4,
  storageRevision: 3,
  catalogRevision: 0,
  primaryWindowId: null,
  projects: [],
  windows: [],
});

const APPLICATION_SETTINGS = Object.freeze({
  schemaVersion: 2,
  storageRevision: 5,
  preferences: {
    theme: 'dark',
    locale: 'zh-cn',
    startupTarget: 'home',
    resourceBrowserView: 'grid',
  },
});

export const desktopStateSqliteMigrationScenario = Object.freeze({
  id: 'desktop-state-sqlite-migration',
  owner: '@neko/local-metadata',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const stateRoot = join(fixtureHome, 'electron-user-data', 'state');
    const shellStatePath = join(stateRoot, 'desktop-shell-state.json');
    const applicationSettingsPath = join(stateRoot, 'desktop-application-settings.v1.json');
    const shellSource = `${JSON.stringify(SHELL_STATE, null, 2)}\n`;
    const settingsSource = `${JSON.stringify(APPLICATION_SETTINGS, null, 2)}\n`;
    await Promise.all([
      mkdir(workspacePath, { recursive: true }),
      mkdir(stateRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(shellStatePath, shellSource, 'utf8'),
      writeFile(applicationSettingsPath, settingsSource, 'utf8'),
    ]);
    return {
      workspacePath,
      databasePath: join(fixtureHome, '.neko', 'neko.db'),
      shellStatePath,
      applicationSettingsPath,
      shellSource,
      settingsSource,
    };
  },
  async run({ cdp, checkpoint, evaluate, prepared, waitForSelector }) {
    const migrated = await evaluate(`window.openNekoDesktop.settings.get()`);
    assertMigratedSettings(migrated);
    checkpoint('desktop-settings-restored-from-sqlite', {
      revision: migrated.revision,
      theme: migrated.preferences.theme,
      locale: migrated.preferences.locale,
    });

    await assertArchivedSources(prepared);
    const initialDatabase = readDatabaseEvidence(prepared.databasePath);
    assertMigrationMarker(initialDatabase, prepared);
    checkpoint('desktop-legacy-state-archived', initialDatabase.marker);

    const updated = await evaluate(`window.openNekoDesktop.settings.update({
      theme: 'light',
      locale: 'en',
      startupTarget: 'restore',
      resourceBrowserView: 'list',
    }, ${String(migrated.revision)})`);
    if (updated.revision !== migrated.revision + 1 || updated.preferences.theme !== 'light') {
      throw new Error('Desktop settings SQLite commit did not advance the exact revision.');
    }
    const committed = readDatabaseEvidence(prepared.databasePath);
    const settings = committed.states.find(
      (state) => state.authorityKey === 'desktop.application-settings',
    );
    if (
      settings?.storageRevision !== updated.revision ||
      settings.document.preferences.theme !== 'light' ||
      settings.document.preferences.locale !== 'en'
    ) {
      throw new Error('Desktop settings update was not committed to the SQLite authority.');
    }
    checkpoint('desktop-settings-sqlite-commit', { revision: settings.storageRevision });

    await cdp.send('Page.reload', { ignoreCache: true });
    await waitForSelector('#root', 30_000);
    const reconstructed = await evaluate(`window.openNekoDesktop.settings.get()`);
    if (
      reconstructed.revision !== updated.revision ||
      reconstructed.preferences.theme !== 'light' ||
      reconstructed.preferences.locale !== 'en'
    ) {
      throw new Error('Desktop renderer reconstruction did not restore SQLite-backed settings.');
    }
    checkpoint('desktop-renderer-reconstructed-from-sqlite', {
      revision: reconstructed.revision,
    });
    return {
      authorityKeys: committed.states.map((state) => state.authorityKey).sort(),
      migrationId: committed.marker.migrationId,
      shellArchived: committed.marker.shellArchived,
      settingsArchived: committed.marker.settingsArchived,
      restoredRevision: migrated.revision,
      committedRevision: reconstructed.revision,
    };
  },
  assertObservation(_observation, evidence) {
    if (
      evidence.migrationId !== 'desktop-json-to-sqlite-v1' ||
      evidence.shellArchived !== 1 ||
      evidence.settingsArchived !== 1 ||
      evidence.restoredRevision !== 5 ||
      evidence.committedRevision !== 6 ||
      evidence.authorityKeys.join(',') !== 'desktop.application-settings,desktop.shell'
    ) {
      throw new Error('Desktop SQLite migration evidence is incomplete.');
    }
  },
});

export const desktopStateSqliteRestartScenario = Object.freeze({
  id: 'desktop-state-sqlite-restart',
  owner: '@neko/local-metadata',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const stateRoot = join(fixtureHome, 'electron-user-data', 'state');
    const shellStatePath = join(stateRoot, 'desktop-shell-state.json');
    const applicationSettingsPath = join(stateRoot, 'desktop-application-settings.v1.json');
    const poison = '{"poisoned-legacy-authority":';
    await Promise.all([
      writeFile(shellStatePath, poison, 'utf8'),
      writeFile(applicationSettingsPath, poison, 'utf8'),
    ]);
    return {
      workspacePath,
      databasePath: join(fixtureHome, '.neko', 'neko.db'),
      shellStatePath,
      applicationSettingsPath,
      poison,
    };
  },
  async run({ checkpoint, evaluate, prepared }) {
    const restored = await evaluate(`window.openNekoDesktop.settings.get()`);
    if (
      restored.revision !== 6 ||
      restored.preferences.theme !== 'light' ||
      restored.preferences.locale !== 'en' ||
      restored.preferences.startupTarget !== 'restore' ||
      restored.preferences.resourceBrowserView !== 'list'
    ) {
      throw new Error('Desktop process restart did not restore the SQLite settings authority.');
    }
    const [shellPoison, settingsPoison] = await Promise.all([
      readFile(prepared.shellStatePath, 'utf8'),
      readFile(prepared.applicationSettingsPath, 'utf8'),
    ]);
    if (shellPoison !== prepared.poison || settingsPoison !== prepared.poison) {
      throw new Error('Desktop restart read, archived, or rewrote a poisoned legacy authority.');
    }
    const database = readDatabaseEvidence(prepared.databasePath);
    assertCommittedRestart(database);
    checkpoint('desktop-process-restarted-from-sqlite', {
      revision: restored.revision,
      migrationId: database.marker.migrationId,
    });
    return {
      revision: restored.revision,
      migrationId: database.marker.migrationId,
      poisonPreserved: true,
    };
  },
  assertObservation(_observation, evidence) {
    if (
      evidence.revision !== 6 ||
      evidence.migrationId !== 'desktop-json-to-sqlite-v1' ||
      evidence.poisonPreserved !== true
    ) {
      throw new Error('Desktop SQLite restart evidence is incomplete.');
    }
  },
});

function assertMigratedSettings(projection) {
  if (
    projection?.revision !== APPLICATION_SETTINGS.storageRevision ||
    projection.preferences?.theme !== APPLICATION_SETTINGS.preferences.theme ||
    projection.preferences?.locale !== APPLICATION_SETTINGS.preferences.locale ||
    projection.preferences?.resourceBrowserView !==
      APPLICATION_SETTINGS.preferences.resourceBrowserView
  ) {
    throw new Error('Desktop did not restore the validated legacy application settings.');
  }
}

async function assertArchivedSources(prepared) {
  await Promise.all([
    expectMissing(prepared.shellStatePath),
    expectMissing(prepared.applicationSettingsPath),
  ]);
  const [shellArchive, settingsArchive] = await Promise.all([
    readFile(`${prepared.shellStatePath}.migrated-v1`, 'utf8'),
    readFile(`${prepared.applicationSettingsPath}.migrated-v1`, 'utf8'),
  ]);
  if (shellArchive !== prepared.shellSource || settingsArchive !== prepared.settingsSource) {
    throw new Error('Desktop legacy archive content changed during SQLite migration.');
  }
}

function readDatabaseEvidence(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const states = database
      .prepare(
        `SELECT authority_key, storage_revision, document_json
           FROM desktop_application_state
          ORDER BY authority_key`,
      )
      .all()
      .map((row) => ({
        authorityKey: row.authority_key,
        storageRevision: Number(row.storage_revision),
        document: JSON.parse(row.document_json),
      }));
    const row = database
      .prepare(
        `SELECT migration_id, shell_digest, settings_digest, shell_archived, settings_archived
           FROM desktop_application_state_migrations
          WHERE migration_id = ?`,
      )
      .get('desktop-json-to-sqlite-v1');
    if (!row) throw new Error('Desktop SQLite migration marker is unavailable.');
    return {
      states,
      marker: {
        migrationId: row.migration_id,
        shellDigest: row.shell_digest,
        settingsDigest: row.settings_digest,
        shellArchived: Number(row.shell_archived),
        settingsArchived: Number(row.settings_archived),
      },
    };
  } finally {
    database.close();
  }
}

function assertMigrationMarker(database, prepared) {
  if (
    database.marker.migrationId !== 'desktop-json-to-sqlite-v1' ||
    database.marker.shellDigest !== digest(prepared.shellSource) ||
    database.marker.settingsDigest !== digest(prepared.settingsSource) ||
    database.marker.shellArchived !== 1 ||
    database.marker.settingsArchived !== 1
  ) {
    throw new Error('Desktop SQLite migration marker does not match the archived sources.');
  }
}

function assertCommittedRestart(database) {
  const settings = database.states.find(
    (state) => state.authorityKey === 'desktop.application-settings',
  );
  if (
    database.marker.shellArchived !== 1 ||
    database.marker.settingsArchived !== 1 ||
    settings?.storageRevision !== 6 ||
    settings.document.preferences.theme !== 'light'
  ) {
    throw new Error('Desktop SQLite restart authority is incomplete.');
  }
}

async function expectMissing(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Desktop legacy authority remained active: ${filePath}`);
}

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}
