import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeAuthorizedWorkspaceDeleter } from '../workspace-content-deleter';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('NodeAuthorizedWorkspaceDeleter', () => {
  it('deletes a linked Media Library file with an exact fingerprint precondition', async () => {
    const workspaceRoot = await createWorkspace();
    const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-media-delete-target-'));
    workspaces.push(targetRoot);
    await mkdir(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    await symlink(targetRoot, path.join(workspaceRoot, 'neko', 'assets', 'Books'));
    const targetPath = path.join(targetRoot, 'book.epub');
    await writeFile(targetPath, 'epub');
    const targetStat = await stat(targetPath);
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Books/book.epub',
    };
    const deleter = new NodeAuthorizedWorkspaceDeleter({ workspaceRoot });

    await expect(
      deleter.delete(locator, {
        expectedFingerprint: {
          strategy: 'mtime-size',
          value: `${targetStat.mtimeMs}:${targetStat.size}`,
        },
      }),
    ).resolves.toEqual({ status: 'deleted', locator });
    await expect(readFile(targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves changed content and rejects symlink entries', async () => {
    const workspaceRoot = await createWorkspace();
    const targetRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-media-delete-target-'));
    workspaces.push(targetRoot);
    await mkdir(path.join(workspaceRoot, 'neko', 'assets'), { recursive: true });
    await symlink(targetRoot, path.join(workspaceRoot, 'neko', 'assets', 'Books'));
    const targetPath = path.join(targetRoot, 'book.epub');
    await writeFile(targetPath, 'changed');
    const locator = {
      kind: 'workspace-file' as const,
      path: 'neko/assets/Books/book.epub',
    };
    const deleter = new NodeAuthorizedWorkspaceDeleter({ workspaceRoot });

    await expect(
      deleter.delete(locator, {
        expectedFingerprint: { strategy: 'mtime-size', value: 'stale' },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-changed' },
    });
    expect(await readFile(targetPath, 'utf8')).toBe('changed');

    const externalFile = path.join(targetRoot, 'external.epub');
    await writeFile(externalFile, 'external');
    const linkedFile = path.join(targetRoot, 'alias.epub');
    await symlink(externalFile, linkedFile);
    await expect(
      deleter.delete(
        { kind: 'workspace-file', path: 'neko/assets/Books/alias.epub' },
        { expectedFingerprint: { strategy: 'mtime-size', value: 'irrelevant' } },
      ),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
    expect(await readFile(externalFile, 'utf8')).toBe('external');
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-media-delete-workspace-'));
  workspaces.push(workspaceRoot);
  return workspaceRoot;
}
