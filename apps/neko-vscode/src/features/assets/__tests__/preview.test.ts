import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { getPreviewViewType, openAssetPreview } from '../utils/preview';

const { executeCommand } = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
  commands: {
    executeCommand,
  },
}));

describe('preview routing', () => {
  beforeEach(() => {
    executeCommand.mockReset();
  });

  it('maps EPUB files to the EPUB custom editor', () => {
    expect(getPreviewViewType('/library/books/story.epub')).toBe('neko.epubPreview');
  });

  it('maps document previews through openWith', async () => {
    const uri = vscode.Uri.file('/library/books/story.epub');

    await openAssetPreview(uri);

    expect(executeCommand).toHaveBeenCalledWith('vscode.openWith', uri, 'neko.epubPreview');
  });

  it('falls back to vscode.open when no preview editor exists', async () => {
    const uri = vscode.Uri.file('/library/books/story.txt');

    await openAssetPreview(uri);

    expect(executeCommand).toHaveBeenCalledWith('vscode.open', uri);
  });
});
