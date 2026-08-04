import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectEntityDocumentRepository } from '@neko/entity-domain';
import {
  NodeProjectEntityMigrationInventory,
  type ProjectEntityMigrationInventory,
} from './node-project-entity-migration-inventory';
import {
  NodeProjectEntityMigration,
  type ProjectEntityMigrationCandidateProjectionRequest,
  type ProjectEntityMigrationCandidateProjectionWriter,
} from './node-project-entity-migration';
import {
  NodeProjectEntityRepository,
  resolveProjectEntityDocumentPath,
} from './node-project-entity-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NodeProjectEntityMigration', () => {
  it('commits confirmed facts and bindings, rebuilds candidates, then retires legacy sources', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'characters.json', {
      version: 1,
      characters: [
        {
          id: 'character-rin',
          canonicalName: 'Rin',
          displayName: 'Rin Akiyama',
          aliases: ['Lin'],
          status: 'confirmed',
          metadata: { role: 'lead', age: 18 },
        },
      ],
    });
    await writeJson(workspacePath, 'neko/entities/scenes.json', {
      version: 1,
      kind: 'scene',
      entities: [
        {
          id: 'scene-station',
          kind: 'scene',
          canonicalName: 'Station',
          aliases: [],
          status: 'deprecated',
          metadata: { weather: 'rain' },
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
          representation: { kind: 'workspace-file', path: 'portraits/rin.png' },
          role: 'portrait',
          isDefault: true,
          status: 'confirmed',
          availability: 'active',
          source: 'story',
          updatedAt: '2026-08-04T10:00:00.000Z',
        },
        {
          id: 'suggested-rin',
          entityId: 'character-rin',
          entityKind: 'character',
          representation: { kind: 'workspace-file', path: 'portraits/suggested.png' },
          role: 'reference',
          status: 'suggested',
          availability: 'active',
          source: 'matcher',
          updatedAt: '2026-08-04T10:00:00.000Z',
        },
      ],
    });
    await writeJson(workspacePath, 'neko/entities/candidates.json', {
      version: 1,
      candidates: [
        {
          id: 'candidate-mio',
          kind: 'character',
          name: 'Mio',
          aliases: ['Mimi'],
          status: 'open',
          identityBasis: 'user-named',
          confidence: 0.8,
          provenance: [
            {
              providerId: 'story-analyzer',
              sourceKind: 'document',
              sourceRef: 'document:chapter-1',
              label: 'Chapter 1',
              confidence: 0.75,
            },
          ],
          sourceRefs: ['document:chapter-1'],
        },
        {
          id: 'candidate-dismissed',
          kind: 'object',
          name: 'Cup',
          status: 'dismissed',
          identityBasis: 'visual',
          provenance: [],
          sourceRefs: [],
        },
      ],
    });
    const repository = createRepository(workspacePath);
    const inventoryService = createInventoryService(workspacePath, repository);
    const inventory = await inventoryService.inspect();
    expect(inventory.plan.blockers).toEqual([]);
    await inventoryService.archive(inventory);
    const projectionRequests: ProjectEntityMigrationCandidateProjectionRequest[] = [];
    const writer = projectionWriter(async (request) => {
      projectionRequests.push(request);
      return {
        projectedCandidateIds: request.candidates.map((candidate) => candidate.candidateId),
      };
    });

    const result = await createMigration(workspacePath, repository, inventoryService, writer).apply(
      inventory,
    );

    expect(result.document).toEqual(await repository.load());
    expect(result.document).toMatchObject({
      projectId: 'project-neko',
      revision: 1,
      entities: [
        {
          entityId: 'character-rin',
          kind: 'character',
          names: { canonical: 'Rin', display: 'Rin Akiyama', aliases: ['Lin'] },
          facts: { role: 'lead', age: 18 },
          representations: [
            {
              bindingId: 'binding-rin',
              role: 'portrait',
              source: 'migration',
              isDefault: true,
              acceptedAt: '2026-08-04T10:00:00.000Z',
            },
          ],
          lifecycle: { state: 'active' },
        },
        {
          entityId: 'scene-station',
          kind: 'scene',
          lifecycle: { state: 'deprecated', deprecatedAt: '2026-08-05T00:00:00.000Z' },
        },
      ],
    });
    expect(projectionRequests).toEqual([
      expect.objectContaining({
        projectId: 'project-neko',
        expectedProjectRevision: 0,
        candidates: [
          expect.objectContaining({
            candidateId: 'candidate-mio',
            freshness: 'stale',
            proposedNames: { canonical: 'Mio', aliases: ['Mimi'] },
            evidence: [
              expect.objectContaining({
                owner: 'document',
                sourceId: 'document:chapter-1',
              }),
            ],
          }),
        ],
      }),
    ]);
    expect([...result.retiredSourcePaths].sort()).toEqual([
      'characters.json',
      'neko/entities/candidates.json',
      'neko/entities/scenes.json',
      'neko/entity-representation-bindings.json',
    ]);
    for (const relativePath of result.retiredSourcePaths) {
      await expect(access(path.join(workspacePath, relativePath))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(
        access(path.join(workspacePath, result.archiveRelativePath, 'sources', relativePath)),
      ).resolves.toBeUndefined();
    }
  });

  it('rejects unresolved inventory without projecting, committing, or retiring sources', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'characters.json', {
      version: 1,
      characters: [
        {
          id: 'candidate-rin',
          canonicalName: 'Rin',
          aliases: [],
          status: 'candidate',
        },
      ],
    });
    const repository = createRepository(workspacePath);
    const inventoryService = createInventoryService(workspacePath, repository);
    const inventory = await inventoryService.inspect();
    await inventoryService.archive(inventory);
    const replaceLegacyCandidates = vi.fn();

    await expect(
      createMigration(workspacePath, repository, inventoryService, {
        replaceLegacyCandidates,
      }).apply(inventory),
    ).rejects.toMatchObject({
      code: 'project-entity-migration-blocked',
      canonicalCommitted: false,
    });
    expect(replaceLegacyCandidates).not.toHaveBeenCalled();
    await expect(access(resolveProjectEntityDocumentPath(workspacePath))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(path.join(workspacePath, 'characters.json'))).resolves.toBeUndefined();
  });

  it('does not commit or retire when candidate projection rebuilding fails', async () => {
    const { workspacePath, repository, inventoryService, inventory } = await preparedMigration();
    const writer = projectionWriter(async () => {
      throw new Error('projection unavailable');
    });

    await expect(
      createMigration(workspacePath, repository, inventoryService, writer).apply(inventory),
    ).rejects.toMatchObject({
      code: 'project-entity-migration-projection-failed',
      canonicalCommitted: false,
    });
    await expect(access(resolveProjectEntityDocumentPath(workspacePath))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(path.join(workspacePath, 'characters.json'))).resolves.toBeUndefined();
  });

  it('rejects live source changes after archive and leaves canonical facts absent', async () => {
    const { workspacePath, repository, inventoryService, inventory } = await preparedMigration();
    await writeJson(workspacePath, 'characters.json', {
      version: 1,
      characters: [
        {
          id: 'character-mio',
          canonicalName: 'Mio',
          aliases: [],
          status: 'confirmed',
        },
      ],
    });

    await expect(
      createMigration(
        workspacePath,
        repository,
        inventoryService,
        successfulProjectionWriter(),
      ).apply(inventory),
    ).rejects.toMatchObject({ code: 'project-entity-migration-source-changed' });
    await expect(access(resolveProjectEntityDocumentPath(workspacePath))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('reports a post-commit retirement race without hiding the committed canonical document', async () => {
    const workspacePath = await createWorkspace();
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
    const canonicalRepository = createRepository(workspacePath);
    const racingRepository: ProjectEntityDocumentRepository = {
      load: (signal) => canonicalRepository.load(signal),
      commit: async (request, signal) => {
        const committed = await canonicalRepository.commit(request, signal);
        await writeJson(workspacePath, 'characters.json', {
          version: 1,
          characters: [
            {
              id: 'character-changed-after-commit',
              canonicalName: 'Changed',
              aliases: [],
              status: 'confirmed',
            },
          ],
        });
        return committed;
      },
    };
    const inventoryService = createInventoryService(workspacePath, racingRepository);
    const inventory = await inventoryService.inspect();
    await inventoryService.archive(inventory);

    await expect(
      createMigration(
        workspacePath,
        racingRepository,
        inventoryService,
        successfulProjectionWriter(),
      ).apply(inventory),
    ).rejects.toMatchObject({
      code: 'project-entity-migration-retirement-failed',
      canonicalCommitted: true,
    });
    await expect(canonicalRepository.load()).resolves.toMatchObject({ revision: 1 });
    await expect(access(path.join(workspacePath, 'characters.json'))).resolves.toBeUndefined();
  });
});

async function preparedMigration(): Promise<{
  workspacePath: string;
  repository: NodeProjectEntityRepository;
  inventoryService: NodeProjectEntityMigrationInventory;
  inventory: ProjectEntityMigrationInventory;
}> {
  const workspacePath = await createWorkspace();
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
  const repository = createRepository(workspacePath);
  const inventoryService = createInventoryService(workspacePath, repository);
  const inventory = await inventoryService.inspect();
  await inventoryService.archive(inventory);
  return { workspacePath, repository, inventoryService, inventory };
}

function createRepository(workspacePath: string): NodeProjectEntityRepository {
  return new NodeProjectEntityRepository({ workspacePath, projectId: 'project-neko' });
}

function createInventoryService(
  workspacePath: string,
  repository: ProjectEntityDocumentRepository,
): NodeProjectEntityMigrationInventory {
  return new NodeProjectEntityMigrationInventory({
    workspacePath,
    projectId: 'project-neko',
    repository,
    now: () => new Date('2026-08-05T00:00:00.000Z'),
  });
}

function createMigration(
  workspacePath: string,
  repository: ProjectEntityDocumentRepository,
  inventory: NodeProjectEntityMigrationInventory,
  candidateProjectionWriter: ProjectEntityMigrationCandidateProjectionWriter,
): NodeProjectEntityMigration {
  return new NodeProjectEntityMigration({
    workspacePath,
    projectId: 'project-neko',
    repository,
    inventory,
    candidateProjectionWriter,
  });
}

function successfulProjectionWriter(): ProjectEntityMigrationCandidateProjectionWriter {
  return projectionWriter(async (request) => ({
    projectedCandidateIds: request.candidates.map((candidate) => candidate.candidateId),
  }));
}

function projectionWriter(
  replaceLegacyCandidates: ProjectEntityMigrationCandidateProjectionWriter['replaceLegacyCandidates'],
): ProjectEntityMigrationCandidateProjectionWriter {
  return { replaceLegacyCandidates };
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-entity-apply-'));
  roots.push(root);
  return root;
}

async function writeJson(
  workspacePath: string,
  relativePath: string,
  value: unknown,
): Promise<void> {
  const target = path.join(workspacePath, ...relativePath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
