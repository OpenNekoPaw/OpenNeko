import * as os from 'node:os';
import * as path from 'node:path';
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import type * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NekoMediaRepresentationAPI } from '../../../types/extension-api';
import {
  contractHostContentMediaPath,
  loadHostContentPathPolicy,
  resolveHostContentMediaPath,
} from '../content-path-resolver';

describe('content-path-resolver', () => {
  const cleanupDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupDirectories.splice(0).map((directory) =>
        rm(directory, {
          recursive: true,
          force: true,
        }),
      ),
    );
  });

  it('does not load retired media-library roots or variables into content policy', async () => {
    const getExtension = createAssetsExtensionGetter({
      mediaLibraryRoots: ['/library/books'],
      pathVariables: [['BOOKS', '/library/books']],
    });
    const policy = await loadHostContentPathPolicy({
      workspaceRoot: '/workspace/project',
      getExtension,
      fileExists: (filePath) => filePath === '/library/books/comic.epub',
    });

    expect(policy.pathResolver.resolve('${BOOKS}/comic.epub')).toBe('${BOOKS}/comic.epub');
    expect(policy.authorizedReadRoots).toEqual(['/workspace/project']);
    expect(getExtension).not.toHaveBeenCalled();
  });

  it('adds host built-in variables without authorizing the whole user home', async () => {
    const policy = await loadHostContentPathPolicy({
      workspaceRoot: '/workspace/project',
      getExtension: createAssetsExtensionGetter({
        mediaLibraryRoots: [],
        pathVariables: [],
      }),
    });

    expect(policy.pathResolver.resolve('${HOME}/Books/a.epub')).toBe(
      path.join(os.homedir(), 'Books', 'a.epub'),
    );
    expect(policy.pathResolver.resolve('${NEKO_HOME}/cache/a.bin')).toBe(
      path.join(os.homedir(), '.neko', 'cache', 'a.bin'),
    );
    expect(policy.authorizedReadRoots).toEqual(['/workspace/project']);
  });

  it('resolves a linked media file through its ordinary workspace path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'neko-content-path-'));
    cleanupDirectories.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const target = path.join(root, 'target');
    const linkPath = path.join(workspaceRoot, 'neko/assets/Books');
    await Promise.all([mkdir(workspaceRoot), mkdir(target)]);
    await mkdir(path.dirname(linkPath), { recursive: true });
    await writeFile(path.join(target, 'comic.epub'), 'book');
    await symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

    const resolved = await resolveHostContentMediaPath('neko/assets/Books/comic.epub', {
      workspaceRoot,
      fileExists: async (filePath) => {
        try {
          return (await stat(filePath)).isFile();
        } catch {
          return false;
        }
      },
    });

    expect(resolved).toBe(path.join(workspaceRoot, 'neko/assets/Books/comic.epub'));
  });

  it('poisons retired media-library variable resolution', async () => {
    await expect(
      resolveHostContentMediaPath('${BOOKS}/comic.epub', {
        workspaceRoot: '/workspace/project',
        getExtension: createAssetsExtensionGetter({
          mediaLibraryRoots: ['/library/books'],
          pathVariables: [['BOOKS', '/library/books']],
        }),
        fileExists: (filePath) => filePath === '/library/books/comic.epub',
      }),
    ).rejects.toThrow('Path variable BOOKS is not defined.');
  });

  it('reports unknown variables before generic missing-file diagnostics', async () => {
    await expect(
      resolveHostContentMediaPath('${MISSING}/comic.epub', {
        workspaceRoot: '/workspace/project',
        getExtension: createAssetsExtensionGetter({
          mediaLibraryRoots: [],
          pathVariables: [],
        }),
        fileExists: () => false,
      }),
    ).rejects.toThrow('Path variable MISSING is not defined.');
  });

  it('does not contract an absolute target through a retired media-library variable', async () => {
    const contracted = await contractHostContentMediaPath('/library/books/comic.epub', {
      workspaceRoot: '/workspace/project',
      getExtension: createAssetsExtensionGetter({
        mediaLibraryRoots: ['/library/books'],
        pathVariables: [['BOOKS', '/library/books']],
      }),
    });

    expect(contracted).toBeUndefined();
  });

  it('rejects local media paths outside authorized roots', async () => {
    await expect(
      resolveHostContentMediaPath('/outside/comic.epub', {
        workspaceRoot: '/workspace/project',
        getExtension: createAssetsExtensionGetter({
          mediaLibraryRoots: ['/library/books'],
          pathVariables: [['BOOKS', '/library/books']],
        }),
        fileExists: (filePath) => filePath === '/outside/comic.epub',
      }),
    ).rejects.toThrow('outside authorized roots');
  });
});

function createAssetsExtensionGetter(_options: {
  readonly mediaLibraryRoots: readonly string[];
  readonly pathVariables: ReadonlyArray<readonly [string, string]>;
}): <T>(id: string) => vscode.Extension<T> | undefined {
  const api = {
    generateThumbnail: vi.fn(async () => undefined),
  } satisfies NekoMediaRepresentationAPI;
  const extension = {
    isActive: true,
    exports: api,
    activate: vi.fn(async () => api),
  } as unknown as vscode.Extension<NekoMediaRepresentationAPI>;
  return vi.fn(<T>() => extension as unknown as vscode.Extension<T>);
}
