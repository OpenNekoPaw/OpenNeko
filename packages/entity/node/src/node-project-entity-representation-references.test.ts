import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeProjectEntityRepository } from './node-project-entity-repository';
import { NodeProjectEntityRepresentationReferenceService } from './node-project-entity-representation-references';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NodeProjectEntityRepresentationReferenceService', () => {
  it('reads and rewrites canonical representation targets under expected revision', async () => {
    const workspacePath = await createWorkspace();
    await writeCanonicalDocument(workspacePath);
    const service = createService(workspacePath);

    const before = await service.inspect();
    expect(before).toMatchObject({
      documentRevision: 1,
      references: [
        { kind: 'workspace-file', path: 'neko/assets/Library/rin.png' },
        { kind: 'generated-output', outputId: 'output-rin', revision: '1', digest: 'a'.repeat(64) },
      ],
    });

    const after = await service.rewriteWorkspacePaths({
      expectedRevision: 1,
      replacements: new Map([['neko/assets/Library/rin.png', 'media/rin.png']]),
    });
    expect(after).toMatchObject({
      documentRevision: 2,
      references: [
        { kind: 'workspace-file', path: 'media/rin.png' },
        { kind: 'generated-output', outputId: 'output-rin' },
      ],
    });
    expect(after.fingerprint).not.toBe(before.fingerprint);
    await expect(createRepository(workspacePath).load()).resolves.toMatchObject({ revision: 2 });
  });

  it('rejects stale rewrites and never consults a retained legacy binding file', async () => {
    const workspacePath = await createWorkspace();
    await writeCanonicalDocument(workspacePath);
    await writeJson(workspacePath, 'neko/entity-representation-bindings.json', {
      version: 2,
      bindings: [
        {
          id: 'legacy-binding',
          entityId: 'legacy',
          entityKind: 'character',
          representation: { kind: 'workspace-file', path: 'legacy.png' },
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          updatedAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    });
    const service = createService(workspacePath);

    expect(JSON.stringify(await service.inspect())).not.toContain('legacy.png');
    await expect(
      service.rewriteWorkspacePaths({
        expectedRevision: 0,
        replacements: new Map([['neko/assets/Library/rin.png', 'media/rin.png']]),
      }),
    ).rejects.toThrow(/expected revision 0, received 1/u);
    await expect(createRepository(workspacePath).load()).resolves.toMatchObject({ revision: 1 });
  });
});

function createService(workspacePath: string): NodeProjectEntityRepresentationReferenceService {
  return new NodeProjectEntityRepresentationReferenceService({
    workspacePath,
    projectId: 'project-neko',
  });
}

function createRepository(workspacePath: string): NodeProjectEntityRepository {
  return new NodeProjectEntityRepository({ workspacePath, projectId: 'project-neko' });
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-entity-references-'));
  roots.push(root);
  return root;
}

async function writeCanonicalDocument(workspacePath: string): Promise<void> {
  await writeJson(workspacePath, 'neko/entities.json', {
    schemaVersion: 1,
    projectId: 'project-neko',
    revision: 1,
    entities: [
      {
        entityId: 'character-rin',
        kind: 'character',
        names: { canonical: 'Rin', aliases: [] },
        facts: {},
        representations: [
          {
            bindingId: 'workspace-binding',
            role: 'portrait',
            target: { kind: 'workspace-file', path: 'neko/assets/Library/rin.png' },
            source: 'user',
            acceptedAt: '2026-08-05T00:00:00.000Z',
          },
          {
            bindingId: 'generated-binding',
            role: 'reference',
            target: {
              kind: 'generated-output',
              outputId: 'output-rin',
              revision: '1',
              digest: 'a'.repeat(64),
              path: 'generated/rin.png',
            },
            source: 'agent',
            acceptedAt: '2026-08-05T00:00:00.000Z',
          },
        ],
        lifecycle: { state: 'active' },
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    ],
  });
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
