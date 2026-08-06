import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectEntityContractError, type ProjectEntityDocument } from '@neko/entity-domain';
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
      projectId: 'project-neko',
      entities: [],
    });
    await expect(readdir(workspacePath)).resolves.toEqual([]);
  });

  it('commits one canonical document through an atomic sibling file', async () => {
    const workspacePath = await createWorkspace();
    const repository = createRepository(workspacePath);
    const next = createDocument('Rin');

    await expect(repository.mutate(() => next)).resolves.toEqual(next);
    await expect(repository.load()).resolves.toEqual(next);
    expect(await readFile(resolveProjectEntityDocumentPath(workspacePath), 'utf8')).toBe(
      `${JSON.stringify(next, null, 2)}\n`,
    );
    expect((await readdir(path.join(workspacePath, 'neko'))).sort()).toEqual(['entities.json']);
  });

  it('serializes concurrent mutations from independent repository instances without losing facts', async () => {
    const workspacePath = await createWorkspace();
    const repository = createRepository(workspacePath);
    const secondRepository = createRepository(workspacePath);
    const results = await Promise.all([
      repository.mutate((current) => ({
        ...current,
        entities: [...current.entities, createRecord('Rin')],
      })),
      secondRepository.mutate((current) => ({
        ...current,
        entities: [...current.entities, createRecord('Mio')],
      })),
    ]);

    expect(results).toHaveLength(2);
    expect((await repository.load()).entities.map((entity) => entity.names.canonical)).toEqual([
      'Rin',
      'Mio',
    ]);
  });

  it('rejects invalid or foreign documents before replacing current facts', async () => {
    const workspacePath = await createWorkspace();
    const repository = createRepository(workspacePath);
    const current = createDocument('Rin');
    await repository.mutate(() => current);

    const foreign: ProjectEntityDocument = {
      ...createDocument('Mio'),
      projectId: 'project-other',
    };
    await expect(repository.mutate(() => foreign)).rejects.toMatchObject({
      diagnostic: { code: 'project-entity-path-unauthorized' },
    });
    await expect(repository.load()).resolves.toEqual(current);
  });

  it('rejects removed fields locally without rewriting bytes or disabling a sibling Workspace', async () => {
    const workspacePath = await createWorkspace();
    const siblingWorkspacePath = await createWorkspace();
    const entityPath = resolveProjectEntityDocumentPath(workspacePath);
    await mkdir(path.dirname(entityPath), { recursive: true });
    const invalidBytes = JSON.stringify({
      ...createDocument('Rin'),
      unexpectedField: 1,
    });
    await writeFile(entityPath, invalidBytes, 'utf8');

    await expect(createRepository(workspacePath).load()).rejects.toBeInstanceOf(
      ProjectEntityContractError,
    );
    await expect(readFile(entityPath, 'utf8')).resolves.toBe(invalidBytes);
    await expect(createRepository(siblingWorkspacePath).load()).resolves.toEqual({
      projectId: 'project-neko',
      entities: [],
    });
  });

  it('reads valid sibling Entities but blocks mutation while preserving an invalid record', async () => {
    const workspacePath = await createWorkspace();
    const entityPath = resolveProjectEntityDocumentPath(workspacePath);
    await mkdir(path.dirname(entityPath), { recursive: true });
    const valid = createRecord('Rin');
    const invalid = { ...createRecord('Mio'), names: { canonical: '', aliases: [] } };
    const invalidBytes = `${JSON.stringify({
      projectId: 'project-neko',
      entities: [valid, invalid],
    })}\n`;
    await writeFile(entityPath, invalidBytes, 'utf8');
    const repository = createRepository(workspacePath);

    await expect(repository.readAvailable()).resolves.toEqual({
      document: { projectId: 'project-neko', entities: [valid] },
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-project-entity-document',
          entityId: invalid.entityId,
        }),
      ],
    });
    await expect(repository.load()).rejects.toBeInstanceOf(ProjectEntityContractError);
    await expect(repository.mutate((current) => current)).rejects.toBeInstanceOf(
      ProjectEntityContractError,
    );
    await expect(readFile(entityPath, 'utf8')).resolves.toBe(invalidBytes);
  });

  it('cancels before publication and leaves no partial document', async () => {
    const workspacePath = await createWorkspace();
    const controller = new AbortController();
    controller.abort('test cancellation');

    await expect(
      createRepository(workspacePath).mutate(() => createDocument('Rin'), controller.signal),
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

function createDocument(name: string): ProjectEntityDocument {
  return {
    projectId: 'project-neko',
    entities: [createRecord(name)],
  };
}

function createRecord(name: string): ProjectEntityDocument['entities'][number] {
  const slug = name.toLocaleLowerCase();
  return {
    entityId: `character-${slug}`,
    kind: 'character',
    names: { canonical: name, aliases: [] },
    facts: {},
    representations: [],
    lifecycle: { state: 'active' },
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
}
