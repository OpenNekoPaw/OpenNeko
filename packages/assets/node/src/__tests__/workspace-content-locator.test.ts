import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveWorkspaceContentLocator } from '../workspace-content-locator';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('resolveWorkspaceContentLocator', () => {
  it('authorizes a generated file through the same canonical Workspace address', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-generated-output-path-'));
    roots.push(workspacePath);
    const relativePath = 'neko/generated/image/frame.png';
    const bytes = Buffer.from('generated-image');
    await mkdir(path.dirname(path.join(workspacePath, relativePath)), { recursive: true });
    await writeFile(path.join(workspacePath, relativePath), bytes);
    const locator = {
      file: { authority: 'workspace' as const, path: relativePath },
    };

    await expect(resolveWorkspaceContentLocator(workspace(workspacePath), locator)).resolves.toBe(
      await realpath(path.join(workspacePath, relativePath)),
    );
  });

  it('authorizes a managed linked-media workspace path', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-linked-media-path-'));
    const externalPath = await mkdtemp(path.join(tmpdir(), 'openneko-linked-media-target-'));
    roots.push(workspacePath, externalPath);
    await writeFile(path.join(externalPath, 'shot.mov'), 'retired-link');
    await mkdir(path.join(workspacePath, 'neko', 'assets'), { recursive: true });
    await symlink(
      externalPath,
      path.join(workspacePath, 'neko', 'assets', 'Footage'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      resolveWorkspaceContentLocator(workspace(workspacePath), {
        file: { authority: 'workspace', path: 'neko/assets/Footage/shot.mov' },
      }),
    ).resolves.toBe(await realpath(path.join(externalPath, 'shot.mov')));
  });

  it('rejects a real directory in the managed media-library namespace', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-linked-media-path-'));
    roots.push(workspacePath);
    await mkdir(path.join(workspacePath, 'neko', 'assets', 'Footage'), { recursive: true });
    await writeFile(path.join(workspacePath, 'neko', 'assets', 'Footage', 'shot.mov'), 'owned');

    await expect(
      resolveWorkspaceContentLocator(workspace(workspacePath), {
        file: { authority: 'workspace', path: 'neko/assets/Footage/shot.mov' },
      }),
    ).rejects.toMatchObject({ code: 'library-entry-not-link' });
  });

  it('rejects an unmanaged workspace symlink', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'openneko-unmanaged-link-path-'));
    const externalPath = await mkdtemp(path.join(tmpdir(), 'openneko-unmanaged-link-target-'));
    roots.push(workspacePath, externalPath);
    await writeFile(path.join(externalPath, 'secret.txt'), 'secret');
    await symlink(
      externalPath,
      path.join(workspacePath, 'external'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      resolveWorkspaceContentLocator(workspace(workspacePath), {
        file: { authority: 'workspace', path: 'external/secret.txt' },
      }),
    ).rejects.toMatchObject({ code: 'unmanaged-symlink' });
  });
});

function workspace(workspacePath: string) {
  return {
    workspaceId: 'workspace-1',
    workspacePath,
    displayName: 'Fixture',
    locator: { kind: 'relative' as const, value: '.' },
  };
}
