import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WorkspaceLinkedMediaLibraryError,
  createWorkspaceLinkedMediaLibrary,
  inspectWorkspaceLinkedMediaLibrary,
  listWorkspaceLinkedMediaLibraries,
  removeWorkspaceLinkedMediaLibrary,
  replaceWorkspaceLinkedMediaLibrary,
} from '../workspace-linked-media-libraries';

const cleanupDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Node workspace-linked media libraries', () => {
  it('creates, enumerates, relinks, and removes only the workspace link', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.targetA, 'a.mov'), 'a');
    await writeFile(path.join(fixture.targetB, 'b.mov'), 'b');

    const created = await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace,
      name: 'Footage',
      targetDirectory: fixture.targetA,
    });

    expect(created.library).toEqual({
      name: 'Footage',
      workspacePath: 'neko/assets/Footage',
      availability: 'available',
    });
    expect(
      (await lstat(path.join(fixture.workspace, 'neko/assets/Footage'))).isSymbolicLink(),
    ).toBe(true);
    expect(await readFile(path.join(fixture.workspace, 'neko/assets/Footage/a.mov'), 'utf8')).toBe(
      'a',
    );
    expect(await listWorkspaceLinkedMediaLibraries(fixture.workspace)).toEqual([created.library]);

    await replaceWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace,
      name: 'Footage',
      targetDirectory: fixture.targetB,
    });
    expect(await readFile(path.join(fixture.workspace, 'neko/assets/Footage/b.mov'), 'utf8')).toBe(
      'b',
    );
    expect((await stat(fixture.targetA)).isDirectory()).toBe(true);

    await removeWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace,
      name: 'Footage',
    });
    await expect(lstat(path.join(fixture.workspace, 'neko/assets/Footage'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await stat(fixture.targetA)).isDirectory()).toBe(true);
    expect((await stat(fixture.targetB)).isDirectory()).toBe(true);
  });

  it('does not require a Git repository to add, relink, or remove a library', async () => {
    const fixture = await createFixture({ initializeGit: false });
    await writeFile(path.join(fixture.targetA, 'clip.mov'), 'a');
    await writeFile(path.join(fixture.targetB, 'clip.mov'), 'b');

    await expect(
      createWorkspaceLinkedMediaLibrary({
        workspaceRoot: fixture.workspace,
        name: 'Footage',
        targetDirectory: fixture.targetA,
      }),
    ).resolves.toMatchObject({
      library: {
        name: 'Footage',
        workspacePath: 'neko/assets/Footage',
        availability: 'available',
      },
    });

    await expect(
      replaceWorkspaceLinkedMediaLibrary({
        workspaceRoot: fixture.workspace,
        name: 'Footage',
        targetDirectory: fixture.targetB,
      }),
    ).resolves.toMatchObject({
      library: {
        name: 'Footage',
        workspacePath: 'neko/assets/Footage',
        availability: 'available',
      },
    });
    await expect(
      readFile(path.join(fixture.workspace, 'neko/assets/Footage/clip.mov'), 'utf8'),
    ).resolves.toBe('b');

    await expect(
      removeWorkspaceLinkedMediaLibrary({ workspaceRoot: fixture.workspace, name: 'Footage' }),
    ).resolves.toBeUndefined();
    await expect(stat(fixture.targetB)).resolves.toMatchObject({});
  });

  it('writes an exact repository-local ignore without hiding project assets', async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.workspace, 'neko/assets'), { recursive: true });
    await writeFile(path.join(fixture.workspace, 'neko/assets/library.json'), '{}');
    await writeFile(path.join(fixture.workspace, 'neko/assets/project.png'), 'project');

    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace,
      name: 'Footage',
      targetDirectory: fixture.targetA,
    });

    const excludePath = execFileSync(
      'git',
      [
        '-C',
        fixture.workspace,
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'info/exclude',
      ],
      { encoding: 'utf8' },
    ).trim();
    expect((await readFile(excludePath, 'utf8')).split(/\r?\n/u)).toContain('/neko/assets/Footage');
    expect(isGitIgnored(fixture.workspace, 'neko/assets/Footage')).toBe(true);
    expect(isGitIgnored(fixture.workspace, 'neko/assets/library.json')).toBe(false);
    expect(isGitIgnored(fixture.workspace, 'neko/assets/project.png')).toBe(false);
  });

  it('keeps the workspace-relative identity after the workspace moves', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.targetA, 'clip.mov'), 'clip');
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot: fixture.workspace,
      name: 'Footage',
      targetDirectory: fixture.targetA,
    });

    const movedWorkspace = `${fixture.workspace}-moved`;
    cleanupDirectories.push(movedWorkspace);
    await rename(fixture.workspace, movedWorkspace);

    expect(await readFile(path.join(movedWorkspace, 'neko/assets/Footage/clip.mov'), 'utf8')).toBe(
      'clip',
    );
    expect((await listWorkspaceLinkedMediaLibraries(movedWorkspace))[0]?.workspacePath).toBe(
      'neko/assets/Footage',
    );
  });

  it('reports a broken link without exposing its target', async () => {
    const fixture = await createFixture();
    const missingTarget = path.join(fixture.root, 'private-missing-target');
    const linkPath = path.join(fixture.workspace, 'neko/assets/Footage');
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(missingTarget, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    const library = await inspectWorkspaceLinkedMediaLibrary(fixture.workspace, 'Footage');
    expect(library.availability).toBe('unavailable');
    expect(library.diagnostic?.code).toBe('library-link-broken');
    expect(JSON.stringify(library)).not.toContain(missingTarget);
  });

  it('refuses to replace or remove a real project directory', async () => {
    const fixture = await createFixture();
    await mkdir(path.join(fixture.workspace, 'neko/assets/Footage'), { recursive: true });

    await expect(
      replaceWorkspaceLinkedMediaLibrary({
        workspaceRoot: fixture.workspace,
        name: 'Footage',
        targetDirectory: fixture.targetA,
      }),
    ).rejects.toMatchObject<Partial<WorkspaceLinkedMediaLibraryError>>({
      diagnostic: { code: 'library-entry-not-link' },
    });
    await expect(
      removeWorkspaceLinkedMediaLibrary({ workspaceRoot: fixture.workspace, name: 'Footage' }),
    ).rejects.toMatchObject<Partial<WorkspaceLinkedMediaLibraryError>>({
      diagnostic: { code: 'library-entry-not-link' },
    });
  });
});

async function createFixture(options: { readonly initializeGit?: boolean } = {}): Promise<{
  readonly root: string;
  readonly workspace: string;
  readonly targetA: string;
  readonly targetB: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-linked-library-'));
  cleanupDirectories.push(root);
  const workspace = path.join(root, 'workspace');
  const targetA = path.join(root, 'target-a');
  const targetB = path.join(root, 'target-b');
  await Promise.all([
    mkdir(workspace, { recursive: true }),
    mkdir(targetA, { recursive: true }),
    mkdir(targetB, { recursive: true }),
  ]);
  if (options.initializeGit !== false) {
    execFileSync('git', ['init', '--quiet', workspace]);
  }
  return { root, workspace, targetA, targetB };
}

function isGitIgnored(workDir: string, relativePath: string): boolean {
  try {
    execFileSync('git', [
      '-C',
      workDir,
      'check-ignore',
      '--no-index',
      '--quiet',
      '--',
      relativePath,
    ]);
    return true;
  } catch {
    return false;
  }
}
