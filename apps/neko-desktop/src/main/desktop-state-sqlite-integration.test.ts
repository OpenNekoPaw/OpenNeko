import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DESKTOP_STATE_AUTHORITY_KEYS, SqliteJsonStateRepository } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { DesktopApplicationSettingsService } from '@neko/host/application-settings-service';
import {
  createDefaultDesktopApplicationSettingsState,
  parseDesktopApplicationSettingsStoredState,
  readDesktopApplicationSettingsStateDiagnostics,
  serializeDesktopApplicationSettingsStoredState,
} from '@neko/host/application-settings-state';
import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
  readDesktopShellStateDiagnostics,
  serializeDesktopShellStoredState,
} from '@neko/host/desktop-shell-state';
import {
  DesktopShellService,
  type DesktopWorkspaceResolutionPort,
} from '@neko/host/desktop-shell-service';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from '@neko/host/desktop-scene-contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';

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

  it('isolates an invalid Window once and reopens only canonical Shell state', async () => {
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
    const invalidScene = {
      unexpectedField: 1,
      sceneId,
      windowId: 'window-old',
      context: { kind: 'project-management' },
      slots: {
        main: { kind: 'project-management' },
        status: { kind: 'scene-status', sceneId },
      },
    };
    const invalidState = {
      primaryWindowId: 'window-old',
      projects: [],
      windows: [
        {
          windowId: 'window-old',
          activeTarget: { kind: 'home' },
          tabs: [],
          workbench: {
            workbenchInstanceId: 'workbench:window-old:project-management',
            windowId: 'window-old',
            layout: createDefaultDesktopWorkbenchLayout('window-old'),
            scene: invalidScene,
          },
          applicationSidebar: createDefaultDesktopApplicationSidebar('window-old'),
        },
      ],
    };
    await store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'seed-invalid-shell-scene' },
      ({ sql }) =>
        sql.run(
          `INSERT INTO desktop_application_state(
             authority_key, document_json, updated_at
           ) VALUES (?, ?, ?)`,
          [
            DESKTOP_STATE_AUTHORITY_KEYS.shell,
            JSON.stringify(invalidState),
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
      service.setRendererSessionId(windowId, 'renderer-session:test');
      const projection = await service.getProjection(windowId);

      expect(windowId).not.toBe('window-old');
      expect(projection.window.workbench.windowId).toBe(windowId);
      expect(projection.stateDiagnostics).toEqual([
        expect.objectContaining({
          code: 'desktop-stored-window-invalid',
          windowId: 'window-old',
          message: expect.stringContaining("unknown field 'unexpectedField'"),
        }),
      ]);
      const rows = await store.transaction(
        { mode: 'read', ownership: 'state', operation: 'verify-invalid-window-removed' },
        ({ sql }) =>
          sql.all('SELECT document_json FROM desktop_application_state WHERE authority_key = ?', [
            DESKTOP_STATE_AUTHORITY_KEYS.shell,
          ]),
      );
      const document: unknown = JSON.parse(String(rows[0]?.['document_json']));
      if (!isRecord(document) || !Array.isArray(document['windows'])) {
        throw new Error('Desktop Shell authority did not persist a Window collection.');
      }
      expect(document['windows']).toEqual([
        expect.objectContaining({ windowId, workbench: expect.any(Object) }),
      ]);
      await service.dispose();

      const reopenedRepository = new SqliteJsonStateRepository({
        store,
        authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
        codec: shellCodec,
      });
      await reopenedRepository.prepare();
      const reopenedService = new DesktopShellService({
        applicationInstanceId: 'application:reopened',
        stateRepository: reopenedRepository,
        workspaceRegistry: {
          resolve: async () => {
            throw new Error('Workspace resolution is not expected during Shell reopen.');
          },
          dispose: async () => undefined,
        },
        startupTarget: 'home',
        createIdentity: () => `reopened-${(identity += 1)}`,
      });
      const reopenedWindowId = await reopenedService.claimWindowId();
      reopenedService.setRendererSessionId(reopenedWindowId, 'renderer-session:reopened');
      const reopenedProjection = await reopenedService.getProjection(reopenedWindowId);

      expect(reopenedWindowId).toBe(windowId);
      expect(reopenedProjection.stateDiagnostics).toEqual([]);
      await reopenedService.dispose();
    } finally {
      await store.dispose();
    }
  });

  it('restores Shell collections with unknown root metadata and preserves it on commit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-additive-root-'));
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
    const windowId = 'window:existing';
    const projectId = 'project:existing';
    const workspaceId = 'workspace:existing';
    const scene = createDefaultDesktopAgentScene(windowId, 'draft:existing');
    const workbench = createDesktopWindowComposition({
      workbenchInstanceId: 'workbench:existing',
      layout: createDefaultDesktopWorkbenchLayout(windowId),
      scene,
    });
    const catalogMetadataField = ['catalog', 'Revi', 'sion'].join('');
    const storageMetadataField = ['storage', 'Revi', 'sion'].join('');
    const storedDocument = {
      [catalogMetadataField]: 7,
      [storageMetadataField]: { source: 'retained-fixture', ordinal: 3 },
      primaryWindowId: windowId,
      projects: [
        {
          projectId,
          workspaceId,
          profile: 'content',
          displayName: 'Existing Project',
          workspacePath: join(root, 'workspace'),
          workspaceLocator: { kind: 'relative', value: 'workspace' },
          createdAt: '2026-08-04T00:00:00.000Z',
          updatedAt: '2026-08-04T00:00:00.000Z',
        },
      ],
      windows: [
        {
          windowId,
          activeTarget: { kind: 'home' },
          tabs: [],
          workbench,
          applicationSidebar: createDefaultDesktopApplicationSidebar(windowId),
        },
      ],
    };
    try {
      await repository.prepare();
      const seeded = await store.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'seed-additive-shell-root' },
        ({ sql }) =>
          sql.run(
            `INSERT INTO desktop_application_state(
               authority_key, document_json, updated_at
             ) VALUES (?, ?, ?)`,
            [
              DESKTOP_STATE_AUTHORITY_KEYS.shell,
              JSON.stringify(storedDocument),
              '2026-08-04T00:00:00.000Z',
            ],
          ),
      );
      expect(seeded.changes).toBe(1);

      await expect(repository.inspectInvalidState()).resolves.toBeUndefined();
      const restored = await repository.read();
      expect(restored.primaryWindowId).toBe(windowId);
      expect(restored.projects.map((project) => project.projectId)).toEqual([projectId]);
      expect(restored.windows.map((window) => window.windowId)).toEqual([windowId]);
      expect(readDesktopShellStateDiagnostics(restored)).toEqual([
        expect.objectContaining({
          code: 'desktop-stored-state-metadata-retained',
          fieldNames: [catalogMetadataField, storageMetadataField],
        }),
      ]);
      await repository.commit({
        ...restored,
        projects: restored.projects.map((project) => ({
          ...project,
          displayName: 'Existing Project Updated',
        })),
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
        createIdentity: () => `identity-${(identity += 1)}`,
        now: () => '2026-08-05T00:00:00.000Z',
      });
      const claimedWindowId = await service.claimWindowId();
      service.setRendererSessionId(claimedWindowId, 'renderer-session:test');
      const projection = await service.getProjection(claimedWindowId);
      expect(claimedWindowId).toBe(windowId);
      expect(projection.catalog.projects).toEqual([
        expect.objectContaining({ projectId, displayName: 'Existing Project Updated' }),
      ]);
      expect(projection.window.workbench.workbenchInstanceId).toBe(workbench.workbenchInstanceId);
      expect(projection.stateDiagnostics).toEqual([
        expect.objectContaining({
          code: 'desktop-stored-state-metadata-retained',
          fieldNames: [catalogMetadataField, storageMetadataField],
        }),
      ]);
      const rows = await store.transaction(
        { mode: 'read', ownership: 'state', operation: 'verify-shell-root-metadata-retained' },
        ({ sql }) =>
          sql.all(
            `SELECT document_json
               FROM desktop_application_state
              WHERE authority_key = ?`,
            [DESKTOP_STATE_AUTHORITY_KEYS.shell],
          ),
      );
      const persisted: unknown = JSON.parse(String(rows[0]?.['document_json']));
      expect(persisted).toMatchObject({
        [catalogMetadataField]: storedDocument[catalogMetadataField],
        [storageMetadataField]: storedDocument[storageMetadataField],
        primaryWindowId: windowId,
        projects: [expect.objectContaining({ projectId, displayName: 'Existing Project Updated' })],
        windows: [expect.objectContaining({ windowId })],
      });
      await service.dispose();
    } finally {
      await store.dispose();
    }
  });

  it('restores Application Settings with unknown root metadata and preserves it on update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-settings-additive-root-'));
    roots.push(root);
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    const settings = new SqliteJsonStateRepository({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
      codec: settingsCodec,
    });
    const metadataField = ['storage', 'Revi', 'sion'].join('');
    const metadataValue = { source: 'retained-settings-fixture', ordinal: 5 };
    try {
      await settings.prepare();
      await store.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'seed-additive-settings-root' },
        ({ sql }) =>
          sql.run(
            `INSERT INTO desktop_application_state(
               authority_key, document_json, updated_at
             ) VALUES (?, ?, ?)`,
            [
              DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
              JSON.stringify({
                [metadataField]: metadataValue,
                preferences: {
                  ...createDefaultDesktopApplicationSettingsState().preferences,
                  theme: 'dark',
                },
              }),
              '2026-08-04T00:00:00.000Z',
            ],
          ),
      );

      await expect(settings.inspectInvalidState()).resolves.toBeUndefined();
      const restored = await settings.read();
      expect(restored.preferences.theme).toBe('dark');
      expect(readDesktopApplicationSettingsStateDiagnostics(restored)).toEqual([
        expect.objectContaining({
          code: 'desktop-stored-state-metadata-retained',
          authorityKey: 'desktop.application-settings',
          fieldNames: [metadataField],
        }),
      ]);

      const service = new DesktopApplicationSettingsService(settings);
      await expect(service.initialize()).resolves.toMatchObject({ preferences: { theme: 'dark' } });
      await service.update({
        ...restored.preferences,
        locale: 'zh-cn',
      });
      await service.dispose();

      const rows = await store.transaction(
        { mode: 'read', ownership: 'state', operation: 'verify-settings-root-metadata-retained' },
        ({ sql }) =>
          sql.all(
            `SELECT document_json
               FROM desktop_application_state
              WHERE authority_key = ?`,
            [DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings],
          ),
      );
      const persisted: unknown = JSON.parse(String(rows[0]?.['document_json']));
      expect(persisted).toMatchObject({
        [metadataField]: metadataValue,
        preferences: expect.objectContaining({ theme: 'dark', locale: 'zh-cn' }),
      });
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
      preferences: {
        ...createDefaultDesktopApplicationSettingsState().preferences,
        theme: 'unknown-theme',
      },
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
        diagnostic: expect.stringContaining('theme'),
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
});

const shellCodec = {
  createEmpty: createEmptyDesktopShellState,
  parse: parseDesktopShellStoredState,
  serialize: serializeDesktopShellStoredState,
};

const settingsCodec = {
  createEmpty: createDefaultDesktopApplicationSettingsState,
  parse: parseDesktopApplicationSettingsStoredState,
  serialize: serializeDesktopApplicationSettingsStoredState,
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
