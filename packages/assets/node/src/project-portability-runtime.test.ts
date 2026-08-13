import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { LocalMetadataRepositories } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import {
  initializeAgentStateTables,
  initializeCoreLocalMetadataTables,
  initializeMediaMetadataTables,
} from '@neko/local-metadata/sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DesktopProjectPortabilityIdentity,
  type DesktopProjectPortabilityProgressEvent,
} from '@neko/assets-domain/contracts';
import { ProjectPortabilityRuntime } from './project-portability-runtime';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  confirmProjectMediaLibraryRecovery,
  createProjectMediaLibraryRecoveryPlan,
} from '@neko/assets-domain/contracts';
import {
  createProjectMediaLibraryBindingFingerprint,
  ProjectMediaLibraryBindingRepository,
} from './project-media-library-binding-repository';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('Desktop project portability runtime', () => {
  it('runs the target-free inspect, plan, execute, and progress path', async () => {
    const fixture = await createFixture();
    const destination: { path: string | undefined } = { path: undefined };
    const selectDestination = vi.fn(async () => destination.path);
    const runtime = new ProjectPortabilityRuntime({
      globalMediaLibraryRoot: fixture.globalRoot,
      metadataRepositories: fixture.repositories,
      shell: {
        getProjection: async () => ({ rendererSessionId: 'endpoint-a' }),
        resolveProjectWorkspace: async () => fixture.workspace,
      },
      selectDestination,
    });
    const identity: DesktopProjectPortabilityIdentity = {
      projectId: 'project-a',
      workspaceId: fixture.workspace.workspaceId,
      windowId: 'window-a',
      rendererSessionId: 'endpoint-a',
    };

    const inspection = await runtime.inspect('window-a', request('inspect-a', identity));
    expect(inspection.portability).toMatchObject({
      state: 'linked-ready',
      libraries: [{ libraryName: 'Footage', state: 'available' }],
    });
    expect(JSON.stringify(inspection)).not.toContain(fixture.root);

    await expect(
      runtime.plan('window-a', request('plan-cancelled', identity)),
    ).resolves.toMatchObject({ status: 'cancelled' });

    const destinationPath = path.join(fixture.root, 'portable-project');
    destination.path = destinationPath;
    const planned = await runtime.plan('window-a', request('plan-a', identity));
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') throw new Error('Expected a portable snapshot plan.');
    expect(JSON.stringify(planned)).not.toContain(fixture.root);

    const events: DesktopProjectPortabilityProgressEvent[] = [];
    const result = await runtime.execute(
      'window-a',
      {
        ...request('execute-a', identity),
        snapshotId: planned.plan.snapshotId,
        expectedOperationFingerprint: planned.plan.operationFingerprint,
      },
      (event) => events.push(event),
    );

    expect(result).toMatchObject({
      status: 'completed',
      snapshotId: planned.plan.snapshotId,
      identity,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
    expect(JSON.stringify(events)).not.toContain(fixture.root);
    await expect(
      readFile(path.join(destinationPath, 'media/collected/Footage/shot.mov'), 'utf8'),
    ).resolves.toBe('linked-media');
    await expect(
      runtime.inspect('window-a', request('inspect-complete', identity)),
    ).resolves.toMatchObject({
      portability: { state: 'portable-snapshot-ready' },
    });

    await expect(
      runtime.inspect(
        'window-a',
        request('inspect-stale', { ...identity, rendererSessionId: 'stale-endpoint' }),
      ),
    ).rejects.toThrow('Project portability project identity is stale.');
    expect(selectDestination).toHaveBeenCalledWith({
      windowId: 'window-a',
      projectDisplayName: fixture.workspace.displayName,
    });
  });
});

function request(requestId: string, identity: DesktopProjectPortabilityIdentity) {
  return {
    requestId,
    identity,
  };
}

async function createFixture(): Promise<{
  readonly root: string;
  readonly globalRoot: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly repositories: LocalMetadataRepositories;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-portability-runtime-'));
  const home = path.join(root, 'home');
  const workspacePath = path.join(root, 'workspace');
  const mediaRoot = path.join(root, 'external', 'Footage');
  const globalRoot = path.join(root, 'global-media-libraries');
  await Promise.all([
    mkdir(home, { recursive: true }),
    mkdir(workspacePath, { recursive: true }),
    mkdir(mediaRoot, { recursive: true }),
    mkdir(path.join(globalRoot, 'local'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(mediaRoot, 'shot.mov'), 'linked-media'),
    writeBinding(workspacePath),
  ]);
  await mkdir(path.join(workspacePath, 'neko', 'assets'), { recursive: true });
  await symlink(
    mediaRoot,
    path.join(workspacePath, 'neko', 'assets', 'Footage'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await symlink(
    mediaRoot,
    path.join(globalRoot, 'local', 'Footage'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const connectionId = 'media-library:local:Footage';
  const replacementBindingFingerprint = createProjectMediaLibraryBindingFingerprint({
    projectId: 'project-a',
    libraryName: 'Footage',
    connectionId,
  });
  await new ProjectMediaLibraryBindingRepository(workspacePath, 'project-a').applyRecovery(
    confirmProjectMediaLibraryRecovery(
      createProjectMediaLibraryRecoveryPlan({
        projectId: 'project-a',
        libraryName: 'Footage',
        connectionId,
        requirementFingerprint: 'sha256:portability-fixture-1234',
        validatedRelativePaths: ['shot.mov'],
        expectedBindingFingerprint: null,
        replacementBindingFingerprint,
      }),
    ),
  );

  const store = createNodeSqliteLocalMetadataStore({ homedir: home });
  await store.open({
    databasePath: path.join(home, '.neko', 'neko.db'),
    busyTimeoutMs: 2_000,
  });
  await initializeCoreLocalMetadataTables(store);
  await initializeAgentStateTables(store);
  await initializeMediaMetadataTables(store);
  const workspace: AssetWorkspaceResolution = {
    workspaceId: 'workspace-a',
    workspacePath,
    displayName: 'Project A',
    locator: { kind: 'relative', value: 'workspace' },
  };
  await store.repositories.workspaces.bind({
    identity: { workspaceId: workspace.workspaceId },
    locator: workspace.locator,
    seenAt: '2026-08-01T00:00:00.000Z',
  });
  cleanups.push(async () => {
    await store.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return {
    root,
    globalRoot,
    workspace,
    repositories: store.repositories,
  };
}

async function writeBinding(workspacePath: string): Promise<void> {
  await mkdir(path.join(workspacePath, 'neko'), { recursive: true });
  await writeFile(
    path.join(workspacePath, 'neko/entities.json'),
    `${JSON.stringify(
      {
        projectId: 'project-a',
        entities: [
          {
            entityId: 'character-a',
            kind: 'character',
            names: { canonical: 'Character A', aliases: [] },
            representations: [
              {
                bindingId: 'binding-a',
                target: {
                  kind: 'media-library',
                  libraryName: 'Footage',
                  relativePath: 'shot.mov',
                },
                role: 'portrait',
                source: 'user',
                acceptedAt: '2026-08-01T00:00:00.000Z',
              },
            ],
            lifecycle: { state: 'active' },
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}
