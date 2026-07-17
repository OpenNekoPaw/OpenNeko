import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseWorkspaceIdentityJson,
  resolveGlobalStorageLayout,
  serializeWorkspaceIdentityDescriptor,
  WORKSPACE_IDENTITY_RELATIVE_PATH,
  type LocalMetadataStore,
} from '../..';
import { executeNodeWorkspaceIdentityRecoveryAction } from '../node-workspace-identity-recovery';
import { resolveNodeWorkspaceIdentity } from '../node-workspace-identity';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { M1_LOCAL_METADATA_MIGRATIONS } from '../sqlite';

const SOURCE_WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';
const CLONE_WORKSPACE_ID = 'bd82b3ee-b9d9-4aa0-a635-23fa356e67df';
const OCCURRED_AT = '2026-07-13T08:00:00.000Z';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('workspace identity recovery', () => {
  it('restores a deleted descriptor from the unique current locator without creating user files', async () => {
    const fixture = await createFixture();
    const descriptorPath = join(fixture.workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
    await rm(descriptorPath);

    const resolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: fixture.workspaceRoot,
      homedir: fixture.homedir,
      metadataStore: fixture.store,
      now: () => OCCURRED_AT,
    });

    expect(resolution).toMatchObject({
      kind: 'restored',
      identity: { workspaceId: SOURCE_WORKSPACE_ID },
      workspace: {
        workspaceId: SOURCE_WORKSPACE_ID,
        currentLocator: { value: '${HOME}/workspace' },
      },
    });
    await expect(readDescriptor(fixture.workspaceRoot)).resolves.toMatchObject({
      workspaceId: SOURCE_WORKSPACE_ID,
    });
    await expect(access(join(fixture.workspaceRoot, '.neko', 'config.toml'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
    await expect(access(join(fixture.workspaceRoot, '.neko', 'memory.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await fixture.store.dispose();
  });

  it('creates a new identity only when the locator has no descriptor or registry match', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-workspace-new-'));
    temporaryDirectories.push(homedir);
    const workspaceRoot = join(homedir, 'new-workspace');
    await mkdir(workspaceRoot, { recursive: true });
    const store = await createStore(homedir);

    const resolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot,
      homedir,
      metadataStore: store,
      createWorkspaceId: () => CLONE_WORKSPACE_ID,
      now: () => OCCURRED_AT,
    });

    expect(resolution).toMatchObject({
      kind: 'created',
      identity: { workspaceId: CLONE_WORKSPACE_ID },
      workspace: {
        workspaceId: CLONE_WORKSPACE_ID,
        currentLocator: { value: '${HOME}/new-workspace' },
      },
    });
    await expect(readDescriptor(workspaceRoot)).resolves.toMatchObject({
      workspaceId: CLONE_WORKSPACE_ID,
    });
    await expect(store.repositories.workspaces.get(CLONE_WORKSPACE_ID)).resolves.toMatchObject({
      currentLocator: { value: '${HOME}/new-workspace' },
    });

    await store.dispose();
  });

  it('marks an existing matching descriptor and registry binding as seen', async () => {
    const fixture = await createFixture();

    const resolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: fixture.workspaceRoot,
      homedir: fixture.homedir,
      metadataStore: fixture.store,
      now: () => OCCURRED_AT,
    });

    expect(resolution).toMatchObject({
      kind: 'seen',
      identity: { workspaceId: SOURCE_WORKSPACE_ID },
      workspace: {
        workspaceId: SOURCE_WORKSPACE_ID,
        lastSeenAt: OCCURRED_AT,
      },
    });
    await expect(readDescriptor(fixture.workspaceRoot)).resolves.toMatchObject({
      workspaceId: SOURCE_WORKSPACE_ID,
    });

    await fixture.store.dispose();
  });

  it('preserves the workspace identity when the previous locator no longer exists', async () => {
    const fixture = await createFixture();
    const movedWorkspaceRoot = join(fixture.homedir, 'workspace-moved');
    await rename(fixture.workspaceRoot, movedWorkspaceRoot);

    const resolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: movedWorkspaceRoot,
      homedir: fixture.homedir,
      metadataStore: fixture.store,
      now: () => OCCURRED_AT,
    });

    expect(resolution).toMatchObject({
      kind: 'moved',
      identity: { workspaceId: SOURCE_WORKSPACE_ID },
      workspace: {
        workspaceId: SOURCE_WORKSPACE_ID,
        currentLocator: { value: '${HOME}/workspace-moved' },
        locatorHistory: [{ value: '${HOME}/workspace' }, { value: '${HOME}/workspace-moved' }],
      },
    });
    await expect(readDescriptor(movedWorkspaceRoot)).resolves.toMatchObject({
      workspaceId: SOURCE_WORKSPACE_ID,
    });

    await fixture.store.dispose();
  });

  it('rejects a copied checkout while the registered locator is still live', async () => {
    const fixture = await createFixture();
    const copiedWorkspaceRoot = join(fixture.homedir, 'workspace-copy');
    await mkdir(join(copiedWorkspaceRoot, '.neko'), { recursive: true });
    await writeFile(
      join(copiedWorkspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH),
      serializeWorkspaceIdentityDescriptor({ version: 1, workspaceId: SOURCE_WORKSPACE_ID }),
      'utf8',
    );

    await expect(
      resolveNodeWorkspaceIdentity({
        workspaceRoot: copiedWorkspaceRoot,
        homedir: fixture.homedir,
        metadataStore: fixture.store,
        createWorkspaceId: () => CLONE_WORKSPACE_ID,
        now: () => OCCURRED_AT,
      }),
    ).rejects.toMatchObject({
      code: 'duplicate-workspace-identity',
      message: expect.stringContaining('copied checkout'),
    });
    await expect(
      fixture.store.repositories.workspaces.get(SOURCE_WORKSPACE_ID),
    ).resolves.toMatchObject({
      currentLocator: { value: '${HOME}/workspace' },
      locatorHistory: [{ value: '${HOME}/workspace' }],
    });
    await expect(fixture.store.repositories.workspaces.get(CLONE_WORKSPACE_ID)).resolves.toBeNull();

    await fixture.store.dispose();
  });

  it('rejects registering a second workspace at an occupied current locator', async () => {
    const fixture = await createFixture();

    await expect(
      fixture.store.repositories.workspaces.bind({
        identity: { version: 1, workspaceId: CLONE_WORKSPACE_ID },
        locator: { kind: 'variable', value: '${HOME}/workspace' },
        seenAt: OCCURRED_AT,
      }),
    ).rejects.toMatchObject({
      code: 'duplicate-workspace-identity',
      message: expect.stringContaining('${HOME}/workspace'),
    });
    await expect(
      fixture.store.repositories.workspaces.findByCurrentLocator({
        kind: 'variable',
        value: '${HOME}/workspace',
      }),
    ).resolves.toEqual([expect.objectContaining({ workspaceId: SOURCE_WORKSPACE_ID })]);

    await fixture.store.dispose();
  });

  it('registers an existing descriptor when the user database has no workspace row', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-workspace-register-'));
    temporaryDirectories.push(homedir);
    const workspaceRoot = join(homedir, 'workspace');
    await mkdir(join(workspaceRoot, '.neko'), { recursive: true });
    await writeFile(
      join(workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH),
      serializeWorkspaceIdentityDescriptor({ version: 1, workspaceId: SOURCE_WORKSPACE_ID }),
      'utf8',
    );
    const store = await createStore(homedir);

    const resolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot,
      homedir,
      metadataStore: store,
      createWorkspaceId: () => CLONE_WORKSPACE_ID,
      now: () => OCCURRED_AT,
    });

    expect(resolution).toMatchObject({
      kind: 'registered',
      identity: { workspaceId: SOURCE_WORKSPACE_ID },
      workspace: {
        workspaceId: SOURCE_WORKSPACE_ID,
        currentLocator: { value: '${HOME}/workspace' },
      },
    });
    await expect(store.repositories.workspaces.get(CLONE_WORKSPACE_ID)).resolves.toBeNull();

    await store.dispose();
  });

  it('fails visibly when legacy rows make a descriptor-less locator ambiguous', async () => {
    const fixture = await createFixture();
    const database = new DatabaseSync(resolveGlobalStorageLayout(fixture.homedir).database);
    try {
      database
        .prepare(
          `INSERT INTO workspaces (
            workspace_id, current_locator_kind, current_locator_value,
            locator_history_json, last_seen_at, orphaned_at
          ) VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          CLONE_WORKSPACE_ID,
          'variable',
          '${HOME}/workspace',
          JSON.stringify([{ kind: 'variable', value: '${HOME}/workspace' }]),
          OCCURRED_AT,
        );
    } finally {
      database.close();
    }
    const descriptorPath = join(fixture.workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
    await rm(descriptorPath);

    await expect(
      resolveNodeWorkspaceIdentity({
        workspaceRoot: fixture.workspaceRoot,
        homedir: fixture.homedir,
        metadataStore: fixture.store,
        now: () => OCCURRED_AT,
      }),
    ).rejects.toMatchObject({
      code: 'ambiguous-workspace-locator',
      message: expect.stringContaining('2 registered identities'),
    });
    await expect(access(descriptorPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fixture.store.repositories.workspaces.findByCurrentLocator({
        kind: 'variable',
        value: '${HOME}/workspace',
      }),
    ).resolves.toHaveLength(2);

    await fixture.store.dispose();
  });

  it('selects the descriptor identity and preserves conflicting partitions as orphans', async () => {
    const fixture = await createFixture();
    const database = new DatabaseSync(resolveGlobalStorageLayout(fixture.homedir).database);
    try {
      database
        .prepare(
          `INSERT INTO workspaces (
            workspace_id, current_locator_kind, current_locator_value,
            locator_history_json, last_seen_at, orphaned_at
          ) VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          CLONE_WORKSPACE_ID,
          'variable',
          '${HOME}/workspace',
          JSON.stringify([{ kind: 'variable', value: '${HOME}/workspace' }]),
          OCCURRED_AT,
        );
      database
        .prepare(
          `INSERT INTO conversations (
            conversation_id, workspace_id, journal_id, title, source, model,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          'orphan-conversation',
          CLONE_WORKSPACE_ID,
          'orphan-journal',
          'Preserved orphan projection',
          'vscode',
          OCCURRED_AT,
          OCCURRED_AT,
        );
    } finally {
      database.close();
    }

    await expect(
      resolveNodeWorkspaceIdentity({
        workspaceRoot: fixture.workspaceRoot,
        homedir: fixture.homedir,
        metadataStore: fixture.store,
        now: () => OCCURRED_AT,
      }),
    ).rejects.toMatchObject({ code: 'ambiguous-workspace-locator' });

    const report = await executeNodeWorkspaceIdentityRecoveryAction({
      workspaceRoot: fixture.workspaceRoot,
      metadataStore: fixture.store,
      action: {
        kind: 'select-current',
        workspaceId: SOURCE_WORKSPACE_ID,
        conflictingWorkspaceIds: [CLONE_WORKSPACE_ID],
        locator: { kind: 'variable', value: '${HOME}/workspace' },
      },
      occurredAt: OCCURRED_AT,
    });

    expect(report).toMatchObject({
      action: 'select-current',
      previousWorkspaceId: SOURCE_WORKSPACE_ID,
      orphanedWorkspaceIds: [CLONE_WORKSPACE_ID],
      workspace: { workspaceId: SOURCE_WORKSPACE_ID, orphanedAt: null },
    });
    await expect(
      fixture.store.repositories.workspaces.findByCurrentLocator({
        kind: 'variable',
        value: '${HOME}/workspace',
      }),
    ).resolves.toEqual([expect.objectContaining({ workspaceId: SOURCE_WORKSPACE_ID })]);
    await expect(
      fixture.store.repositories.workspaces.get(CLONE_WORKSPACE_ID),
    ).resolves.toMatchObject({ orphanedAt: OCCURRED_AT });
    await expect(
      fixture.store.repositories.conversations.get('orphan-conversation'),
    ).resolves.toMatchObject({ workspaceId: CLONE_WORKSPACE_ID });
    await expect(
      resolveNodeWorkspaceIdentity({
        workspaceRoot: fixture.workspaceRoot,
        homedir: fixture.homedir,
        metadataStore: fixture.store,
        now: () => OCCURRED_AT,
      }),
    ).resolves.toMatchObject({
      kind: 'seen',
      identity: { workspaceId: SOURCE_WORKSPACE_ID },
    });

    await fixture.store.dispose();
  });

  it('rolls back canonical selection when the approved conflict set is stale', async () => {
    const fixture = await createFixture();
    const database = new DatabaseSync(resolveGlobalStorageLayout(fixture.homedir).database);
    try {
      database
        .prepare(
          `INSERT INTO workspaces (
            workspace_id, current_locator_kind, current_locator_value,
            locator_history_json, last_seen_at, orphaned_at
          ) VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          CLONE_WORKSPACE_ID,
          'variable',
          '${HOME}/workspace',
          JSON.stringify([{ kind: 'variable', value: '${HOME}/workspace' }]),
          OCCURRED_AT,
        );
    } finally {
      database.close();
    }

    await expect(
      executeNodeWorkspaceIdentityRecoveryAction({
        workspaceRoot: fixture.workspaceRoot,
        metadataStore: fixture.store,
        action: {
          kind: 'select-current',
          workspaceId: SOURCE_WORKSPACE_ID,
          conflictingWorkspaceIds: [CLONE_WORKSPACE_ID, '0d4df14b-e3a4-4d66-bfeb-116e0c96e902'],
          locator: { kind: 'variable', value: '${HOME}/workspace' },
        },
        occurredAt: OCCURRED_AT,
      }),
    ).rejects.toMatchObject({
      code: 'ambiguous-workspace-locator',
      message: expect.stringContaining('conflict set changed'),
    });
    await expect(
      fixture.store.repositories.workspaces.get(CLONE_WORKSPACE_ID),
    ).resolves.toMatchObject({ orphanedAt: null });
    await expect(
      fixture.store.repositories.workspaces.get(SOURCE_WORKSPACE_ID),
    ).resolves.toMatchObject({ orphanedAt: null });

    await fixture.store.dispose();
  });

  it('clones a copied checkout into a new empty identity with a descriptor backup', async () => {
    const fixture = await createFixture();

    const report = await executeNodeWorkspaceIdentityRecoveryAction({
      workspaceRoot: fixture.workspaceRoot,
      metadataStore: fixture.store,
      action: {
        kind: 'clone',
        sourceWorkspaceId: SOURCE_WORKSPACE_ID,
        newWorkspaceId: CLONE_WORKSPACE_ID,
        locator: { kind: 'variable', value: '${HOME}/workspace-copy' },
      },
      occurredAt: OCCURRED_AT,
    });

    expect(report).toMatchObject({
      action: 'clone',
      previousWorkspaceId: SOURCE_WORKSPACE_ID,
      workspace: {
        workspaceId: CLONE_WORKSPACE_ID,
        currentLocator: { kind: 'variable', value: '${HOME}/workspace-copy' },
        locatorHistory: [{ value: '${HOME}/workspace-copy' }],
        orphanedAt: null,
      },
    });
    await expect(readDescriptor(fixture.workspaceRoot)).resolves.toMatchObject({
      workspaceId: CLONE_WORKSPACE_ID,
    });
    await expect(readFile(report.descriptorBackupPath ?? '', 'utf8')).resolves.toContain(
      SOURCE_WORKSPACE_ID,
    );
    await expect(
      fixture.store.repositories.workspaces.get(SOURCE_WORKSPACE_ID),
    ).resolves.toMatchObject({ currentLocator: { value: '${HOME}/workspace' } });

    await fixture.store.dispose();
  });

  it('rebinds an orphan without changing its descriptor identity', async () => {
    const fixture = await createFixture();
    await fixture.store.repositories.workspaces.markOrphaned(
      SOURCE_WORKSPACE_ID,
      '2026-07-12T00:00:00.000Z',
    );

    const report = await executeNodeWorkspaceIdentityRecoveryAction({
      workspaceRoot: fixture.workspaceRoot,
      metadataStore: fixture.store,
      action: {
        kind: 'rebind',
        workspaceId: SOURCE_WORKSPACE_ID,
        locator: { kind: 'variable', value: '${HOME}/workspace-restored' },
      },
      occurredAt: OCCURRED_AT,
    });

    expect(report).toMatchObject({
      action: 'rebind',
      descriptorBackupPath: null,
      workspace: {
        workspaceId: SOURCE_WORKSPACE_ID,
        locatorHistory: [{ value: '${HOME}/workspace' }, { value: '${HOME}/workspace-restored' }],
        orphanedAt: null,
      },
    });
    await expect(readDescriptor(fixture.workspaceRoot)).resolves.toMatchObject({
      workspaceId: SOURCE_WORKSPACE_ID,
    });

    await fixture.store.dispose();
  });

  it('restores the original descriptor when clone registration fails', async () => {
    const fixture = await createFixture();
    const failingStore = failCloneRegistration(fixture.store);

    await expect(
      executeNodeWorkspaceIdentityRecoveryAction({
        workspaceRoot: fixture.workspaceRoot,
        metadataStore: failingStore,
        action: {
          kind: 'clone',
          sourceWorkspaceId: SOURCE_WORKSPACE_ID,
          newWorkspaceId: CLONE_WORKSPACE_ID,
          locator: { kind: 'variable', value: '${HOME}/workspace-copy' },
        },
        occurredAt: OCCURRED_AT,
      }),
    ).rejects.toThrow('forced clone registration failure');

    await expect(readDescriptor(fixture.workspaceRoot)).resolves.toMatchObject({
      workspaceId: SOURCE_WORKSPACE_ID,
    });
    await expect(fixture.store.repositories.workspaces.get(CLONE_WORKSPACE_ID)).resolves.toBeNull();
    await expect(
      access(
        join(
          fixture.workspaceRoot,
          `${WORKSPACE_IDENTITY_RELATIVE_PATH}.backup-2026-07-13T08-00-00-000Z`,
        ),
      ),
    ).resolves.toBeUndefined();

    await fixture.store.dispose();
  });
});

