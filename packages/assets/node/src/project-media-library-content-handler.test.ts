import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmProjectMediaLibraryRecovery,
  createProjectMediaLibraryRecoveryPlan,
} from '@neko/assets-domain/contracts';
import { encodeProjectEntityDocument } from '@neko/entity-domain';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import { createProjectMediaLibraryBindingFingerprint } from './project-media-library-binding-repository';
import { createProjectContentReadService } from './project-content-read-service';

const PROJECT_ID = 'project-neko';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('project Media Library content authorization', () => {
  it('rejects a managed Workspace link that does not match the exact project binding', async () => {
    const fixture = await createFixture();
    const retiredRoot = path.join(fixture.outsideRoot, 'retired');
    await mkdir(retiredRoot, { recursive: true });
    await writeFile(path.join(retiredRoot, 'hero.txt'), 'poison', 'utf8');
    await rm(path.join(fixture.workspace, 'neko', 'assets', 'Footage'));
    await symlink(
      retiredRoot,
      path.join(fixture.workspace, 'neko', 'assets', 'Footage'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const content = createProjectContentReadService({
      projectId: PROJECT_ID,
      workspaceRoot: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Footage/shots/hero.txt',
    };

    const result = await content.read(locator);

    expect(result).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
  });

  it('uses the exact binding and authorized global connection without projecting a physical path', async () => {
    const fixture = await createFixture();
    const content = createProjectContentReadService({
      projectId: PROJECT_ID,
      workspaceRoot: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Footage/shots/hero.txt',
    };

    const result = await content.read(locator);

    expect(result).toMatchObject({
      status: 'ready',
      locator,
      offset: 0,
    });
    if (result.status === 'ready') expect(new TextDecoder().decode(result.bytes)).toBe('hero');
    expect(JSON.stringify(result)).not.toContain(fixture.libraryRoot);
    expect(JSON.stringify(result)).not.toContain(fixture.connectionId);
  });

  it('authorizes a Media Library document container before reading its exact entry', async () => {
    const fixture = await createFixture();
    const readEntry = vi.fn(async () => new TextEncoder().encode('entry'));
    const content = createProjectContentReadService({
      projectId: PROJECT_ID,
      workspaceRoot: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
      documentEntryReader: { readEntry },
    });
    const locator = {
      kind: 'document-entry' as const,
      source: {
        kind: 'workspace-file' as const,
        path: 'neko/assets/Footage/shots/hero.txt',
      },
      entryPath: 'images/cover.jpg',
    };

    const result = await content.read(locator);

    expect(result).toMatchObject({ status: 'ready', locator });
    expect(readEntry).toHaveBeenCalledExactlyOnceWith(
      path.join(fixture.workspace, 'neko', 'assets', 'Footage', 'shots', 'hero.txt'),
      'images/cover.jpg',
    );
  });

  it('rebuilds the exact local binding after project .neko is deleted', async () => {
    const fixture = await createFixture();
    const content = createProjectContentReadService({
      projectId: PROJECT_ID,
      workspaceRoot: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });
    await rm(path.join(fixture.workspace, '.neko'), { recursive: true, force: true });

    await expect(
      content.read({
        kind: 'workspace-file',
        path: 'neko/assets/Footage/shots/hero.txt',
      }),
    ).resolves.toMatchObject({ status: 'ready' });
  });

  it('rejects a nested symbolic link that escapes the authorized target', async () => {
    const fixture = await createFixture();
    const outsidePath = path.join(fixture.outsideRoot, 'private.txt');
    await writeFile(outsidePath, 'private', 'utf8');
    await symlink(outsidePath, path.join(fixture.libraryRoot, 'shots', 'escape.txt'));
    const content = createProjectContentReadService({
      projectId: PROJECT_ID,
      workspaceRoot: fixture.workspace,
      globalMediaLibraryRoot: fixture.globalMediaLibraryRoot,
    });

    await expect(
      content.read({
        kind: 'workspace-file',
        path: 'neko/assets/Footage/shots/escape.txt',
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-media-content-'));
  temporaryDirectories.push(root);
  const workspace = path.join(root, 'workspace');
  const libraryRoot = path.join(root, 'library');
  const outsideRoot = path.join(root, 'outside');
  const globalMediaLibraryRoot = path.join(root, 'global-media-libraries');
  await Promise.all([
    mkdir(workspace, { recursive: true }),
    mkdir(path.join(libraryRoot, 'shots'), { recursive: true }),
    mkdir(outsideRoot, { recursive: true }),
    mkdir(path.join(globalMediaLibraryRoot, 'nas'), { recursive: true }),
  ]);
  await writeFile(path.join(libraryRoot, 'shots', 'hero.txt'), 'hero', 'utf8');
  await mkdir(path.join(workspace, 'neko'), { recursive: true });
  await writeFile(
    path.join(workspace, 'neko', 'entities.json'),
    encodeProjectEntityDocument({
      projectId: PROJECT_ID,
      entities: [
        {
          entityId: 'entity-1',
          kind: 'character',
          names: { canonical: 'Hero', aliases: [] },
          representations: [
            {
              bindingId: 'binding-1',
              target: {
                kind: 'workspace-file',
                path: 'neko/assets/Footage/shots/hero.txt',
              },
              role: 'portrait',
              source: 'user',
              acceptedAt: '2026-08-14T00:00:00.000Z',
            },
          ],
          lifecycle: { state: 'active' },
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      ],
    }),
  );
  const connectionId = 'media-library:nas:Footage';
  await symlink(
    libraryRoot,
    path.join(globalMediaLibraryRoot, 'nas', 'Footage'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await mkdir(path.join(workspace, 'neko', 'assets'), { recursive: true });
  await symlink(
    libraryRoot,
    path.join(workspace, 'neko', 'assets', 'Footage'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const bindings = new ProjectMediaLibraryBindingRepository(workspace, PROJECT_ID);
  const replacementBindingFingerprint = createProjectMediaLibraryBindingFingerprint({
    projectId: PROJECT_ID,
    libraryName: 'Footage',
    connectionId,
  });
  await bindings.applyRecovery(
    confirmProjectMediaLibraryRecovery(
      createProjectMediaLibraryRecoveryPlan({
        projectId: PROJECT_ID,
        libraryName: 'Footage',
        connectionId,
        requirementFingerprint: 'sha256:requirement-footage-1234',
        validatedRelativePaths: ['shots/hero.txt'],
        expectedBindingFingerprint: null,
        replacementBindingFingerprint,
      }),
    ),
  );
  return {
    workspace,
    libraryRoot,
    outsideRoot,
    globalMediaLibraryRoot,
    connectionId,
    bindings,
  };
}
