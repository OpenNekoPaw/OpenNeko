import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmProjectMediaLibraryRecovery,
  createProjectMediaLibraryRecoveryPlan,
} from '@neko/assets-domain/contracts';
import { createNodeHostContentReadService } from '@neko/content/node';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import { createProjectMediaLibraryBindingFingerprint } from './project-media-library-binding-repository';
import { ProjectMediaLibraryContentReadHandler } from './project-media-library-content-handler';
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

describe('ProjectMediaLibraryContentReadHandler', () => {
  it('composes the exact project binding handler and never consults a retired workspace link', async () => {
    const fixture = await createFixture();
    const retiredRoot = path.join(fixture.outsideRoot, 'retired');
    await mkdir(retiredRoot, { recursive: true });
    await writeFile(path.join(retiredRoot, 'hero.txt'), 'poison', 'utf8');
    await mkdir(path.join(fixture.workspace, 'neko', 'assets'), { recursive: true });
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
      kind: 'media-library' as const,
      libraryName: 'Footage',
      relativePath: 'shots/hero.txt',
    };

    const result = await content.read(locator);

    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(new TextDecoder().decode(result.bytes)).toBe('hero');
    await expect(
      content.read({
        kind: 'workspace-file',
        path: 'neko/assets/Footage/hero.txt',
      }),
    ).rejects.toMatchObject({
      code: 'invalid-content-locator',
    });
  });

  it('uses the exact binding and authorized global connection without projecting a physical path', async () => {
    const fixture = await createFixture();
    const resolveAuthorizedTarget = vi.fn(async (connectionId: string) => {
      if (connectionId !== fixture.connectionId) throw new Error('unexpected connection');
      return fixture.libraryRoot;
    });
    const content = createNodeHostContentReadService({
      workspaceRoot: fixture.workspace,
      mediaLibraryHandler: new ProjectMediaLibraryContentReadHandler({
        bindings: fixture.bindings,
        connections: { resolveAuthorizedTarget },
      }),
    });
    const locator = {
      kind: 'media-library' as const,
      libraryName: 'Footage',
      relativePath: 'shots/hero.txt',
    };

    const result = await content.read(locator);

    expect(result).toMatchObject({
      status: 'ready',
      locator,
      offset: 0,
    });
    if (result.status === 'ready') expect(new TextDecoder().decode(result.bytes)).toBe('hero');
    expect(resolveAuthorizedTarget).toHaveBeenCalledExactlyOnceWith(fixture.connectionId);
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
        kind: 'media-library' as const,
        libraryName: 'Footage',
        relativePath: 'shots/hero.txt',
      },
      entryPath: 'images/cover.jpg',
    };

    const result = await content.read(locator);

    expect(result).toMatchObject({ status: 'ready', locator });
    expect(readEntry).toHaveBeenCalledExactlyOnceWith(
      await realpath(path.join(fixture.libraryRoot, 'shots', 'hero.txt')),
      'images/cover.jpg',
    );
  });

  it('fails only the requested locator after project .neko is deleted', async () => {
    const fixture = await createFixture();
    const content = createNodeHostContentReadService({
      workspaceRoot: fixture.workspace,
      mediaLibraryHandler: new ProjectMediaLibraryContentReadHandler({
        bindings: fixture.bindings,
        connections: { resolveAuthorizedTarget: async () => fixture.libraryRoot },
      }),
    });
    await rm(path.join(fixture.workspace, '.neko'), { recursive: true, force: true });

    await expect(
      content.read({
        kind: 'media-library',
        libraryName: 'Footage',
        relativePath: 'shots/hero.txt',
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-missing' },
    });
  });

  it('rejects a nested symbolic link that escapes the authorized target', async () => {
    const fixture = await createFixture();
    const outsidePath = path.join(fixture.outsideRoot, 'private.txt');
    await writeFile(outsidePath, 'private', 'utf8');
    await symlink(outsidePath, path.join(fixture.libraryRoot, 'shots', 'escape.txt'));
    const content = createNodeHostContentReadService({
      workspaceRoot: fixture.workspace,
      mediaLibraryHandler: new ProjectMediaLibraryContentReadHandler({
        bindings: fixture.bindings,
        connections: { resolveAuthorizedTarget: async () => fixture.libraryRoot },
      }),
    });

    await expect(
      content.read({
        kind: 'media-library',
        libraryName: 'Footage',
        relativePath: 'shots/escape.txt',
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
  const connectionId = 'media-library:nas:Footage';
  await symlink(
    libraryRoot,
    path.join(globalMediaLibraryRoot, 'nas', 'Footage'),
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
