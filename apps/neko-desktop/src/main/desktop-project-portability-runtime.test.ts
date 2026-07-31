import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  ENTITY_REPRESENTATION_BINDING_FILE_VERSION,
  encodeEntityRepresentationBindingFile,
} from '@neko/shared';
import type { LocalMetadataRepositories } from '@neko/shared/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  MEDIA_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { createWorkspaceLinkedMediaLibrary } from '@neko/shared/node/workspace-linked-media-libraries';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
  type DesktopProjectPortabilityIdentity,
  type DesktopProjectPortabilityProgressEvent,
} from '../shared/project-portability-contract';
import { DesktopProjectPortabilityRuntime } from './desktop-project-portability-runtime';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('Desktop project portability runtime', () => {
  it('runs the target-free inspect, plan, execute, and progress path', async () => {
    const fixture = await createFixture();
    let destinationPath: string | undefined;
    const selectDestination = vi.fn(async () => destinationPath);
    const runtime = new DesktopProjectPortabilityRuntime({
      globalMediaLibraryRoot: fixture.globalRoot,
      metadataRepositories: fixture.repositories,
      shell: {
        getProjection: async () => ({ endpointEpoch: 'endpoint-a' }),
        resolveProjectWorkspace: async () => fixture.workspace,
      },
      selectDestination,
    });
    const identity: DesktopProjectPortabilityIdentity = {
      projectId: 'project-a',
      workspaceId: fixture.workspace.workspaceId,
      windowId: 'window-a',
      endpointEpoch: 'endpoint-a',
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

    destinationPath = path.join(fixture.root, 'portable-project');
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
        expectedOperationRevision: planned.plan.operationRevision,
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
        request('inspect-stale', { ...identity, endpointEpoch: 'stale-endpoint' }),
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
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    requestId,
    identity,
  };
}

async function createFixture(): Promise<{
  readonly root: string;
  readonly globalRoot: string;
  readonly workspace: DesktopWorkspaceResolution;
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
    mkdir(globalRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(mediaRoot, 'shot.mov'), 'linked-media'),
    writeBinding(workspacePath),
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
    displayName: 'Project A',
    locator: { kind: 'relative', value: 'workspace' },
  };
  await store.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: workspace.workspaceId },
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
            path: 'neko/assets/Footage/shot.mov',
          },
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    }),
  );
}
