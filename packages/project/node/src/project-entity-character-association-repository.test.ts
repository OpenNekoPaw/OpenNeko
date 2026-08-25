import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  projectEntityCharacterAssociationRelativePath,
  serializeProjectEntityCharacterAssociationFact,
} from '@neko/project-domain/contracts';
import { ProjectEntityCharacterAssociationRepository } from './project-entity-character-association-repository';

const PROJECT_ID = 'project-neko';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ProjectEntityCharacterAssociationRepository', () => {
  it('atomically saves and lists independent Project facts', async () => {
    const workspace = await fixture();
    const repository = new ProjectEntityCharacterAssociationRepository(workspace, PROJECT_ID);
    const association = {
      projectId: PROJECT_ID,
      entityId: 'entity:alice',
      characterProjectId: 'character:alice',
    };

    await repository.save(association);

    await expect(repository.list()).resolves.toEqual({
      associations: [association],
      diagnostics: [],
    });
  });

  it('preserves invalid bytes and returns valid siblings with a row diagnostic', async () => {
    const workspace = await fixture();
    const repository = new ProjectEntityCharacterAssociationRepository(workspace, PROJECT_ID);
    const valid = {
      projectId: PROJECT_ID,
      entityId: 'entity:valid',
      characterProjectId: 'character:valid',
    };
    await repository.save(valid);
    const invalidRelativePath = projectEntityCharacterAssociationRelativePath('entity:invalid');
    const invalidPath = path.join(workspace, ...invalidRelativePath.split('/'));
    await writeFile(invalidPath, '{not-json', 'utf8');

    await expect(repository.list()).resolves.toMatchObject({
      associations: [valid],
      diagnostics: [
        {
          code: 'project-entity-character-association-invalid',
          projectId: PROJECT_ID,
        },
      ],
    });
    await expect(readFile(invalidPath, 'utf8')).resolves.toBe('{not-json');
  });

  it('keeps associations unchanged when project-local .neko is deleted', async () => {
    const workspace = await fixture();
    const repository = new ProjectEntityCharacterAssociationRepository(workspace, PROJECT_ID);
    const association = {
      projectId: PROJECT_ID,
      entityId: 'entity:alice',
      characterProjectId: 'character:alice',
    };
    await repository.save(association);
    await mkdir(path.join(workspace, '.neko', 'cache'), { recursive: true });
    await writeFile(path.join(workspace, '.neko', 'cache', 'discard.bin'), 'cache');

    await rm(path.join(workspace, '.neko'), { recursive: true, force: true });

    await expect(repository.list()).resolves.toEqual({
      associations: [association],
      diagnostics: [],
    });
    const relativePath = projectEntityCharacterAssociationRelativePath(association.entityId);
    await expect(readFile(path.join(workspace, ...relativePath.split('/')), 'utf8')).resolves.toBe(
      serializeProjectEntityCharacterAssociationFact(association),
    );
  });
});

async function fixture(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), 'neko-project-association-'));
  roots.push(workspace);
  return workspace;
}
