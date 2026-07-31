import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
  encodeEntityRepresentationBindingFile,
  type ContentReadService,
} from '@neko/shared';
import { createNodeHostContentReadService } from '@neko/shared/content-access';
import {
  createWorkspaceMediaLibrarySyncMetadataBinding,
  type LocalMetadataRepositories,
  type TaskCheckpointRepository,
} from '@neko/shared/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  MEDIA_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { createWorkspaceLinkedMediaLibrary } from '@neko/shared/node/workspace-linked-media-libraries';
import { afterEach, describe, expect, it } from 'vitest';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';
import {
  DesktopPortableMediaLibrarySnapshotService,
  type DesktopPortableMediaLibrarySnapshotError,
} from './desktop-portable-media-library-snapshot';
import { DesktopWorkspaceMediaLibrarySyncService } from './desktop-workspace-media-library-sync';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('Desktop portable Media Library snapshot', () => {
  it('keeps links, project facts, and target bytes unchanged while rebuilding metadata', async () => {
    const fixture = await createFixture();
    const linkPath = path.join(fixture.workspace.workspacePath, 'neko/assets/Footage');
    const [sourceBinding, sourceMedia, sourceLink] = await Promise.all([
      readFile(fixture.bindingPath, 'utf8'),
      readFile(fixture.mediaPath, 'utf8'),
      readlink(linkPath),
    ]);

    await fixture.sync.inspect(fixture.workspace);
    await fixture.sync.inspect(fixture.workspace);

    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    await expect(readlink(linkPath)).resolves.toBe(sourceLink);
    await expect(readFile(fixture.bindingPath, 'utf8')).resolves.toBe(sourceBinding);
    await expect(readFile(fixture.mediaPath, 'utf8')).resolves.toBe(sourceMedia);
  });

  it('publishes a target-free atomic snapshot and leaves source owners and media unchanged', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-project');
    const sourceBinding = await readFile(fixture.bindingPath, 'utf8');
    const sourceMedia = await readFile(fixture.mediaPath, 'utf8');
    const plan = await fixture.snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });

    expect(plan).toMatchObject({
      workspaceId: fixture.workspace.workspaceId,
      entryCount: 1,
      totalByteLength: Buffer.byteLength(sourceMedia),
      libraries: [{ libraryName: 'Footage', entryCount: 1 }],
    });
    expect(JSON.stringify(plan)).not.toContain(fixture.root);

    await expect(
      fixture.snapshot.execute({
        workspace: fixture.workspace,
        snapshotId: plan.snapshotId,
        expectedOperationRevision: plan.operationRevision,
      }),
    ).resolves.toMatchObject({ status: 'completed', snapshotId: plan.snapshotId });

    await expect(
      readFile(path.join(destination, 'media/collected/Footage/shot.mov'), 'utf8'),
    ).resolves.toBe(sourceMedia);
    await expect(readFile(path.join(destination, 'notes', 'project.txt'), 'utf8')).resolves.toBe(
      'project note',
    );
    await expect(
      readFile(path.join(destination, 'dist', 'generated.txt'), 'utf8'),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      readFile(path.join(destination, '.neko', 'workspace.json'), 'utf8'),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      JSON.parse(
        await readFile(path.join(destination, 'neko/entity-representation-bindings.json'), 'utf8'),
      ),
    ).toMatchObject({
      bindings: [
        {
          representation: {
            kind: 'workspace-file',
            path: 'media/collected/Footage/shot.mov',
          },
        },
      ],
    });
    await expect(readFile(fixture.bindingPath, 'utf8')).resolves.toBe(sourceBinding);
    await expect(readFile(fixture.mediaPath, 'utf8')).resolves.toBe(sourceMedia);
    expect(
      (await readdir(fixture.root)).some(
        (name) => name.includes(plan.snapshotId) && name.endsWith('.staging'),
      ),
    ).toBe(false);
    await expect(fixture.sync.inspect(fixture.workspace)).resolves.toMatchObject({
      portability: { state: 'portable-snapshot-ready' },
    });
  });

  it('rejects a stale owner revision and removes sibling staging', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-stale');
    const plan = await fixture.snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });
    await writeBinding(fixture.workspace.workspacePath, '2026-08-02T00:00:00.000Z');

    await expect(
      fixture.snapshot.execute({
        workspace: fixture.workspace,
        snapshotId: plan.snapshotId,
        expectedOperationRevision: plan.operationRevision,
      }),
    ).rejects.toMatchObject({
      code: 'snapshot-source-stale',
    } satisfies Partial<DesktopPortableMediaLibrarySnapshotError>);
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      (await readdir(fixture.root)).some(
        (name) => name.includes(plan.snapshotId) && name.endsWith('.staging'),
      ),
    ).toBe(false);
  });

  it('cancels during collection without publishing partial output', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-cancelled');
    const plan = await fixture.snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });

    await expect(
      fixture.snapshot.execute({
        workspace: fixture.workspace,
        snapshotId: plan.snapshotId,
        expectedOperationRevision: plan.operationRevision,
        onProgress: (progress) => {
          if (progress.completedEntryCount === 1) {
            void fixture.snapshot.cancel({
              workspace: fixture.workspace,
              snapshotId: plan.snapshotId,
            });
          }
        },
      }),
    ).rejects.toMatchObject({
      code: 'snapshot-cancelled',
    } satisfies Partial<DesktopPortableMediaLibrarySnapshotError>);
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(fixture.snapshot.getProgress(plan.snapshotId)).toMatchObject({
      status: 'cancelled',
      diagnosticCode: 'snapshot-cancelled',
    });
  });

  it('preserves a destination that appears before publish and removes only staging', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-conflict');
    const plan = await fixture.snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });
    await mkdir(destination);
    await writeFile(path.join(destination, 'owner.txt'), 'user-owned');

    await expect(
      fixture.snapshot.execute({
        workspace: fixture.workspace,
        snapshotId: plan.snapshotId,
        expectedOperationRevision: plan.operationRevision,
      }),
    ).rejects.toMatchObject({
      code: 'snapshot-publish-conflict',
    } satisfies Partial<DesktopPortableMediaLibrarySnapshotError>);
    await expect(readFile(path.join(destination, 'owner.txt'), 'utf8')).resolves.toBe('user-owned');
    expect(
      (await readdir(fixture.root)).some(
        (name) => name.includes(plan.snapshotId) && name.endsWith('.staging'),
      ),
    ).toBe(false);
  });

  it('fails closed when referenced bytes disappear after planning', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-missing');
    const plan = await fixture.snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });
    await rm(fixture.mediaPath);

    await expect(
      fixture.snapshot.execute({
        workspace: fixture.workspace,
        snapshotId: plan.snapshotId,
        expectedOperationRevision: plan.operationRevision,
      }),
    ).rejects.toMatchObject({
      code: 'snapshot-source-stale',
    } satisfies Partial<DesktopPortableMediaLibrarySnapshotError>);
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('detects a same-size fingerprint change even when mtime is restored', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-fingerprint');
    const original = await readFile(fixture.mediaPath);
    const snapshot = new DesktopPortableMediaLibrarySnapshotService({
      metadataRepositories: fixture.repositories,
      syncService: fixture.sync,
      createReader: (workspacePath) => {
        const reader = fixture.createReader(workspacePath);
        return {
          async stat(locator, options) {
            const result = await reader.stat(locator, options);
            return result.status === 'ready'
              ? { ...result, modifiedAt: '2026-08-01T00:00:00.000Z' }
              : result;
          },
          read: reader.read.bind(reader),
        } satisfies ContentReadService;
      },
    });
    const plan = await snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });
    const replacement = Buffer.from(original);
    replacement[0] = replacement[0] === 0x78 ? 0x79 : 0x78;
    await writeFile(fixture.mediaPath, replacement);

    await expect(
      snapshot.execute({
        workspace: fixture.workspace,
        snapshotId: plan.snapshotId,
        expectedOperationRevision: plan.operationRevision,
      }),
    ).rejects.toMatchObject({
      code: 'snapshot-content-unavailable',
    } satisfies Partial<DesktopPortableMediaLibrarySnapshotError>);
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects nested symlink escape before creating a snapshot task', async () => {
    const fixture = await createFixture();
    const outside = path.join(fixture.root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'shot.mov'), 'outside');
    await symlink(outside, path.join(path.dirname(fixture.mediaPath), 'escape'), 'dir');
    await writeBinding(
      fixture.workspace.workspacePath,
      '2026-08-02T00:00:00.000Z',
      'neko/assets/Footage/escape/shot.mov',
    );

    await expect(
      fixture.snapshot.plan({
        workspace: fixture.workspace,
        destinationPath: path.join(fixture.root, 'portable-escape'),
      }),
    ).rejects.toMatchObject({
      code: 'nested-link-escape',
    });
  });

  it('fails a task and cleans staging when checkpoint commit is unavailable', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-checkpoint');
    const checkpointRepository = fixture.repositories.taskCheckpoints;
    const failingCheckpoints: TaskCheckpointRepository = {
      get: checkpointRepository.get.bind(checkpointRepository),
      list: checkpointRepository.list.bind(checkpointRepository),
      upsert: async () => {
        throw new Error('checkpoint unavailable');
      },
      delete: checkpointRepository.delete.bind(checkpointRepository),
      clearWorkspace: checkpointRepository.clearWorkspace.bind(checkpointRepository),
    };
    const failingRepositories: LocalMetadataRepositories = new Proxy(fixture.repositories, {
      get: (target, property, receiver) =>
        property === 'taskCheckpoints'
          ? failingCheckpoints
          : Reflect.get(target, property, receiver),
    });
    const snapshot = new DesktopPortableMediaLibrarySnapshotService({
      metadataRepositories: failingRepositories,
      syncService: fixture.sync,
    });
    const plan = await snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });

    await expect(
      snapshot.execute({
        workspace: fixture.workspace,
        snapshotId: plan.snapshotId,
        expectedOperationRevision: plan.operationRevision,
      }),
    ).rejects.toMatchObject({
      code: 'snapshot-checkpoint-unavailable',
    } satisfies Partial<DesktopPortableMediaLibrarySnapshotError>);
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      createWorkspaceMediaLibrarySyncMetadataBinding({
        workspaceId: fixture.workspace.workspaceId,
        repositories: fixture.repositories,
      }).readSnapshotTask(plan.snapshotId),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('rebuilds a cross-restart plan and reuses only a verified checkpoint entry', async () => {
    const fixture = await createFixture();
    const destination = path.join(fixture.root, 'portable-resume');
    const firstPlan = await fixture.snapshot.plan({
      workspace: fixture.workspace,
      destinationPath: destination,
    });
    const staging = path.join(fixture.root, `.portable-resume.${firstPlan.snapshotId}.staging`);
    const stagedEntry = path.join(staging, 'media/collected/Footage/shot.mov');
    await mkdir(path.dirname(stagedEntry), { recursive: true });
    await writeFile(stagedEntry, await readFile(fixture.mediaPath));
    const binding = createWorkspaceMediaLibrarySyncMetadataBinding({
      workspaceId: fixture.workspace.workspaceId,
      repositories: fixture.repositories,
    });
    await binding.writeSnapshotCheckpoint(
      {
        version: 1,
        workspaceId: fixture.workspace.workspaceId,
        snapshotId: firstPlan.snapshotId,
        requirementRevision: firstPlan.requirementRevision,
        completedEntryKeys: ['media/collected/Footage/shot.mov'],
      },
      Date.now(),
    );

    let readCount = 0;
    const resumed = new DesktopPortableMediaLibrarySnapshotService({
      metadataRepositories: fixture.repositories,
      syncService: fixture.sync,
      createReader: (workspacePath) => {
        const reader = fixture.createReader(workspacePath);
        return {
          stat: reader.stat.bind(reader),
          read: async (locator, options) => {
            readCount += 1;
            return reader.read(locator, options);
          },
        } satisfies ContentReadService;
      },
    });
    const resumedPlan = await resumed.resume({
      workspace: fixture.workspace,
      snapshotId: firstPlan.snapshotId,
      destinationPath: destination,
    });
    const planningReadCount = readCount;

    await resumed.execute({
      workspace: fixture.workspace,
      snapshotId: resumedPlan.snapshotId,
      expectedOperationRevision: resumedPlan.operationRevision,
    });

    expect(planningReadCount).toBeGreaterThan(0);
    expect(readCount).toBe(planningReadCount);
    await expect(
      readFile(path.join(destination, 'media/collected/Footage/shot.mov'), 'utf8'),
    ).resolves.toBe('linked-media');
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly workspace: DesktopWorkspaceResolution;
  readonly bindingPath: string;
  readonly mediaPath: string;
  readonly repositories: LocalMetadataRepositories;
  readonly createReader: (workspacePath: string) => ContentReadService;
  readonly sync: DesktopWorkspaceMediaLibrarySyncService;
  readonly snapshot: DesktopPortableMediaLibrarySnapshotService;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-portable-snapshot-'));
  const home = path.join(root, 'home');
  const workspacePath = path.join(root, 'workspace');
  const mediaRoot = path.join(root, 'external', 'Footage');
  const mediaPath = path.join(mediaRoot, 'shot.mov');
  const globalRoot = path.join(root, 'global-media-libraries');
  await Promise.all([
    mkdir(home, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
    mkdir(mediaRoot, { recursive: true }),
    mkdir(globalRoot, { recursive: true }),
    mkdir(path.join(workspacePath, 'notes'), { recursive: true }),
    mkdir(path.join(workspacePath, 'dist'), { recursive: true }),
    mkdir(path.join(workspacePath, '.neko'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(mediaPath, 'linked-media'),
    writeFile(path.join(workspacePath, 'notes', 'project.txt'), 'project note'),
    writeFile(path.join(workspacePath, 'dist', 'generated.txt'), 'generated'),
    writeFile(path.join(workspacePath, '.neko', 'workspace.json'), '{"workspaceId":"local"}'),
    writeBinding(workspacePath, '2026-08-01T00:00:00.000Z'),
  ]);
  await createWorkspaceLinkedMediaLibrary({
    workspaceRoot: workspacePath,
    name: 'Footage',
    targetDirectory: mediaRoot,
  });

  const store = createNodeSqliteLocalMetadataStore({ homedir: home });
  await store.open({
    databasePath: path.join(home, '.neko', 'neko.db'),
    busyTimeoutMs: 2_000,
  });
  await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await store.migrateNamespace(AGENT_STATE_MIGRATIONS);
  await store.migrateNamespace(MEDIA_METADATA_MIGRATIONS);
  const workspace: DesktopWorkspaceResolution = {
    workspaceId: 'workspace-a',
    workspacePath,
    displayName: 'workspace',
    locator: { kind: 'relative', value: 'workspace' },
  };
  await store.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: workspace.workspaceId },
    locator: workspace.locator,
    seenAt: '2026-08-01T00:00:00.000Z',
  });
  const sync = new DesktopWorkspaceMediaLibrarySyncService(globalRoot, store.repositories);
  const snapshot = new DesktopPortableMediaLibrarySnapshotService({
    metadataRepositories: store.repositories,
    syncService: sync,
  });
  cleanups.push(async () => {
    await store.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    workspace,
    bindingPath: path.join(workspacePath, 'neko/entity-representation-bindings.json'),
    mediaPath,
    repositories: store.repositories,
    createReader: (targetWorkspacePath) => snapshotReader(targetWorkspacePath),
    sync,
    snapshot,
  };
}

async function writeBinding(
  workspacePath: string,
  updatedAt: string,
  locatorPath = 'neko/assets/Footage/shot.mov',
): Promise<void> {
  await mkdir(path.join(workspacePath, 'neko'), { recursive: true });
  await writeFile(
    path.join(workspacePath, 'neko/entity-representation-bindings.json'),
    encodeEntityRepresentationBindingFile({
      version: ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
      bindings: [
        {
          id: 'binding-a',
          entityId: 'character-a',
          entityKind: 'character',
          representation: {
            kind: 'workspace-file',
            path: locatorPath,
          },
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          updatedAt,
        },
      ],
    }),
  );
}

function snapshotReader(workspacePath: string): ContentReadService {
  return createNodeHostContentReadService({
    workspaceRoot: workspacePath,
    defaultMaxBytes: 8 * 1024 * 1024,
  });
}
