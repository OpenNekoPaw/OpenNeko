import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DESKTOP_STATE_AUTHORITY_KEYS, SqliteJsonStateRepository } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-state';
import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
  serializeDesktopShellStoredState,
} from '@neko/host/desktop-shell-state';
import {
  DesktopShellService,
  type DesktopWorkspaceResolutionPort,
} from '@neko/host/desktop-shell-service';
import { createDefaultDesktopApplicationSidebar } from '@neko/host/desktop-scene-contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop SQLite application state composition', () => {
  it('restores shell state and preferences after a database-only restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-integration-'));
    roots.push(root);

    const first = await openState(root);
    const shell = await first.shell.commit({
      ...createEmptyDesktopShellState(),
      catalogRevision: 1,
    });
    const settingsService = new DesktopApplicationSettingsService(first.settings);
    await settingsService.initialize();
    await settingsService.update({
      ...createDefaultDesktopApplicationSettingsState().preferences,
      theme: 'dark',
      locale: 'zh-cn',
    });
    await settingsService.dispose();
    await first.store.dispose();

    const second = await openState(root);
    try {
      expect(await second.shell.read()).toEqual(shell);
      const restoredSettings = new DesktopApplicationSettingsService(second.settings);
      await expect(restoredSettings.initialize()).resolves.toMatchObject({
        preferences: { theme: 'dark', locale: 'zh-cn', startupTarget: 'home' },
      });
      await restoredSettings.dispose();
    } finally {
      await second.store.dispose();
    }
  });

  it('isolates an old Window, opens a new Workbench, and preserves the rejected record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-invalid-window-'));
    roots.push(root);
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    const repository = new SqliteJsonStateRepository({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
      codec: shellCodec,
    });
    await repository.prepare();
    let identity = 0;
    const sceneId = 'scene:window-old:project-management';
    const removedSchemaField = ['schema', 'Ver', 'sion'].join('');
    const retiredState = {
      catalogRevision: 0,
      primaryWindowId: 'window-old',
      projects: [],
      windows: [
        {
          windowId: 'window-old',
          revision: 4,
          activeTarget: { kind: 'home' },
          tabs: [],
          workbench: createDefaultDesktopWorkbenchLayout('window-old'),
          scene: {
            [removedSchemaField]: 1,
            sceneId,
            windowId: 'window-old',
            revision: 4,
            context: {
              kind: 'project-management',
              projectManagementSessionId: 'project-management:1',
            },
            slots: {
              leftManager: {
                kind: 'project-catalog',
                projectManagementSessionId: 'project-management:1',
              },
              status: { kind: 'scene-status', sceneId },
            },
          },
          applicationSidebar: createDefaultDesktopApplicationSidebar('window-old'),
        },
      ],
    };
    await store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'seed-version-5-shell-scene' },
      ({ sql }) =>
        sql.run(
          `INSERT INTO desktop_application_state(
             authority_key, document_json, updated_at
           ) VALUES (?, ?, ?)`,
          [
            DESKTOP_STATE_AUTHORITY_KEYS.shell,
            JSON.stringify(retiredState),
            '2026-08-04T00:00:00.000Z',
          ],
        ),
    );

    try {
      const workspaceRegistry: DesktopWorkspaceResolutionPort = {
        resolve: async () => {
          throw new Error('Workspace resolution is not expected during Shell startup.');
        },
        dispose: async () => undefined,
      };
      const service = new DesktopShellService({
        applicationInstanceId: 'application:test',
        stateRepository: repository,
        workspaceRegistry,
        startupTarget: 'home',
        createIdentity: () => `identity-${(identity += 1)}`,
        now: () => '2026-08-05T00:00:00.000Z',
      });
      const windowId = await service.claimWindowId();
      const projection = await service.getProjection(windowId);

      expect(windowId).not.toBe('window-old');
      expect(projection.window.workbenches.instances).toHaveLength(1);
      expect(projection.stateDiagnostics).toEqual([
        expect.objectContaining({
          code: 'desktop-stored-window-invalid',
          windowId: 'window-old',
          message: expect.stringContaining('unexpected fields'),
        }),
      ]);
      const rows = await store.transaction(
        { mode: 'read', ownership: 'state', operation: 'verify-rejected-window-retained' },
        ({ sql }) =>
          sql.all('SELECT document_json FROM desktop_application_state WHERE authority_key = ?', [
            DESKTOP_STATE_AUTHORITY_KEYS.shell,
          ]),
      );
      const document: unknown = JSON.parse(String(rows[0]?.['document_json']));
      if (!isRecord(document) || !Array.isArray(document['windows'])) {
        throw new Error('Desktop Shell authority did not persist a Window collection.');
      }
      expect(document['windows']).toContainEqual(retiredState.windows[0]);
      expect(document['windows']).toContainEqual(
        expect.objectContaining({ windowId, workbenches: expect.any(Object) }),
      );
      await service.dispose();
    } finally {
      await store.dispose();
    }
  });

  it('isolates an invalid Shell root without rewriting it and opens a new Workbench', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-invalid-root-'));
    roots.push(root);
    const initial = await openState(root);
    await initial.store.dispose();

    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    const repository = new SqliteJsonStateRepository({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
      codec: shellCodec,
      now: () => '2026-08-05T00:00:00.000Z',
    });
    const invalidDocument = JSON.stringify({
      ...createEmptyDesktopShellState(),
      [['schema', 'Ver', 'sion'].join('')]: 1,
    });
    try {
      await repository.prepare();
      const seeded = await store.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'seed-invalid-shell-root' },
        ({ sql }) =>
          sql.run(
            `INSERT INTO desktop_application_state(
               authority_key, document_json, updated_at
             ) VALUES (?, ?, ?)`,
            [DESKTOP_STATE_AUTHORITY_KEYS.shell, invalidDocument, '2026-08-04T00:00:00.000Z'],
          ),
      );
      expect(seeded.changes).toBe(1);

      const rejection = await repository.inspectInvalidState();
      expect(rejection).toMatchObject({
        authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
        diagnostic: expect.stringContaining(['schema', 'Ver', 'sion'].join('')),
      });
      const settings = new SqliteJsonStateRepository({
        store,
        authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
        codec: settingsCodec,
      });
      await settings.prepare();
      expect(await settings.read()).toEqual(createDefaultDesktopApplicationSettingsState());

      let identity = 0;
      const service = new DesktopShellService({
        applicationInstanceId: 'application:test',
        stateRepository: repository,
        workspaceRegistry: {
          resolve: async () => {
            throw new Error('Workspace resolution is not expected during Shell startup.');
          },
          dispose: async () => undefined,
        },
        startupTarget: 'home',
        startupStateDiagnostics: rejection
          ? [
              {
                code: 'desktop-stored-state-invalid',
                severity: 'error',
                authorityKey: 'desktop.shell',
                rejectionId: rejection.rejectionId,
                message: rejection.diagnostic,
              },
            ]
          : [],
        createIdentity: () => `identity-${(identity += 1)}`,
        now: () => '2026-08-05T00:00:00.000Z',
      });
      const windowId = await service.claimWindowId();
      const projection = await service.getProjection(windowId);
      expect(projection.window.workbenches.instances).toHaveLength(1);
      expect(projection.stateDiagnostics).toEqual([
        expect.objectContaining({
          code: 'desktop-stored-state-invalid',
          rejectionId: rejection?.rejectionId,
        }),
      ]);
      const retained = await store.transaction(
        { mode: 'read', ownership: 'state', operation: 'verify-invalid-shell-root-retained' },
        ({ sql }) =>
          sql.all(
            `SELECT authority_key, document_json
               FROM desktop_application_state
              WHERE authority_key = ?`,
            [DESKTOP_STATE_AUTHORITY_KEYS.shell],
          ),
      );
      expect(retained).toEqual([
        {
          authority_key: DESKTOP_STATE_AUTHORITY_KEYS.shell,
          document_json: invalidDocument,
        },
      ]);
      await service.dispose();
    } finally {
      await store.dispose();
    }
  });

  it('isolates invalid Application Settings without resetting canonical Shell state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-invalid-settings-'));
    roots.push(root);
    const initial = await openState(root);
    const expectedShell = await initial.shell.commit({
      ...createEmptyDesktopShellState(),
      catalogRevision: 1,
    });
    await initial.store.dispose();

    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    const shell = new SqliteJsonStateRepository({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
      codec: shellCodec,
    });
    const settings = new SqliteJsonStateRepository({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
      codec: settingsCodec,
      now: () => '2026-08-05T00:00:00.000Z',
    });
    const invalidDocument = JSON.stringify({
      ...createDefaultDesktopApplicationSettingsState(),
      [['schema', 'Ver', 'sion'].join('')]: 1,
    });
    try {
      await settings.prepare();
      const seeded = await store.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'seed-invalid-settings-root' },
        ({ sql }) =>
          sql.run(
            `INSERT INTO desktop_application_state(
               authority_key, document_json, updated_at
             ) VALUES (?, ?, ?)`,
            [
              DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
              invalidDocument,
              '2026-08-04T00:00:00.000Z',
            ],
          ),
      );
      expect(seeded.changes).toBe(1);

      const rejection = await settings.inspectInvalidState();
      expect(rejection).toMatchObject({
        authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
        diagnostic: expect.stringContaining(['schema', 'Ver', 'sion'].join('')),
      });
      expect(await settings.read()).toEqual(createDefaultDesktopApplicationSettingsState());
      expect(await shell.read()).toEqual(expectedShell);
      const retained = await store.transaction(
        { mode: 'read', ownership: 'state', operation: 'verify-invalid-settings-retained' },
        ({ sql }) =>
          sql.all(
            `SELECT authority_key, document_json
               FROM desktop_application_state
              WHERE authority_key = ?`,
            [DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings],
          ),
      );
      expect(retained).toEqual([
        {
          authority_key: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
          document_json: invalidDocument,
        },
      ]);
    } finally {
      await store.dispose();
    }
  });

  it('does not read or mutate adjacent Agent, log, user, or workspace-owned files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-adjacent-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    const adjacent = new Map([
      [join(root, '.neko', 'config.json'), '{"agent":"config"}\n'],
      [join(root, '.neko', 'transcripts', 'conversation.jsonl'), '{"role":"user"}\n'],
      [join(root, '.neko', 'logs', 'desktop.log'), 'diagnostic\n'],
      [join(workspace, '.neko', 'workspace.json'), '{"workspace":"retired"}\n'],
      [join(workspace, 'neko', 'project.json'), '{"workspaceId":"portable"}\n'],
      [join(workspace, 'neko', 'memory.md'), '# Accepted memory\n'],
    ]);
    await Promise.all(
      [...adjacent.keys()].map((filePath) => mkdir(join(filePath, '..'), { recursive: true })),
    );
    await Promise.all([
      ...[...adjacent].map(([filePath, content]) => writeFile(filePath, content, 'utf8')),
    ]);

    const state = await openState(root);
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
  serialize: serializeDesktopShellStoredState,
};

const settingsCodec = {
  createEmpty: createDefaultDesktopApplicationSettingsState,
  parse: parseDesktopApplicationSettingsStoredState,
};

async function openState(root: string) {
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  const shell = new SqliteJsonStateRepository({
    store,
    authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
    codec: shellCodec,
  });
  const settings = new SqliteJsonStateRepository({
    store,
    authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
    codec: settingsCodec,
  });
  await Promise.all([shell.prepare(), settings.prepare()]);
  return {
    store,
    shell,
    settings,
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
