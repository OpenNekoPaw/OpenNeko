import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectSyncPlan } from './project-sync-plan';

const WORKSPACE_ID = '1888f0bf-ed92-440b-8cd6-03107358380a';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Project sync plan', () => {
  it('includes synchronized facts and owned files while excluding local state and external links', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-project-sync-'));
    const external = await mkdtemp(path.join(tmpdir(), 'openneko-project-sync-external-'));
    roots.push(root, external);
    await mkdir(path.join(root, 'neko', 'project-bindings', 'entity-character'), {
      recursive: true,
    });
    await mkdir(path.join(root, 'media'), { recursive: true });
    await mkdir(path.join(root, 'neko', 'assets'), { recursive: true });
    await mkdir(path.join(root, '.neko', 'media-libraries'), { recursive: true });
    await writeFile(
      path.join(root, 'neko', 'project.json'),
      JSON.stringify({ workspaceId: WORKSPACE_ID }),
    );
    await writeFile(
      path.join(root, 'neko', 'project-bindings', 'entity-character', 'association.json'),
      '{"projectId":"content:test"}',
    );
    await writeFile(
      path.join(root, 'board.nkc'),
      JSON.stringify({
        contentLocator: {
          kind: 'media-library',
          libraryName: 'Footage',
          relativePath: 'shots/a.mov',
        },
      }),
    );
    await writeFile(path.join(root, 'media', 'owned.mov'), 'owned-by-project');
    await writeFile(
      path.join(root, '.neko', 'media-libraries', 'Footage.json'),
      JSON.stringify({ connectionId: 'connection-secret', physicalTarget: '/Volumes/private' }),
    );
    await writeFile(path.join(root, '.env'), 'API_KEY=secret');
    await writeFile(path.join(external, 'external.mov'), 'external-bytes');
    await symlink(external, path.join(root, 'external-library'));
    await symlink(external, path.join(root, 'neko', 'assets', 'Footage'));

    const plan = await createProjectSyncPlan({
      workspaceRoot: root,
      projectId: `content:${WORKSPACE_ID}`,
    });

    expect(plan.entries.map((entry) => entry.relativePath)).toEqual([
      'board.nkc',
      'media/owned.mov',
      'neko/project-bindings/entity-character/association.json',
      'neko/project.json',
    ]);
    expect(JSON.stringify(plan)).not.toMatch(
      /\.neko|connection-secret|Volumes|API_KEY|external\.mov/u,
    );
    await expect(
      readFile(path.join(root, '.neko', 'media-libraries', 'Footage.json'), 'utf8'),
    ).resolves.toContain('connection-secret');
  });

  it('rejects a Project identity that does not match the synchronized identity fact', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-project-sync-identity-'));
    roots.push(root);
    await mkdir(path.join(root, 'neko'), { recursive: true });
    await writeFile(
      path.join(root, 'neko', 'project.json'),
      JSON.stringify({ workspaceId: WORKSPACE_ID }),
    );
    await expect(
      createProjectSyncPlan({ workspaceRoot: root, projectId: 'content:other' }),
    ).rejects.toThrow('does not match');
  });
});
