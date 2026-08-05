import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readProjectEntityManagementResources,
  readProjectEntityResources,
} from './project-entity-resources';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('readProjectEntityResources', () => {
  it('reads only active canonical records and never succeeds through legacy files', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'characters.json', {
      version: 1,
      characters: [
        {
          id: 'legacy-character',
          canonicalName: 'Legacy',
          aliases: [],
          status: 'confirmed',
        },
      ],
    });

    await expect(
      readProjectEntityResources({
        workspace: { workspaceId: 'project-neko', workspacePath },
      }),
    ).resolves.toEqual({ entities: [], diagnostics: [] });

    await writeJson(workspacePath, 'neko/entities.json', {
      projectId: 'project-neko',
      entities: [
        entity('canonical-character', 'Canonical', { state: 'active' }),
        entity('deprecated-character', 'Deprecated', {
          state: 'deprecated',
          deprecatedAt: '2026-08-05T00:00:00.000Z',
        }),
      ],
    });

    const result = await readProjectEntityResources({
      workspace: { workspaceId: 'project-neko', workspacePath },
    });
    expect(result.entities.map((record) => record.entityId)).toEqual(['canonical-character']);
    expect(JSON.stringify(result)).not.toContain('legacy-character');
  });

  it('projects valid sibling records with an exact diagnostic for an invalid Entity', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'neko/entities.json', {
      projectId: 'project-neko',
      entities: [
        entity('canonical-character', 'Canonical', { state: 'active' }),
        {
          ...entity('invalid-character', 'Invalid', { state: 'active' }),
          names: { canonical: '', aliases: [] },
        },
      ],
    });

    await expect(
      readProjectEntityManagementResources({
        workspace: { workspaceId: 'project-neko', workspacePath },
      }),
    ).resolves.toMatchObject({
      projections: [
        expect.objectContaining({
          projectionId: 'entity:canonical-character',
          status: 'confirmed',
        }),
      ],
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-project-entity-document',
          entityId: 'invalid-character',
        }),
      ],
    });
  });

  it('fails visibly when canonical data belongs to another Project identity', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'neko/entities.json', {
      projectId: 'project-other',
      entities: [],
    });

    await expect(
      readProjectEntityResources({
        workspace: { workspaceId: 'project-neko', workspacePath },
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'project-entity-path-unauthorized' } });
  });

  it('projects deprecated records and rebuildable candidate state for management consumers', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'neko/entities.json', {
      projectId: 'project-neko',
      entities: [
        entity('deprecated-character', 'Deprecated', {
          state: 'deprecated',
          deprecatedAt: '2026-08-05T00:00:00.000Z',
        }),
      ],
    });

    const result = await readProjectEntityManagementResources({
      workspace: { workspaceId: 'project-neko', workspacePath },
      candidates: [
        {
          candidateId: 'candidate-nova',
          kind: 'character',
          proposedNames: { canonical: 'Nova', aliases: [] },
          freshness: 'fresh',
          evidence: [{ evidenceId: 'evidence-nova', owner: 'workspace', sourceId: 'story' }],
        },
      ],
    });

    expect(result.projections.map(({ projectionId, status }) => [projectionId, status])).toEqual([
      ['entity:deprecated-character', 'deprecated'],
      ['candidate:candidate-nova', 'candidate'],
    ]);
  });
});

function entity(
  entityId: string,
  canonical: string,
  lifecycle:
    { readonly state: 'active' } | { readonly state: 'deprecated'; readonly deprecatedAt: string },
) {
  return {
    entityId,
    kind: 'character',
    names: { canonical, aliases: [] },
    facts: {},
    representations: [],
    lifecycle,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-project-entity-resources-'));
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