async function createFixture(): Promise<{
  readonly homedir: string;
  readonly workspaceRoot: string;
  readonly store: LocalMetadataStore;
}> {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-workspace-recovery-'));
  temporaryDirectories.push(homedir);
  const workspaceRoot = join(homedir, 'workspace');
  const descriptorPath = join(workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
  await mkdir(join(workspaceRoot, '.neko'), { recursive: true });
  await writeFile(
    descriptorPath,
    serializeWorkspaceIdentityDescriptor({ version: 1, workspaceId: SOURCE_WORKSPACE_ID }),
    'utf8',
  );
  const store = await createStore(homedir);
  await store.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: SOURCE_WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-12T00:00:00.000Z',
  });
  return { homedir, workspaceRoot, store };
}

async function createStore(homedir: string): Promise<LocalMetadataStore> {
  const store = createNodeSqliteLocalMetadataStore({ homedir });
  await store.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 1_000,
  });
  await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  return store;
}

async function readDescriptor(workspaceRoot: string) {
  return parseWorkspaceIdentityJson(
    await readFile(join(workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH), 'utf8'),
  );
}

function failCloneRegistration(store: LocalMetadataStore): LocalMetadataStore {
  return {
    get state() {
      return store.state;
    },
    repositories: store.repositories,
    open: (options) => store.open(options),
    transaction: (options, operation) =>
      store.transaction(options, async (context) => {
        const result = await operation(context);
        if (options.operation === 'recover-workspace-clone') {
          throw new Error('forced clone registration failure');
        }
        return result;
      }),
    readPartitionRevision: (partition) => store.readPartitionRevision(partition),
    migrateNamespace: (migrations, options) => store.migrateNamespace(migrations, options),
    backup: (request) => store.backup(request),
    restore: (request) => store.restore(request),
    integrityCheck: () => store.integrityCheck(),
    dispose: () => store.dispose(),
  };
}
