import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readProjectEntityResources } from './project-entity-resources';

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
    ).resolves.toEqual({ entities: [] });

    await writeJson(workspacePath, 'neko/entities.json', {
      schemaVersion: 1,
      projectId: 'project-neko',
      revision: 1,
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

  it('fails visibly when canonical data belongs to another Project identity', async () => {
    const workspacePath = await createWorkspace();
    await writeJson(workspacePath, 'neko/entities.json', {
      schemaVersion: 1,
      projectId: 'project-other',
      revision: 0,
      entities: [],
    });

    await expect(
      readProjectEntityResources({
        workspace: { workspaceId: 'project-neko', workspacePath },
      }),
    ).rejects.toMatchObject({ diagnostic: { code: 'project-entity-path-unauthorized' } });
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
