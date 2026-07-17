import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { AGENT_STATE_MIGRATIONS, M1_LOCAL_METADATA_MIGRATIONS } from '../sqlite';

const temporaryDirectories: string[] = [];
const WORKSPACE_ID = '98be868a-9f3b-41fa-bbee-f0db317f3468';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Local metadata secret persistence boundary', () => {
  it('rejects a provider token in a Task recovery checkpoint', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-metadata-secret-boundary-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(AGENT_STATE_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });

    await expect(
      store.repositories.taskCheckpoints.upsert({
        workspaceId: WORKSPACE_ID,
        taskKey: 'media:generate:1',
        taskId: 'task-1',
        payload: {
          externalTaskId: 'provider-task-1',
          providerRecovery: { accessToken: 'must-not-enter-sqlite' },
        },
        updatedAt: 1,
      }),
    ).rejects.toMatchObject({
      code: 'metadata-secret-forbidden',
      operation: 'upsert-task-checkpoint',
    });
    await expect(
      store.repositories.taskCheckpoints.get(WORKSPACE_ID, 'media:generate:1'),
    ).resolves.toBeNull();
    await store.dispose();
  });
});
