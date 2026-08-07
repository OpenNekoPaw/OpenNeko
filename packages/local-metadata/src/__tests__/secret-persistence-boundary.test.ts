import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { initializeAgentStateTables, initializeCoreLocalMetadataTables } from '../sqlite';
import { LOCAL_METADATA_JSON_MAX_BYTES } from '../secret-boundary';

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
    await initializeCoreLocalMetadataTables(store);
    await initializeAgentStateTables(store);
    await store.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
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

  it.each([
    ['Buffer', Buffer.from([0, 1, 2])],
    ['typed array', new Uint16Array([1, 2, 3])],
    ['ArrayBuffer', new Uint8Array([1, 2, 3]).buffer],
    ['DataView', new DataView(new ArrayBuffer(4))],
    ['Blob', new Blob(['binary-content'])],
    ['data URL', 'data:image/png;base64,iVBORw0KGgo='],
    ['blob URL', 'blob:https://openneko.local/binary-resource'],
    ['Base64 payload', Buffer.alloc(384, 17).toString('base64')],
    ['serialized Buffer', { type: 'Buffer', data: [0, 1, 2, 3] }],
    ['serialized typed array', { type: 'Uint8Array', data: [0, 1, 2, 3] }],
    ['serialized float typed array', { type: 'Float32Array', data: [-1.5, 0.25] }],
    ['byte-like array', Array.from({ length: 64 }, (_, index) => index)],
    [
      'serialized numeric-key typed array',
      Object.fromEntries(Array.from({ length: 64 }, (_, index) => [String(index), index])),
    ],
  ])('rejects %s before a Task checkpoint write', async (_label, binaryValue) => {
    const { store } = await checkpointStore('neko-metadata-binary-boundary-');

    await expect(
      store.repositories.taskCheckpoints.upsert({
        workspaceId: WORKSPACE_ID,
        taskKey: 'media:generate:binary',
        taskId: 'task-binary',
        payload: { binaryValue },
        updatedAt: 1,
      }),
    ).rejects.toMatchObject({
      code: 'metadata-binary-forbidden',
      operation: 'upsert-task-checkpoint',
    });
    await expect(
      store.repositories.taskCheckpoints.get(WORKSPACE_ID, 'media:generate:binary'),
    ).resolves.toBeNull();
    await store.dispose();
  });

  it('rejects binary introduced by toJSON and oversized JSON before SQLite mutation', async () => {
    const { store } = await checkpointStore('neko-metadata-json-boundary-');

    await expect(
      store.repositories.taskCheckpoints.upsert({
        workspaceId: WORKSPACE_ID,
        taskKey: 'media:generate:to-json',
        taskId: 'task-to-json',
        payload: { toJSON: () => ({ data: 'data:application/octet-stream;base64,AA==' }) },
        updatedAt: 1,
      }),
    ).rejects.toMatchObject({ code: 'metadata-binary-forbidden' });
    await expect(
      store.repositories.taskCheckpoints.upsert({
        workspaceId: WORKSPACE_ID,
        taskKey: 'media:generate:large',
        taskId: 'task-large',
        payload: { text: 'large record '.repeat(LOCAL_METADATA_JSON_MAX_BYTES / 4) },
        updatedAt: 1,
      }),
    ).rejects.toMatchObject({
      code: 'metadata-record-too-large',
      operation: 'upsert-task-checkpoint',
    });
    await expect(store.repositories.taskCheckpoints.list(WORKSPACE_ID)).resolves.toEqual([]);
    await store.dispose();
  });

  it('rejects a runtime binary SQL binding even when the TypeScript contract is bypassed', async () => {
    const { store } = await checkpointStore('neko-metadata-raw-binding-');

    await expect(
      store.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'unsafe-raw-binary-binding' },
        ({ sql }) =>
          Reflect.apply(sql.run, sql, [
            `INSERT INTO task_checkpoints(
               workspace_id, task_key, task_id, payload_json, updated_at
             ) VALUES (?, ?, ?, ?, ?)`,
            [WORKSPACE_ID, 'raw-binary', 'task-raw', Buffer.from([0, 1, 2]), 1],
          ]),
      ),
    ).rejects.toMatchObject({ code: 'metadata-binary-forbidden', operation: 'run' });
    await expect(store.repositories.taskCheckpoints.list(WORKSPACE_ID)).resolves.toEqual([]);
    await store.dispose();
  });
});

async function checkpointStore(prefix: string) {
  const homedir = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(homedir);
  const databasePath = resolveGlobalStorageLayout(homedir).database;
  const store = createNodeSqliteLocalMetadataStore({ homedir });
  await store.open({ databasePath, busyTimeoutMs: 1_000 });
  await initializeCoreLocalMetadataTables(store);
  await initializeAgentStateTables(store);
  await store.repositories.workspaces.bind({
    identity: { workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-13T00:00:00.000Z',
  });
  return { store };
}
