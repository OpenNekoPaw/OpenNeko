import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import type { NekoAssetsAPI } from '../../../types/extension-api';
import {
  contractHostContentMediaPath,
  loadHostContentPathPolicy,
  resolveHostContentMediaPath,
} from '../content-path-resolver';

describe('content-path-resolver', () => {
  it('loads workspace and media-library roots into one content policy', async () => {
    const policy = await loadHostContentPathPolicy({
      workspaceRoot: '/workspace/project',
      getExtension: createAssetsExtensionGetter({
        mediaLibraryRoots: ['/library/books'],
        pathVariables: [['BOOKS', '/library/books']],
      }),
      fileExists: (filePath) => filePath === '/library/books/comic.epub',
    });

    expect(policy.pathResolver.resolve('${BOOKS}/comic.epub')).toBe('/library/books/comic.epub');
    expect(policy.authorizedReadRoots).toEqual(['/workspace/project', '/library/books']);
    expect(policy.mediaLibraryRoots).toEqual(['/library/books']);
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

  it('resolves media-library variable paths through the shared content policy', async () => {
    const resolved = await resolveHostContentMediaPath('${BOOKS}/comic.epub', {
      workspaceRoot: '/workspace/project',
      getExtension: createAssetsExtensionGetter({
        mediaLibraryRoots: ['/library/books'],
        pathVariables: [['BOOKS', '/library/books']],
      }),
      fileExists: (filePath) => filePath === '/library/books/comic.epub',
    });

    expect(resolved).toBe('/library/books/comic.epub');
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

  it('contracts media-library paths through the shared content policy', async () => {
    const contracted = await contractHostContentMediaPath('/library/books/comic.epub', {
      workspaceRoot: '/workspace/project',
      getExtension: createAssetsExtensionGetter({
        mediaLibraryRoots: ['/library/books'],
        pathVariables: [['BOOKS', '/library/books']],
      }),
    });

    expect(contracted).toBe('${BOOKS}/comic.epub');
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

function createAssetsExtensionGetter(options: {
  readonly mediaLibraryRoots: readonly string[];
  readonly pathVariables: ReadonlyArray<readonly [string, string]>;
}): <T>(id: string) => vscode.Extension<T> | undefined {
  const api = {
    getMediaLibraryRoots: vi.fn(async () => [...options.mediaLibraryRoots]),
    getPathVariables: vi.fn(async () => [...options.pathVariables]),
  } as unknown as NekoAssetsAPI;
  const extension = {
    isActive: true,
    exports: api,
    activate: vi.fn(async () => api),
  } as unknown as vscode.Extension<NekoAssetsAPI>;
  return <T>() => extension as unknown as vscode.Extension<T>;
}
