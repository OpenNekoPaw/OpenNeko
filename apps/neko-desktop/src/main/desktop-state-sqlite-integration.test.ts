import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DESKTOP_STATE_AUTHORITY_KEYS,
  migrateDesktopStateToSqlite,
  SqliteVersionedJsonStateRepository,
} from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-state';
import { createDesktopRetiredJsonStatePort } from './desktop-state-migration-adapter';
import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
} from '@neko/host/desktop-shell-state';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop SQLite application state composition', () => {
  it('restores shell state and preferences after a database-only restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-integration-'));
    roots.push(root);
    const stateDirectory = join(root, 'electron-user-data', 'state');
    const shellPath = join(stateDirectory, 'desktop-shell-state.json');
    const settingsPath = join(stateDirectory, 'desktop-application-settings.v1.json');
    await mkdir(stateDirectory, { recursive: true });
    await Promise.all([
      writeFile(shellPath, JSON.stringify(createEmptyDesktopShellState()), 'utf8'),
      writeFile(
        settingsPath,
        JSON.stringify(createDefaultDesktopApplicationSettingsState()),
        'utf8',
      ),
    ]);

    const first = await openState(root, shellPath, settingsPath);
    const shell = await first.shell.commit(0, {
      ...createEmptyDesktopShellState(),
      storageRevision: 1,
      catalogRevision: 1,
    });
    const settingsService = new DesktopApplicationSettingsService(first.settings);
    await settingsService.initialize();
    await settingsService.update(0, {
      ...createDefaultDesktopApplicationSettingsState().preferences,
      theme: 'dark',
      locale: 'zh-cn',
    });
    await settingsService.dispose();
    await first.store.dispose();

    const second = await openState(root, shellPath, settingsPath);
    try {
      expect(await second.shell.read()).toEqual(shell);
      const restoredSettings = new DesktopApplicationSettingsService(second.settings);
      await expect(restoredSettings.initialize()).resolves.toMatchObject({
        revision: 1,
        preferences: { theme: 'dark', locale: 'zh-cn', startupTarget: 'home' },
      });
      await restoredSettings.dispose();
    } finally {
      await second.store.dispose();
    }
  });

  it.each(['agent', 'transcript', 'memory', 'logs', 'workspace', 'project'])(
    'rejects adjacent %s data before switching either authority',
    async (forbiddenField) => {
      const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-negative-'));
      roots.push(root);
      const stateDirectory = join(root, 'electron-user-data', 'state');
      const shellPath = join(stateDirectory, 'desktop-shell-state.json');
      const settingsPath = join(stateDirectory, 'desktop-application-settings.v1.json');
      await mkdir(stateDirectory, { recursive: true });
      await Promise.all([
        writeFile(
          shellPath,
          JSON.stringify({ ...createEmptyDesktopShellState(), [forbiddenField]: {} }),
          'utf8',
        ),
        writeFile(
          settingsPath,
          JSON.stringify(createDefaultDesktopApplicationSettingsState()),
          'utf8',
        ),
      ]);
      const store = createNodeSqliteLocalMetadataStore({ homedir: root });
      await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
      try {
        await expect(
          migrateDesktopStateToSqlite({
            store,
            retiredJson: createDesktopRetiredJsonStatePort({
              shellStatePath: shellPath,
              applicationSettingsPath: settingsPath,
            }),
            shellCodec,
            settingsCodec,
            digest,
          }),
        ).rejects.toThrow('unexpected fields');
      } finally {
        await store.dispose();
      }
    },
  );

  it('does not read or mutate adjacent Agent, log, user, or workspace-owned files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-adjacent-'));
    roots.push(root);
    const stateDirectory = join(root, 'electron-user-data', 'state');
    const workspace = join(root, 'workspace');
    const shellPath = join(stateDirectory, 'desktop-shell-state.json');
    const settingsPath = join(stateDirectory, 'desktop-application-settings.v1.json');
    const adjacent = new Map([
      [join(root, '.neko', 'config.json'), '{"agent":"config"}\n'],
      [join(root, '.neko', 'transcripts', 'conversation.jsonl'), '{"role":"user"}\n'],
      [join(root, '.neko', 'logs', 'desktop.log'), 'diagnostic\n'],
      [join(workspace, '.neko', 'workspace.json'), '{"workspace":"retired"}\n'],
      [join(workspace, 'neko', 'project.json'), '{"workspaceId":"portable"}\n'],
      [join(workspace, 'neko', 'memory.md'), '# Accepted memory\n'],
    ]);
    await Promise.all([
      mkdir(stateDirectory, { recursive: true }),
      ...[...adjacent.keys()].map((filePath) => mkdir(join(filePath, '..'), { recursive: true })),
    ]);
    await Promise.all([
      writeFile(shellPath, JSON.stringify(createEmptyDesktopShellState()), 'utf8'),
      writeFile(
        settingsPath,
        JSON.stringify(createDefaultDesktopApplicationSettingsState()),
        'utf8',
      ),
      ...[...adjacent].map(([filePath, content]) => writeFile(filePath, content, 'utf8')),
    ]);

    const state = await openState(root, shellPath, settingsPath);
    try {
      await expect(
        Promise.all(
          [...adjacent].map(async ([filePath, content]) => ({
            filePath,
            unchanged: (await readFile(filePath, 'utf8')) === content,
          })),
        ),
      ).resolves.toEqual([...adjacent.keys()].map((filePath) => ({ filePath, unchanged: true })));
    } finally {
      await state.store.dispose();
    }
  });
});

const shellCodec = {
  createEmpty: createEmptyDesktopShellState,
  parse: parseDesktopShellStoredState,
  readStorageRevision: (state: ReturnType<typeof createEmptyDesktopShellState>) =>
    state.storageRevision,
};

const settingsCodec = {
  createEmpty: createDefaultDesktopApplicationSettingsState,
  parse: parseDesktopApplicationSettingsStoredState,
  readStorageRevision: (state: ReturnType<typeof createDefaultDesktopApplicationSettingsState>) =>
    state.storageRevision,
};

async function openState(root: string, shellPath: string, settingsPath: string) {
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await migrateDesktopStateToSqlite({
    store,
    retiredJson: createDesktopRetiredJsonStatePort({
      shellStatePath: shellPath,
      applicationSettingsPath: settingsPath,
    }),
    shellCodec,
    settingsCodec,
    digest,
  });
  return {
    store,
    shell: new SqliteVersionedJsonStateRepository({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
      codec: shellCodec,
    }),
    settings: new SqliteVersionedJsonStateRepository({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
      codec: settingsCodec,
    }),
  };
}

function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
