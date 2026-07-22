import * as path from 'node:path';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMediaSrcPath } from '../resolveMediaSrcPath';

const mockExistingFiles = vi.hoisted(() => new Set<string>());
const cleanupDirectories: string[] = [];

vi.mock('node:fs', () => ({
  statSync: vi.fn((filePath: string) => {
    if (!mockExistingFiles.has(filePath)) {
      throw new Error(`ENOENT: ${filePath}`);
    }
    return { isFile: () => true };
  }),
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' }, name: 'project', index: 0 }],
  },
  extensions: {
    getExtension: vi.fn(() => undefined),
  },
}));

describe('resolveMediaSrcPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingFiles.clear();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
  });

  afterEach(async () => {
    await Promise.all(
      cleanupDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('resolves relative media paths against the JVI directory', async () => {
    await expect(resolveMediaSrcPath('/workspace/project/scenes', 'clips/a.mp4')).resolves.toBe(
      path.resolve('/workspace/project/scenes', 'clips/a.mp4'),
    );
  });

  it('resolves workspace-linked media from the workspace root through the shared host path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'neko-tools-linked-media-'));
    cleanupDirectories.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const target = path.join(root, 'target');
    const jviDir = path.join(workspaceRoot, 'scenes');
    const linkPath = path.join(workspaceRoot, 'neko', 'assets', 'Books');
    const linkedFile = path.join(linkPath, 'a.mp4');
    await Promise.all([mkdir(jviDir, { recursive: true }), mkdir(target)]);
    await mkdir(path.dirname(linkPath), { recursive: true });
    await writeFile(path.join(target, 'a.mp4'), 'video');
    await symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    mockExistingFiles.add(linkedFile);
    const workspaceFolders = vscode.workspace.workspaceFolders as unknown as Array<{
      uri: { fsPath: string };
      name: string;
      index: number;
    }>;
    workspaceFolders.push({ uri: { fsPath: workspaceRoot }, name: 'linked', index: 1 });

    try {
      await expect(resolveMediaSrcPath(jviDir, 'neko/assets/Books/a.mp4')).resolves.toBe(
        linkedFile,
      );
      expect(vscode.extensions.getExtension).not.toHaveBeenCalled();
    } finally {
      workspaceFolders.pop();
    }
  });

  it('fails visibly when a media-library variable is not provided by shared content policy', async () => {
    await expect(
      resolveMediaSrcPath('/workspace/project/scenes', '${MISSING}/a.mp4'),
    ).rejects.toThrow('Path variable MISSING is not defined.');
  });
});
