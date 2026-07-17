import * as path from 'node:path';
import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveMediaSrcPath } from '../resolveMediaSrcPath';

const mockExistingFiles = vi.hoisted(() => new Set<string>());

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

  it('resolves relative media paths against the JVI directory', async () => {
    await expect(resolveMediaSrcPath('/workspace/project/scenes', 'clips/a.mp4')).resolves.toBe(
      path.resolve('/workspace/project/scenes', 'clips/a.mp4'),
    );
  });

  it('resolves media-library variables through shared host content policy', async () => {
    mockExistingFiles.add('/library/books/a.mp4');
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => ['/library/books']),
        getPathVariables: vi.fn(async () => [['BOOKS', '/library/books']] as const),
      },
      activate: vi.fn(),
    } as unknown as vscode.Extension<unknown>);

    await expect(resolveMediaSrcPath('/workspace/project/scenes', '${BOOKS}/a.mp4')).resolves.toBe(
      '/library/books/a.mp4',
    );
  });

  it('fails visibly when a media-library variable is not provided by shared content policy', async () => {
    await expect(resolveMediaSrcPath('/workspace/project/scenes', '${MISSING}/a.mp4')).rejects.toThrow(
      'Path variable MISSING is not defined.',
    );
  });
});
