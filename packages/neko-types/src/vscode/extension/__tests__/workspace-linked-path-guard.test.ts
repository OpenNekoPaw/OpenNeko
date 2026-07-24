import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authorizeWorkspaceLinkedPath,
  type WorkspaceLinkedPathGuardFileSystem,
} from '../workspace-linked-path-guard';

const cleanupDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('workspace-linked path guard', () => {
  it('authorizes ordinary workspace files and direct linked library descendants', async () => {
    const fixture = await createFixture();
    const ordinaryFile = path.join(fixture.workspace, 'notes/story.md');
    const linkedFile = path.join(fixture.target, 'shot/a001.mov');
    await mkdir(path.dirname(ordinaryFile), { recursive: true });
    await mkdir(path.dirname(linkedFile), { recursive: true });
    await writeFile(ordinaryFile, 'story');
    await writeFile(linkedFile, 'media');
    await createLink(fixture.target, path.join(fixture.workspace, 'neko/assets/Footage'));

    await expect(
      authorizeWorkspaceLinkedPath({
        workspaceRoot: fixture.workspace,
        requestedPath: ordinaryFile,
      }),
    ).resolves.toEqual({ authorized: true });
    await expect(
      authorizeWorkspaceLinkedPath({
        workspaceRoot: fixture.workspace,
        requestedPath: path.join(fixture.workspace, 'neko/assets/Footage/shot/a001.mov'),
      }),
    ).resolves.toEqual({ authorized: true });
  });

  it('rejects an unmanaged workspace symlink that escapes the workspace', async () => {
    const fixture = await createFixture();
    const targetFile = path.join(fixture.target, 'private.txt');
    await writeFile(targetFile, 'private');
    await createLink(fixture.target, path.join(fixture.workspace, 'outside'));

    const result = await authorizeWorkspaceLinkedPath({
      workspaceRoot: fixture.workspace,
      requestedPath: path.join(fixture.workspace, 'outside/private.txt'),
    });
    expect(result).toMatchObject({
      authorized: false,
      diagnostic: { code: 'unmanaged-symlink', workspacePath: 'outside/private.txt' },
    });
    expect(JSON.stringify(result)).not.toContain(fixture.target);
  });

  it('rejects a nested symlink that escapes the linked target', async () => {
    const fixture = await createFixture();
    const otherTarget = path.join(fixture.root, 'other-target');
    await mkdir(otherTarget);
    await writeFile(path.join(otherTarget, 'private.txt'), 'private');
    await createLink(fixture.target, path.join(fixture.workspace, 'neko/assets/Footage'));
    await createLink(otherTarget, path.join(fixture.target, 'escape'));

    const result = await authorizeWorkspaceLinkedPath({
      workspaceRoot: fixture.workspace,
      requestedPath: path.join(fixture.workspace, 'neko/assets/Footage/escape/private.txt'),
    });
    expect(result).toMatchObject({
      authorized: false,
      diagnostic: {
        code: 'nested-link-escape',
        libraryName: 'Footage',
        workspacePath: 'neko/assets/Footage/escape/private.txt',
      },
    });
    expect(JSON.stringify(result)).not.toContain(otherTarget);
  });

  it('rejects a linked-library loop with a safe diagnostic', async () => {
    const fixture = await createFixture();
    const linkPath = path.join(fixture.workspace, 'neko/assets/Footage');
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(linkPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await authorizeWorkspaceLinkedPath({
      workspaceRoot: fixture.workspace,
      requestedPath: path.join(linkPath, 'clip.mov'),
    });
    expect(result).toMatchObject({
      authorized: false,
      diagnostic: { code: 'library-link-loop', libraryName: 'Footage' },
    });
    expect(JSON.stringify(result)).not.toContain(fixture.root);
  });

  it('maps permission failures without returning raw filesystem details', async () => {
    const fixture = await createFixture();
    const linkedFile = path.join(fixture.target, 'clip.mov');
    await writeFile(linkedFile, 'media');
    await createLink(fixture.target, path.join(fixture.workspace, 'neko/assets/Footage'));
    const deniedPath = path.join(fixture.workspace, 'neko/assets/Footage/clip.mov');
    const fs: WorkspaceLinkedPathGuardFileSystem = {
      lstat: async (filePath) =>
        import('node:fs/promises').then((module) => module.lstat(filePath)),
      realpath: async (filePath) => {
        if (filePath === deniedPath)
          throw Object.assign(new Error('private detail'), { code: 'EACCES' });
        return realpath(filePath);
      },
    };

    const result = await authorizeWorkspaceLinkedPath({
      workspaceRoot: fixture.workspace,
      requestedPath: deniedPath,
      fs,
    });
    expect(result).toMatchObject({
      authorized: false,
      diagnostic: { code: 'library-permission-denied', libraryName: 'Footage' },
    });
    expect(JSON.stringify(result)).not.toContain('private detail');
    expect(JSON.stringify(result)).not.toContain(fixture.target);
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly workspace: string;
  readonly target: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-workspace-guard-'));
  cleanupDirectories.push(root);
  const workspace = path.join(root, 'workspace');
  const target = path.join(root, 'target');
  await Promise.all([mkdir(workspace), mkdir(target)]);
  return { root, workspace, target };
}

async function createLink(target: string, linkPath: string): Promise<void> {
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}
