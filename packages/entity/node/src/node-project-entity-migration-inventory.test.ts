import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION } from '@neko/entity-domain';
import {
  NodeProjectEntityMigrationInventory,
  PROJECT_ENTITY_MIGRATION_ARCHIVE_DIRECTORY,
} from './node-project-entity-migration-inventory';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NodeProjectEntityMigrationInventory', () => {
  it('inventories every known absent source without creating Workspace data', async () => {
    const workspacePath = await createWorkspace();
    const inventory = await createInventory(workspacePath).inspect();

    expect(inventory).toMatchObject({
      schemaVersion: 1,
      projectId: 'project-neko',
      plan: {
        expectedProjectRevision: 0,
        blockers: [],
      },
    });
    expect(inventory.sources).toHaveLength(9);
    expect(inventory.sources.every((source) => source.schemaStatus === 'absent')).toBe(true);
    expect(inventory.plan.expectedSources).toEqual(
      inventory.sources.map((source) => ({
        sourceId: source.sourceId,
        relativePath: source.relativePath,
        expectedSchemaStatus: 'absent',
        expectedDigest: null,
      })),
    );
    await expect(access(path.join(workspacePath, 'neko'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('classifies accepted facts, workflow fields, projections, and unknown fields explicitly', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'characters.json', {
      version: 1,
      characters: [
        {
          id: 'character-rin',
          canonicalName: 'Rin',
          aliases: ['Lin'],
          status: 'confirmed',
          metadata: { role: 'lead' },
          futureAuthority: 'must-not-be-guessed',
        },
      ],
    });
    await writeJson(workspacePath, 'neko/entities/candidates.json', {
      version: 1,
      candidates: [
        {
          id: 'candidate-rin',
          kind: 'character',
          name: 'Rin',
          status: 'open',
          identityBasis: 'user-named',
          provenance: [],
          sourceRefs: [],
        },
      ],
    });
    await writeJson(workspacePath, 'neko/entity-representation-bindings.json', {
      version: 2,
      bindings: [
        {
          id: 'binding-rin',
          entityId: 'character-rin',
          entityKind: 'character',
          representation: {
            kind: 'workspace-file',
            path: 'assets/rin.png',
          },
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    });

    const inventory = await createInventory(workspacePath).inspect();
    const characters = requireSource(inventory, 'character-registry');
    const candidates = requireSource(inventory, 'candidate-registry');
    const bindings = requireSource(inventory, 'representation-bindings');

    expect(characters.schemaStatus).toBe('valid');
    expect(characters.classifications).toContainEqual(
      expect.objectContaining({
        jsonPointer: '/characters/0/canonicalName',
        disposition: 'canonical-fact',
      }),
    );
    expect(characters.classifications).toContainEqual(
      expect.objectContaining({
        jsonPointer: '/characters/0/futureAuthority',
        disposition: 'unresolved-archive',
      }),
    );
    expect(characters.ambiguities).toContainEqual(
      expect.objectContaining({
        jsonPointer: '/characters/0/futureAuthority',
        code: 'unknown-field',
      }),
    );
    expect(candidates.classifications).toContainEqual(
      expect.objectContaining({
        jsonPointer: '/candidates/0/name',
        disposition: 'rebuildable-projection',
      }),
    );
    expect(candidates.classifications).toContainEqual(
      expect.objectContaining({
        jsonPointer: '/candidates/0/status',
        disposition: 'workflow-state',
      }),
    );
    expect(bindings.classifications).toContainEqual(
      expect.objectContaining({
        jsonPointer: '/bindings/0/representation',
        disposition: 'canonical-binding',
      }),
    );
    expect(bindings.classifications).toContainEqual(
      expect.objectContaining({
        jsonPointer: '/bindings/0/availability',
        disposition: 'rebuildable-projection',
      }),
    );
    expect(inventory.plan.blockers).toEqual(characters.ambiguities);
  });

  it('preserves malformed and unsupported sources as blocking inventory entries', async () => {
    const workspacePath = await createWorkspace();
    await writeSource(workspacePath, 'characters.json', Buffer.from('{', 'utf8'));
    await writeJson(workspacePath, 'neko/entities/scenes.json', {
      version: 9,
      kind: 'scene',
      entities: [],
    });

    const inventory = await createInventory(workspacePath).inspect();

    expect(requireSource(inventory, 'character-registry')).toMatchObject({
      schemaStatus: 'invalid-json',
      byteLength: 1,
      ambiguities: [{ code: 'invalid-source', jsonPointer: '' }],
    });
    expect(requireSource(inventory, 'scene-registry')).toMatchObject({
      schemaStatus: 'unsupported-version',
      ambiguities: [expect.objectContaining({ code: 'invalid-source' })],
    });
    expect(inventory.plan.blockers).toHaveLength(2);
  });

  it('archives exact source bytes atomically without removing or overwriting legacy files', async () => {
    const workspacePath = await createWorkspace();
    const characters = Buffer.from(
      `${JSON.stringify({ version: 1, characters: [] }, null, 2)}\n`,
      'utf8',
    );
    await writeSource(workspacePath, 'characters.json', characters);
    const service = createInventory(workspacePath);
    const inventory = await service.inspect();

    const result = await service.archive(inventory);
    const archivedSource = path.join(workspacePath, result.relativePath, 'sources/characters.json');
    const manifestPath = path.join(workspacePath, result.relativePath, 'manifest.json');

    expect(await readFile(archivedSource)).toEqual(characters);
    expect(await readFile(path.join(workspacePath, 'characters.json'))).toEqual(characters);
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(result.manifest);
    expect(
      result.manifest.sources.find((source) => source.sourceId === 'character-registry'),
    ).toEqual({
      sourceId: 'character-registry',
      relativePath: 'characters.json',
      expectedSchemaStatus: 'valid',
      expectedDigest: sha256(characters),
    });
    await expect(service.archive(inventory)).rejects.toMatchObject({
      code: 'project-entity-migration-archive-exists',
    });
  });

  it('rejects source or canonical revision races before creating an archive', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'characters.json', { version: 1, characters: [] });
    const repository = createRepository(workspacePath);
    const service = createInventory(workspacePath, repository);
    const sourceInventory = await service.inspect();
    await writeJson(workspacePath, 'characters.json', {
      version: 1,
      characters: [
        {
          id: 'character-rin',
          canonicalName: 'Rin',
          aliases: [],
          status: 'confirmed',
        },
      ],
    });

    await expect(service.archive(sourceInventory)).rejects.toMatchObject({
      code: 'project-entity-migration-source-changed',
    });

    const revisionInventory = await service.inspect();
    await repository.commit({
      expectedRevision: 0,
      next: {
        schemaVersion: PROJECT_ENTITY_DOCUMENT_SCHEMA_VERSION,
        projectId: 'project-neko',
        revision: 1,
        entities: [],
      },
    });
    await expect(service.archive(revisionInventory)).rejects.toMatchObject({
      code: 'project-entity-migration-source-changed',
    });
    await expect(
      access(path.join(workspacePath, PROJECT_ENTITY_MIGRATION_ARCHIVE_DIRECTORY)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails visibly for cancellation and a legacy source symlink escaping the Workspace', async () => {
    const workspacePath = await createWorkspace();
    const controller = new AbortController();
    controller.abort('cancel inventory');

    await expect(createInventory(workspacePath).inspect(controller.signal)).rejects.toMatchObject({
      code: 'project-entity-migration-cancelled',
    });

    const outsidePath = await createWorkspace();
    await writeJson(outsidePath, 'characters.json', { version: 1, characters: [] });
    await symlink(
      path.join(outsidePath, 'characters.json'),
      path.join(workspacePath, 'characters.json'),
      'file',
    );
    await expect(createInventory(workspacePath).inspect()).rejects.toMatchObject({
      code: 'project-entity-migration-path-unauthorized',
    });
  });
});

function createRepository(workspacePath: string): NodeProjectEntityRepository {
  return new NodeProjectEntityRepository({ workspacePath, projectId: 'project-neko' });
}

function createInventory(
  workspacePath: string,
  repository = createRepository(workspacePath),
): NodeProjectEntityMigrationInventory {
  return new NodeProjectEntityMigrationInventory({
    workspacePath,
    projectId: 'project-neko',
    repository,
    now: () => new Date('2026-08-05T00:00:00.000Z'),
  });
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-entity-migration-'));
  roots.push(root);
  return root;
}

async function writeJson(
  workspacePath: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  await writeSource(
    workspacePath,
    relativePath,
    Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'),
  );
}

async function writeSource(
  workspacePath: string,
  relativePath: string,
  bytes: Buffer,
): Promise<void> {
  const target = path.join(workspacePath, ...relativePath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

function requireSource(
  inventory: Awaited<ReturnType<NodeProjectEntityMigrationInventory['inspect']>>,
  sourceId: string,
) {
  const source = inventory.sources.find((candidate) => candidate.sourceId === sourceId);
  if (!source) throw new Error(`Missing migration source '${sourceId}'.`);
  return source;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
