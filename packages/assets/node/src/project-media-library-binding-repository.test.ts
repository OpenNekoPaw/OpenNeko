import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  confirmProjectMediaLibraryRecovery,
  createProjectMediaLibraryRecoveryPlan,
} from '@neko/assets-domain/contracts';
import {
  ProjectMediaLibraryBindingRepository,
  createProjectMediaLibraryBindingFingerprint,
} from './project-media-library-binding-repository';

const PROJECT_ID = 'project-neko';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ProjectMediaLibraryBindingRepository', () => {
  it('treats an absent .neko directory as an empty binding set', async () => {
    const workspace = await fixture();
    const repository = new ProjectMediaLibraryBindingRepository(workspace, PROJECT_ID);

    await expect(repository.list()).resolves.toEqual({ bindings: [], diagnostics: [] });
  });

  it('preserves one malformed record and unknown files beside a valid sibling', async () => {
    const workspace = await fixture();
    const repository = new ProjectMediaLibraryBindingRepository(workspace, PROJECT_ID);
    await apply(repository, 'Footage', 'media-library:nas:Footage', null);
    const localRoot = path.join(workspace, '.neko', 'media-libraries');
    await writeFile(path.join(localRoot, 'Broken.json'), '{not-json', 'utf8');
    await writeFile(path.join(localRoot, 'future-owner.bin'), 'opaque future bytes', 'utf8');

    await expect(repository.list()).resolves.toMatchObject({
      bindings: [{ projectId: PROJECT_ID, libraryName: 'Footage' }],
      diagnostics: [{ code: 'binding-invalid', libraryName: 'Broken' }],
    });
    await expect(readFile(path.join(localRoot, 'Broken.json'), 'utf8')).resolves.toBe('{not-json');
    await expect(readFile(path.join(localRoot, 'future-owner.bin'), 'utf8')).resolves.toBe(
      'opaque future bytes',
    );
  });

  it('deleting all .neko state only resets bindings and leaves project facts untouched', async () => {
    const workspace = await fixture();
    const factsPath = path.join(workspace, 'neko', 'project.json');
    await mkdir(path.dirname(factsPath), { recursive: true });
    await writeFile(factsPath, '{"workspaceId":"project-neko"}', 'utf8');
    const repository = new ProjectMediaLibraryBindingRepository(workspace, PROJECT_ID);
    await apply(repository, 'Footage', 'media-library:local:Footage', null);

    await rm(path.join(workspace, '.neko'), { recursive: true, force: true });

    await expect(repository.list()).resolves.toEqual({ bindings: [], diagnostics: [] });
    await expect(readFile(factsPath, 'utf8')).resolves.toBe('{"workspaceId":"project-neko"}');
  });

  it('rejects stale plans and removes only the exact local binding record', async () => {
    const workspace = await fixture();
    const repository = new ProjectMediaLibraryBindingRepository(workspace, PROJECT_ID);
    const first = await apply(repository, 'Footage', 'media-library:local:Footage', null);
    const stalePlan = plan('Footage', 'media-library:nas:Footage', first.bindingFingerprint);
    const replacement = await apply(
      repository,
      'Footage',
      'media-library:cloud:Footage',
      first.bindingFingerprint,
    );

    await expect(
      repository.applyRecovery(confirmProjectMediaLibraryRecovery(stalePlan)),
    ).rejects.toThrow('changed after recovery was planned');
    await repository.remove({
      libraryName: 'Footage',
      expectedBindingFingerprint: replacement.bindingFingerprint,
    });
    await expect(repository.read('Footage')).resolves.toEqual({
      status: 'absent',
      libraryName: 'Footage',
    });
  });
});

async function fixture(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), 'neko-project-media-binding-'));
  temporaryDirectories.push(workspace);
  return workspace;
}

function plan(
  libraryName: string,
  connectionId: string,
  expectedBindingFingerprint: string | null,
) {
  return createProjectMediaLibraryRecoveryPlan({
    projectId: PROJECT_ID,
    libraryName,
    connectionId,
    requirementFingerprint: 'sha256:requirement-footage-1234',
    validatedRelativePaths: ['shots/hero.mov'],
    expectedBindingFingerprint,
    replacementBindingFingerprint: createProjectMediaLibraryBindingFingerprint({
      projectId: PROJECT_ID,
      libraryName,
      connectionId,
    }),
  });
}

async function apply(
  repository: ProjectMediaLibraryBindingRepository,
  libraryName: string,
  connectionId: string,
  expectedBindingFingerprint: string | null,
) {
  return repository.applyRecovery(
    confirmProjectMediaLibraryRecovery(plan(libraryName, connectionId, expectedBindingFingerprint)),
  );
}
