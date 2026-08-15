import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldAuthoringService } from '@neko/world/application';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorldAuthoringFileRepository,
  worldProjectPath,
  worldVersionPath,
} from './world-authoring-file-repository';

const NOW = '2026-08-11T00:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('World authoring file repository', () => {
  it('uses the canonical service and file shape for Project placement', async () => {
    const root = await workspace();
    const scope = { kind: 'project' as const, projectId: 'project-1' };
    const repository = createWorldAuthoringFileRepository({ workspaceRoot: root, scope });
    const service = new WorldAuthoringService({ repository, now: () => NOW });
    await service.createProject({
      worldProjectId: 'world-project-1',
      title: 'Archive City',
      draft: definition(),
    });
    await service.setReviewStatus({ worldProjectId: 'world-project-1', reviewStatus: 'ready' });
    const publication = await service.publish({
      worldProjectId: 'world-project-1',
      worldVersionId: 'world-version-1',
      label: 'Opening',
    });

    await expect(repository.readProject('world-project-1')).resolves.toMatchObject({
      title: 'Archive City',
    });
    await expect(repository.readPublication('world-version-1')).resolves.toEqual(publication);
    await expect(
      readFile(join(root, worldProjectPath('world-project-1')), 'utf8'),
    ).resolves.toContain('"worldProjectId": "world-project-1"');
    await expect(
      readFile(join(root, worldVersionPath('world-project-1', 'world-version-1')), 'utf8'),
    ).resolves.toContain('"worldVersionId": "world-version-1"');
    await expect(repository.readAuthoringCatalog()).resolves.toMatchObject({ scope });
    expect('createRuntime' in repository).toBe(false);
    expect('mutateRuntime' in repository).toBe(false);
  });

  it('isolates a malformed Project while preserving valid siblings', async () => {
    const root = await workspace();
    const repository = createWorldAuthoringFileRepository({
      workspaceRoot: root,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    const service = new WorldAuthoringService({ repository, now: () => NOW });
    await service.createProject({
      worldProjectId: 'world-valid',
      title: 'Valid',
      draft: definition(),
    });
    const invalid = join(root, worldProjectPath('world-invalid'));
    await mkdir(join(root, 'neko/worlds/world-invalid'), { recursive: true });
    await writeFile(invalid, JSON.stringify({ worldProjectId: 'world-invalid' }), 'utf8');

    const catalog = await repository.readAuthoringCatalog();
    expect(catalog.projects.map((project) => project.worldProjectId)).toEqual(['world-valid']);
    expect(catalog.diagnostics).toEqual([
      expect.objectContaining({ recordKind: 'world-project', recordId: 'world-invalid' }),
    ]);
    await expect(readFile(invalid, 'utf8')).resolves.toContain('world-invalid');
  });

  it('does not project a Project-local World into another Project root', async () => {
    const projectRoot = await workspace();
    const libraryRoot = await workspace();
    const projectRepository = createWorldAuthoringFileRepository({
      workspaceRoot: projectRoot,
      scope: { kind: 'project', projectId: 'project-1' },
    });
    await new WorldAuthoringService({
      repository: projectRepository,
      now: () => NOW,
    }).createProject({
      worldProjectId: 'project-local-world',
      title: 'Local',
      draft: definition(),
    });
    const otherProjectRepository = createWorldAuthoringFileRepository({
      workspaceRoot: libraryRoot,
      scope: { kind: 'project', projectId: 'project-2' },
    });
    await expect(otherProjectRepository.readAuthoringCatalog()).resolves.toMatchObject({
      projects: [],
    });
    await expect(projectRepository.readAuthoringCatalog()).resolves.toMatchObject({
      projects: [expect.objectContaining({ worldProjectId: 'project-local-world' })],
    });
  });

  it('rejects invalid identity and immutable publication conflicts', async () => {
    expect(() =>
      createWorldAuthoringFileRepository({
        workspaceRoot: 'relative',
        scope: { kind: 'project', projectId: 'project-1' },
      }),
    ).toThrow('absolute Host-authorized path');
    const repository = createWorldAuthoringFileRepository({
      workspaceRoot: await workspace(),
      scope: { kind: 'project', projectId: 'project-1' },
    });
    expect(() => repository.readProject('../escape')).toThrow(
      expect.objectContaining({ code: 'world-record-invalid' }),
    );
    const publication = {
      worldVersionId: 'world-version-1',
      worldProjectId: 'world-project-1',
      label: 'First',
      definition: definition(),
      acceptedSourceRefIds: [],
      publishedAt: NOW,
    };
    await repository.storePublication(publication);
    await expect(
      repository.storePublication({ ...publication, label: 'Changed' }),
    ).rejects.toMatchObject({
      code: 'world-publication-conflict',
    });
  });
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-world-authoring-'));
  roots.push(root);
  return root;
}

function definition() {
  return {
    background: 'An archive city.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}
