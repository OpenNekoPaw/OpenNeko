import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import {
  resolveNodeWorkspaceIdentity,
  type NodeWorkspaceIdentityResolution,
} from '../node-workspace-identity';
import { initializeCoreLocalMetadataTables } from '../sqlite';
import {
  parseWorkspaceIdentityJson,
  resolveGlobalStorageLayout,
  WORKSPACE_IDENTITY_RELATIVE_PATH,
} from '../storage';
import type { LocalMetadataStore } from '../contracts';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';
const NOW = '2026-08-06T12:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('canonical Workspace identity', () => {
  it('creates neko/project.json and preserves unrelated project facts', async () => {
    const fixture = await createFixture('create');
    const unknownFactPath = join(fixture.workspaceRoot, 'neko', 'unknown.json');
    await mkdir(join(fixture.workspaceRoot, 'neko'), { recursive: true });
    await writeFile(unknownFactPath, '{"owner":"user"}\n', 'utf8');

    const resolution = await resolve(fixture);

    expect(resolution).toMatchObject({
      kind: 'created',
      identity: { workspaceId: WORKSPACE_ID },
      workspace: { currentLocator: { value: '${HOME}/workspace' } },
    });
    expect(await readIdentity(fixture.workspaceRoot)).toEqual({ workspaceId: WORKSPACE_ID });
    expect(await readFile(unknownFactPath, 'utf8')).toBe('{"owner":"user"}\n');
    await fixture.store.dispose();
  });

  it('rebinds a moved project by the identity carried with its project facts', async () => {
    const fixture = await createFixture('move');
    await resolve(fixture);
    const movedRoot = join(fixture.homedir, 'workspace-moved');
    await rename(fixture.workspaceRoot, movedRoot);

    await expect(
      resolveNodeWorkspaceIdentity({
        workspaceRoot: movedRoot,
        homedir: fixture.homedir,
        metadataStore: fixture.store,
        now: () => NOW,
      }),
    ).resolves.toMatchObject({
      kind: 'moved',
      identity: { workspaceId: WORKSPACE_ID },
      workspace: {
        currentLocator: { value: '${HOME}/workspace-moved' },
        locatorHistory: [{ value: '${HOME}/workspace' }, { value: '${HOME}/workspace-moved' }],
      },
    });
    await fixture.store.dispose();
  });

  it('rejects a copied project while the original identity locator remains live', async () => {
    const fixture = await createFixture('copy');
    await resolve(fixture);
    const copyRoot = join(fixture.homedir, 'workspace-copy');
    await cp(fixture.workspaceRoot, copyRoot, { recursive: true });

    await expect(
      resolveNodeWorkspaceIdentity({
        workspaceRoot: copyRoot,
        homedir: fixture.homedir,
        metadataStore: fixture.store,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({
      code: 'duplicate-workspace-identity',
      message: expect.stringContaining('copied checkout'),
    });
    await fixture.store.dispose();
  });

  it('registers the project fact again after the user database is lost', async () => {
    const fixture = await createFixture('database-loss');
    await resolve(fixture);
    await fixture.store.dispose();
    const databasePath = resolveGlobalStorageLayout(fixture.homedir).database;
    await Promise.all([
      rm(databasePath, { force: true }),
      rm(`${databasePath}-wal`, { force: true }),
      rm(`${databasePath}-shm`, { force: true }),
    ]);
    const rebuiltStore = await createStore(fixture.homedir);

    await expect(
      resolveNodeWorkspaceIdentity({
        workspaceRoot: fixture.workspaceRoot,
        homedir: fixture.homedir,
        metadataStore: rebuiltStore,
        now: () => NOW,
      }),
    ).resolves.toMatchObject({
      kind: 'registered',
      identity: { workspaceId: WORKSPACE_ID },
    });
    await rebuiltStore.dispose();
  });

  it('keeps a missing project identity visible as an exact failure without regenerating it', async () => {
    const fixture = await createFixture('missing-fact');
    await resolve(fixture);
    const identityPath = join(fixture.workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH);
    await rm(identityPath);

    await expect(resolve(fixture)).rejects.toMatchObject({
      code: 'invalid-workspace-identity',
      message: expect.stringContaining('Project identity is missing'),
    });
    await expect(readFile(identityPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fixture.store.repositories.workspaces.get(WORKSPACE_ID)).resolves.toMatchObject({
      workspaceId: WORKSPACE_ID,
      currentLocator: { value: '${HOME}/workspace' },
    });
    await fixture.store.dispose();
  });
});

async function createFixture(label: string): Promise<{
  readonly homedir: string;
  readonly workspaceRoot: string;
  readonly store: LocalMetadataStore;
}> {
  const homedir = await mkdtemp(join(tmpdir(), `neko-project-identity-${label}-`));
  roots.push(homedir);
  const workspaceRoot = join(homedir, 'workspace');
  await mkdir(workspaceRoot, { recursive: true });
  return { homedir, workspaceRoot, store: await createStore(homedir) };
}

async function createStore(homedir: string): Promise<LocalMetadataStore> {
  const store = createNodeSqliteLocalMetadataStore({ homedir });
  await store.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 1_000,
  });
  await initializeCoreLocalMetadataTables(store);
  return store;
}

function resolve(fixture: {
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly store: LocalMetadataStore;
}): Promise<NodeWorkspaceIdentityResolution> {
  return resolveNodeWorkspaceIdentity({
    ...fixture,
    metadataStore: fixture.store,
    createWorkspaceId: () => WORKSPACE_ID,
    now: () => NOW,
  });
}

async function readIdentity(workspaceRoot: string) {
  return parseWorkspaceIdentityJson(
    await readFile(join(workspaceRoot, WORKSPACE_IDENTITY_RELATIVE_PATH), 'utf8'),
  );
}
