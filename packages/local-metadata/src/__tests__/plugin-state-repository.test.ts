import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { createSqlitePluginStateRepository } from '../plugin-state';
import { initializePluginStateTables } from '../sqlite/plugin-state-schema';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SQLite Plugin state repository', () => {
  it('persists exact bundled and local state across reopen', async () => {
    const root = await createRoot();
    const first = await openStore(root);
    const repository = createSqlitePluginStateRepository(first);
    await repository.put({
      pluginId: 'browser-use',
      deliverySource: 'bundled',
      relativeInstallLocator: null,
      installState: 'installed',
      enabled: true,
      configurationReference: null,
    });
    await repository.put({
      pluginId: 'local-notes',
      deliverySource: 'local',
      relativeInstallLocator: 'local-notes',
      installState: 'installed',
      enabled: false,
      configurationReference: 'plugin:local-notes',
    });
    await first.dispose();

    const reopened = await openStore(root);
    await expect(createSqlitePluginStateRepository(reopened).list()).resolves.toEqual({
      records: [
        {
          pluginId: 'browser-use',
          deliverySource: 'bundled',
          relativeInstallLocator: null,
          installState: 'installed',
          enabled: true,
          configurationReference: null,
        },
        {
          pluginId: 'local-notes',
          deliverySource: 'local',
          relativeInstallLocator: 'local-notes',
          installState: 'installed',
          enabled: false,
          configurationReference: 'plugin:local-notes',
        },
      ],
      diagnostics: [],
    });
    await reopened.dispose();
  });

  it('isolates a corrupt row and preserves valid sibling state', async () => {
    const root = await createRoot();
    const store = await openStore(root);
    const repository = createSqlitePluginStateRepository(store);
    await repository.put({
      pluginId: 'valid-plugin',
      deliverySource: 'local',
      relativeInstallLocator: 'valid-plugin',
      installState: 'installed',
      enabled: true,
      configurationReference: null,
    });
    await store.dispose();

    const database = new DatabaseSync(join(root, '.neko', 'neko.db'));
    database.exec('PRAGMA ignore_check_constraints = ON');
    database
      .prepare(
        `INSERT INTO plugin_states(
           plugin_id, delivery_source, relative_install_locator,
           install_state, enabled, configuration_reference
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('broken-plugin', 'local', '../escape', 'installed', 1, null);
    database.close();

    const reopened = await openStore(root);
    await expect(createSqlitePluginStateRepository(reopened).list()).resolves.toEqual({
      records: [
        {
          pluginId: 'valid-plugin',
          deliverySource: 'local',
          relativeInstallLocator: 'valid-plugin',
          installState: 'installed',
          enabled: true,
          configurationReference: null,
        },
      ],
      diagnostics: [
        {
          code: 'invalid-plugin-state-record',
          pluginId: 'broken-plugin',
        },
      ],
    });
    await reopened.dispose();
  });

  it('updates and removes only the exact Plugin row', async () => {
    const store = await openStore(await createRoot());
    const repository = createSqlitePluginStateRepository(store);
    for (const pluginId of ['first-plugin', 'second-plugin']) {
      await repository.put({
        pluginId,
        deliverySource: 'local',
        relativeInstallLocator: pluginId,
        installState: 'installing',
        enabled: false,
        configurationReference: null,
      });
    }

    await repository.setInstallState('first-plugin', 'installed');
    await repository.setEnabled('first-plugin', true);
    await expect(repository.remove('first-plugin')).resolves.toBe(true);
    await expect(repository.get('second-plugin')).resolves.toMatchObject({
      installState: 'installing',
      enabled: false,
    });
    await store.dispose();
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-plugin-state-'));
  roots.push(root);
  return root;
}

async function openStore(root: string) {
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await initializePluginStateTables(store);
  return store;
}
