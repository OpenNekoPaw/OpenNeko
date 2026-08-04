import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
  ProjectEntityContractError,
  type ProjectEntityDocument,
} from '@neko/entity-domain';
import {
  NodeProjectEntityRepository,
  NodeProjectEntityRepositoryError,
  resolveProjectEntityDocumentPath,
} from './node-project-entity-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NodeProjectEntityRepository', () => {
  it('loads an absent canonical document as an empty Project-owned snapshot', async () => {
    const workspacePath = await createWorkspace();
    const repository = createRepository(workspacePath);

    await expect(repository.load()).resolves.toEqual({
      schemaVersion: PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
      projectId: 'project-neko',
      revision: 0,
      entities: [],
    });
    await expect(readdir(workspacePath)).resolves.toEqual([]);
  });

  it('commits one canonical document through an atomic sibling file', async () => {
    const workspacePath = await createWorkspace();
    const repository = createRepository(workspacePath);
    const next = createDocument(1, 'Rin');

    await expect(repository.commit({ expectedRevision: 0, next })).resolves.toEqual(next);
    await expect(repository.load()).resolves.toEqual(next);
    expect(await readFile(resolveProjectEntityDocumentPath(workspacePath), 'utf8')).toBe(
      `${JSON.stringify(next, null, 2)}\n`,
    );
    expect((await readdir(path.join(workspacePath, 'neko'))).sort()).toEqual(['entities.json']);
  });

  it('rejects stale concurrent revisions without overwriting the committed document', async () => {
    const workspacePath = await createWorkspace();
    const repository = createRepository(workspacePath);
    const secondRepository = createRepository(workspacePath);
    const rin = createDocument(1, 'Rin');
    const mio = createDocument(1, 'Mio');

    const results = await Promise.allSettled([
      repository.commit({ expectedRevision: 0, next: rin }),
      secondRepository.commit({ expectedRevision: 0, next: mio }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: {
        diagnostics: [{ code: 'project-entity-revision-conflict' }],
      },
    });
    expect((await repository.load()).revision).toBe(1);
  });

  it('rejects invalid or foreign documents before replacing current facts', async () => {
    const workspacePath = await createWorkspace();
    const repository = createRepository(workspacePath);
    const current = createDocument(1, 'Rin');
    await repository.commit({ expectedRevision: 0, next: current });

    const foreign: ProjectEntityDocument = {
      ...createDocument(2, 'Mio'),
      projectId: 'project-other',
    };
    await expect(repository.commit({ expectedRevision: 1, next: foreign })).rejects.toMatchObject({
      diagnostic: { code: 'project-entity-path-unauthorized' },
    });
    await expect(repository.load()).resolves.toEqual(current);
  });

  it('fails visibly for malformed JSON and unsupported schema versions', async () => {
    const workspacePath = await createWorkspace();
    const entityPath = resolveProjectEntityDocumentPath(workspacePath);
    await mkdir(path.dirname(entityPath), { recursive: true });
    await writeFile(entityPath, '{', 'utf8');

    await expect(createRepository(workspacePath).load()).rejects.toMatchObject({
      diagnostic: { code: 'project-entity-io-failed' },
    });

    await writeFile(entityPath, JSON.stringify({ ...createDocument(1, 'Rin'), schemaVersion: 2 }));
    await expect(createRepository(workspacePath).load()).rejects.toBeInstanceOf(
      ProjectEntityContractError,
    );
  });

  it('cancels before publication and leaves no partial document', async () => {
    const workspacePath = await createWorkspace();
    const controller = new AbortController();
    controller.abort('test cancellation');

    await expect(
      createRepository(workspacePath).commit(
        { expectedRevision: 0, next: createDocument(1, 'Rin') },
        controller.signal,
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: 'project-entity-operation-cancelled' },
    });
    await expect(
      readFile(resolveProjectEntityDocumentPath(workspacePath), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a symlinked canonical directory that escapes the Workspace', async () => {
    const workspacePath = await createWorkspace();
    const outsidePath = await createWorkspace();
    await symlink(outsidePath, path.join(workspacePath, 'neko'), 'dir');

    await expect(createRepository(workspacePath).load()).rejects.toMatchObject({
      diagnostic: { code: 'project-entity-path-unauthorized' },
    });
    await expect(readdir(outsidePath)).resolves.toEqual([]);
  });

  it('requires an existing authorized Workspace and a stable Project identity', async () => {
    const missingWorkspace = path.join(await createWorkspace(), 'missing');
    await expect(createRepository(missingWorkspace).load()).rejects.toBeInstanceOf(
      NodeProjectEntityRepositoryError,
    );
    expect(
      () =>
        new NodeProjectEntityRepository({
          workspacePath: path.dirname(missingWorkspace),
          projectId: '/Users/example/project',
        }),
    ).toThrowError(NodeProjectEntityRepositoryError);
  });
});

function createRepository(workspacePath: string): NodeProjectEntityRepository {
  return new NodeProjectEntityRepository({ workspacePath, projectId: 'project-neko' });
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-entity-'));
  roots.push(root);
  return root;
}

function createDocument(revision: number, name: string): ProjectEntityDocument {
  const slug = name.toLocaleLowerCase();
  return {
    schemaVersion: PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
    projectId: 'project-neko',
    revision,
    entities: [
      {
        entityId: `character-${slug}`,
        kind: 'character',
        names: { canonical: name, aliases: [] },
        facts: {},
        representations: [],
        lifecycle: { state: 'active' },
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    ],
  };
}
