import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createCanvasDocumentEntryReader } from './documentEntryReader';

const readEntry = vi.hoisted(() => vi.fn(async () => new Uint8Array([1, 2, 3])));

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' }, name: 'project', index: 0 }],
  },
}));

vi.mock('@neko/content/document/node', () => ({
  createNodeDocumentLowLevelAccess: () => ({ readEntry }),
}));

describe('createCanvasDocumentEntryReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => ['/library/books']),
        getPathVariables: vi.fn(async () => [['BOOKS', '/library/books']] as const),
      },
      activate: vi.fn(),
    } as unknown as vscode.Extension<unknown>);
  });

  it('reads a resolved archive entry in the Extension Host', async () => {
    const reader = createCanvasDocumentEntryReader();

    await expect(
      reader.readEntry({ filePath: '${BOOKS}/comic.epub', format: 'epub' }, 'OPS/page-1.jpg'),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(readEntry).toHaveBeenCalledWith('/library/books/comic.epub', 'OPS/page-1.jpg');
  });
});
